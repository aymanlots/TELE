import React, { useState } from 'react';
import {
  LayoutGrid,
  Calculator,
  Settings,
  Wrench,
  Banknote,
  BarChart3,
  TrendingUp,
  List,
  Users,
  Truck,
  ShieldCheck,
  Sparkles,
  Lock,
  Crown,
} from 'lucide-react';
import { AppTab, PlanFeatureKey } from '../types';
import { useAccessAuth } from '../lib/accessAuth';
import { getRoleLabel } from '../lib/permissions';
import { getCurrentUserContext } from '../db';
import { useLicensePlan } from '../lib/licensePlan';
import { useI18n } from '../i18n';

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

/* 3D Gold Gear SVG */
const GoldGear3D: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 32 32" className={`${className} drop-shadow-[0_3px_6px_rgba(255,200,0,0.45)] shrink-0`}>
    <defs>
      <linearGradient id="gearGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFF6B8" />
        <stop offset="45%" stopColor="#FFD700" />
        <stop offset="100%" stopColor="#A67808" />
      </linearGradient>
    </defs>
    <path
      fill="url(#gearGold)"
      d="M13.8 3h4.4l.7 3.2c.9.3 1.7.8 2.4 1.4l3.1-1.1 2.2 3.8-2.4 2.1c.2.9.2 1.9 0 2.8l2.4 2.1-2.2 3.8-3.1-1.1c-.7.6-1.5 1.1-2.4 1.4L18.2 29h-4.4l-.7-3.2c-.9-.3-1.7-.8-2.4-1.4l-3.1 1.1-2.2-3.8 2.4-2.1c-.2-.9-.2-1.9 0-2.8L5.4 10.3l2.2-3.8 3.1 1.1c.7-.6 1.5-1.1 2.4-1.4L13.8 3zm2.2 8.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z"
    />
  </svg>
);

