import React, { useMemo, useState } from 'react';
import { BarChart3, PieChart, Calendar, Layers } from 'lucide-react';
import { formatBRL } from '../utils/nfceParser';
import { NFCeItem } from '../types';
import { MatrixGroup } from './ReportMatrixView';
import { CategoryDonutChart, CategoryDataPoint } from './CategoryDonutChart';
import { MonthlyExpenditureBarChart } from './MonthlyExpenditureBarChart';
import { TipoExpenditureBarChart } from './TipoExpenditureBarChart';

export interface ReportChartsViewProps {
  matrixData: MatrixGroup[];
  globalTotalValor: number;
  items?: NFCeItem[];
  filteredItems?: NFCeItem[];
  selectedYearMonth?: string | null;
  selectedTipo?: string | null;
  selectedProduto?: string | null;
  selectedData?: string | null;
  searchQuery?: string;
  onSelectTipo?: (tipo: string | null) => void;
}

export const ReportChartsView: React.FC<ReportChartsViewProps> = ({
  matrixData,
  globalTotalValor,
  items = [],
  filteredItems,
  selectedYearMonth,
  selectedTipo,
  selectedProduto,
  selectedData,
  searchQuery,
  onSelectTipo,
}) => {
  // Active chart tab filter: 'all' | 'tipo' | 'donut' | 'monthly'
  const [activeChartSection, setActiveChartSection] = useState<'all' | 'tipo' | 'donut' | 'monthly'>('all');

  // Items to use for the Tipo Bar Chart (prefer filteredItems if available, otherwise items)
  const chartItems = filteredItems || items;

  // Map matrixData groups to Donut Chart data points
  const categoryDonutData: CategoryDataPoint[] = useMemo(() => {
    return matrixData.map((group) => {
      let color = '#10b981'; // emerald default for Alimentação
      if (group.iconType === 'hygiene' || group.tipo.toLowerCase().includes('higien')) {
        color = '#0284c7'; // sky
      } else if (group.iconType === 'cleaning' || group.tipo.toLowerCase().includes('limp')) {
        color = '#f59e0b'; // amber
      } else if (group.tipo === 'Outros') {
        color = '#8b5cf6'; // purple
      }

      return {
        name: group.tipo,
        shortName: group.shortName,
        value: group.totalValor,
        percent: group.percent,
        count: group.itemCount,
        color,
        fill: color,
      };
    });
  }, [matrixData]);

  // Top Subcategories by expenditure
  const topProducts = useMemo(() => {
    const allRows = matrixData.flatMap((g) =>
      g.rows.map((r) => ({
        ...r,
        tipo: g.tipo,
        shortTipo: g.shortName,
        iconType: g.iconType,
      }))
    );
    return allRows
      .filter((r) => r.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [matrixData]);

  const maxProdValor = topProducts.length > 0 ? topProducts[0].valor : 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* SECTION SELECTOR PILLS */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <button
            type="button"
            onClick={() => setActiveChartSection('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeChartSection === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Visão Completa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveChartSection('tipo')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeChartSection === 'tipo'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Barras por Tipo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveChartSection('donut')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeChartSection === 'donut'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <PieChart className="w-3.5 h-3.5 text-sky-400" />
            <span>Rosca por Categoria</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveChartSection('monthly')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeChartSection === 'monthly'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>Evolução Mensal</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono px-2 hidden sm:block">
          Total apurado: <strong className="text-slate-900 dark:text-white">{formatBRL(globalTotalValor)}</strong>
        </div>
      </div>

      {/* 1. RECHARTS BAR CHART: Gasto Total Agrupado por Tipo (Highest to Lowest) */}
      {(activeChartSection === 'all' || activeChartSection === 'tipo') && (
        <TipoExpenditureBarChart
          items={chartItems}
          totalValor={globalTotalValor}
          selectedTipo={selectedTipo}
          onSelectTipo={onSelectTipo}
          title="Gasto Total por Tipo de Produto (Recharts)"
          subtitle="Gráfico de barras agrupado por Tipo para identificar rapidamente onde você mais gasta"
        />
      )}

      {/* 2. RECHARTS DONUT CHART: Categoria e Distribuição Proporcional */}
      {(activeChartSection === 'all' || activeChartSection === 'donut') && (
        <CategoryDonutChart
          data={categoryDonutData}
          totalValor={globalTotalValor}
          title="Gasto Total por Categoria"
          subtitle="Distribuição proporcional em gráfico de rosca (Alimentação, Higiene, Limpeza)"
        />
      )}

      {/* 3. Top 10 Subcategories Ranking */}
      {(activeChartSection === 'all' || activeChartSection === 'tipo' || activeChartSection === 'donut') && (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                Ranking de Gastos por Subcategoria (Top 10)
              </h4>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium font-mono">
              Total base: {formatBRL(globalTotalValor)}
            </span>
          </div>

          {topProducts.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-6 text-center">
              Nenhum dado financeiro para o período/filtro selecionado.
            </p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((p, idx) => {
                const relativeBarPercent = (p.valor / maxProdValor) * 100;
                return (
                  <div key={`${p.tipo}-${p.rawProdName}`} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="font-mono text-slate-400 w-4 font-bold text-[11px] shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 capitalize truncate text-xs sm:text-sm">
                          {p.produtoName}
                        </span>
                        <span className="text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                          {p.shortTipo}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <span className="font-black text-slate-900 dark:text-slate-100 font-mono text-xs sm:text-sm">
                          {formatBRL(p.valor)}
                        </span>
                        <span className="text-slate-400 text-[10px] sm:text-[11px] font-mono w-10 sm:w-12 text-right">
                          {p.percent.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Relative bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          p.iconType === 'food'
                            ? 'bg-emerald-500'
                            : p.iconType === 'hygiene'
                            ? 'bg-sky-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, relativeBarPercent))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer Summary Info */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            <span>
              Representatividade apurada sobre <strong className="text-slate-800 dark:text-slate-200 font-mono">{formatBRL(globalTotalValor)}</strong>
            </span>
            <span className="font-semibold">
              {matrixData.reduce((acc, g) => acc + g.itemCount, 0)} itens apurados
            </span>
          </div>
        </div>
      )}

      {/* 4. RECHARTS BAR CHART: Comparativo Histórico Mensal */}
      {(activeChartSection === 'all' || activeChartSection === 'monthly') && (
        <MonthlyExpenditureBarChart
          items={items}
          selectedYearMonth={selectedYearMonth}
          selectedTipo={selectedTipo}
          selectedProduto={selectedProduto}
          selectedData={selectedData}
          searchQuery={searchQuery}
        />
      )}
    </div>
  );
};
