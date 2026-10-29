import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Users,
  Search,
  Plus,
  CreditCard,
  History,
  Edit,
  Trash2,
  Phone,
  MapPin,
  MessageCircle,
  BellRing,
  AlertTriangle,
  CalendarClock,
  FileText,
} from 'lucide-react';
import {
  db,
  registerCustomerPaymentAdvancedTransaction,
  getStoreSettings,
  withSyncMetadata,
  queueOutboxOperation,
  logShopActivity,
  getNetTotal,
} from '../db';
import { Customer, PaymentMethod } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { useViewMode } from '../lib/viewMode';
import { useAccessAuth } from '../lib/accessAuth';
import { getMoroccoDateString } from '../lib/dateUtils';
import {
  openWhatsAppChat,
  renderWhatsAppMessage,
  DEFAULT_WHATSAPP_TEMPLATES_AR,
  DEFAULT_WHATSAPP_TEMPLATES_FR,
} from '../lib/whatsapp';

interface CustomersPageProps {
  initialSearch?: string;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({ initialSearch }) => {
  const { t, language } = useI18n();
  const { success, error } = useToast();
  const { isMobileMode } = useViewMode();
  const { can } = useAccessAuth();
  const isAr = language === 'ar';

  const [search, setSearch] = useState(initialSearch || '');
  const [showOverduePanel, setShowOverduePanel] = useState(false);

  // Add / Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cin, setCin] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState<string>('');

  // Payment Modal
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [fifoSurplusWarning, setFifoSurplusWarning] = useState<{
    surplus: number;
    message: string;
  } | null>(null);

  // Payment History & Installments Modal
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  // Delete Customer
  const [deleteCustomerId, setDeleteCustomerId] = useState<number | null>(null);

  // Live queries (exclude soft-deleted records)
  const customers =
    useLiveQuery(async () => {
      const all = await db.customers.toArray();
      return all.filter((c) => !c.deleted_at);
    }, []) || [];
  const payments =
    useLiveQuery(async () => {
      const all = await db.customerPayments.toArray();
      return all.filter((p) => !p.deleted_at);
    }, []) || [];
  const sales =
    useLiveQuery(async () => {
      const all = await db.sales.toArray();
      return all.filter((s) => !s.deleted_at);
    }, []) || [];

  const todayStr = getMoroccoDateString();

  // Compute overdue credits for "Relances du jour" (Partie 3 #6)
  const overdueReminders = useMemo(() => {
    const list: {
      customer: Customer;
      overdueAmount: number;
      earliestDueDate: string;
      bonNumbers: string[];
    }[] = [];

    for (const cust of customers) {
      if (!cust.id || (cust.totalCredit || 0) <= 0) continue;
      const custSales = sales.filter(
        (s) => s.customerId === cust.id && s.status !== 'returned' && s.remainingAmount > 0
      );

      let overdueAmt = 0;
      let earliestDue = '';
      const bons: string[] = [];

      for (const s of custSales) {
        let bonOverdue = 0;
        if (s.installments && s.installments.length > 0) {
          for (const inst of s.installments) {
            if (!inst.paid && inst.dueDate && inst.dueDate <= todayStr) {
              const remInst = Math.max(0, inst.amount - (inst.paidAmount || 0));
              bonOverdue += remInst;
              if (!earliestDue || inst.dueDate < earliestDue) {
                earliestDue = inst.dueDate;
              }
            }
          }
        } else if (s.dueDate && s.dueDate <= todayStr) {
          bonOverdue += s.remainingAmount;
          if (!earliestDue || s.dueDate < earliestDue) {
            earliestDue = s.dueDate;
          }
        }

        if (bonOverdue > 0) {
          overdueAmt += Math.min(bonOverdue, s.remainingAmount);
          bons.push(s.bonNumber);
        }
      }

      if (overdueAmt > 0) {
        list.push({
          customer: cust,
          overdueAmount: Math.round(overdueAmt * 100) / 100,
          earliestDueDate: earliestDue,
          bonNumbers: bons,
        });
      }
    }

    return list.sort((a, b) => a.earliestDueDate.localeCompare(b.earliestDueDate));
  }, [customers, sales, todayStr]);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setCin('');
    setAddress('');
    setCreditLimit('');
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setCin(c.CIN || '');
    setAddress(c.address || '');
    setCreditLimit(c.creditLimit ? String(c.creditLimit) : '');
    setIsEditModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      error(isAr ? 'الاسم ورقم الهاتف إجباريان.' : 'Nom et numéro de téléphone obligatoires.');
      return;
    }

