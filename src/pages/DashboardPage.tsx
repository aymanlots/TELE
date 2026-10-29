import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle } from 'lucide-react';
import { db, getNetTotal } from '../db';
import { CashClosureModal } from '../components/CashClosureModal';
import { Modal } from '../components/Modal';
import { formatMAD } from '../lib/currency';
import { AppTab, Product } from '../types';
import { getMoroccoDateString, getMoroccoYearMonth } from '../lib/dateUtils';
import { useI18n } from '../i18n';

interface DashboardPageProps {
  onNavigate: (tab: AppTab, params?: any) => void;
}

/* ========================================================
   3D SCULPTED GOLD ILLUSTRATIONS (EXACT MATCH TO REFERENCE)
   ======================================================== */

/** Card 1: 3D Gold Stack of Cash Bills + Gold Coin */
const GoldMoneyStack3D: React.FC = () => (
  <svg
    viewBox="0 0 140 105"
    className="w-28 h-22 sm:w-32 sm:h-24 overflow-visible drop-shadow-[0_14px_18px_rgba(0,0,0,0.65)]"
  >
    <defs>
      <linearGradient id="billTop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFF9D2" />
        <stop offset="45%" stopColor="#F5D061" />
        <stop offset="100%" stopColor="#C4921C" />
      </linearGradient>
      <linearGradient id="billSideLeft" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#D6A328" />
        <stop offset="100%" stopColor="#7C5605" />
      </linearGradient>
      <linearGradient id="billSideRight" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#B88412" />
        <stop offset="100%" stopColor="#684603" />
      </linearGradient>
      <linearGradient id="coinFace" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFBE0" />
        <stop offset="40%" stopColor="#F8D866" />
        <stop offset="85%" stopColor="#C89316" />
        <stop offset="100%" stopColor="#8F6306" />
      </linearGradient>
    </defs>

    {/* Bottom Stack Layer */}
    <polygon points="18,52 54,74 114,42 78,20" fill="url(#billTop)" />
    <polygon points="18,52 54,74 54,88 18,66" fill="url(#billSideLeft)" />
    <polygon points="54,74 114,42 114,56 54,88" fill="url(#billSideRight)" />

    {/* Middle Stack Layer */}
    <polygon points="18,43 54,65 114,33 78,11" fill="url(#billTop)" stroke="#FFF5C0" strokeWidth="0.6" />
    <polygon points="18,43 54,65 54,74 18,52" fill="url(#billSideLeft)" stroke="#9B6E0C" strokeWidth="0.5" />
    <polygon points="54,65 114,33 114,42 54,74" fill="url(#billSideRight)" stroke="#855C08" strokeWidth="0.5" />

    {/* Top Banknote Face */}
    <polygon
      points="18,34 54,56 114,24 78,2"
      fill="url(#billTop)"
      stroke="#FFF9D6"
      strokeWidth="1"
    />
    <polygon points="18,34 54,56 54,65 18,43" fill="url(#billSideLeft)" />
    <polygon points="54,56 114,24 114,33 54,65" fill="url(#billSideRight)" />

    {/* Inner Decorative Border & Band on Top Bill */}
    <polygon
      points="25,34 54,51.5 107,23.5 78,6"
      fill="none"
      stroke="#9E700A"
      strokeWidth="1"
      strokeOpacity="0.65"
    />
    <polygon
      points="46,18 82,40 90,35.5 54,13.5"
      fill="#C8961E"
      fillOpacity="0.45"
    />
    <ellipse
      cx="66"
      cy="29"
      rx="11"
      ry="6.5"
      transform="rotate(-28 66 29)"
      fill="#B38010"
      fillOpacity="0.55"
      stroke="#FFF6C4"
      strokeWidth="0.8"
    />

    {/* 3D Gold Coin in Front Right */}
    <ellipse cx="93" cy="69" rx="20" ry="20" fill="#7D5605" />
    <circle
      cx="90"
      cy="67"
      r="19.5"
      fill="url(#coinFace)"
      stroke="#FFF8D2"
      strokeWidth="1.2"
    />
    <circle
      cx="90"
      cy="67"
      r="15"
      fill="none"
      stroke="#A8760A"
      strokeWidth="1"
      strokeDasharray="3 2"
    />
    <text
      x="90"
      y="74"
      textAnchor="middle"
      fill="#8C5E05"
      fontSize="21"
      fontWeight="900"
      fontFamily="sans-serif"
    >
      $
    </text>
  </svg>
);

