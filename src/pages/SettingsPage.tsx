import React, { useState, useEffect } from 'react';
import {
  Settings,
  Download,
  Upload,
  RefreshCw,
  Store,
  Shield,
  Smartphone,
  Save,
  CheckCircle2,
  AlertTriangle,
  X,
  FileJson,
  Trash2,
  Lock,
  KeyRound,
  MessageCircle,
  RotateCcw,
  Eye,
  Users,
  UserPlus,
  Cloud,
  Crown,
} from 'lucide-react';
import { useLicensePlan } from '../lib/licensePlan';
import { useAccessAuth } from '../lib/accessAuth';
import { useOnlineStatus } from '../lib/usePWAInstall';
import {
  getStoreSettings,
  saveStoreSettings,
  exportDatabaseJson,
  importDatabaseJson,
  wipeAllDataAndRestart,
  getCurrentShopId,
} from '../db';
import { StoreSettings, ReceiptPaperWidth, ShopMember, UserRole, SubscriptionStatus } from '../types';
import { getRoleLabel } from '../lib/permissions';
import { generateUUID } from '../lib/cryptoUtils';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { useTheme } from '../lib/theme';
import { compressImage } from '../lib/image';
import { usePWAInstall } from '../lib/usePWAInstall';
import {
  DEFAULT_WHATSAPP_TEMPLATES_AR,
  DEFAULT_WHATSAPP_TEMPLATES_FR,
  renderWhatsAppMessage,
} from '../lib/whatsapp';
import {
  syncShopMembersPhoneIndex,
  saveLocalMetaCloudConfig,
  getLocalMetaCloudConfig,
} from '../lib/whatsappCloudApi';
import { doc, setDoc } from 'firebase/firestore';
import { firestore, normalizeShopPhoneNumber } from '../firebase';
import { todayMA, nowMA } from '../lib/dateUtils';

