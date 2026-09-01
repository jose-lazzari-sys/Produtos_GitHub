import { 
  db, 
  auth, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  googleProvider, 
  signOut,
  User
} from '../lib/firebase';
import { NFCeItem, NFCeReceipt } from '../types';
import { getStoredItems, getStoredReceipts, saveStoredItems, saveStoredReceipts } from './storage';

export interface CloudSyncState {
  user: User | null;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  error: string | null;
  cloudItemsCount: number;
  isQuotaExceeded: boolean;
}

let syncListenerUnsubscribe: (() => void) | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncedDataHash = '';
let isQuotaExceededFlag = false;
const quotaListeners: Set<(exceeded: boolean) => void> = new Set();

export function isCloudQuotaExceeded(): boolean {
  return isQuotaExceededFlag;
}

export function subscribeToQuotaStatus(listener: (exceeded: boolean) => void): () => void {
  quotaListeners.add(listener);
  listener(isQuotaExceededFlag);
  return () => {
    quotaListeners.delete(listener);
  };
}

function setQuotaExceeded(exceeded: boolean) {
  if (isQuotaExceededFlag !== exceeded) {
    isQuotaExceededFlag = exceeded;
    quotaListeners.forEach(fn => fn(exceeded));
  }
}

// Helper to prevent redundant writes if payload hasn't changed
function computeDataHash(items: NFCeItem[], receipts: NFCeReceipt[]): string {
  return `${items.length}_${receipts.length}_${items[0]?.id || ''}_${items[items.length - 1]?.id || ''}_${receipts[0]?.id || ''}`;
}

export async function loginWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: any) {
    console.warn('Popup sign in failed, trying redirect or logging error:', err);
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      try {
        await signInWithRedirect(auth, googleProvider);
        const redirectRes = await getRedirectResult(auth);
        if (redirectRes) return redirectRes.user;
      } catch (redirErr) {
        console.error('Redirect sign in also failed:', redirErr);
        throw redirErr;
      }
    }
    throw err;
  }
}

export async function logoutUser(): Promise<void> {
  if (syncListenerUnsubscribe) {
    syncListenerUnsubscribe();
    syncListenerUnsubscribe = null;
  }
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  await signOut(auth);
}

/**
 * Merge two item lists by item ID or combination of descricao + valor + data,
 * ensuring no items are lost during multi-device sync.
 */
