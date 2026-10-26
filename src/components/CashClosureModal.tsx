import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calculator,
  CheckCircle2,
  AlertTriangle,
  History,
  Save,
  Calendar,
  Banknote,
  CreditCard,
  Building2,
  ArrowDownCircle,
  MessageCircle,
} from 'lucide-react';
import { db, saveDailyCashClosure, getStoreSettings } from '../db';
import { Modal } from './Modal';
import { useI18n } from '../i18n';
import { useToast } from './Toast';
import { formatMAD } from '../lib/currency';
import { getMoroccoDateString } from '../lib/dateUtils';
import { openWhatsAppChat } from '../lib/whatsapp';

interface CashClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CashClosureModal: React.FC<CashClosureModalProps> = ({ isOpen, onClose }) => {
  const { language } = useI18n();
  const { success, error } = useToast();
  const isAr = language === 'ar';

  const [selectedDate, setSelectedDate] = useState<string>(getMoroccoDateString());
  const [countedCashInput, setCountedCashInput] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [autoSendWhatsApp, setAutoSendWhatsApp] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);

  const salesOnDate =
    useLiveQuery(
      () => db.sales.where('date').equals(selectedDate).toArray(),
      [selectedDate]
    ) || [];

  const allSales = useLiveQuery(() => db.sales.toArray(), []) || [];

  const paymentsOnDate =
    useLiveQuery(
      () => db.customerPayments.where('date').equals(selectedDate).toArray(),
      [selectedDate]
    ) || [];

  const expensesOnDate =
    useLiveQuery(
      () => db.expenses.where('date').equals(selectedDate).toArray(),
      [selectedDate]
    ) || [];

  const closureHistory =
    useLiveQuery(() => db.cashClosures.orderBy('date').reverse().limit(15).toArray(), []) || [];

  // Calculate expected totals by payment method (cash, cheque, transfer) and deduct refundedCash on return date (R1)
  const totals = useMemo(() => {
    let expectedCash = 0;
    let expectedCheque = 0;
    let expectedTransfer = 0;
    let refundedCashOnDate = 0;

    // 1. From customerPayments recorded on selectedDate (includes initial sale payments + credit collections)
    const saleIdsWithPaymentRow = new Set<number>();
    for (const p of paymentsOnDate) {
      if (p.status === 'cancelled' || p.deleted_at) continue;
      if (p.saleId) saleIdsWithPaymentRow.add(p.saleId);
      const method = p.paymentMethod || 'cash';
      if (method === 'cheque') expectedCheque += p.amount;
      else if (method === 'transfer') expectedTransfer += p.amount;
      else expectedCash += p.amount;
    }

    // 2. From cash/walk-in sales without customerId (or repair deposits/deliveries) on selectedDate
    for (const s of salesOnDate) {
      if (s.deleted_at) continue;
      if (s.id && saleIdsWithPaymentRow.has(s.id)) continue; // Already counted via customerPayments
      const paid = s.paidAmount || 0;
      if (paid <= 0) continue;
      const method = s.paymentMethod || 'cash';
      if (method === 'cheque') expectedCheque += paid;
      else if (method === 'transfer') expectedTransfer += paid;
      else expectedCash += paid;
    }

    // 3. R1: Cash refunds (refundedCash) from returns that occurred on selectedDate
    for (const s of allSales) {
      if (s.deleted_at || !Array.isArray(s.returns)) continue;
      for (const ret of s.returns) {
        if (ret.date === selectedDate && (Number(ret.refundedCash) || 0) > 0) {
          refundedCashOnDate += Number(ret.refundedCash) || 0;
        }
      }
    }

    const totalExpenses = expensesOnDate
      .filter((e) => !e.deleted_at)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const netExpectedCash =
      Math.round((expectedCash - totalExpenses - refundedCashOnDate) * 100) / 100;

    // Additional daily KPIs for Owner WhatsApp Report
    let phonesSoldCount = 0;
    let creditGivenToday = 0;
    let repairsRevenueToday = 0;
    for (const s of salesOnDate) {
      if (s.deleted_at || s.status === 'returned') continue;
      creditGivenToday += s.remainingAmount || 0;
      if (s.notes?.includes('Réparation') || s.bonNumber?.startsWith('REP-')) {
        repairsRevenueToday += s.paidAmount || 0;
      }
      for (const it of s.items || []) {
        if (!it.isReturned && it.category === 'phone') {
          phonesSoldCount += it.quantity || 1;
        }
      }
    }

    return {
      expectedCash: Math.round(expectedCash * 100) / 100,
      expectedCheque: Math.round(expectedCheque * 100) / 100,
      expectedTransfer: Math.round(expectedTransfer * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      refundedCashOnDate: Math.round(refundedCashOnDate * 100) / 100,
      netExpectedCash,
      phonesSoldCount,
      creditGivenToday: Math.round(creditGivenToday * 100) / 100,
      repairsRevenueToday: Math.round(repairsRevenueToday * 100) / 100,
    };
  }, [salesOnDate, allSales, paymentsOnDate, expensesOnDate]);

  const countedCash = parseFloat(countedCashInput) || 0;
  const discrepancy = Math.round((countedCash - totals.netExpectedCash) * 100) / 100;

  const handleSendOwnerWhatsAppReport = async (customCounted?: number) => {
    const s = await getStoreSettings();
    const storeName = s.storeName?.trim() || 'Golden Phone';
    const actualCounted = customCounted !== undefined ? customCounted : countedCash;
    const diff = Math.round((actualCounted - totals.netExpectedCash) * 100) / 100;

    const reportText = isAr
      ? `📊 *تقرير إغلاق الصندوق اليومي — ${storeName}*\n📅 التاريخ: ${selectedDate}\n━━━━━━━━━━━━━━\n💵 المداخيل نقداً (الكاش): *${totals.expectedCash} DH*\n📱 عدد الهواتف المباعة اليوم: *${totals.phonesSoldCount}*\n🛠️ مداخيل الإصلاح اليوم: *${totals.repairsRevenueToday} DH*\n📝 الكريدي الجديد الممنوح اليوم: *${totals.creditGivenToday} DH*\n📉 مصاريف اليوم: *${totals.totalExpenses} DH*\n━━━━━━━━━━━━━━\n💰 *الصافي المتوقع فـ لاكيس:* ${totals.netExpectedCash} DH\n✅ *المبلغ المحسوب فعلياً:* ${actualCounted} DH\n⚖️ *الفرق (Écart):* ${diff > 0 ? `+${diff}` : diff} DH${notes.trim() ? `\n📌 ملاحظات: ${notes.trim()}` : ''}`
      : `📊 *Rapport Clôture de Caisse — ${storeName}*\n📅 Date : ${selectedDate}\n━━━━━━━━━━━━━━\n💵 Espèces encaissées : *${totals.expectedCash} DH*\n📱 Téléphones vendus : *${totals.phonesSoldCount}*\n🛠️ Revenus Réparations : *${totals.repairsRevenueToday} DH*\n📝 Crédits accordés : *${totals.creditGivenToday} DH*\n📉 Dépenses du jour : *${totals.totalExpenses} DH*\n━━━━━━━━━━━━━━\n💰 *Net attendu en caisse :* ${totals.netExpectedCash} DH\n✅ *Montant compté :* ${actualCounted} DH\n⚖️ *Écart :* ${diff > 0 ? `+${diff}` : diff} DH`;

    if (s.phone && s.phone.trim()) {
      openWhatsAppChat(s.phone.trim(), reportText);
    } else {
      const encoded = encodeURIComponent(reportText);
      window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSaveClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (countedCashInput.trim() === '' || isNaN(Number(countedCashInput))) {
      error(isAr ? 'يرجى إدخال المبلغ المحسوب في الصندوق.' : 'Veuillez saisir le montant compté en caisse.');
      return;
    }

    setIsSaving(true);
    try {
      await saveDailyCashClosure({
        date: selectedDate,
        expectedCash: totals.expectedCash,
        expectedCheque: totals.expectedCheque,
        expectedTransfer: totals.expectedTransfer,
        totalExpenses: totals.totalExpenses,
        netExpectedCash: totals.netExpectedCash,
        countedCash,
        discrepancy,
        notes: notes.trim() || undefined,
      });
      success(
        isAr
          ? 'تم حفظ إغلاق الصندوق اليومي بنجاح.'
          : 'Clôture de caisse journalière enregistrée avec succès.'
      );
      if (autoSendWhatsApp) {
        await handleSendOwnerWhatsAppReport(countedCash);
      }
      setNotes('');
    } catch (err: any) {
      error(err?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? 'إغلاق الصندوق اليومي (Clôture de Caisse)' : 'Clôture de Caisse Journalière'}
      maxWidth="2xl"
    >
      <div className="space-y-5 text-xs">
        <form onSubmit={handleSaveClosure} className="space-y-4">
          {/* Date Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <div className="flex items-center gap-2 text-neutral-200 font-bold">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>{isAr ? 'تاريخ الصندوق :' : 'Date de caisse :'}</span>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 font-mono text-neutral-100 focus:outline-hidden focus:border-amber-500"
            />
          </div>

          {/* Expected Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-neutral-950 border border-emerald-500/30">
              <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isAr ? 'نقداً (Espèces)' : 'Espèces encaissées'}</span>
              </div>
              <div className="text-sm font-mono font-bold text-emerald-400">
                {formatMAD(totals.expectedCash, language)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-neutral-950 border border-blue-500/30">
              <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                <span>{isAr ? 'شيك (Chèque)' : 'Chèques'}</span>
              </div>
              <div className="text-sm font-mono font-bold text-blue-400">
                {formatMAD(totals.expectedCheque, language)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-neutral-950 border border-purple-500/30">
              <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
                <Building2 className="w-3.5 h-3.5 text-purple-400" />
                <span>{isAr ? 'تحويل (Virement)' : 'Virements'}</span>
              </div>
              <div className="text-sm font-mono font-bold text-purple-400">
                {formatMAD(totals.expectedTransfer, language)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-neutral-950 border border-rose-500/30">
              <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
                <ArrowDownCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>{isAr ? 'مصاريف اليوم' : 'Dépenses du jour'}</span>
              </div>
              <div className="text-sm font-mono font-bold text-rose-400">
                -{formatMAD(totals.totalExpenses, language)}
              </div>
            </div>
          </div>

          {/* Net Cash Expected vs Counted Cash */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-neutral-950/90 border border-amber-500/30">
            <div>
              <label className="block text-neutral-400 mb-1">
                {isAr ? 'الصافي المتوقع في الصندوق (نقداً)' : 'Espèces nettes attendues en caisse'}
              </label>
              <div className="text-lg font-mono font-black text-amber-400">
                {formatMAD(totals.netExpectedCash, language)}
              </div>
            </div>

            <div>
              <label className="block text-neutral-200 font-bold mb-1">
                {isAr ? 'المبلغ المحسوب فعلياً (DH) *' : 'Montant compté en espèces (DH) *'}
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={countedCashInput}
                onChange={(e) => setCountedCashInput(e.target.value)}
                placeholder={String(totals.netExpectedCash)}
                className="w-full bg-neutral-900 border border-amber-500/50 rounded-lg px-3 py-2 font-mono font-bold text-sm text-neutral-100 focus:outline-hidden focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">
                {isAr ? 'الفرق (Écart de caisse)' : 'Écart de caisse'}
              </label>
              <div
                className={`text-lg font-mono font-black flex items-center gap-1.5 ${
                  countedCashInput === ''
                    ? 'text-neutral-500'
                    : Math.abs(discrepancy) < 0.01
                    ? 'text-emerald-400'
                    : discrepancy > 0
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {countedCashInput === '' ? (
                  '—'
                ) : (
                  <>
                    {Math.abs(discrepancy) < 0.01 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                    <span>
                      {discrepancy > 0 ? '+' : ''}
                      {formatMAD(discrepancy, language)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {isAr ? 'ملاحظات (اختياري)' : 'Notes / Observations (optionnel)'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isAr ? 'مثال: صندوق متوازن...' : 'Ex: Fond de caisse vérifié...'}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-emerald-400 font-bold">
              <input
                type="checkbox"
                checked={autoSendWhatsApp}
                onChange={(e) => setAutoSendWhatsApp(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
              <span>
                {isAr
                  ? 'إرسال التقرير اليومي أوتوماتيكياً فـ WhatsApp لمول المحل عند الحفظ'
                  : 'Envoyer automatiquement le rapport WhatsApp au propriétaire'}
              </span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSendOwnerWhatsAppReport()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold transition"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{isAr ? 'إرسال تقرير WhatsApp الآن' : 'Rapport WhatsApp'}</span>
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition shadow-md"
              >
                <Save className="w-4 h-4" />
                <span>{isAr ? 'تأكيد وحفظ إغلاق الصندوق' : 'Valider la clôture de caisse'}</span>
              </button>
            </div>
          </div>
        </form>

        {/* History Table */}
        <div className="pt-4 border-t border-neutral-800 space-y-2.5">
          <h4 className="font-bold text-neutral-200 flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <span>{isAr ? 'سجل إغلاقات الصندوق السابقة' : 'Historique des clôtures de caisse'}</span>
          </h4>

          {closureHistory.length === 0 ? (
            <p className="text-neutral-500 text-center py-4">
              {isAr ? 'لا يوجد سجل إغلاق صندوق بعد.' : 'Aucune clôture enregistrée.'}
            </p>
          ) : (
            <div className="overflow-x-auto max-h-56">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 text-[11px]">
                    <th className="py-2 px-2 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-2 px-2 text-end">{isAr ? 'المتوقع' : 'Attendu'}</th>
                    <th className="py-2 px-2 text-end">{isAr ? 'المحسوب' : 'Compté'}</th>
                    <th className="py-2 px-2 text-end">{isAr ? 'الفرق' : 'Écart'}</th>
                    <th className="py-2 px-2 text-start">{isAr ? 'بواسطة' : 'Par'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {closureHistory.map((c) => (
                    <tr key={c.id || c.date} className="hover:bg-neutral-800/40">
                      <td className="py-2 px-2 font-mono font-bold text-neutral-200">{c.date}</td>
                      <td className="py-2 px-2 text-end font-mono text-neutral-300">
                        {formatMAD(c.netExpectedCash, language)}
                      </td>
                      <td className="py-2 px-2 text-end font-mono font-bold text-neutral-100">
                        {formatMAD(c.countedCash, language)}
                      </td>
                      <td
                        className={`py-2 px-2 text-end font-mono font-bold ${
                          Math.abs(c.discrepancy) < 0.01
                            ? 'text-emerald-400'
                            : c.discrepancy > 0
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {c.discrepancy > 0 ? '+' : ''}
                        {formatMAD(c.discrepancy, language)}
                      </td>
                      <td className="py-2 px-2 text-neutral-400 truncate max-w-[140px]">
                        {c.closedBy} {c.notes ? `(${c.notes})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
