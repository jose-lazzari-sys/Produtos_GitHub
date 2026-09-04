import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  RotateCcw,
  Table as TableIcon,
  BarChart3,
  ListFilter,
  X,
  Sparkles
} from 'lucide-react';
import { NFCeItem, NFCeReceipt } from '../types';
import { parseDateToTimestamp } from '../utils/storage';
import { extractPesoKg, extractVolumeLitros, getItemAlimentacaoWeight } from '../utils/weightUtils';
import { ReportSlicers, SlicerMetrics } from './ReportSlicers';
import { ReportMatrixView, MatrixGroup } from './ReportMatrixView';
import { ReportChartsView } from './ReportChartsView';
import { ReportItemsView } from './ReportItemsView';

// Canonical category structure matching standard Excel spreadsheet
const EXCEL_STRUCTURE = [
  {
    tipo: 'Alimentação',
    shortName: 'Alimentação',
    colorTheme: {
      bgRow: 'bg-[#e2efda] dark:bg-emerald-950/30',
      border: 'border-emerald-300 dark:border-emerald-800',
      accent: 'emerald',
      text: 'text-emerald-900 dark:text-emerald-200',
    },
    iconType: 'food' as const,
    products: [
      'açougue/peixaria',
      'laticínios e frios',
      'hortifrúti',
      'mercearia',
      'padaria',
      'bebidas'
    ]
  },
  {
    tipo: 'Higiene Pessoal',
    shortName: 'Higiene',
    colorTheme: {
      bgRow: 'bg-[#ddebf7] dark:bg-sky-950/30',
      border: 'border-sky-300 dark:border-sky-800',
      accent: 'sky',
      text: 'text-sky-900 dark:text-sky-200',
    },
    iconType: 'hygiene' as const,
    products: [
      'bucal',
      'capilar',
      'corporal',
      'mãos/pés',
      'íntima e papéis',
      'pele/barbear'
    ]
  },
  {
    tipo: 'Limpeza Doméstica',
    shortName: 'Limpeza',
    colorTheme: {
      bgRow: 'bg-[#fce4d6] dark:bg-amber-950/30',
      border: 'border-amber-300 dark:border-amber-800',
      accent: 'amber',
      text: 'text-amber-900 dark:text-amber-200',
    },
    iconType: 'cleaning' as const,
    products: [
      'descartáveis',
      'acessórios',
      'desinfetantes',
      'detergentes',
      'inseticidas',
      'lava roupas'
    ]
  }
];

// Normalize helpers
function normalizeTipo(tipo?: string): string {
  if (!tipo) return '';
  const t = tipo.trim().toLowerCase();
  if (t.includes('alimen') || t.includes('comida')) return 'Alimentação';
  if (t.includes('higien') || t.includes('pessoal') || t.includes('banho')) return 'Higiene Pessoal';
  if (t.includes('limp') || t.includes('casa') || t.includes('domest')) return 'Limpeza Doméstica';
  return tipo.trim();
}

function normalizeProduto(produto?: string, _tipo?: string): string {
  if (!produto) return 'outros';
  return produto.trim();
}

