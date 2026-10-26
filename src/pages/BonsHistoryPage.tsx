import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  History,
  Search,
  Filter,
  Eye,
  RotateCcw,
  CreditCard,
  Printer,
  Calendar,
  AlertCircle,
  CheckCircle,
  ShieldCheck,
  Edit,
  Clock,
  Split,
  PlusCircle,
  Trash2,
  MessageCircle,
  Lock,
} from 'lucide-react';
import {
  openWhatsAppChat,
  renderWhatsAppMessage,
  DEFAULT_WHATSAPP_TEMPLATES_AR,
  DEFAULT_WHATSAPP_TEMPLATES_FR,
} from '../lib/whatsapp';
import {
  db,
  returnSaleItemTransaction,
  deleteSaleTransaction,
  registerCustomerPaymentTransaction,
  updateSaleDueDateTransaction,
  updateSaleInstallmentsTransaction,
  getStoreSettings,
  getNetTotal,
} from '../db';
import { Sale, SaleItem, Installment, ApprovalActionType } from '../types';
import { Modal } from '../components/Modal';
import { useViewMode } from '../lib/viewMode';
import { useAccessAuth } from '../lib/accessAuth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdminApprovalModal } from '../components/AdminApprovalModal';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { GlassKpiCard, GoldMoneyStack3D } from '../components/GoldenGlassUI';
import { getMoroccoDateString } from '../lib/dateUtils';
import { ScanButton } from '../components/ScanButton';
import { ReceiptPrintModal } from '../components/ReceiptPrintModal';

interface BonsHistoryPageProps {
  initialSearch?: string;
}

