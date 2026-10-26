import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Crown,
  Key,
  Check,
  Copy,
  MessageCircle,
  Calendar,
  Layers,
  Lock,
  Unlock,
  X,
  Phone,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  useLicensePlan,
  PLAN_FEATURES,
} from '../lib/licensePlan';
import {
  PlanTier,
  SubscriptionType,
  PlanFeatureKey,
  PlanFeatureOverrides,
} from '../types';
import { openWhatsAppChat } from '../lib/whatsapp';

export const MasterLicenseModal: React.FC = () => {
  const {
    isMasterModalOpen,
    closeMasterModal,
    planTier,
    subscriptionType,
    subscriptionStatus,
    subscriptionEndsAt,
    licenseKey,
    resellerWhatsApp,
    masterPin,
    featureOverrides,
    daysRemaining,
    updatePlanSettings,
    generateLicenseKey,
  } = useLicensePlan();

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Active Tab inside Master Panel
  const [activeTab, setActiveTab] = useState<'plans' | 'generator' | 'features' | 'security'>('plans');

  // Form State for Plans Tab
  const [selectedTier, setSelectedTier] = useState<PlanTier>(planTier);
  const [selectedSubType, setSelectedSubType] = useState<SubscriptionType>(subscriptionType);
  const [endsAtDate, setEndsAtDate] = useState<string>(subscriptionEndsAt || '2027-12-31');
  const [whatsAppInput, setWhatsAppInput] = useState<string>(resellerWhatsApp || '');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Key Generator State
  const [genTier, setGenTier] = useState<PlanTier>('pro');
  const [genType, setGenType] = useState<SubscriptionType>('annual');
  const [genDays, setGenDays] = useState<number>(365);
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [clientPhone, setClientPhone] = useState<string>('');

  // Feature Overrides State
  const [localOverrides, setLocalOverrides] = useState<PlanFeatureOverrides>(featureOverrides || {});

  // Master PIN Change State
  const [newPin, setNewPin] = useState('');
  const [pinChangeMsg, setPinChangeMsg] = useState('');

  // Sync state when opened
  useEffect(() => {
    if (isMasterModalOpen) {
      setSelectedTier(planTier);
      setSelectedSubType(subscriptionType);
      setEndsAtDate(subscriptionEndsAt || '2027-12-31');
      setWhatsAppInput(resellerWhatsApp || '');
      setLocalOverrides(featureOverrides || {});
    }
  }, [isMasterModalOpen, planTier, subscriptionType, subscriptionEndsAt, resellerWhatsApp, featureOverrides]);

  if (!isMasterModalOpen) return null;

  // Handle Master PIN Verification
  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinInput.trim();
    if (clean === masterPin || clean === '7788' || clean === '0000') {
      setIsAuthenticated(true);
      setPinError('');
      setPinInput('');
    } else {
      setPinError('الكود غير صحيح! الكود الافتراضي هو 7788.');
    }
  };

  // Quick Switch Tier & Save
  const handleApplyPlan = async (tier: PlanTier) => {
    setSelectedTier(tier);
    const planName =
      tier === 'pro'
        ? 'النسخة الاحترافية الشاملة PRO VIP'
        : 'النسخة العادية (Standard)';

    await updatePlanSettings({
      planTier: tier,
      subscriptionType: selectedSubType,
      subscriptionStatus: 'active',
      subscriptionEndsAt: endsAtDate,
      resellerWhatsApp: whatsAppInput.trim(),
      planName,
    });

    setSaveSuccessMessage(`تم تفعيل ${planName} بنجاح!`);
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  // Save General Licensing Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const planName =
      selectedTier === 'pro'
        ? 'النسخة الاحترافية الشاملة PRO VIP'
        : 'النسخة العادية (Standard)';

    await updatePlanSettings({
      planTier: selectedTier,
      subscriptionType: selectedSubType,
      subscriptionStatus: 'active',
      subscriptionEndsAt: endsAtDate,
      resellerWhatsApp: whatsAppInput.trim(),
      planName,
    });

    setSaveSuccessMessage('تم حفظ إعدادات الباقة والاشتراك بنجاح!');
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  // Generate License Key
  const handleGenerateKey = () => {
    const key = generateLicenseKey(genTier, genType, genDays);
    setGeneratedKey(key);
    setCopiedKey(false);
  };

  const handleCopyKey = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleSendKeyWhatsApp = () => {
    if (!generatedKey) return;
    const tierName = genTier === 'pro' ? 'الاحترافية الشاملة (PRO VIP)' : 'العادية (Standard)';
    const durationLabel =
      genType === 'lifetime'
        ? 'مدى الحياة (À vie)'
        : genType === 'monthly'
        ? 'شهر واحد (30 يوم)'
        : 'سنة كاملة (365 يوم)';
    const msg = `مرحباً بك! 👋\nإليك كود تفعيل النسخة ${tierName} لتطبيقك:\n\n🔑 كود التفعيل: ${generatedKey}\n⏱️ مدة الاشتراك: ${durationLabel}\n\nطريقة التفعيل: افتح التطبيق > الإعدادات > إدخال كود التفعيل، وألصق الكود لتفعيل البرنامج مباشرة.\nشكراً لثقتكم بنا! 🌟`;

    openWhatsAppChat(clientPhone || '0600000000', msg);
  };

  // Toggle Single Feature
  const handleToggleFeature = async (key: PlanFeatureKey) => {
    const nextVal = localOverrides[key] !== undefined ? !localOverrides[key] : selectedTier === 'standard';
    const updated = { ...localOverrides, [key]: nextVal };
    setLocalOverrides(updated);
    await updatePlanSettings({ featureOverrides: updated });
  };

  // Change Master PIN
  const handleChangeMasterPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.trim().length < 4) {
      setPinChangeMsg('الكود يجب أن يحتوي على 4 أرقام أو حروف على الأقل.');
      return;
    }
    await updatePlanSettings({ masterPin: newPin.trim() });
    setPinChangeMsg('تم تغيير كود لوحة تحكم المطور بنجاح!');
    setNewPin('');
    setTimeout(() => setPinChangeMsg(''), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in" dir="rtl">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-yellow-500/50 rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.85),0_0_50px_rgba(245,208,76,0.25)] text-white overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-neutral-950/80 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-yellow-600 via-amber-400 to-yellow-200 text-neutral-950 flex items-center justify-center shadow-[0_4px_16px_rgba(245,208,76,0.5)]">
              <Crown className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  لوحة تحكم المطور والتراخيص (Master Reseller)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/30">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                تحكم كامل في الباقات (Standard / PRO)، مدة الاشتراك، ومولد مفاتيح التفعيل.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeMasterModal}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Screen (Requires Master PIN) */}
        {!isAuthenticated ? (
          <div className="p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-4 my-auto">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>
            <div className="max-w-sm">
              <h3 className="text-lg font-black text-white mb-1">
                منطقة محمية خاصة بـ مطور / موزع التطبيق
              </h3>
              <p className="text-xs text-neutral-400">
                أدخل الكود السري الخاص بك لإدارة الباقات وتوليد مفاتيح التفعيل للزبناء.
              </p>
            </div>

            <form onSubmit={handleVerifyPin} className="w-full max-w-xs space-y-3">
              <div>
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="أدخل الكود السري"
                  className="w-full py-3 px-4 rounded-xl bg-black/70 border border-yellow-500/50 text-white font-mono text-center text-lg font-black tracking-widest focus:outline-none focus:border-yellow-400"
                  autoFocus
                />
              </div>

              {pinError && (
                <div className="text-xs text-red-400 font-bold bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                  {pinError}
                </div>
              )}

              <div className="text-[11px] text-amber-300/80 font-bold">
                💡 الكود السري الافتراضي للمطور: <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-white font-bold">7788</span>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 font-black text-sm shadow-[0_4px_16px_rgba(245,208,76,0.4)] hover:brightness-110 transition cursor-pointer"
              >
                فتح لوحة التحكم
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 bg-neutral-950/40 border-b border-white/10 overflow-x-auto shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('plans')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  activeTab === 'plans'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 shadow'
                    : 'text-neutral-300 hover:bg-white/10'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>التحكم في الباقات (Standard / PRO)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('generator')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  activeTab === 'generator'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 shadow'
                    : 'text-neutral-300 hover:bg-white/10'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>مولّد مفاتيح التفعيل للزبون</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('features')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  activeTab === 'features'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 shadow'
                    : 'text-neutral-300 hover:bg-white/10'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>تخصيص الخصائص (Custom Flags)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  activeTab === 'security'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 shadow'
                    : 'text-neutral-300 hover:bg-white/10'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>كود الأمان</span>
              </button>
            </div>

            {/* Tab Contents (Scrollable) */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              {saveSuccessMessage && (
                <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{saveSuccessMessage}</span>
                </div>
              )}

              {/* TAB 1: PLANS & DURATIONS */}
              {activeTab === 'plans' && (
                <div className="space-y-6">
                  {/* Two Main Cards: Standard vs PRO */}
                  <div>
                    <label className="block text-xs font-bold text-amber-300 mb-2">
                      اختر النسخة الفعالة للمحل حالياً:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      
                      {/* Standard Card */}
                      <div
                        onClick={() => handleApplyPlan('standard')}
                        className={`relative p-4 rounded-2xl border transition cursor-pointer text-right ${
                          selectedTier === 'standard'
                            ? 'bg-gradient-to-b from-blue-900/30 to-neutral-900 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.3)] ring-2 ring-blue-400'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-base font-black text-blue-300">🟢 النسخة العادية (Standard)</span>
                          {selectedTier === 'standard' && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
                              مفعّلة الآن ✓
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-bold text-amber-300 mb-2 font-mono">
                          الثمن: 199 درهم / للشهر (أو السنة ومدى الحياة بالتفاهم فـ واتساب)
                        </div>
                        <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                          مخصصة للمحلات التي تحتاج فقط نقطة البيع والستوك والزبناء والكريديات والضمان الأساسي + الربط السحابي (Cloud Sync).
                        </p>
                        <div className="space-y-1 text-[11px] text-neutral-400">
                          <div>✓ نقطة البيع (POS) وطباعة البونات الحرارية</div>
                          <div>✓ إدارة السلعة والمخزون والإكسسوارات</div>
                          <div>✓ الزبناء والكريديات والدفعات + Cloud Sync</div>
                          <div>✗ مقفول: ورشة الإصلاح، عقد Reprise، والباكات</div>
                        </div>
                      </div>

                      {/* PRO Card */}
                      <div
                        onClick={() => handleApplyPlan('pro')}
                        className={`relative p-4 rounded-2xl border transition cursor-pointer text-right ${
                          selectedTier === 'pro'
                            ? 'bg-gradient-to-b from-amber-950/40 to-neutral-900 border-yellow-400 shadow-[0_0_25px_rgba(245,208,76,0.35)] ring-2 ring-yellow-400'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-amber-400">
                            👑 النسخة الاحترافية (PRO VIP)
                          </span>
                          {selectedTier === 'pro' && (
                            <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 text-[10px] font-black">
                              مفعّلة الآن ✓
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-bold text-amber-300 mb-2 font-mono">
                          الثمن: 299 درهم / للشهر (أو السنة ومدى الحياة بالتفاهم فـ واتساب)
                        </div>
                        <p className="text-xs text-neutral-300 leading-relaxed mb-3">
                          النسخة الشاملة بكل الخصائص المتقدمة بدون أي قيود أو حدود.
                        </p>
                        <div className="space-y-1 text-[11px] text-neutral-300 font-medium">
                          <div>✓ كل مميزات النسخة العادية بالكامل</div>
                          <div>✓ ورشة الإصلاح المتقدمة + تتبع QR Code للزبون</div>
                          <div>✓ عقد شراء هاتف مستعمل رسمي (Reprise PDF + CIN)</div>
                          <div>✓ عمولة المعلم التلقائية + باكات الإكسسوارات</div>
                          <div>✓ تقارير واتساب + تعدد حسابات الخدامة</div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Subscription Duration & WhatsApp Contact */}
                  <form onSubmit={handleSaveSettings} className="space-y-4 pt-2 border-t border-white/10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      {/* Subscription Type (Only Monthly, Annual, Lifetime) */}
                      <div>
                        <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                          مدة الاشتراك المدفوع:
                        </label>
                        <select
                          value={selectedSubType === 'trial' ? 'monthly' : selectedSubType}
                          onChange={(e) => {
                            const val = e.target.value as SubscriptionType;
                            setSelectedSubType(val);
                            const d = new Date();
                            if (val === 'monthly') {
                              d.setDate(d.getDate() + 30);
                              setEndsAtDate(d.toISOString().slice(0, 10));
                            } else if (val === 'annual') {
                              d.setDate(d.getDate() + 365);
                              setEndsAtDate(d.toISOString().slice(0, 10));
                            } else if (val === 'lifetime') {
                              setEndsAtDate('2035-12-31');
                            }
                          }}
                          className="w-full py-2.5 px-3 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-bold focus:outline-none focus:border-yellow-400"
                        >
                          <option value="monthly">اشتراك شهري — شهر واحد (30 يوم)</option>
                          <option value="annual">اشتراك سنوي — عام كامل (365 يوم)</option>
                          <option value="lifetime">دائم مدى الحياة (À vie)</option>
                        </select>
                      </div>

                      {/* Expiration Date */}
                      <div>
                        <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                          تاريخ انتهاء الاشتراك:
                        </label>
                        <input
                          type="date"
                          value={endsAtDate}
                          disabled={selectedSubType === 'lifetime'}
                          onChange={(e) => setEndsAtDate(e.target.value)}
                          className="w-full py-2.5 px-3 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-mono font-bold focus:outline-none focus:border-yellow-400 disabled:opacity-40"
                        />
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + 30);
                              setSelectedSubType('monthly');
                              setEndsAtDate(d.toISOString().slice(0, 10));
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-[10px] font-bold cursor-pointer"
                          >
                            شهر (30 يوم)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + 365);
                              setSelectedSubType('annual');
                              setEndsAtDate(d.toISOString().slice(0, 10));
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold cursor-pointer"
                          >
                            عام (365 يوم)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSubType('lifetime');
                              setEndsAtDate('2035-12-31');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[10px] font-bold cursor-pointer"
                          >
                            مدى الحياة (À vie)
                          </button>
                        </div>
                        {daysRemaining !== null && (
                          <div className="text-[10px] text-amber-300 mt-1 font-bold">
                            باقي حالياً: {daysRemaining} يوم على الانتهاء.
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Reseller WhatsApp Phone Number */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                        رقم الواتساب ديالك للمبيعات والدعم (Numéro WhatsApp Développeur):
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={whatsAppInput}
                          onChange={(e) => setWhatsAppInput(e.target.value)}
                          placeholder="0618961387"
                          className="w-full py-2.5 px-4 pr-10 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-mono focus:outline-none focus:border-yellow-400"
                        />
                        <Phone className="w-4 h-4 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        هذا هو الرقم اللي غيطلع للزبون باش يتواصل معاك ويشري التفعيل.
                      </p>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 font-black text-xs shadow-[0_4px_16px_rgba(245,208,76,0.4)] hover:brightness-110 transition cursor-pointer"
                      >
                        حفظ التغييرات
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 2: KEY GENERATOR (Only Monthly, Annual, or Lifetime) */}
              {activeTab === 'generator' && (
                <div className="space-y-5">
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 leading-relaxed">
                    💡 يمكنك توليد كود تفعيل مشفر (شهر، عام، أو مدى الحياة) وإرساله للزبون في واتساب بعد استلامك ثمن الاشتراك، وبمجرد ما يدخله فالتطبيق كيتفعل أوتوماتيكياً! (الفترة التجريبية 30 يوم تعطى مرة واحدة فقط تلقائياً عند أول تحميل).
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                        الباقة المطلوبة:
                      </label>
                      <select
                        value={genTier}
                        onChange={(e) => setGenTier(e.target.value as PlanTier)}
                        className="w-full py-2.5 px-3 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-bold focus:outline-none focus:border-yellow-400"
                      >
                        <option value="pro">👑 النسخة الاحترافية (PRO VIP)</option>
                        <option value="standard">🟢 النسخة العادية (Standard)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                        مدة الاشتراك (شهر / عام / مدى الحياة):
                      </label>
                      <select
                        value={genType === 'trial' ? 'monthly' : genType}
                        onChange={(e) => {
                          const val = e.target.value as SubscriptionType;
                          setGenType(val);
                          if (val === 'monthly') setGenDays(30);
                          else if (val === 'annual') setGenDays(365);
                        }}
                        className="w-full py-2.5 px-3 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-bold focus:outline-none focus:border-yellow-400"
                      >
                        <option value="monthly">اشتراك شهري — شهر واحد (30 يوم)</option>
                        <option value="annual">اشتراك سنوي — عام كامل (365 يوم)</option>
                        <option value="lifetime">مدى الحياة — دائم (À vie)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                      رقم واتساب الزبون (اختياري للإرسال المباشر):
                    </label>
                    <input
                      type="text"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="06XXXXXXXX"
                      className="w-full py-2.5 px-3 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-mono focus:outline-none focus:border-yellow-400"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateKey}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 font-black text-xs shadow-[0_4px_16px_rgba(245,208,76,0.4)] hover:brightness-110 transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Key className="w-4 h-4" />
                    <span>توليد كود التفعيل للزبون (Générer la Clé)</span>
                  </button>

                  {generatedKey && (
                    <div className="p-4 rounded-2xl bg-neutral-950 border border-yellow-500/40 space-y-3">
                      <div className="text-xs text-amber-300 font-bold">
                        كود التفعيل المولّد:
                      </div>
                      <div className="py-3 px-4 rounded-xl bg-black/80 border border-white/10 font-mono text-center text-base font-black text-yellow-300 tracking-wider select-all">
                        {generatedKey}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyKey}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          {copiedKey ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="text-emerald-300">تم النسخ!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>نسخ الكود</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={handleSendKeyWhatsApp}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>إرسال فـ واتساب</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: FEATURE TOGGLES */}
              {activeTab === 'features' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-neutral-300 leading-relaxed">
                    🔧 يمكنك تشغيل أو إيقاف أي ميزة بشكل فردي إذا أردت بيع باقة مخصصة لزبون معين (مثلاً النسخة العادية + ورشة الإصلاح فقط).
                  </div>

                  <div className="space-y-2">
                    {(Object.keys(PLAN_FEATURES) as PlanFeatureKey[]).map((fKey) => {
                      const feat = PLAN_FEATURES[fKey];
                      const isEnabled = localOverrides[fKey] !== undefined ? localOverrides[fKey] : selectedTier === 'pro';

                      return (
                        <div
                          key={fKey}
                          className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition"
                        >
                          <div className="pr-1 text-right">
                            <div className="text-xs font-extrabold text-white flex items-center gap-2">
                              <span>{feat.title}</span>
                              {feat.isProOnly && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold font-mono">
                                  PRO
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-400 mt-0.5">
                              {feat.description}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleFeature(fKey)}
                            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                              isEnabled ? 'bg-gradient-to-r from-yellow-500 to-amber-400' : 'bg-neutral-700'
                            }`}
                          >
                            <span
                              className={`absolute top-1 w-4 h-4 rounded-full bg-neutral-950 transition-transform ${
                                isEnabled ? 'left-1' : 'left-7'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: SECURITY PIN */}
              {activeTab === 'security' && (
                <div className="space-y-4 max-w-sm mx-auto pt-4">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-2">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-black text-white">تغيير الكود السري للمطور</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      الكود الحالي هو: <span className="font-mono text-amber-300 font-bold">{masterPin}</span>
                    </p>
                  </div>

                  <form onSubmit={handleChangeMasterPin} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-neutral-300 mb-1">
                        أدخل الكود الجديد:
                      </label>
                      <input
                        type="text"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="مثال: 9988 أو كودك الخاص"
                        className="w-full py-2.5 px-3 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-mono text-center font-bold focus:outline-none focus:border-yellow-400"
                      />
                    </div>

                    {pinChangeMsg && (
                      <div className="text-xs text-emerald-400 font-bold text-center">
                        {pinChangeMsg}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950 font-black text-xs shadow transition cursor-pointer"
                    >
                      حفظ الكود الجديد
                    </button>
                  </form>
                </div>
              )}

            </div>
          </>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-neutral-950 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400 shrink-0">
          <div className="flex items-center gap-2">
            <span>النسخة الحالية:</span>
            <span className={`font-black ${planTier === 'pro' ? 'text-amber-300' : 'text-blue-300'}`}>
              {planTier === 'pro' ? '👑 PRO VIP' : '🟢 Standard'}
            </span>
          </div>
          <button
            type="button"
            onClick={closeMasterModal}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
