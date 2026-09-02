import React, { useState, useRef } from 'react';
import {
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FileUp,
  HelpCircle,
  Check,
  AlertCircle,
  Table,
  Database,
  HardDrive,
  Sparkles,
  Info,
  X,
  FileSpreadsheet,
  Layers,
  ArrowRight
} from 'lucide-react';
import { NFCeItem, NFCeReceipt } from '../types';
import {
  generateGoogleSheetsTSV,
  generateGoogleSheetsCSV,
  downloadFile,
  copyToClipboard
} from '../utils/exporter';
import { downloadBackupJSON, importBackupData, importBackupMatrix } from '../utils/storage';
import { formatBRL } from '../utils/nfceParser';

interface AppActionsTabProps {
  items: NFCeItem[];
  receipts: NFCeReceipt[];
  onRestoreBackup: (items: NFCeItem[], receipts: NFCeReceipt[]) => void;
  onGoToReport?: () => void;
}

export const AppActionsTab: React.FC<AppActionsTabProps> = ({
  items,
  receipts,
  onRestoreBackup,
  onGoToReport
}) => {
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [isProcedureModalOpen, setIsProcedureModalOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // Total statistics
  const totalGasto = items.reduce((sum, it) => sum + (it.valorTotal || 0), 0);
  const totalNotas = new Set(items.map((it) => it.receiptId || it.razaoSocial + it.data)).size;

  // 1. Copy to Google Sheets (TSV format)
  const handleCopyToSheets = async () => {
    if (items.length === 0) {
      setNotice({
        type: 'error',
        text: 'Não há itens na lista para copiar. Escaneie uma nota ou carregue itens primeiro.'
      });
      setTimeout(() => setNotice(null), 5000);
      return;
    }

    const tsv = generateGoogleSheetsTSV(items);
    const success = await copyToClipboard(tsv);
    if (success) {
      setCopiedSuccess(true);
      setNotice({
        type: 'success',
        text: '✓ Dados formatados em 9 colunas copiados! Abra sua planilha do Google e pressione Ctrl+V.'
      });
      setTimeout(() => setCopiedSuccess(false), 4000);
      setTimeout(() => setNotice(null), 6000);
    } else {
      setNotice({
        type: 'error',
        text: 'Erro ao copiar dados para a área de transferência.'
      });
      setTimeout(() => setNotice(null), 5000);
    }
  };

  // 2. Download CSV
  const handleDownloadCSV = () => {
    if (items.length === 0) {
      setNotice({
        type: 'error',
        text: 'Não há itens para exportar em CSV.'
      });
      setTimeout(() => setNotice(null), 5000);
      return;
    }

    try {
      const csv = generateGoogleSheetsCSV(items, ';');
      const filename = `nfce_export_${new Date().toISOString().slice(0, 10)}_${items.length}_itens.csv`;
      downloadFile(csv, filename, 'text/csv;charset=utf-8;');
      setNotice({
        type: 'success',
        text: `✓ Arquivo CSV com ${items.length} itens baixado com sucesso!`
      });
      setTimeout(() => setNotice(null), 5000);
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: 'Erro ao gerar arquivo CSV: ' + (err?.message || '')
      });
      setTimeout(() => setNotice(null), 5000);
    }
  };

  // 3. Export JSON Backup
  const handleExportBackup = () => {
    if (items.length === 0) {
      setNotice({
        type: 'error',
        text: 'Não há dados salvos para gerar arquivo de backup.'
      });
      setTimeout(() => setNotice(null), 5000);
      return;
    }

    try {
      downloadBackupJSON();
      setNotice({
        type: 'success',
        text: `✓ Arquivo de Backup (.json) baixado com sucesso contendo todos os ${items.length} itens salvos!`
      });
      setTimeout(() => setNotice(null), 6000);
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: 'Erro ao gerar arquivo de backup: ' + (err?.message || '')
      });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  // 4. Load JSON Backup (Offline)
  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const result = importBackupData(content, 'merge');
      if (result.success) {
        onRestoreBackup(result.items, result.receipts);
        const addedMsg = result.newItemsCount !== undefined && result.newItemsCount > 0
          ? `✓ Backup JSON restaurado com sucesso! ${result.newItemsCount} novos itens adicionados. O aplicativo agora contém ${result.items.length} itens em ${result.receipts.length} recibos.`
          : `✓ Backup JSON restaurado com sucesso! Total de ${result.items.length} itens e ${result.receipts.length} recibos carregados.`;
        setNotice({
          type: 'success',
          text: addedMsg
        });
        setTimeout(() => setNotice(null), 7000);
      } else {
        setNotice({
          type: 'error',
          text: result.error || 'Erro ao processar o arquivo de backup JSON.'
        });
        setTimeout(() => setNotice(null), 7000);
      }
    };

    reader.onerror = () => {
      setNotice({
        type: 'error',
        text: 'Erro ao ler o arquivo JSON selecionado no seu dispositivo.'
      });
      setTimeout(() => setNotice(null), 6000);
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  // 5. Import CSV / TXT / Excel Spreadsheet
  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const allRows: (string | number | null | undefined)[][] = [];
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          if (sheet) {
            const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as (string | number)[][];
            if (sheetRows && sheetRows.length > 0) {
              allRows.push(...sheetRows);
            }
          }
        }
        const result = importBackupMatrix(allRows, 'merge');
        if (result.success) {
          onRestoreBackup(result.items, result.receipts);
          const addedMsg = result.newItemsCount !== undefined && result.newItemsCount > 0
            ? `✓ Planilha Excel importada com sucesso! ${result.newItemsCount} novos itens adicionados. Total: ${result.items.length} itens.`
            : `✓ Planilha Excel carregada com sucesso! Total: ${result.items.length} itens.`;
          setNotice({
            type: 'success',
            text: addedMsg
          });
          setTimeout(() => setNotice(null), 7000);
        } else {
          setNotice({
            type: 'error',
            text: result.error || 'Erro ao processar a planilha Excel.'
          });
          setTimeout(() => setNotice(null), 7000);
        }
      } else {
        let content = await file.text();
        if (content.includes('\ufffd')) {
          const reader = new FileReader();
          content = await new Promise((resolve) => {
            reader.onload = (event) => resolve((event.target?.result as string) || '');
            reader.readAsText(file, 'ISO-8859-1');
          });
        }

        const result = importBackupData(content, 'merge');
        if (result.success) {
          onRestoreBackup(result.items, result.receipts);
          const addedMsg = result.newItemsCount !== undefined && result.newItemsCount > 0
            ? `✓ Planilha importada com sucesso! ${result.newItemsCount} novos itens adicionados. Total: ${result.items.length} itens.`
            : `✓ Planilha carregada com sucesso! Total: ${result.items.length} itens.`;
          setNotice({
            type: 'success',
            text: addedMsg
          });
          setTimeout(() => setNotice(null), 7000);
        } else {
          setNotice({
            type: 'error',
            text: result.error || 'Erro ao processar a planilha CSV/Excel.'
          });
          setTimeout(() => setNotice(null), 7000);
        }
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: 'Erro ao ler o arquivo selecionado: ' + (err?.message || '')
      });
      setTimeout(() => setNotice(null), 6000);
    }

    e.target.value = '';
  };

  return (
    <div id="actions-tab-screen" className="w-full max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Ações & Integrações do App</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              3. Ações do App
            </h1>
            <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
              Exporte seus dados para o Google Planilhas, gere cópias de segurança em CSV ou realize backups offline completos para guardar seu histórico.
            </p>
          </div>

          {/* Quick Summary Badge */}
          <div className="bg-white/10 backdrop-blur-md border border-white/15 p-4 rounded-2xl shrink-0 flex items-center gap-4">
            <div>
              <span className="text-[11px] text-slate-300 uppercase tracking-wider block font-bold">
                Total na Memória
              </span>
              <span className="text-xl font-black text-emerald-300">
                {formatBRL(totalGasto)}
              </span>
              <span className="text-xs text-slate-300 block font-medium">
                {items.length} itens em {totalNotas} notas
              </span>
            </div>
            {onGoToReport && (
              <button
                type="button"
                onClick={onGoToReport}
                className="py-2 px-3 bg-white text-slate-900 hover:bg-emerald-50 font-bold text-xs rounded-xl transition-colors flex items-center gap-1 shadow-sm"
              >
                <span>Ver Tabela</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {notice && (
        <div
          className={`p-4 rounded-2xl text-sm font-medium flex items-center justify-between gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-200 ${
            notice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-700 text-red-900 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {notice.type === 'success' ? (
              <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid of Action Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* BLOCK 1: Google Planilhas & Exportação */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Google Planilhas & Exportação
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Formato padrão com 9 colunas inteligentes (6 básicas + 3 de classificação)
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
              <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Estrutura das 9 Colunas:
              </p>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Data • Razão Social • Tipo • Produto • Detalhe • Descrição • Quantidade • Preço por Kg • Valor Total (R$)
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {/* Copiar p/ Google Sheets */}
            <button
              id="action-copy-to-sheets-btn"
              type="button"
              onClick={handleCopyToSheets}
              disabled={items.length === 0}
              className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 min-h-[48px] cursor-pointer"
            >
              {copiedSuccess ? (
                <>
                  <Check className="w-5 h-5 text-emerald-200 animate-bounce" />
                  <span>Copiado com Sucesso! Cole no Sheets</span>
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  <span>Copiar p/ Google Sheets</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Baixar CSV */}
              <button
                id="action-download-csv-btn"
                type="button"
                onClick={handleDownloadCSV}
                disabled={items.length === 0}
                className="py-3 px-3 rounded-2xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer disabled:opacity-50"
                title="Baixar arquivo CSV compatível com Planilhas"
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span>Baixar CSV</span>
              </button>

              {/* Importar Planilha CSV / Excel */}
              <button
                id="action-import-csv-btn"
                type="button"
                onClick={() => csvFileInputRef.current?.click()}
                className="py-3 px-3 rounded-2xl border border-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer"
                title="Importar planilha de compras Excel (.xlsx) ou CSV"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Importar CSV / Excel</span>
              </button>

              {/* Abrir Google Planilhas */}
              <a
                id="action-open-sheets-link"
                href="https://sheets.new"
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-3 rounded-2xl bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
              >
                <span>Abrir Planilha</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Hidden Input for CSV & Excel */}
            <input
              ref={csvFileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
              onChange={handleCsvFileChange}
              className="hidden"
            />
          </div>
        </div>

        {/* BLOCK 2: Backup App Offline (Specifically requested field) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Backup App Offline
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cópia de segurança física e restauração completa
                  </p>
                </div>
              </div>

              {/* Novo Botão "Procedimento" */}
              <button
                id="action-procedure-btn"
                type="button"
                onClick={() => setIsProcedureModalOpen(true)}
                className="py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-colors flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800/60 shadow-xs cursor-pointer"
                title="Ver procedimento e utilidade dos backups"
              >
                <HelpCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Procedimento</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
              <p className="font-semibold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Segurança dos seus Dados:
              </p>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                Gere um arquivo JSON com todas as notas fiscais e itens cadastrados para guardar no seu computador ou transferir para a versão offline em outro aparelho.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Fazer Backup (JSON) */}
              <button
                id="action-export-backup-btn"
                type="button"
                onClick={handleExportBackup}
                disabled={items.length === 0}
                className="py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
                title="Fazer backup de todos os itens salvos em arquivo JSON"
              >
                <FileDown className="w-5 h-5 text-indigo-200" />
                <span>Fazer Backup (JSON)</span>
              </button>

              {/* Carregar JSON para a Versão Offline */}
              <button
                id="action-import-json-backup-btn"
                type="button"
                onClick={() => jsonFileInputRef.current?.click()}
                className="py-3.5 px-4 rounded-2xl border-2 border-indigo-500/40 dark:border-indigo-500/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 min-h-[48px] cursor-pointer shadow-xs"
                title="Carregar arquivo JSON de backup para o aplicativo offline"
              >
                <FileUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Carregar JSON (Offline)</span>
              </button>
            </div>

            {/* Hidden File Input for JSON */}
            <input
              ref={jsonFileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleJsonFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* PROCEDIMENTO MODAL */}
      {isProcedureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Procedimento: Utilidade dos Botões de Backup
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Como funciona o Backup e a Restauração offline
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProcedureModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body - Verbatim Explanation as requested */}
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">
              {/* Item 1: Fazer Backup */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
                  <span className="text-xl">💾</span>
                  <span>1. Fazer Backup (JSON)</span>
                </h4>
                <div className="space-y-2 text-xs sm:text-sm pl-2">
                  <p>
                    <strong className="text-slate-900 dark:text-white">• O que faz:</strong> Gera e baixa para o seu computador/celular um arquivo (ex: <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-mono text-xs">backup_nfce_...json</code>) contendo <strong>todos os seus itens, notas fiscais, classificações, categorias e edições manuais</strong>.
                  </p>
                  <div>
                    <strong className="text-slate-900 dark:text-white">• Para que serve:</strong>
                    <ol className="list-decimal list-inside pl-2 space-y-1 mt-1 text-slate-600 dark:text-slate-400">
                      <li>
                        <strong className="text-slate-800 dark:text-slate-200">Segurança total:</strong> Cria uma cópia física offline dos seus dados para guardar no seu computador, pen drive ou Google Drive.
                      </li>
                      <li>
                        <strong className="text-slate-800 dark:text-slate-200">Histórico mensal/anual:</strong> Permite arquivar um mês fechado de compras antes de limpar a tabela para iniciar um novo mês.
                      </li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Item 2: Restaurar Backup */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
                  <span className="text-xl">📥</span>
                  <span>2. Restaurar Backup</span>
                </h4>
                <div className="space-y-2 text-xs sm:text-sm pl-2">
                  <p>
                    <strong className="text-slate-900 dark:text-white">• O que faz:</strong> Permite que você selecione um arquivo <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 font-mono text-xs">.json</code> salvo anteriormente para <strong>recarregar todas as compras e notas fiscais de volta no aplicativo</strong>.
                  </p>
                  <div>
                    <strong className="text-slate-900 dark:text-white">• Opções e Funcionamento:</strong>
                    <ul className="list-disc list-inside pl-2 space-y-1 mt-1 text-slate-600 dark:text-slate-400">
                      <li>
                        Restaura imediatamente o catálogo completo com preços por quilo e dados das notas fiscais.
                      </li>
                      <li>
                        Se você estiver logado na Nuvem Google, os dados restaurados são sincronizados automaticamente.
                      </li>
                    </ul>
                  </div>
                  <div className="pt-1">
                    <strong className="text-slate-900 dark:text-white">• Para que serve:</strong>
                    <ul className="list-disc list-inside pl-2 space-y-1 mt-1 text-slate-600 dark:text-slate-400">
                      <li>Recuperar seus dados caso você limpe o navegador por engano.</li>
                      <li>Transferir compras de uma máquina para outra sem precisar de internet ou login.</li>
                      <li>Reabrir o histórico de compras de meses anteriores para consulta ou reanálise.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsProcedureModalOpen(false)}
                className="py-2.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
