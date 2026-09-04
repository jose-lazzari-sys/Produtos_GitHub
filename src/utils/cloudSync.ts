import { 
  db, 
  auth, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  deleteDoc,
  collection,
  onSnapshot, 
  writeBatch,
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

// 200 items per chunk (~80-100KB per doc) ensures each document is well under Firestore's 1MB limit
const ITEMS_PER_CHUNK = 200;

let syncListenerUnsubscribe: (() => void) | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncedDataHash = '';
let isQuotaExceededFlag = false;
let lastKnownChunkCount = (() => {
  try {
    return parseInt(localStorage.getItem('app_last_cloud_chunk_count') || '0', 10) || 0;
  } catch {
    return 0;
  }
})();

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
  let hash = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const s = `${it.id || ''}:${it.tipo || ''}:${it.produto || ''}:${it.detalhe || ''}:${it.valorTotal || 0}:${it.data || ''}`;
    for (let j = 0; j < s.length; j++) {
      hash = ((hash << 5) - hash + s.charCodeAt(j)) | 0;
    }
  }
  const receiptsStr = receipts
    .map(r => `${r.id}:${r.conferido === 'Sim' ? 'S' : '-'}:${r.conferidoUpdatedAt || 0}:${(r.valorTotal || 0).toFixed(2)}:${r.data || ''}`)
    .join('|');
  for (let j = 0; j < receiptsStr.length; j++) {
    hash = ((hash << 5) - hash + receiptsStr.charCodeAt(j)) | 0;
  }
  return `${items.length}__${receipts.length}__${hash}`;
}

/**
 * Merges local and cloud receipts safely, preserving conferido statuses and timestamps
 */
export function mergeReceiptsWithCloud(localReceipts: NFCeReceipt[], cloudReceipts: NFCeReceipt[]): NFCeReceipt[] {
  const map = new Map<string, NFCeReceipt>();

  // 1. Index cloud receipts
  for (const cr of cloudReceipts) {
    const key = cr.id || `${cr.data}___${cr.razaoSocial}`;
    map.set(key, { ...cr });
  }

  // 2. Merge local receipts, ensuring conferido is never prematurely lost
  for (const lr of localReceipts) {
    const key = lr.id || `${lr.data}___${lr.razaoSocial}`;
    const existing = map.get(key);
    if (existing) {
      let finalConferido: 'Sim' | '-' = lr.conferido === 'Sim' ? 'Sim' : '-';
      const lrTs = lr.conferidoUpdatedAt || 0;
      const crTs = existing.conferidoUpdatedAt || 0;

      if (lrTs > 0 && crTs > 0) {
        finalConferido = lrTs >= crTs 
          ? (lr.conferido === 'Sim' ? 'Sim' : '-') 
          : (existing.conferido === 'Sim' ? 'Sim' : '-');
      } else if (lr.conferido === 'Sim' || existing.conferido === 'Sim') {
        finalConferido = 'Sim';
      }

      map.set(key, {
        ...existing,
        ...lr,
        conferido: finalConferido,
        conferidoUpdatedAt: Math.max(lrTs, crTs)
      });
    } else {
      map.set(key, lr);
    }
  }

  return Array.from(map.values());
}

/**
 * Merges local and cloud items safely, retaining receiptId linkages
 */
