import jsQR from 'jsqr';
import { BrowserQRCodeReader } from '@zxing/browser';

/**
 * Universal High-Precision QR Code Decoder
 * Combines Native OS BarcodeDetector (Google Play Services / Apple Vision) + jsQR + ZXing + Thermal Receipt Image Enhancer
 */

export interface DecodeResult {
  text: string;
  source: 'native_barcode_detector' | 'jsqr' | 'zxing' | 'enhanced_filter';
}

// Check if Native BarcodeDetector is supported by browser
export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

let nativeDetectorInstance: any = null;
function getNativeDetector() {
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

const zxingReader = new BrowserQRCodeReader();

/**
 * Decode from an ImageData buffer (used in live video frame loop)
 */
export async function decodeFromImageData(
  imageData: ImageData,
  canvas?: HTMLCanvasElement
): Promise<DecodeResult | null> {
  const detector = getNativeDetector();

  // 1. Try Native BarcodeDetector if canvas is available
  if (detector && canvas) {
    try {
      const barcodes = await detector.detect(canvas);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return {
          text: barcodes[0].rawValue,
          source: 'native_barcode_detector',
        };
      }
    } catch {
      // fallback
    }
  }

  // 2. Try jsQR (fast, highly optimized JS engine)
  try {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (code && code.data) {
      return {
        text: code.data,
        source: 'jsqr',
      };
    }
  } catch {
    // fallback
  }

  return null;
}

/**
 * High-Precision Multi-Pass Decoder for Static Images & Camera Photos
 * Handles faded thermal paper receipts, crumpling, glare, and high-density NFC-e codes.
 */
export async function decodeFromImageElement(
  img: HTMLImageElement | HTMLCanvasElement | ImageBitmap
): Promise<DecodeResult | null> {
  const detector = getNativeDetector();

  // Pass 1: Native BarcodeDetector (instant OS-level Google Play Services / Apple Vision)
  if (detector) {
    try {
      const barcodes = await detector.detect(img);
      if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
        return {
          text: barcodes[0].rawValue,
          source: 'native_barcode_detector',
        };
      }
    } catch (err) {
      console.warn('Native BarcodeDetector pass failed:', err);
    }
  }

  // Pass 2: ZXing Reader on image element
  if (img instanceof HTMLImageElement) {
    try {
      const zxResult = await zxingReader.decodeFromImageElement(img);
      if (zxResult && zxResult.getText()) {
        return {
          text: zxResult.getText(),
          source: 'zxing',
        };
      }
    } catch {
      // Continue to canvas passes
    }
  }

  // Prepare Canvas for image processing
  const canvas = document.createElement('canvas');
  const width = img instanceof HTMLImageElement ? img.naturalWidth || img.width : img.width;
  const height = img instanceof HTMLImageElement ? img.naturalHeight || img.height : img.height;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);

  // Pass 3: jsQR on raw full-res image
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const code = jsQR(imgData.data, width, height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data) {
      return { text: code.data, source: 'jsqr' };
    }
  } catch {}

  // Pass 4: Downscaled 1600px / 1200px (removes optical camera noise on 48MP photos)
  const targetSizes = [1600, 1200, 900, 600];
  for (const maxDim of targetSizes) {
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      const sw = Math.round(width * scale);
      const sh = Math.round(height * scale);

      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = sw;
      scaledCanvas.height = sh;
      const sCtx = scaledCanvas.getContext('2d', { willReadFrequently: true });
      if (!sCtx) continue;

      sCtx.drawImage(img, 0, 0, sw, sh);

      // Try Native on scaled canvas
      if (detector) {
        try {
          const scaledBarcodes = await detector.detect(scaledCanvas);
          if (scaledBarcodes && scaledBarcodes.length > 0 && scaledBarcodes[0].rawValue) {
            return { text: scaledBarcodes[0].rawValue, source: 'native_barcode_detector' };
          }
        } catch {}
      }

      // Try jsQR on scaled image
      try {
        const sImgData = sCtx.getImageData(0, 0, sw, sh);
        const code = jsQR(sImgData.data, sw, sh, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          return { text: code.data, source: 'jsqr' };
        }
      } catch {}

      // Pass 5: Binarization / Contrast enhancement for faded thermal receipts
      try {
        const bImgData = sCtx.getImageData(0, 0, sw, sh);
        const d = bImgData.data;
        // High-contrast adaptive thresholding filter
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // Boost contrast: stretch darks down and lights up
          const val = gray < 135 ? 0 : 255;
          d[i] = val;
          d[i + 1] = val;
          d[i + 2] = val;
        }
        sCtx.putImageData(bImgData, 0, 0);

        const enhancedCode = jsQR(bImgData.data, sw, sh, { inversionAttempts: 'attemptBoth' });
        if (enhancedCode && enhancedCode.data) {
          return { text: enhancedCode.data, source: 'enhanced_filter' };
        }
      } catch {}
    }
  }

  return null;
}
