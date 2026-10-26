import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Camera,
  Zap,
  ZapOff,
  SwitchCamera,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  Barcode,
  QrCode,
  Smartphone,
} from 'lucide-react';
import {
  OfflineCameraScanner,
  validateIMEILuhn,
  extractIMEIFromRaw,
} from '../lib/scanner';
import { useI18n } from '../i18n';

export type ScannerMode = 'any' | 'imei' | 'barcode' | 'qr';

export interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string, meta?: { isIMEI?: boolean; raw?: string }) => void;
  title?: string;
  mode?: ScannerMode;
  continuous?: boolean;
  helperText?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title,
  mode = 'any',
  continuous = false,
  helperText,
}) => {
  const { t, language } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<OfflineCameraScanner | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [lastScannedResult, setLastScannedResult] = useState<string | null>(null);

  // IMEI Warning dialog when scanned code fails 15-digit Luhn validation
  const [pendingInvalidImei, setPendingInvalidImei] = useState<{
    code: string;
    reason: string;
  } | null>(null);

  // Reset state whenever modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current = null;
      }
      setIsTorchOn(false);
      setHasTorch(false);
      setErrorType(null);
      setPendingInvalidImei(null);
      setLastScannedResult(null);
    }
  }, [isOpen]);

  // Start scanner when modal opens or facing mode flips
  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;

    const initScanner = async () => {
      setErrorType(null);

      // Short delay to ensure DOM video element is attached
      await new Promise((r) => setTimeout(r, 60));
      if (isCancelled || !videoRef.current) return;

      const scanner = new OfflineCameraScanner((rawText) => {
        handleCodeDetected(rawText);
      }, 1400);

      scannerRef.current = scanner;

      const result = await scanner.start(videoRef.current, facingMode);

      if (isCancelled) {
        scanner.stop();
        return;
      }

      if (!result.success) {
        setErrorType(result.error || 'camera_error');
        setHasTorch(false);
      } else {
        setHasTorch(result.hasTorch);
      }
    };

    initScanner();

    return () => {
      isCancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current = null;
      }
    };
  }, [isOpen, facingMode]);

  // Handle scanned code
  const handleCodeDetected = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    // If expected mode is IMEI specifically:
    if (mode === 'imei') {
      const cleanImei = extractIMEIFromRaw(trimmed);
      const validation = validateIMEILuhn(cleanImei);

      if (!validation.isValid) {
        setPendingInvalidImei({
          code: cleanImei || trimmed,
          reason:
            validation.reason ||
            (language === 'ar'
              ? 'الـ IMEI يجب أن يحتوي على 15 رقماً مطابقاً لخوارزمية التحقق.'
              : "L'IMEI doit comporter exactement 15 chiffres conformes à l'algorithme Luhn."),
        });
        return;
      }

      // Valid IMEI!
      setLastScannedResult(cleanImei);
      onScan(cleanImei, { isIMEI: true, raw: trimmed });
      if (!continuous) {
        onClose();
      }
      return;
    }

    // Generic mode (barcode, QR, or IMEI detected anywhere)
    const isPotentiallyImei = /^\d{15}$/.test(trimmed);
    let finalCode = trimmed;
    let isIMEI = false;

    if (isPotentiallyImei) {
      const imeiCheck = validateIMEILuhn(trimmed);
      if (imeiCheck.isValid) {
        isIMEI = true;
      }
    }

    setLastScannedResult(finalCode);
    onScan(finalCode, { isIMEI, raw: trimmed });

    if (!continuous) {
      onClose();
    }
  };

  // Toggle Torch
  const handleToggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    const nextState = !isTorchOn;
    const ok = await scannerRef.current.toggleTorch(nextState);
    if (ok) {
      setIsTorchOn(nextState);
    }
  };

  // Flip Camera
  const handleFlipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    setIsTorchOn(false);
  };

  // User confirmed to use invalid IMEI anyway
  const handleAcceptInvalidImei = () => {
    if (!pendingInvalidImei) return;
    const code = pendingInvalidImei.code;
    setPendingInvalidImei(null);
    setLastScannedResult(code);
    onScan(code, { isIMEI: true, raw: code });
    if (!continuous) {
      onClose();
    }
  };

  // User chose to rescan invalid IMEI
  const handleRescanInvalidImei = () => {
    setPendingInvalidImei(null);
  };

  if (!isOpen) return null;

  const displayTitle =
    title ||
    (mode === 'imei'
      ? language === 'ar'
        ? 'مسح كود IMEI (15 رقماً)'
        : 'Scanner Code IMEI (15 chiffres)'
      : t.scanner.title);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-neutral-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Strip */}
        <div className="flex items-center justify-between px-4 py-3 bg-neutral-950/80 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              {mode === 'imei' ? (
                <Smartphone className="w-4 h-4" />
              ) : mode === 'qr' ? (
                <QrCode className="w-4 h-4" />
              ) : (
                <Barcode className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <span>{displayTitle}</span>
                {mode === 'imei' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    IMEI 15
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-neutral-400">
                {helperText ||
                  (mode === 'imei'
                    ? language === 'ar'
                      ? 'وجّه الكاميرا نحو كود علبة الهاتف'
                      : 'Pointez vers le code-barres IMEI sur la boîte'
                    : t.scanner.scanning)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Torch toggle */}
            {hasTorch && (
              <button
                type="button"
                onClick={handleToggleTorch}
                title={isTorchOn ? t.scanner.flashOff : t.scanner.flashOn}
                className={`p-2 rounded-xl border transition ${
                  isTorchOn
                    ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-lg shadow-amber-500/30'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
                }`}
              >
                {isTorchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              </button>
            )}

            {/* Camera switcher */}
            <button
              type="button"
              onClick={handleFlipCamera}
              title={t.scanner.switchCamera}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-rose-500/20 hover:text-rose-300 text-neutral-400 border border-neutral-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Camera Viewport Area */}
        <div className="relative aspect-4/3 sm:aspect-square w-full bg-black overflow-hidden flex items-center justify-center">
          {/* Active Video Feed */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${
              facingMode === 'user' ? 'scale-x-[-1]' : ''
            }`}
          />

          {/* Overlay Grid & Targeting Reticle */}
          {!errorType && !pendingInvalidImei && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              {/* Outer dimmed mask */}
              <div className="relative w-64 h-64 sm:w-72 sm:h-72">
                {/* 4 Golden Corner Reticles */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-amber-400 rounded-tl-lg shadow-sm" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-amber-400 rounded-tr-lg shadow-sm" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-amber-400 rounded-bl-lg shadow-sm" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-amber-400 rounded-br-lg shadow-sm" />

                {/* Animated Gold Laser Sweep */}
                <div className="absolute left-2 right-2 h-0.75 bg-linear-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#D4AF37] animate-scan-laser" />

                {/* Subtle center crosshair */}
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <div className="w-4 h-0.5 bg-amber-400" />
                  <div className="h-4 w-0.5 bg-amber-400 -ml-2" />
                </div>
              </div>

              {/* Status pill under reticle */}
              <div className="mt-4 px-3 py-1.5 rounded-full bg-neutral-950/80 border border-amber-500/30 text-amber-300 text-xs font-medium backdrop-blur-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>
                  {mode === 'imei'
                    ? language === 'ar'
                      ? 'بحث عن كود IMEI (15 رقم)...'
                      : 'Recherche code IMEI (15 chiffres)...'
                    : t.scanner.scanning}
                </span>
              </div>
            </div>
          )}

          {/* Permission or Camera Error View */}
          {errorType && (
            <div className="absolute inset-0 bg-neutral-950/95 p-6 flex flex-col items-center justify-center text-center z-20">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mb-3.5">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-neutral-100 mb-1.5">
                {errorType === 'permission_denied'
                  ? language === 'ar'
                    ? 'صلاحية الكاميرا مرفوضة'
                    : 'Accès caméra refusé'
                  : language === 'ar'
                  ? 'تعذر تشغيل الكاميرا'
                  : 'Impossible de lancer la caméra'}
              </h4>
              <p className="text-xs text-neutral-400 max-w-xs leading-relaxed mb-5">
                {errorType === 'permission_denied'
                  ? t.scanner.cameraPermissionDenied
                  : t.scanner.cameraNotAvailable}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorType(null);
                    setFacingMode((prev) => prev); // re-trigger
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t.scanner.retry}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-xs transition"
                >
                  {t.close}
                </button>
              </div>
            </div>
          )}

          {/* IMEI Validation Warning Overlay */}
          {pendingInvalidImei && (
            <div className="absolute inset-0 bg-neutral-950/95 p-6 flex flex-col items-center justify-center text-center z-30">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 mb-3">
                <AlertTriangle className="w-7 h-7" />
              </div>

              <h4 className="text-sm font-bold text-amber-300 mb-1">
                {language === 'ar' ? 'تنبيه: تحقق من الـ IMEI' : 'Attention : IMEI potentiellement invalide'}
              </h4>

              <div className="p-3 my-3 rounded-xl bg-neutral-900 border border-neutral-800 w-full max-w-xs">
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">
                  {t.scanner.scannedCode}
                </div>
                <div className="font-mono text-base font-bold text-neutral-100 tracking-wider break-all select-all">
                  {pendingInvalidImei.code}
                </div>
                <div className="text-[11px] text-neutral-400 mt-1">
                  {pendingInvalidImei.code.length} {language === 'ar' ? 'أرقام' : 'chiffres'}
                </div>
              </div>

              <p className="text-xs text-neutral-400 max-w-xs leading-relaxed mb-5">
                {pendingInvalidImei.reason}
              </p>

              <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
                <button
                  type="button"
                  onClick={handleRescanInvalidImei}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'إعادة المسح' : 'Rescanner'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleAcceptInvalidImei}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs border border-neutral-700 transition"
                >
                  <span>{language === 'ar' ? 'استعماله رغم ذلك' : 'Utiliser quand même'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Scanned Success Pill (Visible briefly in continuous mode) */}
          {lastScannedResult && continuous && (
            <div className="absolute top-4 inset-x-4 p-2.5 rounded-xl bg-emerald-500/95 text-neutral-950 text-xs font-bold flex items-center justify-between shadow-lg animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-mono">{lastScannedResult}</span>
              </div>
              <span className="text-[10px] bg-neutral-950/20 px-2 py-0.5 rounded">
                {t.scanner.scanSuccess}
              </span>
            </div>
          )}
        </div>

        {/* Footer controls & hints */}
        <div className="p-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-3 text-xs">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>100% Offline (PWA)</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium text-xs transition"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
