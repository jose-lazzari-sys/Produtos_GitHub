import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Filter,
  RotateCcw,
  Scale,
  DollarSign,
  TrendingUp,
  PieChart,
  BarChart3,
  Table as TableIcon,
  Sparkles,
  Utensils,
  Smile,
  Sparkle,
  Layers,
  ShoppingBag,
  Info,
  Check,
  ChevronDown,
  ChevronRight,
  Download
} from 'lucide-react';
import { NFCeItem } from '../types';
import { formatBRL } from '../utils/nfceParser';
import { parseDateToTimestamp } from '../utils/storage';
import { extractPesoKg, extractVolumeLitros, calculatePrecoPorKg, calculatePrecoPorLitro } from '../utils/weightUtils';
import { CATEGORY_RULES, VALID_TIPOS, normalizeTipo, normalizeProduto } from '../utils/classifier';

interface DashboardTabProps {
  items: NFCeItem[];
  onGoToItems?: () => void;
}

// Canonical subcategories grouping to mirror exactly the user's Excel model
const EXCEL_STRUCTURE = [
  {
    tipo: 'Alimentação',
    shortName: 'Alimentação',
    colorTheme: {
      bgRow: 'bg-[#e2efda] dark:bg-emerald-950/30',
      border: 'border-emerald-300 dark:border-emerald-800',
      accent: 'emerald',
      text: 'text-emerald-900 dark:text-emerald-200',
      boxBg: 'bg-white dark:bg-slate-800',
      boxBorder: 'border-emerald-400 dark:border-emerald-700'
    },
    iconType: 'food',
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
      boxBg: 'bg-white dark:bg-slate-800',
      boxBorder: 'border-sky-400 dark:border-sky-700'
    },
    iconType: 'hygiene',
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
      boxBg: 'bg-white dark:bg-slate-800',
      boxBorder: 'border-amber-400 dark:border-amber-700'
    },
    iconType: 'cleaning',
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

// Helper to extract year-month from an item date (YYYY-MM)
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

