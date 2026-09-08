import jsQR from 'jsqr';
import {
  QRCodeReader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
} from '@zxing/library';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Universal High-Precision QR Code Decoder
 * Combines Native OS BarcodeDetector (Google Play Services / Apple Vision) +
 * Html5Qrcode + ZXing QRCodeReader + jsQR + Thermal Receipt Smart Cropping & Binarization
 */

export interface DecodeResult {
  text: string;
  source: 'native_barcode_detector' | 'html5_qrcode' | 'jsqr' | 'zxing' | 'thermal_contrast' | 'ai_ocr';
}

// Check if Native BarcodeDetector is supported by browser (e.g. Chrome on Android / Edge)
export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

let nativeDetectorInstance: any = null;
export function getNativeDetector(): any {
  if (isBarcodeDetectorSupported() && !nativeDetectorInstance) {
    try {
      nativeDetectorInstance = new (window as any).BarcodeDetector({
        formats: ['qr_code'],
      });
    } catch (e) {
      console.warn('Native BarcodeDetector init error:', e);
    }
  }
  return nativeDetectorInstance;
}

// Initialize ZXing QRCodeReader with TRY_HARDER
const zxingQrReader = new QRCodeReader();
const zxingHints = new Map();
zxingHints.set(DecodeHintType.TRY_HARDER, true);

export function decodeZxingFromImageData(imageData: ImageData): string | null {
  try {
    const lum = new RGBLuminanceSource(imageData.data, imageData.width, imageData.height);
    const bin = new BinaryBitmap(new HybridBinarizer(lum));
    const result = zxingQrReader.decode(bin, zxingHints);
    return result ? result.getText() : null;
  } catch {
    return null;
  }
}

/**
 * Thermal Receipt Contrast Enhancer & Adaptive Binarizer
 * Stretches contrast so faded dot-matrix / thermal printing on paper turns into solid black & white.
 */
export function enhanceThermalContrast(imageData: ImageData): ImageData {
  const d = new Uint8ClampedArray(imageData.data);
  const len = d.length;

  let minLum = 255;
  let maxLum = 0;
  for (let i = 0; i < len; i += 4) {
    const lum = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = maxLum - minLum || 1;
  const threshold = minLum + range * 0.52;

  for (let i = 0; i < len; i += 4) {
    const lum = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    const v = lum < threshold ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }

  return new ImageData(d, imageData.width, imageData.height);
}

/**
 * High-Speed Frame Decoder for Live Video Camera Stream
 * Priority 1: Native BarcodeDetector directly on <video> (hardware-accelerated, 60fps, 0-copy memory)
 * Priority 2: Center Reticle ROI (400x400) via jsQR (< 3ms CPU execution)
 * Priority 3: Center Reticle ROI via ZXing QRCodeReader
 * Priority 4: Downscaled full frame (640x360)
 */
export async function decodeFromVideoElement(
  video: HTMLVideoElement,
  roiCanvas: HTMLCanvasElement,
  fullCanvas?: HTMLCanvasElement,
  checkFullFrame: boolean = false
): Promise<DecodeResult | null> {
  const detector = getNativeDetector();

  // 1. Native BarcodeDetector directly on <video> element (fastest possible, Android Google Play Services)
  if (detector) {
    try {
      const barcodes = await detector.detect(video);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return {
          text: barcodes[0].rawValue,
          source: 'native_barcode_detector',
        };
      }
    } catch {
      // Fall through to canvas ROI
    }
  }

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || vw <= 0 || vh <= 0) return null;

  // 2. Central Reticle ROI (Region Of Interest)
  // The user aligns the QR code within the central green reticle on screen (~65% of smaller dimension)
  const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
  if (roiCtx) {
    const roiSize = Math.min(vw, vh) * 0.70;
    const sx = (vw - roiSize) / 2;
    const sy = (vh - roiSize) / 2;
    const targetDim = 440;

    if (roiCanvas.width !== targetDim || roiCanvas.height !== targetDim) {
      roiCanvas.width = targetDim;
      roiCanvas.height = targetDim;
    }

    roiCtx.drawImage(video, sx, sy, roiSize, roiSize, 0, 0, targetDim, targetDim);
    const roiImageData = roiCtx.getImageData(0, 0, targetDim, targetDim);

    // jsQR on 440x440 is ultra-fast (< 4ms)
    try {
      const code = jsQR(roiImageData.data, targetDim, targetDim, {
        inversionAttempts: 'attemptBoth',
      });
      if (code && code.data) {
        return { text: code.data, source: 'jsqr' };
      }
    } catch {}

    // Thermal Contrast Binarization Pass on ROI (crucial for faded/low-contrast paper receipts!)
    try {
      const binarizedRoi = enhanceThermalContrast(roiImageData);
      const binCode = jsQR(binarizedRoi.data, targetDim, targetDim, {
        inversionAttempts: 'attemptBoth',
      });
      if (binCode && binCode.data) {
        return { text: binCode.data, source: 'thermal_contrast' };
      }
    } catch {}

    // ZXing QRCodeReader on ROI
    if (!detector || checkFullFrame) {
      const zxText = decodeZxingFromImageData(roiImageData);
      if (zxText) {
        return { text: zxText, source: 'zxing' };
      }
    }
  }

  // 3. Full-frame pass (for off-center or larger QR codes)
  if (checkFullFrame && fullCanvas) {
    const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
    if (fullCtx) {
      const fw = 720;
      const fh = Math.round((vh / vw) * 720);
      if (fullCanvas.width !== fw || fullCanvas.height !== fh) {
        fullCanvas.width = fw;
        fullCanvas.height = fh;
      }
      fullCtx.drawImage(video, 0, 0, fw, fh);
      const fullImgData = fullCtx.getImageData(0, 0, fw, fh);

      try {
        const code = jsQR(fullImgData.data, fw, fh, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          return { text: code.data, source: 'jsqr' };
        }
      } catch {}

      // Thermal contrast on full frame
      try {
        const binarizedFull = enhanceThermalContrast(fullImgData);
        const binFullCode = jsQR(binarizedFull.data, fw, fh, { inversionAttempts: 'attemptBoth' });
        if (binFullCode && binFullCode.data) {
          return { text: binFullCode.data, source: 'thermal_contrast' };
        }
      } catch {}

      if (!detector) {
        const zxFullText = decodeZxingFromImageData(fullImgData);
        if (zxFullText) {
          return { text: zxFullText, source: 'zxing' };
        }
      }
    }
  }

  return null;
}