export function mergeItemsWithCloud(localItems: NFCeItem[], cloudItems: NFCeItem[]): NFCeItem[] {
  const itemMap = new Map<string, NFCeItem>();
  for (const ci of cloudItems) {
    itemMap.set(ci.id, ci);
  }
  for (const li of localItems) {
    const existing = itemMap.get(li.id);
    if (existing) {
      itemMap.set(li.id, {
        ...existing,
        ...li,
        receiptId: li.receiptId || existing.receiptId
      });
    } else {
      itemMap.set(li.id, li);
    }
  }
  return Array.from(itemMap.values());
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
 * Saves both items and receipts to Firestore using chunked subcollection storage.
 * Chunks items in batches of 200 items per document (~90KB each) to strictly prevent
 * exceeding Firestore's 1MB (1,048,576 bytes) document size limit.
 * Overwrites the root document's items array to [] so the root doc remains tiny (~20KB).
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

    // Partition items into chunks of 200 items each
    const chunks: NFCeItem[][] = [];
    for (let i = 0; i < cleanItems.length; i += ITEMS_PER_CHUNK) {
      chunks.push(cleanItems.slice(i, i + ITEMS_PER_CHUNK));
    }

    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();

    // 1. Write chunk documents to subcollection /users/{userId}/itemChunks/chunk_{i}
    for (let i = 0; i < chunks.length; i++) {
      const chunkRef = doc(db, 'users', userId, 'itemChunks', `chunk_${i}`);
      batch.set(chunkRef, {
        userId,
        chunkIndex: i,
        totalChunks: chunks.length,
        items: chunks[i],
        itemsCount: chunks[i].length,
        updatedAt: nowIso
      });
    }

    // 2. Delete any higher-indexed chunks from previous syncs if items were deleted
    if (lastKnownChunkCount > chunks.length) {
      for (let i = chunks.length; i < lastKnownChunkCount; i++) {
        const staleChunkRef = doc(db, 'users', userId, 'itemChunks', `chunk_${i}`);
        batch.delete(staleChunkRef);
      }
    }

    // 3. Update root user doc with summary metadata and receipts
    // Setting items to [] replaces and eliminates the old 1.2MB array from the root document!
    const userDocRef = doc(db, 'users', userId);
    batch.set(userDocRef, {
      items: [],
      itemsCount: items.length,
      receiptsCount: receipts.length,
      receipts: cleanReceipts,
      chunkCount: chunks.length,
      updatedAt: nowIso,
      userEmail: userEmail || ''
    }, { merge: true });

    await batch.commit();

    lastKnownChunkCount = chunks.length;
    try {
      localStorage.setItem('app_last_cloud_chunk_count', String(chunks.length));
    } catch {}

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
 * Loads data from Firestore once for the user, reading from chunk documents when available.
 */
export async function loadDataFromCloud(userId: string): Promise<{ items: NFCeItem[]; receipts: NFCeReceipt[] } | null> {
  if (isQuotaExceededFlag) return null;

  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      return null;
    }

    const data = snap.data();
    const receipts: NFCeReceipt[] = Array.isArray(data?.receipts) ? data.receipts : [];
    const chunkCount = typeof data?.chunkCount === 'number' ? data.chunkCount : 0;

    if (chunkCount > lastKnownChunkCount) {
      lastKnownChunkCount = chunkCount;
      try {
        localStorage.setItem('app_last_cloud_chunk_count', String(chunkCount));
      } catch {}
    }

    let items: NFCeItem[] = [];

    if (chunkCount > 0) {
      // Concurrently fetch all chunk documents
      const chunkPromises = [];
      for (let i = 0; i < chunkCount; i++) {
        chunkPromises.push(getDoc(doc(db, 'users', userId, 'itemChunks', `chunk_${i}`)));
      }
      const chunkSnaps = await Promise.all(chunkPromises);
      for (const cSnap of chunkSnaps) {
        if (cSnap.exists()) {
          const cData = cSnap.data();
          if (Array.isArray(cData?.items)) {
            items.push(...cData.items);
          }
        }
      }
    } else if (Array.isArray(data?.items) && data.items.length > 0) {
      // Legacy unchunked fallback
      items = data.items;
    }

    return { items, receipts };
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
 * Starts real-time listener for user's shopping data in Firestore with chunk support and graceful quota handling.
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
    async (docSnap) => {
      const localItems = getStoredItems();
      const localReceipts = getStoredReceipts();

      if (docSnap.exists()) {
        const data = docSnap.data();
        const cloudReceipts: NFCeReceipt[] = Array.isArray(data?.receipts) ? data.receipts : [];
        const chunkCount = typeof data?.chunkCount === 'number' ? data.chunkCount : 0;

        if (chunkCount > lastKnownChunkCount) {
          lastKnownChunkCount = chunkCount;
          try {
            localStorage.setItem('app_last_cloud_chunk_count', String(chunkCount));
          } catch {}
        }

        let cloudItems: NFCeItem[] = [];

        if (chunkCount > 0) {
          const chunkPromises = [];
          for (let i = 0; i < chunkCount; i++) {
            chunkPromises.push(getDoc(doc(db, 'users', userId, 'itemChunks', `chunk_${i}`)));
          }
          try {
            const chunkSnaps = await Promise.all(chunkPromises);
            for (const cSnap of chunkSnaps) {
              if (cSnap.exists()) {
                const cData = cSnap.data();
                if (Array.isArray(cData?.items)) {
                  cloudItems.push(...cData.items);
                }
              }
            }
          } catch (chunkErr) {
            console.warn('Erro ao carregar chunks da nuvem:', chunkErr);
          }
        } else if (Array.isArray(data?.items) && data.items.length > 0) {
          cloudItems = data.items;
        }

        const cloudHash = computeDataHash(cloudItems, cloudReceipts);
        if (cloudHash === lastSyncedDataHash && cloudItems.length > 0) {
          // Change came from our current device session; avoid circular loop
          return;
        }

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
          lastSyncedDataHash = cloudHash;
          onData(getStoredItems(), getStoredReceipts());
          return;
        }

        // Merge cloud and local data seamlessly without losing local 'Sim' or recent status
        if (cloudItems.length > 0 || cloudReceipts.length > 0) {
          const mergedReceipts = mergeReceiptsWithCloud(localReceipts, cloudReceipts);
          const mergedItems = mergeItemsWithCloud(localItems, cloudItems);

          saveStoredItems(mergedItems);
          saveStoredReceipts(mergedReceipts);
          lastSyncedDataHash = computeDataHash(mergedItems, mergedReceipts);
          onData(getStoredItems(), getStoredReceipts());

          // If local had a 'Sim' or updated status that is not in the cloud yet, push it up
          const cloudHasAllConferidos = cloudReceipts.length > 0 && cloudReceipts.every(cr => {
            const match = mergedReceipts.find(mr => mr.id === cr.id || (mr.data === cr.data && mr.razaoSocial === cr.razaoSocial));
            return !match || (match.conferido === cr.conferido);
          });
          if (!cloudHasAllConferidos && !isQuotaExceededFlag) {
            debouncedSyncToCloud(userId, mergedItems, mergedReceipts, auth.currentUser?.email);
          }
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

