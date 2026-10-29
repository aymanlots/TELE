import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../lib/usePWAInstall';
import { useI18n } from '../i18n';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t } = useI18n();

  if (!isOnline) {
    return (
      <div className="fixed top-3 start-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-1.5 bg-neutral-950/90 border border-amber-500/40 rounded-full shadow-lg text-amber-300 text-xs font-semibold">
        <WifiOff className="w-3.5 h-3.5 text-amber-400" />
        <span>{t.offlineBanner}</span>
      </div>
    );
  }

  return null;
};
