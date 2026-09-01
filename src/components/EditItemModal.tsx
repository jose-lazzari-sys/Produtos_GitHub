import React, { useState, useEffect } from 'react';
import { X, Save, Tag, DollarSign, Calendar, Building2, Package, Trash2, Scale, Calculator } from 'lucide-react';
import { NFCeItem } from '../types';
import { CATEGORY_RULES, TIPO_OPTIONS } from '../utils/classifier';
import { extractPesoKg, calculatePrecoPorKg } from '../utils/weightUtils';

interface EditItemModalProps {
  item: NFCeItem | null;
  isOpen: boolean;
  isNew?: boolean;
  onClose: () => void;
  onSave: (updatedItem: NFCeItem) => void;
  onDelete?: (id: string, item?: NFCeItem) => void;
}

export const EditItemModal: React.FC<EditItemModalProps> = ({
  item,
  isOpen,
  isNew = false,
  onClose,
  onSave,
  onDelete,
}) => {
  if (!isOpen || !item) return null;

  const [num, setNum] = useState(item.num ? item.num.toString() : '1');
  const [descricao, setDescricao] = useState(item.descricao);
  const [unidade, setUnidade] = useState(item.unidade || 'UN');
  const [qtd, setQtd] = useState(item.qtd.toString());
  const [valorTotal, setValorTotal] = useState(item.valorTotal.toString());
  const [razaoSocial, setRazaoSocial] = useState(item.razaoSocial);
  const [data, setData] = useState(item.data);
  const [tipo, setTipo] = useState(item.tipo || 'Outros');
  const [produto, setProduto] = useState(item.produto || 'Outros');
  const [detalhe, setDetalhe] = useState(item.detalhe || 'Outros');

  // Calculate initial pesoKg from item or auto-extract
  const [pesoKg, setPesoKg] = useState<string>(() => {
    if (item.pesoKg !== undefined && item.pesoKg !== null && item.pesoKg > 0) {
      return item.pesoKg.toString();
    }
    const initialExtracted = extractPesoKg(item.descricao, item.qtd, item.unidade || 'UN', item.tipo);
    return initialExtracted > 0 ? initialExtracted.toString() : '0';
  });

  // Keep state updated when item changes
  useEffect(() => {
    if (item) {
      setNum(item.num ? item.num.toString() : '1');
      setDescricao(item.descricao);
      setUnidade(item.unidade || 'UN');
      setQtd(item.qtd.toString());
      setValorTotal(item.valorTotal.toString());
      setRazaoSocial(item.razaoSocial);
      setData(item.data);
      setTipo(item.tipo || 'Outros');
      setProduto(item.produto || 'Outros');
      setDetalhe(item.detalhe || 'Outros');

      if (item.pesoKg !== undefined && item.pesoKg !== null && item.pesoKg > 0) {
        setPesoKg(item.pesoKg.toString());
      } else {
        const extracted = extractPesoKg(item.descricao, item.qtd, item.unidade || 'UN', item.tipo);
        setPesoKg(extracted > 0 ? extracted.toString() : '0');
      }
    }
  }, [item]);

  // Available produtos based on selected tipo
  const availableRules = CATEGORY_RULES.filter(r => r.tipo === tipo);

  const handleTipoChange = (newTipo: string) => {
    setTipo(newTipo);
    const matchingRules = CATEGORY_RULES.filter(r => r.tipo === newTipo);
    if (matchingRules.length > 0) {
      setProduto(matchingRules[0].produto);
      setDetalhe(matchingRules[0].detalhe);
    } else {
      setProduto('Outros');
      setDetalhe('Outros');
    }

    if (newTipo === 'Alimentação') {
      const parsedQtd = parseFloat(qtd.replace(',', '.')) || item.qtd || 1;
      const extracted = extractPesoKg(descricao, parsedQtd, item.unidade, 'Alimentação');
      setPesoKg(extracted > 0 ? extracted.toString() : '0');
    } else {
      setPesoKg('0');
    }
  };

  const handleProdutoChange = (newProd: string) => {
    setProduto(newProd);
    const rule = CATEGORY_RULES.find(r => r.tipo === tipo && r.produto === newProd);
    if (rule) {
      setDetalhe(rule.detalhe);
    }
  };

  // Re-detect peso when descricao or qtd or unidade changes
  const handleDescricaoChange = (newDesc: string) => {
    setDescricao(newDesc);
    if (tipo === 'Alimentação') {
      const parsedQtd = parseFloat(qtd.replace(',', '.')) || 1;
      const extracted = extractPesoKg(newDesc, parsedQtd, unidade, 'Alimentação');
      if (extracted > 0) {
        setPesoKg(extracted.toString());
      }
    }
  };

  const handleUnidadeChange = (newUnidade: string) => {
    setUnidade(newUnidade);
    if (tipo === 'Alimentação') {
      const cleanUnit = (newUnidade || '').trim().toUpperCase();
      const parsedQtd = parseFloat(qtd.replace(',', '.')) || 0;
      if ((cleanUnit === 'KG' || cleanUnit.includes('KG')) && parsedQtd > 0) {
        setPesoKg(parsedQtd.toString());
      } else {
        const extracted = extractPesoKg(descricao, parsedQtd || 1, newUnidade, 'Alimentação');
        if (extracted > 0) {
          setPesoKg(extracted.toString());
        }
      }
    }
  };

  const handleQtdChange = (newQtdStr: string) => {
    setQtd(newQtdStr);
    if (tipo === 'Alimentação') {
      const cleanUnit = (unidade || '').trim().toUpperCase();
      if (cleanUnit === 'KG' || cleanUnit.includes('KG')) {
        const parsedQtd = parseFloat(newQtdStr.replace(',', '.')) || 0;
        if (parsedQtd > 0) {
          setPesoKg(parsedQtd.toString());
        }
      }
    }
  };

  // Live computed numeric values
  const parsedQtdNum = parseFloat(qtd.replace(',', '.')) || 1;
  const parsedValNum = parseFloat(valorTotal.replace(',', '.')) || 0;
  const parsedPesoKgNum = tipo === 'Alimentação' ? (parseFloat(pesoKg.replace(',', '.')) || 0) : 0;
  const computedPrecoPorKg = tipo === 'Alimentação' && parsedPesoKgNum > 0
    ? calculatePrecoPorKg(parsedValNum, parsedPesoKgNum, parsedQtdNum, tipo, unidade)
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPesoKg = tipo === 'Alimentação' ? parsedPesoKgNum : 0;
    const finalPrecoPorKg = tipo === 'Alimentação' ? computedPrecoPorKg : 0;
    const parsedNum = parseInt(num, 10);

    const updated: NFCeItem = {
      ...item,
      num: !isNaN(parsedNum) ? parsedNum : (item.num !== undefined ? item.num : 1),
      descricao,
      unidade: (unidade || 'UN').trim().toUpperCase(),
      qtd: parsedQtdNum,
      pesoKg: finalPesoKg,
      precoPorKg: finalPrecoPorKg,
      valorTotal: parsedValNum,
      valorUnitario: parsedValNum / (parsedQtdNum || 1),
      razaoSocial,
      data,
      tipo,
      produto,
      detalhe,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div id="edit-item-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div 
        id="edit-item-modal-card" 
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isNew ? 'Inserir Dados Manual' : 'Editar Classificação e Item'}
              </h3>
              <p className="text-xs text-slate-500">
                {isNew ? `Novo Item Manual (Num #${num || item.num})` : `Item #${num || item.num}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Num & Descrição */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                1. Num
              </label>
              <input
                type="number"
                min="1"
                required
                value={num}
                onChange={(e) => setNum(e.target.value)}
                className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-bold text-center"
                placeholder="1"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                2. Descrição do Produto
              </label>
              <input
                type="text"
                required
                value={descricao}
                onChange={(e) => handleDescricaoChange(e.target.value)}
                className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden"
                placeholder="Ex: ARROZ TIPO 1 5KG"
              />
            </div>
          </div>

          {/* Classification: Tipo, Produto, Detalhe */}
          <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-xl space-y-3">
            <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              Classificação por Regras
            </h4>

            {/* Tipo */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                1. Tipo
              </label>
              <select
                value={tipo}
                onChange={(e) => handleTipoChange(e.target.value)}
                className="w-full p-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-medium"
              >
                <option value="Alimentação">Alimentação</option>
                <option value="Higiene Pessoal">Higiene Pessoal</option>
                <option value="Limpeza Doméstica">Limpeza Doméstica</option>
                <option value="Outros">Outros</option>
              </select>
            </div>

            {/* Produto */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                2. Produto (Subcategoria)
              </label>
              {availableRules.length > 0 ? (
                <select
                  value={produto}
                  onChange={(e) => handleProdutoChange(e.target.value)}
                  className="w-full p-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-medium"
                >
                  {availableRules.map((r, i) => (
                    <option key={i} value={r.produto}>
                      {r.produto}
                    </option>
                  ))}
                  <option value="Outros">Outros</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={produto}
                  onChange={(e) => setProduto(e.target.value)}
                  className="w-full p-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              )}
            </div>

            {/* Detalhe */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                3. Detalhe / Regra
              </label>
              <input
                type="text"
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
                className="w-full p-2.5 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </div>
          </div>

          {/* Qtd, Unidade, PESO Kg, R$/Kg & Valor */}
          {tipo === 'Alimentação' ? (
            <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Quantidades, Unidade, Peso e Valores (Alimentação)
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {unidade ? `Unidade selecionada: ${unidade.toUpperCase()}` : 'Item Alimentício'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {/* 1. Qtd */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    3. Qtd.
                  </label>
                  <input
                    type="text"
                    required
                    value={qtd}
                    onChange={(e) => handleQtdChange(e.target.value)}
                    className="w-full p-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-medium focus:ring-2 focus:ring-emerald-500 outline-hidden"
                    placeholder="1"
                  />
                </div>

                {/* 2. Unidade (KG, UN, PC, etc.) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Unidade
                  </label>
                  <div className="relative">
                    <select
                      value={['KG', 'UN', 'PC', 'CX', 'LT', 'PT', 'DZ', 'FD', 'L', 'ML', 'G'].includes(unidade.toUpperCase()) ? unidade.toUpperCase() : 'CUSTOM'}
                      onChange={(e) => {
                        if (e.target.value !== 'CUSTOM') {
                          handleUnidadeChange(e.target.value);
                        }
                      }}
                      className="w-full p-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-hidden"
                    >
                      <option value="UN">UN</option>
                      <option value="KG">KG</option>
                      <option value="PC">PC</option>
                      <option value="CX">CX</option>
                      <option value="LT">LT</option>
                      <option value="PT">PT</option>
                      <option value="DZ">DZ</option>
                      <option value="FD">FD</option>
                      <option value="L">L</option>
                      <option value="ML">ML</option>
                      <option value="G">G</option>
                      <option value="CUSTOM">Outra...</option>
                    </select>
                  </div>
                  {!['KG', 'UN', 'PC', 'CX', 'LT', 'PT', 'DZ', 'FD', 'L', 'ML', 'G'].includes(unidade.toUpperCase()) && (
                    <input
                      type="text"
                      value={unidade}
                      onChange={(e) => handleUnidadeChange(e.target.value)}
                      placeholder="Ex: BD"
                      className="w-full mt-1.5 p-2 text-xs uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                    />
                  )}
                </div>

                {/* 3. PESO Kg */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase mb-1 flex items-center justify-between">
                    <span>PESO Kg</span>
                    {parsedPesoKgNum > 0 && (
                      <span className="text-[9px] lowercase font-normal opacity-80">
                        {parsedPesoKgNum >= 1 ? `${parsedPesoKgNum}kg` : `${Math.round(parsedPesoKgNum * 1000)}g`}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={pesoKg}
                    onChange={(e) => setPesoKg(e.target.value)}
                    className="w-full p-2.5 text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden"
                    placeholder="0.000"
                  />
                </div>

                {/* 4. R$/Kg */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase mb-1">
                    R$/Kg
                  </label>
                  <div className="p-2.5 text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-100/60 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-center min-h-[42px] truncate">
                    {computedPrecoPorKg > 0 ? `R$ ${computedPrecoPorKg.toFixed(2).replace('.', ',')}` : 'R$ 0,00'}
                  </div>
                </div>

                {/* 5. Valor Total */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    4. Valor (R$)
                  </label>
                  <input
                    type="text"
                    required
                    value={valorTotal}
                    onChange={(e) => setValorTotal(e.target.value)}
                    className="w-full p-2.5 text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Helper explanation for user */}
              <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-white/70 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 flex items-start gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  {parsedPesoKgNum > 0 ? (
                    <>
                      Cálculo: <strong>R$ {parsedValNum.toFixed(2).replace('.', ',')}</strong> ÷ <strong>{parsedPesoKgNum.toFixed(3).replace('.', ',')} Kg</strong> {parsedQtdNum > 1 && !unidade?.toUpperCase().includes('KG') ? <>÷ <strong>{parsedQtdNum} un</strong></> : ''} = <strong className="text-emerald-700 dark:text-emerald-300">R$ {computedPrecoPorKg.toFixed(2).replace('.', ',')} / Kg</strong>
                    </>
                  ) : (
                    'Nenhum peso identificado na descrição ou unidade (peso = 0). Digite o peso em Kg acima se desejar calcular o R$/Kg.'
                  )}
                </span>
              </div>
            </div>
          ) : (
            /* Qtd, Unidade & Valor for non-alimentação */
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  3. Qtd.
                </label>
                <input
                  type="text"
                  required
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value)}
                  className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Unidade
                </label>
                <select
                  value={['UN', 'PC', 'CX', 'LT', 'PT', 'DZ', 'FD', 'L', 'ML', 'KG', 'G'].includes(unidade.toUpperCase()) ? unidade.toUpperCase() : 'CUSTOM'}
                  onChange={(e) => {
                    if (e.target.value !== 'CUSTOM') {
                      handleUnidadeChange(e.target.value);
                    }
                  }}
                  className="w-full p-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-slate-200"
                >
                  <option value="UN">UN</option>
                  <option value="PC">PC</option>
                  <option value="CX">CX</option>
                  <option value="LT">LT</option>
                  <option value="PT">PT</option>
                  <option value="DZ">DZ</option>
                  <option value="FD">FD</option>
                  <option value="L">L</option>
                  <option value="ML">ML</option>
                  <option value="KG">KG</option>
                  <option value="G">G</option>
                  <option value="CUSTOM">Outra...</option>
                </select>
                {!['UN', 'PC', 'CX', 'LT', 'PT', 'DZ', 'FD', 'L', 'ML', 'KG', 'G'].includes(unidade.toUpperCase()) && (
                  <input
                    type="text"
                    value={unidade}
                    onChange={(e) => handleUnidadeChange(e.target.value)}
                    placeholder="Ex: BD"
                    className="w-full mt-1.5 p-2 text-xs uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  4. Valor Total (R$)
                </label>
                <input
                  type="text"
                  required
                  value={valorTotal}
                  onChange={(e) => setValorTotal(e.target.value)}
                  className="w-full p-2.5 text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl"
                />
              </div>
            </div>
          )}

          {/* Razão Social & Data */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Nome / Razão Social
            </label>
            <input
              type="text"
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
              className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Data da Compra
            </label>
            <input
              type="text"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            {!isNew && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Deseja realmente excluir o item "${item.descricao}"?`)) {
                    onDelete(item.id, item);
                    onClose();
                  }
                }}
                className="py-2.5 px-3 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Item
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isNew ? 'Adicionar Item' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

