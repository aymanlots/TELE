import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db, getStoreSettings, saveStoreSettings, getOrCreateImmutableTrialEndDate } from '../db';
import {
  PlanTier,
  SubscriptionType,
  SubscriptionStatus,
  PlanFeatureKey,
  PlanFeatureOverrides,
  StoreSettings,
} from '../types';

export interface FeatureMeta {
  key: PlanFeatureKey;
  title: string;
  titleFr: string;
  description: string;
  descriptionFr: string;
  isProOnly: boolean;
}

export const PLAN_FEATURES: Record<PlanFeatureKey, FeatureMeta> = {
  repairs: {
    key: 'repairs',
    title: 'ورشة الإصلاح وتتبع الهواتف',
    titleFr: 'Atelier de Réparation & Suivi Téléphones',
    description: 'إدارة كاملة لطلبات الصيانة، مراحل الفحص، واستلام وتسليم هواتف الزبناء.',
    descriptionFr: 'Gestion complète des réparations, étapes de diagnostic, réception et livraison clients.',
    isProOnly: true,
  },
  spare_parts: {
    key: 'spare_parts',
    title: 'مخزون قطع الغيار',
    titleFr: 'Stock des Pièces Détachées',
    description: 'تتبع الشاشات والبطاريات وكونيكتورات الشحن وجودتها (Original/OLED/Copy).',
    descriptionFr: 'Suivi des écrans, batteries, connecteurs de charge et leur qualité (Original/OLED/Copy).',
    isProOnly: true,
  },
  repair_qr: {
    key: 'repair_qr',
    title: 'تتبع الإصلاح المباشر بالـ QR Code للزبون',
    titleFr: 'Suivi Réparation en Direct par QR Code',
    description: 'توليد رابط وكود QR للزبون لمتابعة حالة هاتفه وتكلفته من هاتفه دون الاتصال بالمحل.',
    descriptionFr: 'Génération de lien et QR code pour que le client suive l’état et le coût de sa réparation.',
    isProOnly: true,
  },
  tech_commission: {
    key: 'tech_commission',
    title: 'نظام عمولة المعلم التلقائي',
    titleFr: 'Commission Automatique du Technicien',
    description: 'حساب نسبة المعلم (30% إلى 50%) تلقائياً من أرباح اليد العاملة وتقارير مستحقاته.',
    descriptionFr: 'Calcul automatique de la part du technicien (30% à 50%) sur la main d’œuvre et rapports.',
    isProOnly: true,
  },
  reprise_contract: {
    key: 'reprise_contract',
    title: 'عقد شراء هاتف مستعمل رسمي (Reprise PDF + CIN)',
    titleFr: 'Contrat Officiel d’Achat Occasion (Reprise PDF + CIN)',
    description: 'طباعة التزام قانوني بيع هاتف مستعمل مع صورة بطاقة التعريف الوطنية والتوقيع لحماية المحل.',
    descriptionFr: 'Impression d’engagement légal de reprise avec photo CIN et signature pour protéger la boutique.',
    isProOnly: true,
  },
  pos_bundles: {
    key: 'pos_bundles',
    title: 'باكات الإكسسوارات السريعة (Bundles)',
    titleFr: 'Packs d’Accessoires Rapides (Bundles)',
    description: 'إنشاء باقات سريعة (بوشيط + زجاجة + شارجور) تنقص من الستوك بكليكة واحدة وبسعر خاص.',
    descriptionFr: 'Création de packs rapides (pochette + incassable + chargeur) déduits du stock en un clic.',
    isProOnly: true,
  },
  whatsapp_reports: {
    key: 'whatsapp_reports',
    title: 'تقرير إقفال الصندوق التلقائي عبر واتساب',
    titleFr: 'Rapport Clôture Caisse Auto via WhatsApp',
    description: 'إرسال ملخص إقفال الكاشة والمبيعات اليومية مباشرة لواتساب مول المحل.',
    descriptionFr: 'Envoi du résumé de clôture de caisse et ventes quotidiennes directement sur le WhatsApp du gérant.',
    isProOnly: true,
  },
  multi_employee: {
    key: 'multi_employee',
    title: 'تعدد حسابات الخدامة وموافقات الأدمين',
    titleFr: 'Multi-Comptes Employés & Approbations Admin',
    description: 'حساب خاص لكل بائع مع إخفاء أثمنة الشراء وطلب موافقة الأدمين عند التعديل أو المسح.',
    descriptionFr: 'Compte dédié par vendeur avec masquage des prix d’achat et validation Admin pour modifications.',
    isProOnly: true,
  },
  advanced_reports: {
    key: 'advanced_reports',
    title: 'التقارير المالية ومخططات الأرباح الصافية',
    titleFr: 'Rapports Financiers & Graphiques Bénéfice Net',
    description: 'تحليل دقيق لأرباح كل سلعة، هوامش الربح، والمصاريف الشهرية والسنوية.',
    descriptionFr: 'Analyse détaillée des bénéfices par article, marges bénéficiaires et charges mensuelles/annuelles.',
    isProOnly: true,
  },
  expenses: {
    key: 'expenses',
    title: 'المصاريف والديون التشغيلية',
    titleFr: 'Charges & Dépenses Opérationnelles',
    description: 'تسجيل مصاريف الكراء، الضو، الماء، ورواتب الخدامة ومصاريف المحل.',
    descriptionFr: 'Enregistrement du loyer, électricité, eau, salaires employés et dépenses de la boutique.',
    isProOnly: true,
  },
};

