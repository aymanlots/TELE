/**
 * Offline Barcode, QR Code and IMEI Scanner Engine
 * Supports:
 * - Native hardware-accelerated BarcodeDetector API when available
 * - Graceful fallback to @zxing/browser (100% offline, bundled in PWA)
 * - Audio beep synthesis via Web Audio API (zero network assets)
 * - Haptic vibration feedback
 * - Comprehensive IMEI Luhn algorithm validation & extraction
 */

import { BrowserMultiFormatReader } from '@zxing/browser';

/**
 * Play a crisp luxury POS scan confirmation beep via Web Audio API.
 * 100% offline with no external audio file dependencies.
 */
export function playScanSuccessSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Pleasant dual-frequency chirp (880Hz -> 1760Hz)
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.04); // E6

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);

    // Auto cleanup context after audio finishes
    setTimeout(() => {
      try {
        ctx.close().catch(() => {});
      } catch {}
    }, 200);
  } catch (e) {
    // Non-critical if browser blocks audio autoplay
  }
}

/**
 * Trigger subtle haptic vibration on supported devices
 */
export function triggerScanVibration(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([45]);
    }
  } catch (e) {
    // Non-critical
  }
}

/**
 * Validate a 15-digit IMEI using the standard Luhn algorithm (modulus 10)
 */
export function validateIMEILuhn(imei: string): { isValid: boolean; reason?: string } {
  const clean = imei.trim().replace(/[\s-]/g, '');

  if (!/^\d+$/.test(clean)) {
    return {
      isValid: false,
      reason: 'L\'IMEI ne doit contenir que des chiffres numériques.',
    };
  }

  if (clean.length !== 15) {
    return {
      isValid: false,
      reason: `Un IMEI doit comporter exactement 15 chiffres (actuellement ${clean.length}).`,
    };
  }

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = parseInt(clean.charAt(i), 10);
    // Double every second digit starting from the second digit (0-indexed: index 1, 3, 5...)
    if (i % 2 !== 0) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  const actualCheckDigit = parseInt(clean.charAt(14), 10);

  if (checkDigit !== actualCheckDigit) {
    return {
      isValid: false,
      reason: `Chiffre de contrôle Luhn non valide. Attendu: ${checkDigit}, trouvé: ${actualCheckDigit}.`,
    };
  }

  return { isValid: true };
}

/**
 * Helper alias returning { valid, reason } for trade-in & form checks
 */
export function validateIMEI(imei: string): { valid: boolean; reason?: 'length' | 'luhn' } {
  const clean = imei.trim().replace(/[\s-]/g, '');
  if (!/^\d{15}$/.test(clean)) {
    return { valid: false, reason: 'length' };
  }
  const luhn = validateIMEILuhn(clean);
  if (!luhn.isValid) {
    return { valid: false, reason: 'luhn' };
  }
  return { valid: true };
}

/**
 * Smart extractor for IMEI from raw barcode text.
 * Barcodes on phone packaging sometimes prefix with 'IMEI:', 'IMEI1:', 'S/N:', etc.
 */
export function extractIMEIFromRaw(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // 1. Look for standalone 15-digit sequence
  const match15 = trimmed.match(/\b\d{15}\b/);
  if (match15) return match15[0];

  // 2. Strip non-digits and test if exactly 15 or starts with 15
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 15) return digitsOnly;
  if (digitsOnly.length > 15) {
    // Sometimes 16 digits (IMEI + SVN software version number)
    return digitsOnly.slice(0, 15);
  }

  return digitsOnly || trimmed;
}

/**
 * Check if the browser natively supports the BarcodeDetector API
 */
export function hasNativeBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

export type ScanResultCallback = (text: string, rawFormat?: string) => void;

/**
 * High-performance barcode reader manager that combines native BarcodeDetector
 * with ZXing browser fallback for 100% offline cross-device compatibility.
 */
export class OfflineCameraScanner {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private zxingReader: BrowserMultiFormatReader | null = null;
  private isScanning = false;
  private animationFrameId: number | null = null;
  private nativeDetector: any = null;
  private onResult: ScanResultCallback | null = null;
  private lastScannedCode = '';
  private lastScannedTime = 0;
  private cooldownMs = 1200; // avoid instant repeated scans of same code