    const parsedLimit = parseFloat(creditLimit);

    try {
      if (editingCustomer?.id) {
        const existing = await db.customers.get(editingCustomer.id);
        if (existing) {
          const updated = withSyncMetadata({
            ...existing,
            name: name.trim(),
            phone: phone.trim(),
            CIN: cin.trim() || undefined,
            address: address.trim() || undefined,
            creditLimit: !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
          });
          await db.customers.put(updated);
          await queueOutboxOperation('customers', 'update', updated);
        }
        success(isAr ? 'تم تحديث بيانات الزبون.' : 'Fiche client mise à jour.');
      } else {
        const created = withSyncMetadata<Customer>({
          name: name.trim(),
          phone: phone.trim(),
          CIN: cin.trim() || undefined,
          address: address.trim() || undefined,
          creditLimit: !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
          totalCredit: 0,
        });
        const id = await db.customers.add(created);
        await queueOutboxOperation('customers', 'insert', { ...created, id });
        success(isAr ? 'تمت إضافة الزبون بنجاح.' : 'Nouveau client ajouté.');
      }
      setIsEditModalOpen(false);
    } catch {
      error(isAr ? 'خطأ أثناء حفظ الزبون.' : "Erreur lors de l'enregistrement du client.");
    }
  };

  const executePayment = async (allowFifoSurplus: boolean) => {
    if (!paymentCustomer?.id) return;
    if ((paymentCustomer.totalCredit || 0) <= 0) {
      error(
        isAr
          ? 'هذا الزبون ليس عليه أي كريدي حالياً (0 درهم).'
          : "Ce client n'a aucun crédit dû (0 DH). Impossible d'enregistrer un versement."
      );
      return;
    }
    if (paymentAmount <= 0) {
      error(isAr ? 'يجب أن يكون مبلغ الدفعة أكبر من 0.' : 'Le montant doit être supérieur à zéro.');
      return;
    }
    if (paymentAmount > paymentCustomer.totalCredit + 0.01) {
      error(
        isAr
          ? `المبلغ المدخل (${paymentAmount} درهم) يتجاوز مجموع الدين (${paymentCustomer.totalCredit} درهم).`
          : `Le montant (${paymentAmount} DH) dépasse le crédit total dû (${paymentCustomer.totalCredit} DH).`
      );
      return;
    }

    try {
      await registerCustomerPaymentAdvancedTransaction({
        customerId: paymentCustomer.id,
        amount: paymentAmount,
        date: getMoroccoDateString(),
        note: paymentNote.trim() || 'Règlement crédit au magasin',
        paymentMethod,
        applyMode: 'fifo',
        allowFifoSurplus,
      });
      success(isAr ? 'تم تسجيل دفعة الزبون بنجاح.' : 'Versement client enregistré avec succès.');
      setPaymentCustomer(null);
      setPaymentAmount(0);
      setPaymentNote('');
      setFifoSurplusWarning(null);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.startsWith('FIFO_SURPLUS:')) {
        const parts = msg.split(':');
        const surplusVal = parseFloat(parts[1]) || 0;
        const detailMsg = parts.slice(2).join(':');
        setFifoSurplusWarning({
          surplus: surplusVal,
          message: detailMsg,
        });
        return;
      }
      error(msg || (isAr ? 'خطأ أثناء تسجيل الدفعة.' : "Erreur lors de l'enregistrement du versement."));
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    await executePayment(false);
  };

  const handleDeleteCustomer = async () => {
    if (!deleteCustomerId) return;
    if (!can('delete_records')) {
      error(isAr ? 'غير مسموح للمستخدم بحذف الزبناء.' : 'Action réservée au propriétaire.');
      setDeleteCustomerId(null);
      return;
    }
    try {
      const hasSales = sales.some((s) => s.customerId === deleteCustomerId);
      if (hasSales) {
        error(
          isAr
            ? 'لا يمكن حذف هذا الزبون لأن لديه وصولات بيع مسجلة.'
            : 'Impossible de supprimer ce client car des bons de vente y sont associés.'
        );
        setDeleteCustomerId(null);
        return;
      }
      const existing = await db.customers.get(deleteCustomerId);
      await db.customers.delete(deleteCustomerId);
      if (existing?.uuid) {
        await queueOutboxOperation('customers', 'delete', {
          uuid: existing.uuid,
          deleted_at: new Date().toISOString(),
        });
      }
      await logShopActivity({
        action: 'delete',
        entityType: 'customer',
        entityId: String(deleteCustomerId),
        details: `Suppression client "${existing?.name || deleteCustomerId}"`,
      });
      success(isAr ? 'تم حذف الزبون بنجاح.' : 'Client supprimé avec succès.');
      setDeleteCustomerId(null);
    } catch {
      error(isAr ? 'خطأ أثناء الحذف.' : 'Erreur lors de la suppression.');
    }
  };

  // Send WhatsApp credit reminder to customer
  const handleSendCreditReminder = async (cust: Customer, customDueDate?: string, customBon?: string) => {
    if (!cust.phone || !cust.phone.trim()) {
      error(t.whatsapp.noPhoneAlert);
      return;
    }

    try {
      const settings = await getStoreSettings();
      const templates = settings.whatsappTemplates || {};
      const fallbackTemplates =
        language === 'ar' ? DEFAULT_WHATSAPP_TEMPLATES_AR : DEFAULT_WHATSAPP_TEMPLATES_FR;
      const template = templates.creditReminder || fallbackTemplates.creditReminder;

      const text = renderWhatsAppMessage(template, {
        clientName: cust.name,
        remaining: cust.totalCredit,
        total: cust.totalCredit,
        bonNumber: customBon || '',
        dueDate: customDueDate || '',
        storeName: settings.storeName || (language === 'ar' ? 'المحل' : 'Golden Shop Manager'),
      });

      const opened = openWhatsAppChat(cust.phone, text);
      if (opened) {
        success(
          language === 'ar'
            ? 'تم فتح تطبيق واتساب بنجاح.'
            : 'Discussion WhatsApp ouverte avec succès.'
        );
      } else {
        error(
          language === 'ar'
            ? 'رقم الهاتف غير صالح للمراسلة عبر واتساب.'
            : 'Numéro de téléphone non valide pour WhatsApp.'
        );
      }
    } catch {
      error(
        language === 'ar'
          ? 'حدث خطأ أثناء فتح واتساب.'
          : "Erreur lors de l'ouverture de WhatsApp."
      );
    }
  };

  // Filter customers
  const filteredCustomers = customers.filter((c) => {
    const q = search.toLowerCase().trim();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.CIN && c.CIN.toLowerCase().includes(q))
    );
  });

  const totalOwedOverall = customers.reduce((sum, c) => sum + (c.totalCredit || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gold-gradient tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-400 drop-shadow-[0_0_6px_rgba(212,175,55,0.4)]" />
            <span>{t.customers.title}</span>
          </h1>
          <p className="text-xs text-neutral-300 mt-1 font-medium">
            {isAr ? 'مجموع الكريدي اللي كيتسال للزبناء: ' : 'Total crédit en cours : '}
            <span className="font-mono font-black text-amber-400">
              {formatMAD(totalOwedOverall, language)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Relances du jour button (Partie 3 #6) */}
          <button
            type="button"
            onClick={() => setShowOverduePanel(!showOverduePanel)}
            className={`flex items-center justify-center gap-2 rounded-xl font-bold transition shadow-sm active:scale-95 ${
              overdueReminders.length > 0
                ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700'
            } ${isMobileMode ? 'w-full py-3 px-4 text-xs' : 'px-3.5 py-2 text-xs'}`}
          >
            <BellRing className="w-4 h-4 text-rose-400" />
            <span>
              {isAr
                ? `تذكيرات الكريدي المتأخر (${overdueReminders.length})`
                : `Relances du jour (${overdueReminders.length})`}
            </span>
          </button>

          <button
            onClick={handleOpenAdd}
            className={`flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition shadow-sm active:scale-95 shrink-0 ${
              isMobileMode ? 'w-full py-3.5 px-4 text-sm min-h-[48px]' : 'px-3.5 py-2 text-xs'
            }`}
          >
            <Plus className={isMobileMode ? 'w-5 h-5' : 'w-4 h-4'} />
            <span>{t.customers.addCustomer}</span>
          </button>
        </div>
      </div>

      {/* Overdue Credit WhatsApp Reminders Panel (Partie 3 #6) */}
      {(showOverduePanel || overdueReminders.length > 0) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-rose-400" />
              <div>
                <h2 className="text-sm font-black text-rose-300">
                  {isAr
                    ? 'تذكيرات واتساب للكريدي المتأخر (حل الأجل)'
                    : 'Relances WhatsApp Automatiques — Crédits Échus'}
                </h2>
                <p className="text-[11px] text-neutral-400">
                  {isAr
                    ? 'قائمة الزبناء الذين حل أجل خلاصهم لإرسال تذكير واتساب بضغطة واحدة'
                    : 'Clients ayant dépassé leur date d’échéance ou une tranche d’échéancier'}
                </p>
              </div>
            </div>
            {showOverduePanel && (
              <button
                type="button"
                onClick={() => setShowOverduePanel(false)}
                className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded bg-neutral-900"
              >
                {isAr ? 'إخفاء' : 'Masquer'}
              </button>
            )}
          </div>

          {overdueReminders.length === 0 ? (
            <p className="text-xs text-emerald-400 font-medium py-2">
              {isAr
                ? 'ممتاز! لا يوجد أي كريدي متأخر عن موعد الأداء اليوم.'
                : 'Aucune échéance dépassée aujourd’hui.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {overdueReminders.map(({ customer, overdueAmount, earliestDueDate, bonNumbers }) => (
                <div
                  key={customer.id}
                  className="p-3.5 rounded-xl bg-neutral-950/90 border border-rose-500/30 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-neutral-100 truncate">
                      {customer.name}
                    </div>
                    <div className="text-[11px] text-rose-400 font-mono font-bold mt-0.5">
                      {isAr ? 'متأخر: ' : 'Échu : '}
                      {formatMAD(overdueAmount, language)}
                    </div>
                    <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                      {isAr ? 'الأجل: ' : 'Échéance : '}
                      {earliestDueDate} · {bonNumbers.join(', ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleSendCreditReminder(customer, earliestDueDate, bonNumbers.join(', '))
                    }
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95 transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{isAr ? 'تذكير' : 'Relancer'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search Input */}
      <div className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isAr ? 'بحث بالاسم، الهاتف، أو رقم البطاقة الوطنية...' : 'Rechercher par nom, téléphone, CIN...'
            }
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg ps-9 pe-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Customers Cards Grid */}
      {filteredCustomers.length === 0 ? (
        <div className="py-16 text-center text-xs text-neutral-400 bg-neutral-900/40 rounded-xl border border-neutral-800 flex flex-col items-center justify-center gap-3">
          <Users className="w-10 h-10 text-neutral-600" />
          <p className="text-sm font-medium text-neutral-300">
            {search
              ? isAr
                ? 'ما كاين حتى زبون بهاد الاسم أو الرقم'
                : 'Aucun client trouvé pour cette recherche'
              : isAr
              ? 'ما كاين والو، زيد أول زبون'
              : 'Aucun client pour le moment, ajoutez le premier'}
          </p>
          {!search && (
            <button
              onClick={handleOpenAdd}
              className="mt-1 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.customers.addCustomer}</span>
            </button>
          )}
        </div>
      ) : (
        <div
          className={
            isMobileMode ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
          }
        >
          {filteredCustomers.map((cust) => {
            const hasCredit = cust.totalCredit > 0;
            return (
              <div
                key={cust.id}
                className="p-4 sm:p-5 rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-col justify-between space-y-4 hover:border-neutral-700 transition shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-neutral-100">{cust.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <a
                          href={`tel:${cust.phone}`}
                          className="text-xs text-neutral-300 hover:text-amber-400 flex items-center gap-1.5 font-mono transition"
                        >
                          <Phone className="w-3.5 h-3.5 text-neutral-400" />
                          <span>{cust.phone}</span>
                        </a>
                        {cust.phone && (
                          <button
                            type="button"
                            onClick={() => handleSendCreditReminder(cust)}
                            className="p-1 rounded-md text-emerald-400 hover:text-white hover:bg-emerald-600/40 transition"
                            title={isAr ? 'مراسلة عبر واتساب' : 'Contacter sur WhatsApp'}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {cust.CIN && (
                      <span className="font-mono text-[10px] bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded border border-neutral-700">
                        {cust.CIN}
                      </span>
                    )}
                  </div>

                  {cust.address && (
                    <div className="text-[11px] text-neutral-400 mt-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate">{cust.address}</span>
                    </div>
                  )}

                  {/* Credit Balance Box */}
                  <div className="mt-4 p-3.5 rounded-xl bg-neutral-950 border border-neutral-800/80 flex items-center justify-between text-xs">
                    <span className="text-neutral-400">{t.customers.totalCreditOwed} :</span>
                    <span
                      className={`font-mono font-bold text-sm ${
                        hasCredit ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {formatMAD(cust.totalCredit, language)}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div
                  className={`pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2 ${
                    isMobileMode ? 'flex-wrap' : ''
                  }`}
                >
                  <div className={`flex items-center gap-1.5 ${isMobileMode ? 'flex-1' : ''}`}>
                    {hasCredit && (
                      <>
                        <button
                          onClick={() => {
                            setPaymentCustomer(cust);
                            setPaymentAmount(cust.totalCredit);
                            setFifoSurplusWarning(null);
                          }}
                          className={`font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                            isMobileMode
                              ? 'flex-1 py-3 px-3 text-xs min-h-[44px]'
                              : 'px-3 py-1.5 text-[11px]'
                          }`}
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>{isAr ? 'تسجيل دفعة' : 'Régler'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendCreditReminder(cust)}
                          className={`font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                            isMobileMode
                              ? 'flex-1 py-3 px-3 text-xs min-h-[44px]'
                              : 'px-3 py-1.5 text-[11px]'
                          }`}
                          title={t.whatsapp.sendCreditReminder}
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{isAr ? 'تذكير واتساب' : 'WhatsApp'}</span>
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setHistoryCustomer(cust)}
                      className={`rounded-xl text-neutral-300 hover:text-amber-400 bg-neutral-800 hover:bg-neutral-750 transition flex items-center justify-center ${
                        isMobileMode ? 'py-3 px-3.5 min-h-[44px]' : 'p-2'
                      }`}
                      title={t.customers.paymentHistory}
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleOpenEdit(cust)}
                      className={`rounded-xl text-neutral-300 hover:text-neutral-100 bg-neutral-800 hover:bg-neutral-700 transition flex items-center justify-center ${
                        isMobileMode ? 'py-3 px-3 min-h-[44px]' : 'p-2'
                      }`}
                      title={t.edit}
                    >
                      <Edit className="w-4 h-4 text-amber-400" />
                    </button>
                    {can('delete_records') && (
                      <button
                        onClick={() => setDeleteCustomerId(cust.id!)}
                        className={`rounded-xl text-neutral-400 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition flex items-center justify-center ${
                          isMobileMode ? 'py-3 px-3 min-h-[44px]' : 'p-2'
                        }`}
                        title={t.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={
          editingCustomer?.id
            ? isAr
              ? 'تعديل بيانات الزبون'
              : 'Modifier le Client'
            : t.customers.addCustomer
        }
        maxWidth="md"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {isAr ? 'الاسم الكامل *' : 'Nom Complet *'}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>
          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {isAr ? 'رقم الهاتف *' : 'Téléphone *'}
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+212 6..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                {isAr ? 'رقم البطاقة الوطنية (CIN)' : 'Numéro CIN'}
              </label>
              <input
                type="text"
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                placeholder="ex: BE458921"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                {isAr ? 'سقف الكريدي (درهم)' : 'Plafond crédit (DH)'}
              </label>
              <input
                type="number"
                min="0"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="Optionnel"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {isAr ? 'العنوان' : 'Adresse'}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ex: Quartier Maârif, Casablanca"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-500 text-neutral-950 font-bold rounded-lg"
            >
              {t.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Register Payment Modal */}
      {paymentCustomer && (
        <Modal
          isOpen={true}
          onClose={() => {
            setPaymentCustomer(null);
            setFifoSurplusWarning(null);
          }}
          title={`${isAr ? 'تسجيل دفعة' : 'Encaisser Versement'} - ${paymentCustomer.name}`}
          maxWidth="md"
        >
          <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center font-mono">
              <span className="text-neutral-400">
                {isAr ? 'مجموع الكريدي الحالي :' : 'Total crédit actuel :'}
              </span>
              <span className="font-bold text-rose-400 text-sm">
                {formatMAD(paymentCustomer.totalCredit, language)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {isAr ? 'المبلغ المؤدى (درهم) *' : 'Montant versé (DH) *'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  max={paymentCustomer.totalCredit}
                  required
                  value={paymentAmount}
                  onChange={(e) => {
                    setPaymentAmount(parseFloat(e.target.value) || 0);
                    setFifoSurplusWarning(null);
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono font-bold text-emerald-400"
                />
              </div>
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {isAr ? 'طريقة الدفع' : 'Mode de règlement'}
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
                >
                  <option value="cash">{isAr ? 'نقداً (Espèces)' : 'Espèces (Cash)'}</option>
                  <option value="transfer">{isAr ? 'تحويل بنكي (Virement)' : 'Virement'}</option>
                  <option value="cheque">{isAr ? 'شيك (Chèque)' : 'Chèque'}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                {isAr ? 'ملاحظة الدفعة' : 'Note de versement'}
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder={isAr ? 'مثال: دفعة نقداً بالمحل...' : 'ex: Espèces reçu au comptoir...'}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              />
            </div>

            {/* FIFO Surplus Confirmation Box (Partie 1 #4) */}
            {fifoSurplusWarning && (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 space-y-2.5">
                <div className="flex items-start gap-2 text-amber-300 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <p>
                      {isAr
                        ? `تنبيه: هذا المبلغ يتجاوز مجموع الوصولات غير المؤداة بفائض قدره ${formatMAD(
                            fifoSurplusWarning.surplus,
                            language
                          )}.`
                        : fifoSurplusWarning.message}
                    </p>
                    <p className="text-[11px] text-neutral-300 font-normal mt-1">
                      {isAr
                        ? 'هل تريد تأكيد خصم هذا الفائض من الرصيد الإجمالي للزبون أم إلغاء العملية؟'
                        : 'Voulez-vous confirmer la déduction de ce surplus sur le solde global du client ?'}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setFifoSurplusWarning(null)}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 font-bold"
                  >
                    {isAr ? 'رفض وتعديل المبلغ' : 'Refuser'}
                  </button>
                  <button
                    type="button"
                    onClick={() => executePayment(true)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-neutral-950 font-bold"
                  >
                    {isAr ? 'تأكيد وقبول الفائض' : 'Confirmer le surplus'}
                  </button>
                </div>
              </div>
            )}

            {!fifoSurplusWarning && (
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentCustomer(null)}
                  className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-lg"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm"
                >
                  {isAr ? 'تأكيد الدفعة' : 'Valider le versement'}
                </button>
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Customer Payment History & Installments Modal */}
      {historyCustomer && (
        <Modal
          isOpen={true}
          onClose={() => setHistoryCustomer(null)}
          title={`${isAr ? 'سجل الدفعات والأقساط :' : 'Historique & Échéanciers :'} ${
            historyCustomer.name
          }`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center">
              <div>
                <span className="text-neutral-400">
                  {isAr ? 'الرصيد المتبقي :' : 'Total Crédit Restant :'}{' '}
                </span>
                <span className="font-mono font-bold text-rose-400">
                  {formatMAD(historyCustomer.totalCredit, language)}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const settings = await getStoreSettings();
                  const custSales = sales.filter((s) => s.customerId === historyCustomer.id);
                  const custPayments = payments.filter(
                    (p) => p.customerId === historyCustomer.id && p.status !== 'cancelled'
                  );
                  const { generateCustomerStatementPDF } = await import(
                    '../lib/pdfGenerator'
                  );
                  await generateCustomerStatementPDF(
                    historyCustomer,
                    custSales,
                    custPayments,
                    settings
                  );
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 font-bold flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isAr ? 'كشف الحساب PDF' : 'Relevé PDF'}</span>
              </button>
            </div>

            {/* Active Unpaid Bons & Partial Installments (Partie 1 #4) */}
            {sales
              .filter(
                (s) =>
                  s.customerId === historyCustomer.id &&
                  s.status !== 'returned' &&
                  s.remainingAmount > 0
              )
              .map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2"
                >
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-amber-400">
                      {s.bonNumber} ({s.date})
                    </span>
                    <span className="text-rose-400 font-bold">
                      {isAr ? 'الباقي: ' : 'Reste : '}
                      {formatMAD(s.remainingAmount, language)} / {formatMAD(getNetTotal(s), language)}
                    </span>
                  </div>
                  {s.installments && s.installments.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-neutral-800/80">
                      <div className="text-[10px] text-neutral-400 font-semibold">
                        {isAr ? 'جدول الأقساط :' : 'Échéancier :'}
                      </div>
                      {s.installments.map((inst, idx) => {
                        const paidSoFar = inst.paid
                          ? inst.amount
                          : Math.min(inst.amount, inst.paidAmount || 0);
                        const isPartial = !inst.paid && paidSoFar > 0;
                        return (
                          <div
                            key={inst.id || idx}
                            className="flex items-center justify-between text-[11px] font-mono bg-neutral-950 px-2.5 py-1.5 rounded border border-neutral-800"
                          >
                            <span>
                              #{idx + 1} · {inst.dueDate}
                            </span>
                            <span
                              className={
                                inst.paid
                                  ? 'text-emerald-400 font-bold'
                                  : isPartial
                                  ? 'text-amber-400 font-bold'
                                  : 'text-rose-400'
                              }
                            >
                              {inst.paid
                                ? isAr
                                  ? `مؤدى (${formatMAD(inst.amount, language)})`
                                  : `Payé (${formatMAD(inst.amount, language)})`
                                : isPartial
                                ? isAr
                                  ? `أداء جزئي: ${formatMAD(paidSoFar, language)} / ${formatMAD(
                                      inst.amount,
                                      language
                                    )}`
                                  : `Partiel : ${formatMAD(paidSoFar, language)} / ${formatMAD(
                                      inst.amount,
                                      language
                                    )}`
                                : formatMAD(inst.amount, language)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

            {/* List payments */}
            {payments.filter((p) => p.customerId === historyCustomer.id).length === 0 ? (
              <p className="text-center py-6 text-neutral-500 italic">
                {isAr
                  ? 'لا توجد أي دفعة مسجلة لهذا الزبون.'
                  : 'Aucun versement enregistré pour ce client.'}
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {payments
                  .filter((p) => p.customerId === historyCustomer.id)
                  .sort((a, b) => b.date.localeCompare(a.date) || (b.id || 0) - (a.id || 0))
                  .map((p) => (
                    <div
                      key={p.id}
                      className={`p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between font-mono ${
                        p.status === 'cancelled' ? 'opacity-50 line-through' : ''
                      }`}
                    >
                      <div>
                        <div className="font-bold text-emerald-400">
                          +{formatMAD(p.amount, language)}
                        </div>
                        <div className="text-[11px] text-neutral-400 font-sans mt-0.5">
                          {p.note || 'Versement'}
                        </div>
                      </div>
                      <span className="text-neutral-500 text-xs">{p.date}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteCustomerId}
        onClose={() => setDeleteCustomerId(null)}
        onConfirm={handleDeleteCustomer}
        title={isAr ? 'حذف بطاقة الزبون' : 'Supprimer la fiche client'}
        message={
          isAr
            ? 'هل أنت متأكد من حذف هذا الزبون؟ لا يمكن التراجع عن هذه العملية.'
            : 'Êtes-vous sûr de vouloir supprimer ce client ? Cette action est irréversible.'
        }
        isDestructive={true}
      />
    </div>
  );
};
