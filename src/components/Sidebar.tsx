import React, { useState } from 'react';
import {
  LayoutGrid,
  Calculator,
  Settings,
  Wrench,
  Banknote,
  BarChart3,
  List,
  Users,
  Truck,
  ShieldCheck,
  Sparkles,
  Lock,
  Crown,
  Package,
  Cog,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { AppTab, PlanFeatureKey } from '../types';
import { useAccessAuth } from '../lib/accessAuth';
import { getRoleLabel } from '../lib/permissions';
import { getCurrentUserContext } from '../db';
import { useLicensePlan } from '../lib/licensePlan';
import { useI18n } from '../i18n';
import { useOnlineStatus } from '../lib/usePWAInstall';

interface SidebarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  lowStockCount?: number;
  lowSparePartsCount?: number;
  openSavCount?: number;
  openRepairsCount?: number;
  storeName?: string;
  storeLogo?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
  storeName,
  storeLogo,
  lowStockCount,
  openRepairsCount,
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';
  const isOnline = useOnlineStatus();
  const { userRole, canAccess, lock } = useAccessAuth();
  const { planTier, isFeatureAllowed, openUpgradeModal, openMasterModal } = useLicensePlan();
  const userCtx = getCurrentUserContext();
  const [logoClickCount, setLogoClickCount] = useState(0);

  const TAB_FEATURE_MAP: Partial<Record<AppTab, PlanFeatureKey>> = {
    'spare-parts': 'spare_parts',
    repairs: 'repairs',
    expenses: 'expenses',
    reports: 'advanced_reports',
    activity: 'multi_employee',
  };

  const handleLogoMultiClick = () => {
    const next = logoClickCount + 1;
    if (next >= 5) {
      setLogoClickCount(0);
      openMasterModal();
    } else {
      setLogoClickCount(next);
      setTimeout(() => setLogoClickCount(0), 3000);
    }
  };

  const allPrimaryMenuItems: {
    id: AppTab;
    path: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }[] = [
    {
      id: 'dashboard',
      path: '/dashboard',
      label: isAr ? 'لوحة القيادة' : 'Tableau de Bord',
      icon: LayoutGrid,
    },
    {
      id: 'pos',
      path: '/pos',
      label: isAr ? 'نقطة البيع (Caisse)' : 'Point de Vente',
      icon: Calculator,
    },
    {
      id: 'stock',
      path: '/inventory',
      label: isAr ? 'المخزون (السلعة)' : 'Gestion du Stock',
      icon: Package,
      badge: lowStockCount && lowStockCount > 0 ? lowStockCount : undefined,
    },
    {
      id: 'spare-parts',
      path: '/spare-parts',
      label: isAr ? 'قطع الغيار' : 'Pièces Détachées',
      icon: Cog,
    },
    {
      id: 'repairs',
      path: '/repair',
      label: isAr ? 'ورشة الإصلاح' : 'Atelier Réparation',
      icon: Wrench,
      badge: openRepairsCount && openRepairsCount > 0 ? openRepairsCount : undefined,
    },
    {
      id: 'expenses',
      path: '/expenses',
      label: isAr ? 'المصاريف والديون' : 'Dépenses & Charges',
      icon: Banknote,
    },
    {
      id: 'reports',
      path: '/reports',
      label: isAr ? 'التقارير المالية' : 'Rapports Financiers',
      icon: BarChart3,
    },
    {
      id: 'activity',
      path: '/activities',
      label: isAr ? 'سجل الأنشطة' : "Journal d'Activité",
      icon: Sparkles,
    },
    {
      id: 'bons',
      path: '/orders',
      label: isAr ? 'سجل المبيعات' : 'Historique des Bons',
      icon: List,
    },
  ];

  const allSecondaryItems: {
    id: AppTab;
    path: string;
    label: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { id: 'customers', path: '/customers', label: isAr ? 'الزبناء' : 'Clients', icon: Users },
    { id: 'suppliers', path: '/suppliers', label: isAr ? 'الموردين' : 'Fournisseurs', icon: Truck },
    { id: 'warranty', path: '/warranty', label: isAr ? 'الضمان' : 'Garantie', icon: ShieldCheck },
    { id: 'settings', path: '/settings', label: isAr ? 'الإعدادات' : 'Paramètres', icon: Settings },
  ];

  const primaryMenuItems = allPrimaryMenuItems.filter((item) => canAccess(item.id));
  const secondaryItems = allSecondaryItems.filter((item) => canAccess(item.id));

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* RIGHT SIDEBAR: Tall, Translucent Frosted Glass, Collapsible (يدخلها او يخرجها) */}
      <aside
        dir={isAr ? 'rtl' : 'ltr'}
        className={`fixed md:sticky top-4 end-3 z-40 h-[calc(100vh-2rem)] shrink-0 bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl p-3 sm:p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.12)] flex flex-col justify-between transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64 lg:w-70'
        } ${isOpen ? 'translate-x-0' : 'translate-x-[110%] md:translate-x-0'}`}
      >
        <div className="flex flex-col min-h-0 flex-1">
          {/* Top Header: Official App Icon Logo + Shop Name + Collapse/Expand Toggle (Stacked when collapsed so arrow never overlaps logo) */}
          <div
            className={`flex ${
              isCollapsed
                ? 'flex-col items-center justify-center gap-2'
                : 'flex-row items-center justify-between gap-2'
            } pb-3 mb-2.5 border-b border-white/15 shrink-0`}
          >
            <div
              onClick={handleLogoMultiClick}
              className={`flex items-center ${
                isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0 flex-1'
              } select-none cursor-pointer`}
              title={storeName || 'Golden Shop'}
            >
              {/* Official App Icon Logo ONLY (Fits square frame edge-to-edge cleanly) */}
              <div className="w-11 h-11 rounded-xl bg-black border border-amber-400/50 flex items-center justify-center shrink-0 shadow-md overflow-hidden">
                <img
                  src="/assets/aistudio/image_e43ac3cd.png"
                  alt="Golden Shop Icon"
                  className="w-full h-full object-cover"
                />
              </div>

              {!isCollapsed && (
                <div className="min-w-0 leading-tight flex-1">
                  <div className="text-xs font-black text-white truncate drop-shadow">
                    {storeName || userCtx.name || (isAr ? 'المحل الذهبي' : 'Golden Shop')}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-bold text-amber-400 truncate">
                      {getRoleLabel(userRole, language)}
                    </span>
                    <span className="text-white/30">•</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                      />
                      <span>{isOnline ? (isAr ? 'متصل' : 'Connecté') : isAr ? 'محلي' : 'Local'}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Collapse / Expand Toggle Button (يدخلها او يخرجها — cleanly positioned without overlapping logo) */}
            <div className={`flex items-center gap-1 shrink-0 ${isCollapsed ? 'w-full justify-center' : ''}`}>
              <button
                type="button"
                onClick={onToggleCollapse}
                className={`hidden md:flex items-center justify-center ${
                  isCollapsed ? 'w-10 h-8' : 'p-1.5'
                } rounded-xl bg-white/10 hover:bg-amber-400/20 backdrop-blur-md text-amber-400 hover:text-amber-300 border border-amber-500/30 transition cursor-pointer shadow-sm`}
                title={
                  isCollapsed
                    ? isAr
                      ? 'توسيع القائمة الجانبية (إخراج)'
                      : 'Agrandir le menu'
                    : isAr
                    ? 'تصغير القائمة الجانبية (إدخال)'
                    : 'Réduire le menu'
                }
              >
                {isCollapsed ? (
                  isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                ) : (
                  isAr ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />
                )}
              </button>

              {!isCollapsed && canAccess('settings') && (
                <a
                  href="/settings"
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectTab('settings');
                    onCloseMobile();
                  }}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-amber-400 border border-amber-500/30 transition cursor-pointer shadow-sm"
                  title={isAr ? 'الإعدادات' : 'Paramètres'}
                >
                  <Settings className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          {/* Primary Navigation Links (Scrollable with clean spacing) */}
          <nav className="space-y-1.5 overflow-y-auto flex-1 pr-0.5 custom-scrollbar">
            {primaryMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const fKey = TAB_FEATURE_MAP[item.id];
              const isLocked = fKey ? !isFeatureAllowed(fKey) : false;

              return (
                <a
                  key={item.id}
                  href={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    if (isLocked && fKey) {
                      openUpgradeModal(fKey, item.label);
                      return;
                    }
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center ${
                    isCollapsed ? 'justify-center p-2.5' : 'justify-between gap-2.5 px-3 py-2.5'
                  } text-xs rounded-xl transition-all cursor-pointer no-underline ${
                    isActive
                      ? 'bg-amber-400 text-neutral-950 font-black shadow-[0_4px_12px_rgba(251,191,36,0.35)] border border-amber-300'
                      : 'text-white/90 hover:text-white hover:bg-white/8 font-bold'
                  }`}
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'} min-w-0 flex-1`}>
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 backdrop-blur-md transition-all ${
                        isActive
                          ? 'bg-neutral-950/20 text-neutral-950 shadow-inner'
                          : 'bg-white/6 border border-white/10 text-amber-400 group-hover:bg-amber-400/20 group-hover:border-amber-400/30'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-neutral-950 stroke-[2.5]' : 'text-amber-400'
                        }`}
                      />
                    </div>
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </div>

                  {!isCollapsed && item.badge && item.badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-mono font-bold shrink-0">
                      {item.badge}
                    </span>
                  )}

                  {!isCollapsed && isLocked && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-black font-mono border border-amber-500/40 shrink-0">
                      PRO
                    </span>
                  )}
                </a>
              );
            })}
          </nav>

          {/* Secondary Utility Links (Customers, Suppliers, Warranty, Settings) */}
          {secondaryItems.length > 0 && (
            <div
              className={`pt-2.5 mt-2 border-t border-white/10 shrink-0 ${
                isCollapsed ? 'flex flex-col items-center gap-1.5' : 'grid grid-cols-4 gap-1'
              }`}
            >
              {secondaryItems.map((sec) => {
                const Icon = sec.icon;
                const isActive = activeTab === sec.id;
                return (
                  <a
                    key={sec.id}
                    href={sec.path}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      onSelectTab(sec.id);
                      onCloseMobile();
                    }}
                    className={`flex ${
                      isCollapsed
                        ? 'p-1.5 rounded-xl justify-center items-center w-full'
                        : 'flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-[10px]'
                    } font-bold transition cursor-pointer no-underline ${
                      isActive
                        ? 'bg-amber-400 text-neutral-950 font-black'
                        : 'text-white/85 hover:text-white hover:bg-white/8'
                    }`}
                    title={sec.label}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 backdrop-blur-md transition-all ${
                        isActive
                          ? 'bg-neutral-950/20 text-neutral-950'
                          : 'bg-white/6 border border-white/10 text-amber-400'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-neutral-950' : 'text-amber-400'}`} />
                    </div>
                    {!isCollapsed && <span className="truncate max-w-full">{sec.label}</span>}
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Plan & Quick Lock Buttons */}
        <div
          className={`pt-2.5 mt-2.5 border-t border-white/10 shrink-0 flex items-center ${
            isCollapsed ? 'flex-col gap-2' : 'justify-between gap-2'
          }`}
        >
          <button
            type="button"
            onClick={lock}
            className={`flex items-center justify-center gap-1 ${
              isCollapsed ? 'w-full p-2' : 'px-2.5 py-1.5'
            } rounded-xl bg-white/8 hover:bg-white/15 text-amber-300 border border-amber-500/25 text-[10px] font-bold transition cursor-pointer`}
            title={isAr ? 'قفل الشاشة أو تغيير المستخدم' : 'Verrouiller / Changer de compte'}
          >
            <Lock className="w-3.5 h-3.5" />
            {!isCollapsed && <span>{isAr ? 'تبديل الحساب' : 'Compte'}</span>}
          </button>

          <button
            type="button"
            onClick={() => openUpgradeModal('repairs')}
            className={`${
              isCollapsed ? 'w-full p-2 justify-center' : 'px-3 py-1.5'
            } rounded-xl font-black text-[11px] tracking-wide transition cursor-pointer flex items-center justify-center gap-1.5 ${
              planTier === 'pro'
                ? 'bg-amber-400 hover:bg-amber-300 text-neutral-950 border border-amber-300 shadow-sm'
                : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-400'
            }`}
            title={
              isAr
                ? 'حالة النسخة / إدخال كود التفعيل'
                : 'Version du logiciel / Clé d’activation'
            }
          >
            {planTier === 'pro' ? (
              <>
                <Crown className="w-3.5 h-3.5 fill-current" />
                {!isCollapsed && <span>PRO VIP</span>}
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {!isCollapsed && <span>STANDARD</span>}
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
