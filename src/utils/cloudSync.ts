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
import { 
  getStoredItems, 
  getStoredReceipts, 
  saveStoredItems, 
  saveStoredReceipts,
  getDeletedReceiptTombstones,
  isReceiptTombstoned
} from './storage';

export interface CloudSyncState {
  user: User | null;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  error: string | null;
  cloudItemsCount: number;
  isQuotaExceeded: boolean;
}

// Access Code & Role Management
export type AccessRole = 'admin' | 'readonly';

export interface AccessCodeConfig {
  code: string;
  role: AccessRole;
  label: string;
}

export const ADMIN_CODE = 'jal_completo';
export const CONSULTA_CODE = 'jal_ver';
export const SHARED_SPACE_ID = 'jal_compras';

export function validateAccessCode(rawCode?: string | null): AccessCodeConfig | null {
  if (!rawCode) return null;
  const clean = rawCode.trim().toLowerCase();
  
  // Exigência estrita: digitação exata, sem nenhuma tolerância para variações ou abreviações
  if (clean === ADMIN_CODE) {
    return {
      code: ADMIN_CODE,
      role: 'admin',
      label: 'Administrador (Acesso Total)'
    };
  }
  
  if (clean === CONSULTA_CODE) {
    return {
      code: CONSULTA_CODE,
      role: 'readonly',
      label: 'Consulta (Somente Leitura)'
    };
  }
  
  return null;
}

export function getSavedAccessCode(): string {
  try {
    const saved = localStorage.getItem('app_access_code');
    if (!saved || saved === 'desconectado' || saved === 'offline') {
      return '';
    }
    const clean = saved.trim().toLowerCase();
    // Exigência estrita: sem conexão automática por padrão; somente conecta se houver digitação exata prévia
    if (clean === ADMIN_CODE || clean === CONSULTA_CODE) {
      return clean;
    }
    return '';
  } catch {
    return '';
  }
}

export function saveAccessCode(code: string): void {
  try {
    localStorage.setItem('app_access_code', code.trim().toLowerCase());
  } catch {}
}

export function clearAccessCode(): void {
  try {
    localStorage.setItem('app_access_code', 'desconectado');
  } catch {}
}

// 200 items per chunk (~80-100KB per doc) ensures each document is well under Firestore's 1MB limit
const ITEMS_PER_CHUNK = 200;

let syncListenerUnsubscribe: (() => void) | null = null;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncedDataHash = '';
const QUOTA_STORAGE_KEY = 'app_firestore_quota_exceeded_ts';
// Cooldown duration: daily quota resets once per day (~12-24h). We keep writes paused for 6 hours unless manually reset.
const QUOTA_COOLDOWN_MS = 6 * 60 * 60 * 1000;

let isQuotaExceededFlag = (() => {
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (Date.now() - ts < QUOTA_COOLDOWN_MS) {
        return true;
      }
    }
  } catch {}
  return false;
})();

let lastKnownChunkCount = (() => {
  try {
    return parseInt(localStorage.getItem('app_last_cloud_chunk_count') || '0', 10) || 0;
  } catch {
    return 0;
  }
})();

const quotaListeners: Set<(exceeded: boolean) => void> = new Set();

export function isCloudQuotaExceeded(): boolean {
  if (isQuotaExceededFlag) return true;
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (Date.now() - ts < QUOTA_COOLDOWN_MS) {
        isQuotaExceededFlag = true;
        return true;
      } else {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      }
    }
  } catch {}
  return false;
}

export function subscribeToQuotaStatus(listener: (exceeded: boolean) => void): () => void {
  quotaListeners.add(listener);
  listener(isCloudQuotaExceeded());
  return () => {
    quotaListeners.delete(listener);
  };
}

export function setQuotaExceeded(exceeded: boolean): void {
  isQuotaExceededFlag = exceeded;
  try {
    if (exceeded) {
      localStorage.setItem(QUOTA_STORAGE_KEY, String(Date.now()));
    } else {
      localStorage.removeItem(QUOTA_STORAGE_KEY);
    }
  } catch {}
  quotaListeners.forEach(fn => {
    try { fn(exceeded); } catch {}
  });
}

export function resetQuotaExceededFlag(): void {
  setQuotaExceeded(false);
}

