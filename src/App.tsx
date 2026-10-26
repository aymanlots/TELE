import React, { useState, useEffect, Suspense } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Search,
  Menu,
  ShieldCheck,
  Sun,
  Moon,
  Globe,
  Monitor,
  Smartphone,
  Lock,
  Crown,
} from 'lucide-react';
import { db, initializeDatabaseIfNeeded, getStoreSettings, saveStoreSettings } from './db';
import { AppTab, AdminApprovalRequest, PlanFeatureKey } from './types';
import { I18nProvider, useI18n } from './i18n';
import { ThemeProvider, useTheme } from './lib/theme';
import { ViewModeProvider, useViewMode } from './lib/viewMode';
import { ToastProvider } from './components/Toast';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { OfflineIndicator } from './components/OfflineIndicator';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { AccessAuthProvider, useAccessAuth } from './lib/accessAuth';
import { LicensePlanProvider, useLicensePlan } from './lib/licensePlan';
import { MasterLicenseModal } from './components/MasterLicenseModal';
import { ProUpgradeModal } from './components/ProUpgradeModal';
import { LockScreen } from './components/LockScreen';
import { RepairTrackerPublicView } from './components/RepairTrackerPublicView';
import { AdminApprovalsQueueModal } from './components/AdminApprovalModal';
import { getDefaultTabForRole } from './lib/permissions';
import { initFirebaseSync } from './lib/firebaseSync';

// Lazy-loaded Pages
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const StockPage = React.lazy(() => import('./pages/StockPage').then((m) => ({ default: m.StockPage })));
const PosPage = React.lazy(() => import('./pages/PosPage').then((m) => ({ default: m.PosPage })));
const BonsHistoryPage = React.lazy(() => import('./pages/BonsHistoryPage').then((m) => ({ default: m.BonsHistoryPage })));
const WarrantySavPage = React.lazy(() => import('./pages/WarrantySavPage').then((m) => ({ default: m.WarrantySavPage })));
const CustomersPage = React.lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const SuppliersPage = React.lazy(() => import('./pages/SuppliersPage').then((m) => ({ default: m.SuppliersPage })));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const RepairsPage = React.lazy(() => import('./pages/RepairsPage').then((m) => ({ default: m.RepairsPage })));
const SparePartsPage = React.lazy(() => import('./pages/SparePartsPage').then((m) => ({ default: m.SparePartsPage })));
const ExpensesPage = React.lazy(() => import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));

// URL Path <-> AppTab Mapping
const TAB_TO_PATH: Record<AppTab, string> = {
  dashboard: '/dashboard',
  pos: '/pos',
  stock: '/inventory',
  'spare-parts': '/spare-parts',
  repairs: '/repair',
  expenses: '/expenses',
  reports: '/reports',
  activity: '/activities',
  bons: '/orders',
  warranty: '/warranty',
  customers: '/customers',
  suppliers: '/suppliers',
  settings: '/settings',
};

function getTabFromPathname(pathname: string): AppTab | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const entries = Object.entries(TAB_TO_PATH) as [AppTab, string][];
  for (const [tab, path] of entries) {
    if (clean === path) return tab;
  }
  if (clean === '/stock') return 'stock';
  if (clean === '/repairs') return 'repairs';
  if (clean === '/bons') return 'bons';
  if (clean === '/activity') return 'activity';
  return null;
}