/** Card 2: 3D Gold Trending Up Chart with Bars + Arrow */
const GoldTrendChart3D: React.FC = () => (
  <svg
    viewBox="0 0 140 105"
    className="w-28 h-22 sm:w-32 sm:h-24 overflow-visible drop-shadow-[0_14px_18px_rgba(0,0,0,0.65)]"
  >
    <defs>
      <linearGradient id="chartGoldFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFF7C4" />
        <stop offset="50%" stopColor="#ECC146" />
        <stop offset="100%" stopColor="#9E700C" />
      </linearGradient>
      <linearGradient id="chartGoldSide" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#B88714" />
        <stop offset="100%" stopColor="#694803" />
      </linearGradient>
      <linearGradient id="arrowGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFBE0" />
        <stop offset="45%" stopColor="#F6D358" />
        <stop offset="100%" stopColor="#B88612" />
      </linearGradient>
    </defs>

    {/* 3D Bar 1 (Left) */}
    <rect x="28" y="64" width="16" height="22" rx="2" fill="url(#chartGoldFront)" />
    <polygon points="44,64 50,59 50,81 44,86" fill="url(#chartGoldSide)" />

    {/* 3D Bar 2 (Middle) */}
    <rect x="56" y="48" width="16" height="38" rx="2" fill="url(#chartGoldFront)" />
    <polygon points="72,48 78,43 78,81 72,86" fill="url(#chartGoldSide)" />

    {/* 3D Bar 3 (Right) */}
    <rect x="84" y="34" width="16" height="52" rx="2" fill="url(#chartGoldFront)" />
    <polygon points="100,34 106,29 106,81 100,86" fill="url(#chartGoldSide)" />

    {/* Base Platform Line */}
    <rect x="20" y="85" width="90" height="4" rx="2" fill="url(#chartGoldFront)" />

    {/* 3D Extruded Upward Zigzag Arrow Shadow */}
    <path
      d="M23 64 L54 34 L73 51 L104 16"
      fill="none"
      stroke="#6B4903"
      strokeWidth="10"
      strokeLinecap="round"
      strokeLinejoin="round"
      transform="translate(3, 4)"
    />
    {/* 3D Extruded Upward Zigzag Arrow Main */}
    <path
      d="M23 64 L54 34 L73 51 L104 16"
      fill="none"
      stroke="url(#arrowGold)"
      strokeWidth="9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Arrow Head */}
    <polygon
      points="114,7 89,11 109,31"
      fill="url(#arrowGold)"
      stroke="#FFF9D6"
      strokeWidth="1"
      strokeLinejoin="round"
    />
  </svg>
);

