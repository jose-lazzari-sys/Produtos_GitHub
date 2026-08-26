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
}

let syncListenerUnsubscribe: (() => void) | null = null;

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
 * This guarantees atomic sync and fast single-document real-time updates.
 */
export async function syncDataToCloud(
  userId: string, 
  items: NFCeItem[], 
  receipts: NFCeReceipt[],
  userEmail?: string | null
): Promise<void> {
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
  } catch (err: any) {
    console.error('Erro ao sincronizar dados com o Firestore:', err);
    throw err;
  }
}

/**
 * Loads data from Firestore once for the user.
 */
export async function loadDataFromCloud(userId: string): Promise<{ items: NFCeItem[]; receipts: NFCeReceipt[] } | null> {
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
    console.error('Erro ao carregar dados do Firestore:', err);
    return null;
  }
}

/**
 * Starts real-time listener for user's shopping data in Firestore.
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
        
        // If cloud is empty but local has items, upload local items
        if (cloudItems.length === 0 && localItems.length > 0) {
          syncDataToCloud(userId, localItems, localReceipts, auth.currentUser?.email).catch(console.error);
          onData(localItems, localReceipts);
          return;
        }

        // If local is empty but cloud has items, use cloud items
        if (localItems.length === 0 && cloudItems.length > 0) {
          saveStoredItems(cloudItems);
          saveStoredReceipts(cloudReceipts);
          onData(cloudItems, cloudReceipts);
          return;
        }

        // Both have items - update local storage and state
        saveStoredItems(cloudItems);
        saveStoredReceipts(cloudReceipts);
        onData(cloudItems, cloudReceipts);
      } else {
        // Document does not exist yet in cloud
        if (localItems.length > 0) {
          syncDataToCloud(userId, localItems, localReceipts, auth.currentUser?.email).catch(console.error);
          onData(localItems, localReceipts);
        }
      }
    },
    (err) => {
      console.warn('Firestore subscription notice:', err);
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