export const DashboardTab: React.FC<DashboardTabProps> = ({ items, onGoToItems }) => {
  // Slicers State (Filtered Selections)
  const [selectedYearMonth, setSelectedYearMonth] = useState<string | null>(null);
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null);
  const [selectedProduto, setSelectedProduto] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<string | null>(null);

  // View toggle: Matrix (Excel-style) vs Charts
  const [viewMode, setViewMode] = useState<'matrix' | 'charts'>('matrix');

  // Clear all filters handler
  const handleClearAllFilters = () => {
    setSelectedYearMonth(null);
    setSelectedTipo(null);
    setSelectedProduto(null);
    setSelectedData(null);
  };

  const hasActiveFilters = Boolean(
    selectedYearMonth || selectedTipo || selectedProduto || selectedData
  );

  // =========================================================================
  // CROSS-FILTERING SUBSETS (Bidirectional interaction between all 4 slicers)
  // For each slicer, options are derived from items that match the OTHER 3 slicers!
  // =========================================================================

  // 1. Items filtered by all criteria EXCEPT Year-Month
  const itemsForYearMonth = useMemo(() => {
    return items.filter((item) => {
      if (selectedTipo && normalizeTipo(item.tipo) !== selectedTipo) return false;
      if (selectedProduto) {
        const normP = normalizeProduto(item.produto, item.tipo).toLowerCase();
        if (normP !== selectedProduto.toLowerCase()) return false;
      }
      if (selectedData && (item.data || '').trim() !== selectedData.trim()) return false;
      return true;
    });
  }, [items, selectedTipo, selectedProduto, selectedData]);

  // 2. Items filtered by all criteria EXCEPT Tipo
  const itemsForTipo = useMemo(() => {
    return items.filter((item) => {
      if (selectedYearMonth && getItemYearMonth(item.data) !== selectedYearMonth) return false;
      if (selectedProduto) {
        const normP = normalizeProduto(item.produto, item.tipo).toLowerCase();
        if (normP !== selectedProduto.toLowerCase()) return false;
      }
      if (selectedData && (item.data || '').trim() !== selectedData.trim()) return false;
      return true;
    });
  }, [items, selectedYearMonth, selectedProduto, selectedData]);

  // 3. Items filtered by all criteria EXCEPT Produto
  const itemsForProduto = useMemo(() => {
    return items.filter((item) => {
      if (selectedYearMonth && getItemYearMonth(item.data) !== selectedYearMonth) return false;
      if (selectedTipo && normalizeTipo(item.tipo) !== selectedTipo) return false;
      if (selectedData && (item.data || '').trim() !== selectedData.trim()) return false;
      return true;
    });
  }, [items, selectedYearMonth, selectedTipo, selectedData]);

  // 4. Items filtered by all criteria EXCEPT Data
  const itemsForData = useMemo(() => {
    return items.filter((item) => {
      if (selectedYearMonth && getItemYearMonth(item.data) !== selectedYearMonth) return false;
      if (selectedTipo && normalizeTipo(item.tipo) !== selectedTipo) return false;
      if (selectedProduto) {
        const normP = normalizeProduto(item.produto, item.tipo).toLowerCase();
        if (normP !== selectedProduto.toLowerCase()) return false;
      }
      return true;
    });
  }, [items, selectedYearMonth, selectedTipo, selectedProduto]);

  // --- Dynamic list of Available Year-Months with counts ---
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

  // --- Dynamic list of Available Tipos with counts ---
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

  // --- Dynamic list of Available Products with counts ---
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

  // --- Dynamic list of Available Dates with counts ---
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

  // --- Final Filtered Items (matching ALL active selections simultaneously) ---
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Year-Month filter
      if (selectedYearMonth) {
        const ym = getItemYearMonth(item.data);
        if (ym !== selectedYearMonth) return false;
      }

      // 2. Tipo filter
      if (selectedTipo) {
        const normItemTipo = normalizeTipo(item.tipo);
        if (normItemTipo !== selectedTipo) return false;
      }

      // 3. Produto filter
      if (selectedProduto) {
        const normItemProd = normalizeProduto(item.produto, item.tipo).toLowerCase();
        if (normItemProd !== selectedProduto.toLowerCase()) return false;
      }

      // 4. Data filter
      if (selectedData) {
        const normItemData = (item.data || '').trim();
        if (normItemData !== selectedData.trim()) return false;
      }

      return true;
    });
  }, [items, selectedYearMonth, selectedTipo, selectedProduto, selectedData]);

  // --- Global Metrics for currently filtered items ---
  const metrics = useMemo(() => {
    let totalValor = 0;
    let totalKg = 0;
    let totalValorWithKg = 0;

    filteredItems.forEach((item) => {
      const valor = Number(item.valorTotal) || 0;
      totalValor += valor;

      const normTipo = normalizeTipo(item.tipo);
      if (normTipo === 'Alimentação') {
        let peso = 0;
        if (typeof item.pesoKg === 'number' && item.pesoKg > 0) {
          peso = item.pesoKg;
        } else {
          peso = extractPesoKg(item.descricao, item.qtd, item.unidade, item.tipo);
        }

        if (peso > 0) {
          const safeQtd = item.qtd > 0 ? item.qtd : 1;
          const cleanUnit = (item.unidade || '').trim().toUpperCase();
          const itemTotalKg = (cleanUnit === 'KG' || Math.abs(peso - safeQtd) < 0.0001)
            ? peso
            : peso * safeQtd;

          totalKg += itemTotalKg;
          totalValorWithKg += valor;
        }
      }
    });

    const precoMedioKg = totalKg > 0 ? totalValorWithKg / totalKg : 0;

    return {
      totalValor,
      totalKg,
      precoMedioKg
    };
  }, [filteredItems]);

  // --- Matrix Breakdown data by Tipo & Produto (matching Image 2) ---
  const matrixData = useMemo(() => {
    const globalTotalValor = metrics.totalValor || 1; // avoid / 0

    // If user filtered by a specific Tipo, show only that category
    const baseGroups = selectedTipo
      ? EXCEL_STRUCTURE.filter((g) => g.tipo === selectedTipo)
      : EXCEL_STRUCTURE;

    return baseGroups
      .map((group) => {
        // Find all items belonging to this Tipo in filtered data
        const groupItems = filteredItems.filter(
          (it) => normalizeTipo(it.tipo) === group.tipo
        );

        const groupTotalValor = groupItems.reduce(
          (acc, it) => acc + (Number(it.valorTotal) || 0),
          0
        );
        const groupPercent = (groupTotalValor / globalTotalValor) * 100;

        // If user filtered by a specific subcategory (PRODUTO)
        const targetProducts = selectedProduto
          ? group.products.filter((p) => p.toLowerCase() === selectedProduto.toLowerCase())
          : group.products;

        // Subcategory rows
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
              // Calculate total liters for beverages
              let totalLitros = 0;
              prodItems.forEach((it) => {
                const vol = extractVolumeLitros(it.descricao, it.qtd, it.unidade, it.produto);
                if (vol > 0) {
                  const safeQ = it.qtd > 0 ? it.qtd : 1;
                  const cleanU = (it.unidade || '').trim().toUpperCase();
                  totalLitros += (cleanU === 'L' || cleanU === 'LT' || Math.abs(vol - safeQ) < 0.0001)
                    ? vol
                    : vol * safeQ;
                }
              });

              if (totalLitros > 0) {
                quantidadeFormatted = `${totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} litros`;
                const precoLitro = prodValor / totalLitros;
                precoUnitarioFormatted = `${precoLitro.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R$/litro`;
              } else {
                quantidadeFormatted = '-';
                precoUnitarioFormatted = '-';
              }
            } else {
              // Standard food: calculate total Kg
              let totalKg = 0;
              prodItems.forEach((it) => {
                let peso = (typeof it.pesoKg === 'number' && it.pesoKg > 0)
                  ? it.pesoKg
                  : extractPesoKg(it.descricao, it.qtd, it.unidade, it.tipo);

                if (peso > 0) {
                  const safeQ = it.qtd > 0 ? it.qtd : 1;
                  const cleanU = (it.unidade || '').trim().toUpperCase();
                  totalKg += (cleanU === 'KG' || Math.abs(peso - safeQ) < 0.0001)
                    ? peso
                    : peso * safeQ;
                }
              });

              if (totalKg > 0) {
                quantidadeFormatted = `${totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Kg`;
                const precoKg = prodValor / totalKg;
                precoUnitarioFormatted = `${precoKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R$/Kg`;
              } else {
                quantidadeFormatted = '-';
                precoUnitarioFormatted = '-';
              }
            }
          }

          // Display formatted product label (Title Cased)
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
      {/* Top Banner / Intro */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-sm">
              5
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Dashboard de Indicadores Mensais
            </h2>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Filtros Integrados
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Segmentação dinâmica por <strong>Ano-Mês</strong>, <strong>Tipo</strong>, <strong>Produto</strong> e <strong>Data</strong> com visão analítica consolidada.
          </p>
        </div>

        {/* View Switcher & Clear Button */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center">
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'matrix'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabela Matriz</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('charts')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'charts'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Visão Gráfica</span>
            </button>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="py-2 px-3 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Limpar todos os filtros ativos"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 SLICER FILTER PANELS + 3 KPIS (MIRRORS EXACTLY FIGURE 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {/* SLICER 1: ano-mês */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-300/80 dark:border-sky-800 shadow-sm p-3 flex flex-col h-[380px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-sky-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                ano-mês
              </span>
            </div>
            {selectedYearMonth && (
              <button
                type="button"
                onClick={() => setSelectedYearMonth(null)}
                className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors cursor-pointer"
                title="Limpar filtro de mês"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
            {availableYearMonths.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">Nenhum mês aplicável</p>
            ) : (
              availableYearMonths.map(({ ym, count }) => {
                const isSelected = selectedYearMonth === ym;
                return (
                  <button
                    key={ym}
                    type="button"
                    onClick={() => setSelectedYearMonth(isSelected ? null : ym)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between border cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-700 shadow-md font-black scale-[1.01]'
                        : 'bg-[#b8cce4]/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-sky-200/70 dark:border-slate-700 hover:bg-[#a8c0dc] dark:hover:bg-slate-750'
                    }`}
                  >
                    <span>{ym}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isSelected ? 'bg-sky-700 text-sky-100' : 'bg-white/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                        {count}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* SLICER 2: TIPO + 3 KPI CARDS EMBEDDED BELOW (EXACTLY AS IN FIGURE 1) */}
        <div className="space-y-3">
          {/* TIPO Filter Box */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-300/80 dark:border-sky-800 shadow-sm p-3 flex flex-col h-[200px]">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-sky-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  TIPO
                </span>
              </div>
              {selectedTipo && (
                <button
                  type="button"
                  onClick={() => setSelectedTipo(null)}
                  className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors cursor-pointer"
                  title="Limpar filtro de Tipo"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
              {availableTipos.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">Nenhum tipo aplicável</p>
              ) : (
                availableTipos.map(({ tipo, count }) => {
                  const isSelected = selectedTipo === tipo;
                  return (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setSelectedTipo(isSelected ? null : tipo)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between border cursor-pointer ${
                        isSelected
                          ? 'bg-sky-600 text-white border-sky-700 shadow-md font-black scale-[1.01]'
                          : 'bg-[#b8cce4]/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-sky-200/70 dark:border-slate-700 hover:bg-[#a8c0dc] dark:hover:bg-slate-750'
                      }`}
                    >
                      <span>{tipo}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                          isSelected ? 'bg-sky-700 text-sky-100' : 'bg-white/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}>
                          {count}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 3 BEVELED METRIC CARDS (MIRRORS EXACTLY THE 3 BUTTONS/BLOCKS IN FIGURE 1) */}
          <div className="space-y-2">
            {/* Card 1: Total R$ */}
            <div className="p-2.5 px-4 rounded-xl bg-[#e9e9e0] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.1)] text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                Total Faturado
              </span>
              <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                {formatBRL(metrics.totalValor)}
              </span>
            </div>

            {/* Card 2: Total Kg */}
            <div className="p-2 px-4 rounded-xl bg-[#e9e9e0] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.1)] text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                Peso Alimentação
              </span>
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {metrics.totalKg > 0
                  ? `${metrics.totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Kg`
                  : '0,0 Kg'}
              </span>
            </div>

            {/* Card 3: R$/Kg */}
            <div className="p-2 px-4 rounded-xl bg-[#e9e9e0] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.1)] text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                Preço Médio Kg
              </span>
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {metrics.precoMedioKg > 0
                  ? `${metrics.precoMedioKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R$/Kg`
                  : '0,00 R$/Kg'}
              </span>
            </div>
          </div>
        </div>

        {/* SLICER 3: PRODUTO */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-300/80 dark:border-sky-800 shadow-sm p-3 flex flex-col h-[380px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-sky-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                PRODUTO
              </span>
            </div>
            {selectedProduto && (
              <button
                type="button"
                onClick={() => setSelectedProduto(null)}
                className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors cursor-pointer"
                title="Limpar filtro de Produto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
            {availableProdutos.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">Nenhum produto aplicável</p>
            ) : (
              availableProdutos.map(({ prod, count }) => {
                const isSelected = selectedProduto?.toLowerCase() === prod.toLowerCase();
                return (
                  <button
                    key={prod}
                    type="button"
                    onClick={() => setSelectedProduto(isSelected ? null : prod)}
                    className={`w-full py-1.5 px-3 rounded-xl text-xs font-semibold transition-all text-left flex items-center justify-between border cursor-pointer capitalize ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-700 shadow-md font-black scale-[1.01]'
                        : 'bg-[#b8cce4]/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-sky-200/70 dark:border-slate-700 hover:bg-[#a8c0dc] dark:hover:bg-slate-750'
                    }`}
                  >
                    <span className="truncate">{prod}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isSelected ? 'bg-sky-700 text-sky-100' : 'bg-white/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                        {count}
                      </span>
                      {isSelected && <Check className="w-3 h-3 text-white shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* SLICER 4: data */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-300/80 dark:border-sky-800 shadow-sm p-3 flex flex-col h-[380px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-sky-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                data
              </span>
            </div>
            {selectedData && (
              <button
                type="button"
                onClick={() => setSelectedData(null)}
                className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors cursor-pointer"
                title="Limpar filtro de Data"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
            {availableDatas.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">Nenhuma data aplicável</p>
            ) : (
              availableDatas.map(({ dt, count }) => {
                const isSelected = selectedData === dt;
                return (
                  <button
                    key={dt}
                    type="button"
                    onClick={() => setSelectedData(isSelected ? null : dt)}
                    className={`w-full py-1.5 px-3 rounded-xl text-xs font-medium font-mono transition-all text-left flex items-center justify-between border cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-700 shadow-md font-bold scale-[1.01]'
                        : 'bg-[#b8cce4]/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-sky-200/70 dark:border-slate-700 hover:bg-[#a8c0dc] dark:hover:bg-slate-750'
                    }`}
                  >
                    <span className="truncate">{dt}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isSelected ? 'bg-sky-700 text-sky-100' : 'bg-white/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}>
                        {count}
                      </span>
                      {isSelected && <Check className="w-3 h-3 text-white shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MAIN VIEW: MATRIZ CONSOLIDADA (FIGURE 2) OR CHARTS */}
      {viewMode === 'matrix' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
          {/* Header Bar */}
          <div className="p-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>Relatório Consolidado de Gastos por Categoria</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'itens'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Detalhamento conforme a planilha padrão com desenhos, valores, pesos e preços unitários.
              </p>
            </div>

            {hasActiveFilters && (
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <Filter className="w-3.5 h-3.5" />
                <span>Exibindo dados filtrados</span>
              </div>
            )}
          </div>

          {/* Table (Responsive Container) */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              {/* Table Column Header */}
              <thead>
                <tr className="bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-black uppercase tracking-wider border-b-2 border-slate-300 dark:border-slate-700">
                  <th className="py-3 px-4 w-44 text-center">Desenho</th>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4 text-right">R$</th>
                  <th className="py-3 px-4 text-right">%</th>
                  <th className="py-3 px-4 text-right">Quantidade</th>
                  <th className="py-3 px-4 text-right">R$/Quantid.</th>
                </tr>
              </thead>

              {/* Table Body Groups */}
              <tbody>
                {matrixData.map((group) => {
                  const theme = group.colorTheme;
                  return (
                    <React.Fragment key={group.tipo}>
                      {group.rows.map((row, index) => {
                        const isFirstRow = index === 0;
                        return (
                          <tr
                            key={`${group.tipo}-${row.rawProdName}`}
                            className={`${theme.bgRow} border-b border-slate-300/40 dark:border-slate-700/50 hover:brightness-95 dark:hover:brightness-110 transition-all`}
                          >
                            {/* Column 1: Desenho & Group Summary (rendered only once via rowSpan) */}
                            {isFirstRow && (
                              <td
                                rowSpan={group.rows.length}
                                className="py-4 px-4 align-middle text-center border-r-2 border-slate-300/60 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/70"
                              >
                                <div className="flex flex-col items-center justify-center space-y-2 max-w-[140px] mx-auto">
                                  {/* Visual Icon Illustration (Matching exact user drawings) */}
                                  <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-2 border-slate-800 dark:border-slate-200 flex items-center justify-center bg-white dark:bg-slate-800 shadow-md p-3">
                                    {group.iconType === 'food' && (
                                      <svg
                                        viewBox="0 0 64 64"
                                        className="w-12 h-12 text-slate-800 dark:text-slate-100"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        {/* Fork */}
                                        <path d="M18 10v18a6 6 0 0 0 6 6v20M14 10v12M22 10v12M18 10v12" />
                                        {/* Spoon */}
                                        <path d="M46 10a8 8 0 0 0-8 8c0 5 4 8 8 10v26M46 10a8 8 0 0 1 8 8c0 5-4 8-8 10" />
                                      </svg>
                                    )}

                                    {group.iconType === 'hygiene' && (
                                      <svg
                                        viewBox="0 0 64 64"
                                        className="w-12 h-12 text-slate-800 dark:text-slate-100"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        {/* Soap & bottles */}
                                        <rect x="12" y="24" width="16" height="30" rx="4" />
                                        <path d="M20 24v-6h-4" />
                                        {/* Toothbrush cup */}
                                        <path d="M34 24h18l-3 30H37l-3-30z" />
                                        <path d="M40 10v14M46 8v16" />
                                      </svg>
                                    )}

                                    {group.iconType === 'cleaning' && (
                                      <svg
                                        viewBox="0 0 64 64"
                                        className="w-12 h-12 text-slate-800 dark:text-slate-100"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="3.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        {/* Bucket with sponge and spray */}
                                        <path d="M16 28h32l-4 26H20L16 28z" />
                                        <path d="M16 28c0-8 16-16 16-16s16 8 16 16" />
                                        <rect x="36" y="12" width="10" height="16" rx="2" />
                                        <path d="M41 12V8h6" />
                                      </svg>
                                    )}
                                  </div>

                                  {/* Box 1: Tipo Name */}
                                  <div className="w-full py-1 px-2 rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-700 dark:border-slate-300 text-xs font-black text-slate-900 dark:text-white shadow-xs">
                                    {group.shortName}
                                  </div>

                                  {/* Box 2: Total R$ */}
                                  <div className="w-full py-1 px-2 rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-700 dark:border-slate-300 text-xs font-black text-slate-900 dark:text-white shadow-xs">
                                    {formatBRL(group.totalValor)}
                                  </div>

                                  {/* Box 3: Percentage % */}
                                  <div className="w-full py-0.5 px-2 rounded-lg bg-white dark:bg-slate-800 border-2 border-slate-700 dark:border-slate-300 text-xs font-black text-slate-900 dark:text-white shadow-xs">
                                    {group.percent.toFixed(0)}%
                                  </div>
                                </div>
                              </td>
                            )}

                            {/* Column 2: Produto */}
                            <td className="py-2.5 px-4 text-xs font-bold text-slate-900 dark:text-slate-100">
                              <span className="capitalize">{row.produtoName}</span>
                            </td>

                            {/* Column 3: R$ */}
                            <td className="py-2.5 px-4 text-xs font-bold text-slate-900 dark:text-slate-100 text-right font-mono">
                              {row.valor.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>

                            {/* Column 4: % */}
                            <td className="py-2.5 px-4 text-xs font-medium text-slate-800 dark:text-slate-200 text-right font-mono">
                              {row.percent.toLocaleString('pt-BR', {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1
                              })}%
                            </td>

                            {/* Column 5: Quantidade */}
                            <td className="py-2.5 px-4 text-xs font-medium text-slate-800 dark:text-slate-200 text-right font-mono">
                              {row.quantidadeFormatted}
                            </td>

                            {/* Column 6: R$/Quantid. */}
                            <td className="py-2.5 px-4 text-xs font-medium text-slate-800 dark:text-slate-200 text-right font-mono">
                              {row.precoUnitarioFormatted}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* Table Footer: Total Geral */}
              <tfoot>
                <tr className="bg-slate-100 dark:bg-slate-850 border-t-2 border-slate-400 dark:border-slate-600 font-black text-slate-900 dark:text-white">
                  <td colSpan={2} className="py-4 px-4 text-sm font-black uppercase text-right tracking-wider">
                    Total Geral:
                  </td>
                  <td className="py-4 px-4 text-sm font-black text-right font-mono text-emerald-600 dark:text-emerald-400">
                    {metrics.totalValor.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </td>
                  <td className="py-4 px-4 text-sm font-black text-right font-mono">
                    100,0%
                  </td>
                  <td className="py-4 px-4 text-sm font-black text-right font-mono text-indigo-600 dark:text-indigo-400">
                    {metrics.totalKg > 0
                      ? `${metrics.totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Kg`
                      : '-'}
                  </td>
                  <td className="py-4 px-4 text-sm font-black text-right font-mono text-amber-600 dark:text-amber-400">
                    {metrics.precoMedioKg > 0
                      ? `${metrics.precoMedioKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R$/Kg`
                      : '-'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        /* CHARTS VIEW: BARS & DISTRIBUTION */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {matrixData.map((group) => (
              <div
                key={group.tipo}
                className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    {group.shortName}
                  </h4>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {group.percent.toFixed(1)}%
                  </span>
                </div>

                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {formatBRL(group.totalValor)}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      group.iconType === 'food'
                        ? 'bg-emerald-500'
                        : group.iconType === 'hygiene'
                        ? 'bg-sky-500'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, group.percent))}%` }}
                  />
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {group.itemCount} itens registrados nessa categoria
                </p>
              </div>
            ))}
          </div>

          {/* Subcategory Visual Bars */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h4 className="text-base font-black text-slate-900 dark:text-white">
              Ranking dos Maiores Gastos por Subcategoria
            </h4>
            <div className="space-y-3">
              {matrixData
                .flatMap((g) => g.rows)
                .sort((a, b) => b.valor - a.valor)
                .slice(0, 10)
                .map((row) => (
                  <div key={row.produtoName} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="capitalize">{row.produtoName}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 dark:text-slate-400">{row.percent.toFixed(1)}%</span>
                        <span className="font-mono font-black">{formatBRL(row.valor)}</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, row.percent * 2.5))}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