export function mergeItems(listA: NFCeItem[], listB: NFCeItem[]): NFCeItem[] {
  const map = new Map<string, NFCeItem>();

  for (const item of listA) {
    const key = item.id || `${item.descricao}_${item.valorTotal}_${item.data}_${item.num}`;
    map.set(key, item);
  }

  for (const item of listB) {
    const key = item.id || `${item.descricao}_${item.valorTotal}_${item.data}_${item.num}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).map((it, idx) => ({
    ...it,
    num: idx + 1
  }));
}

/**
 * Clean any undefined properties so Firestore doesn't reject the write
 */
function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (key, value) => {
    return value === undefined ? null : value;
  }));
}

/**
 * Saves both items and receipts to the user's private Firestore document.
 * Safely handles quota errors by catching them and relying on LocalStorage.
 */
export async function syncDataToCloud(
  userId: string, 
  items: NFCeItem[], 
  receipts: NFCeReceipt[],
  userEmail?: string | null
): Promise<boolean> {
  if (isQuotaExceededFlag) {
    // Graceful skip when daily free quota is already known to be exhausted
    return false;
  }

  const currentHash = computeDataHash(items, receipts);
  if (currentHash === lastSyncedDataHash) {
    return true; // Avoid unnecessary Firestore write if payload is identical
  }

  try {
    const cleanItems = sanitizeForFirestore(items);
    const cleanReceipts = sanitizeForFirestore(receipts);

    const userDocRef = doc(db, 'users', userId);
    await setDoc(userDocRef, {
      items: cleanItems,
      receipts: cleanReceipts,
      itemsCount: items.length,
      receiptsCount: receipts.length,
      updatedAt: new Date().toISOString(),
      userEmail: userEmail || ''
    }, { merge: true });

    lastSyncedDataHash = currentHash;
    setQuotaExceeded(false);
    return true;
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota') || err?.message?.includes('resource-exhausted')) {
      setQuotaExceeded(true);
      console.warn('⚠️ Limite diário de cota do Firestore atingido. Os dados continuam 100% salvos localmente no seu dispositivo.');
      return false;
    }
    console.error('Erro ao sincronizar dados com o Firestore:', err);
    return false;
  }
}

/**
 * Debounced sync to avoid quota exhaustion on rapid edits/imports
 */
export function debouncedSyncToCloud(
  userId: string,
  items: NFCeItem[],
  receipts: NFCeReceipt[],
  userEmail?: string | null,
  delayMs = 2500
): void {
  if (isQuotaExceededFlag) return;

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    syncDataToCloud(userId, items, receipts, userEmail).catch(() => {});
  }, delayMs);
}

/**
 * Loads data from Firestore once for the user.
 */
export async function loadDataFromCloud(userId: string): Promise<{ items: NFCeItem[]; receipts: NFCeReceipt[] } | null> {
  if (isQuotaExceededFlag) return null;

  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        items: Array.isArray(data?.items) ? data.items : [],
        receipts: Array.isArray(data?.receipts) ? data.receipts : []
      };
    }
    return null;
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
      setQuotaExceeded(true);
      console.warn('⚠️ Cota de leitura/escrita diária excedida no Firestore. Utilizando dados locais.');
      return null;
    }
    console.error('Erro ao carregar dados do Firestore:', err);
    return null;
  }
}

/**
 * Starts real-time listener for user's shopping data in Firestore with graceful quota handling.
 */
export function subscribeToCloudData(
  userId: string,
  onData: (items: NFCeItem[], receipts: NFCeReceipt[]) => void,
  onError?: (err: any) => void
): () => void {
  if (syncListenerUnsubscribe) {
    syncListenerUnsubscribe();
    syncListenerUnsubscribe = null;
  }

  if (isQuotaExceededFlag) {
    return () => {};
  }

  const userDocRef = doc(db, 'users', userId);
  
  syncListenerUnsubscribe = onSnapshot(
    userDocRef,
    (docSnap) => {
      const localItems = getStoredItems();
      const localReceipts = getStoredReceipts();

      if (docSnap.exists()) {
        const data = docSnap.data();
        const cloudItems: NFCeItem[] = Array.isArray(data?.items) ? data.items : [];
        const cloudReceipts: NFCeReceipt[] = Array.isArray(data?.receipts) ? data.receipts : [];
        
        // If cloud is empty but local has items, don't overwrite local data with empty cloud!
        if (cloudItems.length === 0 && localItems.length > 0) {
          if (!isQuotaExceededFlag) {
            debouncedSyncToCloud(userId, localItems, localReceipts, auth.currentUser?.email);
          }
          onData(localItems, localReceipts);
          return;
        }

        // If local is empty but cloud has items, use cloud items
        if (localItems.length === 0 && cloudItems.length > 0) {
          saveStoredItems(cloudItems);
          saveStoredReceipts(cloudReceipts);
          onData(getStoredItems(), getStoredReceipts());
          return;
        }

        // If cloud has newer/more items
        if (cloudItems.length > 0) {
          saveStoredItems(cloudItems);
          saveStoredReceipts(cloudReceipts);
          onData(getStoredItems(), getStoredReceipts());
        }
      }
    },
    (err: any) => {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota') || err?.message?.includes('resource-exhausted')) {
        setQuotaExceeded(true);
        if (syncListenerUnsubscribe) {
          syncListenerUnsubscribe();
          syncListenerUnsubscribe = null;
        }
        console.warn('⚠️ Cota diária gratuita do Firestore atingida. O app continua operando normalmente e com 100% de segurança via LocalStorage.');
      } else {
        console.warn('Firestore subscription notice:', err);
      }
      if (onError) onError(err);
    }
  );

  return () => {
    if (syncListenerUnsubscribe) {
      syncListenerUnsubscribe();
      syncListenerUnsubscribe = null;
    }
  };
}