interface UpgradeContextInfo {
  key: PlanFeatureKey;
  title: string;
  description: string;
}

interface LicensePlanContextType {
  planTier: PlanTier;
  subscriptionType: SubscriptionType;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt?: string;
  planName: string;
  licenseKey?: string;
  resellerWhatsApp: string;
  masterPin: string;
  featureOverrides: PlanFeatureOverrides;
  daysRemaining: number | null;
  isExpired: boolean;
  isPro: boolean;
  isStandard: boolean;
  // Feature gating
  isFeatureAllowed: (feature: PlanFeatureKey) => boolean;
  requireFeature: (feature: PlanFeatureKey, customTitle?: string, customDesc?: string) => boolean;
  // Modals state
  isMasterModalOpen: boolean;
  openMasterModal: () => void;
  closeMasterModal: () => void;
  isUpgradeModalOpen: boolean;
  upgradeContext: UpgradeContextInfo | null;
  openUpgradeModal: (feature: PlanFeatureKey, customTitle?: string, customDesc?: string) => void;
  closeUpgradeModal: () => void;
  // Control actions
  updatePlanSettings: (patch: Partial<StoreSettings>) => Promise<void>;
  generateLicenseKey: (tier: PlanTier, type: SubscriptionType, days?: number) => string;
  activateWithKey: (key: string) => Promise<{ success: boolean; message: string; tier?: PlanTier }>;
  refreshSettings: () => Promise<void>;
}

const LicensePlanContext = createContext<LicensePlanContextType | null>(null);

