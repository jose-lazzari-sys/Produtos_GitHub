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
  Info
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
  saveStoredItems
} from './utils/storage';
import { QRScanner } from './components/QRScanner';
import { ReceiptSummaryCard } from './components/ReceiptSummaryCard';
import { ReportTable } from './components/ReportTable';
import { XmlPasteModal } from './components/XmlPasteModal';
import { EditItemModal } from './components/EditItemModal';

export default function App() {
  // Navigation: 'scanner' (Screen 1) | 'report' (Screen 2)
  const [activeTab, setActiveTab] = useState<'scanner' | 'report'>('scanner');

  // Persistence State
  const [items, setItems] = useState<NFCeItem[]>([]);
  const [receipts, setReceipts] = useState<NFCeReceipt[]>([]);

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

  // Save parsed receipt into LocalStorage
  const handleSavePendingReceipt = (receipt: NFCeReceipt) => {
    const result = addReceiptAndItems(receipt);
    setItems(result.items);
    setReceipts(result.receipts);
  };

  // Discard pending receipt
  const handleDiscardPendingReceipt = () => {
    setPendingReceipt(null);
  };

  // Update single item
  const handleUpdateItem = (updated: NFCeItem) => {
    const updatedList = updateStoredItem(updated);
    setItems([...updatedList]);
  };

  // Open manual item creation modal
  const handleOpenAddManualItem = () => {
    setIsCreatingManualItem(true);
  };

  // Save new manually created item
  const handleSaveManualItem = (newItem: NFCeItem) => {
    const updatedList = addStoredItem(newItem);
    setItems([...updatedList]);
    setReceipts(getStoredReceipts());
    setIsCreatingManualItem(false);
  };

  // Delete single item
  const handleDeleteItem = (itemId: string, itemObj?: NFCeItem) => {
    // 1. Direct functional update on items state to guarantee immediate UI reaction
    setItems((prevItems) => {
      const targetDesc = (itemObj?.descricao || '').trim().toLowerCase();
      const targetVal = Number(itemObj?.valorTotal || 0);
      const targetNum = itemObj?.num != null ? String(itemObj.num).trim() : null;

      let indexToDelete = prevItems.findIndex((it, idx) => {
        // 1. Match by ID
        if (itemId && it.id && it.id === itemId) return true;
        if (itemObj?.id && it.id && it.id === itemObj.id) return true;

        // 2. Match by properties
        if (itemObj) {
          const sameDesc = (it.descricao || '').trim().toLowerCase() === targetDesc;
          const sameNum = targetNum ? String(it.num ?? idx + 1).trim() === targetNum : false;
          const diffVal = Math.abs(Number(it.valorTotal || 0) - targetVal);
          if (sameDesc && (sameNum || diffVal < 0.05)) return true;
        }
        return false;
      });

      // Fallback by description
      if (indexToDelete === -1 && targetDesc) {
        indexToDelete = prevItems.findIndex(it => (it.descricao || '').trim().toLowerCase() === targetDesc);
      }

      // Fallback by itemId
      if (indexToDelete === -1 && itemId) {
        indexToDelete = prevItems.findIndex(it => it.id === itemId);
      }

      const nextList = [...prevItems];
      if (indexToDelete !== -1) {
        nextList.splice(indexToDelete, 1);
      }

      // Renumber 1, 2, 3...
      const renumbered = nextList.map((item, idx) => ({
        ...item,
        num: idx + 1
      }));

      // Immediately save to LocalStorage
      saveStoredItems(renumbered);
      return renumbered;
    });

    // 2. Also keep receipts in sync in LocalStorage
    deleteStoredItem(itemObj || itemId);
    setReceipts(getStoredReceipts());
  };

  // Update all store names across stored items
  const handleUpdateAllStoreNames = (newName: string) => {
    const result = updateAllStoreNames(newName);
    setItems(result.items);
    setReceipts(result.receipts);
  };

  // Clear all items and receipts
  const handleClearAll = () => {
    clearAllStorage();
    setItems([]);
    setReceipts([]);
    setPendingReceipt(null);
  };

  // Load sample dataset
  const handleLoadSample = () => {
    const sample = generateSampleData();
    const result = addReceiptAndItems(sample.receipt);
    setItems(result.items);
    setReceipts(result.receipts);
  };

  // Restore dataset from Backup JSON file
  const handleRestoreBackup = (restoredItems: NFCeItem[], restoredReceipts: NFCeReceipt[]) => {
    setItems(restoredItems);
    setReceipts(restoredReceipts);
  };

  const handleOpenXmlModal = (url?: string, initialError?: string) => {
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
              className={`py-2 px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
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
              className={`py-2 px-5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
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
          </nav>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2">
            <button
              id="header-xml-paste-btn"
              onClick={() => handleOpenXmlModal()}
              className="py-2 px-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs font-bold hover:bg-amber-100 transition-colors flex items-center gap-1.5"
              title="Colar XML manualmente"
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Screen 1: Leitor de QR */}
        {activeTab === 'scanner' && (
          <div className="space-y-6">
            {/* Show Pending Scanned Receipt Card if available */}
            {pendingReceipt ? (
              <div className="space-y-4">
                <ReceiptSummaryCard
                  receipt={pendingReceipt}
                  onSaveToHistory={handleSavePendingReceipt}
                  onDiscard={handleDiscardPendingReceipt}
                  onGoToReport={() => setActiveTab('report')}
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
                  Regras de Classificação Automática
                </p>
                <p className="leading-relaxed">
                  Os itens da sua nota fiscal são divididos automaticamente em <strong>Tipo</strong> (Alimentação, Higiene Pessoal, Limpeza Doméstica), <strong>Produto</strong> (açougue, bebidas, laticínios, padaria...) e <strong>Detalhes</strong>. Todos os dados ficam salvos localmente e podem ser copiados para o Google Sheets em 9 colunas.
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
            onRestoreBackup={handleRestoreBackup}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Large touch targets for smartphones) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center justify-around shadow-2xl">
        <button
          id="mobile-nav-scanner"
          onClick={() => setActiveTab('scanner')}
          className={`flex-1 py-2.5 px-3 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === 'scanner'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 font-medium'
          }`}
        >
          <QrCode className="w-5 h-5" />
          <span className="text-xs">1. Leitor QR</span>
        </button>

        <button
          id="mobile-nav-report"
          onClick={() => setActiveTab('report')}
          className={`flex-1 py-2.5 px-3 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all relative ${
            activeTab === 'report'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 font-medium'
          }`}
        >
          <div className="relative">
            <TableIcon className="w-5 h-5" />
            {items.length > 0 && (
              <span className="absolute -top-1.5 -right-3 px-1.5 py-0.2 text-[10px] font-black rounded-full bg-emerald-600 text-white">
                {items.length}
              </span>
            )}
          </div>
          <span className="text-xs">2. Relatório ({items.length})</span>
        </button>
      </div>

      {/* Manual XML Paste Modal (Captcha Solution) */}
      <XmlPasteModal
        isOpen={isXmlModalOpen}
        onClose={() => setIsXmlModalOpen(false)}
        onReceiptParsed={handleReceiptParsed}
        currentUrl={xmlModalUrl}
        initialError={xmlModalError}
      />

      {/* Edit Item and Classification Modal */}
      <EditItemModal
        item={editingItem}
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleUpdateItem}
        onDelete={handleDeleteItem}
      />

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
    </div>
  );
}