export function AppContent() {
  const { language, setLanguage } = useI18n();
  const { theme, toggleTheme, setTheme } = useTheme();
  const { isMobileMode, toggleViewMode } = useViewMode();
  const { isUnlocked, userRole, isOwnerMode, canAccess, lock } = useAccessAuth();
  const {
    planTier,
    daysRemaining,
    isExpired,
    subscriptionType,
    isFeatureAllowed,
    openUpgradeModal,
  } = useLicensePlan();

  const TAB_FEATURE_MAP: Partial<Record<AppTab, PlanFeatureKey>> = {
    'spare-parts': 'spare_parts',
    repairs: 'repairs',
    expenses: 'expenses',
    reports: 'advanced_reports',
    activity: 'multi_employee',
  };

  const [trackRepairParam, setTrackRepairParam] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('track_repair');
    } catch {
      return null;
    }
  });
  const [trackRepairNo, setTrackRepairNo] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('no');
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const fromUrl = getTabFromPathname(window.location.pathname);
    return fromUrl || 'dashboard';
  });
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isApprovalsOpen, setIsApprovalsOpen] = useState(false);
  const [navParams, setNavParams] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [_hasBackupWarning, setHasBackupWarning] = useState(false);

  // Enforce role-based tab restrictions when user unlocks or switches role
  useEffect(() => {
    if (isUnlocked && !canAccess(activeTab)) {
      const fallbackTab = getDefaultTabForRole(userRole);
      setActiveTab(fallbackTab);
      const targetPath = TAB_TO_PATH[fallbackTab] || '/dashboard';
      try {
        window.history.replaceState({ tab: fallbackTab }, '', targetPath);
      } catch {}
    }
  }, [isUnlocked, userRole, activeTab, canAccess]);

  // Auto-open Plan Selection & Activation Modal when the 30-day trial expires
  useEffect(() => {
    if (isUnlocked && isExpired) {
      openUpgradeModal('repairs');
    }
  }, [isUnlocked, isExpired, openUpgradeModal]);

  // Sync browser Back/Forward navigation with activeTab
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPathname(window.location.pathname);
      if (tab) {
        setActiveTab(tab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initialize DB on first mount
  useEffect(() => {
    async function init() {
      await initializeDatabaseIfNeeded();
      if (navigator.storage && navigator.storage.persist) {
        try {
          await navigator.storage.persist();
        } catch {}
      }
      const settings = await getStoreSettings();
      if (settings.theme && !localStorage.getItem('golden_shop_theme')) {
        setTheme(settings.theme);
      }
      if (settings.language && !localStorage.getItem('golden_shop_language')) {
        setLanguage(settings.language);
      }
      if (settings.lastBackupDate) {
        const last = new Date(settings.lastBackupDate);
        const diffDays = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
        setHasBackupWarning(diffDays >= 7);
      } else {
        setHasBackupWarning(true);
      }
      setIsInitialized(true);
      // Start Firebase real-time sync & outbox processor
      try {
        initFirebaseSync();
      } catch (err) {
        console.warn('Firebase sync startup:', err);
      }
    }
    init();
  }, [setTheme, setLanguage]);

  // Global keydown shortcut for search (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Real-time store branding from settings via useLiveQuery
  const storeSettings = useLiveQuery(async () => {
    try {
      const record = await db.settings.get('store_settings');
      return record?.value;
    } catch {
      return null;
    }
  }, []);

  const storeName = storeSettings?.storeName?.trim() || '';
  const storeLogo = storeSettings?.logo;
  const pendingApprovals: AdminApprovalRequest[] = Array.isArray(storeSettings?.pendingApprovals)
    ? storeSettings.pendingApprovals.filter((r: AdminApprovalRequest) => r.status === 'pending')
    : [];
  const fallbackName = language === 'ar' ? 'المحل الذهبي' : 'Golden Shop';
  const displayName = storeName || fallbackName;

  useEffect(() => {
    document.title = displayName;
  }, [displayName]);

  // Sidebar badge queries
  const lowStockCount =
    useLiveQuery(async () => {
      try {
        const prods = await db.products.toArray();
        return prods.filter((p) => !p.deleted_at && (p.quantity ?? 0) <= (p.minAlertQty ?? 5)).length;
      } catch {
        return 0;
      }
    }, []) ?? 0;

  const openSavCount =
    useLiveQuery(async () => {
      try {
        const tickets = await db.savTickets.toArray();
        return tickets.filter((t) => !t.deleted_at && t.status !== 'resolved').length;
      } catch {
        return 0;
      }
    }, []) ?? 0;

  const openRepairsCount =
    useLiveQuery(async () => {
      try {
        const repairs = await db.repairs.toArray();
        return repairs.filter((r) => !r.deleted_at && r.status !== 'delivered').length;
      } catch {
        return 0;
      }
    }, []) ?? 0;

  const lowSparePartsCount =
    useLiveQuery(async () => {
      try {
        const parts = await db.spareParts.toArray();
        return parts.filter((p) => !p.deleted_at && p.quantity <= (p.minAlertQty ?? 2)).length;
      } catch {
        return 0;
      }
    }, []) ?? 0;

  // Navigate to tab & update URL path (with Feature Gating)
  const handleNavigate = (tab: AppTab, params?: any) => {
    const fKey = TAB_FEATURE_MAP[tab];
    if (fKey && !isFeatureAllowed(fKey)) {
      openUpgradeModal(fKey);
      return;
    }
    setActiveTab(tab);
    setNavParams(params || null);
    const targetPath = TAB_TO_PATH[tab] || '/dashboard';
    try {
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab }, '', targetPath);
      }
    } catch {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isInitialized) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-transparent text-white gap-4 relative z-10">
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden no-print">
          <img
            src="/shop-bg.jpg"
            alt=""
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        </div>
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-bold text-amber-400 text-lg animate-pulse uppercase relative z-10">
          {storeName ? storeName.charAt(0).toUpperCase() : 'G'}
        </div>
        <p className="text-xs text-neutral-200 font-medium relative z-10">
          {language === 'ar' ? 'جاري التحميل...' : 'Chargement...'}
        </p>
      </div>
    );
  }

  // Public Customer QR Repair Tracking View (No shop PIN required)
  if (trackRepairParam) {
    return (
      <RepairTrackerPublicView
        rawTrackParam={trackRepairParam}
        repairNoParam={trackRepairNo}
        onExitPublicView={() => {
          setTrackRepairParam(null);
          setTrackRepairNo(null);
          try {
            window.history.replaceState({}, '', window.location.pathname);
          } catch {}
        }}
      />
    );
  }

  if (!isUnlocked) {
    return <LockScreen />;
  }

  const activeFeatureKey = TAB_FEATURE_MAP[activeTab];
  const isFeatureRestricted = activeFeatureKey ? !isFeatureAllowed(activeFeatureKey) : false;
  const effectiveTab: AppTab = canAccess(activeTab)
    ? isFeatureRestricted
      ? 'pos'
      : activeTab
    : getDefaultTabForRole(userRole);

  return (
    <div
      dir="rtl"
      className={`min-h-screen bg-transparent flex flex-col relative ${
        theme === 'light' ? 'text-stone-900' : 'text-white'
      }`}
    >
      {/* FIXED LUXURY SHOP INTERIOR BACKGROUND (Dark Mode vs Day/Light Mode) */}
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none overflow-hidden no-print">
        <img
          src="/shop-bg.jpg"
          alt=""
          className="w-full h-full object-cover object-center"
        />
        <div
          className={`absolute inset-0 transition-colors duration-300 ${
            theme === 'light'
              ? 'bg-[#FAF7F0]/90 backdrop-blur-[6px]'
              : 'bg-black/40 backdrop-blur-[2px]'
          }`}
        />
      </div>

      {/* Offline Connectivity Status Pill */}
      <OfflineIndicator />

      {/* Global Search Dialog */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={handleNavigate}
      />

      {/* Admin Approvals Queue Modal */}
      {isOwnerMode && (
        <AdminApprovalsQueueModal
          isOpen={isApprovalsOpen}
          onClose={() => setIsApprovalsOpen(false)}
          requests={storeSettings?.pendingApprovals || []}
        />
      )}

      {/* MAIN LAYOUT: Right Sidebar (280px) + Left Column (Top Control & Search Bar -> Content) */}
      <div
        className={`relative z-10 w-full ${
          isMobileMode ? 'max-w-[640px]' : 'max-w-[1440px]'
        } mx-auto px-3 sm:px-5 pt-4 pb-8 flex-1 flex flex-row items-start gap-4`}
      >
        {/* RIGHT SIDEBAR (Visible in PC Mode) */}
        {!isMobileMode && (
          <Sidebar
            activeTab={effectiveTab}
            onSelectTab={(tab) => handleNavigate(tab)}
            isOpen={isSidebarOpenMobile}
            onCloseMobile={() => setIsSidebarOpenMobile(false)}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
            lowStockCount={lowStockCount}
            lowSparePartsCount={lowSparePartsCount}
            openSavCount={openSavCount}
            openRepairsCount={openRepairsCount}
            storeName={storeName}
            storeLogo={storeLogo}
          />
        )}

        {/* LEFT CONTENT AREA: Top Control & Search Bar -> Active Page */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* TOP SEARCH & UTILITY BAR (Responsive: Search + PC/Mobile + Day/Night + Language + Approvals + Lock) */}
          <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Search Row */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              {!isMobileMode && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpenMobile((prev) => !prev)}
                  className="p-3 rounded-[18px] bg-black/65 backdrop-blur-xl border border-yellow-500/25 text-amber-300 hover:bg-black/80 transition md:hidden cursor-pointer shrink-0"
                  aria-label="Menu"
                  title={language === 'ar' ? 'القائمة الجانبية' : 'Menu'}
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="flex-1 min-w-0 bg-black/65 hover:bg-black/75 backdrop-blur-xl border border-yellow-500/25 rounded-[20px] px-4 py-2.5 sm:py-3 flex items-center justify-start gap-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition cursor-pointer"
              >
                <Search className="w-4 h-4 text-[#FFD700] shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-white/90 truncate">
                  {language === 'ar'
                    ? 'ابحث بالاسم أو الباركود أو IMEI'
                    : 'Rechercher par nom, code-barres ou IMEI'}
                </span>
              </button>
            </div>

            {/* Utility Controls Row (PC/Mobile Mode, Day/Night Theme, Language AR/FR, Approvals, Lock) */}
            <div className="flex items-center justify-between sm:justify-end gap-1.5 flex-wrap shrink-0">
              {/* 1. PC / Mobile Mode Switcher Button */}
              <button
                type="button"
                onClick={toggleViewMode}
                className={`px-3 py-2 sm:py-2.5 rounded-[16px] backdrop-blur-xl border flex items-center gap-1.5 text-xs font-extrabold transition cursor-pointer shadow-md ${
                  !isMobileMode
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black border-yellow-200'
                    : 'bg-black/65 hover:bg-black/80 text-[#FFD700] border-yellow-500/25'
                }`}
                title={
                  isMobileMode
                    ? language === 'ar'
                      ? 'التحويل إلى وضع الحاسوب (PC)'
                      : 'Passer en Mode PC'
                    : language === 'ar'
                    ? 'التحويل إلى وضع الهاتف'
                    : 'Passer en Mode Mobile'
                }
              >
                {isMobileMode ? (
                  <>
                    <Monitor className="w-4 h-4 shrink-0" />
                    <span>{language === 'ar' ? 'وضع PC' : 'Mode PC'}</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4 shrink-0" />
                    <span>{language === 'ar' ? 'وضع الهاتف' : 'Mobile'}</span>
                  </>
                )}
              </button>

              {/* 2. Day / Night Theme Switcher Button */}
              <button
                type="button"
                onClick={async () => {
                  const next = theme === 'dark' ? 'light' : 'dark';
                  toggleTheme();
                  try {
                    const s = await getStoreSettings();
                    await saveStoreSettings({ ...s, theme: next });
                  } catch {}
                }}
                className={`px-3 py-2 sm:py-2.5 rounded-[16px] backdrop-blur-xl border flex items-center gap-1.5 text-xs font-extrabold transition cursor-pointer shadow-md ${
                  theme === 'light'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black border-yellow-200'
                    : 'bg-black/65 hover:bg-black/80 text-[#FFD700] border-yellow-500/25'
                }`}
                title={
                  theme === 'dark'
                    ? language === 'ar'
                      ? 'تفعيل الوضع النهاري (الأبيض)'
                      : 'Activer le Mode Clair'
                    : language === 'ar'
                    ? 'تفعيل الوضع الليلي (الداكن)'
                    : 'Activer le Mode Sombre'
                }
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-4 h-4 shrink-0 text-[#FFD700]" />
                    <span>{language === 'ar' ? 'نهاري' : 'Clair'}</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 shrink-0 text-black" />
                    <span>{language === 'ar' ? 'ليلي' : 'Sombre'}</span>
                  </>
                )}
              </button>

              {/* 3. Language Switcher Button (AR / FR) */}
              <button
                type="button"
                onClick={async () => {
                  const nextLang = language === 'ar' ? 'fr' : 'ar';
                  setLanguage(nextLang);
                  try {
                    const s = await getStoreSettings();
                    await saveStoreSettings({ ...s, language: nextLang });
                  } catch {}
                }}
                className="px-3 py-2 sm:py-2.5 rounded-[16px] bg-black/65 hover:bg-black/80 backdrop-blur-xl border border-yellow-500/25 text-[#FFD700] flex items-center gap-1.5 text-xs font-extrabold transition cursor-pointer shadow-md"
                title={language === 'ar' ? 'تغيير اللغة (FR / AR)' : 'Changer la langue (AR / FR)'}
              >
                <Globe className="w-4 h-4 shrink-0" />
                <span className="font-mono">{language === 'ar' ? 'FR' : 'AR'}</span>
              </button>

              {/* 4. Admin Approvals Queue Button (Owner only) */}
              {isOwnerMode && (
                <button
                  type="button"
                  onClick={() => setIsApprovalsOpen(true)}
                  className={`px-3 py-2 sm:py-2.5 rounded-[16px] backdrop-blur-xl border flex items-center gap-1.5 text-xs font-black transition cursor-pointer shadow-md ${
                    pendingApprovals.length > 0
                      ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black border-yellow-200 animate-pulse'
                      : 'bg-black/65 hover:bg-black/80 text-[#FFD700] border-yellow-500/25'
                  }`}
                  title={
                    language === 'ar'
                      ? 'مراجعة طلبات التعديل والحذف من العامل'
                      : "Demandes d'approbation de l'employé"
                  }
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="hidden md:inline">
                    {language === 'ar' ? 'موافقات العامل' : 'Approbations'}
                  </span>
                  {pendingApprovals.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-black text-[#FFD700] font-mono text-[10px] font-black">
                      {pendingApprovals.length}
                    </span>
                  )}
                </button>
              )}

              {/* 5. Plan Status / Upgrade Button (Client View) */}
              <button
                type="button"
                onClick={() => openUpgradeModal('repairs')}
                className={`px-3 py-2 sm:py-2.5 rounded-[16px] backdrop-blur-xl border flex items-center gap-1.5 text-xs font-black transition cursor-pointer shadow-md ${
                  planTier === 'pro'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black border-yellow-200 shadow-[0_2px_12px_rgba(245,208,76,0.35)]'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-400 shadow-[0_2px_12px_rgba(59,130,246,0.3)]'
                }`}
                title={
                  language === 'ar'
                    ? 'حالة النسخة / تفعيل الاشتراك'
                    : 'Version du logiciel / Activer abonnement'
                }
              >
                <Crown className="w-3.5 h-3.5 shrink-0 fill-current" />
                <span>
                  {subscriptionType === 'trial'
                    ? language === 'ar'
                      ? 'تجريبي VIP'
                      : 'ESSAI VIP'
                    : planTier === 'pro'
                    ? 'PRO VIP'
                    : 'STANDARD'}
                </span>
              </button>

              {/* 6. Lock / Switch Account Button */}
              <button
                type="button"
                onClick={lock}
                className="px-3 py-2 sm:py-2.5 rounded-[16px] bg-black/65 hover:bg-rose-500/20 backdrop-blur-xl border border-yellow-500/25 hover:border-rose-500/40 text-amber-300 hover:text-rose-300 flex items-center gap-1.5 text-xs font-extrabold transition cursor-pointer shadow-md"
                title={language === 'ar' ? 'قفل الشاشة / تبديل الحساب' : 'Verrouiller / Changer de compte'}
              >
                <Lock className="w-4 h-4 shrink-0" />
                <span>{language === 'ar' ? 'قفل' : 'Verrouiller'}</span>
              </button>
            </div>
          </div>

          {/* 3-DAY SUBSCRIPTION EXPIRY NOTIFICATION BANNER (Silent for first 27 days, only appears when <= 3 days remain) */}
          {daysRemaining !== null && daysRemaining <= 3 && (
            <div
              dir={language === 'ar' ? 'rtl' : 'ltr'}
              className="w-full rounded-[20px] p-3.5 sm:px-5 bg-gradient-to-r from-amber-500/25 via-rose-500/20 to-amber-500/25 border-2 border-yellow-400/70 backdrop-blur-xl shadow-[0_8px_30px_rgba(245,208,76,0.25)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-pulse"
            >
              <div className="flex items-center gap-3 text-white">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-b from-yellow-400 to-amber-600 text-black flex items-center justify-center shrink-0 font-black">
                  <Crown className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-black text-yellow-300">
                    {daysRemaining > 0
                      ? language === 'ar'
                        ? `⏳ إشعار الاشتراك: بقي لك ${daysRemaining} ${daysRemaining === 1 ? 'يوم واحد' : 'أيام'} فقط على انتهاء الفترة التجريبية (30 يوماً)!`
                        : `⏳ Alerte Abonnement : Il vous reste ${daysRemaining} jour(s) d'essai gratuit (30 jours) !`
                      : language === 'ar'
                      ? '⚠️ انتهت الفترة التجريبية (30 يوماً) — المرجو اختيار باقتك وتفعيل الاشتراك للاستمرار'
                      : "⚠️ Période d'essai de 30 jours terminée — Choisissez votre pack pour continuer"}
                  </div>
                  <div className="text-[11px] text-neutral-200 mt-0.5">
                    {language === 'ar'
                      ? 'اختر الآن ما بين النسخة العادية (Standard) أو النسخة الاحترافية الشاملة (PRO VIP) لتجنب توقف التطبيق.'
                      : 'Choisissez maintenant entre la Version Standard ou la Version PRO VIP pour éviter toute interruption.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openUpgradeModal('repairs')}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-neutral-950 font-black text-xs shrink-0 shadow-lg cursor-pointer transition"
              >
                {language === 'ar' ? 'اختيار الباقة وتفعيل الاشتراك' : 'Choisir un Pack & Activer'}
              </button>
            </div>
          )}

          {/* ACTIVE PAGE VIEWPORT */}
          <main className={`flex-1 w-full ${isMobileMode ? 'pb-28' : ''}`}>
            <Suspense
              fallback={
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-neutral-200">
                  <div className="w-8 h-8 rounded-lg border-2 border-amber-400 border-t-transparent animate-spin" />
                  <span className="text-xs font-medium">
                    {language === 'ar' ? 'جاري التحميل...' : 'Chargement...'}
                  </span>
                </div>
              }
            >
              {effectiveTab === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
              {effectiveTab === 'stock' && (
                <StockPage
                  initialSearch={navParams?.search}
                  initialAction={navParams?.action}
                />
              )}
              {effectiveTab === 'spare-parts' && (
                <SparePartsPage
                  initialSearch={navParams?.search}
                  initialAction={navParams?.action}
                />
              )}
              {effectiveTab === 'pos' && (
                <PosPage onNavigateToBons={() => handleNavigate('bons')} />
              )}
              {effectiveTab === 'bons' && (
                <BonsHistoryPage initialSearch={navParams?.search} />
              )}
              {effectiveTab === 'repairs' && (
                <RepairsPage initialSearch={navParams?.search} />
              )}
              {effectiveTab === 'expenses' && <ExpensesPage />}
              {effectiveTab === 'reports' && (
                <ReportsPage key="reports-overview" initialSubTab="overview" />
              )}
              {effectiveTab === 'activity' && (
                <ReportsPage key="reports-activity" initialSubTab="activity" />
              )}
              {effectiveTab === 'warranty' && <WarrantySavPage />}
              {effectiveTab === 'customers' && (
                <CustomersPage initialSearch={navParams?.search} />
              )}
              {effectiveTab === 'suppliers' && <SuppliersPage />}
              {effectiveTab === 'settings' && (
                <SettingsPage
                  onSettingsSaved={async () => {
                    const settings = await getStoreSettings();
                    if (settings.lastBackupDate) {
                      const last = new Date(settings.lastBackupDate);
                      const diffDays = Math.floor(
                        (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24)
                      );
                      setHasBackupWarning(diffDays >= 7);
                    }
                  }}
                />
              )}
            </Suspense>
          </main>
        </div>
      </div>

      {/* Mobile Mode Bottom Navigation Bar */}
      {isMobileMode && (
        <BottomNav
          activeTab={effectiveTab}
          onSelectTab={handleNavigate}
          lowStockCount={lowStockCount}
          lowSparePartsCount={lowSparePartsCount}
          openSavCount={openSavCount}
          openRepairsCount={openRepairsCount}
        />
      )}

      {/* Developer Master License Modal */}
      <MasterLicenseModal />

      {/* Customer PRO Feature Upgrade Modal */}
      <ProUpgradeModal />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ViewModeProvider>
          <AccessAuthProvider>
            <LicensePlanProvider>
              <ToastProvider>
                <AppContent />
              </ToastProvider>
            </LicensePlanProvider>
          </AccessAuthProvider>
        </ViewModeProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
