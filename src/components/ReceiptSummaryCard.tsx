import React, { useState } from 'react';
import { CheckCircle, Store, Calendar, DollarSign, Package, Plus, Trash2, ArrowRight, Tag, Edit2, Check } from 'lucide-react';
import { NFCeReceipt } from '../types';
import { formatBRL } from '../utils/nfceParser';

interface ReceiptSummaryCardProps {
  receipt: NFCeReceipt;
  onSaveToHistory: (receipt: NFCeReceipt) => void;
  onDiscard: () => void;
  onGoToReport: () => void;
  isReadOnly?: boolean;
}

export const ReceiptSummaryCard: React.FC<ReceiptSummaryCardProps> = ({
  receipt: initialReceipt,
  onSaveToHistory,
  onDiscard,
  onGoToReport,
  isReadOnly = false,
}) => {
  const [receipt, setReceipt] = useState<NFCeReceipt>(initialReceipt);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editedRazao, setEditedRazao] = useState(receipt.razaoSocial || 'SENDAS DISTRIBUIDORA S/A');
  const [editedData, setEditedData] = useState(receipt.data || new Date().toLocaleString('pt-BR'));
  const [saved, setSaved] = useState(false);

  // Update internal state if initialReceipt changes
  React.useEffect(() => {
    setReceipt(initialReceipt);
    setEditedRazao(initialReceipt.razaoSocial && initialReceipt.razaoSocial !== 'Estabelecimento Comercial' && initialReceipt.razaoSocial !== 'Estabelecimento Sefaz SP' ? initialReceipt.razaoSocial : 'SENDAS DISTRIBUIDORA S/A');
    setEditedData(initialReceipt.data || new Date().toLocaleString('pt-BR'));
  }, [initialReceipt]);

  const handleSaveHeaderEdit = () => {
    const updatedReceipt: NFCeReceipt = {
      ...receipt,
      razaoSocial: editedRazao.trim() || receipt.razaoSocial,
      data: editedData.trim() || receipt.data,
      itens: receipt.itens.map(item => ({
        ...item,
        razaoSocial: editedRazao.trim() || item.razaoSocial,
        data: editedData.trim() || item.data,
      }))
    };
    setReceipt(updatedReceipt);
    setIsEditingHeader(false);
  };

  const handleSave = () => {
    onSaveToHistory(receipt);
    setSaved(true);
  };

  return (
    <div id="receipt-summary-card" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header Banner */}
      <div className="bg-emerald-600 dark:bg-emerald-700 text-white p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-200 shrink-0" />
            <span className="text-xs font-semibold tracking-wide uppercase text-emerald-100">
              NFC-e Processada com Sucesso
            </span>
          </div>

          {!isEditingHeader ? (
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-bold line-clamp-1 tracking-tight">
                  {receipt.razaoSocial}
                </h3>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setIsEditingHeader(true)}
                    title="Editar Razão Social / Data"
                    className="p-1 rounded bg-emerald-500/50 hover:bg-emerald-500 text-emerald-100 hover:text-white transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-emerald-100/90 mt-0.5">
                {receipt.cnpj && <span>CNPJ: {receipt.cnpj}</span>}
                {receipt.data && <span>Data: {receipt.data}</span>}
                {receipt.numeroNota && <span>Nota nº: {receipt.numeroNota}</span>}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-800/80 p-3 rounded-xl space-y-2.5 mt-1 border border-emerald-500/40">
              <div>
                <label className="block text-[11px] font-semibold text-emerald-200 mb-0.5">
                  Nome / Razão Social:
                </label>
                <input
                  type="text"
                  value={editedRazao}
                  onChange={(e) => setEditedRazao(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-400/50 text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white"
                  placeholder="Ex: SENDAS DISTRIBUIDORA S/A"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-emerald-200 mb-0.5">
                    Data da Compra:
                  </label>
                  <input
                    type="text"
                    value={editedData}
                    onChange={(e) => setEditedData(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-400/50 text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white"
                    placeholder="DD/MM/AAAA HH:MM:SS"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveHeaderEdit}
                  className="mt-4 px-3 py-1.5 rounded-lg bg-white text-emerald-800 text-xs font-bold hover:bg-emerald-50 transition-colors flex items-center gap-1 shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  Salvar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-left sm:text-right pl-0 sm:pl-3 shrink-0">
          <span className="text-xs text-emerald-200 block">Valor Total</span>
          <span className="text-xl sm:text-2xl font-black text-white">
            {formatBRL(receipt.valorTotal)}
          </span>
        </div>
      </div>

      {/* Items Summary Header */}
      <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold text-sm">
          <Package className="w-4 h-4 text-emerald-600" />
          <span>{receipt.itens.length} {receipt.itens.length === 1 ? 'item classificado' : 'itens classificados'}</span>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Classificação automática ativa
        </span>
      </div>

      {/* Items Scrollable List */}
      <div className="max-h-64 sm:max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-2 sm:p-4">
        {receipt.itens.map((item, idx) => (
          <div key={item.id ? `rcpt_item_${item.id}_${idx}` : `rcpt_item_${idx}`} className="py-2.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 w-5 shrink-0">
                    #{item.num}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1">
                    {item.descricao}
                  </span>
                </div>
                {/* Category tags */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] pl-7">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <Tag className="w-3 h-3" />
                    {item.tipo}
                  </span>
                  <span className="px-2 py-0.5 rounded-md font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {item.produto}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                    • {item.detalhe}
                  </span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-sm font-bold text-slate-900 dark:text-white block">
                  {formatBRL(item.valorTotal)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {item.qtd} {item.unidade || 'UN'} {item.valorUnitario ? `× ${formatBRL(item.valorUnitario)}` : ''}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons (Large touch buttons) */}
      <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3">
        {!saved ? (
          <>
            <button
              id="discard-receipt-btn"
              type="button"
              onClick={onDiscard}
              className="w-full sm:w-1/3 py-3.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4 text-slate-400" />
              Descartar
            </button>
            {isReadOnly ? (
              <div className="w-full sm:w-2/3 py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold flex items-center justify-center gap-2">
                <span>Modo Consulta (jal_ver): Inclusão de novas notas desativada</span>
              </div>
            ) : (
              <button
                id="save-receipt-to-history-btn"
                type="button"
                onClick={handleSave}
                className="w-full sm:w-2/3 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-base font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Salvar no LocalStorage ({receipt.itens.length} itens)
              </button>
            )}
          </>
        ) : (
          <div className="w-full space-y-3">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center text-emerald-800 dark:text-emerald-300 text-sm font-semibold flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              Itens salvos com sucesso no LocalStorage!
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                id="scan-another-receipt-btn"
                type="button"
                onClick={onDiscard}
                className="w-full sm:w-1/2 py-3.5 px-4 rounded-xl border border-emerald-600 text-emerald-700 dark:text-emerald-400 text-sm font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
              >
                Escanear Outro QR Code
              </button>
              <button
                id="go-to-report-btn"
                type="button"
                onClick={onGoToReport}
                className="w-full sm:w-1/2 py-3.5 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-black dark:hover:bg-white text-white dark:text-slate-900 text-sm font-bold shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <span>Ver na Tabela / Relatório</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
