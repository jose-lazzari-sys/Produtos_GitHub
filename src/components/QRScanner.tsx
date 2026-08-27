import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  ExternalLink,
  Smartphone,
  ZoomIn,
  Image as ImageIcon,
  ScanLine,
  KeyRound,
  Clipboard,
  Search,
  Check,
  X,
  RotateCcw
} from 'lucide-react';
import { NFCeReceipt } from '../types';
import { classifyProduct } from '../utils/classifier';
import { generateUniqueId } from '../utils/storage';
import {
  decodeFromImageData,
  decodeFromImageElement,
  isBarcodeDetectorSupported,
} from '../utils/qrDecoder';

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
  const [chaveAcesso, setChaveAcesso] = useState('');
  const [chaveError, setChaveError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [isProcessingFetch, setIsProcessingFetch] = useState(false);
  const [lastScannedUrl, setLastScannedUrl] = useState<string | null>(null);
  const [isIframe, setIsIframe] = useState(false);
  const [engineType, setEngineType] = useState<string>('Standard');
  const [copiedChave, setCopiedChave] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const isScanningActiveRef = useRef<boolean>(false);

  // Play subtle detection beep
  const playScanBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {}
  };

  // Check iframe & list available camera devices
  useEffect(() => {
    try {
      if (window.self !== window.top) {
        setIsIframe(true);
      }
    } catch {
      setIsIframe(true);
    }

    if (isBarcodeDetectorSupported()) {
      setEngineType('Hardware/Google Vision (AppSheet Engine)');
    } else {
      setEngineType('High-Speed JS Engine');
    }

    async function loadCameras() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = devices
            .filter((d) => d.kind === 'videoinput')
            .map((d, i) => ({
              id: d.deviceId,
              label: d.label || `Câmera ${i + 1}`,
            }));

          if (videoDevs.length > 0) {
            setCameras(videoDevs);
            const backCam = videoDevs.find((d) =>
              /back|rear|traseira|ambiente|environment/i.test(d.label)
            );
            setSelectedCameraId(backCam ? backCam.id : videoDevs[0].id);
          }
        }
      } catch (e) {
        console.warn('Listing cameras notice:', e);
      }
    }

    loadCameras();

    return () => {
      stopLiveCamera();
    };
  }, []);

  const stopLiveCamera = useCallback(() => {
    isScanningActiveRef.current = false;
    setIsScanning(false);
    setTorchOn(false);

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Process Scanned URL or text
  const handleQRCodeScanned = useCallback(async (qrText: string) => {
    if (isProcessingFetch) return;

    // Haptic & Sound feedback
    if (navigator.vibrate) {
      try {
        navigator.vibrate([80, 50, 80]);
      } catch {}
    }
    playScanBeep();

    setLastScannedUrl(qrText);
    stopLiveCamera();
    await processNFCeUrl(qrText);
  }, [isProcessingFetch, stopLiveCamera]);

  // Video Frame Scanning Loop
  const startScanningLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let lastScanTime = 0;
    const scanInterval = 100; // Scan 10 times per second for smooth battery and maximum accuracy

    const scanTick = async (currentTime: number) => {
      if (!isScanningActiveRef.current) return;

      if (video.readyState >= video.HAVE_CURRENT_DATA && currentTime - lastScanTime >= scanInterval) {
        lastScanTime = currentTime;

        const vw = video.videoWidth;
        const vh = video.videoHeight;

        if (vw > 0 && vh > 0) {
          if (canvas.width !== vw || canvas.height !== vh) {
            canvas.width = vw;
            canvas.height = vh;
          }

          ctx.drawImage(video, 0, 0, vw, vh);
          const imgData = ctx.getImageData(0, 0, vw, vh);

          try {
            const result = await decodeFromImageData(imgData, canvas);
            if (result && result.text) {
              handleQRCodeScanned(result.text);
              return;
            }
          } catch (scanErr) {
            console.warn('Frame scan error:', scanErr);
          }
        }
      }

      if (isScanningActiveRef.current) {
        animationFrameIdRef.current = requestAnimationFrame(scanTick);
      }
    };

    isScanningActiveRef.current = true;
    animationFrameIdRef.current = requestAnimationFrame(scanTick);
  }, [handleQRCodeScanned]);

  // Start live video stream with AppSheet-grade high resolution and continuous autofocus
  const startLiveCamera = async (targetDeviceId?: string) => {
    setCameraError(null);
    stopLiveCamera();

    const isSecure =
      window.isSecureContext ||
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (!isSecure) {
      setCameraError(
        'O navegador móvel bloqueia o acesso à câmera ao vivo em conexões HTTP sem certificado. Abra o link seguro com HTTPS ou utilize o botão "📸 Tirar Foto com a Câmera" abaixo.'
      );
      return;
    }

    const deviceIdToUse = targetDeviceId || selectedCameraId;

    // Build constraints optimized for high density receipt QR codes (1080p + autofocus)
    const constraintList: MediaStreamConstraints[] = [
      // 1. High-Res 1080p with environment facing mode
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          ...(deviceIdToUse ? { deviceId: { exact: deviceIdToUse } } : {}),
        },
      },
      // 2. Standard 720p environment
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
        },
      },
      // 3. Simple facingMode environment
      {
        video: {
          facingMode: 'environment',
        },
      },
      // 4. Any camera
      {
        video: true,
      },
    ];

    let stream: MediaStream | null = null;
    let lastErr: any = null;

    for (const constraints of constraintList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (e: any) {
        lastErr = e;
      }
    }

    if (!stream) {
      console.error('Failed to get camera stream:', lastErr);
      if (lastErr?.name === 'NotAllowedError' || lastErr?.name === 'PermissionDeniedError') {
        setCameraError(
          'Permissão da câmera bloqueada pelo navegador do celular. Toque no ícone de cadeado 🔒 ao lado da barra de endereço para liberar a câmera.'
        );
      } else {
        setCameraError(
          'Não foi possível inicializar a transmissão de vídeo da câmera. Você pode utilizar o botão "📸 Tirar Foto com a Câmera" que abre o aplicativo nativo da sua câmera instantaneamente!'
        );
      }
      return;
    }

    mediaStreamRef.current = stream;

    // Check camera capabilities (Torch, Zoom, Focus)
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      try {
        const capabilities: any = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        if (capabilities.torch) {
          setHasTorch(true);
        } else {
          setHasTorch(false);
        }

        if (capabilities.zoom) {
          setZoomRange({
            min: capabilities.zoom.min || 1,
            max: capabilities.zoom.max || 5,
            step: capabilities.zoom.step || 0.1,
          });
        }
      } catch (capErr) {
        console.warn('Capabilities error:', capErr);
      }
    }

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute('playsinline', 'true');
      try {
        await videoRef.current.play();
        setIsScanning(true);
        startScanningLoop();
      } catch (playErr) {
        console.error('Error playing video stream:', playErr);
      }
    }
  };

  const toggleTorch = async () => {
    if (!mediaStreamRef.current || !hasTorch) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setTorchOn(nextState);
    } catch (e) {
      console.warn('Torch toggle error:', e);
    }
  };

  const handleZoomChange = async (newZoom: number) => {
    setZoomLevel(newZoom);
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      await (track as any).applyConstraints({
        advanced: [{ zoom: newZoom }],
      });
    } catch (e) {
      console.warn('Zoom error:', e);
    }
  };

  const switchCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCam = cameras[nextIndex];
    setSelectedCameraId(nextCam.id);
    if (isScanning) {
      await startLiveCamera(nextCam.id);
    }
  };

  const processNFCeUrl = async (urlOrKey: string) => {
    setIsProcessingFetch(true);
    setLoadingMessage('Consultando dados da NFC-e na Sefaz SP...');

    try {
      const cleanDigits = urlOrKey.replace(/\D/g, '');
      const match44 = urlOrKey.match(/([0-9]{44})/) || (cleanDigits.length === 44 ? [cleanDigits, cleanDigits] : null);
      const accessKey = match44 ? match44[1] : (cleanDigits.length >= 44 ? cleanDigits.slice(0, 44) : undefined);

      const bodyPayload = {
        url: urlOrKey,
        accessKey: accessKey
      };

      const response = await fetch('/api/parse-nfce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await response.json();

      if (data.success && data.receipt) {
        const receiptId = generateUniqueId('rcpt');
        const finalRazaoSocial = data.receipt.razaoSocial || 'Estabelecimento Sefaz SP';
        const finalData = data.receipt.data || new Date().toLocaleString('pt-BR');

        const finalReceipt: NFCeReceipt = {
          id: receiptId,
          url: data.receipt.url || urlOrKey,
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
        onOpenXmlModal(urlOrKey, data.errorMessage || 'A Sefaz SP exigiu validação de segurança (Captcha). Abra a página oficial e cole o conteúdo aqui.');
      } else {
        onOpenXmlModal(urlOrKey, data.errorMessage || 'Não foi possível ler os itens automaticamente.');
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      onOpenXmlModal(urlOrKey, 'Não foi possível conectar diretamente ao servidor da Sefaz. Abra o link da Sefaz e cole o XML/HTML aqui.');
    } finally {
      setIsProcessingFetch(false);
      setLoadingMessage(null);
    }
  };

  // Helper to load file as HTMLImageElement
  const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  };

  // Multi-pass Photo & File Analyzer
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCameraError(null);
    setLoadingMessage('Analisando QR Code da foto com alta precisão...');
    setIsProcessingFetch(true);

    try {
      const img = await loadImageFromFile(file);
      const decoded = await decodeFromImageElement(img);

      if (decoded && decoded.text) {
        playScanBeep();
        setLastScannedUrl(decoded.text);
        await processNFCeUrl(decoded.text);
      } else {
        setCameraError(
          'Não foi possível encontrar o QR Code na foto. Dica: aproxime bem a câmera do QR Code na nota fiscal para que ele ocupe o centro da imagem.'
        );
      }
    } catch (err: any) {
      console.error('Image decode error:', err);
      setCameraError('Erro ao processar imagem. Tente tirar a foto novamente com boa iluminação.');
    } finally {
      setIsProcessingFetch(false);
      setLoadingMessage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraCaptureInputRef.current) cameraCaptureInputRef.current.value = '';
    }
  };

  // Formatter for 44-digit NFC-e Access Key (groups of 4 numbers)
  const formatChaveAcesso = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 44);
    // Split into chunks of 4 digits
    return digits.match(/.{1,4}/g)?.join(' ') || digits;
  };

  const handleChaveAcessoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const rawVal = e.target.value;
    const formatted = formatChaveAcesso(rawVal);
    setChaveAcesso(formatted);
    setChaveError(null);
  };

  const handleClearChave = () => {
    setChaveAcesso('');
    setChaveError(null);
  };

  const getChaveBlocks = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 44);
    const blocks: Array<{ index: number; digits: string; isComplete: boolean; isCurrent: boolean }> = [];
    
    for (let i = 0; i < 11; i++) {
      const start = i * 4;
      const blockDigits = clean.slice(start, start + 4);
      const isComplete = blockDigits.length === 4;
      const isCurrent = clean.length >= start && (clean.length < start + 4 || (i === 10 && clean.length === 44));
      blocks.push({
        index: i + 1,
        digits: blockDigits,
        isComplete,
        isCurrent
      });
    }
    return blocks;
  };

  const getChaveMetadata = (raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (clean.length !== 44) return null;
    const ufCode = clean.slice(0, 2);
    const aamm = clean.slice(2, 6);
    const cnpj = clean.slice(6, 20).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    const mod = clean.slice(20, 22);
    const serie = parseInt(clean.slice(22, 25), 10);
    const numero = parseInt(clean.slice(25, 34), 10);
    
    const ufMap: Record<string, string> = {
      '35': 'SP',
      '33': 'RJ',
      '31': 'MG',
      '41': 'PR',
      '42': 'SC',
      '43': 'RS',
      '52': 'GO',
      '53': 'DF',
      '29': 'BA'
    };

    return {
      uf: ufMap[ufCode] || `UF ${ufCode}`,
      anoMes: `${aamm.slice(2, 4)}/20${aamm.slice(0, 2)}`,
      cnpj,
      modelo: mod === '65' ? 'NFC-e' : 'NF-e',
      serie,
      numero
    };
  };

  const handleChaveAcessoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const digitsOnly = chaveAcesso.replace(/\D/g, '');

    if (digitsOnly.length !== 44) {
      setChaveError(`A chave de acesso deve conter exatamente 44 números (você digitou ${digitsOnly.length}).`);
      return;
    }

    setChaveError(null);
    processNFCeUrl(digitsOnly);
  };

  const handlePasteChave = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const formatted = formatChaveAcesso(text);
          setChaveAcesso(formatted);
          setCopiedChave(true);
          setTimeout(() => setCopiedChave(false), 2000);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleSampleChave = () => {
    const sample = '35260814569191000111653060001331371002622221';
    setChaveAcesso(formatChaveAcesso(sample));
    setChaveError(null);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl.trim()) return;
    processNFCeUrl(manualUrl.trim());
  };

  const handleSampleUrl = () => {
    const sampleUrl =
      'https://www.nfce.fazenda.sp.gov.br/qrcode?p=35260814569191000111653060001331371002622221|2|1|1|68E5136CA668F330BDFAEBACDA57F140CA0FFDA8';
    setManualUrl(sampleUrl);
  };

  const chaveDigitsCount = chaveAcesso.replace(/\D/g, '').length;

  return (
    <div id="qr-scanner-wrapper" className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Offscreen Canvas for real-time video frame decoding */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden file inputs for Native Camera & Gallery */}
      <input
        ref={cameraCaptureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileUpload}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Embedded Iframe Notice Banner */}
      {isIframe && (
        <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              Para melhor experiência no celular e acesso à câmera nativa, abra o aplicativo em uma aba dedicada.
            </span>
          </div>
          <button
            type="button"
            onClick={() => window.open(window.location.href, '_blank')}
            className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <span>Abrir em Nova Aba</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Camera Scanner Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {/* Card Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Leitor de QR Code NFC-e</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  SCAN Pro
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sefaz SP • Leitura instantânea de tickets fiscais
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium">
            <ScanLine className="w-3.5 h-3.5 text-emerald-500" />
            <span>Motor: {engineType}</span>
          </div>
        </div>

        {/* Video Viewport Stage */}
        <div className="relative bg-slate-950 flex flex-col items-center justify-center min-h-[320px] sm:min-h-[360px] overflow-hidden">
          {/* Direct HTML5 Video Stream */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full max-h-[420px] object-cover ${isScanning ? 'block' : 'hidden'}`}
          />

          {/* Real-time Scanning Reticle Overlay */}
          {isScanning && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Target Scan Box */}
              <div className="w-64 h-64 sm:w-72 sm:h-72 border-2 border-emerald-400/90 rounded-3xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                {/* Corner Markers */}
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl" />

                {/* Laser Scanning Beam */}
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#10b981] absolute top-0 animate-[bounce_2s_infinite]" />
              </div>

              <p className="mt-4 text-xs font-semibold text-white bg-black/70 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                Aponte para o QR Code da nota fiscal
              </p>
            </div>
          )}

          {/* Idle Placeholder */}
          {!isScanning && !isProcessingFetch && (
            <div className="p-8 text-center space-y-4 max-w-md">
              <div className="w-20 h-20 mx-auto rounded-3xl bg-slate-900 border border-slate-800 text-emerald-400 flex items-center justify-center shadow-inner">
                <Camera className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <p className="text-white font-bold text-base">
                  Câmera pronta para leitura instantânea
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Toque em <strong>"Abrir Câmera ao Vivo"</strong> ou tire uma foto direta usando <strong>"📸 Tirar Foto com a Câmera"</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Loading Screen Overlay */}
          {isProcessingFetch && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 space-y-3 z-30">
              <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
              <p className="text-white font-bold text-sm text-center">
                {loadingMessage || 'Processando nota fiscal...'}
              </p>
              <p className="text-xs text-slate-400 text-center max-w-xs">
                Decodificando itens, valores e aplicando categorização automática...
              </p>
            </div>
          )}

          {/* Live Controls on Top of Camera (Torch, Camera Switch, Zoom) */}
          {isScanning && (
            <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                    torchOn ? 'bg-amber-400 text-slate-950 font-bold shadow-lg' : 'bg-black/60 text-white backdrop-blur-md'
                  }`}
                  title="Ligar Lanterna / Flash"
                >
                  <Flashlight className="w-5 h-5" />
                </button>
              )}

              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={switchCamera}
                  className="w-11 h-11 rounded-full bg-black/60 text-white backdrop-blur-md flex items-center justify-center hover:bg-black/80 transition-all"
                  title="Trocar Câmera"
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Zoom Slider if camera supports optical/digital zoom */}
          {isScanning && zoomRange && (
            <div className="absolute bottom-4 left-4 right-4 max-w-xs mx-auto bg-black/70 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center gap-3 z-20 border border-white/10">
              <ZoomIn className="w-4 h-4 text-emerald-400 shrink-0" />
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoomLevel}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer h-1 bg-slate-700 rounded-lg"
              />
              <span className="text-xs text-white font-mono shrink-0">{zoomLevel.toFixed(1)}x</span>
            </div>
          )}
        </div>

        {/* Error / Alert Notification Card */}
        {cameraError && (
          <div className="m-4 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-bold">Aviso de Leitura</p>
                <p>{cameraError}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
              <button
                type="button"
                onClick={() => cameraCaptureInputRef.current?.click()}
                className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Camera className="w-4 h-4" />
                <span>📸 Tirar Foto com a Câmera</span>
              </button>

              <button
                type="button"
                onClick={() => window.open(window.location.href, '_blank')}
                className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-800 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir em Nova Aba</span>
              </button>
            </div>
          </div>
        )}

        {/* Primary Controls (Large, Ergonomic Touch Targets) */}
        <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!isScanning ? (
              <button
                id="start-camera-btn"
                type="button"
                onClick={() => startLiveCamera()}
                disabled={isProcessingFetch}
                className="w-full py-4 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-sm sm:text-base font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2.5 touch-manipulation min-h-[56px] cursor-pointer"
              >
                <Camera className="w-5 h-5 shrink-0" />
                <span>Abrir Câmera ao Vivo</span>
              </button>
            ) : (
              <button
                id="stop-camera-btn"
                type="button"
                onClick={stopLiveCamera}
                className="w-full py-4 px-4 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white text-sm sm:text-base font-bold shadow-md transition-all flex items-center justify-center gap-2 min-h-[56px] cursor-pointer"
              >
                <span>Parar Câmera</span>
              </button>
            )}

            {/* Direct Native Smartphone Camera Snapshot */}
            <button
              id="snap-photo-camera-btn"
              type="button"
              onClick={() => cameraCaptureInputRef.current?.click()}
              disabled={isProcessingFetch}
              className="w-full py-4 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white text-sm sm:text-base font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2.5 touch-manipulation min-h-[56px] cursor-pointer"
              title="Abre a câmera nativa do seu celular para fotografar o QR Code"
            >
              <Smartphone className="w-5 h-5 shrink-0" />
              <span>📸 Tirar Foto com a Câmera</span>
            </button>
          </div>

          {/* Secondary Actions: Gallery Upload & Manual XML */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              id="upload-qr-img-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFetch}
              className="w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-semibold hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-slate-500" />
              <span>Escolher da Galeria / Arquivos</span>
            </button>

            <button
              id="open-manual-xml-btn"
              type="button"
              onClick={() => onOpenXmlModal(lastScannedUrl || undefined)}
              className="w-full py-3.5 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 min-h-[48px] cursor-pointer"
            >
              <FileCode className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Abra manualmente e cole o XML</span>
            </button>
          </div>
        </div>
      </div>

      {/* 44-DIGIT ACCESS KEY (CHAVE DE ACESSO) INPUT BOX */}
      <div id="chave-de-acesso-box" className="bg-white dark:bg-slate-900 border-2 border-emerald-500/30 dark:border-emerald-500/20 rounded-3xl p-5 sm:p-6 shadow-lg space-y-4">
        {/* Header & Quick Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Digitar Chave de Acesso (44 números)
                </h3>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                    chaveDigitsCount === 44
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {chaveDigitsCount}/44
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Todos os 44 números impressos no rodapé da NFC-e
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {chaveDigitsCount > 0 && (
              <button
                type="button"
                onClick={handleClearChave}
                className="py-1 px-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Limpar chave digitada"
              >
                <X className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePasteChave}
              className="py-1 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Colar da área de transferência"
            >
              {copiedChave ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Clipboard className="w-3.5 h-3.5" />}
              <span>{copiedChave ? 'Colado!' : 'Colar'}</span>
            </button>

            <button
              type="button"
              onClick={handleSampleChave}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Chave Teste</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleChaveAcessoSubmit} className="space-y-4">
          {/* Main Multiline Monospace Input (Auto-wraps so all numbers are 100% visible) */}
          <div className="space-y-2">
            <div className="relative">
              <textarea
                id="chave-acesso-input"
                rows={2}
                inputMode="numeric"
                value={chaveAcesso}
                onChange={handleChaveAcessoChange}
                placeholder="3526 0812 3456 7800 0190 6500 1000 0492 8110 0049 2812"
                maxLength={54} // 44 digits + 10 spaces
                className="w-full p-3.5 sm:p-4 text-sm sm:text-base bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-hidden font-mono tracking-wider text-slate-900 dark:text-white leading-relaxed resize-none transition-all shadow-inner"
              />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
              <span>Formatação automática em blocos de 4 números.</span>
              <span>{44 - chaveDigitsCount > 0 ? `Restam ${44 - chaveDigitsCount} dígitos` : '✓ Todos os dígitos preenchidos'}</span>
            </p>
          </div>

          {/* Live 11-Blocks Visualizer (Every 4-digit block fully visible and highlighted) */}
          <div className="space-y-2 bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Visualização dos 11 Blocos da Chave:
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {Math.min(11, Math.ceil(chaveDigitsCount / 4))}/11 blocos
              </span>
            </div>

            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {getChaveBlocks(chaveAcesso).map((block) => (
                <div
                  key={block.index}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    block.isComplete
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-bold'
                      : block.isCurrent
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-bold ring-2 ring-amber-400/30'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600'
                  }`}
                >
                  <div className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                    #{block.index}
                  </div>
                  <div className="font-mono text-xs sm:text-sm tracking-widest">
                    {block.digits ? (
                      <>
                        <span className="font-bold">{block.digits}</span>
                        <span className="opacity-30">{'·'.repeat(4 - block.digits.length)}</span>
                      </>
                    ) : (
                      <span className="opacity-30 tracking-widest">····</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Decoded NFC-e Metadata Preview (When 44 digits are complete) */}
          {chaveDigitsCount === 44 && (() => {
            const meta = getChaveMetadata(chaveAcesso);
            if (!meta) return null;
            return (
              <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs animate-in fade-in">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Estado (UF)</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{meta.uf}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Emissão</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{meta.anoMes}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Nota / Série</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Nº {meta.numero} (Série {meta.serie})</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">CNPJ Emissor</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200 font-mono truncate">{meta.cnpj}</p>
                </div>
              </div>
            );
          })()}

          {/* Validation feedback */}
          {chaveError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5 font-medium animate-in fade-in">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{chaveError}</span>
            </p>
          )}

          {chaveDigitsCount === 44 && !chaveError && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Chave completa! Pronto para buscar os produtos na Sefaz SP.</span>
            </p>
          )}

          {/* Large, Ergonomic Action Button */}
          <button
            id="buscar-nota-chave-btn"
            type="submit"
            disabled={chaveDigitsCount !== 44 || isProcessingFetch}
            className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm sm:text-base font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 shrink-0 min-h-[52px] cursor-pointer touch-manipulation"
          >
            {isProcessingFetch ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Consultando Sefaz SP...</span>
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                <span>Buscar Produtos da Nota Fiscal</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Manual URL Input Card (Opcional - link completo) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="manual-url-input" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-slate-400" />
            Ou cole o Link Completo da Sefaz SP
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
