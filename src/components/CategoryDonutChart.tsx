import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { PieChart as PieChartIcon, Tag } from 'lucide-react';
import { formatBRL } from '../utils/nfceParser';

export interface CategoryDataPoint {
  name: string;
  shortName: string;
  value: number;
  percent: number;
  count: number;
  color: string;
  fill: string;
}

export interface CategoryDonutChartProps {
  data: CategoryDataPoint[];
  totalValor: number;
  title?: string;
  subtitle?: string;
}

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  data,
  totalValor,
  title = 'Gasto Total por Categoria',
  subtitle = 'Distribuição das despesas por tipo de produto',
}) => {
  const chartData = React.useMemo(() => {
    return data.filter((d) => d.value > 0);
  }, [data]);

  const hasData = chartData.length > 0 && totalValor > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
            <PieChartIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Total Geral:
          </span>
          <span className="text-sm font-black font-mono text-slate-900 dark:text-white px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {formatBRL(totalValor)}
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400">
          <PieChartIcon className="w-10 h-10 mb-2 opacity-30 stroke-[1.5]" />
          <p className="text-xs font-semibold">Nenhum gasto registrado para os filtros selecionados.</p>
          <p className="text-[11px] text-slate-400">Selecione outro período ou remova os filtros para visualizar o gráfico.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Donut Chart Canvas */}
          <div className="lg:col-span-6 relative flex items-center justify-center min-h-[260px] sm:min-h-[290px]">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="62%"
                  outerRadius="88%"
                  paddingAngle={3}
                  cornerRadius={6}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.name}-${index}`}
                      fill={entry.fill || entry.color}
                      className="outline-none"
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Central KPI Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Total
              </span>
              <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white tracking-tight">
                {formatBRL(totalValor)}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                {chartData.reduce((acc, it) => acc + it.count, 0)} itens
              </span>
            </div>
          </div>

          {/* Interactive Category Breakdown / Legend */}
          <div className="lg:col-span-6 space-y-2.5">
            {chartData.map((item) => (
              <div
                key={item.name}
                className="p-3 sm:p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 transition-all flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    className="w-3.5 h-3.5 rounded-lg shrink-0 shadow-xs"
                    style={{ backgroundColor: item.fill || item.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.count} {item.count === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-right">
                  <div>
                    <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      {formatBRL(item.value)}
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400">
                      {item.percent.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
