import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Wallet,
  Plus,
  Search,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertCircle,
  Clock,
  RotateCcw,
  Trash2,
  Edit2,
  Tag,
  CreditCard,
  Wrench,
  CheckCircle2,
  HelpCircle,
  BarChart3,
  Filter,
  Check,
  ChevronDown,
} from 'lucide-react';
import {
  db,
  createExpense,
  updateExpense,
  deleteExpense,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  processRecurringExpenses,
  addCustomExpenseCategory,
  getCustomExpenseCategories,
} from '../db';
import {
  Expense,
  RecurringExpense,
  ExpenseCategory,
  Sale,
  RepairOrder,
  Customer,
} from '../types';
import { GlassKpiCard, GoldMoneyStack3D } from '../components/GoldenGlassUI';
import { useI18n } from '../i18n';
import { useViewMode } from '../lib/viewMode';
import { useToast } from '../components/Toast';
import { formatMAD } from '../lib/currency';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatCard } from '../components/StatCard';
import { getMoroccoDateString, getMoroccoYearMonth } from '../lib/dateUtils';
import { useAccessAuth } from '../lib/accessAuth';

const STANDARD_CATEGORIES: { id: ExpenseCategory; icon: string }[] = [
  { id: 'rent', icon: '🏢' },
  { id: 'electricity', icon: '⚡' },
  { id: 'water', icon: '💧' },
  { id: 'internet', icon: '📶' },
  { id: 'salary', icon: '👤' },
  { id: 'goods', icon: '📦' },
  { id: 'other', icon: '📌' },
];

type PeriodType = 'today' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'all' | 'custom';