// Backward compatibility helper
export async function decodeFromImageData(
  imageData: ImageData,
  canvas?: HTMLCanvasElement
): Promise<DecodeResult | null> {
  const detector = getNativeDetector();
  if (detector && canvas) {
    try {
      const barcodes = await detector.detect(canvas);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return { text: barcodes[0].rawValue, source: 'native_barcode_detector' };
      }
    } catch {}
  }

  try {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (code && code.data) {
      return { text: code.data, source: 'jsqr' };
    }
  } catch {}

  const zxText = decodeZxingFromImageData(imageData);
  if (zxText) {
    return { text: zxText, source: 'zxing' };
  }

  return null;
}

/**
 * Universal Multi-Engine & Multi-Region Image Decoder for Photos and Uploaded Files
 * Fixes "Não foi possível encontrar o QR Code" by:
 * 1. Native OS BarcodeDetector on full image
 * 2. Html5Qrcode.scanFile engine
 * 3. Targeted Smart Cropping:
 *    - Bottom 60% (standard Brazilian NFC-e ticket format has QR code at bottom)
 *    - Center 65% x 65%
 *    - Full image at 1600px and 1000px
 *    - Top 60% (in case photo was taken inverted)
 * 4. Thermal paper contrast booster and adaptive binarization
 */
