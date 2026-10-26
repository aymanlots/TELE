import React, { useState } from 'react';
import { Crown, Sparkles, X, Key, CheckCircle, ArrowRight, MessageCircle, ShieldCheck, Clock } from 'lucide-react';
import { useLicensePlan, PLAN_FEATURES } from '../lib/licensePlan';
import { openWhatsAppChat } from '../lib/whatsapp';
import { useI18n } from '../i18n';
import { PlanTier } from '../types';

export const ProUpgradeModal: React.FC = () => {
  const { language } = useI18n();
  const isAr = language === 'ar';
  const {
    isUpgradeModalOpen,
    upgradeContext,
    closeUpgradeModal,
    resellerWhatsApp,
    activateWithKey,
    subscriptionType,
    daysRemaining,
    isExpired,
  } = useLicensePlan();

  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('pro');
  const [selectedDuration, setSelectedDuration] = useState<'monthly' | 'annual' | 'lifetime'>('monthly');
  const [enteredKey, setEnteredKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [activationResult, setActivationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isActivating, setIsActivating] = useState(false);

  if (!isUpgradeModalOpen || !upgradeContext) return null;

  const meta = PLAN_FEATURES[upgradeContext.key];
  const featureTitle =
    upgradeContext.title || (isAr ? meta?.title : meta?.titleFr) || (isAr ? 'اختر باقة الاشتراك' : 'Choisissez votre Pack');

  const monthlyPriceMad = selectedPlan === 'pro' ? 299 : 199;

  const handleContactWhatsApp = () => {
    const phone = resellerWhatsApp || '0618961387';
    const planLabelAr =
      selectedPlan === 'pro'
        ? 'النسخة الاحترافية الشاملة (PRO VIP)'
        : 'النسخة العادية (Standard)';
    const planLabelFr =
      selectedPlan === 'pro' ? 'Version PRO VIP Complète' : 'Version Standard';

    const durLabelAr =
      selectedDuration === 'monthly'
        ? `اشتراك شهري (${monthlyPriceMad} درهم / الشهر)`
        : selectedDuration === 'annual'
        ? 'اشتراك سنوي (عام كامل — نتفاهمو ف واتساب)'
        : 'مدى الحياة (À vie — نتفاهمو ف واتساب)';
    const durLabelFr =
      selectedDuration === 'monthly'
        ? `1 Mois (${monthlyPriceMad} DH / mois)`
        : selectedDuration === 'annual'
        ? '1 An (Annuel — Tarif à convenir sur WhatsApp)'
        : 'À vie (Illimité — Tarif à convenir sur WhatsApp)';

    const message = isAr
      ? `السلام عليكم، أنا صاحب محل هواتف وباغي نفعل الاشتراك ديالي فـ التطبيق:\n📦 الباقة: ${planLabelAr}\n⏱️ المدة والثمن: ${durLabelAr}\nالمرجو إرسال تفاصيل الأداء وكود التفعيل الرسمي.`
      : `Bonjour, je souhaite activer mon abonnement :\n📦 Pack : ${planLabelFr}\n⏱️ Formule : ${durLabelFr}\nMerci de m'envoyer les détails de paiement et la clé d'activation.`;
    openWhatsAppChat(phone, message);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enteredKey.trim()) return;
    setIsActivating(true);
    setActivationResult(null);

    const res = await activateWithKey(enteredKey);
    setIsActivating(false);
    setActivationResult(res);

    if (res.success) {
      setTimeout(() => {
        closeUpgradeModal();
        setEnteredKey('');
        setActivationResult(null);
        setShowKeyInput(false);
      }, 1500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-xl bg-neutral-900 border border-yellow-500/40 rounded-3xl p-5 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.85),0_0_40px_rgba(245,208,76,0.2)] text-white overflow-hidden my-auto">
        {/* Ambient Gold Glow Behind Header */}
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-64 h-32 bg-yellow-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button (hidden if trial is completely expired so they must activate) */}
        {!isExpired && (
          <button
            type="button"
            onClick={closeUpgradeModal}
            className="absolute top-4 end-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="text-center pt-1 pb-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-yellow-600 via-amber-400 to-yellow-200 text-neutral-950 shadow-[0_8px_25px_rgba(245,208,76,0.5)] mb-2.5">
            <Crown className="w-8 h-8 stroke-[2.5]" />
          </div>

          {subscriptionType === 'trial' && daysRemaining !== null && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold mb-2">
              <Clock className="w-3.5 h-3.5 text-yellow-400" />
              <span>
                {daysRemaining > 0
                  ? isAr
                    ? `الفترة التجريبية الشاملة (30 يوم) — متبقي ${daysRemaining} يوم`
                    : `Période d'essai complète (30j) — ${daysRemaining} jours restants`
                  : isAr
                  ? 'انتهت الفترة التجريبية المجانية (30 يوماً) — اختر باقتك للاستمرار'
                  : "Période d'essai de 30 jours terminée — Choisissez votre pack"}
              </span>
            </div>
          )}

          <h2 className="text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500">
            {isAr
              ? 'اختر الباقة المناسبة لمحلك وفعل اشتراكك'
              : 'Choisissez le pack adapté à votre boutique'}
          </h2>
          <p className="text-xs text-neutral-300 mt-1 leading-relaxed max-w-md mx-auto">
            {isAr
              ? 'النسختان معاً تدعمان الربط السحابي (Cloud Sync) للعمل من الكمبيوتر والهاتف في نفس الوقت.'
              : 'Les deux versions incluent la synchronisation Cloud (PC & Téléphone en temps réel).'}
          </p>
        </div>

        {/* 2-Tier Plan Selector Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3">
          {/* Card 1: Standard */}
          <div
            onClick={() => setSelectedPlan('standard')}
            className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              selectedPlan === 'standard'
                ? 'bg-blue-500/15 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.25)]'
                : 'bg-white/5 border-white/10 hover:border-white/25'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black text-blue-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>{isAr ? 'النسخة العادية (Standard)' : 'Version Standard'}</span>
                </span>
                <input
                  type="radio"
                  checked={selectedPlan === 'standard'}
                  onChange={() => setSelectedPlan('standard')}
                  className="accent-blue-400"
                />
              </div>
              <div className="mb-2 py-1.5 px-2.5 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-baseline justify-between">
                <span className="text-base font-black text-white font-mono">199 DH</span>
                <span className="text-[10px] font-bold text-blue-200">
                  {isAr ? '/ للشهر (أو نتفاهمو فالعام/مدى الحياة)' : '/ Mois (Annuel/À vie sur WhatsApp)'}
                </span>
              </div>
              <p className="text-[11px] text-neutral-300 mb-2">
                {isAr
                  ? 'مثالية للمحلات التي تركز على البيع، السلعة، والكريدي.'
                  : 'Idéale pour la vente, le stock et le suivi des crédits.'}
              </p>
              <ul className="space-y-1 text-[11px] text-neutral-200">
                <li className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>{isAr ? 'الكاشة ونقطة البيع + طبع البونات' : 'Caisse POS & Impression Bons'}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>{isAr ? 'تدبير الستوك، الكريدي، والضمان' : 'Gestion Stock, Crédits & Garantie'}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>{isAr ? 'مزامنة سحابية (بيسي + تيليفون)' : 'Cloud Sync (PC + Téléphone)'}</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Card 2: PRO VIP */}
          <div
            onClick={() => setSelectedPlan('pro')}
            className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between relative overflow-hidden ${
              selectedPlan === 'pro'
                ? 'bg-amber-500/15 border-yellow-400 shadow-[0_0_25px_rgba(245,208,76,0.3)]'
                : 'bg-white/5 border-white/10 hover:border-white/25'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black text-yellow-300 flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-yellow-400 fill-current" />
                  <span>{isAr ? 'النسخة الاحترافية (PRO VIP)' : 'Version PRO VIP'}</span>
                </span>
                <input
                  type="radio"
                  checked={selectedPlan === 'pro'}
                  onChange={() => setSelectedPlan('pro')}
                  className="accent-yellow-400"
                />
              </div>
              <div className="mb-2 py-1.5 px-2.5 rounded-xl bg-amber-500/20 border border-yellow-400/40 flex items-baseline justify-between">
                <span className="text-base font-black text-yellow-300 font-mono">299 DH</span>
                <span className="text-[10px] font-bold text-amber-200">
                  {isAr ? '/ للشهر (أو نتفاهمو فالعام/مدى الحياة)' : '/ Mois (Annuel/À vie sur WhatsApp)'}
                </span>
              </div>
              <p className="text-[11px] text-amber-200/90 mb-2">
                {isAr
                  ? `كل خصائص العادية + ${featureTitle} وجميع الميزات المتقدمة:`
                  : 'Tout le pack Standard + Atelier, Employés & Rapports :'}
              </p>
              <ul className="space-y-1 text-[11px] text-neutral-100">
                <li className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  <span>{isAr ? 'ورشة الإصلاح + تتبع QR Code + عمولة المعلم' : 'Atelier Réparation + QR Code + Commission'}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  <span>{isAr ? 'حسابات الخدامة + إخفاء الربح + موافقات الأدمين' : 'Comptes Employés + Approbations Admin'}</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  <span>{isAr ? 'عقود شراء المستعمل بالـ CIN + التقارير المالية' : 'Contrat Reprise CIN + Rapports Nets'}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* 3-Duration Selector (شهر / عام / مدى الحياة) */}
        <div className="my-3">
          <div className="text-[11px] font-bold text-amber-300 mb-1.5">
            {isAr ? 'اختر مدة الاشتراك المطلوبة:' : "Choisissez la durée d'abonnement :"}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                id: 'monthly' as const,
                ar: 'الشهر (30 يوم)',
                subAr: `${monthlyPriceMad} درهم`,
                fr: '1 Mois (30j)',
                subFr: `${monthlyPriceMad} DH`,
              },
              {
                id: 'annual' as const,
                ar: 'السنة (عام كامل)',
                subAr: 'نتفاهمو ف واتساب 💬',
                fr: '1 An (Annuel)',
                subFr: 'Sur WhatsApp 💬',
              },
              {
                id: 'lifetime' as const,
                ar: 'مدى الحياة (À vie)',
                subAr: 'نتفاهمو ف واتساب 💬',
                fr: 'À vie (Illimité)',
                subFr: 'Sur WhatsApp 💬',
              },
            ].map((dur) => (
              <button
                key={dur.id}
                type="button"
                onClick={() => setSelectedDuration(dur.id)}
                className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  selectedDuration === dur.id
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 border-yellow-200 shadow-md'
                    : 'bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10'
                }`}
              >
                <span>{isAr ? dur.ar : dur.fr}</span>
                <span
                  className={`text-[10px] font-black ${
                    selectedDuration === dur.id ? 'text-neutral-900' : 'text-amber-300'
                  }`}
                >
                  {isAr ? dur.subAr : dur.subFr}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        {!showKeyInput ? (
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleContactWhatsApp}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-xs sm:text-sm shadow-[0_6px_20px_rgba(16,185,129,0.35)] transition cursor-pointer"
            >
              <MessageCircle className="w-5 h-5 fill-current shrink-0" />
              <span>
                {selectedDuration === 'monthly'
                  ? selectedPlan === 'pro'
                    ? isAr
                      ? 'طلب تفعيل النسخة PRO (299 درهم/الشهر) عبر واتساب'
                      : 'Commander PRO VIP (299 DH/mois) via WhatsApp'
                    : isAr
                    ? 'طلب تفعيل النسخة العادية (199 درهم/الشهر) عبر واتساب'
                    : 'Commander Standard (199 DH/mois) via WhatsApp'
                  : isAr
                  ? `تواصل معنا في واتساب للتفاهم على ثمن (${selectedDuration === 'annual' ? 'السنة' : 'مدى الحياة'})`
                  : `Discuter du tarif (${selectedDuration === 'annual' ? '1 An' : 'À vie'}) sur WhatsApp`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowKeyInput(true)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/15 text-yellow-300 border border-yellow-500/30 font-bold text-xs transition cursor-pointer"
            >
              <Key className="w-4 h-4" />
              <span>
                {isAr
                  ? "توصلت بكود التفعيل — اضغط هنا لإدخاله"
                  : "J'ai reçu ma clé d'activation — Cliquez ici"}
              </span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleActivate} className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-amber-300 mb-1.5">
                {isAr
                  ? "أدخل كود التفعيل الرسمي (النسخة العادية أو PRO VIP):"
                  : "Entrez votre clé d'activation officielle (Standard ou PRO VIP) :"}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={enteredKey}
                  onChange={(e) => setEnteredKey(e.target.value.toUpperCase())}
                  placeholder="GOLD-PRO-365D-XXXX-XXXX"
                  className="w-full py-3 px-4 rounded-xl bg-black/60 border border-yellow-500/50 text-white font-mono text-center font-bold tracking-widest text-sm focus:outline-none focus:border-yellow-400 placeholder:text-neutral-500"
                  autoFocus
                />
              </div>
            </div>

            {activationResult && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  activationResult.success
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}
              >
                {activationResult.message}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isActivating || !enteredKey.trim()}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 font-black text-xs shadow-[0_4px_16px_rgba(245,208,76,0.4)] disabled:opacity-50 transition cursor-pointer"
              >
                {isActivating
                  ? isAr
                    ? 'جارِ التحقق...'
                    : 'Vérification...'
                  : isAr
                  ? 'تفعيل الاشتراك الآن'
                  : 'Activer maintenant'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowKeyInput(false);
                  setActivationResult(null);
                }}
                className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-neutral-300 text-xs font-bold transition cursor-pointer"
              >
                {isAr ? 'رجوع' : 'Retour'}
              </button>
            </div>
          </form>
        )}

        {!isExpired && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={closeUpgradeModal}
              className="text-xs text-neutral-400 hover:text-white transition cursor-pointer inline-flex items-center gap-1"
            >
              <span>
                {isAr ? 'إغلاق والعودة للتطبيق' : "Fermer et revenir à l'application"}
              </span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

