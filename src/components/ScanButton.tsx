import React, { useState } from 'react';
import { Camera, ScanBarcode, QrCode } from 'lucide-react';
import { BarcodeScannerModal, ScannerMode } from './BarcodeScannerModal';
import { useI18n } from '../i18n';

export interface ScanButtonProps {
  onScan: (code: string, meta?: { isIMEI?: boolean; raw?: string }) => void;
  mode?: ScannerMode;
  continuous?: boolean;
  title?: string;
  helperText?: string;
  variant?: 'icon' | 'compact' | 'inline' | 'button';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export const ScanButton: React.FC<ScanButtonProps> = ({
  onScan,
  mode = 'any',
  continuous = false,
  title,
  helperText,
  variant = 'icon',
  size = 'md',
  label,
  className = '',
}) => {
  const { t, language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const defaultLabel =
    label ||
    (mode === 'imei'
      ? language === 'ar'
        ? 'مسح IMEI'
        : 'Scanner IMEI'
      : language === 'ar'
      ? 'مسح الكود'
      : 'Scanner');

  const tooltip =
    title ||
    (mode === 'imei'
      ? language === 'ar'
        ? 'مسح كود IMEI بكاميرا الهاتف'
        : 'Scanner l\'IMEI avec la caméra'
      : language === 'ar'
      ? 'مسح الباركود أو QR Code بكاميرا الهاتف'
      : 'Scanner code-barres / QR avec la caméra');

  const handleScan = (code: string, meta?: { isIMEI?: boolean; raw?: string }) => {
    onScan(code, meta);
  };

  const renderIcon = () => {
    if (mode === 'qr') {
      return <QrCode className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />;
    }
    if (mode === 'imei') {
      return <ScanBarcode className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />;
    }
    return <Camera className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />;
  };

  // Inline button designed to fit snugly inside an input container
  if (variant === 'inline') {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={tooltip}
          aria-label={tooltip}
          className={`flex items-center justify-center p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/15 transition active:scale-95 ${className}`}
        >
          {renderIcon()}
        </button>

        <BarcodeScannerModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onScan={handleScan}
          title={title}
          mode={mode}
          continuous={continuous}
          helperText={helperText}
        />
      </>
    );
  }

  // Full button with icon and label
  if (variant === 'button' || variant === 'compact') {
    const isCompact = variant === 'compact';
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={tooltip}
          className={`flex items-center justify-center gap-1.5 rounded-xl border font-bold transition active:scale-95 ${
            isCompact
              ? 'px-2.5 py-1.5 text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-xs'
              : 'px-3.5 py-2 text-xs bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black border-amber-400 shadow-sm'
          } ${className}`}
        >
          {renderIcon()}
          <span>{defaultLabel}</span>
        </button>

        <BarcodeScannerModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          onScan={handleScan}
          title={title}
          mode={mode}
          continuous={continuous}
          helperText={helperText}
        />
      </>
    );
  }

  // Default Icon Button
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={tooltip}
        aria-label={tooltip}
        className={`flex items-center justify-center rounded-xl bg-neutral-800/90 hover:bg-amber-500/20 text-neutral-300 hover:text-amber-400 border border-neutral-700 hover:border-amber-500/50 transition active:scale-95 ${
          size === 'sm'
            ? 'w-8 h-8'
            : size === 'lg'
            ? 'w-11 h-11'
            : 'w-9.5 h-9.5'
        } ${className}`}
      >
        {renderIcon()}
      </button>

      <BarcodeScannerModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onScan={handleScan}
        title={title}
        mode={mode}
        continuous={continuous}
        helperText={helperText}
      />
    </>
  );
};