interface SettingsPageProps {
  onSettingsSaved?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onSettingsSaved }) => {
  const { language, setLanguage, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { success, error } = useToast();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const {
    planTier,
    subscriptionType,
    subscriptionEndsAt: planEndsAt,
    daysRemaining,
    licenseKey,
    openMasterModal,
    openUpgradeModal,
  } = useLicensePlan();

  // Settings State
  const [storeName, setStoreName] = useState('');
  const [storeSubtitle, setStoreSubtitle] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [ice, setIce] = useState('');
  const [rc, setRc] = useState('');
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [defaultWarrantyMonths, setDefaultWarrantyMonths] = useState<number>(12);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<ReceiptPaperWidth>('80mm');
  const [lastBackupDate, setLastBackupDate] = useState<string | undefined>(undefined);
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(10);

  // Team & Account State
  const [shopId, setShopId] = useState<string>(() => getCurrentShopId());
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('active');
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState<string>('2027-12-31');
  const [adminName, setAdminName] = useState<string>('');
  const [adminPhone, setAdminPhone] = useState<string>('');
  const [whatsappGatewayUrl, setWhatsappGatewayUrl] = useState<string>('');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState<string>('');
  const [metaAccessToken, setMetaAccessToken] = useState<string>('');
  const [metaTemplateName, setMetaTemplateName] = useState<string>('');
  const [metaTemplateLang, setMetaTemplateLang] = useState<string>('ar');
  const [localMembers, setLocalMembers] = useState<ShopMember[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>('employee');
  const [newMemberPin, setNewMemberPin] = useState('');

  // WhatsApp Message Templates State
  const [repairReadyTemplate, setRepairReadyTemplate] = useState('');
  const [creditReminderTemplate, setCreditReminderTemplate] = useState('');
  const [saleReceiptTemplate, setSaleReceiptTemplate] = useState('');
  const [activeTemplateTab, setActiveTemplateTab] = useState<'repair' | 'credit' | 'receipt'>('repair');

  const { setAutoLockMinutesState, changePin, can, logout, activePhone } = useAccessAuth();
  const isOnline = useOnlineStatus();

  // Dialogs
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importJsonPayload, setImportJsonPayload] = useState<string | null>(null);

  // Change Access Code Modal State
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  useEffect(() => {
    async function load() {
      const s = await getStoreSettings();
      setStoreName(s.storeName || '');
      setStoreSubtitle(s.storeSubtitle || '');
      setAddress(s.address || '');
      setPhone(s.phone || '');
      setIce(s.ice || '');
      setRc(s.rc || '');
      setLogo(s.logo);
      setDefaultWarrantyMonths(s.defaultWarrantyMonths || 12);
      setReceiptPaperWidth(s.receiptPaperWidth || '80mm');
      setLastBackupDate(s.lastBackupDate);
      if (s.autoLockMinutes !== undefined) {
        setAutoLockMinutes(s.autoLockMinutes);
      }
      setShopId(s.shopId || getCurrentShopId());
      setSubscriptionStatus(s.subscriptionStatus || 'active');
      setSubscriptionEndsAt(s.subscriptionEndsAt || '2027-12-31');
      setAdminName(s.adminName || '');
      setAdminPhone(s.adminPhone || s.phone || '');
      setWhatsappGatewayUrl(s.whatsappGatewayUrl || '');
      const localMeta = getLocalMetaCloudConfig();
      setMetaPhoneNumberId(s.metaPhoneNumberId || localMeta.phoneNumberId || '');
      setMetaAccessToken(s.metaAccessToken || localMeta.accessToken || '');
      setMetaTemplateName(s.metaTemplateName || localMeta.templateName || '');
      setMetaTemplateLang(s.metaTemplateLang || localMeta.templateLang || 'ar');
      setLocalMembers(Array.isArray(s.shopMembers) ? s.shopMembers : []);

      // Load WhatsApp Templates
      const defaults =
        (s.language || language) === 'ar' ? DEFAULT_WHATSAPP_TEMPLATES_AR : DEFAULT_WHATSAPP_TEMPLATES_FR;
      const tpls = s.whatsappTemplates || {};
      setRepairReadyTemplate(tpls.repairReady || defaults.repairReady);
      setCreditReminderTemplate(tpls.creditReminder || defaults.creditReminder);
      setSaleReceiptTemplate(tpls.saleReceipt || defaults.saleReceipt);
    }
    load();
  }, [language]);

  // Save Store Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const current = await getStoreSettings();
      const updated: StoreSettings = {
        ...current,
        shopId,
        subscriptionStatus,
        subscriptionEndsAt,
        adminName: adminName.trim() || undefined,
        adminPhone: adminPhone.trim() || phone.trim() || undefined,
        whatsappGatewayUrl: whatsappGatewayUrl.trim() || undefined,
        metaPhoneNumberId: metaPhoneNumberId.trim() || undefined,
        metaAccessToken: metaAccessToken.trim() || undefined,
        metaTemplateName: metaTemplateName.trim() || undefined,
        metaTemplateLang: metaTemplateLang.trim() || 'ar',
        shopMembers: localMembers,
        storeName: storeName.trim(),
        storeSubtitle: storeSubtitle.trim() || undefined,
        address: address.trim(),
        phone: phone.trim(),
        ice: ice.trim() || undefined,
        rc: rc.trim() || undefined,
        logo,
        defaultWarrantyMonths: Number(defaultWarrantyMonths) || 12,
        receiptPaperWidth,
        language,
        theme,
        lastBackupDate,
        autoLockMinutes: Number(autoLockMinutes),
        whatsappTemplates: {
          repairReady: repairReadyTemplate.trim(),
          creditReminder: creditReminderTemplate.trim(),
          saleReceipt: saleReceiptTemplate.trim(),
        },
      };
      await saveStoreSettings(updated);
      saveLocalMetaCloudConfig({
        phoneNumberId: metaPhoneNumberId.trim(),
        accessToken: metaAccessToken.trim(),
        templateName: metaTemplateName.trim(),
        templateLang: metaTemplateLang.trim() || 'ar',
        gatewayWebhookUrl: whatsappGatewayUrl.trim(),
      });

      const targetShopPhone = normalizeShopPhoneNumber(activePhone || shopId || phone);
      if (targetShopPhone) {
        try {
          await setDoc(
            doc(firestore, 'shops', targetShopPhone),
            {
              storeName: storeName.trim() || 'المحل الذهبي',
              adminName: adminName.trim() || 'المدير',
              adminPhone: adminPhone.trim() || targetShopPhone,
              metaPhoneNumberId: metaPhoneNumberId.trim() || null,
              metaAccessToken: metaAccessToken.trim() || null,
              metaTemplateName: metaTemplateName.trim() || null,
              metaTemplateLang: metaTemplateLang.trim() || 'ar',
              whatsappGatewayUrl: whatsappGatewayUrl.trim() || null,
              shopMembers: localMembers,
              updated_at: new Date().toISOString(),
            },
            { merge: true }
          );
          if (metaPhoneNumberId.trim() && metaAccessToken.trim()) {
            await setDoc(
              doc(firestore, 'platform_config', 'whatsapp_cloud_api'),
              {
                phoneNumberId: metaPhoneNumberId.trim(),
                accessToken: metaAccessToken.trim(),
                templateName: metaTemplateName.trim() || null,
                templateLang: metaTemplateLang.trim() || 'ar',
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          }
          await syncShopMembersPhoneIndex(targetShopPhone, storeName.trim(), localMembers);
        } catch {}
      }

      setAutoLockMinutesState(Number(autoLockMinutes));
      success(language === 'ar' ? "تم حفظ إعدادات المحل بنجاح." : "Paramètres du magasin enregistrés avec succès.");
      if (onSettingsSaved) onSettingsSaved();
    } catch {
      error(language === 'ar' ? "حدث خطأ أثناء حفظ الإعدادات." : "Erreur lors de l'enregistrement des paramètres.");
    }
  };

  const insertVariable = (variable: string) => {
    if (activeTemplateTab === 'repair') {
      setRepairReadyTemplate((prev) => prev + variable);
    } else if (activeTemplateTab === 'credit') {
      setCreditReminderTemplate((prev) => prev + variable);
    } else {
      setSaleReceiptTemplate((prev) => prev + variable);
    }
  };

  const handleResetTemplates = () => {
    const defaults = language === 'ar' ? DEFAULT_WHATSAPP_TEMPLATES_AR : DEFAULT_WHATSAPP_TEMPLATES_FR;
    setRepairReadyTemplate(defaults.repairReady);
    setCreditReminderTemplate(defaults.creditReminder);
    setSaleReceiptTemplate(defaults.saleReceipt);
    success(language === 'ar' ? 'تم استرجاع نصوص القوالب الافتراضية.' : 'Modèles réinitialisés par défaut.');
  };

  // Upload Logo with Compression
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 512, 0.92);
      setLogo(compressed);
      success(language === 'ar' ? "تم تحميل الشعار بنجاح." : "Logo chargé avec succès.");
    } catch {
      error(language === 'ar' ? "خطأ أثناء معالجة الشعار." : "Erreur lors du traitement du logo.");
    }
  };

  // Handle Change Access Code
  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinInput.trim().length < 4) {
      error(
        language === 'ar'
          ? 'كلمة المرور الجديدة يجب أن تتكون من 4 أرقام أو أحرف على الأقل.'
          : 'Le nouveau mot de passe doit contenir au moins 4 caractères.'
      );
      return;
    }
    if (newPinInput.trim() !== confirmPinInput.trim()) {
      error(t.lock.codeMismatch);
      return;
    }
    setIsChangingPin(true);
    try {
      const res = await changePin(currentPinInput.trim(), newPinInput.trim());
      if (res.success) {
        success(t.lock.codeChangedSuccess);
        setShowChangePinModal(false);
        setCurrentPinInput('');
        setNewPinInput('');
        setConfirmPinInput('');
      } else if (res.error === 'wrong_current') {
        error(t.lock.wrongCurrentCode);
      } else {
        error(t.lock.invalidCodeFormat);
      }
    } finally {
      setIsChangingPin(false);
    }
  };

  // Clear All Demo Data (Start fresh with empty DB)
  const handleConfirmClear = async () => {
    console.log('[SettingsPage] handleConfirmClear: User confirmed data wipe.');
    try {
      await wipeAllDataAndRestart();
      setShowClearConfirm(false);
      success(language === 'ar' ? t.settings.clearSuccess : "Toutes les données ont été effacées. Redémarrage...");
      if (onSettingsSaved) {
        try {
          await onSettingsSaved();
        } catch (e) {
          console.warn('[SettingsPage] onSettingsSaved warning:', e);
        }
      }
      setTimeout(() => {
        console.log('[SettingsPage] 500ms elapsed. Reloading page to reset all states to zero...');
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error('[SettingsPage] Error in handleConfirmClear:', err);
      error(language === 'ar' ? "حدث خطأ أثناء مسح البيانات." : "Erreur lors de la suppression des données.");
    }
  };

  // Export Database JSON
  const handleExportBackup = async () => {
    try {
      const json = await exportDatabaseJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = todayMA();
      a.href = url;
      const safeName = (storeName.trim() || 'Shop').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${safeName}_Backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Update last backup date
      const nowStr = nowMA();
      setLastBackupDate(nowStr);
      const current = await getStoreSettings();
      await saveStoreSettings({ ...current, lastBackupDate: nowStr });

      success("Sauvegarde JSON exportée avec succès !");
    } catch {
      error("Erreur lors de l'export de la sauvegarde.");
    }
  };

  // Handle Import JSON File Selection
  const handleSelectImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJsonPayload(content);
      setShowImportConfirm(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (!importJsonPayload) return;
    try {
      await importDatabaseJson(importJsonPayload);
      success("Base de données restaurée avec succès !");
      setShowImportConfirm(false);
      setImportJsonPayload(null);
      // reload settings
      const s = await getStoreSettings();
      setStoreName(s.storeName);
      setStoreSubtitle(s.storeSubtitle || '');
      setAddress(s.address);
      setPhone(s.phone);
      setIce(s.ice || '');
      setRc(s.rc || '');
      setLogo(s.logo);
      setDefaultWarrantyMonths(s.defaultWarrantyMonths || 12);
      setLastBackupDate(s.lastBackupDate);
    } catch (err: any) {
      error(err.message || "Erreur lors de l'importation du fichier JSON.");
    }
  };

  // Check if backup is older than 7 days
  const isBackupOutdated = () => {
    if (!lastBackupDate) return true;
    const last = new Date(lastBackupDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 7;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <span>{t.settings.title}</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            {language === 'ar'
              ? 'تخصيص معلومات المحل، إدارة الحسابات، وحماية البيانات المرتبطة برقم الهاتف'
              : "Personnalisez vos informations d'établissement, gérez vos accès et vos préférences"}
          </p>
        </div>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Store Profile & Settings (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSaveSettings} className="p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-4 text-xs">
            <h2 className="text-sm font-bold text-neutral-100 flex items-center gap-2 border-b border-neutral-800 pb-3">
              <Store className="w-4 h-4 text-amber-400" />
              <span>{t.settings.storeInfo}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Store Name */}
              <div className="sm:col-span-2">
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeName}
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder={language === 'ar' ? 'اسم المحل (اتركه فارغاً للافتراضي: متجري)' : 'Nom du magasin (laisser vide pour: Mon Magasin)'}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-semibold focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* 2. Custom Receipt/Bon Logo (Only for printed receipts, App UI always keeps its official icon) */}
              <div className="sm:col-span-2">
                <label className="block text-neutral-200 font-bold mb-1.5">
                  {language === 'ar'
                    ? 'شعار المحل في البونات والفواتير المطبوعة (اختياري)'
                    : 'Logo de la Boutique sur les Bons & Factures Imprimés (Optionnel)'}
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-4 p-3.5 rounded-2xl bg-black/40 border border-amber-500/25">
                  {logo ? (
                    <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-amber-500/60 shrink-0 shadow-lg bg-black group">
                      <img src={logo} alt="Receipt Logo" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setLogo(undefined)}
                        className="absolute inset-0 bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 text-rose-400 transition cursor-pointer"
                        title={language === 'ar' ? 'حذف شعار البونات' : 'Supprimer le logo des bons'}
                      >
                        <X className="w-6 h-6" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-black/50 border-2 border-dashed border-amber-500/40 flex flex-col items-center justify-center text-amber-400 font-black text-2xl uppercase shrink-0 shadow-inner">
                      {(storeName.trim() || (language === 'ar' ? 'متجري' : 'Mon Magasin')).charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 flex flex-col gap-2 w-full">
                    <label className="cursor-pointer">
                      <span className="block px-3.5 py-2.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-center text-amber-300 font-bold transition text-xs">
                        {logo
                          ? language === 'ar'
                            ? 'تغيير شعار البونات والفواتير'
                            : 'Remplacer le logo des bons'
                          : language === 'ar'
                          ? 'تحميل شعار المحل للبونات المطبوعة'
                          : 'Charger un logo pour les bons imprimés'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>

                    {logo && (
                      <button
                        type="button"
                        onClick={() => setLogo(undefined)}
                        className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition cursor-pointer"
                      >
                        {language === 'ar' ? 'حذف شعار البونات' : 'Supprimer le logo des bons'}
                      </button>
                    )}

                    <p className="text-[10px] text-amber-300/90 font-semibold leading-relaxed">
                      {language === 'ar'
                        ? 'هذه الصورة تظهر فقط في البونات والفواتير المطبوعة (PDF).'
                        : 'Cette image apparaît uniquement sur les bons et factures imprimés (PDF).'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Address */}
              <div className="sm:col-span-2">
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeAddress}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="ex: Boulevard Mohammed V, Casablanca"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* 4. Phone */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storePhone}
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+212 6 00 00 00 00"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* 5. Subtitle */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeSubtitle}
                </label>
                <input
                  type="text"
                  value={storeSubtitle}
                  onChange={(e) => setStoreSubtitle(e.target.value)}
                  placeholder="ex: Vente & Réparation Smartphones"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* Warranty default */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.defaultWarranty}
                </label>
                <select
                  value={defaultWarrantyMonths}
                  onChange={(e) => setDefaultWarrantyMonths(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                >
                  <option value={0}>0 mois (Sans)</option>
                  <option value={3}>3 mois</option>
                  <option value={6}>6 mois</option>
                  <option value={12}>12 mois (1 an)</option>
                  <option value={24}>24 mois (2 ans)</option>
                </select>
              </div>

              {/* ICE */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeIce}
                </label>
                <input
                  type="text"
                  value={ice}
                  onChange={(e) => setIce(e.target.value)}
                  placeholder="002891456000089"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* RC */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.settings.storeRc}
                </label>
                <input
                  type="text"
                  value={rc}
                  onChange={(e) => setRc(e.target.value)}
                  placeholder="458921 Casa"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* Receipt Paper Width (58mm, 80mm, A4) */}
              <div>
                <label className="block text-amber-400 font-bold mb-1">
                  {language === 'ar'
                    ? 'عرض ورق طباعة الوصل (الطابعة الحرارية / A4)'
                    : 'Format papier reçu (Imprimante thermique / A4)'}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['58mm', '80mm', 'A4'] as ReceiptPaperWidth[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setReceiptPaperWidth(w)}
                      className={`py-2 px-3 rounded-lg font-mono font-bold text-xs border transition ${
                        receiptPaperWidth === w
                          ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-sm'
                          : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-800 flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>{t.save}</span>
              </button>
            </div>
          </form>

          {/* Preferences (Language & Theme) */}
          <div className="p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-4 text-xs">
            <h2 className="text-sm font-bold text-neutral-100 border-b border-neutral-800 pb-3">
              {language === 'ar' ? 'المظهر واللغة' : 'Affichage & Langue'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-300 font-medium mb-1.5">
                  {t.settings.languageSettings}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setLanguage('fr');
                      try {
                        const s = await getStoreSettings();
                        await saveStoreSettings({ ...s, language: 'fr' });
                      } catch {}
                    }}
                    className={`flex-1 py-2 rounded-lg font-semibold border text-center transition cursor-pointer ${
                      language === 'fr'
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    Français (FR)
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setLanguage('ar');
                      try {
                        const s = await getStoreSettings();
                        await saveStoreSettings({ ...s, language: 'ar' });
                      } catch {}
                    }}
                    className={`flex-1 py-2 rounded-lg font-semibold border text-center transition cursor-pointer ${
                      language === 'ar'
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    العربية (الدارجة)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1.5">
                  {t.settings.themeSettings}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setTheme('dark');
                      try {
                        const s = await getStoreSettings();
                        await saveStoreSettings({ ...s, theme: 'dark' });
                      } catch {}
                      success(language === 'ar' ? 'تم تفعيل الوضع الليلي (الداكن).' : 'Mode Sombre activé.');
                    }}
                    className={`flex-1 py-2 rounded-lg font-semibold border text-center transition cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    {t.settings.dark}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setTheme('light');
                      try {
                        const s = await getStoreSettings();
                        await saveStoreSettings({ ...s, theme: 'light' });
                      } catch {}
                      success(language === 'ar' ? 'تم تفعيل الوضع النهاري (الأبيض) على جميع الصفحات.' : 'Mode Clair activé.');
                    }}
                    className={`flex-1 py-2 rounded-lg font-semibold border text-center transition cursor-pointer ${
                      theme === 'light'
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    {t.settings.light}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* License & Plan Tier Management Card (Client View + Secret 5-Click Reseller Trigger on Crown Icon) */}
          <div className="p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  onClick={(e) => {
                    const el = e.currentTarget;
                    const count = Number(el.dataset.clicks || '0') + 1;
                    el.dataset.clicks = String(count);
                    const prevTimer = Number(el.dataset.timer || '0');
                    if (prevTimer) window.clearTimeout(prevTimer);
                    if (count >= 5) {
                      el.dataset.clicks = '0';
                      openMasterModal();
                    } else {
                      const tId = window.setTimeout(() => {
                        el.dataset.clicks = '0';
                      }, 1500);
                      el.dataset.timer = String(tId);
                    }
                  }}
                  className="w-8 h-8 rounded-lg bg-gradient-to-tr from-yellow-600 via-amber-400 to-yellow-200 text-neutral-950 flex items-center justify-center shadow select-none"
                >
                  <Crown className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white">
                    {language === 'ar' ? 'ترخيص وباقة التطبيق' : 'Licence & Version du Logiciel'}
                  </h2>
                  <p className="text-[11px] text-neutral-400">
                    {language === 'ar'
                      ? 'حالة النسخة ومفتاح التفعيل الرسمي'
                      : "État de la version et clé d'activation"}
                  </p>
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full font-black text-[11px] shadow ${
                  planTier === 'pro'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-400 text-neutral-950'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                }`}
              >
                {subscriptionType === 'trial'
                  ? language === 'ar'
                    ? '👑 فترة تجريبية شاملة (30 يوم)'
                    : '👑 Essai Complet VIP (30j)'
                  : planTier === 'pro'
                  ? language === 'ar'
                    ? '👑 النسخة الاحترافية (PRO VIP)'
                    : '👑 Version PRO VIP'
                  : language === 'ar'
                  ? '🟢 النسخة العادية (Standard)'
                  : '🟢 Version Standard'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950/70 p-3.5 rounded-xl border border-white/5">
              <div>
                <span className="text-neutral-400 block text-[11px] mb-0.5">
                  {language === 'ar' ? 'نوع الاشتراك:' : "Type d'abonnement :"}
                </span>
                <span className="text-white font-bold text-xs">
                  {subscriptionType === 'lifetime'
                    ? language === 'ar'
                      ? 'دائم مدى الحياة (À vie)'
                      : 'À vie (Illimité)'
                    : subscriptionType === 'trial'
                    ? `${language === 'ar' ? 'الفترة التجريبية الأولى (30 يوم) تنتهي في:' : "Essai initial (30j) jusqu'au :"} ${planEndsAt}`
                    : subscriptionType === 'monthly'
                    ? `${language === 'ar' ? 'اشتراك شهري ينتهي في:' : 'Mensuel — Expire le :'} ${planEndsAt}`
                    : `${language === 'ar' ? 'اشتراك سنوي ينتهي في:' : 'Annuel — Expire le :'} ${planEndsAt}`}
                </span>
                {daysRemaining !== null && (
                  <span className="text-amber-400 block text-[10px] mt-0.5 font-bold">
                    ({daysRemaining} {language === 'ar' ? 'يوم متبقية' : 'jours restants'})
                  </span>
                )}
              </div>

              <div>
                <span className="text-neutral-400 block text-[11px] mb-0.5">
                  {language === 'ar' ? 'مفتاح التفعيل المسجل:' : "Clé d'activation :"}
                </span>
                <span className="text-amber-300 font-mono font-bold text-xs truncate block">
                  {licenseKey || 'TRIAL-30DAYS-FREE'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => openUpgradeModal('repairs')}
                className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-yellow-300 border border-yellow-500/30 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>
                  {language === 'ar'
                    ? 'إدخال كود تفعيل / ترقية الباقة'
                    : "Entrer une clé d'activation / Passer au PRO"}
                </span>
              </button>
            </div>
          </div>

          {/* Access Security & Auto-Lock Card */}
          <div className="p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-4 text-xs">
            <h2 className="text-sm font-bold text-neutral-100 flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>{t.lock.title}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCurrentPinInput('');
                  setNewPinInput('');
                  setConfirmPinInput('');
                  setShowChangePinModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-xs transition"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{t.lock.changeCodeBtn}</span>
              </button>
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-neutral-300 font-medium mb-1.5">
                  {t.lock.autoLockOption}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 5, label: t.lock.autoLock5min },
                    { value: 10, label: t.lock.autoLock10min },
                    { value: 15, label: t.lock.autoLock15min },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={async () => {
                        setAutoLockMinutes(opt.value);
                        setAutoLockMinutesState(opt.value);
                        try {
                          const s = await getStoreSettings();
                          await saveStoreSettings({ ...s, autoLockMinutes: opt.value });
                          success(language === 'ar' ? "تم تحديث وقت القفل التلقائي." : "Délai de verrouillage automatique mis à jour.");
                          if (onSettingsSaved) onSettingsSaved();
                        } catch {}
                      }}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold border text-center transition ${
                        autoLockMinutes === opt.value
                          ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500 shadow-md shadow-amber-500/20'
                          : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin WhatsApp Recovery & Approval Number */}
              <div className="pt-3 border-t border-neutral-800 space-y-2.5">
                <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {language === 'ar'
                      ? 'رقم واتساب الأدمين (لاسترجاع كلمة المرور التلقائي وموافقات العامل)'
                      : 'WhatsApp Admin (Récupération mot de passe & Approbations)'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-neutral-400 text-[11px] mb-1">
                      {language === 'ar' ? 'اسم الأدمين (المدير)' : 'Nom Admin'}
                    </label>
                    <input
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder={language === 'ar' ? 'أحمد — مول المحل' : 'Ahmed — Admin'}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 text-[11px] mb-1">
                      {language === 'ar' ? 'رقم واتساب الأدمين' : 'Téléphone WhatsApp Admin'}
                    </label>
                    <input
                      type="tel"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      placeholder="06 00 00 00 00"
                      dir="ltr"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-amber-300 font-mono font-bold text-xs"
                    />
                  </div>
                </div>

                {/* Meta WhatsApp Cloud API Configuration for Multi-User 6-Digit OTP */}
                <div className="mt-3 pt-3 border-t border-neutral-800/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5" />
                      <span>
                        {language === 'ar'
                          ? 'ربط Meta WhatsApp Cloud API (إرسال أكواد OTP لنسيان كلمة السر)'
                          : 'Meta WhatsApp Cloud API (Envoi des codes OTP à 6 chiffres)'}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                      OTP 6 أرقام • 5 دقائق • Rate Limit
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-neutral-400 text-[11px] mb-1">
                        {language === 'ar' ? 'Phone Number ID (Meta Cloud API)' : 'Phone Number ID (Meta)'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={metaPhoneNumberId}
                        onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                        placeholder="ex: 109283746512345"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-400 text-[11px] mb-1">
                        {language === 'ar' ? 'اسم قالب OTP في Meta (اختياري)' : 'Nom du modèle OTP (Optionnel)'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={metaTemplateName}
                        onChange={(e) => setMetaTemplateName(e.target.value)}
                        placeholder="ex: otp_verification (أو اتركه فارغاً لرسالة نصية)"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-neutral-400 text-[11px] mb-1">
                        {language === 'ar' ? 'Meta Permanent Access Token (Bearer Token)' : 'Meta Access Token Permanent'}
                      </label>
                      <input
                        type="password"
                        dir="ltr"
                        value={metaAccessToken}
                        onChange={(e) => setMetaAccessToken(e.target.value)}
                        placeholder="EAAGm0PX4ZCpsBA..."
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-amber-300 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveSettings}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs transition cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>
                        {language === 'ar'
                          ? 'حفظ إعدادات Meta WhatsApp Cloud API'
                          : 'Enregistrer la configuration Meta Cloud API'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* WhatsApp Message Templates Customizer Card */}
          <div className="p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-neutral-100">
                  {t.whatsapp.templates}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleResetTemplates}
                className="text-[11px] text-neutral-400 hover:text-amber-400 flex items-center gap-1 transition"
                title={t.whatsapp.resetDefaults}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.whatsapp.resetDefaults}</span>
              </button>
            </div>

            <p className="text-neutral-400 leading-relaxed text-[11px]">
              {t.whatsapp.templatesSubtitle}
            </p>

            {/* Template Selector Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-neutral-950 rounded-xl border border-neutral-800">
              <button
                type="button"
                onClick={() => setActiveTemplateTab('repair')}
                className={`py-2 px-2 rounded-lg text-center font-bold text-[11px] transition ${
                  activeTemplateTab === 'repair'
                    ? 'bg-amber-500 text-neutral-950 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {language === 'ar' ? 'الإصلاح واجد' : 'Réparation prête'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTemplateTab('credit')}
                className={`py-2 px-2 rounded-lg text-center font-bold text-[11px] transition ${
                  activeTemplateTab === 'credit'
                    ? 'bg-amber-500 text-neutral-950 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {language === 'ar' ? 'تذكير الكريدي' : 'Rappel Crédit'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTemplateTab('receipt')}
                className={`py-2 px-2 rounded-lg text-center font-bold text-[11px] transition ${
                  activeTemplateTab === 'receipt'
                    ? 'bg-amber-500 text-neutral-950 shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {language === 'ar' ? 'وصل الشراء' : "Bon d'achat"}
              </button>
            </div>

            {/* Clickable Variable Chips */}
            <div>
              <div className="text-[10px] text-neutral-400 font-semibold mb-1.5">
                {t.whatsapp.availableVariables}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(language === 'ar'
                  ? [
                      '{اسم_الزبون}',
                      '{الموديل}',
                      '{الباقي}',
                      '{اسم_المحل}',
                      '{رقم_البون}',
                      '{المبلغ_الإجمالي}',
                    ]
                  : [
                      '{client_name}',
                      '{modele}',
                      '{reste}',
                      '{nom_magasin}',
                      '{numero_bon}',
                      '{montant_total}',
                    ]
                ).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="px-2 py-1 rounded-md bg-neutral-950 hover:bg-neutral-800 text-amber-300 border border-neutral-800 hover:border-amber-500/50 font-mono text-[11px] transition active:scale-95"
                    title={language === 'ar' ? 'اضغط للإدراج في الرسالة' : 'Cliquer pour insérer'}
                  >
                    + {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Template Textarea */}
            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">
                {activeTemplateTab === 'repair'
                  ? t.whatsapp.repairReadyTemplate
                  : activeTemplateTab === 'credit'
                  ? t.whatsapp.creditReminderTemplate
                  : t.whatsapp.saleReceiptTemplate}
              </label>
              <textarea
                rows={5}
                value={
                  activeTemplateTab === 'repair'
                    ? repairReadyTemplate
                    : activeTemplateTab === 'credit'
                    ? creditReminderTemplate
                    : saleReceiptTemplate
                }
                onChange={(e) => {
                  if (activeTemplateTab === 'repair') {
                    setRepairReadyTemplate(e.target.value);
                  } else if (activeTemplateTab === 'credit') {
                    setCreditReminderTemplate(e.target.value);
                  } else {
                    setSaleReceiptTemplate(e.target.value);
                  }
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-neutral-100 font-mono text-xs focus:outline-hidden focus:border-amber-500/50 leading-relaxed"
                placeholder="اكتب قالب الرسالة هنا..."
              />
            </div>

            {/* Live Message Simulation Preview */}
            <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-emerald-500/20 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                <Eye className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'معاينة تجريبية للرسالة في واتساب :' : 'Aperçu simulé du message WhatsApp :'}</span>
              </div>
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-100 text-[11px] whitespace-pre-wrap leading-relaxed font-sans">
                {renderWhatsAppMessage(
                  activeTemplateTab === 'repair'
                    ? repairReadyTemplate
                    : activeTemplateTab === 'credit'
                    ? creditReminderTemplate
                    : saleReceiptTemplate,
                  {
                    clientName: language === 'ar' ? 'محمد بناني' : 'Mohammed Bennani',
                    model: 'Samsung Galaxy S23 Ultra',
                    remaining: 250,
                    total: 850,
                    storeName: storeName || (language === 'ar' ? 'المحل الذهبي' : 'PhoneStore VIP'),
                    bonNumber: 'G-0142',
                    repairNumber: 'R-0089',
                  }
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Account Data Protection + Team + PWA (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Automatic Account Protection & Reset Panel (Manual JSON export/import removed to prevent trial transfer abuse) */}
          {can('manage_backups') && (
            <div className="p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-4 text-xs">
              <h2 className="text-sm font-bold text-neutral-100 flex items-center gap-2 border-b border-neutral-800 pb-3">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>
                  {language === 'ar'
                    ? 'حماية البيانات المرتبطة برقم الهاتف'
                    : 'Protection Automatique liée au Numéro'}
                </span>
              </h2>

              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-emerald-200 leading-relaxed text-[11px]">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  {language === 'ar'
                    ? 'جميع بيانات المحل (السلعة، المبيعات، الزبناء، الإصلاحات، والأرباح) محفوظة ومحمية تلقائياً في حساب رقم هاتفك. عند فتح حسابك بنفس الرقم والكود السري من أي هاتف أو حاسوب آخر، ستجد كافة بياناتك كاملة دون الحاجة لأي نسخ يدوي.'
                    : 'Toutes les données de votre boutique (stock, ventes, clients, réparations) sont sauvegardées et synchronisées automatiquement sur votre numéro de téléphone.'}
                </div>
              </div>

              {/* Clear All Data Button */}
              {can('delete_records') && (
                <div className="pt-2 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/30 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t.settings.clearAllData}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Worker & Team Accounts Management (Owner only) */}
          {can('manage_users') && (
            <div className="p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-4 text-xs">
              <h2 className="text-sm font-bold text-neutral-100 flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>
                    {language === 'ar'
                      ? 'إدارة حسابات العمال (فريق المحل)'
                      : 'Gestion des comptes employés'}
                  </span>
                </div>
              </h2>

              {/* Add Worker / Admin with WhatsApp Phone & Personal Password/PIN */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newMemberName.trim()) {
                    error(language === 'ar' ? 'المرجو إدخال اسم العامل أو الأدمين.' : 'Veuillez saisir le nom.');
                    return;
                  }
                  if (!newMemberPhone.trim()) {
                    error(language === 'ar' ? 'المرجو إدخال رقم الهاتف (واتساب).' : 'Veuillez saisir le numéro WhatsApp.');
                    return;
                  }
                  if (newMemberPin.trim().length < 4) {
                    error(
                      language === 'ar'
                        ? 'المرجو إدخال كلمة مرور أو رمز سري (4 أرقام/حروف على الأقل).'
                        : 'Le mot de passe ou PIN doit contenir au moins 4 caractères.'
                    );
                    return;
                  }
                  const newMember: ShopMember = {
                    id: generateUUID(),
                    shop_id: shopId,
                    full_name: newMemberName.trim(),
                    phone: newMemberPhone.trim(),
                    role: newMemberRole,
                    pin_code: newMemberPin.trim(),
                    active: true,
                    created_at: new Date().toISOString(),
                  };
                  const updatedMembers = [...localMembers, newMember];
                  setLocalMembers(updatedMembers);
                  const current = await getStoreSettings();
                  await saveStoreSettings({ ...current, shopMembers: updatedMembers });
                  const targetShopPhone = normalizeShopPhoneNumber(activePhone || shopId || phone);
                  if (targetShopPhone) {
                    try {
                      await setDoc(
                        doc(firestore, 'shops', targetShopPhone),
                        { shopMembers: updatedMembers, updated_at: new Date().toISOString() },
                        { merge: true }
                      );
                      await syncShopMembersPhoneIndex(targetShopPhone, storeName.trim(), updatedMembers);
                    } catch {}
                  }
                  setNewMemberName('');
                  setNewMemberPhone('');
                  setNewMemberPin('');
                  success(
                    language === 'ar'
                      ? `تمت إضافة ${newMember.full_name} (${getRoleLabel(newMember.role, 'ar')}) بنجاح!`
                      : `Membre ${newMember.full_name} ajouté avec succès !`
                  );
                }}
                className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5"
              >
                <div className="font-bold text-amber-400 flex items-center gap-1.5 text-[11px]">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>
                    {language === 'ar'
                      ? 'إضافة حساب عامل (أو أدمين) برقم واتساب وكلمة مرور خاصة'
                      : 'Ajouter un compte Employé ou Admin (WhatsApp + Mot de passe)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder={language === 'ar' ? 'الاسم الكامل (مثلاً: أمين — العامل)' : 'Nom complet'}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-neutral-100"
                  />
                  <input
                    type="tel"
                    required
                    value={newMemberPhone}
                    onChange={(e) => setNewMemberPhone(e.target.value)}
                    placeholder={language === 'ar' ? 'رقم الهاتف واتساب (06...)' : 'Numéro WhatsApp (06...)'}
                    dir="ltr"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-amber-300 font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-neutral-100 font-bold"
                  >
                    <option value="employee">
                      {language === 'ar'
                        ? 'العامل (Employé) — الخدمة والستوك زيد/نقص بدون رؤية المال'
                        : 'Employé — Opérations & Stock (+/-) sans finances'}
                    </option>
                    <option value="owner">
                      {language === 'ar'
                        ? 'الأدمين (Admin) — صلاحية كاملة + الأرباح والمالية'
                        : 'Admin — Accès complet & Finances'}
                    </option>
                  </select>

                  <input
                    type="password"
                    required
                    value={newMemberPin}
                    onChange={(e) => setNewMemberPin(e.target.value)}
                    placeholder={language === 'ar' ? 'كلمة المرور / الرمز السري' : 'Mot de passe / Code secret'}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-center font-mono tracking-widest text-amber-300"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition cursor-pointer"
                >
                  {language === 'ar' ? '+ إضافة الحساب وتفعيله' : '+ Ajouter ce compte'}
                </button>
              </form>

              {/* List of Configured Shop Members */}
              {localMembers.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-neutral-300">
                    {language === 'ar'
                      ? `الحسابات المسجلة في المحل (${localMembers.length}) :`
                      : `Comptes enregistrés (${localMembers.length}) :`}
                  </div>
                  {localMembers.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-neutral-100 flex items-center gap-2">
                          <span>{m.full_name}</span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">
                            {getRoleLabel(m.role, language)}
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                          {m.phone ? `WhatsApp: ${m.phone} • ` : ''}PIN: •••••• • {m.active ? (language === 'ar' ? 'نشط' : 'Actif') : (language === 'ar' ? 'معطل' : 'Inactif')}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const next = localMembers.map((item) =>
                              item.id === m.id ? { ...item, active: !item.active } : item
                            );
                            setLocalMembers(next);
                            const current = await getStoreSettings();
                            await saveStoreSettings({ ...current, shopMembers: next });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                            m.active
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                          }`}
                        >
                          {m.active
                            ? language === 'ar'
                              ? 'نشط'
                              : 'Actif'
                            : language === 'ar'
                            ? 'معطل'
                            : 'Inactif'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const next = localMembers.filter((item) => item.id !== m.id);
                            setLocalMembers(next);
                            const current = await getStoreSettings();
                            await saveStoreSettings({ ...current, shopMembers: next });
                            success(language === 'ar' ? 'تم حذف المستخدم.' : 'Membre supprimé.');
                          }}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer"
                          title={language === 'ar' ? 'حذف' : 'Supprimer'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Clean Phone Account Status Card (No technical Firebase details) */}
              <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-300 font-bold text-xs">
                      {language === 'ar' ? 'رقم هاتف الحساب:' : 'Numéro du compte :'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                      />
                      <span>{isOnline ? (language === 'ar' ? 'متصل' : 'Connecté') : language === 'ar' ? 'محلي' : 'Local'}</span>
                    </span>
                  </div>
                  <div className="font-mono font-bold text-amber-400 text-sm" dir="ltr">
                    {activePhone || getCurrentShopId() || phone || '06xxxxxxxx'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    logout();
                    success(language === 'ar' ? 'تم تسجيل الخروج بنجاح.' : 'Déconnecté.');
                  }}
                  className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-bold border border-rose-500/30 cursor-pointer transition shrink-0"
                >
                  {language === 'ar' ? 'تسجيل الخروج / تبديل الرقم' : 'Changer de numéro'}
                </button>
              </div>
            </div>
          )}

          {/* PWA Section */}
          <div className="p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.45)] space-y-3 text-xs">
            <h2 className="text-sm font-bold text-neutral-100 flex items-center gap-2 border-b border-neutral-800 pb-3">
              <Smartphone className="w-4 h-4 text-amber-400" />
              <span>{t.settings.pwaTitle}</span>
            </h2>

            <p className="text-neutral-400 text-[11px] leading-relaxed">
              {t.settings.pwaDesc}
            </p>

            {isInstalled ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{t.settings.alreadyInstalled}</span>
              </div>
            ) : isInstallable ? (
              <button
                onClick={install}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>{t.settings.installApp}</span>
              </button>
            ) : (
              <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-400 text-[11px]">
                Disponible via le menu du navigateur (Chrome / Edge : icône installer dans la barre d'adresse ; Safari : Partager → Sur l'écran d'accueil).
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clear All Data Confirm Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        title={t.settings.clearAllData}
        message={t.settings.clearAllWarning}
        isDestructive={true}
      />

      {/* Change Access Code Modal */}
      {showChangePinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-amber-500/30 p-5 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-neutral-100">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>{t.lock.changeCodeTitle}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePinModal(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleChangePinSubmit} className="space-y-3">
              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.lock.currentCodeLabel}
                </label>
                <input
                  type="password"
                  required
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-center text-base font-mono tracking-widest text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.lock.newCodeLabel}
                </label>
                <input
                  type="password"
                  required
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-center text-base font-mono tracking-widest text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1">
                  {t.lock.confirmCodeLabel}
                </label>
                <input
                  type="password"
                  required
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-center text-base font-mono tracking-widest text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowChangePinModal(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold transition"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isChangingPin}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition disabled:opacity-50"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
