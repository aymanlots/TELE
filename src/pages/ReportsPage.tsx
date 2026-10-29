import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FileSpreadsheet,
  Download,
  TrendingUp,
  DollarSign,
  Package,
  Wrench,
  Wallet,
  ShieldCheck,
  Calculator,
  Activity,
  BarChart3,
} from 'lucide-react';
import { db, getNetTotal } from '../db';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { getMoroccoDateString, getMoroccoYearMonth } from '../lib/dateUtils';
import { useToast } from '../components/Toast';
import { CashClosureModal } from '../components/CashClosureModal';
import { GlassKpiCard, GoldInventoryBox3D, GoldMoneyStack3D } from '../components/GoldenGlassUI';

type ReportPeriod = 'today' | 'week' | 'month' | 'lastMonth' | 'year' | 'custom';

interface ReportsPageProps {
  initialSubTab?: 'overview' | 'closures' | 'activity';
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ initialSubTab }) => {
  const { language } = useI18n();
  const { success, error } = useToast();
  const isAr = language === 'ar';

  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [customStart, setCustomStart] = useState(getMoroccoDateString());
  const [customEnd, setCustomEnd] = useState(getMoroccoDateString());
  const [subTab, setSubTab] = useState<'overview' | 'closures' | 'activity'>(initialSubTab || 'overview');
  const [isCashClosureOpen, setIsCashClosureOpen] = useState(false);

  React.useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Live Queries
  const sales =
    useLiveQuery(async () => {
      const all = await db.sales.toArray();
      return all.filter((s) => !s.deleted_at);
    }, []) || [];
  const repairs =
    useLiveQuery(async () => {
      const all = await db.repairs.toArray();
      return all.filter((r) => !r.deleted_at);
    }, []) || [];
  const expenses =
    useLiveQuery(async () => {
      const all = await db.expenses.toArray();
      return all.filter((e) => !e.deleted_at);
    }, []) || [];
  const products =
    useLiveQuery(async () => {
      const all = await db.products.toArray();
      return all.filter((p) => !p.deleted_at).map(({ image, ...rest }) => rest);
    }, []) || [];
  const customers =
    useLiveQuery(async () => {
      const all = await db.customers.toArray();
      return all.filter((c) => !c.deleted_at);
    }, []) || [];
  const purchaseOrders =
    useLiveQuery(async () => {
      const all = await db.supplierPurchaseOrders.toArray();
      return all.filter((po) => !po.deleted_at);
    }, []) || [];
  const cashClosures =
    useLiveQuery(async () => {
      return await db.cashClosures.orderBy('date').reverse().toArray();
    }, []) || [];
  const activityLogs =
    useLiveQuery(async () => {
      return await db.activityLogs.orderBy('id').reverse().limit(200).toArray();
    }, []) || [];

  // Calculate Date Range in Morocco Timezone
  const dateRange = useMemo(() => {
    const now = new Date();
    const todayStr = getMoroccoDateString(now);
    const currentYM = getMoroccoYearMonth(now);

    if (period === 'today') return { start: todayStr, end: todayStr };
    if (period === 'week') {
      const d = new Date(now);
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      d.setDate(d.getDate() + diff);
      return { start: getMoroccoDateString(d), end: todayStr };
    }
    if (period === 'month') {
      return { start: `${currentYM}-01`, end: todayStr };
    }
    if (period === 'lastMonth') {
      const [y, m] = currentYM.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const lastDayPrev = new Date(y, m - 1, 0);
      return {
        start: getMoroccoDateString(prevDate),
        end: getMoroccoDateString(lastDayPrev),
      };
    }
    if (period === 'year') {
      return { start: `${currentYM.slice(0, 4)}-01-01`, end: todayStr };
    }
    return { start: customStart || '2000-01-01', end: customEnd || '2099-12-31' };
  }, [period, customStart, customEnd]);

  // Compute Comprehensive Financial Report (R1 & L3: returns reduce revenue & profit on the date of the return)
  const report = useMemo(() => {
    const { start, end } = dateRange;

    // L3: Exclude saleKind repair_deposit and repair_delivery and bons starting with REP-
    const allProductSales = sales.filter(
      (s) =>
        (s.status === 'active' || s.status === 'returned' || s.status === 'partially_returned') &&
        s.saleKind !== 'repair_deposit' &&
        s.saleKind !== 'repair_delivery' &&
        !s.bonNumber?.startsWith('REP-')
    );

    // Product Sales occurring in [start, end]
    const periodProductSales = allProductSales.filter(
      (s) => s.date >= start && s.date <= end
    );

    let salesRevenue = 0;
    let salesCOGS = 0;
    let salesGrossMargin = 0;
    let periodRefundedCash = 0;
    const topProductsMap = new Map<
      string,
      { name: string; qty: number; revenue: number; profit: number }
    >();
    const categoryProfitsMap = new Map<
      string,
      { category: string; qty: number; revenue: number; profit: number }
    >();

    for (const s of periodProductSales) {
      const baseTotal = s.originalTotalAmount ?? s.totalAmount ?? 0;
      salesRevenue += baseTotal;
      const rawSubtotal = (s.items || []).reduce(
        (acc, it) => acc + Number(it.price || 0) * Number(it.quantity || 1),
        0
      );
      const totalCost = (s.items || []).reduce(
        (acc, it) => acc + Number(it.costPrice || 0) * Number(it.quantity || 1),
        0
      );

      salesCOGS += totalCost;
      salesGrossMargin += baseTotal - totalCost;

      for (const it of s.items || []) {
        const itemRev = Number(it.price || 0) * Number(it.quantity || 1);
        const itemCost = Number(it.costPrice || 0) * Number(it.quantity || 1);
        const itemDisc = rawSubtotal > 0 ? ((s.discountAmount || 0) * itemRev) / rawSubtotal : 0;
        const itemProfit = itemRev - itemDisc - itemCost;
        const prev = topProductsMap.get(it.name) || {
          name: it.name,
          qty: 0,
          revenue: 0,
          profit: 0,
        };
        prev.qty += Number(it.quantity || 1);
        prev.revenue += itemRev - itemDisc;
        prev.profit += itemProfit;
        topProductsMap.set(it.name, prev);

        const catKey = it.category || 'other';
        const prevCat = categoryProfitsMap.get(catKey) || {
          category: catKey,
          qty: 0,
          revenue: 0,
          profit: 0,
        };
        prevCat.qty += Number(it.quantity || 1);
        prevCat.revenue += itemRev - itemDisc;
        prevCat.profit += itemProfit;
        categoryProfitsMap.set(catKey, prevCat);
      }
    }

    // R1 & L3: Deduct returns that occurred within [start, end] on their return date (ret.date)
    for (const s of allProductSales) {
      if (!Array.isArray(s.returns)) continue;
      for (const ret of s.returns) {
        if (ret.date >= start && ret.date <= end) {
          const itemRef = s.items?.[ret.itemIndex];
          const retAmt = Number(ret.amount) || 0;
          const retCost =
            ret.costAmount !== undefined
              ? Number(ret.costAmount)
              : (Number(itemRef?.costPrice) || 0) * (Number(itemRef?.quantity) || 1);

          salesRevenue -= retAmt;
          salesCOGS -= retCost;
          salesGrossMargin -= retAmt - retCost;
          periodRefundedCash += Number(ret.refundedCash) || 0;

          if (itemRef && topProductsMap.has(itemRef.name)) {
            const prev = topProductsMap.get(itemRef.name)!;
            prev.qty = Math.max(0, prev.qty - (Number(itemRef.quantity) || 1));
            prev.revenue -= retAmt;
            prev.profit -= retAmt - retCost;
          }
          const catKey = itemRef?.category || 'other';
          if (itemRef && categoryProfitsMap.has(catKey)) {
            const prevCat = categoryProfitsMap.get(catKey)!;
            prevCat.qty = Math.max(0, prevCat.qty - (Number(itemRef.quantity) || 1));
            prevCat.revenue -= retAmt;
            prevCat.profit -= retAmt - retCost;
          }
        }
      }
    }
    void periodRefundedCash;

    // Delivered Repairs in Period
    const periodRepairs = repairs.filter((r) => {
      const dDate = r.actualDeliveryDate || r.intakeDate;
      return dDate >= start && dDate <= end && r.status === 'delivered';
    });

    const repairsRevenue = periodRepairs.reduce((acc, r) => acc + (r.agreedPrice || 0), 0);
    const repairsPartsCost = periodRepairs.reduce((acc, r) => acc + (r.totalPartsCost || 0), 0);
    const repairsProfit = periodRepairs.reduce(
      (acc, r) =>
        acc +
        (r.netProfit !== undefined ? r.netProfit : (r.agreedPrice || 0) - (r.totalPartsCost || 0)),
      0
    );

    // Expenses in Period
    const periodExpenses = expenses.filter((e) => e.date >= start && e.date <= end);
    const totalExpenses = periodExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    // Stock Valuation
    const stockCostValue = products.reduce(
      (acc, p) => acc + (Number(p.purchasePrice) || 0) * (Number(p.quantity) || 0),
      0
    );
    const stockRetailValue = products.reduce(
      (acc, p) => acc + (Number(p.retailPrice) || 0) * (Number(p.quantity) || 0),
      0
    );

    // Purchase Orders in Period
    const periodPOs = purchaseOrders.filter((po) => po.date >= start && po.date <= end);
    const totalPurchases = periodPOs.reduce((acc, po) => acc + (po.totalAmount || 0), 0);

    const netProfit = salesGrossMargin + repairsProfit - totalExpenses;
    const topProducts = Array.from(topProductsMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    const categoryProfits = Array.from(categoryProfitsMap.values()).sort(
      (a, b) => b.profit - a.profit
    );

    return {
      periodProductSales,
      periodRepairs,
      periodExpenses,
      periodPOs,
      salesRevenue,
      salesCOGS,
      salesGrossMargin,
      repairsRevenue,
      repairsPartsCost,
      repairsProfit,
      totalExpenses,
      totalPurchases,
      netProfit,
      stockCostValue,
      stockRetailValue,
      topProducts,
      categoryProfits,
    };
  }, [sales, repairs, expenses, products, purchaseOrders, dateRange]);

  // Export Multi-Sheet Excel (.xlsx) for Accountant (Partie 3 #7)
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Sheet 1: Ventes
      const salesRows = report.periodProductSales.map((s) => ({
        Bon: s.bonNumber,
        Date: s.date,
        Client: s.customerName,
        Telephone: s.customerPhone || '',
        Articles: s.items
          .filter((i) => !i.isReturned)
          .map((i) => `${i.quantity}x ${i.name}${i.imei ? ` [${i.imei}]` : ''}`)
          .join(' | '),
        Remise_DH: s.discountAmount || 0,
        Total_Net_DH: getNetTotal(s),
        Paye_DH: s.paidAmount,
        Reste_Credit_DH: s.remainingAmount,
        Mode: s.paymentMethod || s.paymentType,
        Statut: s.status,
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(salesRows.length ? salesRows : [{ Note: 'Aucune vente' }]),
        'Ventes'
      );

      // Sheet 2: Réparations
      const repairRows = report.periodRepairs.map((r) => ({
        Dossier: r.repairNumber,
        Date_Reception: r.intakeDate,
        Date_Livraison: r.actualDeliveryDate || r.intakeDate,
        Client: r.customerName,
        Appareil: `${r.brand} ${r.model}`,
        Panne: r.issue,
        Prix_Convenu_DH: r.agreedPrice,
        Cout_Pieces_DH: r.totalPartsCost || 0,
        Benefice_Net_DH:
          r.netProfit !== undefined ? r.netProfit : r.agreedPrice - (r.totalPartsCost || 0),
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(repairRows.length ? repairRows : [{ Note: 'Aucune réparation' }]),
        'Reparations'
      );

      // Sheet 3: Dépenses
      const expenseRows = report.periodExpenses.map((e) => ({
        Date: e.date,
        Categorie: e.category,
        Intitule: e.title || '',
        Montant_DH: e.amount,
        Note: e.note || '',
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(expenseRows.length ? expenseRows : [{ Note: 'Aucune dépense' }]),
        'Depenses'
      );

      // Sheet 4: Achats Fournisseurs
      const poRows = report.periodPOs.map((po) => ({
        Bon_Achat: po.bonNumber,
        Date: po.date,
        Fournisseur: po.supplierName,
        Total_DH: po.totalAmount,
        Paye_DH: po.paidAmount,
        Reste_Dette_DH: po.remainingAmount,
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(poRows.length ? poRows : [{ Note: 'Aucun bon d’achat' }]),
        'Achats_Fournisseurs'
      );

      // Sheet 5: État du Stock
      const stockRows = products.map((p) => ({
        Designation: p.name,
        Categorie: p.category,
        Quantite: p.quantity,
        Seuil_Alerte: p.minAlertQty ?? 5,
        Prix_Achat_DH: p.purchasePrice,
        Prix_Vente_Detail_DH: p.retailPrice,
        Prix_Vente_Gros_DH: p.wholesalePrice,
        Valeur_Stock_Achat_DH: p.purchasePrice * p.quantity,
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(stockRows.length ? stockRows : [{ Note: 'Stock vide' }]),
        'Stock'
      );

      // Sheet 6: Crédits Clients
      const creditRows = customers
        .filter((c) => c.totalCredit > 0)
        .map((c) => ({
          Client: c.name,
          Telephone: c.phone,
          CIN: c.CIN || '',
          Credit_Du_DH: c.totalCredit,
        }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(creditRows.length ? creditRows : [{ Note: 'Aucun crédit' }]),
        'Credits_Clients'
      );

      const fileName = `Golden_Shop_Comptabilite_${dateRange.start}_${dateRange.end}.xlsx`;
      XLSX.writeFile(wb, fileName);
      success(
        isAr
          ? 'تم تحميل ملف المحاسبة Excel بنجاح.'
          : 'Fichier comptable Excel (.xlsx) généré avec succès.'
      );
    } catch {
      error(isAr ? 'خطأ أثناء تصدير Excel.' : "Erreur lors de l'export Excel.");
    }
  };

  // Export CSV of Sales
  const handleExportSalesCsv = () => {
    const headers = ['Bon', 'Date', 'Client', 'Total_DH', 'Paye_DH', 'Reste_DH', 'Statut'];
    const lines = report.periodProductSales.map((s) =>
      [
        s.bonNumber,
        s.date,
        `"${(s.customerName || '').replace(/"/g, '""')}"`,
        getNetTotal(s),
        s.paidAmount,
        s.remainingAmount,
        s.status,
      ].join(',')
    );
    const csvContent = '\uFEFF' + [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ventes_${dateRange.start}_${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success(isAr ? 'تم تحميل ملف CSV.' : 'Export CSV téléchargé.');
  };

  return (
    <div className="space-y-4">
      {/* 3 Top 3D Gold KPI Cards — Identical to Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassKpiCard
          title={isAr ? 'رقم معاملات المبيعات والإصلاحات' : 'Chiffre d’Affaires Global'}
          value={formatMAD(report.salesRevenue + report.repairsRevenue, language)}
          subtitle={`${isAr ? 'هامش الربح:' : 'Marge:'} ${formatMAD(report.salesGrossMargin + report.repairsProfit, language)}`}
          variant="gold"
          iconType="money"
        />
        <GlassKpiCard
          title={isAr ? 'الربح الصافي الحقيقي' : 'Bénéfice Net Réel'}
          value={formatMAD(report.netProfit, language)}
          subtitle={isAr ? 'بعد خصم السلعة والمصاريف' : 'Marge + Réparations − Dépenses'}
          variant="green"
          iconType="trend"
        />
        <GlassKpiCard
          title={isAr ? 'قيمة المخزون الحالية' : 'Valorisation du Stock'}
          value={formatMAD(report.stockCostValue, language)}
          subtitle={`${isAr ? 'القيمة البيعية:' : 'Valeur vente:'} ${formatMAD(report.stockRetailValue, language)}`}
          variant="white"
          iconType="box"
        />
      </div>

      {/* Sub-navigation, Period Filter & Export Actions Glass Bar */}
      <div className="relative overflow-hidden bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.55)] space-y-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-black/60 p-1 rounded-full border border-yellow-500/25 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSubTab('overview')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition whitespace-nowrap ${
                subTab === 'overview'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {isAr ? 'الملخص المالي والأرباح' : 'Bilan Financier'}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('closures')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition whitespace-nowrap ${
                subTab === 'closures'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {isAr ? `إغلاقات الصندوق (${cashClosures.length})` : `Clôtures Z (${cashClosures.length})`}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('activity')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition whitespace-nowrap ${
                subTab === 'activity'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {isAr ? 'سجل نشاط المحل' : "Journal d'Activité"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCashClosureOpen(true)}
              className="px-4 py-2 rounded-full bg-black/60 hover:bg-black/80 text-[#FFD700] border border-yellow-500/30 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Calculator className="w-4 h-4" />
              <span>{isAr ? 'إغلاق الصندوق اليومي' : 'Clôture de Caisse (Z)'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportSalesCsv}
              className="px-4 py-2 rounded-full bg-black/60 hover:bg-black/80 text-white border border-yellow-500/25 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Download className="w-4 h-4 text-[#FFD700]" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-4 py-2 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 hover:from-yellow-400 hover:to-amber-200 text-black text-xs font-black flex items-center gap-1.5 shadow-[0_4px_15px_rgba(255,215,0,0.3)] transition active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isAr ? 'تصدير للمحاسب (Excel .xlsx)' : 'Export Comptable (.xlsx)'}</span>
            </button>
          </div>
        </div>

        {/* Period Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
          {(
            [
              { id: 'today', fr: "Aujourd'hui", ar: 'اليوم' },
              { id: 'week', fr: 'Cette semaine', ar: 'هذا الأسبوع' },
              { id: 'month', fr: 'Ce mois', ar: 'هذا الشهر' },
              { id: 'lastMonth', fr: 'Mois dernier', ar: 'الشهر الماضي' },
              { id: 'year', fr: 'Cette année', ar: 'هذه السنة' },
              { id: 'custom', fr: 'Personnalisé', ar: 'فترة مخصصة' },
            ] as { id: ReportPeriod; fr: string; ar: string }[]
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`px-3.5 py-1.5 rounded-full font-bold transition ${
                period === p.id
                  ? 'bg-yellow-500/20 text-[#FFD700] border border-yellow-500/50'
                  : 'bg-black/50 text-gray-300 border border-yellow-500/20 hover:text-white'
              }`}
            >
              {isAr ? p.ar : p.fr}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-3 p-4 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 text-xs">
          <div>
            <label className="text-gray-300 me-2">{isAr ? 'من:' : 'Du :'}</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-black/70 border border-yellow-500/30 rounded-full px-3 py-1.5 text-white"
            />
          </div>
          <div>
            <label className="text-gray-300 me-2">{isAr ? 'إلى:' : 'Au :'}</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-black/70 border border-yellow-500/30 rounded-full px-3 py-1.5 text-white"
            />
          </div>
        </div>
      )}

      {subTab === 'overview' && (
        <div className="space-y-4">
          {/* Stock Valuation & Top Products — Glass Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="relative overflow-hidden p-6 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-4">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-[#FFD700]" />
                <span>{isAr ? 'تقييم المخزون والمصاريف' : 'Valorisation Stock & Dépenses'}</span>
              </h3>
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-black/60 border border-yellow-500/20 flex justify-between items-center">
                  <span className="text-gray-300">
                    {isAr ? 'قيمة المخزون بثمن الشراء :' : 'Valeur au prix d’achat :'}
                  </span>
                  <span className="font-mono font-black text-[#FFD700]">
                    {formatMAD(report.stockCostValue, language)}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-black/60 border border-yellow-500/20 flex justify-between items-center">
                  <span className="text-gray-300">
                    {isAr ? 'قيمة المخزون بثمن البيع :' : 'Valeur au prix de vente :'}
                  </span>
                  <span className="font-mono font-black text-[#22c55e]">
                    {formatMAD(report.stockRetailValue, language)}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-black/60 border border-yellow-500/20 flex justify-between items-center">
                  <span className="text-gray-300">
                    {isAr ? 'مجموع المصاريف الفترة :' : 'Dépenses de la période :'}
                  </span>
                  <span className="font-mono font-black text-rose-400">
                    {formatMAD(report.totalExpenses, language)}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex justify-between items-center">
                  <span className="text-white font-bold">
                    {isAr ? 'الربح المتوقع من المخزون :' : 'Marge potentielle en stock :'}
                  </span>
                  <span className="font-mono font-black text-[#FFD700]">
                    {formatMAD(
                      Math.max(0, report.stockRetailValue - report.stockCostValue),
                      language
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 relative overflow-hidden p-6 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-3">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
              <h3 className="text-sm font-black text-white">
                {isAr
                  ? 'أكثر المنتجات مبيعاً وربحاً خلال الفترة'
                  : 'Top Produits Vendus sur la Période'}
              </h3>
              {report.topProducts.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                  <GoldInventoryBox3D className="w-14 h-14" />
                  <p>{isAr ? 'لا توجد مبيعات في هذه الفترة.' : 'Aucune vente enregistrée sur cette période.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="text-[11px] uppercase text-[#FFD700] font-black border-b border-yellow-500/25">
                      <tr>
                        <th className="py-2.5 text-start">{isAr ? 'المنتج' : 'Article'}</th>
                        <th className="py-2.5 text-center">{isAr ? 'الكمية' : 'Qté'}</th>
                        <th className="py-2.5 text-end">{isAr ? 'المبيعات' : 'CA Net'}</th>
                        <th className="py-2.5 text-end">{isAr ? 'الربح الصافي' : 'Marge'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-yellow-500/15">
                      {report.topProducts.map((tp, idx) => (
                        <tr key={idx} className="hover:bg-yellow-500/10 transition">
                          <td className="py-3 font-bold text-white">{tp.name}</td>
                          <td className="py-3 text-center font-mono text-gray-200">{tp.qty}</td>
                          <td className="py-3 text-end font-mono font-bold text-[#FFD700]">
                            {formatMAD(tp.revenue, language)}
                          </td>
                          <td className="py-3 text-end font-mono font-black text-[#22c55e]">
                            {formatMAD(tp.profit, language)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SubTab 2: Cash Closures History — Glass Card */}
      {subTab === 'closures' && (
        <div className="relative overflow-hidden p-6 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#FFD700]" />
            <span>
              {isAr ? 'سجل إغلاق الصندوق اليومي (Z de caisse)' : 'Historique des Clôtures de Caisse'}
            </span>
          </h3>
          {cashClosures.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
              <GoldMoneyStack3D className="w-14 h-14" />
              <p>{isAr ? 'لم يتم تسجيل أي إغلاق للصندوق بعد.' : 'Aucune clôture de caisse enregistrée.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="text-[11px] uppercase text-[#FFD700] font-black border-b border-yellow-500/25">
                  <tr>
                    <th className="py-3 px-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-3 px-3 text-end">
                      {isAr ? 'النقد المتوقع' : 'Attendu Caisse'}
                    </th>
                    <th className="py-3 px-3 text-end">
                      {isAr ? 'النقد الفعلي المحسوب' : 'Espèces Comptées'}
                    </th>
                    <th className="py-3 px-3 text-end">{isAr ? 'الفارق' : 'Écart'}</th>
                    <th className="py-3 px-3 text-start">{isAr ? 'المسؤول' : 'Par'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-500/15 font-mono">
                  {cashClosures.map((c) => (
                    <tr key={c.id} className="hover:bg-yellow-500/10 transition">
                      <td className="py-3 px-3 font-black text-[#FFD700]">{c.date}</td>
                      <td className="py-3 px-3 text-end text-gray-200">
                        {formatMAD(c.netExpectedCash, language)}
                      </td>
                      <td className="py-3 px-3 text-end font-black text-white">
                        {formatMAD(c.countedCash, language)}
                      </td>
                      <td
                        className={`py-3 px-3 text-end font-black ${
                          Math.abs(c.discrepancy) < 0.01
                            ? 'text-[#22c55e]'
                            : c.discrepancy > 0
                            ? 'text-[#FFD700]'
                            : 'text-rose-400'
                        }`}
                      >
                        {c.discrepancy > 0 ? `+${formatMAD(c.discrepancy, language)}` : formatMAD(c.discrepancy, language)}
                      </td>
                      <td className="py-3 px-3 font-sans text-gray-300">
                        {c.closedBy} {c.notes ? `— ${c.notes}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SubTab 3: Activity Log (سجل النشطة) — Glass Cards List */}
      {subTab === 'activity' && (
        <div className="relative overflow-hidden p-6 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#FFD700]" />
            <span>
              {isAr
                ? 'سجل تتبع العمليات (المالك / المستخدم)'
                : "Journal d'Activité & Traçabilité (Propriétaire / Employé)"}
            </span>
          </h3>
          {activityLogs.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center italic">
              {isAr ? 'لا توجد عمليات مسجلة بعد.' : 'Aucune activité enregistrée.'}
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pe-1">
              {activityLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 rounded-[18px] bg-black/60 backdrop-blur-xl border border-yellow-500/20 hover:border-[#FFD700] transition flex items-center justify-between gap-3 text-xs shadow-md"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ${
                        log.userRole === 'owner'
                          ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black'
                          : 'bg-yellow-500/15 text-[#FFD700] border border-yellow-500/30'
                      }`}
                    >
                      {log.userName}
                    </span>
                    <span className="text-white font-semibold truncate">{log.details}</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#FFD700] shrink-0">
                    {log.createdAt.replace('T', ' ').slice(0, 16)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CashClosureModal
        isOpen={isCashClosureOpen}
        onClose={() => setIsCashClosureOpen(false)}
      />
    </div>
  );
};
