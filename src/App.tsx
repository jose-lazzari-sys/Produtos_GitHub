import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Table as TableIcon,
  Moon,
  Sun,
  FileCode,
  ShieldCheck,
  CheckCircle,
  Sparkles,
  Info,
  Cloud,
  FileText,
  BarChart3,
  Eye,
  Key
} from 'lucide-react';
import { NFCeItem, NFCeReceipt } from './types';
import {
  getStoredItems,
  getStoredReceipts,
  addReceiptAndItems,
  addStoredItem,
  updateStoredItem,
  updateAllStoreNames,
  deleteStoredItem,
  clearAllStorage,
  generateSampleData,
  saveStoredItems,
  saveStoredReceipts,
  updateReceiptConferido,
  bulkUpdateReceiptsConferido,
  deleteReceiptAndItsItems,
  deleteMultipleReceiptsAndTheirItems,
  reconcileReceiptsWithItems
} from './utils/storage';
import { 
  loginWithGoogle, 
  logoutUser, 
  syncDataToCloud, 
  debouncedSyncToCloud,
  loadDataFromCloud,
  subscribeToCloudData,
  subscribeToQuotaStatus,
  getSavedAccessCode,
  validateAccessCode,
  clearAccessCode,
  loadSharedSpace,
  syncSharedSpace,
  debouncedSyncSharedSpace,
  subscribeToSharedSpace,
  mergeReceiptsWithCloud,
  mergeItemsWithCloud,
  AccessRole
} from './utils/cloudSync';
import { auth, onAuthStateChanged, User } from './lib/firebase';
import { ReceiptSummaryCard } from './components/ReceiptSummaryCard';
import { CloudSyncHeader } from './components/CloudSyncHeader';
import { AccessCodeModal } from './components/AccessCodeModal';

// Lazy-load heavy components to slash initial mobile bundle size from 2.4MB down to lightweight chunks
const QRScanner = React.lazy(() =>
  import('./components/QRScanner').then((m) => ({ default: m.QRScanner }))
);
const ReportTable = React.lazy(() =>
  import('./components/ReportTable').then((m) => ({ default: m.ReportTable }))
);
const NfAppTab = React.lazy(() =>
  import('./components/NfAppTab').then((m) => ({ default: m.NfAppTab }))
);
const AppActionsTab = React.lazy(() =>
  import('./components/AppActionsTab').then((m) => ({ default: m.AppActionsTab }))
);
const XmlPasteModal = React.lazy(() =>
  import('./components/XmlPasteModal').then((m) => ({ default: m.XmlPasteModal }))
);
const EditItemModal = React.lazy(() =>
  import('./components/EditItemModal').then((m) => ({ default: m.EditItemModal }))
);

function TabLoadingFallback() {
  return (
    <div className="w-full min-h-[300px] flex flex-col items-center justify-center p-8 text-slate-500 dark:text-slate-400 gap-3">
      <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold">Carregando visualização...</span>
    </div>
  );
}