function getItemYearMonth(dateStr?: string): string {
  if (!dateStr) return 'Sem Data';
  const ts = parseDateToTimestamp(dateStr);
  if (!ts) {
    const matchBR = dateStr.match(/\d{1,2}\/(\d{1,2})\/(\d{4})/);
    if (matchBR) {
      return `${matchBR[2]}-${matchBR[1].padStart(2, '0')}`;
    }
    const matchISO = dateStr.match(/^(\d{4})-(\d{1,2})/);
    if (matchISO) {
      return `${matchISO[1]}-${matchISO[2].padStart(2, '0')}`;
    }
    return 'Sem Data';
  }
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export interface ReportTableProps {
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
  onAddManualItem,
  onUpdateAllStoreNames,
  onDeleteItem,
  onClearAll,
  onLoadSample,
  onEditClick,
  onSwitchToScanner,
}) => {
  // Slicers State
  const [selectedYearMonth, setSelectedYearMonth] = useState<string | null>(null);
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null);
  const [selectedProduto, setSelectedProduto] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<string | null>(null);

  // Search input: "Busca por descrição, mercado ou data..."
  const [searchQuery, setSearchQuery] = useState<string>('');

  // View toggle: 'items' (Visualizar Itens) | 'matrix' (Tabela Matriz) | 'charts' (Visão Gráfica)
  const [viewMode, setViewMode] = useState<'items' | 'matrix' | 'charts'>('matrix');

  // Clear all filters handler
  const handleClearAllFilters = () => {
    setSelectedYearMonth(null);
    setSelectedTipo(null);
    setSelectedProduto(null);
    setSelectedData(null);
    setSearchQuery('');
  };

  const hasActiveFilters = Boolean(
    selectedYearMonth || selectedTipo || selectedProduto || selectedData || searchQuery.trim()
  );

  // 1. Filter base items by search query
  const searchFilteredBase = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const matchDesc = (item.descricao || '').toLowerCase().includes(q);
      const matchRazao = (item.razaoSocial || '').toLowerCase().includes(q);
      const matchData = (item.data || '').toLowerCase().includes(q);
      const matchProd = (item.produto || '').toLowerCase().includes(q);
      const matchDet = (item.detalhe || '').toLowerCase().includes(q);
      return matchDesc || matchRazao || matchData || matchProd || matchDet;
    });
  }, [items, searchQuery]);

  // =========================================================================
  // CROSS-FILTERING SUBSETS (Bidirectional interaction between all 4 slicers)
  // For each slicer, options are derived from items that match the OTHER 3 slicers!
  // =========================================================================

  // Items filtered by all criteria EXCEPT Year-Month
  const itemsForYearMonth = useMemo(() => {
    return searchFilteredBase.filter((item) => {
      if (selectedTipo && normalizeTipo(item.tipo) !== selectedTipo) return false;
      if (selectedProduto) {
        const normP = normalizeProduto(item.produto, item.tipo).toLowerCase();
        if (normP !== selectedProduto.toLowerCase()) return false;
      }
      if (selectedData && (item.data || '').trim() !== selectedData.trim()) return false;
      return true;
    });
  }, [searchFilteredBase, selectedTipo, selectedProduto, selectedData]);

  // Items filtered by all criteria EXCEPT Tipo
  const itemsForTipo = useMemo(() => {
    return searchFilteredBase.filter((item) => {
      if (selectedYearMonth && getItemYearMonth(item.data) !== selectedYearMonth) return false;
      if (selectedProduto) {
        const normP = normalizeProduto(item.produto, item.tipo).toLowerCase();
        if (normP !== selectedProduto.toLowerCase()) return false;
      }
      if (selectedData && (item.data || '').trim() !== selectedData.trim()) return false;
      return true;
    });
  }, [searchFilteredBase, selectedYearMonth, selectedProduto, selectedData]);

  // Items filtered by all criteria EXCEPT Produto
  const itemsForProduto = useMemo(() => {
    return searchFilteredBase.filter((item) => {
      if (selectedYearMonth && getItemYearMonth(item.data) !== selectedYearMonth) return false;
      if (selectedTipo && normalizeTipo(item.tipo) !== selectedTipo) return false;
      if (selectedData && (item.data || '').trim() !== selectedData.trim()) return false;
      return true;
    });
  }, [searchFilteredBase, selectedYearMonth, selectedTipo, selectedData]);

  // Items filtered by all criteria EXCEPT Data
  const itemsForData = useMemo(() => {
    return searchFilteredBase.filter((item) => {
      if (selectedYearMonth && getItemYearMonth(item.data) !== selectedYearMonth) return false;
      if (selectedTipo && normalizeTipo(item.tipo) !== selectedTipo) return false;
      if (selectedProduto) {
        const normP = normalizeProduto(item.produto, item.tipo).toLowerCase();
        if (normP !== selectedProduto.toLowerCase()) return false;
      }
      return true;
    });
  }, [searchFilteredBase, selectedYearMonth, selectedTipo, selectedProduto]);

  // Available Year-Months with counts
  const availableYearMonths = useMemo(() => {
    const ymMap = new Map<string, number>();
    itemsForYearMonth.forEach((it) => {
      const ym = getItemYearMonth(it.data);
      ymMap.set(ym, (ymMap.get(ym) || 0) + 1);
    });
    return Array.from(ymMap.entries())
      .map(([ym, count]) => ({ ym, count }))
      .sort((a, b) => {
        if (a.ym === 'Sem Data') return 1;
        if (b.ym === 'Sem Data') return -1;
        return a.ym.localeCompare(b.ym);
      });
  }, [itemsForYearMonth]);

  // Available Tipos with counts
  const availableTipos = useMemo(() => {
    const map = new Map<string, number>();
    itemsForTipo.forEach((it) => {
      const t = normalizeTipo(it.tipo);
      if (t) {
        map.set(t, (map.get(t) || 0) + 1);
      }
    });

    const canonicalOrder = ['Alimentação', 'Higiene Pessoal', 'Limpeza Doméstica'];
    const result: { tipo: string; count: number }[] = [];

    canonicalOrder.forEach((t) => {
      if (map.has(t)) {
        result.push({ tipo: t, count: map.get(t)! });
      }
    });

    map.forEach((count, t) => {
      if (!canonicalOrder.includes(t)) {
        result.push({ tipo: t, count });
      }
    });

    return result;
  }, [itemsForTipo]);

  // Available Products with counts
  const availableProdutos = useMemo(() => {
    const map = new Map<string, number>();
    itemsForProduto.forEach((it) => {
      const p = normalizeProduto(it.produto, it.tipo).toLowerCase();
      if (p && p !== 'outros') {
        map.set(p, (map.get(p) || 0) + 1);
      }
    });

    return Array.from(map.entries())
      .map(([prod, count]) => ({ prod, count }))
      .sort((a, b) => a.prod.localeCompare(b.prod));
  }, [itemsForProduto]);

  // Available Dates with counts
  const availableDatas = useMemo(() => {
    const dMap = new Map<string, { count: number; timestamp: number }>();
    itemsForData.forEach((it) => {
      const d = (it.data || '').trim();
      if (d) {
        const existing = dMap.get(d);
        if (existing) {
          existing.count += 1;
        } else {
          dMap.set(d, { count: 1, timestamp: parseDateToTimestamp(d) });
        }
      }
    });

    return Array.from(dMap.entries())
      .map(([dt, info]) => ({ dt, count: info.count, timestamp: info.timestamp }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [itemsForData]);

  // Auto-clear selections that become invalid when another slicer changes
  useEffect(() => {
    if (selectedYearMonth && !availableYearMonths.some((item) => item.ym === selectedYearMonth)) {
      setSelectedYearMonth(null);
    }
  }, [availableYearMonths, selectedYearMonth]);

  useEffect(() => {
    if (selectedTipo && !availableTipos.some((item) => item.tipo === selectedTipo)) {
      setSelectedTipo(null);
    }
  }, [availableTipos, selectedTipo]);

  useEffect(() => {
    if (selectedProduto && !availableProdutos.some((item) => item.prod === selectedProduto.toLowerCase())) {
      setSelectedProduto(null);
    }
  }, [availableProdutos, selectedProduto]);

  useEffect(() => {
    if (selectedData && !availableDatas.some((item) => item.dt === selectedData)) {
      setSelectedData(null);
    }
  }, [availableDatas, selectedData]);

  // Final Filtered Items (matching search query AND all active slicers)
  const filteredItems = useMemo(() => {
    return searchFilteredBase.filter((item) => {
      if (selectedYearMonth && getItemYearMonth(item.data) !== selectedYearMonth) return false;
      if (selectedTipo && normalizeTipo(item.tipo) !== selectedTipo) return false;
      if (selectedProduto) {
        const normItemProd = normalizeProduto(item.produto, item.tipo).toLowerCase();
        if (normItemProd !== selectedProduto.toLowerCase()) return false;
      }
      if (selectedData && (item.data || '').trim() !== selectedData.trim()) return false;
      return true;
    });
  }, [searchFilteredBase, selectedYearMonth, selectedTipo, selectedProduto, selectedData]);

  // Metrics for currently filtered items
  const metrics: SlicerMetrics = useMemo(() => {
    let totalValor = 0;
    let totalKg = 0;
    let totalValorAlimentacao = 0;
    let hasOtherTipo = false;
    let hasAlimentacao = false;

    filteredItems.forEach((it) => {
      const valor = Number(it.valorTotal) || 0;
      totalValor += valor;
      if (normalizeTipo(it.tipo) === 'Alimentação') {
        hasAlimentacao = true;
        totalValorAlimentacao += valor;
        const itemKg = getItemAlimentacaoWeight(it);
        if (itemKg > 0) {
          totalKg += itemKg;
        }
      } else {
        hasOtherTipo = true;
      }
    });

    const onlyAlimentacao = hasAlimentacao && !hasOtherTipo;
    const precoMedioKg = (onlyAlimentacao && totalKg > 0) ? totalValorAlimentacao / totalKg : 0;

    return {
      totalValor,
      totalKg,
      precoMedioKg,
      onlyAlimentacao
    };
  }, [filteredItems]);

  // Matrix Breakdown data by Tipo & Produto
  const matrixData: MatrixGroup[] = useMemo(() => {
    const globalTotalValor = metrics.totalValor || 1;

    const baseGroups = selectedTipo
      ? EXCEL_STRUCTURE.filter((g) => g.tipo === selectedTipo)
      : EXCEL_STRUCTURE;

    return baseGroups
      .map((group) => {
        const groupItems = filteredItems.filter(
          (it) => normalizeTipo(it.tipo) === group.tipo
        );

        const groupTotalValor = groupItems.reduce(
          (acc, it) => acc + (Number(it.valorTotal) || 0),
          0
        );
        const groupPercent = (groupTotalValor / globalTotalValor) * 100;

        const targetProducts = selectedProduto
          ? group.products.filter((p) => p.toLowerCase() === selectedProduto.toLowerCase())
          : group.products;

        const rows = targetProducts.map((prodName) => {
          const prodItems = groupItems.filter((it) => {
            const normP = normalizeProduto(it.produto, group.tipo);
            return normP.toLowerCase() === prodName.toLowerCase();
          });

          const prodValor = prodItems.reduce(
            (acc, it) => acc + (Number(it.valorTotal) || 0),
            0
          );
          const prodPercent = (prodValor / globalTotalValor) * 100;

          let quantidadeFormatted = '-';
          let precoUnitarioFormatted = '-';

          if (group.tipo === 'Alimentação') {
            if (prodName === 'bebidas') {
              let totalLitros = 0;
              prodItems.forEach((it) => {
                totalLitros += getItemAlimentacaoWeight(it);
              });

              if (totalLitros > 0) {
                quantidadeFormatted = `${totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} litros`;
                const precoLitro = prodValor / totalLitros;
                precoUnitarioFormatted = `${precoLitro.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R$/litro`;
              }
            } else {
              let totalKg = 0;
              prodItems.forEach((it) => {
                totalKg += getItemAlimentacaoWeight(it);
              });

              if (totalKg > 0) {
                quantidadeFormatted = `${totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} Kg`;
                const precoKg = prodValor / totalKg;
                precoUnitarioFormatted = `${precoKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R$/Kg`;
              }
            }
          }

          const displayProdName = prodName
            .split(' ')
            .map((w) => (w.includes('/') ? w.split('/').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('/') : w.charAt(0).toUpperCase() + w.slice(1)))
            .join(' ');

          return {
            produtoName: displayProdName,
            rawProdName: prodName,
            valor: prodValor,
            percent: prodPercent,
            quantidadeFormatted,
            precoUnitarioFormatted,
            count: prodItems.length
          };
        });

        return {
          ...group,
          totalValor: groupTotalValor,
          percent: groupPercent,
          itemCount: groupItems.length,
          rows
        };
      })
      .filter((group) => group.rows.length > 0);
  }, [filteredItems, metrics.totalValor, selectedTipo, selectedProduto]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* TOP BAR: SEARCH INPUT & VIEW MODE SELECTOR */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Input: "Busca por descrição, mercado ou data..." */}
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Busca por descrição, mercado ou data..."
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all font-medium"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* View Mode Buttons: [ Visualizar Itens ] [ Tabela Matriz ] [ Visão Gráfica ] */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Button 1: Visualizar Itens (Placed right in front as requested) */}
          <button
            type="button"
            onClick={() => setViewMode('items')}
            className={`py-2 px-3.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
              viewMode === 'items'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20 ring-2 ring-sky-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>Visualizar Itens</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                viewMode === 'items'
                  ? 'bg-sky-700 text-sky-100'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
              }`}
            >
              {filteredItems.length}
            </span>
          </button>

          {/* Button 2: Tabela Matriz */}
          <button
            type="button"
            onClick={() => setViewMode('matrix')}
            className={`py-2 px-3.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
              viewMode === 'matrix'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20 ring-2 ring-sky-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            <span>Tabela Matriz</span>
          </button>

          {/* Button 3: Visão Gráfica */}
          <button
            type="button"
            onClick={() => setViewMode('charts')}
            className={`py-2 px-3.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
              viewMode === 'charts'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-500/20 ring-2 ring-sky-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Visão Gráfica</span>
          </button>

          {/* Clear Filters button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="py-2 px-3 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Limpar todos os filtros e busca"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* THE 4 INTEGRATED SLICERS (ano-mês, TIPO, PRODUTO, data) + 3 BEVELED KPIS */}
      <ReportSlicers
        availableYearMonths={availableYearMonths}
        selectedYearMonth={selectedYearMonth}
        onSelectYearMonth={setSelectedYearMonth}
        availableTipos={availableTipos}
        selectedTipo={selectedTipo}
        onSelectTipo={setSelectedTipo}
        availableProdutos={availableProdutos}
        selectedProduto={selectedProduto}
        onSelectProduto={setSelectedProduto}
        availableDatas={availableDatas}
        selectedData={selectedData}
        onSelectData={setSelectedData}
        metrics={metrics}
      />

      {/* ACTIVE VIEW CONTENT */}
      {viewMode === 'items' && (
        <ReportItemsView
          items={items}
          filteredItems={filteredItems}
          totalFiltrado={metrics.totalValor}
          onEditClick={onEditClick}
          onDeleteItem={onDeleteItem}
          onAddManualItem={onAddManualItem}
          onUpdateAllStoreNames={onUpdateAllStoreNames}
          onClearAll={onClearAll}
          onSwitchToScanner={onSwitchToScanner}
          onLoadSample={onLoadSample}
          onClearFilters={handleClearAllFilters}
        />
      )}

      {viewMode === 'matrix' && (
        <ReportMatrixView
          matrixData={matrixData}
          totalItensCount={filteredItems.length}
          hasActiveFilters={hasActiveFilters}
          globalTotalValor={metrics.totalValor}
        />
      )}

      {viewMode === 'charts' && (
        <ReportChartsView
          matrixData={matrixData}
          globalTotalValor={metrics.totalValor}
        />
      )}
    </div>
  );
};