/** Card 3: 3D Gold Closed Inventory Box */
const GoldInventoryBox3D: React.FC = () => (
  <svg
    viewBox="0 0 140 105"
    className="w-28 h-22 sm:w-32 sm:h-24 overflow-visible drop-shadow-[0_14px_18px_rgba(0,0,0,0.65)]"
  >
    <defs>
      <linearGradient id="pkgTop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFAD6" />
        <stop offset="55%" stopColor="#F2C94C" />
        <stop offset="100%" stopColor="#C4921A" />
      </linearGradient>
      <linearGradient id="pkgLeft" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#E5B73B" />
        <stop offset="100%" stopColor="#94680A" />
      </linearGradient>
      <linearGradient id="pkgRight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#C6941B" />
        <stop offset="100%" stopColor="#724E04" />
      </linearGradient>
    </defs>

    {/* Top Diamond Face */}
    <polygon
      points="70,8 122,28 70,48 18,28"
      fill="url(#pkgTop)"
      stroke="#FFF7C8"
      strokeWidth="1"
    />
    {/* Left Face */}
    <polygon
      points="18,28 70,48 70,94 18,72"
      fill="url(#pkgLeft)"
      stroke="#E6B93D"
      strokeWidth="0.8"
    />
    {/* Right Face */}
    <polygon
      points="70,48 122,28 122,72 70,94"
      fill="url(#pkgRight)"
      stroke="#B38312"
      strokeWidth="0.8"
    />

    {/* Top Overhanging Lid Rim */}
    <polygon points="15,28 70,49 70,55 15,34" fill="#D4A227" stroke="#FFF3B8" strokeWidth="0.6" />
    <polygon points="70,49 125,28 125,34 70,55" fill="#9E710B" stroke="#E5B73B" strokeWidth="0.6" />

    {/* Center Packing Tape Strip Across Top & Down Side */}
    <polygon points="42,18 96,38 103,35 49,15" fill="#FFF7C8" fillOpacity="0.65" />
    <polygon points="94,39 102,36 102,54 94,57" fill="#FFF7C8" fillOpacity="0.45" />

    {/* Side Metallic Badge on Right Face */}
    <polygon points="88,63 104,56 104,65 88,72" fill="#5E3F02" opacity="0.7" />
  </svg>
);

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { language } = useI18n();
  const isAr = language === 'ar';

  const [showCashClosureModal, setShowCashClosureModal] = useState(false);
  const [showLowStockModal, setShowLowStockModal] = useState(false);

  // Live queries from Dexie
  const products =
    useLiveQuery(async () => {
      const list = await db.products.toArray();
      return list
        .filter((p) => !p.deleted_at)
        .map(({ image, ...rest }) => rest as Product);
    }, []) || [];
  const sales = useLiveQuery(() => db.sales.orderBy('id').reverse().toArray(), []) || [];
  const repairs = useLiveQuery(() => db.repairs.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) || [];

  const spareParts = useLiveQuery(() => db.spareParts.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];

  const todayStr = getMoroccoDateString();
  const currentMonthKey = getMoroccoYearMonth();
  const activeSales = useMemo(() => sales.filter((s) => !s.deleted_at), [sales]);
  const activeRepairs = useMemo(() => repairs.filter((r) => !r.deleted_at), [repairs]);
  const activeSpareParts = useMemo(() => spareParts.filter((p) => !p.deleted_at), [spareParts]);
  const activeCustomers = useMemo(() => customers.filter((c) => !c.deleted_at), [customers]);

  // 1. Total stock value & retail value
  const totalStockValue = useMemo(() => {
    return products.reduce((acc, p) => acc + (p.purchasePrice || 0) * (p.quantity || 0), 0);
  }, [products]);

  const totalRetailStockValue = useMemo(() => {
    return products.reduce((acc, p) => acc + (p.retailPrice || 0) * (p.quantity || 0), 0);
  }, [products]);

  // 2. Today's orders & revenue
  const todaySalesList = useMemo(() => {
    return activeSales.filter((s) => s.date === todayStr && s.status !== 'returned');
  }, [activeSales, todayStr]);

  const ordersTodayCount = todaySalesList.length;

  const todayRevenue = useMemo(() => {
    return todaySalesList.reduce((sum, s) => sum + getNetTotal(s), 0);
  }, [todaySalesList]);

  // 3. Today's & Month's Net Profit
  const netProfitValue = useMemo(() => {
    let todayRev = 0;
    let todayCogs = 0;
    for (const s of todaySalesList) {
      if (s.saleKind !== 'repair_deposit' && s.saleKind !== 'repair_delivery' && !s.bonNumber?.startsWith('REP-')) {
        todayRev += getNetTotal(s);
        todayCogs += (s.items || []).reduce(
          (sum, it) => sum + (Number(it.costPrice) || 0) * (Number(it.quantity) || 1),
          0
        );
      }
    }
    const todayMargin = todayRev - todayCogs;
    if (todaySalesList.length > 0) {
      return Math.round(todayMargin * 100) / 100;
    }

    const productOnlySales = activeSales.filter(
      (s) =>
        (s.status === 'active' || s.status === 'returned' || s.status === 'partially_returned') &&
        s.saleKind !== 'repair_deposit' &&
        s.saleKind !== 'repair_delivery' &&
        !s.bonNumber?.startsWith('REP-')
    );

    let productRev = 0;
    let cogs = 0;

    for (const s of productOnlySales) {
      if (s.date.startsWith(currentMonthKey)) {
        productRev += s.originalTotalAmount ?? s.totalAmount ?? 0;
        cogs += (s.items || []).reduce(
          (sum, it) => sum + (Number(it.costPrice) || 0) * (Number(it.quantity) || 1),
          0
        );
      }
      if (Array.isArray(s.returns)) {
        for (const ret of s.returns) {
          if (ret.date.startsWith(currentMonthKey)) {
            const itemRef = s.items?.[ret.itemIndex];
            const retCost =
              ret.costAmount !== undefined
                ? Number(ret.costAmount)
                : (Number(itemRef?.costPrice) || 0) * (Number(itemRef?.quantity) || 1);
            productRev -= Number(ret.amount) || 0;
            cogs -= retCost;
          }
        }
      }
    }

    const salesMargin = productRev - cogs;
    const deliveredMonth = activeRepairs.filter((r) => {
      if (r.status !== 'delivered') return false;
      const rDate = r.actualDeliveryDate || r.intakeDate;
      return rDate.startsWith(currentMonthKey);
    });
    const repairsProfit = deliveredMonth.reduce(
      (acc, r) =>
        acc + (r.netProfit !== undefined ? r.netProfit : r.agreedPrice - (r.totalPartsCost || 0)),
      0
    );
    const mExpenses = expenses
      .filter((e) => !e.deleted_at && e.date.startsWith(currentMonthKey))
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    return Math.round((salesMargin + repairsProfit - mExpenses) * 100) / 100;
  }, [todaySalesList, activeSales, activeRepairs, expenses, currentMonthKey]);

  // 4. Inventory & Spare Parts counts
  const inventoryCount = products.length;
  const totalUnitsInStock = useMemo(() => {
    return products.reduce((sum, p) => sum + (p.quantity || 0), 0);
  }, [products]);

  const sparePartsUnits = useMemo(() => {
    return activeSpareParts.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
  }, [activeSpareParts]);

  const sparePartsTotalValue = useMemo(() => {
    return activeSpareParts.reduce(
      (sum, p) => sum + (Number(p.purchasePrice) || Number(p.sellingPrice) || 0) * (Number(p.quantity) || 0),
      0
    );
  }, [activeSpareParts]);

  const lowStockProducts = useMemo(() => {
    return products.filter((p) => (p.quantity || 0) <= (p.minAlertQty ?? 5));
  }, [products]);

  const inStockPercentage = useMemo(() => {
    if (products.length === 0) return 0;
    const inStock = products.filter((p) => (p.quantity || 0) > (p.minAlertQty ?? 5)).length;
    return Math.round((inStock / products.length) * 100);
  }, [products]);

  const formatDec = (val: number) => {
    const num = Number(val) || 0;
    return num.toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const [chartViewMode, setChartViewMode] = useState<'sections' | 'days'>('sections');

  // Derived display metrics from already-loaded Dexie data (read-only UI presentation)
  const allTimeSalesTotal = useMemo(
    () =>
      activeSales
        .filter((s) => s.status !== 'returned')
        .reduce((sum, s) => sum + getNetTotal(s), 0),
    [activeSales]
  );

  const totalRemainingCredit = useMemo(() => {
    const fromSales = activeSales
      .filter((s) => s.status !== 'returned')
      .reduce((sum, s) => sum + (Number(s.remainingAmount) || 0), 0);
    const fromCustomers = activeCustomers.reduce(
      (sum, c) => sum + (Number(c.totalCredit) || 0),
      0
    );
    return Math.max(fromSales, fromCustomers);
  }, [activeSales, activeCustomers]);

  const repairsRevenueTotal = useMemo(
    () =>
      activeRepairs.reduce(
        (sum, r) => sum + (Number(r.agreedPrice) || 0),
        0
      ),
    [activeRepairs]
  );

  const totalExpensesAmount = useMemo(
    () =>
      expenses
        .filter((e) => !e.deleted_at)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [expenses]
  );

  // Mode 1: Real Project Sections (بدون صافي الأرباح — كل قسم يبدأ من 0 ويرتفع فقط عند إضافة بيانات فيه)
  const projectSectionsBars = useMemo(() => {
    const rawItems = [
      {
        label: isAr ? 'نقطة البيع POS' : 'Caisse POS',
        subLabel: isAr ? `${ordersTodayCount} طلب اليوم` : `${ordersTodayCount} bons aujourd'hui`,
        valueStr: `DH ${formatDec(todayRevenue)}`,
        rawVal: Math.max(0, todayRevenue),
        accent: 'gold' as const,
        onClick: () => onNavigate('pos'),
      },
      {
        label: isAr ? 'المخزون والسلعة' : 'Stock & Articles',
        subLabel: isAr
          ? `${inventoryCount} صنف (${totalUnitsInStock} قطعة)`
          : `${inventoryCount} réf (${totalUnitsInStock} pcs)`,
        valueStr: `DH ${formatDec(totalStockValue)}`,
        rawVal: Math.max(0, totalStockValue),
        accent: 'gold' as const,
        onClick: () => onNavigate('stock'),
      },
      {
        label: isAr ? 'القيمة البيعية' : 'Valeur Vente',
        subLabel: isAr ? 'متوقع المبيعات' : 'Ventes estimées',
        valueStr: `DH ${formatDec(totalRetailStockValue)}`,
        rawVal: Math.max(0, totalRetailStockValue),
        accent: 'gold' as const,
        onClick: () => onNavigate('stock'),
      },
      {
        label: isAr ? 'ورشة الإصلاح' : 'Atelier Réparation',
        subLabel: isAr
          ? `${activeRepairs.length} جهاز بالورشة`
          : `${activeRepairs.length} en atelier`,
        valueStr: `DH ${formatDec(repairsRevenueTotal)}`,
        rawVal: Math.max(0, repairsRevenueTotal),
        accent: 'gold' as const,
        onClick: () => onNavigate('repairs'),
      },
      {
        label: isAr ? 'قطع الغيار' : 'Pièces Détachées',
        subLabel: isAr
          ? `${activeSpareParts.length} صنف (${sparePartsUnits} قطعة)`
          : `${activeSpareParts.length} réf (${sparePartsUnits} pcs)`,
        valueStr:
          sparePartsTotalValue > 0
            ? `DH ${formatDec(sparePartsTotalValue)}`
            : isAr
            ? `${sparePartsUnits} قطعة`
            : `${sparePartsUnits} pcs`,
        rawVal: Math.max(0, sparePartsTotalValue > 0 ? sparePartsTotalValue : sparePartsUnits),
        accent: 'gold' as const,
        onClick: () => onNavigate('spare-parts'),
      },
      {
        label: isAr ? 'سجل الطلبات' : 'Historique Bons',
        subLabel: isAr
          ? `${activeSales.length} فاتورة مسجلة`
          : `${activeSales.length} bons enregistrés`,
        valueStr: `DH ${formatDec(allTimeSalesTotal)}`,
        rawVal: Math.max(0, allTimeSalesTotal),
        accent: 'gold' as const,
        onClick: () => onNavigate('bons'),
      },
      {
        label: isAr ? 'الديون والكريدي' : 'Crédits Clients',
        subLabel: isAr ? 'باقي الأداءات' : 'Reste à encaisser',
        valueStr: `DH ${formatDec(totalRemainingCredit)}`,
        rawVal: Math.max(0, totalRemainingCredit),
        accent: 'gold' as const,
        onClick: () => onNavigate('customers'),
      },
      {
        label: isAr ? 'المصاريف' : 'Dépenses',
        subLabel: isAr
          ? `${expenses.filter((e) => !e.deleted_at).length} عملية صرف`
          : `${expenses.filter((e) => !e.deleted_at).length} charges`,
        valueStr: `DH ${formatDec(totalExpensesAmount)}`,
        rawVal: Math.max(0, totalExpensesAmount),
        accent: 'gold' as const,
        onClick: () => onNavigate('expenses'),
      },
    ];

    const maxRaw = Math.max(...rawItems.map((i) => i.rawVal), 0);
    return rawItems.map((item) => {
      const isHero = maxRaw > 0 && item.rawVal === maxRaw;
      if (maxRaw > 0 && item.rawVal > 0) {
        const scaled = Math.round(28 + (item.rawVal / maxRaw) * 186);
        return { ...item, isHero, heightPx: Math.min(214, Math.max(28, scaled)) };
      }
      // When value is 0, heightPx is strictly 0 (flat on baseline)
      return { ...item, isHero: false, heightPx: 0 };
    });
  }, [
    isAr,
    ordersTodayCount,
    todayRevenue,
    inventoryCount,
    totalUnitsInStock,
    totalStockValue,
    totalRetailStockValue,
    activeRepairs.length,
    repairsRevenueTotal,
    activeSpareParts.length,
    sparePartsUnits,
    sparePartsTotalValue,
    activeSales.length,
    allTimeSalesTotal,
    totalRemainingCredit,
    expenses,
    totalExpensesAmount,
    onNavigate,
  ]);

  // Mode 2: Real Last 7 Days Sales Curve (منحنى الأداء المالي لآخر 7 أيام — 0 عندما لا توجد مبيعات)
  const sevenDaysBars = useMemo(() => {
    const dayNames = isAr
      ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
      : ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const daysList: {
      label: string;
      subLabel: string;
      valueStr: string;
      rawVal: number;
      accent: 'gold' | 'green';
      onClick: () => void;
    }[] = [];

    const baseDate = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      const dStr = getMoroccoDateString(d);
      const dayName = i === 0 ? (isAr ? 'اليوم' : "Aujourd'hui") : dayNames[d.getDay()];
      const shortDate = dStr.slice(5).replace('-', '/');

      const daySales = activeSales.filter(
        (s) => s.date === dStr && s.status !== 'returned'
      );
      const dayRev = Math.max(
        0,
        daySales.reduce((sum, s) => sum + getNetTotal(s), 0)
      );

      daysList.push({
        label: dayName,
        subLabel: isAr
          ? `${shortDate} • ${daySales.length} طلب`
          : `${shortDate} • ${daySales.length} bon(s)`,
        valueStr: `DH ${formatDec(dayRev)}`,
        rawVal: dayRev,
        accent: i === 0 ? 'green' : 'gold',
        onClick: () => onNavigate('bons'),
      });
    }

    const maxDayRev = Math.max(...daysList.map((d) => d.rawVal), 0);
    return daysList.map((item) => {
      const isHero = maxDayRev > 0 && item.rawVal === maxDayRev;
      if (maxDayRev > 0 && item.rawVal > 0) {
        const scaled = Math.round(28 + (item.rawVal / maxDayRev) * 186);
        return { ...item, isHero, heightPx: Math.min(214, Math.max(28, scaled)) };
      }
      return { ...item, isHero: false, heightPx: 0 };
    });
  }, [isAr, activeSales, onNavigate]);

  const chartBars = chartViewMode === 'sections' ? projectSectionsBars : sevenDaysBars;

  // Build smooth SVG cubic-bezier curve path across all bars (يكون في 0 عندما تكون القيم 0 ويرتفع فقط مع القيم الحقيقية)
  const svgCurveData = useMemo(() => {
    const count = chartBars.length;
    if (count === 0)
      return {
        linePath: '',
        areaPath: '',
        points: [] as { x: number; y: number; isHero: boolean; isZero: boolean }[],
      };

    const svgWidth = 900;
    const baselineY = 228;

    const points = chartBars.map((bar, idx) => {
      const x = Math.round(((idx + 0.5) / count) * svgWidth);
      const isZero = bar.heightPx <= 0 || bar.rawVal <= 0;
      const y = isZero
        ? baselineY
        : Math.max(20, Math.min(baselineY - 12, baselineY - bar.heightPx + 8));
      return { x, y, isHero: bar.isHero, isZero };
    });

    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const ctrlX1 = Math.round(curr.x + (next.x - curr.x) * 0.45);
      const ctrlY1 = curr.y;
      const ctrlX2 = Math.round(curr.x + (next.x - curr.x) * 0.55);
      const ctrlY2 = next.y;
      linePath += ` C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${next.x} ${next.y}`;
    }

    const hasPositive = points.some((p) => !p.isZero);
    const areaPath = hasPositive
      ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
      : '';
    return { linePath, areaPath, points };
  }, [chartBars]);

  const latestSale = activeSales[0];

  return (
    <div className="w-full space-y-4">
      {/* ========================================================
          ROW 1: 3 TOP KPI CARDS (Centered content, unified rounded-2xl p-5, translucent frosted glass)
          ======================================================== */}
      <div dir="ltr" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CARD 1 (LEFT): مبيعات وطلبات اليوم */}
        <div
          onClick={() => onNavigate('bons')}
          className="bg-black/35 hover:bg-black/45 backdrop-blur-md border border-amber-500/30 hover:border-amber-400/50 rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.12)] transition-all duration-200 flex flex-col items-center justify-center gap-3 text-center cursor-pointer relative overflow-hidden min-h-[210px]"
        >
          <h2 className="relative z-10 text-base sm:text-lg font-extrabold text-white tracking-tight drop-shadow">
            {isAr ? 'مبيعات وطلبات اليوم' : "Ventes & Commandes d'Aujourd'hui"}
          </h2>

          <div className="relative z-10 flex items-center justify-center">
            <GoldMoneyStack3D />
          </div>

          <div className="relative z-10 space-y-0.5">
            <div className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow">
              <span className="text-white">DH </span>
              <span className="text-amber-400">{formatDec(todayRevenue)}</span>
            </div>
            <div className="text-xs font-bold text-neutral-200 drop-shadow" dir={isAr ? 'rtl' : 'ltr'}>
              {isAr
                ? `عدد الطلبات اليوم: ${ordersTodayCount}`
                : `Nombre de commandes : ${ordersTodayCount}`}
            </div>
          </div>
        </div>

        {/* CARD 2 (CENTER): صافي الأرباح اليوم */}
        <div
          onClick={() => onNavigate('reports')}
          className="bg-black/35 hover:bg-black/45 backdrop-blur-md border border-amber-500/30 hover:border-amber-400/50 rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.12)] transition-all duration-200 flex flex-col items-center justify-center gap-3 text-center cursor-pointer relative overflow-hidden min-h-[210px]"
        >
          <h2 className="relative z-10 text-base sm:text-lg font-extrabold text-white tracking-tight drop-shadow">
            {isAr ? 'صافي الأرباح اليوم' : "Bénéfice Net d'Aujourd'hui"}
          </h2>

          <div className="relative z-10 flex items-center justify-center">
            <GoldTrendChart3D />
          </div>

          <div className="relative z-10 space-y-0.5">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-400 drop-shadow">
              DH {formatDec(netProfitValue)}
            </div>
            <div className="text-xs font-bold text-emerald-400/90 drop-shadow" dir={isAr ? 'rtl' : 'ltr'}>
              {isAr ? `رقم المعاملات: ${ordersTodayCount}` : `Transactions : ${ordersTodayCount}`}
            </div>
          </div>
        </div>

        {/* CARD 3 (RIGHT): قيمة المخزون الجماعية */}
        <div
          onClick={() => onNavigate('stock')}
          className="bg-black/35 hover:bg-black/45 backdrop-blur-md border border-amber-500/30 hover:border-amber-400/50 rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.12)] transition-all duration-200 flex flex-col items-center justify-center gap-3 text-center cursor-pointer relative overflow-hidden min-h-[210px]"
        >
          <h2 className="relative z-10 text-base sm:text-lg font-extrabold text-white tracking-tight drop-shadow">
            {isAr ? 'قيمة المخزون الجماعية' : 'Valeur Globale du Stock'}
          </h2>

          <div className="relative z-10 flex items-center justify-center">
            <GoldInventoryBox3D />
          </div>

          <div className="relative z-10 space-y-0.5">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-white drop-shadow">
              DH {formatDec(totalStockValue)}
            </div>
            <div className="text-xs font-bold text-neutral-200 drop-shadow">
              {inStockPercentage}% • {inventoryCount}-{totalUnitsInStock}{' '}
              {isAr ? 'قطعة SKU' : 'unités SKU'}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          ROW 2: BIG 3D CHART & CURVE CARD BOTTOM (مبيان ومنحنى المشروع)
          ======================================================== */}
      <div
        dir="ltr"
        className="bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.12)] relative overflow-hidden min-h-[350px] flex flex-col justify-between"
      >
        {/* Top Bar: Left Mode Switcher Pills + Right Title & Retail Valuation */}
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
          {/* Left Switcher: Toggle between Project Sections & Last 7 Days Curve */}
          <div
            dir={isAr ? 'rtl' : 'ltr'}
            className="inline-flex items-center gap-1.5 bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-xl p-1"
          >
            <button
              type="button"
              onClick={() => setChartViewMode('sections')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                chartViewMode === 'sections'
                  ? 'bg-amber-400 text-neutral-950'
                  : 'text-white/90 hover:text-white hover:bg-white/10'
              }`}
            >
              {isAr ? 'مبيان ومنحنى أقسام المشروع' : 'Graphique des Rubriques'}
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode('days')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                chartViewMode === 'days'
                  ? 'bg-amber-400 text-neutral-950'
                  : 'text-white/90 hover:text-white hover:bg-white/10'
              }`}
            >
              {isAr ? 'منحنى الأداء (آخر 7 أيام)' : 'Performance (7 derniers jours)'}
            </button>
          </div>

          {/* Right Title & Subtitle */}
          <div className="flex flex-col items-end text-right ms-auto">
            <h2
              dir={isAr ? 'rtl' : 'ltr'}
              className="text-lg sm:text-xl font-extrabold text-amber-400 tracking-tight drop-shadow"
            >
              {chartViewMode === 'sections'
                ? isAr
                  ? 'المبيان والمنحنى المالي لأقسام المتجر (3D)'
                  : 'Graphique & Courbe Financière de la Boutique (3D)'
                : isAr
                ? 'منحنى الأداء المالي والمبيعات (آخر 7 أيام)'
                : 'Courbe des Ventes & Performances (7 derniers jours)'}
            </h2>
            <p dir={isAr ? 'rtl' : 'ltr'} className="text-xs sm:text-sm font-bold text-white/95 mt-1 drop-shadow">
              {isAr ? 'القيمة البيعية الإجمالية للمخزون: ' : 'Valeur de vente totale du stock : '}
              <span dir="ltr" className="font-mono font-extrabold text-[#FFD700]">
                DH {formatDec(totalRetailStockValue)}
              </span>
            </p>
          </div>
        </div>

        {/* Bottom Stage: Left Standalone Net Profit & Quick Cards + Right 3D Liquid Gold Bars & Spline Curve */}
        <div className="relative z-10 flex flex-col lg:flex-row items-end justify-between gap-5 mt-5">
          {/* Left Column: Standalone Net Profit Card (صافي الأرباح بوحدها) + Latest Sales + Quick Actions */}
          <div className="w-full lg:w-[250px] shrink-0 space-y-2.5">
            {/* STANDALONE NET PROFIT CARD (صافي الأرباح مستقل بوحدو خارج المبيان) */}
            <div
              onClick={() => onNavigate('reports')}
              className="w-full bg-emerald-950/35 hover:bg-emerald-900/45 backdrop-blur-md border border-emerald-400/40 rounded-[16px] p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(74,222,128,0.25)] cursor-pointer transition"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center justify-between border-b border-emerald-400/20 pb-1.5 mb-2">
                <span className="text-sm font-extrabold text-[#4ADE80]">
                  {isAr ? 'صافي الأرباح (مستقل)' : 'Bénéfice Net'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/35">
                  {isAr ? 'خالص' : 'Net'}
                </span>
              </div>
              <div
                dir="ltr"
                className="text-xl sm:text-2xl font-black font-mono text-[#4ADE80] drop-shadow-[0_2px_10px_rgba(34,197,94,0.35)] text-right"
              >
                DH {formatDec(netProfitValue)}
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-white/85 mt-1">
                <span>
                  {isAr ? `المعاملات اليوم: ${ordersTodayCount}` : `Ventes: ${ordersTodayCount}`}
                </span>
                <span>•</span>
                <span className="text-emerald-300">
                  {isAr ? 'التقارير المالية' : 'Rapports'}
                </span>
              </div>
            </div>

            {/* Latest Sales Card: آخر الطلبات والمبيعات */}
            <div
              onClick={() => onNavigate('bons')}
              className="w-full bg-black/30 hover:bg-black/45 backdrop-blur-md border border-amber-500/30 rounded-[16px] p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.2)] cursor-pointer transition"
            >
              <div
                className="flex items-center justify-between border-b border-white/15 pb-1.5 mb-2"
                dir={isAr ? 'rtl' : 'ltr'}
              >
                <span className="text-sm font-extrabold text-[#FFD700]">
                  {isAr ? 'آخر الطلبات والمبيعات' : 'Dernières Ventes'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                  {isAr ? 'مباشر' : 'En direct'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-white/95">
                <span className="truncate">
                  {latestSale
                    ? latestSale.customerName
                    : isAr
                    ? 'لا توجد مبيعات بعد'
                    : 'Aucune vente'}
                </span>
                <span className="font-mono text-[#FFD700] ms-2">
                  {latestSale ? latestSale.bonNumber : isAr ? '0 طلب' : '0 bon'}
                </span>
              </div>
              <div
                className="flex items-center justify-between text-[11px] font-semibold text-white/85 mt-1.5"
                dir={isAr ? 'rtl' : 'ltr'}
              >
                <span>
                  {isAr ? `${ordersTodayCount} طلب اليوم` : `${ordersTodayCount} aujourd'hui`}
                </span>
                <span>•</span>
                <span className="font-mono">{latestSale ? latestSale.date : todayStr}</span>
              </div>
            </div>

            {/* Quick Store Status Pills (Cash Closure + Low Stock Alert) */}
            <div className="grid grid-cols-2 gap-2" dir={isAr ? 'rtl' : 'ltr'}>
              <button
                type="button"
                onClick={() => setShowCashClosureModal(true)}
                className="bg-black/30 hover:bg-amber-500/20 backdrop-blur-md border border-amber-500/30 rounded-xl px-2.5 py-2 text-start transition flex flex-col justify-between cursor-pointer"
              >
                <span className="text-[10px] font-bold text-white/80">
                  {isAr ? 'صندوق اليوم' : 'Caisse du jour'}
                </span>
                <span className="text-xs font-extrabold text-[#FFD700] mt-0.5">
                  {isAr ? 'إغلاق الصندوق' : 'Clôture Caisse'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowLowStockModal(true)}
                className="bg-black/30 hover:bg-amber-500/20 backdrop-blur-md border border-amber-500/30 rounded-xl px-2.5 py-2 text-start transition flex flex-col justify-between cursor-pointer"
              >
                <span className="text-[10px] font-bold text-white/80">
                  {isAr ? 'تنبيهات السلعة' : 'Alertes Stock'}
                </span>
                <span
                  className={`text-xs font-extrabold mt-0.5 ${
                    lowStockProducts.length > 0 ? 'text-amber-400' : 'text-[#22c55e]'
                  }`}
                >
                  {isAr
                    ? `${lowStockProducts.length} نواقص`
                    : `${lowStockProducts.length} alerte(s)`}
                </span>
              </button>
            </div>
          </div>

          {/* 3D Liquid Gold in Crystal Glass Bars + Smooth 3D Golden Spline Curve */}
          <div className="flex-1 w-full overflow-x-auto">
            <div className="relative min-w-[600px] pt-8 pb-1 px-2">
              {/* Horizontal Subtle Glass Grid Lines + 0 Baseline */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-4 top-6 bottom-14 flex flex-col justify-between opacity-25"
              >
                <div className="border-b border-dashed border-yellow-500/40 w-full" />
                <div className="border-b border-dashed border-yellow-500/30 w-full" />
                <div className="border-b border-dashed border-yellow-500/20 w-full" />
                <div className="border-b border-yellow-500/50 w-full" />
              </div>

              {/* 3D Glowing Smooth Curve Overlay (المنحنى الذهبي ثلاثي الأبعاد — يكون في 0 عندما تكون القيم 0) */}
              <svg
                viewBox="0 0 900 250"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-x-0 top-2 h-[245px] w-full z-20 overflow-visible"
              >
                <defs>
                  <linearGradient id="goldCurveFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.16" />
                    <stop offset="65%" stopColor="#F59E0B" stopOpacity="0.04" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="goldCurveStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#FBBF24" />
                    <stop offset="50%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#FDE68A" />
                  </linearGradient>
                </defs>

                {svgCurveData.areaPath && (
                  <path d={svgCurveData.areaPath} fill="url(#goldCurveFill)" />
                )}

                {svgCurveData.linePath && (
                  <path
                    d={svgCurveData.linePath}
                    fill="none"
                    stroke="url(#goldCurveStroke)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeOpacity={svgCurveData.points.every((p) => p.isZero) ? 0.35 : 0.95}
                  />
                )}

                {svgCurveData.points.map((pt, i) => (
                  <g key={i}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={pt.isZero ? 3.5 : pt.isHero ? 6.5 : 5}
                      fill={pt.isZero ? '#785C12' : '#FBBF24'}
                      stroke="#FFFFFF"
                      strokeOpacity={pt.isZero ? 0.5 : 0.95}
                      strokeWidth={pt.isZero ? '1.5' : '2'}
                    />
                  </g>
                ))}
              </svg>

              {/* 3D Gold Bars Row */}
              <div className="relative z-10 flex items-end justify-between gap-2 sm:gap-3 h-[265px]">
                {chartBars.map((bar, idx) => {
                  const isZero = bar.heightPx <= 0 || bar.rawVal <= 0;
                  return (
                    <div
                      key={idx}
                      onClick={bar.onClick}
                      className="flex-1 flex flex-col items-center justify-end group cursor-pointer h-full"
                    >
                      {/* Live Value Pill Above Each 3D Bar */}
                      <span
                        className={`mb-2 px-2 py-0.5 rounded-lg text-[10px] font-mono font-extrabold whitespace-nowrap border backdrop-blur-sm transition-all duration-200 ${
                          isZero
                            ? 'bg-black/40 border-white/15 text-white/75'
                            : bar.isHero
                            ? 'bg-amber-500/25 border-amber-400/50 text-amber-300'
                            : 'bg-black/45 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        {bar.valueStr}
                      </span>

                      {/* 3D Bar Container (No blinding yellow glow) */}
                      <div
                        className="w-full max-w-[48px] rounded-t-lg rounded-b-sm relative overflow-hidden transition-all duration-300"
                        style={
                          isZero
                            ? {
                                height: '4px',
                                background: 'rgba(245, 158, 11, 0.25)',
                                borderTop: '1px solid rgba(251, 191, 36, 0.45)',
                              }
                            : {
                                height: `${bar.heightPx}px`,
                                background: bar.isHero
                                  ? 'linear-gradient(180deg, #FCD34D 0%, #F59E0B 60%, #B45309 100%)'
                                  : 'linear-gradient(180deg, rgba(251,191,36,0.55) 0%, rgba(217,119,6,0.45) 65%, rgba(120,53,15,0.65) 100%)',
                                borderTop: '1.5px solid rgba(254, 243, 199, 0.85)',
                                borderLeft: '1px solid rgba(251, 191, 36, 0.45)',
                                borderRight: '1px solid rgba(180, 83, 9, 0.45)',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.55)',
                              }
                        }
                      />

                      {/* Meaningful Project Section / Day Label */}
                      <span
                        dir={isAr ? 'rtl' : 'ltr'}
                        className={`mt-2.5 text-[11px] sm:text-xs font-extrabold whitespace-nowrap transition-colors ${
                          bar.isHero
                            ? 'text-amber-400'
                            : 'text-white group-hover:text-amber-300'
                        }`}
                      >
                        {bar.label}
                      </span>

                      {/* Sub-metric Label */}
                      <span
                        dir={isAr ? 'rtl' : 'ltr'}
                        className="text-[9px] sm:text-[10px] font-semibold text-white/65 whitespace-nowrap"
                      >
                        {bar.subLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Cash Closure Modal */}
      <CashClosureModal
        isOpen={showCashClosureModal}
        onClose={() => setShowCashClosureModal(false)}
      />

      {/* Low Stock Products Modal */}
      <Modal
        isOpen={showLowStockModal}
        onClose={() => setShowLowStockModal(false)}
        title={isAr ? 'تنبيهات المخزون المنخفض' : 'Alertes de Stock Faible'}
      >
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {lowStockProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
              <AlertTriangle className="w-6 h-6 text-emerald-400" />
              <p className="text-xs text-neutral-300">
                {isAr
                  ? 'جميع المنتجات متوفرة في المخزون.'
                  : 'Tous les articles sont disponibles en stock.'}
              </p>
            </div>
          ) : (
            lowStockProducts.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setShowLowStockModal(false);
                  onNavigate('stock', { search: p.name });
                }}
                className="p-3 rounded-2xl bg-neutral-950 hover:border-amber-400/60 flex items-center justify-between cursor-pointer transition"
              >
                <div>
                  <div className="font-bold text-xs text-white">{p.name}</div>
                  <div className="text-[11px] text-amber-300 font-mono">
                    {formatMAD(p.retailPrice, language)}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono font-bold text-xs">
                  {p.quantity} {isAr ? 'متبقي' : 'restant(s)'}
                </span>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};
