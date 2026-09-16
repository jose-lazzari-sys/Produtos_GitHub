import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Award,
  DollarSign,
  Percent,
  Layers,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { NFCeItem } from '../types';
import { formatBRL } from '../utils/nfceParser';
import { normalizeTipo } from './ReportTable';

export interface TipoDataPoint {
  tipo: string;
  displayName: string;
  valor: number;
  percent: number;
  itemCount: number;
  ticketMedio: number;
  color: string;
  hoverColor: string;
  bgLight: string;
  textLight: string;
  isTop: boolean;
  rank: number;
}

export interface TipoExpenditureBarChartProps {
  items: NFCeItem[];
  totalValor?: number;
  title?: string;
  subtitle?: string;
  selectedTipo?: string | null;
  onSelectTipo?: (tipo: string | null) => void;
}

const TIPO_COLORS: Record<
  string,
  { color: string; hoverColor: string; bgLight: string; textLight: string }
> = {
  Alimentação: {
    color: '#10b981',
    hoverColor: '#059669',
    bgLight: 'bg-emerald-50 dark:bg-emerald-950/40',
    textLight: 'text-emerald-700 dark:text-emerald-300',
  },
  'Higiene Pessoal': {
    color: '#0284c7',
    hoverColor: '#0369a1',
    bgLight: 'bg-sky-50 dark:bg-sky-950/40',
    textLight: 'text-sky-700 dark:text-sky-300',
  },
  'Limpeza Doméstica': {
    color: '#f59e0b',
    hoverColor: '#d97706',
    bgLight: 'bg-amber-50 dark:bg-amber-950/40',
    textLight: 'text-amber-700 dark:text-amber-300',
  },
  Outros: {
    color: '#8b5cf6',
    hoverColor: '#7c3aed',
    bgLight: 'bg-purple-50 dark:bg-purple-950/40',
    textLight: 'text-purple-700 dark:text-purple-300',
  },
};

