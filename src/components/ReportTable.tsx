import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Table,
  Filter,
  Search,
  Copy,
  Download,
  ExternalLink,
  Trash2,
  Edit2,
  Check,
  Package,
  DollarSign,
  Receipt,
  Sparkles,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Tag,
  AlertCircle,
  Building2,
  Scale,
  X,
  PlusCircle,
  Database,
  Upload,
  FileDown,
  FileUp
} from 'lucide-react';
import { NFCeItem, NFCeReceipt } from '../types';
import { formatBRL } from '../utils/nfceParser';
import { extractPesoKg, calculatePrecoPorKg } from '../utils/weightUtils';
import {
  generateGoogleSheetsTSV,
  generateGoogleSheetsCSV,
  downloadFile,
  copyToClipboard,
  GOOGLE_SHEETS_HEADERS
} from '../utils/exporter';
import { TIPO_OPTIONS, CATEGORY_RULES, getItemTipo } from '../utils/classifier';
import { downloadBackupJSON, importBackupData, importBackupMatrix, parseDateToTimestamp } from '../utils/storage';

interface ReportTableProps {
  items: NFCeItem[];
  onUpdateItem: (item: NFCeItem) => void;
  onAddManualItem?: () => void;
  onUpdateAllStoreNames?: (newName: string) => void;
  onDeleteItem: (id: string, item?: NFCeItem) => void;
  onClearAll: () => void;
  onLoadSample: () => void;
  onEditClick: (item: NFCeItem) => void;
  onSwitchToScanner: () => void;
  onSwitchToActions?: () => void;
  onRestoreBackup?: (items: NFCeItem[], receipts: NFCeReceipt[]) => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({
  items,
  onUpdateItem,
  onAddManualItem,
  onUpdateAllStoreNames,
  onDeleteItem,
  onClearAll,
  onLoadSample,
  onEditClick,
  onSwitchToScanner,
  onSwitchToActions,
  onRestoreBackup,
}) => {
  const [selectedTipo, setSelectedTipo] = useState<string>('Todos');
  const [selectedProduto, setSelectedProduto] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Default sorting: Data from most recent to oldest (mais atual para o mais antigo)
  const [sortField, setSortField] = useState<'num' | 'valorTotal' | 'data' | 'descricao' | 'precoPorKg'>('data');
  const [sortAsc, setSortAsc] = useState(false);

  // Store Name Batch Modal state
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [customStoreName, setCustomStoreName] = useState('SENDAS DISTRIBUIDORA S/A');
  const [itemToDelete, setItemToDelete] = useState<NFCeItem | null>(null);
  const [deletedNotification, setDeletedNotification] = useState<string | null>(null);

  // Search-filtered base items (matches the search bar input "Buscar item, mercado ou data...")
  const searchFilteredBaseItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => {
      const matchDesc = (item.descricao || '').toLowerCase().includes(q);
      const matchRazao = (item.razaoSocial || '').toLowerCase().includes(q);
      const matchData = (item.data || '').toLowerCase().includes(q);
      const matchProd = (item.produto || '').toLowerCase().includes(q);
      const matchDet = (item.detalhe || '').toLowerCase().includes(q);
      return matchDesc || matchRazao || matchData || matchProd || matchDet;
    });
  }, [items, searchQuery]);

  // Items filtered by Search Query AND Tipo filter (basis for the available Produto dropdown)
  const itemsMatchingSearchAndTipo = useMemo(() => {
    return searchFilteredBaseItems.filter((item) => {
      if (selectedTipo !== 'Todos') {
        const itemTipo = getItemTipo(item);
        if (itemTipo !== selectedTipo) {
          return false;
        }
      }
      return true;
    });
  }, [searchFilteredBaseItems, selectedTipo]);

  // Available subcategory produtos present in items that meet active criteria (Tipo and Search Query)
  const availableProdutosWithStats = useMemo(() => {
    const countsMap: Record<string, number> = {};

    itemsMatchingSearchAndTipo.forEach((item) => {
      const prod = item.produto?.trim() || 'Outros';
      countsMap[prod] = (countsMap[prod] || 0) + 1;
    });

    const sortedProds = Object.keys(countsMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return sortedProds.map((prod) => ({
      produto: prod,
      count: countsMap[prod],
    }));
  }, [itemsMatchingSearchAndTipo]);

  // Auto-reset selectedProduto if the current selection is no longer present in the available products
  useEffect(() => {
    if (selectedProduto !== 'Todos') {
      const exists = availableProdutosWithStats.some((p) => p.produto === selectedProduto);
      if (!exists) {
        setSelectedProduto('Todos');
      }
    }
  }, [availableProdutosWithStats, selectedProduto]);

  // Total considered for the buttons (either global or filtered by search query)
  const totalBaseBusca = useMemo(
    () => searchFilteredBaseItems.reduce((sum, it) => sum + (it.valorTotal || 0), 0),
    [searchFilteredBaseItems]
  );

  // Filtered and sorted items (applies tipo, produto and search query)
  const filteredItems = useMemo(() => {
    return searchFilteredBaseItems
      .filter((item) => {
        // Filter by Tipo
        if (selectedTipo !== 'Todos') {
          const itemTipo = getItemTipo(item);
          if (itemTipo !== selectedTipo) {
            return false;
          }
        }
        // Filter by Produto
        if (selectedProduto !== 'Todos') {
          const itemProd = item.produto?.trim() || 'Outros';
          if (itemProd !== selectedProduto) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];
        if (sortField === 'num') {
          valA = a.num || 0;
          valB = b.num || 0;
        } else if (sortField === 'valorTotal') {
          valA = a.valorTotal || 0;
          valB = b.valorTotal || 0;
        } else if (sortField === 'descricao') {
          valA = (a.descricao || '').toLowerCase();
          valB = (b.descricao || '').toLowerCase();
        } else if (sortField === 'data') {
          valA = parseDateToTimestamp(a.data);
          valB = parseDateToTimestamp(b.data);
          if (valA !== valB) {
            return sortAsc ? valA - valB : valB - valA;
          }
          // Tie-breaker when date is identical: sort by item sequence num
          return (a.num || 0) - (b.num || 0);
        } else if (sortField === 'precoPorKg') {
          valA = a.precoPorKg || (a.tipo === 'Alimentação' && a.pesoKg ? calculatePrecoPorKg(a.valorTotal, a.pesoKg, a.qtd, a.tipo, a.unidade) : 0);
          valB = b.precoPorKg || (b.tipo === 'Alimentação' && b.pesoKg ? calculatePrecoPorKg(b.valorTotal, b.pesoKg, b.qtd, b.tipo, b.unidade) : 0);
        }
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return (a.num || 0) - (b.num || 0);
      });
  }, [searchFilteredBaseItems, selectedTipo, selectedProduto, sortField, sortAsc]);

  // Filter State Check
  const isFiltered = useMemo(() => {
    return selectedTipo !== 'Todos' || selectedProduto !== 'Todos' || searchQuery.trim().length > 0;
  }, [selectedTipo, selectedProduto, searchQuery]);

  // Overall & Filtered Statistics
  const totalGeral = useMemo(() => items.reduce((sum, it) => sum + (it.valorTotal || 0), 0), [items]);
  const totalFiltrado = useMemo(() => filteredItems.reduce((sum, it) => sum + (it.valorTotal || 0), 0), [filteredItems]);
  const totalDistinctReceiptsCount = useMemo(() => new Set(items.map((it) => it.receiptId || it.razaoSocial + it.data)).size, [items]);
  const distinctReceiptsCount = useMemo(() => new Set(filteredItems.map((it) => it.receiptId || it.razaoSocial + it.data)).size, [filteredItems]);

  // Alimentação R$/Kg Average (filtered items with valid pesoKg > 0)
  // Fórmula: Somatória do Valor Total dividido pela Somatória do Peso (Kg) dos itens com peso diferente de zero
  const mediaAlimentacaoKg = useMemo(() => {
    const validItems = filteredItems.filter(
      (it) => it.tipo === 'Alimentação' && it.pesoKg && it.pesoKg > 0 && it.valorTotal > 0
    );

    if (validItems.length === 0) {
      return { precoPorKgPonderado: 0, totalPeso: 0, totalValor: 0, count: 0 };
    }

    const totalPeso = validItems.reduce((acc, it) => {
      // Se unidade for UN ou pacote com peso unitário, multiplica pela quantidade se aplicável
      const pesoTotalItem = (it.unidade && (it.unidade.toUpperCase().includes('KG') || it.unidade.toUpperCase().includes('QUILO')))
        ? (it.pesoKg || 0)
        : (it.pesoKg || 0) * (it.qtd && it.qtd > 0 ? it.qtd : 1);
      return acc + pesoTotalItem;
    }, 0);

    const totalValor = validItems.reduce((acc, it) => acc + (it.valorTotal || 0), 0);

    const precoPorKgPonderado = totalPeso > 0 ? totalValor / totalPeso : 0;

    return {
      precoPorKgPonderado,
      totalPeso,
      totalValor,
      count: validItems.length,
    };
  }, [filteredItems]);

  // Category counts and totals (dynamically calculated based on the search query)
  const statsByTipo = useMemo(() => {
    const counts: Record<string, { count: number; total: number }> = {
      'Alimentação': { count: 0, total: 0 },
      'Higiene Pessoal': { count: 0, total: 0 },
      'Limpeza Doméstica': { count: 0, total: 0 },
      'Outros': { count: 0, total: 0 },
    };

    searchFilteredBaseItems.forEach((it) => {
      const t = getItemTipo(it);
      counts[t].count += 1;
      counts[t].total += it.valorTotal || 0;
    });

    return counts;
  }, [searchFilteredBaseItems]);

  // Copy to Google Sheets (TSV format)
  const handleCopyToSheets = async () => {
    const tsv = generateGoogleSheetsTSV(filteredItems);
    const success = await copyToClipboard(tsv);
    if (success) {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 3500);
    }
  };

  // Download CSV
  const handleDownloadCSV = () => {
    const csv = generateGoogleSheetsCSV(filteredItems, ';');
    const filename = `nfce_export_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    try {
      downloadBackupJSON();
      setBackupNotice({
        type: 'success',
        text: `Arquivo de Backup (.json) gerado com sucesso contendo ${items.length} itens salvos!`
      });
      setTimeout(() => setBackupNotice(null), 6000);
    } catch (err: any) {
      setBackupNotice({
        type: 'error',
        text: 'Erro ao gerar arquivo de backup: ' + (err?.message || '')
      });
      setTimeout(() => setBackupNotice(null), 6000);
    }
  };

  // Import Backup (JSON / Excel / CSV)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const allRows: (string | number | null | undefined)[][] = [];
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          if (sheet) {
            const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as (string | number)[][];
            if (sheetRows && sheetRows.length > 0) {
              allRows.push(...sheetRows);
            }
          }
        }
        const result = importBackupMatrix(allRows);
        if (result.success) {
          if (onRestoreBackup) {
            onRestoreBackup(result.items, result.receipts);
          }
          setBackupNotice({
            type: 'success',
            text: `Arquivo Excel carregado com sucesso! ${result.items.length} itens e ${result.receipts.length} recibos carregados no aplicativo.`
          });
          setTimeout(() => setBackupNotice(null), 7000);
        } else {
          setBackupNotice({
            type: 'error',
            text: result.error || 'Erro ao processar o arquivo Excel.'
          });
          setTimeout(() => setBackupNotice(null), 7000);
        }
      } else {
        let content = await file.text();
        if (content.includes('\ufffd')) {
          const reader = new FileReader();
          content = await new Promise((resolve) => {
            reader.onload = (event) => resolve((event.target?.result as string) || '');
            reader.readAsText(file, 'ISO-8859-1');
          });
        }

        const result = importBackupData(content);
        if (result.success) {
          if (onRestoreBackup) {
            onRestoreBackup(result.items, result.receipts);
          }
          setBackupNotice({
            type: 'success',
            text: `Arquivo carregado com sucesso! ${result.items.length} itens e ${result.receipts.length} recibos carregados no aplicativo.`
          });
          setTimeout(() => setBackupNotice(null), 7000);
        } else {
          setBackupNotice({
            type: 'error',
            text: result.error || 'Erro ao processar o arquivo de backup.'
          });
          setTimeout(() => setBackupNotice(null), 7000);
        }
      }
    } catch (err: any) {
      setBackupNotice({
        type: 'error',
        text: 'Erro ao ler o arquivo selecionado: ' + (err?.message || '')
      });
      setTimeout(() => setBackupNotice(null), 6000);
    }

    e.target.value = '';
  };

  const handleSort = (field: 'num' | 'valorTotal' | 'data' | 'descricao' | 'precoPorKg') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'data' ? false : true);
    }
  };

  const renderSortIcon = (field: 'num' | 'valorTotal' | 'data' | 'descricao' | 'precoPorKg') => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-70 transition-opacity" />;
    }
    return sortAsc ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
    );
  };

  return (
    <div id="report-table-screen" className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Top Statistics KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Total Gasto / Total Filtrado */}
        <div className="p-3 sm:p-4 lg:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block truncate">
              {isFiltered ? 'Total Filtrado' : 'Total Acumulado'}
            </span>
            <div className="flex items-baseline gap-1 text-slate-900 dark:text-white font-black leading-tight mt-0.5">
              <span className="text-[11px] sm:text-xs md:text-sm font-bold text-emerald-600 dark:text-emerald-400">
                R$
              </span>
              <span className="text-sm min-[380px]:text-base sm:text-xl lg:text-2xl tracking-tight truncate">
                {totalFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {isFiltered && (
              <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 block font-medium truncate mt-0.5">
                Total geral: {formatBRL(totalGeral)}
              </span>
            )}
          </div>
        </div>

        {/* Alimentação R$/Kg (Média filtrada) */}
        <div className="p-3 sm:p-4 lg:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              {/* Ring / handle on top */}
              <circle
                cx="12"
                cy="4"
                r="2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              {/* Weight body */}
              <path
                d="M7.2 7.5 C7.5 7.2, 7.9 7, 8.4 7 L15.6 7 C16.1 7, 16.5 7.2, 16.8 7.5 L20.4 18.2 C20.8 19.3, 20 20.5, 18.8 20.5 L5.2 20.5 C4 20.5, 3.2 19.3, 3.6 18.2 Z"
                fill="currentColor"
              />
              {/* KG cut-out text */}
              <text
                x="12"
                y="16.5"
                fill="white"
                fontSize="6.2"
                fontWeight="900"
                fontFamily="system-ui, -apple-system, sans-serif"
                textAnchor="middle"
                letterSpacing="-0.2px"
              >
                KG
              </text>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block truncate" title="Média dos itens de Alimentação com peso">
              Alimentação R$/Kg
            </span>
            {mediaAlimentacaoKg.count > 0 ? (
              <div className="flex items-baseline gap-1 text-slate-900 dark:text-white font-black leading-tight mt-0.5">
                <span className="text-[11px] sm:text-xs md:text-sm font-bold text-orange-600 dark:text-orange-400">
                  R$
                </span>
                <span className="text-sm min-[380px]:text-base sm:text-xl lg:text-2xl tracking-tight truncate">
                  {mediaAlimentacaoKg.precoPorKgPonderado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            ) : (
              <span className="text-sm min-[380px]:text-base sm:text-xl lg:text-2xl font-black text-slate-900 dark:text-white block mt-0.5">
                —
              </span>
            )}
            <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 block font-medium truncate mt-0.5">
              {mediaAlimentacaoKg.count > 0
                ? `${mediaAlimentacaoKg.totalPeso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg (${mediaAlimentacaoKg.count} ${mediaAlimentacaoKg.count === 1 ? 'item' : 'itens'})`
                : 'Sem itens com peso'}
            </span>
          </div>
        </div>

        {/* Total Itens */}
        <div className="p-3 sm:p-4 lg:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block truncate">
              {isFiltered ? 'Itens Filtrados' : 'Itens Salvos'}
            </span>
            <div className="flex items-baseline gap-1 font-black text-slate-900 dark:text-white leading-tight mt-0.5">
              <span className="text-sm min-[380px]:text-base sm:text-xl lg:text-2xl tracking-tight">
                {filteredItems.length}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-slate-400">
                itens
              </span>
            </div>
            {isFiltered && (
              <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 block font-medium truncate mt-0.5">
                de {items.length} itens salvos
              </span>
            )}
          </div>
        </div>

        {/* Total Notas Fiscais */}
        <div className="p-3 sm:p-4 lg:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider block truncate">
              Notas Fiscais
            </span>
            <div className="flex items-baseline gap-1 font-black text-slate-900 dark:text-white leading-tight mt-0.5">
              <span className="text-sm min-[380px]:text-base sm:text-xl lg:text-2xl tracking-tight">
                {distinctReceiptsCount}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-slate-400">
                {distinctReceiptsCount === 1 ? 'recibo' : 'recibos'}
              </span>
            </div>
            {isFiltered && (
              <span className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 block font-medium truncate mt-0.5">
                de {totalDistinctReceiptsCount} {totalDistinctReceiptsCount === 1 ? 'recibo total' : 'recibos totais'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Table & Filter Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {/* Action Toolbar with Large Buttons */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-4">
          {/* Header Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Relatório de Itens & Classificação</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'itens'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Itens organizados por tipo e produto com cálculo automático de R$/Kg
              </p>
            </div>

            {/* Quick Actions & Navigation to Tab 3 */}
            <div className="flex flex-wrap items-center gap-2.5">
              {onSwitchToActions && (
                <button
                  id="go-to-actions-tab-btn"
                  type="button"
                  onClick={onSwitchToActions}
                  className="py-2.5 px-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-bold shadow-xs transition-colors flex items-center gap-2 min-h-[42px] cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>3. Ações do App (Exportar / Backup)</span>
                </button>
              )}
            </div>
          </div>

          {/* Backup Notice Alert Banner */}
          {backupNotice && (
            <div
              className={`p-3.5 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200 ${
                backupNotice.type === 'success'
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                  : 'bg-red-100 dark:bg-red-950/80 border border-red-300 dark:border-red-700 text-red-900 dark:text-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {backupNotice.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                )}
                <span>{backupNotice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setBackupNotice(null)}
                className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Filter Tabs by Tipo (Large mobile-friendly tab pills) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" />
                Filtrar por Tipo
              </span>

              {items.length === 0 && (
                <button
                  type="button"
                  onClick={onLoadSample}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Carregar 34 Itens de Exemplo
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {TIPO_OPTIONS.map((tipo) => {
                const isSelected = selectedTipo === tipo;
                const count = tipo === 'Todos' ? searchFilteredBaseItems.length : (statsByTipo[tipo]?.count || 0);
                const total = tipo === 'Todos' ? totalBaseBusca : (statsByTipo[tipo]?.total || 0);

                const percent = totalBaseBusca > 0 ? (total / totalBaseBusca) * 100 : 0;

                return (
                  <button
                    key={tipo}
                    id={`filter-tipo-${tipo.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => {
                      setSelectedTipo(tipo);
                      setSelectedProduto('Todos');
                    }}
                    className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 sm:gap-2 min-h-[40px] touch-manipulation ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{tipo}</span>

                    {/* Percentage pill for specific categories (or 100% for Todos) */}
                    {totalBaseBusca > 0 && total > 0 && (
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-emerald-800/80 text-emerald-100'
                            : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60'
                        }`}
                        title={
                          searchQuery.trim()
                            ? `${percent.toFixed(1)}% do valor encontrado pela busca`
                            : `${percent.toFixed(1)}% do valor total acumulado`
                        }
                      >
                        {percent.toFixed(1).replace('.', ',')}%
                      </span>
                    )}

                    {/* Count badge */}
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected
                          ? 'bg-emerald-700 text-emerald-100'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {count}
                    </span>

                    {/* Total formatted in BRL */}
                    {total > 0 && (
                      <span className={`text-[10px] hidden sm:inline ${isSelected ? 'text-emerald-200' : 'text-slate-400'}`}>
                        ({formatBRL(total)})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-Filters: Search input, Produto filter, and Action buttons */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
            {/* Left/Center Filters: Search + Produto */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="search-items-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar item, mercado ou data..."
                  className="w-full pl-10 pr-9 h-10 text-xs sm:text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden transition-all shadow-xs"
                />
                {searchQuery.trim().length > 0 && (
                  <button
                    type="button"
                    id="clear-search-button"
                    onClick={() => setSearchQuery('')}
                    title="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Subcategory Produto Filter */}
              <div className="w-full sm:w-auto sm:min-w-[210px]">
                <select
                  id="filter-produto-select"
                  value={selectedProduto}
                  onChange={(e) => setSelectedProduto(e.target.value)}
                  className="w-full h-10 px-3 text-xs sm:text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-hidden shadow-xs cursor-pointer"
                >
                  <option value="Todos">
                    Todos os Produtos ({itemsMatchingSearchAndTipo.length} itens)
                  </option>
                  {availableProdutosWithStats.map(({ produto, count }) => (
                    <option key={produto} value={produto}>
                      {produto} ({count})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end shrink-0">
              {onAddManualItem && (
                <button
                  id="insert-manual-item-btn"
                  type="button"
                  onClick={onAddManualItem}
                  className="h-10 px-3.5 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
                  title="Inserir um novo item manualmente com todos os campos de edição"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Inserir Dados Manual</span>
                </button>
              )}

              {onUpdateAllStoreNames && (
                <button
                  id="batch-edit-store-btn"
                  type="button"
                  onClick={() => setIsStoreModalOpen(true)}
                  disabled={items.length === 0}
                  className="h-10 px-3.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
                  title="Alterar Razão Social de todos os itens para SENDAS DISTRIBUIDORA S/A"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Ajustar Razão Social</span>
                </button>
              )}

              {items.length > 0 && (
                <button
                  id="clear-all-items-btn"
                  onClick={() => {
                    if (window.confirm('Deseja realmente limpar todos os itens do LocalStorage?')) {
                      onClearAll();
                    }
                  }}
                  className="h-10 px-3.5 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Tudo</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table View with Sticky Actions Column */}
        <div className="overflow-x-auto relative rounded-b-2xl border-t border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse min-w-[1060px]">
            {/* Headers: 6 Base + 3 Extended + Sticky Ações */}
            <thead>
              <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider select-none">
                <th
                  onClick={() => handleSort('num')}
                  className={`p-3 sm:p-3.5 w-12 text-center cursor-pointer transition-colors ${
                    sortField === 'num'
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>1. Num</span>
                    {renderSortIcon('num')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('descricao')}
                  className={`p-3 sm:p-3.5 min-w-[170px] cursor-pointer transition-colors ${
                    sortField === 'descricao'
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span>2. Descrição</span>
                    {renderSortIcon('descricao')}
                  </div>
                </th>
                <th className="p-3 sm:p-3.5 w-16 text-right">3. Qtd.</th>
                <th
                  onClick={() => handleSort('valorTotal')}
                  className={`p-3 sm:p-3.5 w-24 text-right cursor-pointer transition-colors ${
                    sortField === 'valorTotal'
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>4. Valor(R$)</span>
                    {renderSortIcon('valorTotal')}
                  </div>
                </th>
                <th className="p-3 sm:p-3.5 min-w-[160px]">
                  <div className="flex items-center justify-between gap-1">
                    <span>5. Nome / Razão Social</span>
                    {onUpdateAllStoreNames && (
                      <button
                        onClick={() => setIsStoreModalOpen(true)}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        title="Editar Razão Social de todos os itens"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('data')}
                  className={`p-3 sm:p-3.5 w-28 cursor-pointer transition-colors ${
                    sortField === 'data'
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 font-extrabold'
                      : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Ordenar por data (mais recente / mais antigo)"
                >
                  <div className="flex items-center gap-1">
                    <span>6. Data</span>
                    {renderSortIcon('data')}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('precoPorKg')}
                  className={`p-3 sm:p-3.5 w-24 text-right cursor-pointer transition-colors ${
                    sortField === 'precoPorKg'
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Preço por Quilo (R$/Kg)"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>R$/Kg</span>
                    {renderSortIcon('precoPorKg')}
                  </div>
                </th>
                {/* 3 Additional Classification Columns */}
                <th className="p-3 sm:p-3.5 min-w-[120px] bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-extrabold border-l border-emerald-200 dark:border-emerald-900">
                  7. Tipo
                </th>
                <th className="p-3 sm:p-3.5 min-w-[120px] bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-extrabold">
                  8. Produto
                </th>
                <th className="p-3 sm:p-3.5 min-w-[140px] bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-extrabold">
                  9. Detalhe
                </th>
                {/* Sticky Right Action Header */}
                <th className="p-3 sm:p-3.5 w-24 min-w-[96px] text-center sticky right-0 z-20 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.12)]">
                  Ações
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.length > 0 ? (
                filteredItems.map((item, index) => (
                  <tr
                    key={item.id ? `row_${item.id}_${index}` : `row_${item.num}_${index}`}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    {/* 1. Num */}
                    <td className="p-3 sm:p-3.5 font-bold text-slate-400 dark:text-slate-500 text-center">
                      {item.num ?? index + 1}
                    </td>

                    {/* 2. Descrição */}
                    <td className="p-3 sm:p-3.5 font-semibold text-slate-900 dark:text-white">
                      {item.descricao}
                    </td>

                    {/* 3. Qtd. */}
                    <td className="p-3 sm:p-3.5 text-right text-slate-700 dark:text-slate-300 font-mono">
                      {item.qtd} {item.unidade || ''}
                    </td>

                    {/* 4. Valor(R$) */}
                    <td className="p-3 sm:p-3.5 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      {formatBRL(item.valorTotal)}
                    </td>

                    {/* 5. Nome / Razão Social */}
                    <td className="p-3 sm:p-3.5 text-slate-600 dark:text-slate-300 truncate max-w-[180px]" title={item.razaoSocial}>
                      {item.razaoSocial}
                    </td>

                    {/* 6. Data */}
                    <td className="p-3 sm:p-3.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                      {item.data}
                    </td>

                    {/* R$/Kg (between 6.Data and 7.Tipo) */}
                    <td className="p-3 sm:p-3.5 text-right font-mono text-[11px]">
                      {(() => {
                        const pKg = item.precoPorKg ?? (
                          item.tipo === 'Alimentação' && item.pesoKg && item.pesoKg > 0
                            ? calculatePrecoPorKg(item.valorTotal, item.pesoKg, item.qtd, item.tipo, item.unidade)
                            : 0
                        );
                        return pKg > 0 ? (
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">
                            {formatBRL(pKg)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 font-sans">—</span>
                        );
                      })()}
                    </td>

                    {/* 7. Tipo */}
                    <td className="p-3 sm:p-3.5 bg-emerald-50/30 dark:bg-emerald-950/10 border-l border-emerald-100 dark:border-emerald-900/50">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {item.tipo || 'Outros'}
                      </span>
                    </td>

                    {/* 8. Produto */}
                    <td className="p-3 sm:p-3.5 bg-emerald-50/30 dark:bg-emerald-950/10 font-medium text-slate-800 dark:text-slate-200">
                      {item.produto || 'Outros'}
                    </td>

                    {/* 9. Detalhe */}
                    <td className="p-3 sm:p-3.5 bg-emerald-50/30 dark:bg-emerald-950/10 text-slate-500 dark:text-slate-400 text-[11px]">
                      {item.detalhe || 'Outros'}
                    </td>

                    {/* Sticky Right Action Column */}
                    <td className="p-2 sm:p-3 text-center whitespace-nowrap sticky right-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-l border-slate-100 dark:border-slate-800 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.08)]">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditClick(item);
                          }}
                          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                          title="Editar item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete(item);
                          }}
                          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 border border-slate-200 dark:border-slate-700 hover:border-red-300 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                          title="Excluir item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="p-12 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                        Nenhum item encontrado
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {items.length === 0
                          ? 'Escanear uma nota fiscal da Sefaz SP ou carregue os dados de exemplo para visualizar a tabela de 9 colunas.'
                          : 'Nenhum item corresponde ao filtro ou busca selecionada.'}
                      </p>
                      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                        {items.length === 0 ? (
                          <>
                            <button
                              type="button"
                              onClick={onSwitchToScanner}
                              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs hover:bg-emerald-700 transition-colors"
                            >
                              Ir para Leitor QR Code
                            </button>
                            <button
                              type="button"
                              onClick={onLoadSample}
                              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              Carregar Exemplo (34 itens)
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTipo('Todos');
                              setSelectedProduto('Todos');
                              setSearchQuery('');
                            }}
                            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-slate-300"
                          >
                            Limpar Filtros
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary Row */}
        {filteredItems.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-500 dark:text-slate-400">
              Mostrando <span className="font-bold text-slate-800 dark:text-slate-200">{filteredItems.length}</span> de <span className="font-bold text-slate-800 dark:text-slate-200">{items.length}</span> itens totais
            </div>

            <div className="flex items-center gap-4">
              <span className="text-slate-500">Subtotal Filtrado:</span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                {formatBRL(totalFiltrado)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Guide Banner: How to paste in Google Sheets */}
      <div className="p-5 rounded-3xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Como exportar direto para o Google Sheets em 3 passos:
          </h4>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
            1. Clique em <strong>"Copiar p/ Google Sheets"</strong> acima • 
            2. Clique em <strong>"Abrir Google Planilhas"</strong> • 
            3. Selecione a célula A1 e pressione <strong>Ctrl+V</strong> (ou Colar no celular). As 9 colunas serão preenchidas automaticamente!
          </p>
        </div>

        <button
          onClick={handleCopyToSheets}
          className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs whitespace-nowrap shrink-0 flex items-center gap-1.5"
        >
          <Copy className="w-3.5 h-3.5" />
          {copiedSuccess ? 'Copiado!' : 'Copiar Tudo Agora'}
        </button>
      </div>

      {/* Batch Edit Store Name Modal */}
      {isStoreModalOpen && onUpdateAllStoreNames && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Ajustar Razão Social dos Itens
                </h3>
              </div>
              <button
                onClick={() => setIsStoreModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Defina o Nome / Razão Social que será aplicado em todos os {items.length} itens desta tabela:
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Nome / Razão Social (Coluna 5)
              </label>
              <input
                type="text"
                value={customStoreName}
                onChange={(e) => setCustomStoreName(e.target.value)}
                placeholder="SENDAS DISTRIBUIDORA S/A"
                className="w-full p-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
              
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCustomStoreName('SENDAS DISTRIBUIDORA S/A')}
                  className="text-[11px] px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-700 font-medium"
                >
                  Usar: SENDAS DISTRIBUIDORA S/A
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsStoreModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onUpdateAllStoreNames) {
                    onUpdateAllStoreNames(customStoreName.trim() || 'SENDAS DISTRIBUIDORA S/A');
                  }
                  setIsStoreModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                Salvar em Todos os Itens
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Excluir Item
                </h3>
                <p className="text-xs text-slate-500">Tem certeza que deseja remover este item?</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1.5">
              <p className="font-bold text-slate-800 dark:text-slate-200 break-words">
                {itemToDelete.descricao}
              </p>
              <div className="flex items-center justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                <span>Item #{itemToDelete.num} • Qtd: {itemToDelete.qtd}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatBRL(itemToDelete.valorTotal)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (itemToDelete) {
                    const target = itemToDelete;
                    setItemToDelete(null);
                    onDeleteItem(target.id, target);
                    setDeletedNotification(`Item "${target.descricao}" excluído com sucesso.`);
                    setTimeout(() => setDeletedNotification(null), 3500);
                  }
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deleted Feedback Toast */}
      {deletedNotification && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-2xl shadow-xl border border-slate-700 dark:border-slate-200 text-xs font-bold">
            <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
            <span>{deletedNotification}</span>
          </div>
        </div>
      )}
    </div>
  );
};