  constructor(onResult: ScanResultCallback, cooldownMs: number = 1200) {
    this.onResult = onResult;
    this.cooldownMs = cooldownMs;
  }

  /**
   * Start scanning on a video element using specific facing mode ('environment' default)
   */
  async start(
    videoElement: HTMLVideoElement,
    facingMode: 'environment' | 'user' = 'environment'
  ): Promise<{ success: boolean; hasTorch: boolean; error?: string }> {
    this.stop();
    this.videoElement = videoElement;
    this.isScanning = true;

    try {
      // Request camera stream with preferred facingMode
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = this.stream;
      await videoElement.play();

      // Check torch capability
      let hasTorch = false;
      const track = this.stream.getVideoTracks()[0];
      if (track) {
        const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
        hasTorch = Boolean(capabilities.torch);
      }

      // Check for native BarcodeDetector
      if (hasNativeBarcodeDetector()) {
        try {
          const supportedFormats = (await (window as any).BarcodeDetector.getSupportedFormats?.()) || [
            'qr_code',
            'ean_13',
            'ean_8',
            'code_128',
            'code_39',
            'upc_a',
            'upc_e',
            'itf',
            'data_matrix',
          ];
          this.nativeDetector = new (window as any).BarcodeDetector({ formats: supportedFormats });
          this.runNativeScanLoop();
          return { success: true, hasTorch };
        } catch {
          // Fall through to ZXing
        }
      }

      // Fallback: ZXing BrowserMultiFormatReader
      this.runZXingScan();
      return { success: true, hasTorch };
    } catch (err: any) {
      this.stop();
      let errorMsg = 'Erreur d\'accès à la caméra';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'permission_denied';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'no_camera';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'camera_busy';
      }
      return { success: false, hasTorch: false, error: errorMsg };
    }
  }

  /**
   * Toggle camera flash / torch
   */
  async toggleTorch(enabled: boolean): Promise<boolean> {
    if (!this.stream) return false;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return false;

    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: enabled }],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Native loop using requestAnimationFrame + BarcodeDetector
   */
  private runNativeScanLoop() {
    if (!this.isScanning || !this.videoElement || !this.nativeDetector) return;

    const detect = async () => {
      if (!this.isScanning || !this.videoElement) return;

      if (this.videoElement.readyState >= 2) {
        try {
          const barcodes = await this.nativeDetector.detect(this.videoElement);
          if (barcodes && barcodes.length > 0) {
            const first = barcodes[0];
            const rawValue = first.rawValue?.trim();
            if (rawValue) {
              this.handleDetectedCode(rawValue, first.format);
            }
          }
        } catch {
          // ignore transient detection errors
        }
      }

      if (this.isScanning) {
        this.animationFrameId = requestAnimationFrame(detect);
      }
    };

    this.animationFrameId = requestAnimationFrame(detect);
  }

  /**
   * ZXing fallback scanner
   */
  private runZXingScan() {
    if (!this.isScanning || !this.videoElement) return;

    try {
      this.zxingReader = new BrowserMultiFormatReader();
      this.zxingReader.decodeFromVideoElement(this.videoElement, (result, err) => {
        if (!this.isScanning) return;
        if (result) {
          const text = result.getText()?.trim();
          if (text) {
            const formatStr = result.getBarcodeFormat() ? String(result.getBarcodeFormat()) : undefined;
            this.handleDetectedCode(text, formatStr);
          }
        }
      });
    } catch {
      // fallback failed
    }
  }

  /**
   * Process detected code with cooldown protection
   */
  private handleDetectedCode(text: string, format?: string) {
    const now = Date.now();
    if (text === this.lastScannedCode && now - this.lastScannedTime < this.cooldownMs) {
      return; // Cooldown to avoid rapid double trigger
    }

    this.lastScannedCode = text;
    this.lastScannedTime = now;

    playScanSuccessSound();
    triggerScanVibration();

    if (this.onResult) {
      this.onResult(text, format);
    }
  }

  /**
   * Stop scanner and release all camera hardware
   */
  stop(): void {
    this.isScanning = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.zxingReader) {
      try {
        // Stop reader decoding
        (this.zxingReader as any).reset?.();
      } catch {}
      this.zxingReader = null;
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.nativeDetector = null;
  }
}