export const TipoExpenditureBarChart: React.FC<TipoExpenditureBarChartProps> = ({
  items,
  totalValor: explicitTotalValor,
  title = 'Gasto Total por Tipo de Produto',
  subtitle = 'Comparativo de despesas agrupadas por Tipo com identificação do maior impacto financeiro',
  selectedTipo,
  onSelectTipo,
}) => {
  // Toggle display metric: 'valor' (R$) vs 'percent' (%)
  const [metricMode, setMetricMode] = useState<'valor' | 'percent'>('valor');

  // Group items by normalized Tipo and compute expenditure
  const { chartData, computedTotalValor, topTipo } = useMemo(() => {
    const tipoMap = new Map<string, { totalValor: number; itemCount: number }>();
    let total = 0;

    items.forEach((item) => {
      const t = normalizeTipo(item.tipo) || 'Outros';
      const valor = Number(item.valorTotal) || 0;
      total += valor;

      const current = tipoMap.get(t) || { totalValor: 0, itemCount: 0 };
      current.totalValor += valor;
      current.itemCount += 1;
      tipoMap.set(t, current);
    });

    const finalTotal = explicitTotalValor !== undefined && explicitTotalValor > 0
      ? explicitTotalValor
      : total > 0
      ? total
      : 1;

    // Convert map to sorted array (highest spend first to quickly see where the user spends most)
    const sorted = Array.from(tipoMap.entries())
      .map(([tipo, data]) => {
        const theme = TIPO_COLORS[tipo] || {
          color: '#64748b',
          hoverColor: '#475569',
          bgLight: 'bg-slate-50 dark:bg-slate-800',
          textLight: 'text-slate-700 dark:text-slate-300',
        };

        const percent = finalTotal > 0 ? (data.totalValor / finalTotal) * 100 : 0;
        const ticketMedio = data.itemCount > 0 ? data.totalValor / data.itemCount : 0;

        return {
          tipo,
          displayName: tipo,
          valor: data.totalValor,
          percent,
          itemCount: data.itemCount,
          ticketMedio,
          color: theme.color,
          hoverColor: theme.hoverColor,
          bgLight: theme.bgLight,
          textLight: theme.textLight,
          isTop: false,
          rank: 0,
        };
      })
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);

    // Assign ranks
    sorted.forEach((item, index) => {
      item.rank = index + 1;
      item.isTop = index === 0;
    });

    return {
      chartData: sorted,
      computedTotalValor: total,
      topTipo: sorted.length > 0 ? sorted[0] : null,
    };
  }, [items, explicitTotalValor]);

  const hasData = chartData.length > 0 && computedTotalValor > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shadow-xs shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {title}
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                recharts
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          </div>
        </div>

        {/* METRIC MODE TOGGLE & TOTAL BADGE */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Toggle R$ vs % */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setMetricMode('valor')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                metricMode === 'valor'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Exibir valores em Reais (R$)"
            >
              <DollarSign className="w-3 h-3" />
              <span>R$</span>
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('percent')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                metricMode === 'percent'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Exibir valores em Porcentagem (%)"
            >
              <Percent className="w-3 h-3" />
              <span>%</span>
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total:</span>
            <span className="text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white">
              {formatBRL(computedTotalValor)}
            </span>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="h-60 flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
          <BarChart3 className="w-10 h-10 opacity-30 stroke-[1.5]" />
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Nenhum dado financeiro encontrado para os filtros ativos.
          </p>
          <p className="text-[11px] text-slate-400">
            Selecione outro período ou limpe os filtros para visualizar a distribuição dos gastos.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* HIGHLIGHT CALLOUT: "O MAIOR GASTO" */}
          {topTipo && (
            <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-sky-500/5 to-amber-500/5 dark:from-emerald-950/40 dark:via-sky-950/20 dark:to-amber-950/20 border border-emerald-500/30 dark:border-emerald-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Maior Gasto Detectado
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                      #1 do Ranking
                    </span>
                  </div>
                  <h4 className="text-base font-black text-slate-900 dark:text-white">
                    {topTipo.displayName}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto font-mono">
                <div className="text-right">
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    {formatBRL(topTipo.valor)}
                  </div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                    {topTipo.percent.toFixed(1)}% do orçamento total
                  </div>
                </div>
                <div className="text-right border-l border-slate-200 dark:border-slate-700 pl-3">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {topTipo.itemCount} itens
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Méd. {formatBRL(topTipo.ticketMedio)}/item
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RECHARTS HORIZONTAL BAR CHART */}
          <div className="w-full">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span className="font-semibold flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Gasto Agrupado por Tipo (ordenado do maior para o menor)
              </span>
              <span className="text-[11px] font-mono">
                {metricMode === 'valor' ? 'Valores em R$' : 'Representatividade percentual (%)'}
              </span>
            </div>

            {/* Responsive Container for Recharts */}
            <div
              className="w-full relative"
              style={{ height: Math.max(220, chartData.length * 60 + 50) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 10, right: 90, left: 10, bottom: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    opacity={0.15}
                    stroke="#94a3b8"
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v) =>
                      metricMode === 'valor' ? formatBRL(v) : `${Number(v).toFixed(0)}%`
                    }
                    domain={metricMode === 'percent' ? [0, 100] : [0, 'auto']}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    dataKey="displayName"
                    type="category"
                    width={130}
                    tick={{ fontSize: 12, fontWeight: 700, fill: '#334155' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <Bar
                    dataKey={metricMode === 'valor' ? 'valor' : 'percent'}
                    radius={[0, 8, 8, 0]}
                    barSize={28}
                    onClick={(entry: unknown) => {
                      const item = entry as { payload?: TipoDataPoint; tipo?: string };
                      const clickedTipo = item?.payload?.tipo || item?.tipo;
                      if (onSelectTipo && clickedTipo) {
                        onSelectTipo(selectedTipo === clickedTipo ? null : clickedTipo);
                      }
                    }}
                    className={onSelectTipo ? 'cursor-pointer' : ''}
                  >
                    {chartData.map((entry) => {
                      const isSelected = selectedTipo === entry.tipo;
                      return (
                        <Cell
                          key={`bar-${entry.tipo}`}
                          fill={entry.color}
                          stroke={isSelected ? '#0f172a' : 'transparent'}
                          strokeWidth={isSelected ? 2 : 0}
                          className="transition-all duration-300 hover:opacity-85"
                        />
                      );
                    })}
                    <LabelList
                      dataKey={metricMode === 'valor' ? 'valor' : 'percent'}
                      position="right"
                      formatter={(val: unknown) => {
                        const num = Number(val) || 0;
                        return metricMode === 'valor'
                          ? formatBRL(num)
                          : `${num.toFixed(1)}%`;
                      }}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        fill: '#334155',
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* DETAILED CATEGORY CARDS / BREAKDOWN GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-2">
            {chartData.map((cat) => {
              const isSelected = selectedTipo === cat.tipo;
              return (
                <div
                  key={`card-${cat.tipo}`}
                  onClick={() => {
                    if (onSelectTipo) {
                      onSelectTipo(isSelected ? null : cat.tipo);
                    }
                  }}
                  className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                    isSelected
                      ? 'border-slate-900 dark:border-white ring-2 ring-emerald-500/50 bg-slate-50 dark:bg-slate-800/80 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700'
                  } ${onSelectTipo ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 truncate">
                        {cat.displayName}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                      #{cat.rank}
                    </span>
                  </div>

                  {/* Relative bar representation */}
                  <div className="w-full bg-slate-200/70 dark:bg-slate-700/60 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, cat.percent))}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      {formatBRL(cat.valor)}
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {cat.percent.toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <span>
                      {cat.itemCount} {cat.itemCount === 1 ? 'item' : 'itens'}
                    </span>
                    <span>Méd: {formatBRL(cat.ticketMedio)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* FOOTER SUMMARY & USER GUIDANCE */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>
                Total apurado: <strong className="font-mono text-slate-800 dark:text-slate-200">{formatBRL(computedTotalValor)}</strong> distribuído em {chartData.length} {chartData.length === 1 ? 'tipo' : 'tipos'}
              </span>
            </span>
            <span className="italic">
              {topTipo
                ? `O tipo com maior despesa (${topTipo.displayName}) consome ${topTipo.percent.toFixed(1)}% do orçamento.`
                : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