/* 3D Gold Box SVG */
const GoldBox3D: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 32 32" className={`${className} drop-shadow-[0_3px_6px_rgba(255,200,0,0.45)] shrink-0`}>
    <defs>
      <linearGradient id="boxTop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFF8C8" />
        <stop offset="100%" stopColor="#E6B830" />
      </linearGradient>
      <linearGradient id="boxLeft" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#E5B62E" />
        <stop offset="100%" stopColor="#9A6D08" />
      </linearGradient>
      <linearGradient id="boxRight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#C49316" />
        <stop offset="100%" stopColor="#7A5404" />
      </linearGradient>
    </defs>
    <polygon points="16,3 28,9.5 16,16 4,9.5" fill="url(#boxTop)" />
    <polygon points="4,9.5 16,16 16,29 4,22.5" fill="url(#boxLeft)" />
    <polygon points="16,16 28,9.5 28,22.5 16,29" fill="url(#boxRight)" />
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onCloseMobile,
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';
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
    leftIcon: React.ReactNode;
    rightIcon: React.ReactNode;
  }[] = [
    {
      id: 'dashboard',
      path: '/dashboard',
      label: isAr ? 'لوحة القيادة' : 'Tableau de Bord',
      leftIcon: <GoldBox3D className="w-5 h-5 opacity-85" />,
      rightIcon: <LayoutGrid className="w-4 h-4 stroke-[2.5]" />,
    },
    {
      id: 'pos',
      path: '/pos',
      label: isAr ? 'نقطة البيع (كون جديدة)' : 'Point de Vente (Caisse)',
      leftIcon: (
        <div className="w-6 h-6 rounded-md bg-gradient-to-b from-[#FFF5B8] to-[#C89618] flex items-center justify-center text-neutral-950 shadow-[0_2px_6px_rgba(255,205,45,0.4)]">
          <Calculator className="w-4 h-4 stroke-[2.5]" />
        </div>
      ),
      rightIcon: (
        <div className="w-6 h-6 rounded-md bg-gradient-to-b from-[#F5D76E] to-[#A67808] flex items-center justify-center text-neutral-950 font-mono text-[10px] font-black shadow">
          ▣
        </div>
      ),
    },
    {
      id: 'stock',
      path: '/inventory',
      label: isAr ? 'المخزون (السلعة)' : 'Gestion du Stock',
      leftIcon: <GoldBox3D className="w-5 h-5" />,
      rightIcon: <GoldBox3D className="w-5 h-5" />,
    },
    {
      id: 'spare-parts',
      path: '/spare-parts',
      label: isAr ? 'قطع الغيار' : 'Pièces Détachées',
      leftIcon: <GoldGear3D className="w-5 h-5" />,
      rightIcon: <GoldGear3D className="w-5 h-5" />,
    },
    {
      id: 'repairs',
      path: '/repair',
      label: isAr ? 'ورشة الإصلاح' : 'Atelier Réparation',
      leftIcon: <Wrench className="w-5 h-5 text-[#FFD700] drop-shadow-[0_2px_6px_rgba(255,205,45,0.5)] -scale-x-100" />,
      rightIcon: <Wrench className="w-5 h-5 text-[#FFD700] drop-shadow-[0_2px_6px_rgba(255,205,45,0.5)]" />,
    },
    {
      id: 'expenses',
      path: '/expenses',
      label: isAr ? 'المصاريف والديون' : 'Dépenses & Charges',
      leftIcon: <Banknote className="w-5 h-5 text-[#FFD700] drop-shadow-[0_2px_6px_rgba(255,205,45,0.5)] -rotate-12" />,
      rightIcon: <Banknote className="w-5 h-5 text-[#FFD700] drop-shadow-[0_2px_6px_rgba(255,205,45,0.5)] -rotate-12" />,
    },
    {
      id: 'reports',
      path: '/reports',
      label: isAr ? 'التقارير المالية' : 'Rapports Financiers',
      leftIcon: <BarChart3 className="w-5 h-5 text-[#FFD700] drop-shadow-[0_2px_6px_rgba(255,205,45,0.5)]" />,
      rightIcon: <TrendingUp className="w-5 h-5 text-[#FFD700] drop-shadow-[0_2px_6px_rgba(255,205,45,0.5)]" />,
    },
    {
      id: 'activity',
      path: '/activities',
      label: isAr ? 'سجل الأنشطة' : "Journal d'Activité",
      leftIcon: <GoldGear3D className="w-5 h-5" />,
      rightIcon: <Sparkles className="w-5 h-5 text-[#FFD700] drop-shadow-[0_2px_6px_rgba(255,205,45,0.5)]" />,
    },
    {
      id: 'bons',
      path: '/orders',
      label: isAr ? 'سجل الطلبات والمبيعات' : 'Historique des Bons',
      leftIcon: <span className="w-5 h-5" />,
      rightIcon: <List className="w-5 h-5 text-[#FFD700] drop-shadow-[0_2px_6px_rgba(255,205,45,0.5)]" />,
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
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* RIGHT SIDEBAR (280px fixed, Apple Liquid Glass Dark & Gold) */}
      <aside
        dir="ltr"
        className={`fixed md:sticky top-4 end-3 z-40 w-[280px] shrink-0 bg-black/65 backdrop-blur-xl border border-yellow-500/25 rounded-[20px] p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,235,160,0.2)] flex flex-col justify-between transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : 'translate-x-[110%] md:translate-x-0'
        }`}
      >
        <div>
          {/* Top Header inside Sidebar */}
          <div className="flex items-center justify-between gap-2 pb-3 mb-2 border-b border-white/10 px-1">
            {canAccess('settings') ? (
              <a
                href="/settings"
                onClick={(e) => {
                  e.preventDefault();
                  onSelectTab('settings');
                  onCloseMobile();
                }}
                className="p-1 rounded-xl hover:bg-white/10 transition cursor-pointer"
                title={isAr ? 'الإعدادات' : 'Paramètres'}
              >
                <GoldGear3D className="w-7 h-7" />
              </a>
            ) : (
              <button
                type="button"
                onClick={lock}
                className="p-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition cursor-pointer"
                title={isAr ? 'تغيير المستخدم / قفل' : 'Changer de compte / Verrouiller'}
              >
                <Lock className="w-4 h-4" />
              </button>
            )}

            <div
              onClick={handleLogoMultiClick}
              className="flex items-center gap-2.5 select-none"
            >
              <div className="text-right leading-tight">
                <div className="text-sm font-extrabold text-white truncate max-w-[140px]">
                  {userCtx.name || (isAr ? 'المدخل الذهبي' : 'Golden Shop')}
                </div>
                <div className="text-[11px] font-bold text-[#FFD700]">
                  {getRoleLabel(userRole, language)}
                </div>
              </div>

              <div className="px-2 py-1 rounded-lg bg-gradient-to-b from-[#FFF099] via-[#F5D04C] to-[#C89618] text-neutral-950 font-black text-xs font-mono shadow-[0_2px_10px_rgba(245,208,76,0.45)] border border-yellow-100">
                30
              </div>
            </div>
          </div>

          {/* Primary Navigation Links */}
          <nav className="divide-y divide-white/10">
            {primaryMenuItems.map((item) => {
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
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] transition-all cursor-pointer no-underline ${
                    isActive
                      ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black rounded-xl shadow-[0_6px_20px_rgba(245,208,76,0.45),inset_0_1px_1px_rgba(255,255,255,0.85)] border border-yellow-100 my-1'
                      : 'text-white/85 hover:text-white hover:bg-white/10 font-bold rounded-xl'
                  }`}
                >
                  {/* Left 3D Gold Icon */}
                  <div className="shrink-0 flex items-center justify-center">
                    {item.leftIcon}
                  </div>

                  {/* Right-Aligned Label + Locked Badge + Right 3D Gold Icon */}
                  <div className="flex items-center justify-end gap-2 min-w-0 flex-1">
                    {isLocked && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 text-[9px] font-black font-mono border border-amber-500/40">
                        PRO 🔒
                      </span>
                    )}
                    <span className="truncate text-right">{item.label}</span>
                    <div className="shrink-0 flex items-center justify-center">
                      {item.rightIcon}
                    </div>
                  </div>
                </a>
              );
            })}
          </nav>

          {/* Secondary Utility Links (Customers, Suppliers, Warranty, Settings) */}
          {secondaryItems.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 pt-2.5 mt-2 border-t border-white/10" dir="rtl">
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
                    className={`flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-[10px] font-bold transition cursor-pointer no-underline ${
                      isActive
                        ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black shadow'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    title={sec.label}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : 'text-[#FFD700]'}`} />
                    <span className="truncate max-w-full">{sec.label}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Plan Pill Button + Quick Lock / Switch User */}
        <div className="pt-3 mt-2 border-t border-white/10 flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={lock}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-amber-300 border border-yellow-500/30 text-[10px] font-bold transition cursor-pointer"
            title={isAr ? 'قفل الشاشة أو تغيير المستخدم' : 'Verrouiller ou changer de compte'}
          >
            <Lock className="w-3 h-3" />
            <span>{isAr ? 'تبديل الحساب' : 'Changer compte'}</span>
          </button>

          <button
            type="button"
            onClick={() => openUpgradeModal('repairs')}
            className={`px-3.5 py-1.5 rounded-full font-black text-xs tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow ${
              planTier === 'pro'
                ? 'bg-gradient-to-b from-[#FFF2A6] via-[#E5B83B] to-[#AD7D10] text-black border border-yellow-100 hover:scale-105 shadow-[0_4px_16px_rgba(245,208,76,0.45)]'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border border-blue-400 hover:scale-105 shadow-[0_4px_16px_rgba(59,130,246,0.4)]'
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
                <span>PRO VIP</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>STANDARD</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
