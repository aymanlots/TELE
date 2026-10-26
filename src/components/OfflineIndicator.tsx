import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, AlertTriangle, Cloud, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from '../lib/usePWAInstall';
import { useI18n } from '../i18n';
import {
  subscribeSyncStatus,
  triggerCloudSync,
  SyncStatusSnapshot,
} from '../lib/firebaseSync';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t, language } = useI18n();
  const [syncSnap, setSyncSnap] = useState<SyncStatusSnapshot | null>(null);

  useEffect(() => {
    return subscribeSyncStatus((snap) => setSyncSnap(snap));
  }, []);

  if (!isOnline) {
    return (
      <div className="fixed top-3 start-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 bg-neutral-900 border border-amber-500/50 rounded-full shadow-xl text-amber-300 text-xs font-medium">
        <WifiOff className="w-3.5 h-3.5 text-amber-400" />
        <span>
          {t.offlineBanner}
          {syncSnap && syncSnap.pendingCount > 0
            ? ` (${
                language === 'ar'
                  ? `في الانتظار: ${syncSnap.pendingCount}`
                  : `En attente : ${syncSnap.pendingCount} opérations`
              })`
            : ''}
        </span>
      </div>
    );
  }

  if (syncSnap?.status === 'error') {
    return (
      <div className="fixed top-3 start-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 bg-neutral-900 border border-rose-500/50 rounded-full shadow-xl text-rose-300 text-xs font-medium">
        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        <span>
          {language === 'ar' ? 'خطأ في مزامنة Firebase' : 'Erreur de synchronisation Firebase'}
        </span>
        <button
          type="button"
          onClick={() => triggerCloudSync()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500 text-neutral-950 font-bold text-[11px] hover:bg-rose-400 transition"
        >
          <RefreshCw className="w-3 h-3" />
          <span>{language === 'ar' ? 'إعادة المحاولة' : 'Réessayer'}</span>
        </button>
      </div>
    );
  }

  return null;
};
