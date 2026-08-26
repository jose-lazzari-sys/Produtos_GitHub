import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  Upload,
  Link as LinkIcon,
  Flashlight,
  SwitchCamera,
  AlertTriangle,
  Loader2,
  FileCode,
  CheckCircle2,
  Sparkles,
  QrCode,
  RefreshCw
} from 'lucide-react';
import { NFCeReceipt } from '../types';
import { classifyProduct } from '../utils/classifier';
import { generateUniqueId } from '../utils/storage';

interface QRScannerProps {
  onReceiptParsed: (receipt: NFCeReceipt) => void;
  onOpenXmlModal: (url?: string, initialError?: string) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  onReceiptParsed,
  onOpenXmlModal,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [manualUrl, setManualUrl] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [isProcessingFetch, setIsProcessingFetch] = useState(false);
  const [lastScannedUrl, setLastScannedUrl] = useState<string | null>(null);

  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize camera list on mount
  useEffect(() => {
    async function initCameraDevices() {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back/rear camera
          const backCam = devices.find(
            (d) => /back|rear|traseira|ambiente|environment/i.test(d.label)
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      } catch (err) {
        console.warn('Camera device listing notice:', err);
      }
    }

    initCameraDevices();

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (cameraId?: string) => {
    setCameraError(null);
    const camId = cameraId || selectedCameraId;

    try {
      if (qrScannerRef.current) {
        await stopCamera();
      }

      const html5QrCode = new Html5Qrcode('qr-reader-container', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      qrScannerRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const boxSize = Math.max(220, Math.floor(minDim * 0.72));
          return { width: boxSize, height: boxSize };
        },
        aspectRatio: 1.0,
      };

      // Strategy 1: Try with exact deviceId or facingMode
      try {
        const cameraParam = camId ? { deviceId: { exact: camId } } : { facingMode: 'environment' };
        await html5QrCode.start(
          cameraParam,
          config,
          (decodedText) => {
            handleQRCodeScanned(decodedText);
          },
          () => {
            // Frame scan cycle
          }
        );
      } catch (firstErr) {
        console.warn('Initial camera start attempt failed, trying fallback to facingMode: environment...', firstErr);
        // Strategy 2: Fallback directly to { facingMode: "environment" } or { facingMode: "user" }
        try {
          await html5QrCode.start(
            { facingMode: 'environment' },
            config,
            (decodedText) => {
              handleQRCodeScanned(decodedText);
            },
            () => {}
          );
        } catch (secondErr) {
          console.warn('Second attempt failed, trying fallback to basic video stream constraints...', secondErr);
          // Strategy 3: Basic start with any available camera
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            await html5QrCode.start(
              devices[0].id,
              config,
              (decodedText) => {
                handleQRCodeScanned(decodedText);
              },
              () => {}
            );
          } else {
            throw secondErr;
          }
        }
      }

      setIsScanning(true);

      // Check for torch capability
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if (capabilities && (capabilities as any).torch) {
          setHasTorch(true);
        }
      } catch {
        setHasTorch(false);
      }
    } catch (err: any) {
      console.error('Failed to start camera scanner:', err);
      const isSecure = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
      if (!isSecure) {
        setCameraError(
          'O navegador do celular bloqueia a câmera em conexões HTTP sem SSL (a câmera só funciona em HTTPS ou localhost). Utilize o link da nuvem com HTTPS ou faça upload da foto do QR Code.'
        );
      } else if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        setCameraError(
          'Permissão da câmera foi negada. Toque no ícone de cadeado/permissões ao lado da barra de endereço no celular e permita o acesso à Câmera.'
        );
      } else {
        setCameraError(
          'Não foi possível inicializar a câmera do celular. Verifique a permissão ou use o botão "Carregar Foto / Imagem" abaixo.'
        );
      }
      setIsScanning(false);
    }
  };

  const stopCamera = async () => {
    if (qrScannerRef.current && qrScannerRef.current.isScanning) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }
    setIsScanning(false);
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!qrScannerRef.current || !hasTorch) return;
    try {
      const newTorch = !torchOn;
      await qrScannerRef.current.applyVideoConstraints({
        advanced: [{ torch: newTorch } as any],
      });
      setTorchOn(newTorch);
    } catch (err) {
      console.warn('Torch toggle not supported', err);
    }
  };

  const switchCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCam = cameras[nextIndex];
    setSelectedCameraId(nextCam.id);
    if (isScanning) {
      await startCamera(nextCam.id);
    }
  };

  // Process Scanned URL or text
  const handleQRCodeScanned = async (qrText: string) => {
    if (isProcessingFetch) return;

    // Beep or haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }

    setLastScannedUrl(qrText);
    await stopCamera();
    await processNFCeUrl(qrText);
  };

  const processNFCeUrl = async (url: string) => {
    setIsProcessingFetch(true);
    setLoadingMessage('Consultando dados da NFC-e na Sefaz SP...');

    try {
      const response = await fetch('/api/parse-nfce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (data.success && data.receipt) {
        const receiptId = generateUniqueId('rcpt');
        const finalRazaoSocial = data.receipt.razaoSocial || 'Estabelecimento Sefaz SP';
        const finalData = data.receipt.data || new Date().toLocaleString('pt-BR');

        const finalReceipt: NFCeReceipt = {
          id: receiptId,
          url,
          razaoSocial: finalRazaoSocial,
          cnpj: data.receipt.cnpj || '',
          data: finalData,
          numeroNota: data.receipt.numeroNota || '',
          serie: data.receipt.serie || '',
          valorTotal: data.receipt.valorTotal || 0,
          itens: data.receipt.itens.map((it: any) => {
            const c = classifyProduct(it.descricao);
            return {
              ...it,
              id: generateUniqueId('item'),
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
      } else if (data.captchaDetected || data.needsManualInput) {
        // Required Captcha behavior: "Abra manualmente e cole o XML aqui"
        onOpenXmlModal(url, 'A Sefaz SP exigiu validação de Captcha.');
      } else {
        onOpenXmlModal(url, data.errorMessage || 'Não foi possível ler os itens automaticamente.');
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      onOpenXmlModal(url, 'Erro de conexão com o servidor. Abra manualmente e cole o XML aqui.');
    } finally {
      setIsProcessingFetch(false);
      setLoadingMessage(null);
    }
  };

  // Image Upload Scanner
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingMessage('Analisando QR Code da imagem...');
    setIsProcessingFetch(true);

    try {
      const html5QrCode = new Html5Qrcode('qr-reader-temp', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });

      const qrResult = await html5QrCode.scanFile(file, true);
      html5QrCode.clear();

      if (qrResult) {
        setLastScannedUrl(qrResult);
        await processNFCeUrl(qrResult);
      } else {
        alert('Nenhum QR Code legível foi encontrado nesta imagem.');
      }
    } catch (err: any) {
      console.error('File scan error:', err);
      alert('Não foi possível identificar o QR Code na imagem selecionada. Tente aproximar ou utilize a câmera.');
    } finally {
      setIsProcessingFetch(false);
      setLoadingMessage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl.trim()) return;
    processNFCeUrl(manualUrl.trim());
  };

  const handleSampleUrl = () => {
    const sampleUrl = 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35260812345678000190650010000492811000492812|2|1|1|D3F4B72C9E10';
    setManualUrl(sampleUrl);
  };

  return (
    <div id="qr-scanner-wrapper" className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Hidden container for temp file scanning */}
      <div id="qr-reader-temp" className="hidden" />

      {/* Main Camera Viewport Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {/* Card Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Leitor de QR Code NFC-e
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sefaz SP • Extração automática e classificação
              </p>
            </div>
          </div>

          {/* Quick status pill */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Pronto</span>
          </div>
        </div>

        {/* Camera Stage */}
        <div className="relative bg-slate-950 flex flex-col items-center justify-center min-h-[300px] sm:min-h-[340px] overflow-hidden">
          {/* HTML5 QR Container */}
          <div
            id="qr-reader-container"
            className={`w-full max-w-sm ${isScanning ? 'block' : 'hidden'}`}
          />

          {/* Scanner Overlay UI when Scanning */}
          {isScanning && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Focus Box */}
              <div className="w-64 h-64 border-2 border-emerald-400 rounded-3xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                {/* Corner Accents */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

                {/* Animated Scan Line */}
                <div className="w-full h-0.5 bg-emerald-400/80 shadow-[0_0_8px_#34d399] absolute top-0 animate-[bounce_2s_infinite]" />
              </div>
              <p className="mt-4 text-xs font-semibold text-white/90 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-xs">
                Aponte para o QR Code da nota fiscal paulista
              </p>
            </div>
          )}

          {/* Idle State when Camera is OFF */}
          {!isScanning && !isProcessingFetch && (
            <div className="p-8 text-center space-y-4 max-w-md">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-slate-900 border border-slate-800 text-emerald-400 flex items-center justify-center shadow-inner">
                <Camera className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <p className="text-white font-bold text-base">
                  Câmera pronta para leitura
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Toque no botão grande abaixo para abrir a câmera do celular e escanear o QR Code da NFC-e da Sefaz SP.
                </p>
              </div>
            </div>
          )}

          {/* Loading Spinner during fetch or scan */}
          {isProcessingFetch && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 space-y-3 z-20">
              <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
              <p className="text-white font-bold text-sm text-center">
                {loadingMessage || 'Processando nota fiscal...'}
              </p>
              <p className="text-xs text-slate-400 text-center max-w-xs">
                Extraindo Razão Social, Data, Itens e aplicando regras de classificação...
              </p>
            </div>
          )}

          {/* In-camera Controls (Torch & Switch) */}
          {isScanning && (
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              {hasTorch && (
                <button
                  onClick={toggleTorch}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                    torchOn ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-black/60 text-white backdrop-blur-xs'
                  }`}
                  title="Ligar Lanterna"
                >
                  <Flashlight className="w-5 h-5" />
                </button>
              )}
              {cameras.length > 1 && (
                <button
                  onClick={switchCamera}
                  className="w-11 h-11 rounded-full bg-black/60 text-white backdrop-blur-xs flex items-center justify-center hover:bg-black/80 transition-all"
                  title="Trocar Câmera"
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Camera Error Banner */}
        {cameraError && (
          <div className="m-4 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold">Aviso de Acesso à Câmera</p>
              <p>{cameraError}</p>
            </div>
          </div>
        )}

        {/* Primary Action Controls (Large Mobile-First Buttons) */}
        <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 space-y-3">
          {!isScanning ? (
            <button
              id="start-camera-btn"
              type="button"
              onClick={() => startCamera()}
              disabled={isProcessingFetch}
              className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-base sm:text-lg font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3 touch-manipulation min-h-[56px]"
            >
              <Camera className="w-6 h-6" />
              <span>Abrir Câmera e Ler QR Code</span>
            </button>
          ) : (
            <button
              id="stop-camera-btn"
              type="button"
              onClick={stopCamera}
              className="w-full py-4 px-6 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white text-base font-bold shadow-md transition-all flex items-center justify-center gap-2 min-h-[56px]"
            >
              <span>Parar Câmera</span>
            </button>
          )}

          {/* Secondary Quick Action: Image Upload & Captcha Fallback */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              id="upload-qr-img-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFetch}
              className="w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all flex items-center justify-center gap-2 min-h-[48px]"
            >
              <Upload className="w-4 h-4 text-slate-500" />
              <span>Carregar Foto / Imagem</span>
            </button>

            <button
              id="open-manual-xml-btn"
              type="button"
              onClick={() => onOpenXmlModal(lastScannedUrl || undefined)}
              className="w-full py-3.5 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm font-bold transition-all flex items-center justify-center gap-2 min-h-[48px]"
            >
              <FileCode className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Abra manualmente e cole o XML aqui</span>
            </button>
          </div>
        </div>
      </div>

      {/* Manual URL / Chave de Acesso Input Accordion/Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="manual-url-input" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-slate-400" />
            Ou cole o Link da NFC-e da Sefaz SP
          </label>
          <button
            type="button"
            onClick={handleSampleUrl}
            className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Preencher link de teste
          </button>
        </div>

        <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <input
            id="manual-url-input"
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=..."
            className="flex-1 p-3 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-mono"
          />
          <button
            id="fetch-manual-url-btn"
            type="submit"
            disabled={!manualUrl.trim() || isProcessingFetch}
            className="py-3 px-5 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs sm:text-sm font-bold shadow-md disabled:opacity-40 transition-all flex items-center justify-center gap-2 shrink-0 min-h-[44px]"
          >
            {isProcessingFetch ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>Buscar Nota</span>
          </button>
        </form>
      </div>
    </div>
  );
};