// Helper to prevent redundant writes if payload hasn't changed
function computeDataHash(items: NFCeItem[], receipts: NFCeReceipt[]): string {
  let hash = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const s = `${it.id || ''}:${it.tipo || ''}:${it.produto || ''}:${it.detalhe || ''}:${it.valorTotal || 0}:${it.data || ''}:${it.updatedAt || 0}`;
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
 * Merges local and cloud receipts safely, preserving conferido statuses, eliminating duplicates,
 * and maintaining stable cross-device receipt IDs.
 */
export function mergeReceiptsWithCloud(
  localReceipts: NFCeReceipt[], 
  cloudReceipts: NFCeReceipt[],
  receiptIdMap?: Map<string, string>
): NFCeReceipt[] {
  const tombstones = getDeletedReceiptTombstones();
  const map = new Map<string, NFCeReceipt>();
  const secondaryKeyMap = new Map<string, string>(); // secondaryKey -> primaryKey
  const chaveMap = new Map<string, string>(); // chaveAcesso -> primaryKey

  const getReceiptSecondaryKey = (rc: NFCeReceipt): string => {
    const dt = (rc.data || '').trim();
    const rz = (rc.razaoSocial || '').trim().toLowerCase();
    const val = Number(rc.valorTotal || 0).toFixed(2);
    return `${dt}___${rz}___${val}`;
  };

  const getChaveKey = (rc: NFCeReceipt): string => {
    return rc.chaveAcesso ? rc.chaveAcesso.trim() : '';
  };

  // 1. Index cloud receipts (Strictly skip any tombstoned / deleted receipts)
  for (const cr of cloudReceipts) {
    if (isReceiptTombstoned(cr, tombstones)) {
      continue;
    }
    const primaryKey = cr.id || getReceiptSecondaryKey(cr);
    map.set(primaryKey, { ...cr });

    const secKey = getReceiptSecondaryKey(cr);
    if (secKey) secondaryKeyMap.set(secKey, primaryKey);

    const chKey = getChaveKey(cr);
    if (chKey) chaveMap.set(chKey, primaryKey);
  }

  // 2. Merge local receipts, ensuring conferido is never prematurely lost and duplicates are eliminated
  for (const lr of localReceipts) {
    if (isReceiptTombstoned(lr, tombstones)) {
      continue;
    }
    const primaryKey = lr.id || getReceiptSecondaryKey(lr);
    const secKey = getReceiptSecondaryKey(lr);
    const chKey = getChaveKey(lr);

    let matchedKey: string | undefined = undefined;
    if (map.has(primaryKey)) {
      matchedKey = primaryKey;
    } else if (chKey && chaveMap.has(chKey)) {
      matchedKey = chaveMap.get(chKey);
    } else if (secKey && secondaryKeyMap.has(secKey)) {
      matchedKey = secondaryKeyMap.get(secKey);
    }

    if (matchedKey && map.has(matchedKey)) {
      const existing = map.get(matchedKey)!;
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

      // Record ID mapping if local ID differs from unified ID
      if (receiptIdMap && lr.id && existing.id && lr.id !== existing.id) {
        receiptIdMap.set(lr.id, existing.id);
      }

      map.set(matchedKey, {
        ...existing,
        ...lr,
        id: existing.id || lr.id, // Prefer existing cloud id for stable linkage
        conferido: finalConferido,
        conferidoUpdatedAt: Math.max(lrTs, crTs)
      });
    } else {
      map.set(primaryKey, { ...lr });
      if (secKey) secondaryKeyMap.set(secKey, primaryKey);
      if (chKey) chaveMap.set(chKey, primaryKey);
    }
  }

  return Array.from(map.values());
}

/**
 * Merges local and cloud items safely, retaining classification and receipt linkages.
 * Prioritizes explicitly edited/classified items and newer timestamps.
 */
export function mergeItemsWithCloud(
  localItems: NFCeItem[], 
  cloudItems: NFCeItem[],
  receiptIdMap?: Map<string, string>
): NFCeItem[] {
  const tombstones = getDeletedReceiptTombstones();
  const itemMap = new Map<string, NFCeItem>();
  const secondaryKeyMap = new Map<string, string>(); // secondaryKey -> primaryKey

  const getSecondaryKey = (it: NFCeItem) => {
    const desc = (it.descricao || '').trim().toLowerCase();
    const dt = (it.data || '').trim();
    const val = Number(it.valorTotal || 0).toFixed(2);
    const num = it.num != null ? it.num : '';
    return `${dt}___${desc}___${val}___${num}`;
  };

  // 1. Populate from cloud items (strictly ignore items belonging to tombstoned receipts)
  for (const ci of cloudItems) {
    if (ci.receiptId && tombstones.has(ci.receiptId)) continue;
    const primaryKey = ci.id || getSecondaryKey(ci);
    itemMap.set(primaryKey, { ...ci });
    const secKey = getSecondaryKey(ci);
    if (secKey) secondaryKeyMap.set(secKey, primaryKey);
  }

  // 2. Merge local items safely
  for (const li of localItems) {
    if (li.receiptId && tombstones.has(li.receiptId)) continue;
    const primaryKey = li.id || getSecondaryKey(li);
    const secKey = getSecondaryKey(li);
    const mappedReceiptId = receiptIdMap && li.receiptId && receiptIdMap.has(li.receiptId)
      ? receiptIdMap.get(li.receiptId)
      : li.receiptId;

    let matchedKey: string | undefined = undefined;
    if (itemMap.has(primaryKey)) {
      matchedKey = primaryKey;
    } else if (secKey && secondaryKeyMap.has(secKey)) {
      matchedKey = secondaryKeyMap.get(secKey);
    }

    if (matchedKey && itemMap.has(matchedKey)) {
      const existing = itemMap.get(matchedKey)!;

      const liTs = li.updatedAt || 0;
      const ciTs = existing.updatedAt || 0;

      let winner: NFCeItem;
      if (liTs > 0 && ciTs > 0) {
        winner = liTs >= ciTs ? li : existing;
      } else if (liTs > 0 && !ciTs) {
        winner = li;
      } else if (ciTs > 0 && !liTs) {
        winner = existing;
      } else {
        // Neither has timestamp: check user reclassification
        const liIsClassified = li.tipo && li.tipo !== 'Outros' && li.produto && li.produto !== 'Outros';
        const ciIsClassified = existing.tipo && existing.tipo !== 'Outros' && existing.produto && existing.produto !== 'Outros';

        if (ciIsClassified && !liIsClassified) {
          winner = existing; // Cloud version has been reclassified
        } else if (liIsClassified && !ciIsClassified) {
          winner = li; // Local version has been reclassified
        } else {
          // Cloud is the default shared source of truth across devices
          winner = existing;
        }
      }

      itemMap.set(matchedKey, {
        ...existing,
        ...winner,
        receiptId: existing.receiptId || winner.receiptId || mappedReceiptId
      });
    } else {
      itemMap.set(primaryKey, {
        ...li,
        receiptId: mappedReceiptId
      });
      if (secKey) secondaryKeyMap.set(secKey, primaryKey);
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
  targetId: string, 
  items: NFCeItem[], 
  receipts: NFCeReceipt[],
  userEmail?: string | null,
  isSharedSpace = false
): Promise<boolean> {
  if (isCloudQuotaExceeded()) {
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
    const collectionName = isSharedSpace ? 'spaces' : 'users';

    // 1. Write chunk documents to subcollection /{collectionName}/{targetId}/itemChunks/chunk_{i}
    for (let i = 0; i < chunks.length; i++) {
      const chunkRef = doc(db, collectionName, targetId, 'itemChunks', `chunk_${i}`);
      batch.set(chunkRef, {
        userId: targetId,
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
        const staleChunkRef = doc(db, collectionName, targetId, 'itemChunks', `chunk_${i}`);
        batch.delete(staleChunkRef);
      }
    }

    // 3. Update root doc with summary metadata and receipts
    const rootDocRef = doc(db, collectionName, targetId);
    batch.set(rootDocRef, {
      items: [],
      itemsCount: items.length,
      receiptsCount: receipts.length,
      receipts: cleanReceipts,
      chunkCount: chunks.length,
      updatedAt: nowIso,
      userEmail: userEmail || (isSharedSpace ? 'jal_completo' : '')
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
    const errMsg = String(err?.message || '');
    const errCode = String(err?.code || '');
    if (
      errCode === 'resource-exhausted' ||
      errCode === '8' ||
      errMsg.includes('Quota limit exceeded') ||
      errMsg.includes('RESOURCE_EXHAUSTED') ||
      errMsg.includes('resource-exhausted')
    ) {
      setQuotaExceeded(true);
      console.warn('⚠️ Limite diário de gravações do Firestore atingido. O app está operando em Modo Local Seguro (100% preservado no LocalStorage).');
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
  targetId: string,
  items: NFCeItem[],
  receipts: NFCeReceipt[],
  userEmail?: string | null,
  delayMs = 2500,
  isSharedSpace = false
): void {
  if (isCloudQuotaExceeded()) return;

  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
  }

  syncDebounceTimer = setTimeout(() => {
    syncDataToCloud(targetId, items, receipts, userEmail, isSharedSpace).catch(() => {});
  }, delayMs);
}

/**
 * Loads data from Firestore once, reading from chunk documents when available.
 */
export async function loadDataFromCloud(
  targetId: string,
  isSharedSpace = false
): Promise<{ items: NFCeItem[]; receipts: NFCeReceipt[] } | null> {
  try {
    const collectionName = isSharedSpace ? 'spaces' : 'users';
    const targetDocRef = doc(db, collectionName, targetId);
    const snap = await getDoc(targetDocRef);
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
        chunkPromises.push(getDoc(doc(db, collectionName, targetId, 'itemChunks', `chunk_${i}`)));
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
    const errMsg = String(err?.message || '');
    const errCode = String(err?.code || '');
    if (
      errCode === 'resource-exhausted' ||
      errCode === '8' ||
      errMsg.includes('Quota limit exceeded') ||
      errMsg.includes('RESOURCE_EXHAUSTED') ||
      errMsg.includes('resource-exhausted')
    ) {
      setQuotaExceeded(true);
      console.warn('⚠️ Cota diária gratuita do Firestore atingida no momento. Utilizando dados locais.');
      return null;
    }
    console.error('Erro ao carregar dados do Firestore:', err);
    return null;
  }
}

/**
 * Starts real-time listener for shopping data in Firestore with chunk support and graceful quota handling.
 */
export function subscribeToCloudData(
  targetId: string,
  onData: (items: NFCeItem[], receipts: NFCeReceipt[]) => void,
  onError?: (err: any) => void,
  isSharedSpace = false,
  isReadOnly = false
): () => void {
  if (syncListenerUnsubscribe) {
    syncListenerUnsubscribe();
    syncListenerUnsubscribe = null;
  }

  const collectionName = isSharedSpace ? 'spaces' : 'users';
  const targetDocRef = doc(db, collectionName, targetId);
  
  syncListenerUnsubscribe = onSnapshot(
    targetDocRef,
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
            chunkPromises.push(getDoc(doc(db, collectionName, targetId, 'itemChunks', `chunk_${i}`)));
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

        // If cloud has no items but local has items:
        if (cloudItems.length === 0 && localItems.length > 0) {
          onData(localItems, localReceipts);
          return;
        }

        // If local is empty or we are in readonly mode, accept cloud items unconditionally
        if (localItems.length === 0 || isReadOnly) {
          if (cloudItems.length > 0 || cloudReceipts.length > 0) {
            saveStoredItems(cloudItems);
            saveStoredReceipts(cloudReceipts);
            lastSyncedDataHash = cloudHash;
            onData(getStoredItems(), getStoredReceipts());
          }
          return;
        }

        // Merge cloud and local data seamlessly without losing local 'Sim' or recent status
        if (cloudItems.length > 0 || cloudReceipts.length > 0) {
          const receiptIdMap = new Map<string, string>();
          const mergedReceipts = mergeReceiptsWithCloud(localReceipts, cloudReceipts, receiptIdMap);
          const mergedItems = mergeItemsWithCloud(localItems, cloudItems, receiptIdMap);

          saveStoredItems(mergedItems);
          saveStoredReceipts(mergedReceipts);
          lastSyncedDataHash = computeDataHash(mergedItems, mergedReceipts);
          onData(getStoredItems(), getStoredReceipts());
        }
      } else {
        // Document does not exist in Firestore yet.
        onData(localItems, localReceipts);
      }
    },
    (err: any) => {
      const errMsg = String(err?.message || '');
      const errCode = String(err?.code || '');
      if (
        errCode === 'resource-exhausted' ||
        errCode === '8' ||
        errMsg.includes('Quota limit exceeded') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('resource-exhausted')
      ) {
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

// Dedicated helpers for shared space
export async function syncSharedSpace(
  items: NFCeItem[],
  receipts: NFCeReceipt[]
): Promise<boolean> {
  return syncDataToCloud(SHARED_SPACE_ID, items, receipts, 'jal_completo', true);
}

export function debouncedSyncSharedSpace(
  items: NFCeItem[],
  receipts: NFCeReceipt[],
  delayMs = 2500
): void {
  debouncedSyncToCloud(SHARED_SPACE_ID, items, receipts, 'jal_completo', delayMs, true);
}

export async function loadSharedSpace(): Promise<{ items: NFCeItem[]; receipts: NFCeReceipt[] } | null> {
  return loadDataFromCloud(SHARED_SPACE_ID, true);
}

export function subscribeToSharedSpace(
  onData: (items: NFCeItem[], receipts: NFCeReceipt[]) => void,
  onError?: (err: any) => void,
  isReadOnly = false
): () => void {
  return subscribeToCloudData(SHARED_SPACE_ID, onData, onError, true, isReadOnly);
}