export const ExpensesPage: React.FC = () => {
  const { t, language } = useI18n();
  const { isMobileMode } = useViewMode();
  const { success, error } = useToast();
  const { can } = useAccessAuth();

  const [activeTab, setActiveTab] = useState<'netProfit' | 'expenses' | 'recurring'>(
    !can('view_profits') ? 'expenses' : 'netProfit'
  );
  const [period, setPeriod] = useState<PeriodType>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [visibleCount, setVisibleCount] = useState(25);

  // Search & Filters in expenses list
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modal: Add / Edit Single Expense
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseCategory, setExpenseCategory] = useState<string>('rent');
  const [expenseDate, setExpenseDate] = useState<string>(getMoroccoDateString());
  const [expenseNote, setExpenseNote] = useState('');

  // Custom Category Input
  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Modal: Add / Edit Recurring Expense
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [recurringTitle, setRecurringTitle] = useState('');
  const [recurringAmount, setRecurringAmount] = useState<number>(0);
  const [recurringCategory, setRecurringCategory] = useState<string>('rent');
  const [recurringDay, setRecurringDay] = useState<number>(1);
  const [recurringNote, setRecurringNote] = useState('');
  const [recurringActive, setRecurringActive] = useState<boolean>(true);

  // Confirm delete states
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [deletingRecurring, setDeletingRecurring] = useState<RecurringExpense | null>(null);

  // Live queries
  const expenses =
    useLiveQuery(
      () =>
        db.expenses
          .orderBy('date')
          .reverse()
          .toArray()
          .then((arr) => arr.filter((e) => !e.deleted_at)),
      []
    ) || [];
  const recurringExpenses =
    useLiveQuery(
      () => db.recurringExpenses.toArray().then((arr) => arr.filter((r) => !r.deleted_at)),
      []
    ) || [];
  const customCategories =
    useLiveQuery(
      () => db.customExpenseCategories.toArray().then((arr) => arr.filter((c) => !c.deleted_at)),
      []
    ) || [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) || [];
  const repairs = useLiveQuery(() => db.repairs.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];

  // Ensure recurring monthly expenses are checked upon page load
  useEffect(() => {
    processRecurringExpenses();
  }, []);

  // Compute date range based on selected period in Morocco timezone (Partie 1 #6)
  const dateRange = useMemo<{ start: string; end: string }>(() => {
    const now = new Date();
    const todayStr = getMoroccoDateString(now);

    if (period === 'today') {
      return { start: todayStr, end: todayStr };
    }

    if (period === 'thisWeek') {
      const day = now.getDay(); // 0 is Sunday
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const startStr = getMoroccoDateString(monday);
      return { start: startStr, end: todayStr };
    }

    if (period === 'thisMonth') {
      const startStr = `${getMoroccoYearMonth(now)}-01`;
      return { start: startStr, end: todayStr };
    }

    if (period === 'thisYear') {
      const startStr = `${getMoroccoYearMonth(now).slice(0, 4)}-01-01`;
      return { start: startStr, end: todayStr };
    }

    if (period === 'custom') {
      return {
        start: customStartDate || '2000-01-01',
        end: customEndDate || '2099-12-31',
      };
    }

    // 'all'
    return { start: '2000-01-01', end: '2099-12-31' };
  }, [period, customStartDate, customEndDate]);

  // Helper to get category localized name
  const getCategoryLabel = (catKey: string): string => {
    const known = t.expenses.categories[catKey as keyof typeof t.expenses.categories];
    if (known) return known;
    const custom = customCategories.find((c) => c.key === catKey);
    if (custom) return custom.name;
    return catKey;
  };

  // Helper to get category emoji/icon
  const getCategoryIcon = (catKey: string): string => {
    const std = STANDARD_CATEGORIES.find((c) => c.id === catKey);
    return std ? std.icon : '🏷️';
  };

  // Calculations for the selected period (Partie 1 #2 & #5: Never double-count repairs; exclude returned items & proportional discount)
  const stats = useMemo(() => {
    const { start, end } = dateRange;

    // 1. Product Sales in period (exclude REP-xxxx repair cash entries so repairs are only counted once!)
    const periodSales = sales.filter(
      (s) =>
        !s.deleted_at &&
        s.date >= start &&
        s.date <= end &&
        s.status !== 'returned' &&
        s.saleKind !== 'repair_deposit' &&
        s.saleKind !== 'repair_delivery' &&
        !s.bonNumber?.startsWith('REP-')
    );

    const totalSalesRevenue = periodSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
    const unpaidCreditInPeriod = periodSales.reduce((acc, s) => acc + (s.remainingAmount || 0), 0);

    // Sales Gross Profit with proportional discount on non-returned items
    let salesGrossProfit = 0;
    for (const sale of periodSales) {
      const rawSubtotal = (sale.items || []).reduce(
        (acc, it) => acc + Number(it.price || 0) * Number(it.quantity || 1),
        0
      );
      const activeItemsSubtotal = (sale.items || [])
        .filter((it) => !it.isReturned)
        .reduce((acc, it) => acc + Number(it.price || 0) * Number(it.quantity || 1), 0);
      const activeItemsCost = (sale.items || [])
        .filter((it) => !it.isReturned)
        .reduce((acc, it) => acc + Number(it.costPrice || 0) * Number(it.quantity || 1), 0);
      const effectiveDiscount =
        rawSubtotal > 0
          ? ((sale.discountAmount || 0) * activeItemsSubtotal) / rawSubtotal
          : 0;
      const netSaleMargin = activeItemsSubtotal - effectiveDiscount - activeItemsCost;
      salesGrossProfit += netSaleMargin;
    }

    // 2. Repairs delivered in period (counted once with totalPartsCost deducted)
    const periodRepairs = repairs.filter((r) => {
      if (r.deleted_at) return false;
      const repDate = r.actualDeliveryDate || r.intakeDate;
      return repDate >= start && repDate <= end && r.status === 'delivered';
    });

    const repairsProfit = periodRepairs.reduce((acc, r) => {
      const profit =
        r.netProfit !== undefined
          ? r.netProfit
          : (r.agreedPrice || 0) - (r.totalPartsCost || 0);
      return acc + profit;
    }, 0);

    // 3. Expenses in period
    const periodExpenses = expenses.filter(
      (e) => e.date >= start && e.date <= end
    );
    const totalExpenses = periodExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    // 4. Combined Gross and Net Profit
    const grossProfit = salesGrossProfit + repairsProfit;
    const netProfit = grossProfit - totalExpenses;

    // Overall total credit across all customers (cumulative)
    const overallCredit = customers.reduce((acc, c) => acc + (c.totalCredit || 0), 0);

    return {
      periodSalesCount: periodSales.length,
      totalSalesRevenue,
      salesGrossProfit,
      periodRepairsCount: periodRepairs.length,
      repairsProfit,
      grossProfit,
      totalExpenses,
      periodExpensesCount: periodExpenses.length,
      netProfit,
      unpaidCreditInPeriod,
      overallCredit,
    };
  }, [sales, repairs, expenses, customers, dateRange]);

  // 6-Month Trend Data Calculation
  const sixMonthsTrend = useMemo(() => {
    const list: {
      monthKey: string;
      monthLabel: string;
      revenue: number;
      expenses: number;
      netProfit: number;
    }[] = [];

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yearMonth = getMoroccoYearMonth(d); // "YYYY-MM" in Africa/Casablanca
      const monthLabel = d.toLocaleDateString(language === 'ar' ? 'ar-MA' : 'fr-FR', {
        month: 'short',
        year: '2-digit',
      });

      // Product Sales margin in this month (excluding REP-xxxx)
      const mSales = sales.filter(
        (s) =>
          !s.deleted_at &&
          s.date.startsWith(yearMonth) &&
          s.status !== 'returned' &&
          s.saleKind !== 'repair_deposit' &&
          s.saleKind !== 'repair_delivery' &&
          !s.bonNumber?.startsWith('REP-')
      );
      let mSalesMargin = 0;
      let mRevenue = 0;
      for (const s of mSales) {
        mRevenue += s.totalAmount || 0;
        const rawSub = (s.items || []).reduce(
          (acc, it) => acc + Number(it.price || 0) * Number(it.quantity || 1),
          0
        );
        const activeSub = (s.items || [])
          .filter((it) => !it.isReturned)
          .reduce((acc, it) => acc + Number(it.price || 0) * Number(it.quantity || 1), 0);
        const activeCost = (s.items || [])
          .filter((it) => !it.isReturned)
          .reduce((acc, it) => acc + Number(it.costPrice || 0) * Number(it.quantity || 1), 0);
        const effDisc = rawSub > 0 ? ((s.discountAmount || 0) * activeSub) / rawSub : 0;
        mSalesMargin += activeSub - effDisc - activeCost;
      }

      // Repairs in this month
      const mRepairs = repairs.filter((r) => {
        if (r.deleted_at) return false;
        const rDate = r.actualDeliveryDate || r.intakeDate;
        return rDate.startsWith(yearMonth) && r.status === 'delivered';
      });
      const mRepairsProfit = mRepairs.reduce(
        (acc, r) =>
          acc +
          (r.netProfit !== undefined
            ? r.netProfit
            : (r.agreedPrice || 0) - (r.totalPartsCost || 0)),
        0
      );

      // Expenses in this month
      const mExpenses = expenses.filter((e) => e.date.startsWith(yearMonth));
      const mTotalExpenses = mExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

      const mGross = mSalesMargin + mRepairsProfit;
      const mNet = mGross - mTotalExpenses;

      list.push({
        monthKey: yearMonth,
        monthLabel,
        revenue: mRevenue,
        expenses: mTotalExpenses,
        netProfit: mNet,
      });
    }

    return list;
  }, [sales, repairs, expenses, language]);

  // Max value for 6-month chart scaling
  const maxChartVal = useMemo(() => {
    let max = 1000;
    for (const m of sixMonthsTrend) {
      if (m.revenue > max) max = m.revenue;
      if (m.expenses > max) max = m.expenses;
      if (Math.abs(m.netProfit) > max) max = Math.abs(m.netProfit);
    }
    return max * 1.15;
  }, [sixMonthsTrend]);

  // Filtered expenses list
  const filteredExpenses = useMemo(() => {
    const { start, end } = dateRange;
    return expenses.filter((e) => {
      // Date filter
      if (period !== 'all' && (e.date < start || e.date > end)) return false;

      // Category filter
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;

      // Text search
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const titleMatch = e.title?.toLowerCase().includes(q);
      const noteMatch = e.note?.toLowerCase().includes(q);
      const catMatch = getCategoryLabel(e.category).toLowerCase().includes(q);
      const amountMatch = String(e.amount).includes(q);
      return titleMatch || noteMatch || catMatch || amountMatch;
    });
  }, [expenses, dateRange, period, categoryFilter, search, customCategories]);

  const paginatedExpenses = filteredExpenses.slice(0, visibleCount);

  // Open modal for new expense
  const handleOpenAddExpense = () => {
    setEditingExpense(null);
    setExpenseTitle('');
    setExpenseAmount(0);
    setExpenseCategory('rent');
    setExpenseDate(getMoroccoDateString());
    setExpenseNote('');
    setIsAddingNewCat(false);
    setNewCatName('');
    setIsExpenseModalOpen(true);
  };

  // Open modal for editing expense
  const handleOpenEditExpense = (item: Expense) => {
    setEditingExpense(item);
    setExpenseTitle(item.title || '');
    setExpenseAmount(item.amount);
    setExpenseCategory(item.category);
    setExpenseDate(item.date);
    setExpenseNote(item.note || '');
    setIsAddingNewCat(false);
    setNewCatName('');
    setIsExpenseModalOpen(true);
  };

  // Save single expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseAmount <= 0) {
      error(language === 'ar' ? 'يرجى إدخال مبلغ صحيح للمصروف.' : 'Veuillez saisir un montant valide.');
      return;
    }

    try {
      let finalCat = expenseCategory;
      if (isAddingNewCat && newCatName.trim()) {
        const cleanKey = newCatName.trim().toLowerCase().replace(/\s+/g, '_');
        await addCustomExpenseCategory(cleanKey, newCatName.trim());
        finalCat = cleanKey;
      }

      const payload = {
        title: expenseTitle.trim() || undefined,
        amount: Number(expenseAmount),
        category: finalCat,
        date: expenseDate,
        note: expenseNote.trim() || undefined,
      };

      if (editingExpense?.id) {
        await updateExpense(editingExpense.id, payload);
        success(language === 'ar' ? 'تم تحديث المصروف بنجاح.' : 'Dépense mise à jour avec succès.');
      } else {
        await createExpense(payload);
        success(language === 'ar' ? 'تم تسجيل المصروف بنجاح.' : 'Dépense enregistrée avec succès.');
      }

      setIsExpenseModalOpen(false);
    } catch {
      error(language === 'ar' ? 'حدث خطأ أثناء حفظ المصروف.' : "Erreur lors de l'enregistrement de la dépense.");
    }
  };

  // Confirm delete single expense
  const handleConfirmDeleteExpense = async () => {
    if (!deletingExpense?.id) return;
    try {
      await deleteExpense(deletingExpense.id);
      success(language === 'ar' ? 'تم حذف المصروف بنجاح.' : 'Dépense supprimée avec succès.');
      setDeletingExpense(null);
    } catch {
      error(language === 'ar' ? 'حدث خطأ أثناء الحذف.' : 'Erreur lors de la suppression.');
    }
  };

  // Open modal for recurring expense
  const handleOpenAddRecurring = () => {
    setEditingRecurring(null);
    setRecurringTitle('');
    setRecurringAmount(0);
    setRecurringCategory('rent');
    setRecurringDay(1);
    setRecurringNote('');
    setRecurringActive(true);
    setIsAddingNewCat(false);
    setNewCatName('');
    setIsRecurringModalOpen(true);
  };

  // Open modal for editing recurring expense
  const handleOpenEditRecurring = (rec: RecurringExpense) => {
    setEditingRecurring(rec);
    setRecurringTitle(rec.title);
    setRecurringAmount(rec.amount);
    setRecurringCategory(rec.category);
    setRecurringDay(rec.dayOfMonth);
    setRecurringNote(rec.note || '');
    setRecurringActive(rec.isActive);
    setIsAddingNewCat(false);
    setNewCatName('');
    setIsRecurringModalOpen(true);
  };

  // Save recurring expense
  const handleSaveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recurringTitle.trim()) {
      error(language === 'ar' ? 'يرجى إدخال اسم المصروف المتكرر.' : 'Veuillez saisir un intitulé pour la charge.');
      return;
    }
    if (recurringAmount <= 0) {
      error(language === 'ar' ? 'يرجى إدخال مبلغ صحيح.' : 'Veuillez saisir un montant valide.');
      return;
    }

    try {
      let finalCat = recurringCategory;
      if (isAddingNewCat && newCatName.trim()) {
        const cleanKey = newCatName.trim().toLowerCase().replace(/\s+/g, '_');
        await addCustomExpenseCategory(cleanKey, newCatName.trim());
        finalCat = cleanKey;
      }

      const payload = {
        title: recurringTitle.trim(),
        amount: Number(recurringAmount),
        category: finalCat,
        dayOfMonth: Math.min(31, Math.max(1, Number(recurringDay) || 1)),
        note: recurringNote.trim() || undefined,
        isActive: recurringActive,
      };

      if (editingRecurring?.id) {
        await updateRecurringExpense(editingRecurring.id, payload);
        success(language === 'ar' ? 'تم تحديث المصروف المتكرر بنجاح.' : 'Charge récurrente mise à jour avec succès.');
      } else {
        await createRecurringExpense(payload);
        success(
          language === 'ar'
            ? 'تم حفظ المصروف المتكرر وسيتم تسجيله أوتوماتيكياً كل شهر.'
            : 'Charge récurrente enregistrée. Elle sera générée automatiquement chaque mois.'
        );
      }

      setIsRecurringModalOpen(false);
    } catch {
      error(language === 'ar' ? 'حدث خطأ أثناء حفظ المصروف المتكرر.' : "Erreur lors de l'enregistrement.");
    }
  };

  // Toggle active status for recurring expense
  const handleToggleRecurringActive = async (rec: RecurringExpense) => {
    if (!rec.id) return;
    try {
      await updateRecurringExpense(rec.id, { isActive: !rec.isActive });
      success(
        language === 'ar'
          ? !rec.isActive
            ? 'تم تفعيل المصروف المتكرر.'
            : 'تم إيقاف المصروف المتكرر مؤقتاً.'
          : !rec.isActive
          ? 'Charge récurrente activée.'
          : 'Charge récurrente mise en pause.'
      );
    } catch {}
  };

  // Confirm delete recurring expense
  const handleConfirmDeleteRecurring = async () => {
    if (!deletingRecurring?.id) return;
    try {
      await deleteRecurringExpense(deletingRecurring.id);
      success(language === 'ar' ? 'تم حذف المصروف المتكرر.' : 'Charge récurrente supprimée.');
      setDeletingRecurring(null);
    } catch {
      error(language === 'ar' ? 'حدث خطأ أثناء الحذف.' : 'Erreur lors de la suppression.');
    }
  };

  // All combined categories for dropdowns
  const allCategoryOptions = useMemo(() => {
    const list = [...STANDARD_CATEGORIES.map((c) => ({ key: c.id, label: getCategoryLabel(c.id) }))];
    for (const cust of customCategories) {
      if (!list.some((l) => l.key === cust.key)) {
        list.push({ key: cust.key, label: cust.name });
      }
    }
    return list;
  }, [customCategories, language]);

  return (
    <div className="space-y-4">
      {/* 3 Top 3D Gold KPI Cards — Identical to Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassKpiCard
          title={t.expenses.cards.salesRevenue}
          value={formatMAD(stats.totalSalesRevenue, language)}
          subtitle={`${t.expenses.cards.grossProfit}: ${formatMAD(stats.grossProfit, language)}`}
          variant="gold"
          iconType="money"
        />
        <GlassKpiCard
          title={t.expenses.cards.netProfit}
          value={formatMAD(stats.netProfit, language)}
          subtitle={language === 'ar' ? 'الربح الإجمالي − المصاريف' : 'Marge brute − Dépenses'}
          variant="green"
          iconType="trend"
        />
        <GlassKpiCard
          title={t.expenses.cards.totalExpenses}
          value={formatMAD(stats.totalExpenses, language)}
          subtitle={`${t.expenses.cards.unpaidCredit}: ${formatMAD(stats.unpaidCreditInPeriod, language)}`}
          variant="white"
          iconType="box"
        />
      </div>

      {/* Tabs, Period Navigation & Quick Actions Glass Bar */}
      <div className="relative overflow-hidden bg-black/65 backdrop-blur-xl border border-yellow-500/20 rounded-[20px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Main View Tabs */}
          <div className="flex items-center gap-2 p-1 bg-black/60 rounded-full border border-yellow-500/25 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('netProfit')}
              className={`py-2 px-4 rounded-full text-xs font-bold transition whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'netProfit'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>{t.expenses.netProfitTab}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('expenses')}
              className={`py-2 px-4 rounded-full text-xs font-bold transition whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'expenses'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>{t.expenses.expensesTab}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 text-[#FFD700] font-mono">
                {expenses.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recurring')}
              className={`py-2 px-4 rounded-full text-xs font-bold transition whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'recurring'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{t.expenses.recurringTab}</span>
              {recurringExpenses.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-[#22c55e] font-mono">
                  {recurringExpenses.filter((r) => r.isActive).length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <button
              type="button"
              onClick={handleOpenAddRecurring}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-black/60 hover:bg-black/80 text-[#FFD700] border border-yellow-500/30 font-bold text-xs transition active:scale-95"
            >
              <Clock className="w-4 h-4 text-[#FFD700]" />
              <span>{t.expenses.addRecurring}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddExpense}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 hover:from-yellow-400 hover:to-amber-200 text-black font-black text-xs transition active:scale-95 shadow-[0_4px_15px_rgba(255,215,0,0.3)]"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>{t.expenses.addExpense}</span>
            </button>
          </div>
        </div>

        {/* Period Filter (Today, Week, Month, Year, Custom) */}
        <div className="flex items-center gap-2 flex-wrap overflow-x-auto pt-1">
          {(
            [
              { id: 'today', label: t.expenses.periods.today },
              { id: 'thisWeek', label: t.expenses.periods.thisWeek },
              { id: 'thisMonth', label: t.expenses.periods.thisMonth },
              { id: 'thisYear', label: t.expenses.periods.thisYear },
              { id: 'all', label: t.expenses.periods.all },
              { id: 'custom', label: t.expenses.periods.custom },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`py-1.5 px-3.5 rounded-full text-xs font-bold transition whitespace-nowrap border ${
                period === p.id
                  ? 'bg-yellow-500/20 text-[#FFD700] border-yellow-500/50 shadow-xs'
                  : 'bg-black/50 text-gray-300 border-yellow-500/20 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Date Range Picker inputs when period === 'custom' */}
      {period === 'custom' && (
        <div className="p-4 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 flex flex-wrap items-center gap-3 text-xs animate-fadeIn">
          <span className="text-[#FFD700] font-bold">{t.expenses.periods.custom} :</span>
          <div className="flex items-center gap-2">
            <label className="text-gray-300">{language === 'ar' ? 'من' : 'Du'}</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-black/70 border border-yellow-500/30 rounded-full px-3 py-1.5 text-white font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-gray-300">{language === 'ar' ? 'إلى' : 'Au'}</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-black/70 border border-yellow-500/30 rounded-full px-3 py-1.5 text-white font-mono"
            />
          </div>
        </div>
      )}

      {/* View 1: Net Profit Analysis & 3D Liquid Gold Chart (Identical to Dashboard Chart Card) */}
      {activeTab === 'netProfit' && (
        <div className="space-y-4 animate-fadeIn">
          {/* 3D Liquid Gold Bar Chart Card — Cloned from Dashboard */}
          <div className="relative overflow-hidden bg-black/65 backdrop-blur-xl border border-yellow-500/20 rounded-[20px] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 62%, rgba(255, 195, 35, 0.14) 0%, transparent 65%)',
              }}
            />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-6">
              <div>
                <h2 className="text-white text-lg font-extrabold tracking-tight">
                  {t.expenses.trend6Months}
                </h2>
                <p className="text-gray-300 text-xs mt-1 font-medium">
                  {t.expenses.explanation.formula} :{' '}
                  <span className="text-[#FFD700] font-bold" dir="ltr">
                    {formatMAD(stats.grossProfit, language)} − {formatMAD(stats.totalExpenses, language)} = {formatMAD(stats.netProfit, language)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="px-3 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-[#FFD700] font-bold">
                  {language === 'ar' ? 'سلعة:' : 'Ventes:'} {formatMAD(stats.salesGrossProfit, language)}
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[#22c55e] font-bold">
                  {language === 'ar' ? 'ورشة:' : 'Atelier:'} {formatMAD(stats.repairsProfit, language)}
                </span>
              </div>
            </div>

            {/* 3D Glass Bars Container */}
            <div className="relative z-10 h-[280px] flex flex-col justify-end pt-4">
              <div className="pointer-events-none absolute inset-x-0 top-6 bottom-12 flex flex-col justify-between">
                {[0, 1, 2, 3].map((line) => (
                  <div key={line} className="w-full border-b border-yellow-500/10" />
                ))}
              </div>

              <div className="relative z-10 flex items-end justify-between gap-3 sm:gap-5 h-[220px] px-2 sm:px-6">
                {sixMonthsTrend.map((m, idx) => {
                  const pct = Math.max(18, Math.round((Math.max(m.revenue, Math.abs(m.netProfit), 100) / maxChartVal) * 100));
                  const isHero = idx === sixMonthsTrend.length - 1;
                  return (
                    <div
                      key={m.monthKey}
                      className="flex-1 flex flex-col items-center justify-end h-full group"
                    >
                      <div
                        style={{ height: `${pct}%` }}
                        className={`relative w-full max-w-[68px] rounded-t-[14px] transition-all duration-500 group-hover:scale-[1.03] overflow-hidden ${
                          isHero
                            ? 'border border-[#FFF3A6] shadow-[0_0_32px_rgba(255,200,40,0.45)]'
                            : 'border border-yellow-400/35 shadow-[0_8px_20px_rgba(0,0,0,0.5)]'
                        }`}
                      >
                        <div
                          className="absolute inset-0"
                          style={{
                            background: isHero
                              ? 'linear-gradient(180deg, #FFF6B7 0%, #FFD447 32%, #D89614 78%, #7A4E03 100%)'
                              : 'linear-gradient(180deg, rgba(255,235,140,0.58) 0%, rgba(235,175,35,0.34) 48%, rgba(160,105,10,0.18) 100%)',
                          }}
                        />
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-white/50 via-[#FFF8C9] to-white/50" />
                        <div className="pointer-events-none absolute top-0 bottom-0 right-1.5 w-[4px] bg-gradient-to-b from-white/45 via-white/15 to-transparent rounded-full" />
                      </div>
                      <span className="mt-2.5 text-[11px] font-bold text-gray-200 text-center">
                        {m.monthLabel}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full mt-0.5 ${
                          m.netProfit >= 0
                            ? 'bg-emerald-500/15 text-[#22c55e] border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {formatMAD(m.netProfit, language)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Plain Words Explanation Box — Glass Card */}
          <div className="relative overflow-hidden p-6 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-4 text-xs">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
            <div className="flex items-center gap-2 border-b border-yellow-500/20 pb-3">
              <HelpCircle className="w-5 h-5 text-[#FFD700]" />
              <h2 className="text-sm font-black text-white">
                {t.expenses.explanation.title}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-gray-200">
              <div className="p-3.5 rounded-2xl bg-black/60 border border-yellow-500/20 space-y-1">
                <span className="font-bold text-[#22c55e] block">
                  1. {language === 'ar' ? 'هامش ربح المبيعات :' : 'Marge sur ventes :'} {formatMAD(stats.salesGrossProfit, language)}
                </span>
                <p className="text-gray-300 leading-relaxed">
                  {t.expenses.explanation.salesPart}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/60 border border-yellow-500/20 space-y-1">
                <span className="font-bold text-[#FFD700] block">
                  2. {language === 'ar' ? 'أرباح ورشة الإصلاح :' : 'Bénéfice réparations :'} {formatMAD(stats.repairsProfit, language)}
                </span>
                <p className="text-gray-300 leading-relaxed">
                  {t.expenses.explanation.repairsPart}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/60 border border-yellow-500/20 space-y-1">
                <span className="font-bold text-rose-400 block">
                  3. {language === 'ar' ? 'المصاريف المدفوعة :' : 'Dépenses totales :'} {formatMAD(stats.totalExpenses, language)}
                </span>
                <p className="text-gray-300 leading-relaxed">
                  {t.expenses.explanation.expensesPart}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 space-y-1">
                <span className="font-bold text-[#FFD700] block">
                  4. {language === 'ar' ? 'توضيح بخصوص الكريدي :' : 'Règle stricte du crédit :'} {formatMAD(stats.unpaidCreditInPeriod, language)}
                </span>
                <p className="text-gray-200 leading-relaxed">
                  {t.expenses.explanation.creditNote}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View 2: Expenses List Tab */}
      {activeTab === 'expenses' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Search & Category Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#FFD700] absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.expenses.searchPlaceholder}
                className="w-full bg-black/60 border border-yellow-500/25 rounded-full ps-10 pe-4 py-2.5 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:border-[#FFD700]"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#FFD700] shrink-0" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-black/60 border border-yellow-500/25 rounded-full px-3.5 py-2.5 text-xs text-white focus:outline-hidden focus:border-[#FFD700]"
              >
                <option value="all">{t.expenses.allCategories}</option>
                {allCategoryOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Expenses Table (Desktop) / Cards (Mobile) */}
          {filteredExpenses.length === 0 ? (
            <div className="p-12 text-center rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 text-gray-400 text-xs space-y-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <div className="flex justify-center">
                <GoldMoneyStack3D className="w-16 h-16" />
              </div>
              <p className="text-white font-bold">{t.expenses.noExpenses}</p>
              <button
                type="button"
                onClick={handleOpenAddExpense}
                className="px-5 py-2.5 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black text-xs shadow-[0_4px_15px_rgba(255,215,0,0.3)]"
              >
                {t.expenses.addExpense}
              </button>
            </div>
          ) : isMobileMode ? (
            <div className="space-y-3">
              {paginatedExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="p-4 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 space-y-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:border-[#FFD700] transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getCategoryIcon(exp.category)}</span>
                      <div>
                        <div className="font-bold text-white text-xs">
                          {exp.title || getCategoryLabel(exp.category)}
                        </div>
                        <div className="text-[10px] text-gray-300 flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono">{exp.date}</span>
                          <span>·</span>
                          <span className="text-[#FFD700] font-medium">
                            {getCategoryLabel(exp.category)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-end">
                      <span className="font-mono font-black text-rose-400 text-sm">
                        {formatMAD(exp.amount, language)}
                      </span>
                      {exp.isRecurring && (
                        <span className="block text-[9px] px-1.5 py-0.2 rounded bg-yellow-500/15 text-[#FFD700] font-semibold mt-0.5">
                          {t.expenses.recurringBadge}
                        </span>
                      )}
                    </div>
                  </div>

                  {exp.note && (
                    <p className="text-[11px] text-gray-300 bg-black/60 p-2.5 rounded-xl border border-yellow-500/15">
                      {exp.note}
                    </p>
                  )}

                  <div className="pt-2 border-t border-yellow-500/15 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditExpense(exp)}
                      className="p-2 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-[#FFD700]"
                      title={t.expenses.editExpense}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingExpense(exp)}
                      className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400"
                      title={t.expenses.deleteExpense}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/25 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
              <table className="w-full text-start text-xs">
                <thead className="bg-black/70 text-[#FFD700] uppercase text-[11px] font-black tracking-wider border-b border-yellow-500/25">
                  <tr>
                    <th className="py-3.5 px-4 text-start">{t.expenses.date}</th>
                    <th className="py-3.5 px-4 text-start">{t.expenses.category}</th>
                    <th className="py-3.5 px-4 text-start">{t.expenses.titleField}</th>
                    <th className="py-3.5 px-4 text-start">{t.expenses.note}</th>
                    <th className="py-3.5 px-4 text-end">{t.expenses.amount}</th>
                    <th className="py-3.5 px-4 text-center">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-500/15">
                  {paginatedExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-yellow-500/10 transition">
                      <td className="py-3.5 px-4 font-mono font-medium text-gray-200 whitespace-nowrap">
                        {exp.date}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-yellow-500/25 text-white text-[11px] font-semibold">
                          <span>{getCategoryIcon(exp.category)}</span>
                          <span>{getCategoryLabel(exp.category)}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{exp.title || '—'}</span>
                          {exp.isRecurring && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-yellow-500/15 text-[#FFD700] font-semibold border border-yellow-500/30">
                              {t.expenses.recurringBadge}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-gray-300 max-w-xs truncate">
                        {exp.note || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono font-black text-rose-400 whitespace-nowrap">
                        {formatMAD(exp.amount, language)}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditExpense(exp)}
                            className="p-1.5 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-[#FFD700] border border-yellow-500/30 transition"
                            title={t.expenses.editExpense}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {can('delete_records') && (
                            <button
                              type="button"
                              onClick={() => setDeletingExpense(exp)}
                              className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition"
                              title={t.expenses.deleteExpense}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredExpenses.length > visibleCount && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 25)}
                className="px-6 py-2.5 rounded-full bg-black/65 backdrop-blur-xl hover:bg-black/80 border border-yellow-500/30 text-[#FFD700] text-xs font-black transition shadow-lg"
              >
                {language === 'ar'
                  ? `عرض المزيد (${filteredExpenses.length - visibleCount} متبقية)`
                  : `Voir plus (${filteredExpenses.length - visibleCount} restants)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* View 3: Recurring Monthly Expenses Tab */}
      {activeTab === 'recurring' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="p-4 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/30 flex items-start gap-3 text-xs shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <Clock className="w-5 h-5 text-[#FFD700] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-[#FFD700] block">
                {t.expenses.recurringSection}
              </span>
              <p className="text-gray-200 mt-0.5 leading-relaxed text-[11px]">
                {t.expenses.recurringDesc}
              </p>
            </div>
          </div>

          {recurringExpenses.length === 0 ? (
            <div className="p-12 text-center rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 text-gray-400 text-xs space-y-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
              <Clock className="w-10 h-10 mx-auto text-[#FFD700]" />
              <p className="text-white font-bold">{t.expenses.noRecurring}</p>
              <button
                type="button"
                onClick={handleOpenAddRecurring}
                className="px-5 py-2.5 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black text-xs shadow-[0_4px_15px_rgba(255,215,0,0.3)]"
              >
                {t.expenses.addRecurring}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recurringExpenses.map((rec) => (
                <div
                  key={rec.id}
                  className={`p-5 rounded-[20px] border transition shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex flex-col justify-between space-y-3 bg-black/65 backdrop-blur-xl ${
                    rec.isActive
                      ? 'border-yellow-500/25 hover:border-[#FFD700]'
                      : 'border-white/10 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getCategoryIcon(rec.category)}</span>
                        <div>
                          <h4 className="font-bold text-white text-xs">{rec.title}</h4>
                          <span className="text-[10px] text-[#FFD700] font-medium">
                            {getCategoryLabel(rec.category)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleRecurringActive(rec)}
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold transition border ${
                          rec.isActive
                            ? 'bg-emerald-500/15 text-[#22c55e] border-emerald-500/30'
                            : 'bg-black/60 text-gray-400 border-white/15'
                        }`}
                      >
                        {rec.isActive ? t.expenses.recurringActive : t.expenses.recurringPaused}
                      </button>
                    </div>

                    <div className="mt-3 p-3 rounded-2xl bg-black/60 border border-yellow-500/20 flex items-center justify-between">
                      <span className="text-[11px] text-gray-300 font-medium">
                        {language === 'ar' ? 'المبلغ الشهري :' : 'Montant mensuel :'}
                      </span>
                      <span className="font-mono font-black text-sm text-rose-400">
                        {formatMAD(rec.amount, language)}
                      </span>
                    </div>

                    <div className="text-[10px] text-gray-300 mt-2 flex items-center justify-between">
                      <span>
                        {language === 'ar' ? 'التسجيل التلقائي :' : 'Jour de génération :'}
                      </span>
                      <span className="font-mono font-bold text-white">
                        {rec.dayOfMonth} {t.expenses.dayOfMonthSuffix}
                      </span>
                    </div>

                    {rec.note && (
                      <p className="text-[11px] text-gray-300 mt-2 italic line-clamp-2">
                        {rec.note}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-yellow-500/15 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditRecurring(rec)}
                      className="p-1.5 rounded-lg bg-yellow-500/15 border border-yellow-500/30 text-[#FFD700] transition"
                      title={t.expenses.editRecurring}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingRecurring(rec)}
                      className="p-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 transition"
                      title={t.expenses.deleteRecurring}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Add / Edit Single Expense */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title={editingExpense ? t.expenses.editExpense : t.expenses.addExpense}
        maxWidth="md"
      >
        <form onSubmit={handleSaveExpense} className="space-y-4 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {t.expenses.amount} *
            </label>
            <input
              type="number"
              min="1"
              step="0.5"
              required
              value={expenseAmount || ''}
              onChange={(e) => setExpenseAmount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-neutral-100 font-mono font-bold text-sm focus:outline-hidden focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {t.expenses.category} *
            </label>
            {!isAddingNewCat ? (
              <div className="space-y-2">
                <select
                  value={expenseCategory}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setIsAddingNewCat(true);
                    } else {
                      setExpenseCategory(e.target.value);
                    }
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                >
                  {allCategoryOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                  <option value="__new__">+ {t.expenses.addCustomCategory}</option>
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder={t.expenses.newCategoryPlaceholder}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => setIsAddingNewCat(false)}
                  className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-xl text-xs"
                >
                  {t.cancel}
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {t.expenses.titleField}
            </label>
            <input
              type="text"
              value={expenseTitle}
              onChange={(e) => setExpenseTitle(e.target.value)}
              placeholder="ex: فاتورة الضو ديال شهر 9, خلاص المعلم حمزة..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {t.expenses.date} *
            </label>
            <input
              type="date"
              required
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {t.expenses.note}
            </label>
            <textarea
              rows={2}
              value={expenseNote}
              onChange={(e) => setExpenseNote(e.target.value)}
              placeholder="تفاصيل إضافية عن المصروف..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-neutral-100 focus:outline-hidden focus:border-amber-500/50 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(false)}
              className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded-xl font-bold"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl shadow-md"
            >
              {t.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add / Edit Recurring Expense */}
      <Modal
        isOpen={isRecurringModalOpen}
        onClose={() => setIsRecurringModalOpen(false)}
        title={editingRecurring ? t.expenses.editRecurring : t.expenses.addRecurring}
        maxWidth="md"
      >
        <form onSubmit={handleSaveRecurring} className="space-y-4 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {language === 'ar' ? 'اسم المصروف المتكرر *' : 'Intitulé de la charge *'}
            </label>
            <input
              type="text"
              required
              value={recurringTitle}
              onChange={(e) => setRecurringTitle(e.target.value)}
              placeholder="ex: كراء المحل, أنترنت الويفي, خلاص العامل..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {language === 'ar' ? 'المبلغ الشهري (درهم) *' : 'Montant mensuel (MAD) *'}
            </label>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={recurringAmount || ''}
              onChange={(e) => setRecurringAmount(parseFloat(e.target.value) || 0)}
              placeholder="3000"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100 font-mono font-bold text-sm focus:outline-hidden focus:border-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {t.expenses.category} *
            </label>
            {!isAddingNewCat ? (
              <select
                value={recurringCategory}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setIsAddingNewCat(true);
                  } else {
                    setRecurringCategory(e.target.value);
                  }
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
              >
                {allCategoryOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
                <option value="__new__">+ {t.expenses.addCustomCategory}</option>
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder={t.expenses.newCategoryPlaceholder}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => setIsAddingNewCat(false)}
                  className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-xl text-xs"
                >
                  {t.cancel}
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {t.expenses.dayOfMonthLabel} (1 - 28) *
            </label>
            <input
              type="number"
              min="1"
              max="28"
              required
              value={recurringDay}
              onChange={(e) => setRecurringDay(parseInt(e.target.value, 10) || 1)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              {language === 'ar'
                ? 'سيتم تسجيل هذا المصروف أوتوماتيكياً كل شهر في هذا اليوم.'
                : 'Cette dépense sera générée chaque mois le jour indiqué.'}
            </p>
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {t.expenses.note}
            </label>
            <input
              type="text"
              value={recurringNote}
              onChange={(e) => setRecurringNote(e.target.value)}
              placeholder="ملاحظة تظهر عند التسجيل التلقائي..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="rec-active"
              checked={recurringActive}
              onChange={(e) => setRecurringActive(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 bg-neutral-950 border-neutral-800"
            />
            <label htmlFor="rec-active" className="text-xs text-neutral-200 cursor-pointer font-bold">
              {t.expenses.recurringActive}
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => setIsRecurringModalOpen(false)}
              className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded-xl font-bold"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl shadow-md"
            >
              {t.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Dialog to Delete Single Expense */}
      <ConfirmDialog
        isOpen={!!deletingExpense}
        onClose={() => setDeletingExpense(null)}
        onConfirm={handleConfirmDeleteExpense}
        title={t.expenses.deleteExpense}
        message={t.expenses.confirmDelete}
        isDestructive={true}
      />

      {/* Confirm Dialog to Delete Recurring Expense */}
      <ConfirmDialog
        isOpen={!!deletingRecurring}
        onClose={() => setDeletingRecurring(null)}
        onConfirm={handleConfirmDeleteRecurring}
        title={t.expenses.deleteRecurring}
        message={t.expenses.confirmDeleteRecurring}
        isDestructive={true}
      />
    </div>
  );
};