function calculateDaysRemaining(endDateStr?: string): number | null {
  if (!endDateStr) return null;
  try {
    const end = new Date(endDateStr);
    const now = new Date();
    // Reset time components for clean day diff
    end.setHours(23, 59, 59, 999);
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

// Simple checksum generator for license keys
function computeChecksum(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash % 9000 + 1000).toString(16).toUpperCase().padStart(4, '0');
}

export const LicensePlanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState<UpgradeContextInfo | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const s = await getStoreSettings();
      setSettings(s);
    } catch {
      // fallback
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Secret keyboard shortcut (Ctrl + Shift + M) for the reseller/developer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setIsMasterModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const planTier: PlanTier = settings?.planTier || 'pro';
  const subscriptionType: SubscriptionType = settings?.subscriptionType || 'trial';
  const subscriptionEndsAt = settings?.subscriptionEndsAt || getOrCreateImmutableTrialEndDate();
  const licenseKey = settings?.licenseKey || 'TRIAL-30DAYS-FREE';
  const resellerWhatsApp = settings?.resellerWhatsApp || '0618961387';
  const masterPin = settings?.masterPin || '7788';
  const featureOverrides: PlanFeatureOverrides = settings?.featureOverrides || {};

  const daysRemaining = subscriptionType === 'lifetime' ? null : calculateDaysRemaining(subscriptionEndsAt);
  const isExpired =
    settings?.subscriptionStatus === 'expired' ||
    (subscriptionType !== 'lifetime' && daysRemaining !== null && daysRemaining <= 0);

  const subscriptionStatus: SubscriptionStatus = isExpired
    ? 'expired'
    : subscriptionType === 'trial'
    ? 'trial'
    : 'active';

  const isPro = planTier === 'pro' && !isExpired;
  const isStandard = planTier === 'standard' || isExpired;

  const planName =
    settings?.planName ||
    (planTier === 'pro'
      ? 'النسخة الاحترافية الشاملة PRO VIP'
      : 'النسخة العادية (Standard)');

  const isFeatureAllowed = useCallback(
    (feature: PlanFeatureKey): boolean => {
      // If subscription expired completely, block PRO features
      if (isExpired) return false;

      // Check granular override if set
      if (featureOverrides[feature] !== undefined) {
        return Boolean(featureOverrides[feature]);
      }

      // If PRO tier, all features are enabled
      if (planTier === 'pro') {
        return true;
      }

      // If Standard tier, check if feature is standard or pro
      const meta = PLAN_FEATURES[feature];
      return meta ? !meta.isProOnly : true;
    },
    [isExpired, featureOverrides, planTier]
  );

  const openUpgradeModal = useCallback(
    (feature: PlanFeatureKey, customTitle?: string, customDesc?: string) => {
      const meta = PLAN_FEATURES[feature];
      setUpgradeContext({
        key: feature,
        title: customTitle || meta?.title || 'خاصية متقدمة',
        description: customDesc || meta?.description || 'هذه الميزة حصرية للنسخة الاحترافية PRO.',
      });
      setIsUpgradeModalOpen(true);
    },
    []
  );

  const closeUpgradeModal = useCallback(() => {
    setIsUpgradeModalOpen(false);
    setUpgradeContext(null);
  }, []);

  const requireFeature = useCallback(
    (feature: PlanFeatureKey, customTitle?: string, customDesc?: string): boolean => {
      const allowed = isFeatureAllowed(feature);
      if (!allowed) {
        openUpgradeModal(feature, customTitle, customDesc);
        return false;
      }
      return true;
    },
    [isFeatureAllowed, openUpgradeModal]
  );

  const openMasterModal = useCallback(() => setIsMasterModalOpen(true), []);
  const closeMasterModal = useCallback(() => setIsMasterModalOpen(false), []);

  const updatePlanSettings = useCallback(
    async (patch: Partial<StoreSettings>) => {
      const current = (await getStoreSettings()) || {};
      const updated: StoreSettings = {
        ...current,
        ...patch,
      };
      await saveStoreSettings(updated);
      setSettings(updated);
    },
    []
  );

  // Generate an authentic License Activation Key (Only Monthly 30D, Annual 365D, or Lifetime LIFE)
  const generateLicenseKey = useCallback(
    (tier: PlanTier, type: SubscriptionType, days = 365): string => {
      const tierCode = tier === 'pro' ? 'PRO' : 'STD';
      const typeCode =
        type === 'lifetime'
          ? 'LIFE'
          : type === 'monthly' || days === 30
          ? '30D'
          : '365D';
      const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      const payload = `GOLD-${tierCode}-${typeCode}-${randPart}`;
      const chk = computeChecksum(payload);
      return `${payload}-${chk}`;
    },
    []
  );

  // Activate license with an entered key
  const activateWithKey = useCallback(
    async (rawKey: string): Promise<{ success: boolean; message: string; tier?: PlanTier }> => {
      const clean = rawKey.trim().toUpperCase();
      if (!clean) {
        return { success: false, message: 'يرجى إدخال كود التفعيل.' };
      }

      // Master Backdoor Key for Developer
      if (clean === 'GOLD-PRO-MASTER-7788' || clean === 'GOLD-MASTER-DEV') {
        const patch: Partial<StoreSettings> = {
          planTier: 'pro',
          subscriptionType: 'lifetime',
          subscriptionStatus: 'active',
          subscriptionEndsAt: '2035-12-31',
          planName: 'النسخة الاحترافية الشاملة PRO VIP',
          licenseKey: clean,
        };
        await updatePlanSettings(patch);
        return {
          success: true,
          message: 'تم تفعيل النسخة الاحترافية الشاملة PRO مدى الحياة بنجاح!',
          tier: 'pro',
        };
      }

      const parts = clean.split('-');
      if (parts.length < 5 || parts[0] !== 'GOLD') {
        return { success: false, message: 'كود التفعيل غير صالح. تأكد من إدخال الكود كاملاً.' };
      }

      const tierCode = parts[1]; // PRO or STD
      const typeCode = parts[2]; // LIFE, 365D, 30D
      const payload = parts.slice(0, 4).join('-');
      const providedChk = parts[4];
      const expectedChk = computeChecksum(payload);

      if (providedChk !== expectedChk) {
        return { success: false, message: 'كود التفعيل غير صحيح أو تم التعديل عليه.' };
      }

      const tier: PlanTier = tierCode === 'PRO' ? 'pro' : 'standard';
      let subType: SubscriptionType = 'annual';
      let endsAt = '2027-12-31';

      if (typeCode === 'LIFE') {
        subType = 'lifetime';
        endsAt = '2035-12-31';
      } else {
        const d = parseInt(typeCode.replace(/\D/g, ''), 10) || 365;
        subType = d <= 31 ? 'monthly' : 'annual';
        const target = new Date();
        target.setDate(target.getDate() + d);
        endsAt = target.toISOString().split('T')[0];
      }

      const patch: Partial<StoreSettings> = {
        planTier: tier,
        subscriptionType: subType,
        subscriptionStatus: 'active',
        subscriptionEndsAt: endsAt,
        planName:
          tier === 'pro'
            ? 'النسخة الاحترافية الشاملة PRO VIP'
            : 'النسخة العادية (Standard)',
        licenseKey: clean,
      };

      await updatePlanSettings(patch);
      return {
        success: true,
        message:
          tier === 'pro'
            ? `مبروك! تم تفعيل النسخة الاحترافية (PRO) بنجاح حتى ${endsAt}.`
            : `تم تفعيل النسخة العادية (Standard) بنجاح حتى ${endsAt}.`,
        tier,
      };
    },
    [updatePlanSettings]
  );

  return (
    <LicensePlanContext.Provider
      value={{
        planTier,
        subscriptionType,
        subscriptionStatus,
        subscriptionEndsAt,
        planName,
        licenseKey,
        resellerWhatsApp,
        masterPin,
        featureOverrides,
        daysRemaining,
        isExpired,
        isPro,
        isStandard,
        isFeatureAllowed,
        requireFeature,
        isMasterModalOpen,
        openMasterModal,
        closeMasterModal,
        isUpgradeModalOpen,
        upgradeContext,
        openUpgradeModal,
        closeUpgradeModal,
        updatePlanSettings,
        generateLicenseKey,
        activateWithKey,
        refreshSettings: loadSettings,
      }}
    >
      {children}
    </LicensePlanContext.Provider>
  );
};

export const useLicensePlan = () => {
  const context = useContext(LicensePlanContext);
  if (!context) {
    throw new Error('useLicensePlan must be used within a LicensePlanProvider');
  }
  return context;
};
