import React, { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';
import { useI18n } from '../i18n';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const { t } = useI18n();

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors shrink-0"
        title={t.settings.installApp}
      >
        <Download className="w-3.5 h-3.5 text-amber-400" />
        <span className="hidden sm:inline">{t.settings.installApp}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition shrink-0"
        >
          <Share className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">PWA iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl text-neutral-100">
              <h3 className="text-base font-semibold text-amber-400">
                {t.settings.installApp} (iPhone / iPad)
              </h3>
              <p className="mt-3 text-xs text-neutral-300 space-y-2 leading-relaxed">
                1. Appuyez sur le bouton <strong>Partager</strong> <Share className="w-3 h-3 inline mx-1" /> dans la barre Safari.<br />
                2. Faites défiler et sélectionnez <strong>Sur l'écran d'accueil</strong>.<br />
                3. L'application fonctionnera ensuite 100% hors-ligne.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-neutral-800 hover:bg-neutral-700 py-2 text-xs font-semibold text-neutral-200 transition"
              >
                {t.close}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
