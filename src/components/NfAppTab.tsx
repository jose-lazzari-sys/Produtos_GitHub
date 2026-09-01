import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  CheckCircle2, 
  Clock, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  ExternalLink,
  Store,
  Layers,
  ArrowUpDown,
  DollarSign,
  Download,
  AlertCircle
} from 'lucide-react';
import { NFCeReceipt, NFCeItem } from '../types';
import { parseDateToTimestamp } from '../utils/storage';

interface NfAppTabProps {
  receipts: NFCeReceipt[];
  items: NFCeItem[];
  onUpdateReceiptConferido: (receiptId: string, conferido: 'Sim' | '-') => void;
  onDeleteReceipt?: (receiptId: string) => void;
  onViewItemsInReport?: (receiptId: string) => void;
  onSwitchToScanner?: () => void;
}

export function NfAppTab({
  receipts,
  items,
  onUpdateReceiptConferido,
  onDeleteReceipt,
  onViewItemsInReport,
  onSwitchToScanner
}: NfAppTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sim' | 'pendente'>('all');
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'data' | 'qtd' | 'razao' | 'total' | 'conferido'>('data');
  const [sortAsc, setSortAsc] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Filter and Sort Receipts
  const filteredReceipts = useMemo(() => {
    let list = receipts.filter(rcpt => {
      const matchSearch = 
        (rcpt.razaoSocial || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (rcpt.data || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (rcpt.numeroNota || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (rcpt.valorTotal || 0).toFixed(2).includes(searchTerm.replace(',', '.'));

      const isConferido = rcpt.conferido === 'Sim';
      const matchStatus = 
        statusFilter === 'all' ? true :
        statusFilter === 'sim' ? isConferido :
        !isConferido;

      return matchSearch && matchStatus;
    });

    list.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortField === 'data') {
        valA = parseDateToTimestamp(a.data) || parseDateToTimestamp(a.scannedAt);
        valB = parseDateToTimestamp(b.data) || parseDateToTimestamp(b.scannedAt);
        return sortAsc ? valA - valB : valB - valA;
      } else if (sortField === 'qtd') {
        valA = a.itens?.length || 0;
        valB = b.itens?.length || 0;
      } else if (sortField === 'razao') {
        valA = (a.razaoSocial || '').toLowerCase();
        valB = (b.razaoSocial || '').toLowerCase();
      } else if (sortField === 'total') {
        valA = a.valorTotal || 0;
        valB = b.valorTotal || 0;
      } else if (sortField === 'conferido') {
        valA = a.conferido === 'Sim' ? 1 : 0;
        valB = b.conferido === 'Sim' ? 1 : 0;
      }

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return list;
  }, [receipts, searchTerm, statusFilter, sortField, sortAsc]);

  // Totals calculations
  const totalNotas = receipts.length;
  const totalItens = receipts.reduce((acc, r) => acc + (r.itens?.length || 0), 0);
  const totalValor = receipts.reduce((acc, r) => acc + (r.valorTotal || 0), 0);
  const totalConferidas = receipts.filter(r => r.conferido === 'Sim').length;
  const totalPendentes = totalNotas - totalConferidas;

  const handleSort = (field: 'data' | 'qtd' | 'razao' | 'total' | 'conferido') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleExportNfCsv = () => {
    if (receipts.length === 0) return;
    const header = ['DATA', 'QTD ITENS', 'NOME / RAZAO SOCIAL', 'TOTAL R$', 'CONFERIDO'];
    const rows = receipts.map(r => [
      `"${r.data || ''}"`,
      r.itens?.length || 0,
      `"${(r.razaoSocial || '').replace(/"/g, '""')}"`,
      `"${(r.valorTotal || 0).toFixed(2).replace('.', ',')}"`,
      `"${r.conferido === 'Sim' ? 'Sim' : '-'}"`
    ]);

    const csvContent = '\uFEFF' + [header.join(';'), ...rows.map(e => e.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NF_no_APP_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  N.F. no APP
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {totalNotas} {totalNotas === 1 ? 'Nota Fiscal' : 'Notas Fiscais'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Controle e conferência das Notas Fiscais cadastradas no aplicativo
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="export-nf-csv-btn"
              onClick={handleExportNfCsv}
              disabled={receipts.length === 0}
              className="py-2 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Exportar CSV</span>
            </button>
            {onSwitchToScanner && (
              <button
                id="scan-more-nf-btn"
                onClick={onSwitchToScanner}
                className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
              >
                <span>+ Escanear Nova Nota</span>
              </button>
            )}
          </div>
        </div>

        {/* Metric Cards Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Total de Notas
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-black text-slate-900 dark:text-white">
                {totalNotas}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                emitidas
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Total de Itens
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-black text-slate-900 dark:text-white">
                {totalItens}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                produtos
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
            <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">
              Total Geral (R$)
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50">
            <span className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-400 uppercase tracking-wider block">
              Status Conferência
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                {totalConferidas} Sim
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {totalPendentes} -
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="search-nf-input"
            type="text"
            placeholder="Buscar por Data, Razão Social, Número ou Valor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter by Status */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs self-start sm:self-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Todas ({receipts.length})
          </button>
          <button
            onClick={() => setStatusFilter('sim')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
              statusFilter === 'sim'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Sim ({totalConferidas})</span>
          </button>
          <button
            onClick={() => setStatusFilter('pendente')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
              statusFilter === 'pendente'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>- ({totalPendentes})</span>
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xs overflow-hidden">
        {filteredReceipts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Nenhuma Nota Fiscal encontrada
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {receipts.length === 0
                ? 'Você ainda não possui notas fiscais cadastradas. Escaneie um QR Code de NFC-e para registrar sua primeira nota!'
                : 'Nenhum resultado corresponde aos filtros selecionados.'}
            </p>
            {receipts.length === 0 && onSwitchToScanner && (
              <button
                onClick={onSwitchToScanner}
                className="mt-2 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs inline-flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                <span>Ir para Leitor QR</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider select-none">
                  {/* DATA */}
                  <th 
                    className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => handleSort('data')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>DATA</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>

                  {/* QTD ITENS */}
                  <th 
                    className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => handleSort('qtd')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>QTD ITENS</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>

                  {/* NOME / RAZÃO SOCIAL */}
                  <th 
                    className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => handleSort('razao')}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>NOME / RAZÃO SOCIAL</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>

                  {/* TOTAL R$ */}
                  <th 
                    className="py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => handleSort('total')}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>TOTAL R$</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>

                  {/* CONFERIDO */}
                  <th 
                    className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => handleSort('conferido')}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>CONFERIDO</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </th>

                  {/* Ações / Detalhes */}
                  <th className="py-3.5 px-4 text-center w-24">
                    <span>AÇÕES</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-800 dark:text-slate-200 font-medium">
                {filteredReceipts.map((rcpt) => {
                  const isExpanded = expandedReceiptId === rcpt.id;
                  const isConferido = rcpt.conferido === 'Sim';
                  const qtdItens = rcpt.itens?.length || 0;

                  return (
                    <React.Fragment key={rcpt.id}>
                      <tr 
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                          isConferido ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''
                        }`}
                      >
                        {/* 1. DATA */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
                            <span>{rcpt.data || 'Data não informada'}</span>
                          </div>
                        </td>

                        {/* 2. QTD ITENS */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                            {qtdItens} {qtdItens === 1 ? 'item' : 'itens'}
                          </span>
                        </td>

                        {/* 3. NOME / RAZÃO SOCIAL */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-bold text-slate-900 dark:text-white line-clamp-1">
                              {rcpt.razaoSocial || 'SENDAS DISTRIBUIDORA S/A'}
                            </span>
                          </div>
                          {rcpt.numeroNota && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal ml-5">
                              NFC-e Nº {rcpt.numeroNota}
                            </span>
                          )}
                        </td>

                        {/* 4. TOTAL R$ */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap font-black text-sm text-emerald-700 dark:text-emerald-400">
                          R$ {(rcpt.valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* 5. CONFERIDO (Preenchimento manual com "Sim" ou "-") */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                            {/* Opção Sim */}
                            <button
                              id={`conferido-sim-btn-${rcpt.id}`}
                              onClick={() => onUpdateReceiptConferido(rcpt.id, 'Sim')}
                              title="Marcar como Conferido (Sim)"
                              className={`py-1 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                isConferido
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Sim</span>
                            </button>

                            {/* Opção - */}
                            <button
                              id={`conferido-pendente-btn-${rcpt.id}`}
                              onClick={() => onUpdateReceiptConferido(rcpt.id, '-')}
                              title="Marcar como Não Conferido (-)"
                              className={`py-1 px-3 rounded-lg text-xs font-bold transition-all ${
                                !isConferido
                                  ? 'bg-slate-600 text-white shadow-xs'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              <span>-</span>
                            </button>
                          </div>
                        </td>

                        {/* Ações (Expandir detalhes, Ver itens, Excluir) */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              id={`expand-receipt-btn-${rcpt.id}`}
                              onClick={() => setExpandedReceiptId(isExpanded ? null : rcpt.id)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title={isExpanded ? 'Ocultar itens' : 'Ver itens desta nota'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {onDeleteReceipt && (
                              <button
                                id={`delete-receipt-btn-${rcpt.id}`}
                                onClick={() => setDeleteConfirmId(rcpt.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                title="Excluir nota e seus itens"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Modal de Confirmação de Exclusão da Nota */}
                      {deleteConfirmId === rcpt.id && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border-y border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 text-xs">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>
                                  Deseja realmente excluir esta nota de <strong>R$ {(rcpt.valorTotal || 0).toFixed(2)}</strong> e todos os seus <strong>{qtdItens} itens</strong>?
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="py-1 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => {
                                    if (onDeleteReceipt) onDeleteReceipt(rcpt.id);
                                    setDeleteConfirmId(null);
                                  }}
                                  className="py-1 px-3 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-xs"
                                >
                                  Sim, Excluir
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Detalhes Expandidos da Nota */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 dark:bg-slate-950/50">
                          <td colSpan={6} className="p-4 sm:p-6 border-y border-slate-200 dark:border-slate-800">
                            <div className="space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                                <div>
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    Itens Contidos na Nota Fiscal ({qtdItens})
                                  </h4>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {rcpt.razaoSocial} • Emissão: {rcpt.data}
                                  </p>
                                </div>

                                {onViewItemsInReport && (
                                  <button
                                    onClick={() => onViewItemsInReport(rcpt.id)}
                                    className="py-1.5 px-3 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 transition-colors text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Ver na Tabela Geral de Itens</span>
                                  </button>
                                )}
                              </div>

                              {/* Tabela Resumida de Itens da Nota */}
                              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                      <th className="py-2 px-3 w-12 text-center">#</th>
                                      <th className="py-2 px-3">DESCRIÇÃO DO PRODUTO</th>
                                      <th className="py-2 px-3">TIPO / PRODUTO</th>
                                      <th className="py-2 px-3 text-center">QTD</th>
                                      <th className="py-2 px-3 text-right">TOTAL R$</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {rcpt.itens && rcpt.itens.length > 0 ? (
                                      rcpt.itens.map((it, idx) => (
                                        <tr key={it.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                          <td className="py-2 px-3 text-center font-bold text-slate-500">
                                            {it.num ?? idx + 1}
                                          </td>
                                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                                            {it.descricao}
                                          </td>
                                          <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                                            <span className="font-medium text-slate-700 dark:text-slate-300">{it.tipo}</span>
                                            {it.produto && <span> › {it.produto}</span>}
                                          </td>
                                          <td className="py-2 px-3 text-center text-slate-600 dark:text-slate-300">
                                            {it.qtd} {it.unidade || 'UN'}
                                          </td>
                                          <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                            R$ {(it.valorTotal || 0).toFixed(2).replace('.', ',')}
                                          </td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr>
                                        <td colSpan={5} className="py-4 text-center text-slate-400">
                                          Nenhum item listado para esta nota.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* Tabela Rodapé Totalizador */}
              <tfoot>
                <tr className="bg-slate-50 dark:bg-slate-800/90 border-t-2 border-slate-300 dark:border-slate-700 text-xs font-black text-slate-900 dark:text-white">
                  <td className="py-4 px-4">
                    TOTAL ({filteredReceipts.length} {filteredReceipts.length === 1 ? 'Nota' : 'Notas'})
                  </td>
                  <td className="py-4 px-4 text-center">
                    {filteredReceipts.reduce((acc, r) => acc + (r.itens?.length || 0), 0)} itens
                  </td>
                  <td className="py-4 px-4">
                    —
                  </td>
                  <td className="py-4 px-4 text-right text-sm text-emerald-700 dark:text-emerald-400 font-black">
                    R$ {filteredReceipts.reduce((acc, r) => acc + (r.valorTotal || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                      {filteredReceipts.filter(r => r.conferido === 'Sim').length} Conferidas
                    </span>
                  </td>
                  <td className="py-4 px-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
