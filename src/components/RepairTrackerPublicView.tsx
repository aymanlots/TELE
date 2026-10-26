import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  Wrench,
  Clock,
  CheckCircle2,
  Package,
  Phone,
  MessageCircle,
  Calendar,
  ArrowLeft,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { db, getStoreSettings } from '../db';
import { RepairStatus } from '../types';
import {
  decodeRepairTrackingPayload,
  RepairTrackPayload,
  openWhatsAppChat,
} from '../lib/whatsapp';

interface RepairTrackerPublicViewProps {
  rawTrackParam: string;
  repairNoParam?: string | null;
  onExitPublicView?: () => void;
}

export const RepairTrackerPublicView: React.FC<RepairTrackerPublicViewProps> = ({
  rawTrackParam,
  repairNoParam,
  onExitPublicView,
}) => {
  const [data, setData] = useState<RepairTrackPayload | null>(() =>
    decodeRepairTrackingPayload(rawTrackParam)
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');

  const loadLatestStatus = async () => {
    setIsRefreshing(true);
    try {
      const decoded = decodeRepairTrackingPayload(rawTrackParam);
      const targetNo = repairNoParam || decoded?.r || rawTrackParam;
      const settings = await getStoreSettings();

      // 1. Check local IndexedDB (if opened on shop device or synced browser)
      if (targetNo) {
        const localMatch = await db.repairs
          .where('repairNumber')
          .equals(targetNo)
          .first();
        if (localMatch && !localMatch.deleted_at) {
          setData({
            r: localMatch.repairNumber,
            c: localMatch.customerName,
            p: localMatch.customerPhone,
            d: `${localMatch.brand} ${localMatch.model}`.trim(),
            i: localMatch.issue,
            s: localMatch.status,
            t: localMatch.agreedPrice,
            a: localMatch.depositAmount,
            m: localMatch.status === 'delivered' ? 0 : localMatch.remainingAmount,
            dt: localMatch.intakeDate,
            ed: localMatch.expectedDeliveryDate,
            sn: settings.storeName || decoded?.sn || 'Golden Phone Shop',
            sp: settings.phone || decoded?.sp || '',
          });
          setLastSyncedAt(
            new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          );
          setIsRefreshing(false);
          return;
        }
      }

      // 2. Check Supabase cloud if configured & online
      if (targetNo && typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const { supabase } = await import('../lib/supabaseSync');
          if (supabase) {
            const { data: cloudRow } = await supabase
              .from('repairs')
              .select('*')
              .eq('repair_number', targetNo)
              .maybeSingle();
            if (cloudRow) {
              setData({
                r: cloudRow.repair_number || targetNo,
                c: cloudRow.customer_name || decoded?.c || 'زبون المحل',
                p: cloudRow.customer_phone || decoded?.p,
                d: `${cloudRow.brand || ''} ${cloudRow.model || ''}`.trim() || decoded?.d || '',
                i: cloudRow.issue || decoded?.i || '',
                s: (cloudRow.status as RepairStatus) || decoded?.s || 'pending',
                t: Number(cloudRow.agreed_price ?? decoded?.t ?? 0),
                a: Number(cloudRow.deposit_amount ?? decoded?.a ?? 0),
                m:
                  cloudRow.status === 'delivered'
                    ? 0
                    : Number(cloudRow.remaining_amount ?? decoded?.m ?? 0),
                dt: cloudRow.intake_date || decoded?.dt || '',
                ed: cloudRow.expected_delivery_date || decoded?.ed,
                sn: decoded?.sn || settings.storeName || 'Golden Phone Shop',
                sp: decoded?.sp || settings.phone || '',
              });
              setLastSyncedAt(
                new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
              );
              setIsRefreshing(false);
              return;
            }
          }
        } catch {}
      }

      // 3. Fallback to QR encoded payload
      if (decoded) {
        setData({
          ...decoded,
          sn: decoded.sn || settings.storeName || 'Golden Phone Shop',
          sp: decoded.sp || settings.phone || '',
        });
      }
      setLastSyncedAt(
        new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadLatestStatus();
  }, [rawTrackParam, repairNoParam]);

  const getStatusDisplay = (status: RepairStatus) => {
    switch (status) {
      case 'pending':
        return {
          step: 1,
          titleAr: 'قيد الفحص والتشخيص 🔍',
          titleFr: 'En attente de diagnostic',
          descAr: 'تم استلام جهازك بالورشة وهو الآن في مرحلة الفحص الأولي.',
          color: 'from-amber-500/30 to-yellow-500/10 border-amber-400/50 text-amber-300',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        };
      case 'in_progress':
        return {
          step: 2,
          titleAr: 'قيد الإصلاح حالياً 🛠️',
          titleFr: 'Réparation en cours',
          descAr: 'المعلم خدام على التيليفون ديالك دابا في ورشة الإصلاح.',
          color: 'from-blue-500/30 to-cyan-500/10 border-blue-400/50 text-blue-300',
          badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        };
      case 'waiting_parts':
        return {
          step: 2,
          titleAr: 'في انتظار قطعة الغيار 📦',
          titleFr: 'En attente de pièce de rechange',
          descAr: 'كنتسناو توصل بياسة أصلية خاصة بالموديل ديالك باش نكملو الإصلاح.',
          color: 'from-purple-500/30 to-fuchsia-500/10 border-purple-400/50 text-purple-300',
          badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        };
      case 'ready':
        return {
          step: 3,
          titleAr: 'واجد! مرحبا بيك تاخد تيليفونك ✅',
          titleFr: 'Prêt à être récupéré !',
          descAr: 'تم إصلاح جهازك بنجاح وهو جاهز للاستلام في المحل. مرحبا بك!',
          color: 'from-emerald-500/35 to-green-500/10 border-emerald-400 text-[#4ADE80]',
          badgeBg: 'bg-emerald-500/25 text-[#4ADE80] border-emerald-500/50',
        };
      case 'delivered':
        return {
          step: 4,
          titleAr: 'تم تسليم الجهاز للزبون ✨',
          titleFr: 'Appareil livré au client',
          descAr: 'تم استلام الجهاز وخلاص الواجب بالكامل. شكراً لثقتكم بنا!',
          color: 'from-emerald-500/25 to-teal-500/10 border-emerald-400/40 text-emerald-300',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        };
      default:
        return {
          step: 0,
          titleAr: 'ملغى',
          titleFr: 'Annulé',
          descAr: 'تم إلغاء ملف الإصلاح.',
          color: 'from-rose-500/25 to-red-500/10 border-rose-400/40 text-rose-300',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        };
    }
  };

  if (!data) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex flex-col items-center justify-center p-4 bg-black text-white relative"
      >
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <img src="/shop-bg.jpg" alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
        </div>
        <div className="relative z-10 max-w-md w-full bg-black/75 backdrop-blur-2xl border border-yellow-500/30 rounded-[28px] p-6 text-center space-y-4 shadow-2xl">
          <Wrench className="w-12 h-12 text-[#FFD700] mx-auto" />
          <h1 className="text-lg font-black text-white">رابط تتبع الإصلاح غير متوفر</h1>
          <p className="text-xs text-gray-300">
            يرجى التأكد من مسح رمز QR الموجود على توصيل الإصلاح الخاص بك.
          </p>
          {onExitPublicView && (
            <button
              type="button"
              onClick={onExitPublicView}
              className="w-full py-2.5 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black text-xs"
            >
              العودة للتطبيق
            </button>
          )}
        </div>
      </div>
    );
  }

  const stInfo = getStatusDisplay(data.s);
  const steps = [
    { id: 1, label: 'الفحص', icon: Clock },
    { id: 2, label: 'قيد الإصلاح', icon: Wrench },
    { id: 3, label: 'واجد للاستلام', icon: CheckCircle2 },
    { id: 4, label: 'تم التسليم', icon: Package },
  ];

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-black text-white relative"
    >
      {/* Luxury Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img src="/shop-bg.jpg" alt="" className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      </div>

      <div className="relative z-10 w-full max-w-lg space-y-4">
        {/* Top Store Header Pill */}
        <div className="bg-black/70 backdrop-blur-2xl border border-yellow-500/30 rounded-[24px] px-5 py-4 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-black font-black text-lg shadow-lg">
              👑
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black text-[#FFD700]">
                {data.sn || 'Golden Phone Shop'}
              </h1>
              <p className="text-[11px] text-gray-300">
                تتبع حالة الإصلاح المباشر • Suivi Réparation Live
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadLatestStatus}
            disabled={isRefreshing}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-yellow-500/30 text-[#FFD700] transition cursor-pointer"
            title="تحديث الحالة"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Main Repair Status Card */}
        <div className="bg-black/75 backdrop-blur-2xl border border-yellow-500/25 rounded-[28px] p-6 space-y-5 shadow-[0_16px_48px_rgba(0,0,0,0.65)]">
          {/* Repair Number & Date */}
          <div className="flex items-center justify-between border-b border-yellow-500/15 pb-3.5">
            <div>
              <span className="text-[11px] text-gray-400 block">رقم توصيل الإصلاح (N° Dossier)</span>
              <span className="font-mono text-lg font-black text-[#FFD700]">{data.r}</span>
            </div>
            <div className="text-end">
              <span className="text-[11px] text-gray-400 block">تاريخ الإيداع</span>
              <span className="font-mono text-xs font-bold text-white flex items-center gap-1 justify-end">
                <Calendar className="w-3.5 h-3.5 text-[#FFD700]" />
                {data.dt}
              </span>
            </div>
          </div>

          {/* Big Highlighted Live Status Banner */}
          <div
            className={`p-4 rounded-[20px] bg-gradient-to-br ${stInfo.color} border text-center space-y-1.5 shadow-lg`}
          >
            <div className="text-base sm:text-lg font-black">{stInfo.titleAr}</div>
            <div className="text-xs font-semibold opacity-90">{stInfo.titleFr}</div>
            <p className="text-xs text-white/90 pt-1 leading-relaxed">{stInfo.descAr}</p>
          </div>

          {/* 4-Step Visual Progress Tracker */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            {steps.map((s) => {
              const Icon = s.icon;
              const isCompleted = stInfo.step >= s.id;
              const isCurrent = stInfo.step === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex flex-col items-center p-2.5 rounded-2xl border text-center transition ${
                    isCurrent
                      ? 'bg-yellow-500/20 border-[#FFD700] text-[#FFD700] scale-105 shadow-md'
                      : isCompleted
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-[#4ADE80]'
                      : 'bg-white/5 border-white/10 text-gray-500'
                  }`}
                >
                  <Icon className="w-4 h-4 mb-1" />
                  <span className="text-[10px] font-bold leading-tight">{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* Device & Customer Info */}
          <div className="p-4 rounded-[20px] bg-white/5 border border-yellow-500/20 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">الزبون (Client) :</span>
              <span className="font-bold text-white">{data.c}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">الجهاز (Appareil) :</span>
              <span className="font-black text-[#FFD700] flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                {data.d}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4 pt-1 border-t border-white/10">
              <span className="text-gray-400 shrink-0">العطب (Panne) :</span>
              <span className="font-semibold text-gray-200 text-end">{data.i}</span>
            </div>
            {data.ed && data.s !== 'delivered' && (
              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <span className="text-gray-400">موعد التسليم المتوقع :</span>
                <span className="font-mono font-bold text-[#4ADE80]">{data.ed}</span>
              </div>
            )}
          </div>

          {/* Financial Summary */}
          <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-[20px] bg-black/60 border border-yellow-500/25 text-center">
            <div>
              <span className="text-[10px] text-gray-400 block">التكلفة الإجمالية</span>
              <span className="font-mono font-black text-sm text-white" dir="ltr">
                {data.t} DH
              </span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">التسبيق المؤدى</span>
              <span className="font-mono font-black text-sm text-[#4ADE80]" dir="ltr">
                {data.a} DH
              </span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 block">الباقي للأداء</span>
              <span
                className={`font-mono font-black text-sm ${
                  data.m > 0 ? 'text-[#FFD700]' : 'text-[#4ADE80]'
                }`}
                dir="ltr"
              >
                {data.m} DH
              </span>
            </div>
          </div>

          {/* Contact Shop via WhatsApp or Call */}
          {data.sp && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() =>
                  openWhatsAppChat(
                    data.sp!,
                    `السلام عليكم، بغيت نستفسر على حالة إصلاح التيليفون ديالي (${data.d}) رقم التوصيل: ${data.r}`
                  )
                }
                className="py-3 px-4 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>تواصل عبر واتساب</span>
              </button>

              <a
                href={`tel:${data.sp}`}
                className="py-3 px-4 rounded-full bg-white/10 hover:bg-white/20 border border-yellow-500/30 text-[#FFD700] font-black text-xs flex items-center justify-center gap-2 transition"
              >
                <Phone className="w-4 h-4" />
                <span dir="ltr">{data.sp}</span>
              </a>
            </div>
          )}

          {lastSyncedAt && (
            <div className="text-center text-[10px] text-gray-400 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-[#FFD700]" />
              <span>آخر تحديث للحالة على الساعة {lastSyncedAt}</span>
            </div>
          )}
        </div>

        {/* Button to exit public tracker if previewed inside the shop app */}
        {onExitPublicView && (
          <div className="text-center">
            <button
              type="button"
              onClick={onExitPublicView}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/70 hover:bg-black/90 border border-yellow-500/30 text-xs font-bold text-[#FFD700] transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>العودة إلى لوحة التحكم (فضاء المحل)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
