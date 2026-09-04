import React from 'react';
import {
  Calendar,
  Layers,
  ShoppingBag,
  RotateCcw,
  Check
} from 'lucide-react';
import { formatBRL } from '../utils/nfceParser';

export interface SlicerMetrics {
  totalValor: number;
  totalKg: number;
  precoMedioKg: number;
  onlyAlimentacao?: boolean;
}

export interface ReportSlicersProps {
  availableYearMonths: { ym: string; count: number }[];
  selectedYearMonth: string | null;
  onSelectYearMonth: (ym: string | null) => void;

  availableTipos: { tipo: string; count: number }[];
  selectedTipo: string | null;
  onSelectTipo: (tipo: string | null) => void;

  availableProdutos: { prod: string; count: number }[];
  selectedProduto: string | null;
  onSelectProduto: (prod: string | null) => void;

  availableDatas: { dt: string; count: number; timestamp: number }[];
  selectedData: string | null;
  onSelectData: (dt: string | null) => void;

  metrics: SlicerMetrics;
}

export const ReportSlicers: React.FC<ReportSlicersProps> = ({
  availableYearMonths,
  selectedYearMonth,
  onSelectYearMonth,
  availableTipos,
  selectedTipo,
  onSelectTipo,
  availableProdutos,
  selectedProduto,
  onSelectProduto,
  availableDatas,
  selectedData,
  onSelectData,
  metrics,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
      {/* SLICER 1: ano-mês */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-300/80 dark:border-sky-800 shadow-sm p-3 flex flex-col h-[340px]">
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
              onClick={() => onSelectYearMonth(null)}
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
                  onClick={() => onSelectYearMonth(isSelected ? null : ym)}
                  className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between border cursor-pointer ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-700 shadow-md font-black scale-[1.01]'
                      : 'bg-[#b8cce4]/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-sky-200/70 dark:border-slate-700 hover:bg-[#a8c0dc] dark:hover:bg-slate-750'
                  }`}
                >
                  <span>{ym}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isSelected
                          ? 'bg-sky-700 text-sky-100'
                          : 'bg-white/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
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

      {/* SLICER 2: TIPO + 3 KPIS BELOW */}
      <div className="space-y-3">
        {/* TIPO Filter Box */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-300/80 dark:border-sky-800 shadow-sm p-3 flex flex-col h-[180px]">
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
                onClick={() => onSelectTipo(null)}
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
                    onClick={() => onSelectTipo(isSelected ? null : tipo)}
                    className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between border cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-700 shadow-md font-black scale-[1.01]'
                        : 'bg-[#b8cce4]/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-sky-200/70 dark:border-slate-700 hover:bg-[#a8c0dc] dark:hover:bg-slate-750'
                    }`}
                  >
                    <span>{tipo}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                          isSelected
                            ? 'bg-sky-700 text-sky-100'
                            : 'bg-white/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
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

        {/* 3 BEVELED METRIC CARDS (FIGURA 1) */}
        <div className="space-y-1.5">
          {/* Card 1: Total Gasto */}
          <div className="p-2 px-3 rounded-xl bg-[#e9e9e0] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.1)] text-center">
            <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
              Total Gasto
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white tracking-tight">
              {formatBRL(metrics.totalValor)}
            </span>
          </div>

          {/* Card 2: Total Kg */}
          <div className="p-1.5 px-3 rounded-xl bg-[#e9e9e0] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.1)] text-center">
            <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
              Peso Alimentação
            </span>
            <span
              className="text-sm font-black text-slate-900 dark:text-white"
              title={metrics.onlyAlimentacao && metrics.totalKg > 0 ? `${metrics.totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} Kg` : undefined}
            >
              {metrics.onlyAlimentacao
                ? (metrics.totalKg > 0
                    ? `${metrics.totalKg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Kg`
                    : '0,0 Kg')
                : '-'}
            </span>
          </div>

          {/* Card 3: R$/Kg */}
          <div className="p-1.5 px-3 rounded-xl bg-[#e9e9e0] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.1)] text-center">
            <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
              Preço Médio Kg
            </span>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              {metrics.onlyAlimentacao
                ? (metrics.precoMedioKg > 0
                    ? `${metrics.precoMedioKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R$/Kg`
                    : '0,00 R$/Kg')
                : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* SLICER 3: PRODUTO */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-300/80 dark:border-sky-800 shadow-sm p-3 flex flex-col h-[340px]">
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
              onClick={() => onSelectProduto(null)}
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
                  onClick={() => onSelectProduto(isSelected ? null : prod)}
                  className={`w-full py-1.5 px-3 rounded-xl text-xs font-semibold transition-all text-left flex items-center justify-between border cursor-pointer capitalize ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-700 shadow-md font-black scale-[1.01]'
                      : 'bg-[#b8cce4]/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-sky-200/70 dark:border-slate-700 hover:bg-[#a8c0dc] dark:hover:bg-slate-750'
                  }`}
                >
                  <span className="truncate">{prod}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isSelected
                          ? 'bg-sky-700 text-sky-100'
                          : 'bg-white/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-300/80 dark:border-sky-800 shadow-sm p-3 flex flex-col h-[340px]">
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
              onClick={() => onSelectData(null)}
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
                  onClick={() => onSelectData(isSelected ? null : dt)}
                  className={`w-full py-1.5 px-3 rounded-xl text-xs font-medium font-mono transition-all text-left flex items-center justify-between border cursor-pointer ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-700 shadow-md font-bold scale-[1.01]'
                      : 'bg-[#b8cce4]/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-sky-200/70 dark:border-slate-700 hover:bg-[#a8c0dc] dark:hover:bg-slate-750'
                  }`}
                >
                  <span className="truncate">{dt}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                        isSelected
                          ? 'bg-sky-700 text-sky-100'
                          : 'bg-white/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
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
  );
};