export async function decodeFromImageElement(
  img: HTMLImageElement | HTMLCanvasElement,
  originalFile?: File
): Promise<DecodeResult | null> {
  const detector = getNativeDetector();

  // Pass 1: Native BarcodeDetector on image element
  if (detector) {
    try {
      const barcodes = await detector.detect(img);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return {
          text: barcodes[0].rawValue,
          source: 'native_barcode_detector',
        };
      }
    } catch {}
  }

  // Pass 2: Html5Qrcode.scanFile only if file is reasonably sized (< 1.5MB) to avoid freezing mobile UI thread
  if (originalFile && originalFile.size < 1.5 * 1024 * 1024 && typeof document !== 'undefined') {
    try {
      let hiddenContainer = document.getElementById('html5-qr-hidden-container');
      if (!hiddenContainer) {
        hiddenContainer = document.createElement('div');
        hiddenContainer.id = 'html5-qr-hidden-container';
        hiddenContainer.style.display = 'none';
        document.body.appendChild(hiddenContainer);
      }
      const html5Qr = new Html5Qrcode('html5-qr-hidden-container');
      const scanText = await html5Qr.scanFile(originalFile, false);
      if (scanText && scanText.trim()) {
        return { text: scanText.trim(), source: 'html5_qrcode' };
      }
    } catch {}
  }

  const origWidth = img instanceof HTMLImageElement ? img.naturalWidth || img.width : img.width;
  const origHeight = img instanceof HTMLImageElement ? img.naturalHeight || img.height : img.height;

  if (!origWidth || !origHeight) return null;

  // Candidate regions to inspect
  interface CropRegion {
    name: string;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    maxDim: number;
  }

  const regions: CropRegion[] = [
    // 1. Bottom 60% of receipt (where 95% of Brazilian NFC-e QR codes are printed!)
    {
      name: 'bottom_half',
      sx: 0,
      sy: Math.floor(origHeight * 0.38),
      sw: origWidth,
      sh: Math.floor(origHeight * 0.62),
      maxDim: 1200,
    },
    // 2. Center 65% x 65% (where user framed the QR code)
    {
      name: 'center_box',
      sx: Math.floor(origWidth * 0.17),
      sy: Math.floor(origHeight * 0.17),
      sw: Math.floor(origWidth * 0.66),
      sh: Math.floor(origHeight * 0.66),
      maxDim: 1100,
    },
    // 3. Full image (scaled to 1600px)
    {
      name: 'full_1600',
      sx: 0,
      sy: 0,
      sw: origWidth,
      sh: origHeight,
      maxDim: 1600,
    },
    // 4. Full image (scaled to 1000px)
    {
      name: 'full_1000',
      sx: 0,
      sy: 0,
      sw: origWidth,
      sh: origHeight,
      maxDim: 1000,
    },
    // 5. Top 60% (inverted receipt)
    {
      name: 'top_half',
      sx: 0,
      sy: 0,
      sw: origWidth,
      sh: Math.floor(origHeight * 0.62),
      maxDim: 1200,
    },
  ];

  for (const reg of regions) {
    const scale = Math.min(1, reg.maxDim / Math.max(reg.sw, reg.sh));
    const dw = Math.round(reg.sw * scale);
    const dh = Math.round(reg.sh * scale);

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) continue;

    ctx.drawImage(img, reg.sx, reg.sy, reg.sw, reg.sh, 0, 0, dw, dh);

    // Try Native on cropped canvas
    if (detector) {
      try {
        const barcodes = await detector.detect(canvas);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          return { text: barcodes[0].rawValue, source: 'native_barcode_detector' };
        }
      } catch {}
    }

    const imgData = ctx.getImageData(0, 0, dw, dh);

    // Try jsQR on raw crop
    try {
      const code = jsQR(imgData.data, dw, dh, { inversionAttempts: 'attemptBoth' });
      if (code && code.data) {
        return { text: code.data, source: 'jsqr' };
      }
    } catch {}

    // Try ZXing on raw crop
    const zxText = decodeZxingFromImageData(imgData);
    if (zxText) {
      return { text: zxText, source: 'zxing' };
    }

    // Thermal contrast boost filter pass
    try {
      const enhanced = enhanceThermalContrast(imgData);
      const enhCode = jsQR(enhanced.data, dw, dh, { inversionAttempts: 'attemptBoth' });
      if (enhCode && enhCode.data) {
        return { text: enhCode.data, source: 'thermal_contrast' };
      }

      const zxEnhText = decodeZxingFromImageData(enhanced);
      if (zxEnhText) {
        return { text: zxEnhText, source: 'thermal_contrast' };
      }
    } catch {}
  }

  return null;
}

/**
 * Utility to extract NFC-e Access Key (44 digits) or URL from scanned text
 */
export function extractChaveOrUrl(raw: string): { url?: string; accessKey?: string } {
  if (!raw) return {};

  const cleanDigits = raw.replace(/\D/g, '');
  const match44 = raw.match(/([0-9]{44})/) || (cleanDigits.length === 44 ? [cleanDigits, cleanDigits] : null);
  const accessKey = match44 ? match44[1] : (cleanDigits.length >= 44 ? cleanDigits.slice(0, 44) : undefined);

  const isUrl = /^https?:\/\//i.test(raw.trim());
  const url = isUrl ? raw.trim() : undefined;

  return { url, accessKey };
}

