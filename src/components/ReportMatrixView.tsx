import React from 'react';
import { Filter } from 'lucide-react';
import { formatBRL } from '../utils/nfceParser';

export interface MatrixRow {
  produtoName: string;
  rawProdName: string;
  valor: number;
  percent: number;
  quantidadeFormatted: string;
  precoUnitarioFormatted: string;
  count: number;
}

export interface MatrixGroup {
  tipo: string;
  shortName: string;
  colorTheme: {
    bgRow: string;
    border: string;
    accent: string;
    text: string;
  };
  iconType: 'food' | 'hygiene' | 'cleaning';
  products: string[];
  totalValor: number;
  percent: number;
  itemCount: number;
  rows: MatrixRow[];
}

export interface ReportMatrixViewProps {
  matrixData: MatrixGroup[];
  totalItensCount: number;
  hasActiveFilters: boolean;
  globalTotalValor: number;
}

export const ReportMatrixView: React.FC<ReportMatrixViewProps> = ({
  matrixData,
  totalItensCount,
  hasActiveFilters,
  globalTotalValor,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
      {/* Header Bar */}
      <div className="p-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>Relatório Consolidado de Gastos por Categoria</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {totalItensCount} {totalItensCount === 1 ? 'item' : 'itens'}
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
                                    {/* Spray bottle */}
                                    <path d="M16 28h18v26a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V28z" />
                                    <path d="M22 28v-8h6v8M28 20h8l-2 4h-6M18 18h8" />
                                    {/* Broom/brush */}
                                    <path d="M44 14l10 32M44 46l8 8" />
                                  </svg>
                                )}
                              </div>

                              {/* Category Name Block */}
                              <div className="text-xs font-black uppercase text-slate-800 dark:text-slate-200">
                                {group.shortName}
                              </div>

                              {/* Total R$ box */}
                              <div className="w-full bg-[#fce4d6] dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-md py-0.5 px-2 text-center text-xs font-extrabold text-amber-950 dark:text-amber-200">
                                {formatBRL(group.totalValor)}
                              </div>

                              {/* % of total box */}
                              <div className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md py-0.5 px-2 text-center text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                {group.percent.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 1,
                                  maximumFractionDigits: 1
                                })}%
                              </div>
                            </div>
                          </td>
                        )}

                        {/* Column 2: Produto */}
                        <td className="py-2.5 px-4 text-xs font-bold text-slate-800 dark:text-slate-200 border-r border-slate-300/40 dark:border-slate-700/40">
                          {row.produtoName}
                        </td>

                        {/* Column 3: R$ */}
                        <td className="py-2.5 px-4 text-xs font-black text-right text-slate-900 dark:text-slate-100 border-r border-slate-300/40 dark:border-slate-700/40">
                          {row.valor > 0 ? formatBRL(row.valor) : '-'}
                        </td>

                        {/* Column 4: % */}
                        <td className="py-2.5 px-4 text-xs font-medium text-right text-slate-700 dark:text-slate-300 border-r border-slate-300/40 dark:border-slate-700/40">
                          {row.valor > 0
                            ? `${row.percent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                            : '-'}
                        </td>

                        {/* Column 5: Quantidade */}
                        <td className="py-2.5 px-4 text-xs font-semibold text-right text-slate-700 dark:text-slate-300 border-r border-slate-300/40 dark:border-slate-700/40">
                          {row.quantidadeFormatted}
                        </td>

                        {/* Column 6: R$/Quantid. */}
                        <td className="py-2.5 px-4 text-xs font-semibold text-right text-slate-700 dark:text-slate-300">
                          {row.precoUnitarioFormatted}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>

          {/* Table Footer - Grand Total */}
          <tfoot>
            <tr className="bg-slate-300/80 dark:bg-slate-800 font-black text-xs text-slate-900 dark:text-white border-t-2 border-slate-400 dark:border-slate-600">
              <td colSpan={2} className="py-3 px-4 uppercase tracking-wider text-right">
                Total Geral Consolidado:
              </td>
              <td className="py-3 px-4 text-right text-sm text-emerald-800 dark:text-emerald-300 font-black">
                {formatBRL(globalTotalValor)}
              </td>
              <td className="py-3 px-4 text-right">100,0%</td>
              <td colSpan={2} className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 font-normal">
                {totalItensCount} itens apurados
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
