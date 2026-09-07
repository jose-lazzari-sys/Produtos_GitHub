import React, { useState, useRef, useMemo } from 'react';
import {
  Calendar,
  Layers,
  ShoppingBag,
  RotateCcw,
  Check,
  ChevronDown
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

export interface SlicerOption {
  id: string;
  label: string;
  count: number;
}

export interface SlicerBoxProps {
  title: string;
  icon: React.ReactNode;
  options: SlicerOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  capitalizeOptions?: boolean;
  monoFont?: boolean;
  className?: string;
  heightClass?: string;
  id?: string;
}

export const SlicerBox: React.FC<SlicerBoxProps> = ({
  title,
  icon,
  options,
  selectedId,
  onSelect,
  capitalizeOptions = false,
  monoFont = false,
  className = '',
  heightClass = 'h-[96px]',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = useMemo(() => {
    if (!selectedId) return null;
    return (
      options.find((o) => o.id.toLowerCase() === selectedId.toLowerCase()) || {
        id: selectedId,
        label: selectedId,
        count: 0
      }
    );
  }, [options, selectedId]);

  const handleToggleClick = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <div
      id={id}
      className={`relative w-full ${heightClass} ${className}`}
    >
      {/* RESTING CARD (Always in the layout flow so no layout shifting occurs) */}
      <div
        onClick={handleToggleClick}
        className="w-full h-full bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-300/80 dark:border-sky-800 shadow-xs p-2.5 flex flex-col justify-between cursor-pointer transition-all hover:border-sky-400 hover:shadow-sm"
      >
        {/* Top Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {selectedId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(null);
                  setIsOpen(false);
                }}
                className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition-colors cursor-pointer"
                title="Limpar seleção"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                isOpen ? 'rotate-180 text-sky-500' : ''
              }`}
            />
          </div>
        </div>

        {/* Bottom Content Row */}
        <div>
          {selectedId ? (
            <div className="w-full py-1 px-2.5 rounded-xl text-xs font-black bg-sky-600 text-white border border-sky-700 shadow-xs flex items-center justify-between">
              <span
                className={`truncate ${capitalizeOptions ? 'capitalize' : ''} ${
                  monoFont ? 'font-mono' : ''
                }`}
              >
                {selectedOption?.label || selectedId}
              </span>
              <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                {selectedOption && selectedOption.count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md font-mono bg-sky-700 text-sky-100">
                    {selectedOption.count}
                  </span>
                )}
                <Check className="w-3.5 h-3.5 text-white shrink-0" />
              </div>
            </div>
          ) : (
            <div className="w-full py-1 px-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-between">
              <span className="truncate italic">Nenhum item selecionado</span>
              <span className="text-[9px] uppercase font-bold text-sky-600 dark:text-sky-400 tracking-wider shrink-0 ml-1">
                Clique para filtrar
              </span>
            </div>
          )}
        </div>
      </div>

      {/* EXPANDED CLICK POPUP (Positioned absolutely so it floats over content without layout shift) */}
      {isOpen && (
        <>
          {/* Backdrop to dismiss by clicking anywhere outside */}
          <div
            className="fixed inset-0 z-30"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div className="absolute top-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 rounded-2xl border-2 border-sky-500 dark:border-sky-400 shadow-2xl p-2.5 flex flex-col max-h-72 min-h-[150px] animate-in fade-in zoom-in-95 duration-100">
            {/* Header in Popover */}
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-sky-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-1.5">
                {icon}
                <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  {title}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 font-bold ml-1">
                  {options.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {selectedId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(null);
                      setIsOpen(false);
                    }}
                    className="text-xs text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 font-bold flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                    title="Limpar seleção"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Limpar</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                  title="Fechar"
                >
                  <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                </button>
              </div>
            </div>

            {/* Scrollable list of selectable items */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
              {options.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  Nenhuma opção disponível
                </p>
              ) : (
                options.map((opt) => {
                  const isSelected =
                    selectedId?.toLowerCase() === opt.id.toLowerCase();
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onSelect(isSelected ? null : opt.id);
                        setIsOpen(false);
                      }}
                      className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between border cursor-pointer ${
                        isSelected
                          ? 'bg-sky-600 text-white border-sky-700 shadow-md font-black scale-[1.01]'
                          : 'bg-[#b8cce4]/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-sky-200/70 dark:border-slate-700 hover:bg-[#a8c0dc] dark:hover:bg-slate-750'
                      }`}
                    >
                      <span
                        className={`truncate ${
                          capitalizeOptions ? 'capitalize' : ''
                        } ${monoFont ? 'font-mono' : ''}`}
                      >
                        {opt.label}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                            isSelected
                              ? 'bg-sky-700 text-sky-100'
                              : 'bg-white/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {opt.count}
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-white shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const HoverSlicerBox = SlicerBox;

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
    <div className="flex flex-col lg:flex-row items-stretch gap-3">
      {/* LEFT COLUMN: 3 BEVELED METRIC CARDS (FIGURA 1) */}
      <div className="w-full lg:w-60 xl:w-64 shrink-0 grid grid-cols-3 lg:flex lg:flex-col lg:justify-between gap-1.5 sm:gap-2">
        {/* Card 1: Total Gasto */}
        <div className="p-1.5 sm:p-2 px-2 sm:px-3 rounded-2xl bg-[#e9e9e0] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.1)] text-center flex-1 flex flex-col justify-center">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider truncate">
            Total Gasto
          </span>
          <span className="text-xs sm:text-base lg:text-lg font-black text-slate-900 dark:text-white tracking-tight font-mono">
            {formatBRL(metrics.totalValor)}
          </span>
        </div>

        {/* Card 2: Peso Alimentação */}
        <div className="p-1.5 sm:p-2 px-2 sm:px-3 rounded-2xl bg-[#e9e9e0] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.1)] text-center flex-1 flex flex-col justify-center">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider truncate">
            Peso Alim.
          </span>
          <span
            className="text-xs sm:text-sm lg:text-base font-black text-slate-900 dark:text-white font-mono"
            title={
              metrics.onlyAlimentacao && metrics.totalKg > 0
                ? `${metrics.totalKg.toLocaleString('pt-BR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 3
                  })} Kg`
                : undefined
            }
          >
            {metrics.onlyAlimentacao
              ? metrics.totalKg > 0
                ? `${metrics.totalKg.toLocaleString('pt-BR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1
                  })} Kg`
                : '0,0 Kg'
              : '-'}
          </span>
        </div>

        {/* Card 3: Preço Médio Kg */}
        <div className="p-1.5 sm:p-2 px-2 sm:px-3 rounded-2xl bg-[#e9e9e0] dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.1)] text-center flex-1 flex flex-col justify-center">
          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider truncate">
            Médio/Kg
          </span>
          <span className="text-xs sm:text-sm lg:text-base font-black text-slate-900 dark:text-white font-mono">
            {metrics.onlyAlimentacao
              ? metrics.precoMedioKg > 0
                ? `${metrics.precoMedioKg.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })} R$/Kg`
                : '0,00 R$/Kg'
              : '-'}
          </span>
        </div>
      </div>

      {/* RIGHT SECTION: 2x2 GRID OF SLICER BOXES (ANO-MÊS, TIPO / DATA, PRODUTO) */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Row 1, Col 1: ANO-MÊS */}
        <HoverSlicerBox
          title="ANO-MÊS"
          icon={<Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />}
          options={availableYearMonths.map((y) => ({
            id: y.ym,
            label: y.ym,
            count: y.count
          }))}
          selectedId={selectedYearMonth}
          onSelect={onSelectYearMonth}
        />

        {/* Row 1, Col 2: TIPO */}
        <HoverSlicerBox
          title="TIPO"
          icon={<Layers className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />}
          options={availableTipos.map((t) => ({
            id: t.tipo,
            label: t.tipo,
            count: t.count
          }))}
          selectedId={selectedTipo}
          onSelect={onSelectTipo}
        />

        {/* Row 2, Col 1: DATA */}
        <HoverSlicerBox
          title="DATA"
          icon={<Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />}
          options={availableDatas.map((d) => ({
            id: d.dt,
            label: d.dt,
            count: d.count
          }))}
          selectedId={selectedData}
          onSelect={onSelectData}
          monoFont={true}
        />

        {/* Row 2, Col 2: PRODUTO */}
        <HoverSlicerBox
          title="PRODUTO"
          icon={<ShoppingBag className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />}
          options={availableProdutos.map((p) => ({
            id: p.prod,
            label: p.prod,
            count: p.count
          }))}
          selectedId={selectedProduto}
          onSelect={onSelectProduto}
          capitalizeOptions={true}
        />
      </div>
    </div>
  );
};

