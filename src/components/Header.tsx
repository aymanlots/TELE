import React, { useEffect, useState } from 'react';
import {
  Menu,
  Globe,
  Smartphone,
  Monitor,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { useViewMode } from '../lib/viewMode';
import { useAccessAuth } from '../lib/accessAuth';
import { AppTab } from '../types';
import { getMoroccoDateString } from '../lib/dateUtils';
import {
  subscribeSyncStatus,
  triggerCloudSync,
  SyncStatusSnapshot,
  isSupabaseConfigured,
} from '../lib/supabaseSync';

interface HeaderProps {
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  activeTab: AppTab;
  hasBackupWarning?: boolean;
  onNavigateSettings?: () => void;
  storeName?: string;
  storeLogo?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onNavigateSettings,
  storeName,
}) => {
  const { language, setLanguage, t } = useI18n();
  const { isMobileMode, toggleViewMode } = useViewMode();
  const { lock, can } = useAccessAuth();
  const [syncSnap, setSyncSnap] = useState<SyncStatusSnapshot | null>(null);
  const [timeStr, setTimeStr] = useState('04:27');

  useEffect(() => {
    return subscribeSyncStatus((snap) => setSyncSnap(snap));
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setTimeStr(`${hh}:${mm}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 30000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = getMoroccoDateString();
  const customBrand = storeName?.trim();

  return (
    <header
      dir="ltr"
      className="w-full bg-white/10 backdrop-blur-2xl border border-white/25 rounded-[24px] px-4 sm:px-6 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.65),inset_0_1px_1.5px_rgba(255,255,255,0.45)] relative overflow-hidden flex flex-wrap items-center justify-between gap-3"
    >
      {/* Warm Golden Ambient Center Glow (matches reference image) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 45% 90% at 34% 50%, rgba(255, 195, 45, 0.26) 0%, rgba(212, 175, 55, 0.08) 50%, transparent 80%)',
        }}
      />

      {/* LEFT SIDE: "Golden Shop — 3D فضاء العرض الذهبي" + 3D Gold Crown */}
      <div className="relative z-10 flex items-center gap-3">
        {!isMobileMode && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-2 rounded-xl bg-white/10 border border-white/20 text-amber-300 hover:bg-white/20 transition md:hidden cursor-pointer"
            aria-label="Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2.5 sm:gap-3.5">
          <span className="text-base sm:text-[22px] font-bold text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
            {customBrand ? `${customBrand} — 3D فضاء العرض الذهبي` : 'Golden Shop — 3D فضاء العرض الذهبي'}
          </span>

          {/* 3D Sculpted Gold Crown SVG */}
          <div className="relative flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 shrink-0 drop-shadow-[0_6px_12px_rgba(0,0,0,0.75)]">
            <svg viewBox="0 0 64 52" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="crownGoldMain" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FFF7C2" />
                  <stop offset="35%" stopColor="#FFD700" />
                  <stop offset="70%" stopColor="#D4AF37" />
                  <stop offset="100%" stopColor="#8B6508" />
                </linearGradient>
                <linearGradient id="crownGoldBase" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFE885" />
                  <stop offset="50%" stopColor="#C9971C" />
                  <stop offset="100%" stopColor="#6E4E04" />
                </linearGradient>
              </defs>
              {/* Crown Body */}
              <path
                d="M8 38 L4 14 L19 25 L32 8 L45 25 L60 14 L56 38 Z"
                fill="url(#crownGoldMain)"
                stroke="#FFF5B8"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              {/* Crown Base Rim */}
              <rect
                x="8"
                y="38"
                width="48"
                height="8"
                rx="3.5"
                fill="url(#crownGoldBase)"
                stroke="#FFE885"
                strokeWidth="1"
              />
              {/* Crown Pearls / Tips */}
              <circle cx="4" cy="12" r="3" fill="#FFF7C2" stroke="#D4AF37" strokeWidth="1" />
              <circle cx="32" cy="6" r="3.5" fill="#FFF7C2" stroke="#D4AF37" strokeWidth="1" />
              <circle cx="60" cy="12" r="3" fill="#FFF7C2" stroke="#D4AF37" strokeWidth="1" />
              {/* Jewels on Base */}
              <circle cx="20" cy="42" r="1.8" fill="#FFF8DC" />
              <circle cx="32" cy="42" r="2.2" fill="#FFF8DC" />
              <circle cx="44" cy="42" r="1.8" fill="#FFF8DC" />
            </svg>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Small Frosted Pill "04:27 • 2026-10-23 • الإصدار النسخة الملكية" + Utility Icons */}
      <div className="relative z-10 flex items-center gap-2">
        <div className="bg-white/12 backdrop-blur-xl border border-white/25 rounded-full px-3.5 sm:px-5 py-1.5 flex items-center gap-2.5 sm:gap-3.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_4px_14px_rgba(0,0,0,0.35)]">
          <span className="text-[11px] sm:text-sm font-bold text-white tracking-wide whitespace-nowrap">
            {timeStr} • {todayStr} • الإصدار النسخة الملكية
          </span>

          {/* Subtle Interactive Controls inside the Right Pill */}
          <div className="flex items-center gap-1.5 border-s border-white/20 ps-2">
            {syncSnap && syncSnap.isSyncing && (
              <button
                type="button"
                onClick={() => {
                  if (isSupabaseConfigured) triggerCloudSync();
                  else if (can('manage_settings') && onNavigateSettings) onNavigateSettings();
                }}
                className="p-1 rounded-full text-amber-300 hover:bg-white/10 transition cursor-pointer"
                title="Sync"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              </button>
            )}

            <button
              type="button"
              onClick={toggleViewMode}
              className="p-1 rounded-full text-amber-200/90 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title={isMobileMode ? 'Mode Mobile' : 'Mode PC'}
            >
              {isMobileMode ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}
              className="p-1 rounded-full text-amber-200/90 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Langue"
            >
              <Globe className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={lock}
              className="w-6 h-6 rounded-full bg-white/10 border border-amber-300/40 flex items-center justify-center text-amber-300 hover:bg-amber-400/20 transition cursor-pointer"
              title={t.lock.lockHeaderTooltip}
            >
              <Lock className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
