import React, { useState } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Boxes,
  History,
  MoreHorizontal,
  ShieldCheck,
  Users,
  Truck,
  Settings,
  X,
  Wrench,
  Cpu,
  Wallet,
  BarChart3,
  Activity,
} from 'lucide-react';
import { AppTab } from '../types';
import { useI18n } from '../i18n';
import { useAccessAuth } from '../lib/accessAuth';

interface BottomNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  lowStockCount?: number;
  lowSparePartsCount?: number;
  openSavCount?: number;
  openRepairsCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  lowStockCount = 0,
  lowSparePartsCount = 0,
  openSavCount = 0,
  openRepairsCount = 0,
}) => {
  const { t, language } = useI18n();
  const { canAccess, isOwnerMode } = useAccessAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const mainTabs: { id: AppTab; label: string; icon: React.FC<{ className?: string }>; badge?: number }[] = isOwnerMode
    ? [
        { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
        { id: 'pos', label: t.nav.pos, icon: Receipt },
        { id: 'stock', label: t.nav.stock, icon: Boxes, badge: lowStockCount },
        { id: 'bons', label: t.nav.bons, icon: History },
      ]
    : [
        { id: 'pos', label: t.nav.pos, icon: Receipt },
        { id: 'stock', label: t.nav.stock, icon: Boxes, badge: lowStockCount },
        { id: 'repairs', label: t.nav.repairs, icon: Wrench, badge: openRepairsCount },
        { id: 'bons', label: t.nav.bons, icon: History },
      ];

  const allMoreTabs: { id: AppTab; label: string; icon: React.FC<{ className?: string }>; badge?: number }[] = [
    { id: 'spare-parts', label: t.nav.spareParts, icon: Cpu, badge: lowSparePartsCount },
    ...(isOwnerMode ? [{ id: 'repairs' as AppTab, label: t.nav.repairs, icon: Wrench, badge: openRepairsCount }] : []),
    { id: 'expenses', label: t.nav.expenses, icon: Wallet },
    { id: 'reports', label: language === 'ar' ? 'التقارير المالية' : 'Rapports', icon: BarChart3 },
    { id: 'activity', label: language === 'ar' ? 'سجل الأنشطة' : 'Journal d\'activité', icon: Activity },
    { id: 'warranty', label: t.nav.warranty, icon: ShieldCheck, badge: openSavCount },
    { id: 'customers', label: t.nav.customers, icon: Users },
    { id: 'suppliers', label: t.nav.suppliers, icon: Truck },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  const moreTabs = allMoreTabs.filter((tab) => canAccess(tab.id));

  const isMoreActive = moreTabs.some((tab) => tab.id === activeTab);

  const handleSelect = (tab: AppTab) => {
    onSelectTab(tab);
    setIsMoreOpen(false);
  };

  return (
    <>
      {/* More Menu Backdrop & Drawer */}
      {isMoreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end animate-fadeIn"
          onClick={() => setIsMoreOpen(false)}
        >
          <div
            className="bg-neutral-900 border-t border-neutral-800 rounded-t-3xl p-5 pb-8 shadow-2xl max-w-lg w-full mx-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <span className="font-extrabold text-sm text-neutral-100">
                {language === 'ar' ? 'المزيد من الأقسام' : 'Autres rubriques'}
              </span>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="p-2 rounded-xl text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {moreTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleSelect(tab.id)}
                    className={`p-4 rounded-2xl flex flex-col items-center justify-center gap-2.5 transition active:scale-95 border ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-md font-bold'
                        : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="relative">
                      <Icon className={`w-6 h-6 ${isActive ? 'text-amber-400' : 'text-neutral-400'}`} />
                      {tab.badge !== undefined && tab.badge > 0 && (
                        <span className="absolute -top-1.5 -end-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                          {tab.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-center font-medium leading-tight">
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Bottom Navigation Bar */}
      <nav
        aria-label="Navigation mobile"
        className="fixed bottom-0 inset-x-0 z-40 bg-neutral-900/95 backdrop-blur-md border-t border-neutral-800 px-2 py-1.5 shadow-2xl safe-area-inset-bottom"
      >
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelect(tab.id)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all active:scale-90 ${
                  isActive
                    ? 'text-amber-400 font-black bg-gradient-to-b from-amber-500/25 via-amber-500/10 to-transparent border border-amber-500/30 shadow-inner'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-transform ${isActive ? 'text-amber-400 scale-110 drop-shadow-[0_0_6px_rgba(212,175,55,0.5)]' : 'text-neutral-400'}`} />
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="absolute -top-1 -end-2 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold bg-rose-500 text-white flex items-center justify-center shadow-xs">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-1 truncate max-w-[62px] tracking-tight">
                  {tab.label}
                </span>
                {isActive && (
                  <span className="w-2 h-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 mt-0.5 shadow-[0_0_6px_rgba(212,175,55,0.8)]" />
                )}
              </button>
            );
          })}

          {/* More Button */}
          <button
            onClick={() => setIsMoreOpen((prev) => !prev)}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all active:scale-90 ${
              isMoreActive || isMoreOpen
                ? 'text-amber-400 font-black bg-gradient-to-b from-amber-500/25 via-amber-500/10 to-transparent border border-amber-500/30 shadow-inner'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <div className="relative">
              <MoreHorizontal className={`w-5 h-5 transition-transform ${isMoreActive || isMoreOpen ? 'text-amber-400 scale-110 drop-shadow-[0_0_6px_rgba(212,175,55,0.5)]' : 'text-neutral-400'}`} />
              {openSavCount > 0 && (
                <span className="absolute -top-1 -end-1 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(212,175,55,0.8)]" />
              )}
            </div>
            <span className="text-[10px] mt-1 tracking-tight">
              {language === 'ar' ? 'المزيد' : 'Plus'}
            </span>
            {isMoreActive && (
              <span className="w-2 h-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 mt-0.5 shadow-[0_0_6px_rgba(212,175,55,0.8)]" />
            )}
          </button>
        </div>
      </nav>
    </>
  );
};
