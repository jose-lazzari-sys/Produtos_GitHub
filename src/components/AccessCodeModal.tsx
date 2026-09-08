import React, { useState } from 'react';
import { KeyRound, ShieldCheck, Eye, EyeOff, X, Check, AlertCircle, LogOut, Lock } from 'lucide-react';
import { validateAccessCode, saveAccessCode, clearAccessCode, AccessRole } from '../utils/cloudSync';

interface AccessCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCode: string;
  currentRole: AccessRole | null;
  onCodeApplied: (code: string, role: AccessRole) => void;
  onCodeCleared: () => void;
}

export const AccessCodeModal: React.FC<AccessCodeModalProps> = ({
  isOpen,
  onClose,
  currentCode,
  currentRole,
  onCodeApplied,
  onCodeCleared
}) => {
  const [inputCode, setInputCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  const handleApply = (codeToTest?: string) => {
    const code = (codeToTest ?? inputCode).trim().toLowerCase();
    setErrorMessage('');
    setSuccessMessage('');

    if (!code) {
      setErrorMessage('Por favor, informe o código de acesso.');
      return;
    }

    const validated = validateAccessCode(code);
    if (!validated) {
      setErrorMessage('Código de acesso inválido. Verifique o código e tente novamente.');
      return;
    }

    saveAccessCode(validated.code);
    onCodeApplied(validated.code, validated.role);
    setSuccessMessage(`Conectado com sucesso como: ${validated.label}`);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleDisconnect = () => {
    clearAccessCode();
    setInputCode('');
    onCodeCleared();
    setSuccessMessage('Código desconectado. O aplicativo voltou ao modo padrão local.');
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div
      id="access-code-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        id="access-code-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-slate-900 dark:text-white"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Código de Acesso à Nuvem</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sincronize celular e computador instantaneamente
              </p>
            </div>
          </div>
          <button
            id="close-access-code-modal-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Active status if any */}
          {currentRole && (
            <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
              currentRole === 'admin'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800 text-sky-900 dark:text-sky-200'
            }`}>
              <div className="flex items-center gap-2">
                {currentRole === 'admin' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Eye className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                )}
                <div>
                  <span className="font-semibold">Status: </span>
                  <span className="font-bold">
                    {currentRole === 'admin' ? 'Administrador (Acesso Total)' : 'Modo Consulta (Somente Leitura)'}
                  </span>
                </div>
              </div>

              <button
                id="disconnect-code-btn"
                onClick={handleDisconnect}
                className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold flex items-center gap-1 ml-2 shrink-0"
                title="Desconectar este código"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Desconectar</span>
              </button>
            </div>
          )}

          {/* Form input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Digite o Código de Acesso:
            </label>
            <div className="relative">
              <input
                id="input-access-code"
                type={showCode ? 'text' : 'password'}
                value={inputCode}
                onChange={(e) => {
                  setInputCode(e.target.value);
                  setErrorMessage('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApply();
                }}
                placeholder="Informe a chave autorizada..."
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md"
                title={showCode ? 'Ocultar código' : 'Mostrar código'}
              >
                {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error / Success feedback */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Secure Information Box */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
              <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Segurança e Sincronização</span>
            </div>
            <p className="leading-relaxed">
              O código de acesso conecta seu dispositivo à base de dados compartilhada na nuvem. Dispositivos autorizados em <strong>Modo Consulta</strong> acompanham gastos, notas e gráficos em tempo real, mantendo os dados protegidos contra alterações.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-3">
          <button
            id="cancel-access-code-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Fechar
          </button>
          <button
            id="apply-access-code-btn"
            onClick={() => handleApply()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Confirmar Código</span>
          </button>
        </div>
      </div>
    </div>
  );
};
