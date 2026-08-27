import React, { useState, useEffect } from 'react';
import { X, FileCode, ExternalLink, Sparkles, AlertCircle, CheckCircle2, Copy, Check, Info, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';
import { parseUniversalNFCe } from '../utils/nfceParser';
import { classifyProduct } from '../utils/classifier';
import { NFCeReceipt } from '../types';

interface XmlPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReceiptParsed: (receipt: NFCeReceipt) => void;
  currentUrl?: string;
  initialError?: string;
}

export const XmlPasteModal: React.FC<XmlPasteModalProps> = ({
  isOpen,
  onClose,
  onReceiptParsed,
  currentUrl,
  initialError,
}) => {
  const [content, setContent] = useState('');
  const [errorMessage, setErrorMessage] = useState(initialError || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (initialError) {
      setErrorMessage(initialError);
    }
  }, [initialError]);

  if (!isOpen) return null;

  // Extract 44-digit key if present in currentUrl
  const cleanDigits = (currentUrl || '').replace(/\D/g, '');
  const chaveAcesso = cleanDigits.length === 44 ? cleanDigits : (currentUrl?.match(/\b(\d{44})\b/)?.[1] || (cleanDigits.length > 44 ? cleanDigits.slice(0, 44) : ''));

  // Formatted 44 digits for display
  const chaveFormatada = chaveAcesso.match(/.{1,4}/g)?.join(' ') || chaveAcesso;

  // Direct official Sefaz SP Consultation links
  const sefazUrlToOpen = chaveAcesso
    ? `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=${chaveAcesso}|3|1`
    : (currentUrl && currentUrl.startsWith('http')
      ? currentUrl
      : 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx');

  const handleCopyChave = () => {
    if (!chaveAcesso) return;
    try {
      navigator.clipboard.writeText(chaveAcesso);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleRetryAuto = async () => {
    setIsRetrying(true);
    setErrorMessage('');
    try {
      const payload = {
        url: currentUrl || (chaveAcesso ? `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=${chaveAcesso}|3|1` : undefined),
        accessKey: chaveAcesso || undefined
      };

      const res = await fetch('/api/parse-nfce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success && data.receipt) {
        const receiptId = `rcpt_${Date.now()}`;
        const finalRazaoSocial = data.receipt.razaoSocial || 'Estabelecimento Sefaz SP';
        const finalData = data.receipt.data || new Date().toLocaleString('pt-BR');

        const finalReceipt: NFCeReceipt = {
          id: receiptId,
          url: data.receipt.url || currentUrl,
          razaoSocial: finalRazaoSocial,
          cnpj: data.receipt.cnpj || '',
          data: finalData,
          numeroNota: data.receipt.numeroNota || '',
          serie: data.receipt.serie || '',
          valorTotal: data.receipt.valorTotal || 0,
          itens: data.receipt.itens.map((it: any, idx: number) => {
            const c = classifyProduct(it.descricao);
            return {
              ...it,
              id: `item_${Date.now()}_${idx}`,
              receiptId,
              razaoSocial: it.razaoSocial || finalRazaoSocial,
              data: it.data || finalData,
              tipo: c.tipo,
              produto: c.produto,
              detalhe: c.detalhe,
            };
          }),
          scannedAt: new Date().toISOString(),
        };

        onReceiptParsed(finalReceipt);
        onClose();
      } else {
        setErrorMessage(data.errorMessage || 'A Sefaz SP ainda não liberou os dados automaticamente. Por favor abra o link da Sefaz abaixo e cole o texto da página.');
      }
    } catch (err: any) {
      setErrorMessage('Erro ao tentar novamente: ' + (err.message || 'Falha na conexão'));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleProcess = () => {
    setErrorMessage('');
    if (!content.trim()) {
      setErrorMessage('Por favor, cole o código XML, HTML ou texto da NFC-e no campo abaixo.');
      return;
    }

    setIsProcessing(true);
    try {
      const parsed = parseUniversalNFCe(content);
      if (!parsed || parsed.itens.length === 0) {
        setErrorMessage('Não foi possível reconhecer itens válidos no conteúdo colado. Certifique-se de copiar todo o conteúdo da página ou o XML.');
        setIsProcessing(false);
        return;
      }

      const receiptId = `rcpt_${Date.now()}`;
      const finalRazaoSocial = parsed.razaoSocial || 'Estabelecimento Sefaz SP';
      const finalData = parsed.data || new Date().toLocaleString('pt-BR');

      const finalReceipt: NFCeReceipt = {
        id: receiptId,
        url: currentUrl,
        razaoSocial: finalRazaoSocial,
        cnpj: parsed.cnpj,
        data: finalData,
        numeroNota: parsed.numeroNota,
        serie: parsed.serie,
        valorTotal: parsed.valorTotal,
        itens: parsed.itens.map((it, idx) => {
          const c = classifyProduct(it.descricao);
          return {
            ...it,
            id: `item_${Date.now()}_${idx}`,
            receiptId,
            razaoSocial: it.razaoSocial || finalRazaoSocial,
            data: it.data || finalData,
            tipo: c.tipo,
            produto: c.produto,
            detalhe: c.detalhe,
          };
        }),
        scannedAt: new Date().toISOString(),
      };

      onReceiptParsed(finalReceipt);
      onClose();
    } catch (err: any) {
      setErrorMessage('Erro ao interpretar dados: ' + (err.message || 'Formato não suportado'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadSampleXml = () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35260812345678000190650010000492811000492812" versao="4.00">
      <ide>
        <dhEmi>2026-08-15T14:30:00-03:00</dhEmi>
        <nNF>49281</nNF>
        <serie>1</serie>
      </ide>
      <emit>
        <CNPJ>61585865000151</CNPJ>
        <xNome>SUPERMERCADO PAO DE ACUCAR SP LTDA</xNome>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>10293</cProd>
          <xProd>ARROZ TIO JOAO TIPO 1 5KG</xProd>
          <qCom>1.0000</qCom>
          <uCom>UN</uCom>
          <vUnCom>31.90</vUnCom>
          <vProd>31.90</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>20485</cProd>
          <xProd>FEIJAO CARIOCA CAMIL 1KG</xProd>
          <qCom>2.0000</qCom>
          <uCom>UN</uCom>
          <vUnCom>7.90</vUnCom>
          <vProd>15.80</vProd>
        </prod>
      </det>
      <det nItem="3">
        <prod>
          <cProd>30912</cProd>
          <xProd>PICANHA BOVINA KG</xProd>
          <qCom>1.2000</qCom>
          <uCom>KG</uCom>
          <vUnCom>89.90</vUnCom>
          <vProd>107.88</vProd>
        </prod>
      </det>
      <det nItem="4">
        <prod>
          <cProd>40112</cProd>
          <xProd>REFRIGERANTE COCA COLA 2L</xProd>
          <qCom>2.0000</qCom>
          <uCom>UN</uCom>
          <vUnCom>9.99</vUnCom>
          <vProd>19.98</vProd>
        </prod>
      </det>
      <det nItem="5">
        <prod>
          <cProd>50881</cProd>
          <xProd>CREME DENTAL COLGATE TOTAL 12 90G</xProd>
          <qCom>2.0000</qCom>
          <uCom>UN</uCom>
          <vUnCom>7.90</vUnCom>
          <vProd>15.80</vProd>
        </prod>
      </det>
      <det nItem="6">
        <prod>
          <cProd>60219</cProd>
          <xProd>SABAO EM PO OMO LAVAGEM PERFEITA 1.6KG</xProd>
          <qCom>1.0000</qCom>
          <uCom>UN</uCom>
          <vUnCom>28.90</vUnCom>
          <vProd>28.90</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>220.26</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;
    setContent(sampleXml);
    setErrorMessage('');
  };

  return (
    <div id="xml-paste-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div 
        id="xml-paste-modal-card" 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Consulta Sefaz SP • Proteção Captcha</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A Sefaz SP exige confirmação humana para liberar os itens do cupom fiscal
              </p>
            </div>
          </div>
          <button
            id="close-xml-modal-btn"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Diagnostic Info Box */}
          <div className="p-4 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-2xl space-y-3">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-bold text-sm">Por que a Sefaz pede para abrir a página?</p>
                <p className="leading-relaxed">
                  O portal da <strong>Secretaria da Fazenda de SP (Sefaz SP)</strong> possui proteção de segurança (reCAPTCHA / Bot Protection) que impede servidores de lerem a página diretamente sem validação de segurança.
                </p>
              </div>
            </div>

            {/* Chave de Acesso Copiável */}
            {chaveAcesso && (
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Chave de Acesso da sua Nota:
                  </span>
                  <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white tracking-wide break-all">
                    {chaveFormatada}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyChave}
                  className="py-1.5 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copiada!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Chave</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Step-by-Step Instructions */}
            <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/60 space-y-2">
              <p className="text-xs font-bold text-amber-950 dark:text-amber-100">
                Siga estes 3 passos rápidos para carregar seus produtos:
              </p>
              <ol className="text-xs text-amber-900 dark:text-amber-200 space-y-1.5 list-decimal list-inside pl-1 leading-relaxed">
                <li>
                  Clique no botão abaixo para abrir a página oficial da <strong>Sefaz SP</strong>.
                </li>
                <li>
                  Resolva o desafio do Captcha na tela da Sefaz até ver a listagem dos produtos.
                </li>
                <li>
                  Selecione todo o texto da página (ou código-fonte) com <kbd className="px-1.5 py-0.5 rounded bg-amber-200/70 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-mono text-[11px]">Ctrl+A</kbd> e <kbd className="px-1.5 py-0.5 rounded bg-amber-200/70 dark:bg-amber-900 text-amber-950 dark:text-amber-100 font-mono text-[11px]">Ctrl+C</kbd>, e cole no campo abaixo!
                </li>
              </ol>
            </div>

            {/* Action Buttons: Retry and External Link */}
            <div className="pt-1 flex flex-wrap items-center gap-2.5">
              <button
                id="retry-auto-fetch-btn"
                type="button"
                onClick={handleRetryAuto}
                disabled={isRetrying}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold shadow-sm hover:shadow transition-all cursor-pointer"
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Tentando Sefaz SP...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Tentar Leitura Automática Novamente</span>
                  </>
                )}
              </button>

              <a
                id="open-sefaz-external-link"
                href={sefazUrlToOpen}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold shadow-sm hover:shadow transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir Sefaz SP em Nova Aba</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Paste Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="xml-textarea" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Cole aqui o Conteúdo, HTML ou XML da Nota:
              </label>
              <button
                id="load-sample-xml-btn"
                type="button"
                onClick={handleLoadSampleXml}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Carregar XML de teste
              </button>
            </div>
            <textarea
              id="xml-textarea"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Cole aqui o texto copiado da página da Sefaz SP, o HTML ou o XML..."
              className="w-full p-3 font-mono text-xs text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-hidden transition-all"
            />
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="flex items-center gap-2 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-2xl text-red-700 dark:text-red-300 text-xs font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center gap-3">
          <button
            id="cancel-xml-modal-btn"
            type="button"
            onClick={onClose}
            className="w-full sm:w-1/3 py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Fechar
          </button>
          <button
            id="process-xml-btn"
            type="button"
            onClick={handleProcess}
            disabled={isProcessing || !content.trim()}
            className="w-full sm:w-2/3 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5" />
            {isProcessing ? 'Processando dados...' : 'Processar e Classificar Itens'}
          </button>
        </div>
      </div>
    </div>
  );
};
