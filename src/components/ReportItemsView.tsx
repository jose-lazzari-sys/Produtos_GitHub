import React, { useState, useMemo } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  AlertCircle,
  PlusCircle,
  Building2,
  Copy,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { NFCeItem } from '../types';
import { formatBRL } from '../utils/nfceParser';
import { calculatePrecoPorKg } from '../utils/weightUtils';
import { copyToClipboard, generateGoogleSheetsTSV } from '../utils/exporter';

export interface ReportItemsViewProps {
  items: NFCeItem[];
  filteredItems: NFCeItem[];
  totalFiltrado: number;
  onEditClick: (item: NFCeItem) => void;
  onDeleteItem: (id: string, item?: NFCeItem) => void;
  onAddManualItem?: () => void;
  onUpdateAllStoreNames?: (newName: string) => void;
  onClearAll: () => void;
  onSwitchToScanner: () => void;
  onLoadSample: () => void;
  onClearFilters: () => void;
  isReadOnly?: boolean;
}

export const ReportItemsView: React.FC<ReportItemsViewProps> = ({
  items,
  filteredItems,
  totalFiltrado,
  onEditClick,
  onDeleteItem,
  onAddManualItem,
  onUpdateAllStoreNames,
  onClearAll,
  onSwitchToScanner,
  onLoadSample,
  onClearFilters,
  isReadOnly = false,
}) => {
  // Sorting state
  const [sortField, setSortField] = useState<'num' | 'valorTotal' | 'data' | 'descricao' | 'precoPorKg'>('data');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modals
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [customStoreName, setCustomStoreName] = useState('SENDAS DISTRIBUIDORA S/A');
  const [itemToDelete, setItemToDelete] = useState<NFCeItem | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Sorting
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'num') {
        const numA = a.num ?? 0;
        const numB = b.num ?? 0;
        comparison = numA - numB;
      } else if (sortField === 'valorTotal') {
        comparison = (a.valorTotal || 0) - (b.valorTotal || 0);
      } else if (sortField === 'data') {
        const getTs = (dStr?: string) => {
          if (!dStr) return 0;
          const match = dStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
          return new Date(dStr).getTime() || 0;
        };
        comparison = getTs(a.data) - getTs(b.data);
      } else if (sortField === 'descricao') {
        comparison = (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR');
      } else if (sortField === 'precoPorKg') {
        const pKgA = a.precoPorKg ?? 0;
        const pKgB = b.precoPorKg ?? 0;
        comparison = pKgA - pKgB;
      }
      return sortAsc ? comparison : -comparison;
    });
  }, [filteredItems, sortField, sortAsc]);

  // Pagination calculation
  const totalPages = pageSize === -1 ? 1 : Math.ceil(sortedItems.length / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedItems = useMemo(() => {
    if (pageSize === -1) return sortedItems;
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, safeCurrentPage, pageSize]);

  const startIndex = pageSize === -1 ? 0 : (safeCurrentPage - 1) * pageSize;

  const handleSort = (field: 'num' | 'valorTotal' | 'data' | 'descricao' | 'precoPorKg') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // Default descending for quick view of highest values or latest dates
    }
  };

  const renderSortIcon = (field: 'num' | 'valorTotal' | 'data' | 'descricao' | 'precoPorKg') => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-70" />;
    }
    return sortAsc ? (
      <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400 font-bold" />
    );
  };

  const handleCopyToSheets = async () => {
    const tsv = generateGoogleSheetsTSV(filteredItems);
    const success = await copyToClipboard(tsv);
    if (success) {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 3000);
    }
  };

  const renderPaginationBar = (position: 'top' | 'bottom') => {
    if (sortedItems.length === 0) return null;

    const startItem = startIndex + 1;
    const endItem = pageSize === -1 ? sortedItems.length : Math.min(startIndex + pageSize, sortedItems.length);

    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-850 text-xs border-slate-200 dark:border-slate-800 ${
          position === 'top' ? 'border-b' : 'border-t'
        }`}
      >
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <span>
            Mostrando <strong>{startItem}</strong>-<strong>{endItem}</strong> de <strong>{sortedItems.length}</strong> itens
          </span>
          {filteredItems.length !== items.length && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              ({items.length} no total)
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[11px] hidden sm:inline">Itens por pág:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={-1}>Todos ({sortedItems.length})</option>
            </select>
          </div>

          {pageSize !== -1 && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage === 1}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
                title="Primeira página"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
                title="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="px-2 font-mono font-bold text-slate-700 dark:text-slate-200 text-xs">
                {safeCurrentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
                title="Próxima página"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage === totalPages}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
                title="Última página"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden space-y-0">
      {/* Top Action Toolbar */}
      <div className="p-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!isReadOnly && onAddManualItem && (
            <button
              type="button"
              onClick={onAddManualItem}
              className="h-9 px-3.5 rounded-xl border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Inserir Dados Manual</span>
            </button>
          )}

          {!isReadOnly && onUpdateAllStoreNames && (
            <button
              type="button"
              onClick={() => setIsStoreModalOpen(true)}
              disabled={items.length === 0}
              className="h-9 px-3.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Ajustar Razão Social</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyToSheets}
            className="h-9 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedSuccess ? 'Copiado!' : 'Copiar p/ Planilha'}</span>
          </button>

          {isReadOnly && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-xs font-semibold">
              <AlertCircle className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Modo Consulta (jal_ver): Proteção contra alterações ativada</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isReadOnly && items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Deseja realmente limpar todos os itens salvos?')) {
                  onClearAll();
                }
              }}
              className="h-9 px-3 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Tudo</span>
            </button>
          )}
        </div>
      </div>

      {/* Top Pagination */}
      {renderPaginationBar('top')}

      {/* Table Container */}
      <div className="overflow-x-auto relative">
        <table className="w-full text-left text-xs border-collapse min-w-[1060px]">
          <thead>
            <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider select-none">
              <th
                onClick={() => handleSort('num')}
                className={`p-3 sm:p-3.5 w-14 text-center cursor-pointer transition-colors ${
                  sortField === 'num'
                    ? 'text-sky-700 dark:text-sky-300 bg-sky-50/50 dark:bg-sky-950/20'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span>1. Num</span>
                  {renderSortIcon('num')}
                </div>
              </th>

              <th
                onClick={() => handleSort('descricao')}
                className={`p-3 sm:p-3.5 min-w-[180px] cursor-pointer transition-colors ${
                  sortField === 'descricao'
                    ? 'text-sky-700 dark:text-sky-300 bg-sky-50/50 dark:bg-sky-950/20'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span>2. Descrição</span>
                  {renderSortIcon('descricao')}
                </div>
              </th>

              <th className="p-3 sm:p-3.5 w-16 text-right">3. Qtd.</th>

              <th
                onClick={() => handleSort('valorTotal')}
                className={`p-3 sm:p-3.5 w-24 text-right cursor-pointer transition-colors ${
                  sortField === 'valorTotal'
                    ? 'text-sky-700 dark:text-sky-300 bg-sky-50/50 dark:bg-sky-950/20'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>4. Valor(R$)</span>
                  {renderSortIcon('valorTotal')}
                </div>
              </th>

              <th className="p-3 sm:p-3.5 min-w-[160px]">
                <div className="flex items-center justify-between gap-1">
                  <span>5. Razão Social</span>
                  {onUpdateAllStoreNames && (
                    <button
                      onClick={() => setIsStoreModalOpen(true)}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      title="Editar Razão Social de todos os itens"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </th>

              <th
                onClick={() => handleSort('data')}
                className={`p-3 sm:p-3.5 w-28 cursor-pointer transition-colors ${
                  sortField === 'data'
                    ? 'text-sky-700 dark:text-sky-300 bg-sky-50/50 dark:bg-sky-950/20 font-extrabold'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span>6. Data</span>
                  {renderSortIcon('data')}
                </div>
              </th>

              <th
                onClick={() => handleSort('precoPorKg')}
                className={`p-3 sm:p-3.5 w-24 text-right cursor-pointer transition-colors ${
                  sortField === 'precoPorKg'
                    ? 'text-sky-700 dark:text-sky-300 bg-sky-50/50 dark:bg-sky-950/20'
                    : 'hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>R$/Kg</span>
                  {renderSortIcon('precoPorKg')}
                </div>
              </th>

              <th className="p-3 sm:p-3.5 min-w-[120px] bg-sky-50/80 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-extrabold border-l border-sky-200 dark:border-sky-900">
                7. Tipo
              </th>
              <th className="p-3 sm:p-3.5 min-w-[120px] bg-sky-50/80 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-extrabold">
                8. Produto
              </th>
              <th className="p-3 sm:p-3.5 min-w-[140px] bg-sky-50/80 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-extrabold">
                9. Detalhe
              </th>

              {/* Sticky Actions */}
              <th className="p-3 sm:p-3.5 w-24 min-w-[96px] text-center sticky right-0 z-20 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.12)]">
                {isReadOnly ? 'Status' : 'Ações'}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {paginatedItems.length > 0 ? (
              paginatedItems.map((item, index) => (
                <tr
                  key={item.id ? `row_${item.id}_${item.num ?? (startIndex + index + 1)}` : `row_${item.num ?? (startIndex + index + 1)}`}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                >
                  {/* 1. Num */}
                  <td className="p-3 sm:p-3.5 font-bold text-slate-400 dark:text-slate-500 text-center">
                    {item.num ?? (startIndex + index + 1)}
                  </td>

                  {/* 2. Descrição */}
                  <td className="p-3 sm:p-3.5 font-semibold text-slate-900 dark:text-white">
                    {item.descricao}
                  </td>

                  {/* 3. Qtd. */}
                  <td className="p-3 sm:p-3.5 text-right text-slate-700 dark:text-slate-300 font-mono">
                    {item.qtd} {item.unidade || ''}
                  </td>

                  {/* 4. Valor(R$) */}
                  <td className="p-3 sm:p-3.5 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {formatBRL(item.valorTotal)}
                  </td>

                  {/* 5. Nome / Razão Social */}
                  <td className="p-3 sm:p-3.5 text-slate-600 dark:text-slate-300 truncate max-w-[180px]" title={item.razaoSocial}>
                    {item.razaoSocial}
                  </td>

                  {/* 6. Data */}
                  <td className="p-3 sm:p-3.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                    {item.data}
                  </td>

                  {/* R$/Kg */}
                  <td className="p-3 sm:p-3.5 text-right font-mono text-[11px]">
                    {(() => {
                      const pKg = item.precoPorKg ?? (
                        item.tipo === 'Alimentação' && item.pesoKg && item.pesoKg > 0
                          ? calculatePrecoPorKg(item.valorTotal, item.pesoKg, item.qtd, item.tipo, item.unidade)
                          : 0
                      );
                      return pKg > 0 ? (
                        <span className="font-bold text-emerald-700 dark:text-emerald-300">
                          {formatBRL(pKg)}
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600 font-sans">—</span>
                      );
                    })()}
                  </td>

                  {/* 7. Tipo */}
                  <td className="p-3 sm:p-3.5 bg-sky-50/30 dark:bg-sky-950/10 border-l border-sky-100 dark:border-sky-900/50">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md font-bold text-[11px] bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                      {item.tipo || 'Outros'}
                    </span>
                  </td>

                  {/* 8. Produto */}
                  <td className="p-3 sm:p-3.5 bg-sky-50/30 dark:bg-sky-950/10 font-medium text-slate-800 dark:text-slate-200">
                    {item.produto || 'Outros'}
                  </td>

                  {/* 9. Detalhe */}
                  <td className="p-3 sm:p-3.5 bg-sky-50/30 dark:bg-sky-950/10 text-slate-500 dark:text-slate-400 text-[11px]">
                    {item.detalhe || 'Outros'}
                  </td>

                  {/* Sticky Actions */}
                  <td className="p-2 sm:p-3 text-center whitespace-nowrap sticky right-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/90 border-l border-slate-100 dark:border-slate-800 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.08)]">
                    {isReadOnly ? (
                      <span className="inline-block px-2 py-1 rounded-md text-[11px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800">
                        Consulta
                      </span>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditClick(item);
                          }}
                          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 border border-slate-200 dark:border-slate-700 hover:border-sky-300 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                          title="Editar item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete(item);
                          }}
                          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 border border-slate-200 dark:border-slate-700 hover:border-red-300 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                          title="Excluir item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="p-12 text-center">
                  <div className="max-w-sm mx-auto space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                      Nenhum item encontrado
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {items.length === 0
                        ? 'Escaneie uma nota fiscal pelo leitor QR Code ou carregue dados de exemplo.'
                        : 'Nenhum item corresponde ao filtro ou busca selecionada.'}
                    </p>
                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                      {items.length === 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={onSwitchToScanner}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-600 text-white text-xs font-bold shadow-xs hover:bg-sky-700 transition-colors"
                          >
                            Ir para Leitor QR Code
                          </button>
                          <button
                            type="button"
                            onClick={onLoadSample}
                            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            Carregar Exemplo (34 itens)
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={onClearFilters}
                          className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-slate-300"
                        >
                          Limpar Filtros
                        </button>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Pagination */}
      {renderPaginationBar('bottom')}

      {/* Footer Total */}
      {filteredItems.length > 0 && (
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            Total exibido:{' '}
            <span className="font-bold text-slate-800 dark:text-slate-200">{filteredItems.length}</span>{' '}
            itens filtrados {items.length !== filteredItems.length && `(de ${items.length} totais)`}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-slate-500 font-medium">Subtotal dos Itens:</span>
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {formatBRL(totalFiltrado)}
            </span>
          </div>
        </div>
      )}

      {/* Batch Edit Store Name Modal */}
      {isStoreModalOpen && onUpdateAllStoreNames && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Ajustar Razão Social dos Itens
                </h3>
              </div>
              <button
                onClick={() => setIsStoreModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Defina o Nome / Razão Social que será aplicado em todos os {items.length} itens desta tabela:
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Nome / Razão Social (Coluna 5)
              </label>
              <input
                type="text"
                value={customStoreName}
                onChange={(e) => setCustomStoreName(e.target.value)}
                placeholder="SENDAS DISTRIBUIDORA S/A"
                className="w-full p-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsStoreModalOpen(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (customStoreName.trim()) {
                    onUpdateAllStoreNames(customStoreName.trim());
                    setIsStoreModalOpen(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
              >
                Salvar em Todos os Itens
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Excluir este Item?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">
                {itemToDelete.descricao}
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                {itemToDelete.qtd} {itemToDelete.unidade} • {formatBRL(itemToDelete.valorTotal)}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (itemToDelete.id) {
                    onDeleteItem(itemToDelete.id, itemToDelete);
                  }
                  setItemToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
