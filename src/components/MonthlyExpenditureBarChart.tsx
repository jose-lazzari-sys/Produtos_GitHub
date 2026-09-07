import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts';
import { BarChart3, Filter } from 'lucide-react';
import { NFCeItem } from '../types';
import { formatBRL } from '../utils/nfceParser';
import { extractYearMonthFromDate } from '../utils/storage';
import { normalizeTipo, normalizeProduto } from './ReportTable';

export interface MonthlyExpenditureBarChartProps {
  items: NFCeItem[];
  selectedYearMonth?: string | null;
  selectedTipo?: string | null;
  selectedProduto?: string | null;
  selectedData?: string | null;
  searchQuery?: string;
}

const MONTH_NAMES_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const MONTH_NAMES_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const MonthlyExpenditureBarChart: React.FC<MonthlyExpenditureBarChartProps> = ({
  items,
  selectedYearMonth,
  selectedTipo,
  selectedProduto,
  selectedData,
  searchQuery,
}) => {
  // 1. Filter items by all active slicers EXCEPT Year-Month (which defines the 3-month comparison window)
  const filteredBaseItems = useMemo(() => {
    return items.filter((item) => {
      // Search query filter
      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDesc = (item.descricao || '').toLowerCase().includes(q);
        const matchRazao = (item.razaoSocial || '').toLowerCase().includes(q);
        const matchData = (item.data || '').toLowerCase().includes(q);
        const matchProd = (item.produto || '').toLowerCase().includes(q);
        const matchDet = (item.detalhe || '').toLowerCase().includes(q);
        if (!matchDesc && !matchRazao && !matchData && !matchProd && !matchDet) return false;
      }

      // TIPO filter
      if (selectedTipo && normalizeTipo(item.tipo) !== selectedTipo) {
        return false;
      }

      // PRODUTO filter
      if (selectedProduto) {
        const normP = normalizeProduto(item.produto, item.tipo).toLowerCase();
        if (normP !== selectedProduto.toLowerCase()) {
          return false;
        }
      }

      // DATA filter
      if (selectedData && (item.data || '').trim() !== selectedData.trim()) {
        return false;
      }

      return true;
    });
  }, [items, searchQuery, selectedTipo, selectedProduto, selectedData]);

  // Active filter badges for the header
  const activeFilters = useMemo(() => {
    const filters: { label: string; value: string; color: string }[] = [];
    if (selectedYearMonth && selectedYearMonth !== 'Sem Data') {
      filters.push({
        label: 'ANO-MÊS',
        value: selectedYearMonth,
        color: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
      });
    }
    if (selectedTipo) {
      filters.push({
        label: 'TIPO',
        value: selectedTipo,
        color: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      });
    }
    if (selectedProduto) {
      const displayProd = selectedProduto
        .split(' ')
        .map((w) => (w.includes('/') ? w.split('/').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('/') : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(' ');
      filters.push({
        label: 'PRODUTO',
        value: displayProd,
        color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      });
    }
    if (selectedData) {
      filters.push({
        label: 'DATA',
        value: selectedData,
        color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      });
    }
    return filters;
  }, [selectedYearMonth, selectedTipo, selectedProduto, selectedData]);

  const chartData = useMemo(() => {
    // 2. Group filtered items by year-month code "YYYY-MM"
    const monthTotals = new Map<string, { valor: number; count: number; year: number; month: number }>();

    filteredBaseItems.forEach((item) => {
      const ym = extractYearMonthFromDate(item.data);
      if (!ym || ym === 'Sem Data') return;
      const parts = ym.split('-');
      if (parts.length !== 2) return;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(y) || isNaN(m)) return;

      const val = Number(item.valorTotal) || 0;
      const current = monthTotals.get(ym);
      if (current) {
        current.valor += val;
        current.count += 1;
      } else {
        monthTotals.set(ym, {
          valor: val,
          count: 1,
          year: y,
          month: m,
        });
      }
    });

    // 3. Determine target year and month based on selectedYearMonth, selectedData, or latest available data
    let targetYear: number | null = null;
    let targetMonth: number | null = null;

    // Check selectedYearMonth first
    if (selectedYearMonth && selectedYearMonth !== 'Sem Data') {
      const parts = selectedYearMonth.trim().split('-');
      if (parts.length === 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
          targetYear = y;
          targetMonth = m;
        }
      }
    }

    // If no selectedYearMonth, but selectedData is set, derive reference month from selectedData
    if ((!targetYear || !targetMonth) && selectedData && selectedData !== 'Sem Data') {
      const ym = extractYearMonthFromDate(selectedData);
      if (ym && ym !== 'Sem Data') {
        const parts = ym.trim().split('-');
        if (parts.length === 2) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
            targetYear = y;
            targetMonth = m;
          }
        }
      }
    }

    // Fallback: find latest month in filteredBaseItems or all items
    if (!targetYear || !targetMonth) {
      const candidateList = filteredBaseItems.length > 0 ? filteredBaseItems : items;
      const ymSet = new Set<string>();
      candidateList.forEach((it) => {
        const ym = extractYearMonthFromDate(it.data);
        if (ym && ym !== 'Sem Data') {
          ymSet.add(ym);
        }
      });

      if (ymSet.size > 0) {
        const sorted = Array.from(ymSet).sort();
        const latestYm = sorted[sorted.length - 1];
        const [yStr, mStr] = latestYm.split('-');
        targetYear = parseInt(yStr, 10);
        targetMonth = parseInt(mStr, 10);
      } else {
        const now = new Date();
        targetYear = now.getFullYear();
        targetMonth = now.getMonth() + 1;
      }
    }

    // 4. Build target keys for the 6 months: [reference - 5, reference - 4, reference - 3, reference - 2, reference - 1, reference]
    const referenceKey = targetYear * 12 + (targetMonth - 1);
    const targetKeys = [
      referenceKey - 5,
      referenceKey - 4,
      referenceKey - 3,
      referenceKey - 2,
      referenceKey - 1,
      referenceKey,
    ];

    const barColors = [
      '#64748b', // Slate 500 (m - 5)
      '#0284c7', // Sky 600 (m - 4)
      '#0ea5e9', // Sky 500 (m - 3)
      '#38bdf8', // Sky 400 (m - 2)
      '#059669', // Emerald 600 (m - 1)
      '#10b981', // Emerald 500 (m 0 - target/current)
    ];

    return targetKeys.map((key, index) => {
      const year = Math.floor(key / 12);
      const monthZeroBased = key % 12;
      const monthOneBased = monthZeroBased + 1;
      const ymCode = `${year}-${String(monthOneBased).padStart(2, '0')}`;
      const stats = monthTotals.get(ymCode) || { valor: 0, count: 0 };

      const shortLabel = `${MONTH_NAMES_SHORT[monthZeroBased]}/${String(year).slice(-2)}`;
      const fullLabel = `${MONTH_NAMES_FULL[monthZeroBased]} de ${year}`;

      return {
        key,
        ymCode,
        name: ymCode,
        shortLabel,
        monthName: MONTH_NAMES_FULL[monthZeroBased],
        year,
        fullName: `${fullLabel} (${ymCode})`,
        valor: stats.valor,
        count: stats.count,
        barColor: barColors[index],
        isTargetMonth: index === 5,
      };
    });
  }, [filteredBaseItems, items, selectedYearMonth, selectedData]);

  const totalSixMonths = useMemo(() => {
    return chartData.reduce((acc, it) => acc + it.valor, 0);
  }, [chartData]);

  const maxValor = useMemo(() => {
    const max = Math.max(...chartData.map((d) => d.valor));
    return max > 0 ? max : 100;
  }, [chartData]);

  const subtitleText = useMemo(() => {
    const ymList = chartData.map((m) => m.ymCode).join(', ');
    if (activeFilters.length > 0) {
      const filterSummary = activeFilters.map((f) => `${f.label}: ${f.value}`).join(' • ');
      return `Exibindo ${ymList} • Sincronizado com ${filterSummary}`;
    }
    return `Exibindo ${ymList} • Total mensal de compras`;
  }, [chartData, activeFilters]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Comparativo dos Últimos 6 Meses
              </h3>
              {activeFilters.map((filter, idx) => (
                <span
                  key={`filter-badge-${idx}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border ${filter.color}`}
                >
                  <Filter className="w-3 h-3" />
                  {filter.label}: {filter.value}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {subtitleText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Total Semestre:
          </span>
          <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
            {formatBRL(totalSixMonths)}
          </span>
        </div>
      </div>

      {/* Bar Chart Canvas */}
      <div className="pt-2">
        <div className="h-[250px] sm:h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 15, left: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#94a3b8"
                opacity={0.2}
              />
              <XAxis
                dataKey="ymCode"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                domain={[0, Math.ceil(maxValor * 1.15)]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={(val) => `R$ ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`}
              />
              <Bar
                dataKey="valor"
                radius={[8, 8, 0, 0]}
                maxBarSize={64}
                isAnimationActive={false}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`bar-cell-${index}`}
                    fill={entry.barColor}
                    className="outline-none"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 6 Months Summary Cards Below Chart */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 pt-1">
        {chartData.map((month) => (
          <div
            key={month.key}
            className={`p-2.5 sm:p-3 rounded-2xl border transition-all text-center sm:text-left ${
              month.isTargetMonth
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/80 shadow-xs'
                : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1 justify-center sm:justify-start">
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                  {month.ymCode}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden xl:inline">
                  ({month.shortLabel})
                </span>
              </div>
              {month.isTargetMonth && (
                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-600 text-white self-center sm:self-auto">
                  {activeFilters.length > 0 ? 'Filtro' : 'Atual'}
                </span>
              )}
            </div>
            <div className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white">
              {formatBRL(month.valor)}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {month.count} {month.count === 1 ? 'item' : 'itens'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
