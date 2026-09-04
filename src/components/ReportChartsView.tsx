import React, { useMemo } from 'react';
import { TrendingUp, PieChart, BarChart3 } from 'lucide-react';
import { formatBRL } from '../utils/nfceParser';
import { MatrixGroup } from './ReportMatrixView';

export interface ReportChartsViewProps {
  matrixData: MatrixGroup[];
  globalTotalValor: number;
}

export const ReportChartsView: React.FC<ReportChartsViewProps> = ({
  matrixData,
  globalTotalValor,
}) => {
  // Top 8 Subcategories by expenditure
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
    <div className="space-y-6">
      {/* 3 Category Cards with Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {matrixData.map((group) => (
          <div
            key={group.tipo}
            className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-slate-500" />
                <span>{group.shortName}</span>
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
                className={`h-full rounded-full transition-all duration-500 ${
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

      {/* Top 10 Subcategories Ranking */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            <h4 className="text-sm font-black text-slate-900 dark:text-white">
              Ranking de Gastos por Subcategoria (Top 10)
            </h4>
          </div>
          <span className="text-xs text-slate-400">
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
                <div key={`${p.tipo}-${p.rawProdName}`} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400 w-4 font-bold text-[11px]">
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 capitalize">
                        {p.produtoName}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {p.shortTipo}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-slate-900 dark:text-slate-100 font-mono">
                        {formatBRL(p.valor)}
                      </span>
                      <span className="text-slate-400 text-[11px] font-mono w-12 text-right">
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
      </div>
    </div>
  );
};