export default function App() {
  // Navigation: 'scanner' (Screen 1) | 'report' (Screen 2: Tabela / Relatório & Dashboard) | 'nfApp' (Screen 3) | 'actions' (Screen 4)
  const [activeTab, setActiveTab] = useState<'scanner' | 'report' | 'nfApp' | 'actions'>('scanner');

  // Persistence State
  const [items, setItems] = useState<NFCeItem[]>([]);
  const [receipts, setReceipts] = useState<NFCeReceipt[]>([]);

  // Cloud Sync State
  const [user, setUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [cloudBannerDismissed, setCloudBannerDismissed] = useState(false);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  // Access Code State (Option A: jal_completo / jal_ver)
  const [accessCode, setAccessCode] = useState<string>(() => getSavedAccessCode());
  const [accessRole, setAccessRole] = useState<AccessRole | null>(() => validateAccessCode(getSavedAccessCode())?.role || null);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const isReadOnly = accessRole === 'readonly';

  // Currently scanned receipt awaiting confirmation
  const [pendingReceipt, setPendingReceipt] = useState<NFCeReceipt | null>(null);

  // Modals
  const [isXmlModalOpen, setIsXmlModalOpen] = useState(false);
  const [xmlModalUrl, setXmlModalUrl] = useState<string | undefined>(undefined);
  const [xmlModalError, setXmlModalError] = useState<string | undefined>(undefined);
  const [editingItem, setEditingItem] = useState<NFCeItem | null>(null);
  const [isCreatingManualItem, setIsCreatingManualItem] = useState(false);

  // Dark mode
  const [isDark, setIsDark] = useState(false);

  // Load from LocalStorage on mount
  useEffect(() => {
    const loadedItems = getStoredItems();
    const loadedReceipts = getStoredReceipts();
    setItems(loadedItems);
    setReceipts(loadedReceipts);

    // Auto-detect dark mode preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
    }
  }, []);

  // Shared Space Realtime Sync (for Access Codes jal_completo and jal_ver)
  useEffect(() => {
    if (!accessRole) return;

    setIsSyncing(true);

    // Initial load from shared space
    loadSharedSpace().then((data) => {
      const localItems = getStoredItems();
      const localReceipts = getStoredReceipts();

      if (data && (data.items.length > 0 || data.receipts.length > 0)) {
        // In admin role, safely merge to preserve local 'Sim' statuses marked on this device
        const mergedReceipts = accessRole === 'admin'
          ? mergeReceiptsWithCloud(localReceipts, data.receipts)
          : (data.receipts.length > 0 ? data.receipts : localReceipts);
        const mergedItems = accessRole === 'admin'
          ? mergeItemsWithCloud(localItems, data.items)
          : (data.items.length > 0 ? data.items : localItems);

        setItems(mergedItems);
        setReceipts(mergedReceipts);
        saveStoredItems(mergedItems);
        saveStoredReceipts(mergedReceipts);

        // If this device had conferido === 'Sim' that was missing in the cloud, push merged back to cloud!
        if (accessRole === 'admin') {
          const hasUnsyncedConferido = mergedReceipts.some(mr => {
            const cr = data.receipts.find(r => r.id === mr.id || (r.data === mr.data && r.razaoSocial === mr.razaoSocial));
            return mr.conferido === 'Sim' && (!cr || cr.conferido !== 'Sim');
          });
          if (hasUnsyncedConferido) {
            syncSharedSpace(mergedItems, mergedReceipts);
          }
        }
      } else if (accessRole === 'admin' && (localItems.length > 0 || localReceipts.length > 0)) {
        // Shared space is empty, initialize it with this admin device's local data
        syncSharedSpace(localItems, localReceipts);
      }
      setIsSyncing(false);
      setLastSyncedAt(new Date());
    }).catch((err) => {
      console.warn('Initial shared space load error:', err);
      setIsSyncing(false);
    });

    // Realtime subscription to shared space
    const unsubscribe = subscribeToSharedSpace(
      (cloudItems, cloudReceipts) => {
        if (cloudItems && cloudItems.length > 0) {
          setItems(cloudItems);
          saveStoredItems(cloudItems);
        }
        if (cloudReceipts && cloudReceipts.length > 0) {
          setReceipts(cloudReceipts);
          saveStoredReceipts(cloudReceipts);
        }
        setIsSyncing(false);
        setLastSyncedAt(new Date());
      },
      (err) => {
        console.warn('Shared space subscription error:', err);
        setIsSyncing(false);
      },
      isReadOnly
    );

    return () => {
      unsubscribe();
    };
  }, [accessRole]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsSyncing(true);

        // If this device has local items, ensure they are uploaded to the cloud immediately
        const initialLocalItems = getStoredItems();
        const initialLocalReceipts = getStoredReceipts();
        if (initialLocalItems.length > 0) {
          syncDataToCloud(currentUser.uid, initialLocalItems, initialLocalReceipts, currentUser.email)
            .then(() => setLastSyncedAt(new Date()))
            .catch(console.error);
        }

        // Subscribe to real-time updates from Firestore
        const unsubscribeSnapshot = subscribeToCloudData(
          currentUser.uid,
          (cloudItems, cloudReceipts) => {
            if (cloudItems && cloudItems.length > 0) {
              setItems(cloudItems);
            }
            if (cloudReceipts && cloudReceipts.length > 0) {
              setReceipts(cloudReceipts);
            }
            setIsSyncing(false);
            setLastSyncedAt(new Date());
          },
          (err) => {
            console.warn('Snapshot error:', err);
            setIsSyncing(false);
          }
        );

        return () => {
          unsubscribeSnapshot();
        };
      } else {
        setIsSyncing(false);
      }
    });

    const unsubscribeQuota = subscribeToQuotaStatus((exceeded) => {
      setIsQuotaExceeded(exceeded);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeQuota();
    };
  }, []);

  // Helper to sync to Cloud whenever state changes if user is logged in or admin code is active
  const syncChangesToCloud = (newItems: NFCeItem[], newReceipts: NFCeReceipt[]) => {
    if (isReadOnly) return; // Strict safety: no changes pushed in read-only mode

    if (user) {
      debouncedSyncToCloud(user.uid, newItems, newReceipts, user.email);
    }
    if (accessRole === 'admin') {
      debouncedSyncSharedSpace(newItems, newReceipts);
    }
    setLastSyncedAt(new Date());
  };

  // Login handler
  const handleLogin = async () => {
    try {
      setIsSyncing(true);
      const loggedUser = await loginWithGoogle();
      setUser(loggedUser);
      // If local storage has items, sync them to cloud
      const currentItems = getStoredItems();
      const currentReceipts = getStoredReceipts();
      if (currentItems.length > 0) {
        await syncDataToCloud(loggedUser.uid, currentItems, currentReceipts, loggedUser.email);
      }
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
  };

  // Force upload current local items to Firestore
  const handleForceUpload = async () => {
    if (isReadOnly) return;
    if (accessRole === 'admin') {
      setIsSyncing(true);
      try {
        const currentItems = getStoredItems();
        const currentReceipts = getStoredReceipts();
        await syncSharedSpace(currentItems, currentReceipts);
        setLastSyncedAt(new Date());
      } catch (e) {
        console.error('Erro ao subir dados para o espaço compartilhado:', e);
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    if (!user) {
      await handleLogin();
      return;
    }
    const currentItems = getStoredItems();
    const currentReceipts = getStoredReceipts();
    await syncChangesToCloud(currentItems, currentReceipts);
  };

  // Force download cloud items to current device
  const handleForceDownload = async () => {
    setIsSyncing(true);
    try {
      if (accessRole) {
        const cloudData = await loadSharedSpace();
        if (cloudData) {
          if (cloudData.items.length > 0) {
            saveStoredItems(cloudData.items);
            setItems(cloudData.items);
          }
          if (cloudData.receipts.length > 0) {
            saveStoredReceipts(cloudData.receipts);
            setReceipts(cloudData.receipts);
          }
          setLastSyncedAt(new Date());
        }
        return;
      }

      if (!user) {
        await handleLogin();
        return;
      }
      const cloudData = await loadDataFromCloud(user.uid);
      if (cloudData) {
        if (cloudData.items.length > 0) {
          saveStoredItems(cloudData.items);
          setItems(cloudData.items);
        }
        if (cloudData.receipts.length > 0) {
          saveStoredReceipts(cloudData.receipts);
          setReceipts(cloudData.receipts);
        }
        setLastSyncedAt(new Date());
      }
    } catch (e) {
      console.error('Erro ao baixar dados da nuvem:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Manual sync button
  const handleManualSync = async () => {
    if (accessRole) {
      setIsSyncing(true);
      try {
        if (isReadOnly) {
          const cloudData = await loadSharedSpace();
          if (cloudData) {
            if (cloudData.items.length > 0) {
              saveStoredItems(cloudData.items);
              setItems(cloudData.items);
            }
            if (cloudData.receipts.length > 0) {
              saveStoredReceipts(cloudData.receipts);
              setReceipts(cloudData.receipts);
            }
            setLastSyncedAt(new Date());
          }
        } else if (accessRole === 'admin') {
          const currentItems = getStoredItems();
          const currentReceipts = getStoredReceipts();
          await syncSharedSpace(currentItems, currentReceipts);
          setLastSyncedAt(new Date());
        }
      } catch (err) {
        console.error('Manual sync error:', err);
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    if (!user) {
      handleLogin();
      return;
    }
    const currentItems = getStoredItems();
    const currentReceipts = getStoredReceipts();
    await syncChangesToCloud(currentItems, currentReceipts);
  };

  // Sync dark mode class on <html>
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Handle new receipt parsed (from camera, file or XML paste)
  const handleReceiptParsed = (receipt: NFCeReceipt) => {
    setPendingReceipt(receipt);
    setActiveTab('scanner'); // Stay on scanner to review receipt card
  };

  // Save parsed receipt into LocalStorage & Cloud
  const handleSavePendingReceipt = (receipt: NFCeReceipt) => {
    if (isReadOnly) {
      alert('Operação bloqueada em Modo Consulta (jal_ver). Para salvar novas notas fiscais, utilize o Código Administrador.');
      return;
    }
    const result = addReceiptAndItems(receipt);
    setItems(result.items);
    setReceipts(result.receipts);
    syncChangesToCloud(result.items, result.receipts);
  };

  // Discard pending receipt
  const handleDiscardPendingReceipt = () => {
    setPendingReceipt(null);
  };

  // Update single item
  const handleUpdateItem = (updated: NFCeItem) => {
    if (isReadOnly) {
      alert('Operação bloqueada em Modo Consulta (jal_ver). Apenas visualização permitida.');
      return;
    }
    const updatedList = updateStoredItem(updated);
    const updatedReceipts = getStoredReceipts();
    setItems([...updatedList]);
    setReceipts([...updatedReceipts]);
    syncChangesToCloud(updatedList, updatedReceipts);
  };

  // Open manual item creation modal
  const handleOpenAddManualItem = () => {
    if (isReadOnly) {
      alert('Operação bloqueada em Modo Consulta (jal_ver).');
      return;
    }
    setIsCreatingManualItem(true);
  };

  // Save new manually created item
  const handleSaveManualItem = (newItem: NFCeItem) => {
    if (isReadOnly) return;
    const updatedList = addStoredItem(newItem);
    const updatedReceipts = getStoredReceipts();
    setItems([...updatedList]);
    setReceipts(updatedReceipts);
    setIsCreatingManualItem(false);
    syncChangesToCloud(updatedList, updatedReceipts);
  };

  // Delete single item
  const handleDeleteItem = (itemId: string, itemObj?: NFCeItem) => {
    if (isReadOnly) {
      alert('Operação bloqueada em Modo Consulta (jal_ver).');
      return;
    }
    setItems((prevItems) => {
      const targetDesc = (itemObj?.descricao || '').trim().toLowerCase();
      const targetVal = Number(itemObj?.valorTotal || 0);
      const targetNum = itemObj?.num != null ? String(itemObj.num).trim() : null;

      let indexToDelete = prevItems.findIndex((it, idx) => {
        if (itemId && it.id && it.id === itemId) return true;
        if (itemObj?.id && it.id && it.id === itemObj.id) return true;
        if (itemObj) {
          const sameDesc = (it.descricao || '').trim().toLowerCase() === targetDesc;
          const sameNum = targetNum ? String(it.num ?? idx + 1).trim() === targetNum : false;
          const diffVal = Math.abs(Number(it.valorTotal || 0) - targetVal);
          if (sameDesc && (sameNum || diffVal < 0.05)) return true;
        }
        return false;
      });

      if (indexToDelete === -1 && targetDesc) {
        indexToDelete = prevItems.findIndex(it => (it.descricao || '').trim().toLowerCase() === targetDesc);
      }

      if (indexToDelete === -1 && itemId) {
        indexToDelete = prevItems.findIndex(it => it.id === itemId);
      }

      const nextList = [...prevItems];
      if (indexToDelete !== -1) {
        nextList.splice(indexToDelete, 1);
      }

      const renumbered = nextList.map((item, idx) => ({
        ...item,
        num: idx + 1
      }));

      saveStoredItems(renumbered);
      deleteStoredItem(itemObj || itemId);
      const currentReceipts = getStoredReceipts();
      setReceipts(currentReceipts);
      syncChangesToCloud(renumbered, currentReceipts);
      return renumbered;
    });
  };

  // Update all store names across stored items
  const handleUpdateAllStoreNames = (newName: string) => {
    if (isReadOnly) return;
    const result = updateAllStoreNames(newName);
    setItems(result.items);
    setReceipts(result.receipts);
    syncChangesToCloud(result.items, result.receipts);
  };

  // Clear all items and receipts
  const handleClearAll = () => {
    if (isReadOnly) return;
    clearAllStorage();
    setItems([]);
    setReceipts([]);
    setPendingReceipt(null);
    syncChangesToCloud([], []);
  };

  // Load sample dataset
  const handleLoadSample = () => {
    if (isReadOnly) return;
    const sample = generateSampleData();
    const result = addReceiptAndItems(sample.receipt);
    setItems(result.items);
    setReceipts(result.receipts);
    syncChangesToCloud(result.items, result.receipts);
  };

  // Restore dataset from Backup JSON file
  const handleRestoreBackup = (restoredItems: NFCeItem[], restoredReceipts: NFCeReceipt[]) => {
    if (isReadOnly) return;
    setItems(restoredItems);
    setReceipts(restoredReceipts);
    syncChangesToCloud(restoredItems, restoredReceipts);
  };

  // Reconciled Receipts ensuring all receipts/notes in app are visible with totals
  const reconciledReceipts = React.useMemo(() => {
    return reconcileReceiptsWithItems(receipts, items);
  }, [receipts, items]);

  // Update receipt conferido status ('Sim' | '-')
  const handleUpdateReceiptConferido = (receiptId: string, conferido: 'Sim' | '-') => {
    if (isReadOnly) return;
    const result = updateReceiptConferido(receiptId, conferido);
    setReceipts(result.receipts);
    setItems(result.items);
    syncChangesToCloud(result.items, result.receipts);
  };

  // Bulk update all receipts conferido status ('Sim' | '-')
  const handleBulkUpdateConferido = (conferido: 'Sim' | '-') => {
    if (isReadOnly) return;
    const result = bulkUpdateReceiptsConferido(conferido);
    setReceipts(result.receipts);
    setItems(result.items);
    syncChangesToCloud(result.items, result.receipts);
  };

  // Delete a receipt and its items
  const handleDeleteReceipt = (receiptId: string) => {
    if (isReadOnly) return;
    const result = deleteReceiptAndItsItems(receiptId);
    setItems(result.items);
    setReceipts(result.receipts);
    syncChangesToCloud(result.items, result.receipts);
  };

  // Delete multiple receipts and their items in bulk
  const handleDeleteMultipleReceipts = (receiptIds: string[]) => {
    if (isReadOnly) return;
    const result = deleteMultipleReceiptsAndTheirItems(receiptIds);
    setItems(result.items);
    setReceipts(result.receipts);
    syncChangesToCloud(result.items, result.receipts);
  };

  const handleOpenXmlModal = (url?: string, initialError?: string) => {
    if (isReadOnly) {
      alert('Operação bloqueada em Modo Consulta (jal_ver).');
      return;
    }
    setXmlModalUrl(url);
    setXmlModalError(initialError);
    setIsXmlModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors">
      {/* Top App Header */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* App Branding */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  NFC-e Sefaz SP
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hidden sm:inline-block">
                  PWA & Classificador
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden xs:block">
                Leitor de QR Code • Classificação de Produtos • Google Sheets
              </p>
            </div>
          </div>

          {/* Desktop/Tablet Tab Selector (Large touch-friendly pills) */}
          <nav className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              id="desktop-tab-scanner"
              onClick={() => setActiveTab('scanner')}
              className={`py-2 px-4 md:px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'scanner'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>1. Leitor QR</span>
            </button>

            <button
              id="desktop-tab-report"
              onClick={() => setActiveTab('report')}
              className={`py-2 px-4 md:px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'report'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TableIcon className="w-4 h-4" />
              <span>2. Tabela / Relatório</span>
              {items.length > 0 && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    activeTab === 'report'
                      ? 'bg-emerald-700 text-emerald-100'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {items.length}
                </span>
              )}
            </button>

            <button
              id="desktop-tab-nfapp"
              onClick={() => setActiveTab('nfApp')}
              className={`py-2 px-4 md:px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'nfApp'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>3. N.F. no APP</span>
              {reconciledReceipts.length > 0 && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    activeTab === 'nfApp'
                      ? 'bg-emerald-700 text-emerald-100'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {reconciledReceipts.length}
                </span>
              )}
            </button>

            <button
              id="desktop-tab-actions"
              onClick={() => setActiveTab('actions')}
              className={`py-2 px-4 md:px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === 'actions'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>4. Ações do App</span>
            </button>
          </nav>

          {/* Header Right Actions & Cloud Sync */}
          <div className="flex items-center gap-2">
            <CloudSyncHeader
              user={user}
              isSyncing={isSyncing}
              lastSyncedAt={lastSyncedAt}
              itemsCount={items.length}
              isQuotaExceeded={isQuotaExceeded}
              onLogin={handleLogin}
              onLogout={handleLogout}
              onManualSync={handleManualSync}
              onForceUpload={handleForceUpload}
              onForceDownload={handleForceDownload}
              accessCode={accessCode}
              accessRole={accessRole}
              onOpenAccessCodeModal={() => setIsAccessModalOpen(true)}
            />

            <button
              id="header-xml-paste-btn"
              onClick={() => handleOpenXmlModal()}
              disabled={isReadOnly}
              className={`py-2 px-3 rounded-xl border text-xs font-bold transition-colors flex items-center gap-1.5 ${
                isReadOnly
                  ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50'
                  : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 hover:bg-amber-100'
              }`}
              title={isReadOnly ? "Desativado em Modo Consulta (jal_ver)" : "Colar XML manualmente"}
            >
              <FileCode className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="hidden md:inline">Colar XML</span>
            </button>

            <button
              id="theme-toggle-btn"
              onClick={() => setIsDark(!isDark)}
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
              title="Alternar tema claro/escuro"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 pb-36 sm:pb-12">
        <React.Suspense fallback={<TabLoadingFallback />}>
          {/* Screen 1: Leitor de QR */}
          {activeTab === 'scanner' && (
            <div className="space-y-6">
              {/* Notice when in Read-Only mode */}
              {isReadOnly && (
                <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 text-xs flex items-center gap-3 shadow-xs">
                  <Eye className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-900 dark:text-white">
                      Modo Consulta Ativo
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      Você tem acesso completo para visualizar relatórios, gráficos, matrizes de compras e exportar planilhas. O salvamento e alteração de novos dados estão desativados neste aparelho.
                    </p>
                  </div>
                </div>
              )}

              {/* Show Pending Scanned Receipt Card if available */}
              {pendingReceipt ? (
                <div className="space-y-4">
                  <ReceiptSummaryCard
                    receipt={pendingReceipt}
                    onSaveToHistory={handleSavePendingReceipt}
                    onDiscard={handleDiscardPendingReceipt}
                    onGoToReport={() => setActiveTab('report')}
                    isReadOnly={isReadOnly}
                  />
                </div>
              ) : null}

              {/* QR Scanner Component */}
              <QRScanner
                onReceiptParsed={handleReceiptParsed}
                onOpenXmlModal={handleOpenXmlModal}
              />

              {/* Quick Helper Banner */}
              <div className="max-w-2xl mx-auto p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">
                    Classificação Automática & Sincronização Segura
                  </p>
                  <p className="leading-relaxed">
                    Os itens da sua nota fiscal são divididos automaticamente em <strong>Tipo</strong> (Alimentação, Higiene Pessoal, Limpeza Doméstica), <strong>Produto</strong> (açougue, bebidas, laticínios, padaria...) e <strong>Detalhes</strong>. Todos os dados sincronizam em tempo real na nuvem entre celular e PC.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Screen 2: Tabela / Relatório */}
          {activeTab === 'report' && (
            <ReportTable
              items={items}
              onUpdateItem={handleUpdateItem}
              onAddManualItem={handleOpenAddManualItem}
              onUpdateAllStoreNames={handleUpdateAllStoreNames}
              onDeleteItem={handleDeleteItem}
              onClearAll={handleClearAll}
              onLoadSample={handleLoadSample}
              onEditClick={(item) => setEditingItem(item)}
              onSwitchToScanner={() => setActiveTab('scanner')}
              onSwitchToActions={() => setActiveTab('actions')}
              onRestoreBackup={handleRestoreBackup}
              isReadOnly={isReadOnly}
            />
          )}

          {/* Screen 3: N.F. no APP */}
          {activeTab === 'nfApp' && (
            <NfAppTab
              receipts={reconciledReceipts}
              items={items}
              onUpdateReceiptConferido={handleUpdateReceiptConferido}
              onBulkUpdateConferido={handleBulkUpdateConferido}
              onDeleteReceipt={handleDeleteReceipt}
              onDeleteMultipleReceipts={handleDeleteMultipleReceipts}
              onViewItemsInReport={() => setActiveTab('report')}
              onSwitchToScanner={() => setActiveTab('scanner')}
              isReadOnly={isReadOnly}
            />
          )}

          {/* Screen 4: Ações do App (Google Sheets, CSV, Backup Offline) */}
          {activeTab === 'actions' && (
            <AppActionsTab
              items={items}
              receipts={reconciledReceipts}
              onRestoreBackup={handleRestoreBackup}
              onGoToReport={() => setActiveTab('report')}
              isReadOnly={isReadOnly}
            />
          )}
        </React.Suspense>
      </main>

      {/* Mobile Bottom Navigation Bar (Large touch targets for smartphones) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-2xl">
        <button
          id="mobile-nav-scanner"
          onClick={() => setActiveTab('scanner')}
          className={`flex-1 py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === 'scanner'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 font-medium'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span className="text-[10px] leading-none">1. Leitor</span>
        </button>

        <button
          id="mobile-nav-report"
          onClick={() => setActiveTab('report')}
          className={`flex-1 py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all relative ${
            activeTab === 'report'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 font-medium'
          }`}
        >
          <div className="relative">
            <TableIcon className="w-4 h-4" />
            {items.length > 0 && (
              <span className="absolute -top-1.5 -right-2.5 px-1 py-0.1 text-[9px] font-black rounded-full bg-emerald-600 text-white">
                {items.length}
              </span>
            )}
          </div>
          <span className="text-[10px] leading-none">2. Relatório</span>
        </button>

        <button
          id="mobile-nav-nfapp"
          onClick={() => setActiveTab('nfApp')}
          className={`flex-1 py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all relative ${
            activeTab === 'nfApp'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 font-medium'
          }`}
        >
          <div className="relative">
            <FileText className="w-4 h-4" />
            {reconciledReceipts.length > 0 && (
              <span className="absolute -top-1.5 -right-2.5 px-1 py-0.1 text-[9px] font-black rounded-full bg-emerald-600 text-white">
                {reconciledReceipts.length}
              </span>
            )}
          </div>
          <span className="text-[10px] leading-none">3. N.F. APP</span>
        </button>

        <button
          id="mobile-nav-actions"
          onClick={() => setActiveTab('actions')}
          className={`flex-1 py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === 'actions'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 font-medium'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[10px] leading-none">4. Ações</span>
        </button>
      </div>

      {/* Modals wrapped in Suspense for zero initial load penalty */}
      <React.Suspense fallback={null}>
        {/* Manual XML Paste Modal (Captcha Solution) */}
        {isXmlModalOpen && (
          <XmlPasteModal
            isOpen={isXmlModalOpen}
            onClose={() => setIsXmlModalOpen(false)}
            onReceiptParsed={handleReceiptParsed}
            currentUrl={xmlModalUrl}
            initialError={xmlModalError}
          />
        )}

        {/* Edit Item and Classification Modal */}
        {editingItem && (
          <EditItemModal
            item={editingItem}
            isOpen={!!editingItem}
            onClose={() => setEditingItem(null)}
            onSave={handleUpdateItem}
            onDelete={handleDeleteItem}
          />
        )}

        {/* Manual Item Creation Modal */}
        {isCreatingManualItem && (
          <EditItemModal
            item={{
              id: '',
              receiptId: '',
              num: items.length + 1,
              descricao: '',
              qtd: 1,
              unidade: 'UN',
              pesoKg: 0,
              precoPorKg: 0,
              valorUnitario: 0,
              valorTotal: 0,
              razaoSocial: items.length > 0 && items[0].razaoSocial ? items[0].razaoSocial : 'SENDAS DISTRIBUIDORA S/A',
              data: items.length > 0 && items[0].data ? items[0].data : new Date().toLocaleDateString('pt-BR'),
              tipo: 'Alimentação',
              produto: 'açougue/peixaria',
              detalhe: 'carne, peixe, linguiça',
            }}
            isOpen={isCreatingManualItem}
            isNew={true}
            onClose={() => setIsCreatingManualItem(false)}
            onSave={handleSaveManualItem}
          />
        )}

        {/* Access Code Modal (Option A: jal_completo / jal_ver) */}
        <AccessCodeModal
          isOpen={isAccessModalOpen}
          onClose={() => setIsAccessModalOpen(false)}
          currentCode={accessCode}
          currentRole={accessRole}
          onCodeApplied={(code, role) => {
            setAccessCode(code);
            setAccessRole(role);
            setIsAccessModalOpen(false);

            // Fetch and sync data immediately
            setIsSyncing(true);
            loadSharedSpace()
              .then((data) => {
                const localItems = getStoredItems();
                const localReceipts = getStoredReceipts();

                if (data && (data.items.length > 0 || data.receipts.length > 0)) {
                  const mergedReceipts = role === 'admin'
                    ? mergeReceiptsWithCloud(localReceipts, data.receipts)
                    : (data.receipts.length > 0 ? data.receipts : localReceipts);
                  const mergedItems = role === 'admin'
                    ? mergeItemsWithCloud(localItems, data.items)
                    : (data.items.length > 0 ? data.items : localItems);

                  setItems(mergedItems);
                  setReceipts(mergedReceipts);
                  saveStoredItems(mergedItems);
                  saveStoredReceipts(mergedReceipts);

                  if (role === 'admin') {
                    syncSharedSpace(mergedItems, mergedReceipts);
                  }
                } else if (role === 'admin' && (localItems.length > 0 || localReceipts.length > 0)) {
                  syncSharedSpace(localItems, localReceipts);
                }
                setIsSyncing(false);
                setLastSyncedAt(new Date());
              })
              .catch((err) => {
                console.warn('Erro ao carregar dados do espaço compartilhado:', err);
                setIsSyncing(false);
              });
          }}
          onCodeCleared={() => {
            setAccessCode('');
            setAccessRole(null);
            setIsAccessModalOpen(false);
          }}
        />
      </React.Suspense>
    </div>
  );
}