export const BonsHistoryPage: React.FC<BonsHistoryPageProps> = ({ initialSearch }) => {
  const { t, language } = useI18n();
  const { isMobileMode } = useViewMode();
  const { can } = useAccessAuth();
  const { success, error } = useToast();

  const [search, setSearch] = useState(initialSearch || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState(25);

  // Selected Sale for Detailed View
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [receiptPrintSale, setReceiptPrintSale] = useState<Sale | null>(null);
  const [deleteSaleTarget, setDeleteSaleTarget] = useState<Sale | null>(null);

  // Return Item Modal
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [returnItemIndex, setReturnItemIndex] = useState<number | null>(null);
  const [returnNotes, setReturnNotes] = useState('');

  // Admin Approval Gate for Worker (Delete Bon / Return Item)
  const [approvalConfig, setApprovalConfig] = useState<{
    isOpen: boolean;
    actionType: ApprovalActionType;
    targetId?: number;
    targetLabel: string;
    details: string;
    payload?: Record<string, any>;
    onApproved: () => void;
  }>({
    isOpen: false,
    actionType: 'delete_sale',
    targetLabel: '',
    details: '',
    onApproved: () => {},
  });

  const handleRequestDeleteBon = (sale: Sale) => {
    if (can('delete_records')) {
      setDeleteSaleTarget(sale);
      return;
    }
    setApprovalConfig({
      isOpen: true,
      actionType: 'delete_sale',
      targetId: sale.id,
      targetLabel: `${sale.bonNumber} (${sale.customerName})`,
      details:
        language === 'ar'
          ? `طلب حذف البون رقم ${sale.bonNumber} للزبون ${sale.customerName} (${getNetTotal(sale)} DH) وإرجاع السلعة للستوك.`
          : `Demande de suppression du bon ${sale.bonNumber} (${sale.customerName}).`,
      onApproved: () => setDeleteSaleTarget(sale),
    });
  };

  const handleRequestReturnItem = (sale: Sale, idx: number) => {
    if (can('delete_records')) {
      setReturnSale(sale);
      setReturnItemIndex(idx);
      return;
    }
    const item = sale.items[idx];
    setApprovalConfig({
      isOpen: true,
      actionType: 'return_sale_item',
      targetId: sale.id,
      targetLabel: `${sale.bonNumber} — ${item?.name || ''}`,
      details:
        language === 'ar'
          ? `طلب إرجاع المنتج "${item?.name}" من البون ${sale.bonNumber} (${item?.price} DH) إلى الستوك.`
          : `Demande de retour de l'article "${item?.name}" du bon ${sale.bonNumber}.`,
      payload: { itemIndex: idx, notes: 'Retour approuvé par Admin' },
      onApproved: () => {
        setReturnSale(sale);
        setReturnItemIndex(idx);
      },
    });
  };

  // Register Payment Modal
  const [paymentSale, setPaymentSale] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState('');

  // Edit Due Date Modal
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [editDueDateVal, setEditDueDateVal] = useState('');
  const [editDueDateReason, setEditDueDateReason] = useState('');

  // Edit Installments Modal
  const [isEditingInstallments, setIsEditingInstallments] = useState(false);
  const [tempInstallments, setTempInstallments] = useState<Installment[]>([]);
  const [editInstallmentsReason, setEditInstallmentsReason] = useState('');
  const [splitCount, setSplitCount] = useState<number>(3);
  const [splitFreq, setSplitFreq] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');

  // Live queries
  const sales =
    useLiveQuery(async () => {
      const all = await db.sales.orderBy('id').reverse().toArray();
      return all.filter((s) => !s.deleted_at);
    }, []) || [];

  // Print PDF helper (Dynamic import - Partie 1 #11)
  const handlePrintPdf = async (sale: Sale) => {
    try {
      const settings = await getStoreSettings();
      const { generateBonPDF } = await import('../lib/pdfGenerator');
      await generateBonPDF(sale, settings, 'save');
      success(`Facture PDF générée pour le bon ${sale.bonNumber}`);
    } catch {
      error("Erreur lors de la génération de la facture PDF.");
    }
  };

  // Print Warranty Certificate helper (Dynamic import - Partie 1 #11)
  const handlePrintWarrantyPdf = async (sale: Sale) => {
    try {
      const settings = await getStoreSettings();
      const { generateWarrantyPDF } = await import('../lib/pdfGenerator');
      await generateWarrantyPDF(sale, settings, 'save');
      success(`Certificat de garantie généré pour le bon ${sale.bonNumber}`);
    } catch {
      error("Erreur lors de la génération du certificat de garantie.");
    }
  };

  // Send WhatsApp receipt details
  const handleSendWhatsApp = async (sale: Sale) => {
    if (!sale.customerPhone || !sale.customerPhone.trim()) {
      error(t.whatsapp.noPhoneAlert);
      return;
    }

    try {
      const settings = await getStoreSettings();
      const templates = settings.whatsappTemplates || {};
      const fallbackTemplates =
        language === 'ar' ? DEFAULT_WHATSAPP_TEMPLATES_AR : DEFAULT_WHATSAPP_TEMPLATES_FR;
      const template = templates.saleReceipt || fallbackTemplates.saleReceipt;

      const text = renderWhatsAppMessage(template, {
        clientName: sale.customerName,
        bonNumber: sale.bonNumber,
        total: getNetTotal(sale),
        remaining: sale.remainingAmount,
        storeName: settings.storeName || (language === 'ar' ? 'المحل' : 'Le magasin'),
      });

      const opened = openWhatsAppChat(sale.customerPhone, text);
      if (opened) {
        success(language === 'ar' ? 'تم فتح تطبيق واتساب بنجاح.' : 'Discussion WhatsApp ouverte avec succès.');
      } else {
        error(language === 'ar' ? 'رقم الهاتف غير صالح للمراسلة عبر واتساب.' : 'Numéro de téléphone non valide pour WhatsApp.');
      }
    } catch {
      error(language === 'ar' ? 'حدث خطأ أثناء فتح واتساب.' : "Erreur lors de l'ouverture de WhatsApp.");
    }
  };

  // Confirm Return Item
  const handleConfirmReturn = async () => {
    if (!returnSale || returnItemIndex === null || !returnSale.id) return;
    try {
      await returnSaleItemTransaction(returnSale.id, returnItemIndex, returnNotes);
      success("Article retourné. Le stock et le crédit client ont été ajustés.");
      setReturnSale(null);
      setReturnItemIndex(null);
      setReturnNotes('');
      // update viewSale if currently viewing
      if (viewSale && viewSale.id === returnSale.id) {
        const updated = await db.sales.get(returnSale.id);
        if (updated) setViewSale(updated);
      }
    } catch (err: any) {
      error(err.message || "Erreur lors du retour de l'article.");
    }
  };

  // Submit Payment for Sale with remaining balance
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentSale || !paymentSale.customerId || paymentAmount <= 0) return;
    try {
      await registerCustomerPaymentTransaction(
        paymentSale.customerId,
        paymentAmount,
        getMoroccoDateString(),
        paymentNote || `Versement pour Bon ${paymentSale.bonNumber}`,
        paymentSale.id
      );
      success(t.bons.paymentSuccess);
      setPaymentSale(null);
      setPaymentAmount(0);
      setPaymentNote('');
    } catch (err: any) {
      error(err.message || "Erreur lors du versement.");
    }
  };

  // 1. Save Edited Due Date (with Audit Log)
  const handleSaveDueDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewSale || !viewSale.id || !editDueDateVal) return;
    if (!editDueDateReason.trim()) {
      error("Un motif est obligatoire pour modifier la date d'échéance.");
      return;
    }
    try {
      await updateSaleDueDateTransaction(viewSale.id, editDueDateVal, editDueDateReason);
      const updated = await db.sales.get(viewSale.id);
      if (updated) setViewSale(updated);
      success("Date d'échéance mise à jour et enregistrée dans l'historique.");
      setIsEditingDueDate(false);
      setEditDueDateReason('');
    } catch (err: any) {
      error(err.message || "Erreur lors de la mise à jour de l'échéance.");
    }
  };

  // 2. Save Edited Installments Schedule (with Audit Log)
  const handleSaveInstallments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewSale || !viewSale.id) return;
    if (!editInstallmentsReason.trim()) {
      error("Un motif est obligatoire pour enregistrer l'échéancier.");
      return;
    }
    const sum = tempInstallments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    if (sum > viewSale.remainingAmount + 0.01) {
      error(`Le total (${sum} DH) ne peut pas dépasser le reste à payer (${viewSale.remainingAmount} DH).`);
      return;
    }
    for (const inst of tempInstallments) {
      if ((Number(inst.amount) || 0) <= 0) {
        error("Chaque tranche doit avoir un montant supérieur à 0.");
        return;
      }
    }
    try {
      await updateSaleInstallmentsTransaction(viewSale.id, tempInstallments, editInstallmentsReason);
      const updated = await db.sales.get(viewSale.id);
      if (updated) setViewSale(updated);
      success("Échéancier enregistré et consigné dans l'historique.");
      setIsEditingInstallments(false);
      setEditInstallmentsReason('');
    } catch (err: any) {
      error(err.message || "Erreur lors de la mise à jour de l'échéancier.");
    }
  };

  // Helper: Open Installments editor with current sale's installments
  const handleOpenInstallmentsEditor = () => {
    if (!viewSale) return;
    setTempInstallments(viewSale.installments ? JSON.parse(JSON.stringify(viewSale.installments)) : []);
    setEditInstallmentsReason('');
    setIsEditingInstallments(true);
  };

  // Helper: Auto-split inside editor
  const handleTempAutoSplit = () => {
    if (!viewSale || viewSale.remainingAmount <= 0) return;
    const count = Math.max(1, splitCount);
    const baseAmount = Math.floor(viewSale.remainingAmount / count);
    const remainder = viewSale.remainingAmount - (baseAmount * count);
    const intervalDays = splitFreq === 'weekly' ? 7 : splitFreq === 'biweekly' ? 15 : 30;

    const generated: Installment[] = [];
    for (let i = 0; i < count; i++) {
      const d = new Date();
      d.setDate(d.getDate() + intervalDays * (i + 1));
      const trancheAmount = i === count - 1 ? baseAmount + remainder : baseAmount;
      generated.push({
        id: `inst_${Date.now()}_${i}`,
        amount: trancheAmount,
        dueDate: getMoroccoDateString(d),
        paid: false,
        note: `Tranche ${i + 1}/${count}`,
      });
    }
    setTempInstallments(generated);
  };

  // Filter Sales
  const filteredSales = sales.filter((s) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.bonNumber.toLowerCase().includes(q) ||
      (s.provisionalNumber && s.provisionalNumber.toLowerCase().includes(q)) ||
      s.customerName.toLowerCase().includes(q) ||
      (s.customerPhone && s.customerPhone.includes(q)) ||
      s.items.some((i) => i.name.toLowerCase().includes(q) || (i.imei && i.imei.includes(q)));

    const matchesDate = !dateFilter || s.date === dateFilter;

    let matchesStatus = true;
    if (statusFilter === 'paid') {
      matchesStatus = s.remainingAmount === 0 && s.status !== 'returned';
    } else if (statusFilter === 'credit') {
      matchesStatus = s.remainingAmount > 0;
    } else if (statusFilter === 'returned') {
      matchesStatus = s.status === 'returned' || s.status === 'partially_returned';
    }

    return matchesSearch && matchesDate && matchesStatus;
  });

  const paginatedSales = filteredSales.slice(0, visibleCount);

  const totalOrdersAmount = filteredSales.reduce((acc, s) => acc + getNetTotal(s), 0);
  const totalOrdersPaid = filteredSales.reduce((acc, s) => acc + (s.paidAmount || 0), 0);
  const totalOrdersRemaining = filteredSales.reduce((acc, s) => acc + (s.remainingAmount || 0), 0);

  return (
    <div className="space-y-4">
      {/* 3 Top 3D Gold KPI Cards — Visible to Admin Only (Worker never sees financial totals) */}
      {can('view_financial_dashboard') && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassKpiCard
            title={language === 'ar' ? 'إجمالي المبيعات والطلبات' : 'Total des Ventes & Bons'}
            value={formatMAD(totalOrdersAmount, language)}
            subtitle={`${language === 'ar' ? 'عدد الوصولات:' : 'Nombre de bons:'} ${filteredSales.length}`}
            variant="gold"
            iconType="money"
          />
          <GlassKpiCard
            title={language === 'ar' ? 'المبالغ المستخلصة نقداً' : 'Total Encaissé'}
            value={formatMAD(totalOrdersPaid, language)}
            subtitle={`${filteredSales.filter((s) => s.remainingAmount === 0).length} ${language === 'ar' ? 'وصل خالص' : 'bons soldés'}`}
            variant="green"
            iconType="trend"
          />
          <GlassKpiCard
            title={language === 'ar' ? 'الباقي كريدي عند الزبناء' : 'Reste Crédit Clients'}
            value={formatMAD(totalOrdersRemaining, language)}
            subtitle={`${filteredSales.filter((s) => s.remainingAmount > 0).length} ${language === 'ar' ? 'وصل بالكريدي' : 'bons à crédit'}`}
            variant="white"
            iconType="box"
          />
        </div>
      )}

      {/* Filter Strip — Glass Card */}
      <div className="relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-3 p-5 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
        {/* Search + Camera Scan */}
        <div className="flex items-center gap-2 w-full md:w-96">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#FFD700] absolute start-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° Bon, Client, IMEI, Produit..."
              className="w-full bg-black/60 border border-yellow-500/25 rounded-full ps-10 pe-4 py-2.5 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:border-[#FFD700]"
            />
          </div>
          <ScanButton
            onScan={(code) => setSearch(code.trim())}
            mode="any"
            size="md"
          />
        </div>

        {/* Date & Status Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-black/60 border border-yellow-500/25 rounded-full px-3.5 py-2 text-xs text-white focus:outline-hidden"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-[10px] text-[#FFD700] ps-1 hover:underline"
              >
                Effacer
              </button>
            )}
          </div>

          {/* Status buttons */}
          <div className="flex items-center gap-1 bg-black/60 p-1 rounded-full border border-yellow-500/25 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-full transition font-bold ${
                statusFilter === 'all'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {t.all}
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-1.5 rounded-full transition font-bold ${
                statusFilter === 'paid'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {t.bons.allPaid}
            </button>
            <button
              onClick={() => setStatusFilter('credit')}
              className={`px-3 py-1.5 rounded-full transition font-bold ${
                statusFilter === 'credit'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {t.bons.hasCredit}
            </button>
            <button
              onClick={() => setStatusFilter('returned')}
              className={`px-3 py-1.5 rounded-full transition font-bold ${
                statusFilter === 'returned'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {t.bons.returnedStatus}
            </button>
          </div>
        </div>
      </div>

      {/* Sales Glassmorphism Table / Cards */}
      <div className="relative overflow-hidden rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
        {filteredSales.length === 0 ? (
          <div className="py-16 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-3">
            <GoldMoneyStack3D className="w-16 h-16" />
            <p className="text-sm font-bold text-white">
              {search
                ? (language === 'ar' ? 'ما كاين حتى بون بهاد البحث' : 'Aucun bon trouvé pour cette recherche')
                : (language === 'ar' ? 'ما كاين والو، دير أول عملية بيع فـ الكاسة' : 'Aucun bon de vente enregistré pour le moment')}
            </p>
          </div>
        ) : isMobileMode ? (
          /* Mobile Mode: Vertical Touch-Friendly Glass Cards */
          <div className="p-4 space-y-3">
            {paginatedSales.map((sale) => (
              <div
                key={sale.id}
                className="p-4 rounded-[20px] bg-black/60 border border-yellow-500/20 space-y-3 shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-[#FFD700] text-sm">{sale.bonNumber}</span>
                    {sale.status === 'returned' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        {t.bons.returnedStatus}
                      </span>
                    ) : sale.status === 'partially_returned' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-[#FFD700] border border-yellow-500/30">
                        Partiel
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-gray-300 font-mono">{sale.date}</span>
                </div>

                <div className="flex items-center justify-between border-b border-yellow-500/15 pb-2">
                  <div>
                    <div className="font-bold text-sm text-white">{sale.customerName}</div>
                    {sale.customerPhone && (
                      <div className="text-xs text-gray-300 font-mono mt-0.5">{sale.customerPhone}</div>
                    )}
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-[#FFD700] font-bold">
                    {sale.items.length} {language === 'ar' ? 'مواد' : 'articles'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center py-2 bg-black/60 rounded-2xl p-2 border border-yellow-500/20">
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">{t.total}</div>
                    <div className="font-mono font-black text-sm text-[#FFD700] mt-0.5">
                      {formatMAD(getNetTotal(sale), language)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#22c55e] uppercase font-semibold">{t.paid}</div>
                    <div className="font-mono font-bold text-sm text-[#22c55e] mt-0.5">
                      {formatMAD(sale.paidAmount, language)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-rose-400 uppercase font-semibold">{t.remaining}</div>
                    <div className="font-mono font-bold text-sm text-rose-400 mt-0.5">
                      {formatMAD(sale.remainingAmount, language)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setViewSale(sale)}
                    className="py-2.5 px-3 rounded-full bg-black/70 hover:bg-black/90 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-yellow-500/25 transition active:scale-95 min-h-[44px]"
                  >
                    <Eye className="w-4 h-4 text-[#FFD700]" />
                    <span>{language === 'ar' ? 'التفاصيل' : 'Détails'}</span>
                  </button>

                  <button
                    onClick={() => setReceiptPrintSale(sale)}
                    className="py-2.5 px-3 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm min-h-[44px]"
                  >
                    <Printer className="w-4 h-4" />
                    <span>{language === 'ar' ? 'معاينة / طباعة' : 'Aperçu / Imprimer'}</span>
                  </button>

                  <button
                    onClick={() => handleSendWhatsApp(sale)}
                    className="col-span-2 py-2.5 px-3 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm min-h-[44px]"
                    title={t.whatsapp.sendReceipt}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{language === 'ar' ? 'إرسال تفاصيل الوصل بالواتساب' : 'Envoyer détails via WhatsApp'}</span>
                  </button>

                  {sale.remainingAmount > 0 && sale.customerId && (
                    <button
                      onClick={() => {
                        setPaymentSale(sale);
                        setPaymentAmount(sale.remainingAmount);
                      }}
                      className="col-span-2 py-2.5 px-3 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-[#22c55e] border border-emerald-500/40 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 min-h-[44px]"
                    >
                      <CreditCard className="w-4 h-4 text-[#22c55e]" />
                      <span>{t.bons.registerPayment} ({formatMAD(sale.remainingAmount, language)})</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop Mode: Wide Glassmorphism Table */
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-black/70 text-[#FFD700] uppercase text-[11px] font-black tracking-wider border-b border-yellow-500/25">
                <tr>
                  <th className="py-3.5 px-4 text-start">{t.bons.bonNumber}</th>
                  <th className="py-3.5 px-4 text-start">{t.date}</th>
                  <th className="py-3.5 px-4 text-start">{t.bons.client}</th>
                  <th className="py-3.5 px-4 text-center">{t.bons.itemsCount}</th>
                  <th className="py-3.5 px-4 text-end">{t.total}</th>
                  <th className="py-3.5 px-4 text-end">{t.paid}</th>
                  <th className="py-3.5 px-4 text-end">{t.remaining}</th>
                  <th className="py-3.5 px-4 text-center">{t.status}</th>
                  <th className="py-3.5 px-4 text-center">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-500/15">
                {paginatedSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-yellow-500/10 transition">
                    <td className="py-3.5 px-4 font-mono font-black text-[#FFD700] whitespace-nowrap">
                      {sale.bonNumber}
                    </td>
                    <td className="py-3.5 px-4 text-gray-300 whitespace-nowrap">
                      <div>{sale.date}</div>
                      {sale.remainingAmount > 0 && sale.dueDate && (() => {
                        const todayStr = getMoroccoDateString();
                        const in7Days = new Date();
                        in7Days.setDate(in7Days.getDate() + 7);
                        const in7DaysStr = getMoroccoDateString(in7Days);
                        const isLate = sale.dueDate < todayStr;
                        const isSoon = !isLate && sale.dueDate <= in7DaysStr;
                        return (
                          <div className="mt-1">
                            <span
                              className={`inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                                isLate
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
                                  : isSoon
                                  ? 'bg-yellow-500/20 text-[#FFD700] border-yellow-500/40 font-medium'
                                  : 'bg-black/60 text-gray-300 border-yellow-500/20'
                              }`}
                            >
                              <Clock className="w-2.5 h-2.5" />
                              <span>{sale.dueDate}</span>
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">
                      <div>{sale.customerName}</div>
                      {sale.customerPhone && (
                        <div className="text-[10px] text-gray-400 font-mono">
                          {sale.customerPhone}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-gray-200 font-bold">
                      {sale.items.length}
                    </td>
                    <td className="py-3.5 px-4 text-end font-mono font-black text-[#FFD700] whitespace-nowrap">
                      {formatMAD(getNetTotal(sale), language)}
                    </td>
                    <td className="py-3.5 px-4 text-end font-mono font-bold text-[#22c55e] whitespace-nowrap">
                      {formatMAD(sale.paidAmount, language)}
                    </td>
                    <td className="py-3.5 px-4 text-end font-mono whitespace-nowrap">
                      {sale.remainingAmount > 0 ? (
                        <span className="font-bold text-rose-400">
                          {formatMAD(sale.remainingAmount, language)}
                        </span>
                      ) : (
                        <span className="text-[#22c55e] font-bold">0 DH</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {sale.status === 'returned' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          Retourné
                        </span>
                      ) : sale.status === 'partially_returned' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/20 text-[#FFD700] border border-yellow-500/30">
                          Partiel Retour
                        </span>
                      ) : sale.remainingAmount > 0 ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-[#FFD700] border border-yellow-500/30">
                          Crédit
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-[#22c55e] border border-emerald-500/30">
                          Soldé
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setViewSale(sale)}
                          className="p-1.5 rounded-lg bg-black/50 text-gray-300 hover:text-[#FFD700] border border-yellow-500/20 transition"
                          title="Détails du bon"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setReceiptPrintSale(sale)}
                          className="p-1.5 rounded-lg bg-yellow-500/15 text-[#FFD700] hover:bg-yellow-500/25 border border-yellow-500/30 transition"
                          title={language === 'ar' ? 'معاينة وطباعة الوصل (58mm/80mm/A4)' : 'Aperçu & Imprimer Reçu (58mm/80mm/A4)'}
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleSendWhatsApp(sale)}
                          className="p-1.5 rounded-lg bg-emerald-500/15 text-[#22c55e] hover:bg-emerald-500/25 border border-emerald-500/30 transition"
                          title={language === 'ar' ? 'إرسال تفاصيل الوصل بالواتساب' : 'Envoyer détails via WhatsApp'}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                        {(sale.hasWarranty || (sale.warrantyMonths && sale.warrantyMonths > 0)) && (
                          <button
                            onClick={() => handlePrintWarrantyPdf(sale)}
                            className="p-1.5 rounded-lg bg-emerald-500/15 text-[#22c55e] hover:bg-emerald-500/25 border border-emerald-500/30 transition"
                            title="Imprimer Certificat de Garantie A4"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        )}
                        {sale.remainingAmount > 0 && sale.customerId && (
                          <button
                            onClick={() => {
                              setPaymentSale(sale);
                              setPaymentAmount(sale.remainingAmount);
                            }}
                            className="p-1.5 rounded-lg bg-emerald-500/15 text-[#22c55e] hover:bg-emerald-500/25 border border-emerald-500/30 transition"
                            title={t.bons.registerPayment}
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRequestDeleteBon(sale)}
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition flex items-center gap-0.5"
                          title={language === 'ar' ? 'حذف البون' : 'Supprimer le bon'}
                        >
                          {!can('delete_records') && <Lock className="w-2.5 h-2.5" />}
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Load More Pagination (Partie 1 #11) */}
      {filteredSales.length > visibleCount && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 25)}
            className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-amber-500/30 text-amber-400 text-xs font-bold transition"
          >
            {language === 'ar'
              ? `عرض المزيد (${filteredSales.length - visibleCount} متبقية)`
              : `Voir plus (${filteredSales.length - visibleCount} restants)`}
          </button>
        </div>
      )}

      {/* Detailed Bon View Modal */}
      {viewSale && (
        <Modal
          isOpen={!!viewSale}
          onClose={() => setViewSale(null)}
          title={`Détail Bon : ${viewSale.bonNumber}`}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-neutral-950 border border-neutral-800">
              <div>
                <span className="text-neutral-500 block">Date</span>
                <span className="font-semibold text-neutral-200">{viewSale.date}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Client</span>
                <span className="font-semibold text-neutral-200">{viewSale.customerName}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Règlement</span>
                <span className="font-semibold text-neutral-200 capitalize">{viewSale.paymentType}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Garantie Magasin</span>
                <span className={`font-semibold ${(viewSale.hasWarranty || (viewSale.warrantyMonths && viewSale.warrantyMonths > 0)) ? 'text-amber-400' : 'text-neutral-500'}`}>
                  {(viewSale.hasWarranty || (viewSale.warrantyMonths && viewSale.warrantyMonths > 0))
                    ? `${viewSale.warrantyMonths} mois`
                    : 'Sans garantie'}
                </span>
              </div>
            </div>

            {/* Items list with individual Return action */}
            <div>
              <h4 className="font-bold text-neutral-200 mb-2">Articles vendus</h4>
              <div className="space-y-2">
                {viewSale.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-neutral-800/60 border border-neutral-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-neutral-100 flex items-center gap-2">
                        <span>{item.name}</span>
                        {item.isReturned && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-400">
                            RETOURNÉ
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-3">
                        {item.imei && <span className="font-mono text-amber-300">IMEI: {item.imei}</span>}
                        <span>Qté: {item.quantity}</span>
                        <span>@ {formatMAD(item.price, language)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-neutral-100">
                        {formatMAD(item.price * item.quantity, language)}
                      </span>
                      {!item.isReturned && viewSale.status !== 'returned' && (
                        <button
                          type="button"
                          onClick={() => handleRequestReturnItem(viewSale, idx)}
                          className="px-2 py-1 text-[11px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/30 transition flex items-center gap-1"
                          title="Retourner cet article"
                        >
                          {!can('delete_records') && <Lock className="w-2.5 h-2.5" />}
                          <RotateCcw className="w-3 h-3" />
                          <span>Retour</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary with Discount Support */}
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1.5 text-xs font-mono">
              {viewSale.discountAmount && viewSale.discountAmount > 0 ? (
                <div className="flex justify-between items-center text-neutral-400 pb-1 border-b border-neutral-800/80">
                  <span>Sous-total : {formatMAD(viewSale.subtotal ?? (viewSale.totalAmount + viewSale.discountAmount), language)}</span>
                  <span className="text-rose-400 font-semibold">
                    Remise {viewSale.discountType === 'percent' && viewSale.discountValue ? `(${viewSale.discountValue}%)` : ''} : - {formatMAD(viewSale.discountAmount, language)}
                  </span>
                </div>
              ) : null}

              {viewSale.returns && viewSale.returns.length > 0 ? (
                <div className="flex justify-between items-center text-rose-400 pb-1 border-b border-neutral-800/80">
                  <span>Total initial : {formatMAD(viewSale.originalTotalAmount ?? viewSale.totalAmount, language)}</span>
                  <span className="font-semibold">
                    Retours ({viewSale.returns.length}) : -{' '}
                    {formatMAD(
                      viewSale.returns.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
                      language
                    )}
                  </span>
                </div>
              ) : null}

              <div className="flex justify-between items-center pt-0.5">
                <span className="text-neutral-300 font-bold">Total Net : <strong className="text-amber-400">{formatMAD(getNetTotal(viewSale), language)}</strong></span>
                <span className="text-emerald-400">Payé : <strong>{formatMAD(viewSale.paidAmount, language)}</strong></span>
                <span className={viewSale.remainingAmount > 0 ? 'text-rose-400 font-bold' : 'text-neutral-400'}>
                  Reste : <strong>{formatMAD(viewSale.remainingAmount, language)}</strong>
                </span>
              </div>
            </div>

            {viewSale.notes && (
              <div className="p-2.5 rounded bg-neutral-950 text-neutral-400 text-xs italic">
                Notes : {viewSale.notes}
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReceiptPrintSale(viewSale)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {language === 'ar'
                    ? 'معاينة وطباعة (58mm / 80mm / A4)'
                    : 'Aperçu & Imprimer (58mm / 80mm / A4)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handlePrintPdf(viewSale)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 font-bold text-xs"
              >
                <Printer className="w-4 h-4" />
                <span>PDF (A4)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendWhatsApp(viewSale)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-xs shadow-sm transition active:scale-95"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{language === 'ar' ? 'إرسال بالواتساب' : 'Envoyer par WhatsApp'}</span>
              </button>

              {(viewSale.hasWarranty || (viewSale.warrantyMonths && viewSale.warrantyMonths > 0)) && (
                <button
                  type="button"
                  onClick={() => handlePrintWarrantyPdf(viewSale)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Imprimer Garantie (A4)</span>
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Return Item Confirm Modal */}
      {returnSale && returnItemIndex !== null && (
        <Modal
          isOpen={true}
          onClose={() => {
            setReturnSale(null);
            setReturnItemIndex(null);
          }}
          title={t.bons.returnItems}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">Confirmation de retour article</p>
                <p className="mt-1 text-neutral-300 text-[11px] leading-relaxed">
                  {t.bons.returnConfirm}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
              <span className="text-neutral-400">Article concerné : </span>
              <span className="font-bold text-neutral-100">
                {returnSale.items[returnItemIndex]?.name}
              </span>
              {returnSale.items[returnItemIndex]?.imei && (
                <div className="font-mono text-amber-400 mt-1">
                  IMEI: {returnSale.items[returnItemIndex]?.imei}
                </div>
              )}
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Motif du retour</label>
              <input
                type="text"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="ex: Changement d'avis client, défaut appareil..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setReturnSale(null);
                  setReturnItemIndex(null);
                }}
                className="px-3 py-2 rounded-lg bg-neutral-800 text-neutral-300"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 font-bold text-white shadow-sm"
              >
                Confirmer le retour
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Register Payment Modal */}
      {paymentSale && (
        <Modal
          isOpen={true}
          onClose={() => setPaymentSale(null)}
          title={`Encaisser un Paiement - Bon ${paymentSale.bonNumber}`}
          maxWidth="md"
        >
          <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center font-mono">
              <span className="text-neutral-400">Solde restant sur ce bon :</span>
              <span className="font-bold text-rose-400 text-sm">
                {formatMAD(paymentSale.remainingAmount, language)}
              </span>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                {t.bons.paymentAmount} (DH) *
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                max={paymentSale.remainingAmount}
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono font-bold text-emerald-400"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                Note / Référence versement
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="ex: Espèces reçu au comptoir..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentSale(null)}
                className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-lg"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm"
              >
                Enregistrer le versement
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Thermal & Browser Receipt Preview / Print Modal */}
      <ReceiptPrintModal
        isOpen={!!receiptPrintSale}
        onClose={() => setReceiptPrintSale(null)}
        sale={receiptPrintSale}
      />

      {/* Delete Bon Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteSaleTarget}
        onClose={() => setDeleteSaleTarget(null)}
        onConfirm={async () => {
          if (!deleteSaleTarget?.id) return;
          try {
            await deleteSaleTransaction(deleteSaleTarget.id);
            success(`Bon ${deleteSaleTarget.bonNumber} supprimé.`);
            if (viewSale?.id === deleteSaleTarget.id) setViewSale(null);
            setDeleteSaleTarget(null);
          } catch (err: any) {
            error(err.message || 'Erreur lors de la suppression du bon.');
          }
        }}
        title={`Supprimer le bon ${deleteSaleTarget?.bonNumber || ''}`}
        message="Cette action supprimera le bon, remettra en stock les articles non retournés et ajustera le crédit client."
        isDestructive={true}
      />

      {/* Admin Approval Modal for Worker (Return Item / Delete Bon) */}
      <AdminApprovalModal
        isOpen={approvalConfig.isOpen}
        onClose={() => setApprovalConfig((prev) => ({ ...prev, isOpen: false }))}
        actionType={approvalConfig.actionType}
        targetId={approvalConfig.targetId}
        targetLabel={approvalConfig.targetLabel}
        details={approvalConfig.details}
        payload={approvalConfig.payload}
        onApproved={approvalConfig.onApproved}
      />
    </div>
  );
};
