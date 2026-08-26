import React, { useState } from 'react';
import { 
  Cloud, 
  CloudCheck, 
  CloudOff, 
  RefreshCw, 
  LogIn, 
  LogOut, 
  User as UserIcon,
  ShieldCheck,
  UploadCloud,
  DownloadCloud,
  Check
} from 'lucide-react';
import { User } from '../lib/firebase';

interface CloudSyncHeaderProps {
  user: User | null;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  itemsCount: number;
  onLogin: () => void;
  onLogout: () => void;
  onManualSync: () => void;
  onForceUpload?: () => void;
  onForceDownload?: () => void;
}

export const CloudSyncHeader: React.FC<CloudSyncHeaderProps> = ({
  user,
  isSyncing,
  lastSyncedAt,
  itemsCount,
  onLogin,
  onLogout,
  onManualSync,
  onForceUpload,
  onForceDownload
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-16 right-4 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold animate-bounce">
          <Check className="w-4 h-4 text-emerald-300" />
          <span>{toastMsg}</span>
        </div>
      )}

      {user ? (
        <div className="relative">
          <button
            id="cloud-sync-user-btn"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 py-1.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/80 transition-all shadow-xs"
            title="Sincronização em tempo real ativa na Nuvem"
          >
            {isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-spin" />
            ) : (
              <CloudCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
            
            <div className="flex items-center gap-1.5">
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || 'Usuário'} 
                  className="w-4 h-4 rounded-full border border-emerald-400 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className="max-w-[120px] truncate hidden sm:inline font-bold">
                {user.displayName || user.email?.split('@')[0] || 'Nuvem Conectada'}
              </span>
            </div>

            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </button>

          {/* User Popover Menu */}
          {showUserMenu && (
            <>
              <div 
                className="fixed inset-0 z-50" 
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-4 z-50 space-y-3">
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || 'Avatar'} 
                      className="w-10 h-10 rounded-full border border-emerald-500 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold">
                      <UserIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {user.displayName || 'Conta Conectada'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {user.email || 'Usuário Sincronizado'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                  <div className="flex items-center justify-between font-medium">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Status da Nuvem:
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">Tempo Real Ativo</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span>Itens neste aparelho:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{itemsCount} itens</span>
                  </div>
                  {lastSyncedAt && (
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Última sincronização:</span>
                      <span>{lastSyncedAt.toLocaleTimeString('pt-BR')}</span>
                    </div>
                  )}
                </div>

                <div className="pt-1 flex flex-col gap-2">
                  <button
                    id="cloud-force-upload-btn"
                    onClick={() => {
                      if (onForceUpload) onForceUpload();
                      showToast(`${itemsCount} itens enviados para a nuvem!`);
                      setShowUserMenu(false);
                    }}
                    disabled={isSyncing}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <UploadCloud className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>⬆️ Enviar dados deste aparelho para a Nuvem</span>
                  </button>

                  <button
                    id="cloud-force-download-btn"
                    onClick={() => {
                      if (onForceDownload) onForceDownload();
                      showToast('Buscando dados mais recentes da nuvem...');
                      setShowUserMenu(false);
                    }}
                    disabled={isSyncing}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-indigo-200 dark:border-indigo-800"
                  >
                    <DownloadCloud className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>⬇️ Baixar dados da Nuvem para cá</span>
                  </button>

                  <button
                    id="cloud-logout-btn"
                    onClick={() => {
                      onLogout();
                      setShowUserMenu(false);
                    }}
                    className="w-full py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Desconectar Conta</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          id="cloud-login-btn"
          onClick={onLogin}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/80 transition-all shadow-xs"
          title="Entrar com Google para sincronizar automaticamente no celular e PC"
        >
          <Cloud className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span className="hidden sm:inline">Conectar Nuvem</span>
          <span className="sm:hidden">Nuvem</span>
        </button>
      )}
    </div>
  );
};
