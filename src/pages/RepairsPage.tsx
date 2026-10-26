import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Wrench,
  Plus,
  Search,
  Printer,
  CheckCircle2,
  Clock,
  PackageCheck,
  AlertCircle,
  Eye,
  EyeOff,
  Phone,
  Smartphone,
  Check,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  FileText,
  DollarSign,
  Calendar,
  MessageCircle,
  Cpu,
  Trash2,
  Edit2,
  X,
  Users,
  QrCode,
  ExternalLink,
  Copy,
  Lock,
} from 'lucide-react';
import {
  db,
  createRepairOrder,
  updateRepairStatus,
  updateRepairAgreedPrice,
  updateRepairTechnician,
  deliverRepairOrder,
  getStoreSettings,
  addPartToRepair,
  removePartFromRepair,
  cancelOrDeleteRepairOrder,
  reserveNumber,
} from '../db';
import { RepairOrder, RepairStatus, SparePart, UsedSparePart, ApprovalActionType } from '../types';
import { useI18n } from '../i18n';
import { useViewMode } from '../lib/viewMode';
import { useAccessAuth } from '../lib/accessAuth';
import { useToast } from '../components/Toast';
import { GlassKpiCard, GoldWrench3D } from '../components/GoldenGlassUI';
import { formatMAD } from '../lib/currency';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdminApprovalModal } from '../components/AdminApprovalModal';
import { getMoroccoDateString } from '../lib/dateUtils';
import { decryptSensitiveData } from '../lib/cryptoUtils';
import {
  openWhatsAppChat,
  renderWhatsAppMessage,
  DEFAULT_WHATSAPP_TEMPLATES_AR,
  DEFAULT_WHATSAPP_TEMPLATES_FR,
  buildRepairTrackingUrl,
} from '../lib/whatsapp';
import { generateQrCodeDataUrl } from '../lib/code128';
import { ScanButton } from '../components/ScanButton';
import { ReceiptPrintModal } from '../components/ReceiptPrintModal';

interface RepairsPageProps {
  initialSearch?: string;
}

export const RepairsPage: React.FC<RepairsPageProps> = ({ initialSearch }) => {
  const { t, language } = useI18n();
  const { isMobileMode } = useViewMode();
  const { can } = useAccessAuth();
  const { success, error } = useToast();

  const [search, setSearch] = useState(initialSearch || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(20);

  // Intake Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [imei, setImei] = useState('');
  const [issue, setIssue] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [lockCode, setLockCode] = useState('');
  const [showLockCode, setShowLockCode] = useState(false);
  const [agreedPrice, setAgreedPrice] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [intakeDate, setIntakeDate] = useState<string>(getMoroccoDateString());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return getMoroccoDateString(d);
  });
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [technicianCommissionRate, setTechnicianCommissionRate] = useState<number>(40);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deliver Confirmation Modal
  const [deliveringRepair, setDeliveringRepair] = useState<RepairOrder | null>(null);
  const [collectedAmount, setCollectedAmount] = useState<number>(0);
  // L1: Edit Agreed Price & Technician Modal
  const [editingRepairPrice, setEditingRepairPrice] = useState<RepairOrder | null>(null);
  const [editPriceVal, setEditPriceVal] = useState<number>(0);
  const [editNotesVal, setEditNotesVal] = useState<string>('');
  const [editTechName, setEditTechName] = useState<string>('');
  const [editTechRate, setEditTechRate] = useState<number>(0);
  const [receiptPrintRepair, setReceiptPrintRepair] = useState<{
    repair: RepairOrder;
    type: 'deposit' | 'delivery';
  } | null>(null);

  // Technician Commission Summary Modal
  const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false);
  const [commissionPeriod, setCommissionPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');

  // QR Tracking Link Modal
  const [trackingModalRepair, setTrackingModalRepair] = useState<RepairOrder | null>(null);
  const [trackingUrl, setTrackingUrl] = useState('');
  const [trackingQrImg, setTrackingQrImg] = useState('');

  // Live Query from Dexie (decrypts AES-GCM lockCode transparently in memory - Partie 1 #9)
  const repairs =
    useLiveQuery(async () => {
      const raw = await db.repairs.orderBy('id').reverse().toArray();
      const active = raw.filter((r) => !r.deleted_at);
      const decrypted: RepairOrder[] = [];
      for (const r of active) {
        if (r.lockCode) {
          const plain = await decryptSensitiveData(r.lockCode);
          decrypted.push({ ...r, lockCode: plain });
        } else {
          decrypted.push(r);
        }
      }
      return decrypted;
    }, []) || [];
  const allSpareParts =
    useLiveQuery(async () => {
      const all = await db.spareParts.toArray();
      return all.filter((p) => !p.deleted_at);
    }, []) || [];

  // Spare Parts Integration State
  const [partModalRepair, setPartModalRepair] = useState<RepairOrder | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);
  const [partQuantity, setPartQuantity] = useState<number>(1);
  const [partSearch, setPartSearch] = useState<string>('');
  const [removingPartInfo, setRemovingPartInfo] = useState<{
    repairId: number;
    partIndex: number;
    partName: string;
  } | null>(null);
  const [deletingRepair, setDeletingRepair] = useState<RepairOrder | null>(null);

  // Admin Approval Gate for Worker (Edit Agreed Price / Delete Repair)
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
    actionType: 'edit_repair_price',
    targetLabel: '',
    details: '',
    onApproved: () => {},
  });

  // Filtered Repairs
  const filteredRepairs = repairs.filter((r) => {
    const matchesFilter = statusFilter === 'all' || r.status === statusFilter;
    if (!matchesFilter) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      r.repairNumber.toLowerCase().includes(q) ||
      (r.provisionalNumber && r.provisionalNumber.toLowerCase().includes(q)) ||
      r.customerName.toLowerCase().includes(q) ||
      r.customerPhone.includes(q) ||
      r.brand.toLowerCase().includes(q) ||
      r.model.toLowerCase().includes(q) ||
      (r.imei && r.imei.toLowerCase().includes(q))
    );
  });

  const paginatedRepairs = filteredRepairs.slice(0, visibleCount);

  // Calculate automatically remaining amount in intake form
  const remainingCalculated = Math.max(0, agreedPrice - depositAmount);

  // Open Intake Modal
  const handleOpenAdd = () => {
    setCustomerName('');
    setCustomerPhone('');
    setBrand('');
    setModel('');
    setImei('');
    setIssue('');
    setConditionNotes('');
    setLockCode('');
    setShowLockCode(false);
    setAgreedPrice(0);
    setDepositAmount(0);
    setIntakeDate(getMoroccoDateString());
    const d = new Date();
    d.setDate(d.getDate() + 2);
    setExpectedDeliveryDate(getMoroccoDateString(d));
    setTechnicianNotes('');
    setTechnicianName('');
    setTechnicianCommissionRate(40);
    setIsAddOpen(true);
  };

  // Submit Intake Form
  const handleSubmitIntake = async (andPrint: boolean) => {
    if (!customerName.trim() || !customerPhone.trim() || !brand.trim() || !model.trim() || !issue.trim()) {
      error(
        language === 'ar'
          ? 'يرجى ملء معلومات الزبون، الماركة، الموديل، ووصف العطب.'
          : 'Veuillez renseigner le nom, téléphone, marque, modèle et la panne.'
      );
      return;
    }

    if (agreedPrice <= 0) {
      error(
        language === 'ar'
          ? 'يرجى إدخال الثمن المتفق عليه للإصلاح.'
          : 'Veuillez saisir le prix convenu pour la réparation.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const reservedRepairNum = await reserveNumber('repair');
      const newOrder = await createRepairOrder(
        {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          brand: brand.trim(),
          model: model.trim(),
          imei: imei.trim() || undefined,
          issue: issue.trim(),
          conditionNotes: conditionNotes.trim() || undefined,
          lockCode: lockCode.trim() || undefined,
          agreedPrice: Number(agreedPrice) || 0,
          depositAmount: Number(depositAmount) || 0,
          remainingAmount: Math.max(0, (Number(agreedPrice) || 0) - (Number(depositAmount) || 0)),
          intakeDate,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          status: 'pending',
          technicianNotes: technicianNotes.trim() || undefined,
          technicianName: technicianName.trim() || undefined,
          technicianCommissionRate: technicianName.trim() ? Number(technicianCommissionRate) || 0 : undefined,
        },
        reservedRepairNum
      );

      success(
        language === 'ar'
          ? `تم تسجيل الجهاز برقم ${newOrder.repairNumber} بنجاح.`
          : `Appareil enregistré avec succès sous le dossier ${newOrder.repairNumber}.`
      );

      setIsAddOpen(false);

      if (andPrint) {
        const settings = await getStoreSettings();
        const { generateRepairDepositPDF } = await import('../lib/pdfGenerator');
        await generateRepairDepositPDF(newOrder, settings, 'print');
      }
    } catch {
      error(
        language === 'ar'
          ? 'حدث خطأ أثناء تسجيل طلب الإصلاح.'
          : "Erreur lors de l'enregistrement de la réparation."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // One-Click Stage Progression
  const handleQuickNextStatus = async (repair: RepairOrder) => {
    const sequence: RepairStatus[] = ['pending', 'in_progress', 'waiting_parts', 'ready', 'delivered'];
    const currentIdx = sequence.indexOf(repair.status);

    if (currentIdx === -1 || currentIdx >= sequence.length - 1) return;

    const next = sequence[currentIdx + 1];

    if (next === 'delivered') {
      // Open delivery modal to collect remaining balance and record revenue
      setDeliveringRepair(repair);
      setCollectedAmount(repair.remainingAmount);
    } else {
      await updateRepairStatus(repair.id!, next);
      success(t.repairs.statusChanged);
    }
  };

  // Direct status select
  const handleSelectStatus = async (repair: RepairOrder, status: RepairStatus) => {
    if (status === 'delivered') {
      setDeliveringRepair(repair);
      setCollectedAmount(repair.remainingAmount);
    } else {
      await updateRepairStatus(repair.id!, status);
      success(t.repairs.statusChanged);
    }
  };

  // Open Edit Agreed Price & Technician Modal (L1)
  const openEditPriceDirect = (repair: RepairOrder) => {
    setEditingRepairPrice(repair);
    setEditPriceVal(repair.agreedPrice);
    setEditNotesVal(repair.technicianNotes || '');
    setEditTechName(repair.technicianName || '');
    setEditTechRate(repair.technicianCommissionRate ?? 40);
  };

  const handleOpenEditPrice = (repair: RepairOrder) => {
    if (can('edit_records')) {
      openEditPriceDirect(repair);
      return;
    }
    setApprovalConfig({
      isOpen: true,
      actionType: 'edit_repair_price',
      targetId: repair.id,
      targetLabel: `${repair.repairNumber} — ${repair.brand} ${repair.model}`,
      details:
        language === 'ar'
          ? `طلب تعديل الثمن المتفق عليه للإصلاح ${repair.repairNumber} (${repair.customerName} — الثمن الحالي: ${repair.agreedPrice} DH).`
          : `Demande de modification du prix convenu pour ${repair.repairNumber} (${repair.agreedPrice} DH).`,
      onApproved: () => openEditPriceDirect(repair),
    });
  };

  const handleRequestDeleteRepair = (repair: RepairOrder) => {
    if (can('delete_records')) {
      setDeletingRepair(repair);
      return;
    }
    setApprovalConfig({
      isOpen: true,
      actionType: 'delete_repair',
      targetId: repair.id,
      targetLabel: `${repair.repairNumber} — ${repair.brand} ${repair.model}`,
      details:
        language === 'ar'
          ? `طلب إلغاء وحذف ملف الإصلاح ${repair.repairNumber} (${repair.customerName}).`
          : `Demande d'annulation du dossier de réparation ${repair.repairNumber}.`,
      onApproved: () => setDeletingRepair(repair),
    });
  };

  const handleSaveEditPrice = async () => {
    if (!editingRepairPrice || !editingRepairPrice.id) return;
    try {
      let updated = await updateRepairAgreedPrice(
        editingRepairPrice.id,
        Number(editPriceVal),
        editNotesVal.trim() || undefined
      );
      updated = await updateRepairTechnician(
        editingRepairPrice.id,
        editTechName.trim(),
        editTechName.trim() ? Number(editTechRate) || 0 : 0
      );
      success(
        language === 'ar'
          ? `تم تحديث ملف الإصلاح (${updated.agreedPrice} DH).`
          : `Dossier mis à jour : ${updated.agreedPrice} DH.`
      );
      if (deliveringRepair && deliveringRepair.id === updated.id) {
        setDeliveringRepair(updated);
        setCollectedAmount(updated.remainingAmount);
      }
      setEditingRepairPrice(null);
    } catch (err: any) {
      error(
        err?.message ||
          (language === 'ar'
            ? 'حدث خطأ أثناء تعديل الثمن المتفق عليه.'
            : 'Erreur lors de la modification du prix convenu.')
      );
    }
  };

  // Open QR Tracking Modal for a repair
  const handleOpenTrackingQr = async (repair: RepairOrder) => {
    const settings = await getStoreSettings();
    const url = buildRepairTrackingUrl(repair, settings.storeName, settings.phone);
    const qrImg = await generateQrCodeDataUrl(url, 220);
    setTrackingUrl(url);
    setTrackingQrImg(qrImg);
    setTrackingModalRepair(repair);
  };

  // Confirm Delivery and Record Final Revenue
  const handleConfirmDeliver = async () => {
    if (!deliveringRepair || !deliveringRepair.id) return;

    try {
      await deliverRepairOrder(deliveringRepair.id, Number(collectedAmount));
      success(t.repairs.deliveredSuccess);

      // Offer printing delivery receipt
      const settings = await getStoreSettings();
      const { generateRepairDeliveryPDF } = await import('../lib/pdfGenerator');
      await generateRepairDeliveryPDF(
        { ...deliveringRepair, status: 'delivered', remainingAmount: 0 },
        settings,
        'save'
      );

      setDeliveringRepair(null);
    } catch (err: any) {
      error(
        err?.message ||
          (language === 'ar'
            ? 'حدث خطأ أثناء تأكيد تسليم الجهاز.'
            : "Erreur lors de la livraison de l'appareil.")
      );
    }
  };

  // Print Deposit Receipt (Opens Thermal 58mm/80mm/A4 Preview + PDF option)
  const handlePrintDeposit = async (repair: RepairOrder) => {
    setReceiptPrintRepair({ repair, type: 'deposit' });
  };

  // Print Delivery Receipt (Opens Thermal 58mm/80mm/A4 Preview + PDF option)
  const handlePrintDelivery = async (repair: RepairOrder) => {
    setReceiptPrintRepair({ repair, type: 'delivery' });
  };

  // Send WhatsApp Direct Notification
  const handleSendWhatsApp = async (repair: RepairOrder) => {
    if (!repair.customerPhone || !repair.customerPhone.trim()) {
      error(t.whatsapp.noPhoneAlert);
      return;
    }

    try {
      const settings = await getStoreSettings();
      const templates = settings.whatsappTemplates || {};
      const defaultTemplates =
        language === 'ar' ? DEFAULT_WHATSAPP_TEMPLATES_AR : DEFAULT_WHATSAPP_TEMPLATES_FR;

      const template =
        templates.repairReady || defaultTemplates.repairReady;

      const fallbackStoreName = language === 'ar' ? 'متجري' : 'Mon Magasin';
      const storeName = settings.storeName?.trim() || fallbackStoreName;

      const text = renderWhatsAppMessage(template, {
        clientName: repair.customerName,
        model: `${repair.brand} ${repair.model}`,
        remaining: repair.remainingAmount,
        total: repair.agreedPrice,
        storeName,
        repairNumber: repair.repairNumber,
      });

      const opened = openWhatsAppChat(repair.customerPhone, text);
      if (opened) {
        success(language === 'ar' ? 'تم فتح تطبيق واتساب بنجاح.' : 'Discussion WhatsApp ouverte avec succès.');
      } else {
        error(language === 'ar' ? 'رقم الهاتف غير صالح للمراسلة عبر واتساب.' : 'Numéro de téléphone non valide pour WhatsApp.');
      }
    } catch {
      error(language === 'ar' ? 'حدث خطأ أثناء فتح واتساب.' : "Erreur lors de l'ouverture de WhatsApp.");
    }
  };

  // Open Add Spare Part Modal for this repair
  const handleOpenAddPart = (repair: RepairOrder) => {
    setPartModalRepair(repair);
    setSelectedPartId(null);
    setPartQuantity(1);
    setPartSearch('');
  };

  // Confirm Add Part to Repair
  const handleConfirmAddPart = async () => {
    if (!partModalRepair || !partModalRepair.id || !selectedPartId) {
      error(
        language === 'ar'
          ? 'يرجى اختيار القطعة المراد استخدامها.'
          : 'Veuillez sélectionner la pièce à utiliser.'
      );
      return;
    }

    try {
      await addPartToRepair(partModalRepair.id, selectedPartId, Math.max(1, partQuantity));
      success(t.spareParts.partAddedSuccess);
      setPartModalRepair(null);
    } catch (err: any) {
      error(err?.message || (language === 'ar' ? 'حدث خطأ أثناء إضافة القطعة.' : "Erreur lors de l'ajout de la pièce."));
    }
  };

  // Confirm Remove Part from Repair (Restores stock)
  const handleConfirmRemovePart = async () => {
    if (!removingPartInfo) return;
    try {
      await removePartFromRepair(removingPartInfo.repairId, removingPartInfo.partIndex);
      success(t.spareParts.partRemovedSuccess);
      setRemovingPartInfo(null);
    } catch (err: any) {
      error(err?.message || (language === 'ar' ? 'حدث خطأ أثناء إزالة القطعة.' : "Erreur lors du retrait de la pièce."));
    }
  };

  // Confirm Cancel & Delete Repair (Restores all used parts to stock)
  const handleConfirmDeleteRepair = async () => {
    if (!deletingRepair?.id) return;
    try {
      await cancelOrDeleteRepairOrder(deletingRepair.id);
      success(
        language === 'ar'
          ? 'تم إلغاء الإصلاح واسترجاع قطع الغيار المستخدمة إلى المخزون بنجاح.'
          : 'Dossier de réparation annulé et pièces réintégrées au stock avec succès.'
      );
      setDeletingRepair(null);
    } catch (err: any) {
      error(
        err?.message ||
          (language === 'ar'
            ? 'حدث خطأ أثناء إلغاء الإصلاح.'
            : "Erreur lors de l'annulation de la réparation.")
      );
    }
  };

  // Helpers for Status Badges
  const getStatusBadge = (status: RepairStatus) => {
    switch (status) {
      case 'pending':
        return {
          label: t.repairs.pending,
          color: 'bg-neutral-800 text-neutral-300 border-neutral-700',
          dot: 'bg-neutral-400',
        };
      case 'in_progress':
        return {
          label: t.repairs.in_progress,
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs shadow-amber-500/10',
          dot: 'bg-amber-400',
        };
      case 'waiting_parts':
        return {
          label: t.repairs.waiting_parts,
          color: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          dot: 'bg-purple-400',
        };
      case 'ready':
        return {
          label: t.repairs.ready,
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs shadow-emerald-500/10',
          dot: 'bg-emerald-400',
        };
      case 'delivered':
        return {
          label: t.repairs.delivered,
          color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
          dot: 'bg-blue-400',
        };
      case 'cancelled':
      default:
        return {
          label: language === 'ar' ? 'ملغى' : 'Annulé',
          color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          dot: 'bg-rose-400',
        };
    }
  };

  // Counts
  const openRepairsCount = repairs.filter((r) => r.status !== 'delivered').length;
  const readyRepairsCount = repairs.filter((r) => r.status === 'ready').length;

  const deliveredRepairsCount = repairs.filter((r) => r.status === 'delivered').length;

  return (
    <div className="space-y-4">
      {/* 3 Top 3D Gold KPI Cards — Identical to Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassKpiCard
          title={t.repairs.openRepairsCount}
          value={`${openRepairsCount}`}
          subtitle={language === 'ar' ? 'أجهزة قيد الإصلاح بالورشة' : 'appareils en atelier'}
          variant="gold"
          iconType="wrench"
          onClick={() => setStatusFilter('in_progress')}
        />
        <GlassKpiCard
          title={t.repairs.readyRepairsCount}
          value={`${readyRepairsCount}`}
          subtitle={language === 'ar' ? 'واجدة للتسليم للزبناء' : 'prêts à livrer'}
          variant="green"
          iconType="trend"
          onClick={() => setStatusFilter('ready')}
        />
        <GlassKpiCard
          title={t.repairs.deliveredCount}
          value={`${deliveredRepairsCount}`}
          subtitle={`${language === 'ar' ? 'إجمالي الملفات:' : 'Total dossiers:'} ${repairs.length}`}
          variant="white"
          iconType="box"
          onClick={() => setStatusFilter('delivered')}
        />
      </div>

      {/* Search, Stage Filter Tabs & New Repair CTA Glass Bar */}
      <div className="relative overflow-hidden bg-black/65 backdrop-blur-xl border border-yellow-500/20 rounded-[20px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-96">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#FFD700] absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.repairs.searchPlaceholder}
                className="w-full bg-black/60 border border-yellow-500/25 rounded-full ps-10 pe-4 py-2.5 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:border-[#FFD700]"
              />
            </div>
            <ScanButton
              onScan={(code) => setSearch(code.trim())}
              mode="any"
              size="md"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {can('view_profits') && (
              <button
                type="button"
                onClick={() => setIsCommissionModalOpen(true)}
                className="flex items-center justify-center gap-2 rounded-full bg-yellow-500/15 hover:bg-yellow-500/25 text-[#FFD700] border border-yellow-500/35 font-bold transition px-4 py-2.5 text-xs active:scale-95"
              >
                <Users className="w-4 h-4" />
                <span>{language === 'ar' ? 'عمولات المعلمين (Commissions)' : 'Commissions Techniciens'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 hover:from-yellow-400 hover:to-amber-200 text-black font-black transition shadow-[0_4px_15px_rgba(255,215,0,0.3)] px-5 py-2.5 text-xs active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>{t.repairs.newRepair}</span>
            </button>
          </div>
        </div>

        {/* Stage Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto w-full py-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
              statusFilter === 'all'
                ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                : 'bg-black/50 text-gray-300 border border-yellow-500/20 hover:border-yellow-500/40 hover:text-white'
            }`}
          >
            {t.repairs.all} ({repairs.length})
          </button>
          {(['pending', 'in_progress', 'waiting_parts', 'ready', 'delivered'] as RepairStatus[]).map((st) => {
            const count = repairs.filter((r) => r.status === st).length;
            const badge = getStatusBadge(st);
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                  statusFilter === st
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                    : 'bg-black/50 text-gray-300 border border-yellow-500/20 hover:border-yellow-500/40 hover:text-white'
                }`}
              >
                <span>{badge.label}</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-black/30">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Repairs List: Mobile Mode (Glass Cards) vs Desktop Mode (Glassmorphism Table) */}
      {filteredRepairs.length === 0 ? (
        <div className="py-16 text-center text-xs text-gray-400 bg-black/65 backdrop-blur-xl rounded-[20px] border border-yellow-500/20 flex flex-col items-center justify-center gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <GoldWrench3D className="w-16 h-16" />
          <p className="text-sm font-bold text-white">
            {search ? t.repairs.noRepairsSearch : t.repairs.noRepairs}
          </p>
          {!search && (
            <button
              onClick={handleOpenAdd}
              className="mt-1 px-5 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black rounded-full text-xs transition flex items-center gap-1.5 shadow-[0_4px_15px_rgba(255,215,0,0.3)]"
            >
              <Plus className="w-4 h-4" />
              <span>{t.repairs.newRepair}</span>
            </button>
          )}
        </div>
      ) : isMobileMode ? (
        /* Mobile Mode: Large Touch-Friendly Glass Cards */
        <div className="space-y-4">
          {paginatedRepairs.map((repair) => {
            const badge = getStatusBadge(repair.status);
            return (
              <div
                key={repair.id}
                className="p-5 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg font-mono font-black text-xs text-[#FFD700] bg-yellow-500/15 border border-yellow-500/30">
                      {repair.repairNumber}
                    </span>
                    <span className="text-[11px] text-gray-300 font-mono">
                      {repair.intakeDate}
                    </span>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${badge.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    <span>{badge.label}</span>
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-[#FFD700] shrink-0" />
                    <span>{repair.brand} {repair.model}</span>
                  </h3>
                  <div className="flex items-center justify-between text-xs text-gray-200 pt-1">
                    <span className="font-semibold">{repair.customerName}</span>
                    <a
                      href={`tel:${repair.customerPhone}`}
                      className="flex items-center gap-1 text-[#FFD700] font-mono font-bold"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{repair.customerPhone}</span>
                    </a>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-black/60 border border-yellow-500/20 space-y-1.5 text-xs">
                  <div className="text-white">
                    <strong className="text-[#FFD700]">{language === 'ar' ? 'العطب :' : 'Panne :'} </strong>
                    <span>{repair.issue}</span>
                  </div>
                  {repair.conditionNotes && (
                    <div className="text-gray-300 text-[11px]">
                      <strong>{language === 'ar' ? 'الحالة :' : 'État :'} </strong>
                      <span>{repair.conditionNotes}</span>
                    </div>
                  )}
                  {repair.lockCode && (
                    <div className="text-gray-300 text-[11px] font-mono flex items-center gap-1.5">
                      <strong>{language === 'ar' ? 'كود القفل :' : 'Code PIN/Schéma :'} </strong>
                      <span className="text-[#FFD700] font-bold px-1.5 py-0.5 rounded bg-black/80 border border-yellow-500/30">
                        {repair.lockCode}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-black/60 border border-yellow-500/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-[#FFD700]" />
                      <span>{t.spareParts.usedParts}</span>
                      {repair.usedParts && repair.usedParts.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-yellow-500/20 text-[#FFD700] font-mono font-bold">
                          {repair.usedParts.length}
                        </span>
                      )}
                    </span>
                    {repair.status !== 'delivered' && (
                      <button
                        type="button"
                        onClick={() => handleOpenAddPart(repair)}
                        className="px-2.5 py-1 rounded-full bg-yellow-500/15 hover:bg-yellow-500/25 text-[#FFD700] text-xs font-bold flex items-center gap-1 transition active:scale-95 border border-yellow-500/30"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t.spareParts.quickAddUsed}</span>
                      </button>
                    )}
                  </div>

                  {repair.usedParts && repair.usedParts.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {repair.usedParts.map((part, pIdx) => (
                        <div
                          key={pIdx}
                          className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-black/70 border border-yellow-500/15 text-xs"
                        >
                          <div>
                            <span className="font-semibold text-white">
                              {part.name}
                            </span>
                            <span className="text-[10px] text-gray-400 ms-1.5">
                              ({part.brand} {part.model})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {can('view_cost_price') && (
                              <span className="font-mono text-gray-300 text-[11px]">
                                {formatMAD(part.purchasePrice * part.quantity, language)}
                              </span>
                            )}
                            {repair.status !== 'delivered' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRemovingPartInfo({
                                    repairId: repair.id!,
                                    partIndex: pIdx,
                                    partName: part.name,
                                  })
                                }
                                className="p-1 rounded text-gray-400 hover:text-rose-400 transition"
                                title="Retirer la pièce et réintégrer au stock"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {can('view_profits') && (
                        <div className="flex items-center justify-between pt-1.5 border-t border-yellow-500/15 text-xs">
                          <span className="text-gray-300">
                            {t.spareParts.partsCost}:{' '}
                            <span className="font-mono font-bold text-white">
                              {formatMAD(repair.totalPartsCost || 0, language)}
                            </span>
                          </span>
                          <span className="font-bold text-[#22c55e] flex items-center gap-1">
                            <span>{t.spareParts.realProfit}:</span>
                            <span className="font-mono text-xs font-black px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30">
                              {formatMAD(
                                repair.netProfit !== undefined
                                  ? repair.netProfit
                                  : Math.max(0, repair.agreedPrice - (repair.totalPartsCost || 0)),
                                language
                              )}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-400 italic py-0.5">
                      {language === 'ar'
                        ? 'لم يتم تسجيل أي قطع غيار مستعملة لهذا الإصلاح.'
                        : 'Aucune pièce détachée associée à cette réparation.'}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 py-2.5 px-3 bg-black/60 border border-yellow-500/20 rounded-2xl text-center text-xs">
                  <div>
                    <span className="text-[10px] text-gray-400 block">{t.total}</span>
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-mono font-black text-[#FFD700]">
                        {formatMAD(repair.agreedPrice, language)}
                      </span>
                      {repair.status !== 'delivered' && repair.status !== 'cancelled' && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditPrice(repair)}
                          className="p-0.5 rounded text-[#FFD700] hover:bg-yellow-500/20 transition"
                          title={language === 'ar' ? 'تعديل الثمن المتفق عليه' : 'Modifier le prix convenu'}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">{t.repairs.deposit}</span>
                    <span className="font-mono font-bold text-[#22c55e]">
                      {formatMAD(repair.depositAmount, language)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">{t.repairs.remaining}</span>
                    <span className={`font-mono font-bold ${repair.remainingAmount > 0 ? 'text-rose-400' : 'text-[#22c55e]'}`}>
                      {formatMAD(repair.remainingAmount, language)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendWhatsApp(repair)}
                    className="w-full py-2.5 px-4 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md min-h-[44px]"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      {repair.status === 'ready'
                        ? (language === 'ar' ? 'واتساب: الهاتف واجد' : 'WhatsApp : Appareil prêt')
                        : (language === 'ar' ? 'مراسلة عبر واتساب' : 'WhatsApp Client')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTrackingQr(repair)}
                    className="w-full py-2.5 px-4 rounded-full bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/35 text-[#FFD700] font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 min-h-[44px]"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>{language === 'ar' ? 'رابط و QR تتبع للزبون' : 'QR Suivi en direct'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {repair.status !== 'delivered' ? (
                    <button
                      type="button"
                      onClick={() => handleQuickNextStatus(repair)}
                      className="col-span-2 py-3 px-4 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 hover:from-yellow-400 hover:to-amber-200 text-black font-black text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-[0_4px_15px_rgba(255,215,0,0.3)] min-h-[46px]"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {repair.status === 'ready'
                          ? t.repairs.deliverDevice
                          : `${t.repairs.nextStatus} (${getStatusBadge(
                              repair.status === 'pending'
                                ? 'in_progress'
                                : repair.status === 'in_progress'
                                ? 'waiting_parts'
                                : 'ready'
                            ).label})`}
                      </span>
                    </button>
                  ) : (
                    <div className="col-span-2 py-2.5 px-3 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[#22c55e] text-center font-bold text-xs">
                      {t.repairs.delivered} ({repair.actualDeliveryDate || repair.intakeDate})
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handlePrintDeposit(repair)}
                    className="py-2.5 px-3 rounded-full bg-black/60 hover:bg-black/80 border border-yellow-500/25 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 min-h-[44px]"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#FFD700]" />
                    <span>{t.repairs.printDepositReceipt}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintDelivery(repair)}
                    className="py-2.5 px-3 rounded-full bg-black/60 hover:bg-black/80 border border-yellow-500/25 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 min-h-[44px]"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#22c55e]" />
                    <span>{t.repairs.printDeliveryReceipt}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRequestDeleteRepair(repair)}
                    className="col-span-2 py-2 px-3 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                    title={language === 'ar' ? 'إلغاء وحذف الإصلاح' : 'Annuler et supprimer la réparation'}
                  >
                    {!can('delete_records') && <Lock className="w-3 h-3" />}
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'إلغاء الإصلاح واسترجاع القطع' : 'Annuler la réparation (Restituer les pièces)'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop Mode: Wide Glassmorphism Table */
        <div className="relative overflow-hidden rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/25 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-black/70 text-[#FFD700] uppercase text-[11px] font-black tracking-wider border-b border-yellow-500/25">
                <tr>
                  <th className="py-3.5 px-4 text-start">{language === 'ar' ? 'رقم الإصلاح' : 'Dossier'}</th>
                  <th className="py-3.5 px-4 text-start">{t.date}</th>
                  <th className="py-3.5 px-4 text-start">{t.repairs.customerName}</th>
                  <th className="py-3.5 px-4 text-start">{language === 'ar' ? 'الجهاز والعطب' : 'Appareil & Panne'}</th>
                  <th className="py-3.5 px-4 text-start">{language === 'ar' ? 'المرحلة' : 'Étape'}</th>
                  <th className="py-3.5 px-4 text-end">{t.total}</th>
                  <th className="py-3.5 px-4 text-end">{t.repairs.deposit}</th>
                  <th className="py-3.5 px-4 text-end">{t.repairs.remaining}</th>
                  <th className="py-3.5 px-4 text-center">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-500/15">
                {paginatedRepairs.map((repair) => {
                  const badge = getStatusBadge(repair.status);
                  return (
                    <tr key={repair.id} className="hover:bg-yellow-500/10 transition">
                      <td className="py-3.5 px-4 font-mono font-black text-[#FFD700] whitespace-nowrap">
                        {repair.repairNumber}
                      </td>
                      <td className="py-3.5 px-4 text-gray-300 whitespace-nowrap font-mono text-[11px]">
                        <div>{repair.intakeDate}</div>
                        {repair.expectedDeliveryDate && (
                          <div className="text-[10px] text-[#22c55e]">
                            Prévu: {repair.expectedDeliveryDate}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{repair.customerName}</div>
                        <a
                          href={`tel:${repair.customerPhone}`}
                          className="text-[11px] text-gray-300 hover:text-[#FFD700] font-mono transition"
                        >
                          {repair.customerPhone}
                        </a>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-[#FFD700] shrink-0" />
                          <span>{repair.brand} {repair.model}</span>
                        </div>
                        <div className="text-gray-300 text-[11px] truncate mt-0.5" title={repair.issue}>
                          {repair.issue}
                        </div>
                        {repair.lockCode && (
                          <span className="text-[10px] font-mono text-[#FFD700] bg-black/70 px-1.5 py-0.5 rounded border border-yellow-500/25">
                            PIN: {repair.lockCode}
                          </span>
                        )}
                        {repair.usedParts && repair.usedParts.length > 0 && can('view_profits') && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-yellow-500/15 text-[#FFD700] font-mono border border-yellow-500/30">
                              {repair.usedParts.length} {language === 'ar' ? 'قطع مستعملة' : 'pièces'} ({formatMAD(repair.totalPartsCost || 0, language)})
                            </span>
                            <span className="text-[10px] font-bold text-[#22c55e] font-mono">
                              {language === 'ar' ? 'ربح:' : 'Gain:'} {formatMAD(
                                repair.netProfit !== undefined
                                  ? repair.netProfit
                                  : Math.max(0, repair.agreedPrice - (repair.totalPartsCost || 0)),
                                language
                              )}
                            </span>
                          </div>
                        )}
                        {repair.technicianName && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-[#FFD700] border border-amber-500/30 font-bold">
                              👨‍🔧 {repair.technicianName}
                              {can('view_profits')
                                ? ` (${repair.technicianCommissionRate || 0}% = ${formatMAD(repair.technicianCommissionAmount || 0, language)})`
                                : ''}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <select
                            value={repair.status}
                            onChange={(e) => handleSelectStatus(repair, e.target.value as RepairStatus)}
                            className={`py-1 px-2.5 rounded-full text-xs font-bold border cursor-pointer focus:outline-hidden ${badge.color}`}
                          >
                            <option value="pending" className="bg-neutral-900 text-white">{t.repairs.pending}</option>
                            <option value="in_progress" className="bg-neutral-900 text-white">{t.repairs.in_progress}</option>
                            <option value="waiting_parts" className="bg-neutral-900 text-white">{t.repairs.waiting_parts}</option>
                            <option value="ready" className="bg-neutral-900 text-white">{t.repairs.ready}</option>
                            <option value="delivered" className="bg-neutral-900 text-white">{t.repairs.delivered}</option>
                          </select>

                          {repair.status !== 'delivered' && (
                            <button
                              type="button"
                              onClick={() => handleQuickNextStatus(repair)}
                              title={t.repairs.nextStatus}
                              className="p-1.5 rounded-full bg-yellow-500/15 hover:bg-yellow-500/25 text-[#FFD700] border border-yellow-500/30 transition"
                            >
                              <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono whitespace-nowrap">
                        <div className="font-black text-[#FFD700]">
                          {formatMAD(repair.agreedPrice, language)}
                        </div>
                        {repair.totalPartsCost && can('view_cost_price') ? (
                          <div className="text-[10px] text-gray-400">
                            Coût: {formatMAD(repair.totalPartsCost, language)}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono font-bold text-[#22c55e] whitespace-nowrap">
                        {formatMAD(repair.depositAmount, language)}
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono whitespace-nowrap">
                        {repair.remainingAmount > 0 ? (
                          <span className="font-bold text-rose-400">
                            {formatMAD(repair.remainingAmount, language)}
                          </span>
                        ) : (
                          <span className="font-bold text-[#22c55e]">0 DH (Soldé)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenTrackingQr(repair)}
                            className="p-1.5 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-[#FFD700] border border-yellow-500/35 transition"
                            title={language === 'ar' ? 'رابط و QR تتبع الإصلاح للزبون' : 'Lien & QR Suivi Client en direct'}
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSendWhatsApp(repair)}
                            className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-[#22c55e] hover:text-white border border-emerald-500/30 transition shadow-xs"
                            title={
                              repair.status === 'ready'
                                ? (language === 'ar' ? 'إشعار واتساب: الهاتف واجد' : 'Notifier prêt via WhatsApp')
                                : t.whatsapp.send
                            }
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>

                          {repair.status !== 'delivered' && repair.status !== 'cancelled' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditPrice(repair)}
                                className="p-1.5 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-[#FFD700] border border-yellow-500/30 transition"
                                title={language === 'ar' ? 'تعديل الثمن المتفق عليه' : 'Modifier le prix convenu'}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenAddPart(repair)}
                                className="p-1.5 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-[#FFD700] border border-yellow-500/30 transition"
                                title={t.spareParts.quickAddUsed}
                              >
                                <Cpu className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => handlePrintDeposit(repair)}
                            className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-gray-200 hover:text-[#FFD700] border border-yellow-500/20 transition"
                            title={t.repairs.printDepositReceipt}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintDelivery(repair)}
                            className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-gray-200 hover:text-[#22c55e] border border-yellow-500/20 transition"
                            title={t.repairs.printDeliveryReceipt}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestDeleteRepair(repair)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition flex items-center gap-0.5"
                            title={language === 'ar' ? 'إلغاء الإصلاح واسترجاع القطع' : 'Annuler la réparation (Restituer les pièces)'}
                          >
                            {!can('delete_records') && <Lock className="w-2.5 h-2.5" />}
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Load More Pagination */}
      {filteredRepairs.length > visibleCount && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 20)}
            className="px-6 py-2.5 rounded-full bg-black/65 backdrop-blur-xl hover:bg-black/80 border border-yellow-500/30 text-[#FFD700] text-xs font-black transition shadow-lg"
          >
            {language === 'ar'
              ? `عرض المزيد (${filteredRepairs.length - visibleCount} متبقية)`
              : `Voir plus (${filteredRepairs.length - visibleCount} restants)`}
          </button>
        </div>
      )}

      {/* Intake / New Repair Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={t.repairs.newRepair}
        maxWidth="2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmitIntake(true);
          }}
          className="space-y-4 text-xs"
        >
          {/* Section 1: Customer Details */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
            <h3 className="font-bold text-neutral-100 flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-400" />
              <span>{t.repairs.clientInfo}</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.customerName} *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="ex: Mohamed Amrani"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-semibold focus:outline-hidden focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.customerPhone} *
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0612345678"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Device Details & Issue */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
            <h3 className="font-bold text-neutral-100 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-400" />
              <span>{t.repairs.deviceInfo}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.brand} *
                </label>
                <input
                  type="text"
                  required
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="ex: Samsung, Apple, Xiaomi..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-semibold focus:outline-hidden focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.model} *
                </label>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="ex: Galaxy A54, iPhone 13..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-semibold focus:outline-hidden focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.imei}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    placeholder="15 chiffres (optionnel)"
                    className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                  />
                  <ScanButton
                    onScan={(code) => {
                      setImei(code.trim());
                      success(`IMEI: ${code.trim()}`);
                    }}
                    mode="imei"
                    size="md"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-semibold mb-1">
                {t.repairs.issue} *
              </label>
              <textarea
                required
                rows={2}
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                placeholder="ex: Écran cassé et tactile inopérant suite à chute..."
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.condition}
                </label>
                <input
                  type="text"
                  value={conditionNotes}
                  onChange={(e) => setConditionNotes(e.target.value)}
                  placeholder={t.repairs.conditionPlaceholder}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              {/* Lock code (hidden by default) */}
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.lockCode}
                </label>
                <div className="relative">
                  <input
                    type={showLockCode ? 'text' : 'password'}
                    value={lockCode}
                    onChange={(e) => setLockCode(e.target.value)}
                    placeholder="PIN / Mot de passe écran"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg ps-3 pe-10 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLockCode(!showLockCode)}
                    className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-amber-400 transition"
                    title={showLockCode ? t.repairs.hideLockCode : t.repairs.showLockCode}
                  >
                    {showLockCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Financial Pricing & Dates */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
            <h3 className="font-bold text-neutral-100 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span>{t.repairs.financialInfo}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.agreedPrice} *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={agreedPrice || ''}
                  onChange={(e) => setAgreedPrice(parseFloat(e.target.value) || 0)}
                  placeholder="350"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono font-bold focus:outline-hidden focus:border-amber-500/50 text-end"
                />
              </div>

              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.deposit}
                </label>
                <input
                  type="number"
                  min="0"
                  max={agreedPrice}
                  step="0.01"
                  value={depositAmount || ''}
                  onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)}
                  placeholder="100"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-emerald-400 font-mono font-bold focus:outline-hidden focus:border-amber-500/50 text-end"
                />
              </div>

              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.remaining}
                </label>
                <div className="w-full bg-neutral-900/60 border border-neutral-800 rounded-lg px-3 py-2 font-mono font-black text-end text-rose-400 text-sm">
                  {formatMAD(remainingCalculated, language)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.intakeDate}
                </label>
                <input
                  type="date"
                  value={intakeDate}
                  onChange={(e) => setIntakeDate(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {t.repairs.expectedDeliveryDate}
                </label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* Technician Assignment & Commission % */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800">
              <div>
                <label className="block text-amber-400 font-bold mb-1">
                  👨‍🔧 {language === 'ar' ? 'اسم المعلم المكلف بالإصلاح (اختياري)' : 'Nom du Technicien (optionnel)'}
                </label>
                <input
                  type="text"
                  value={technicianName}
                  onChange={(e) => setTechnicianName(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: المعلم أمين / حمزة...' : 'ex: Amine / Hamza...'}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-semibold focus:outline-hidden focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-amber-400 font-bold mb-1">
                  {language === 'ar' ? 'نسبة عمولة المعلم من الربح الصافي (%)' : 'Commission Technicien sur gain net (%)'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={technicianCommissionRate}
                    onChange={(e) => setTechnicianCommissionRate(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                    className="w-24 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-amber-400 font-mono font-bold text-center focus:outline-hidden focus:border-amber-500/50"
                  />
                  {[30, 40, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setTechnicianCommissionRate(pct)}
                      className={`px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold border transition ${
                        technicianCommissionRate === pct
                          ? 'bg-amber-500 text-neutral-950 border-amber-400'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Terms info */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300/90 leading-relaxed">
            {t.repairs.termsNotice}
          </div>

          {/* Form Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold transition"
            >
              {t.cancel}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmitIntake(false)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-100 font-bold border border-neutral-700 transition"
            >
              {t.repairs.saveOnly}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition shadow-md shadow-amber-500/20 active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>{t.repairs.saveAndPrint}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Deliver Confirmation & Final Revenue Encasement Modal */}
      {deliveringRepair && (
        <Modal
          isOpen={!!deliveringRepair}
          onClose={() => setDeliveringRepair(null)}
          title={t.repairs.deliverDevice}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
              <div className="flex justify-between font-bold text-neutral-100">
                <span>{deliveringRepair.brand} {deliveringRepair.model}</span>
                <span className="font-mono text-amber-400">{deliveringRepair.repairNumber}</span>
              </div>
              <div className="text-neutral-400">
                Client : <strong className="text-neutral-200">{deliveringRepair.customerName}</strong> ({deliveringRepair.customerPhone})
              </div>
            </div>

            <p className="text-neutral-300 leading-relaxed">
              {t.repairs.deliverConfirm}
            </p>

            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Prix total réparation :</span>
                <span className="font-mono font-bold text-neutral-100">
                  {formatMAD(deliveringRepair.agreedPrice, language)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Acompte déjà versé :</span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatMAD(deliveringRepair.depositAmount, language)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                <span className="font-bold text-neutral-100">Montant encaissé maintenant (MAD) :</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={collectedAmount}
                  onChange={(e) => setCollectedAmount(parseFloat(e.target.value) || 0)}
                  className="w-28 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1 text-end font-mono font-bold text-emerald-400 text-xs focus:outline-hidden"
                />
              </div>
              <div className="pt-2 flex items-center justify-between text-[11px] text-amber-300/90">
                <span>
                  {language === 'ar'
                    ? 'لمنح تخفيض، عدّل الثمن المتفق عليه أولاً:'
                    : 'Pour accorder une remise, modifiez le prix convenu :'}
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenEditPrice(deliveringRepair)}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold flex items-center gap-1 transition"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{language === 'ar' ? 'تعديل الثمن' : 'Modifier prix convenu'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setDeliveringRepair(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeliver}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold shadow-md shadow-emerald-500/25 active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>{t.confirm}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* L1: Edit Agreed Price Modal */}
      {editingRepairPrice && (
        <Modal
          isOpen={!!editingRepairPrice}
          onClose={() => setEditingRepairPrice(null)}
          title={
            language === 'ar'
              ? `تعديل الثمن المتفق عليه (${editingRepairPrice.repairNumber})`
              : `Modifier le prix convenu (${editingRepairPrice.repairNumber})`
          }
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
              <div className="flex justify-between">
                <span className="text-neutral-400">{language === 'ar' ? 'الجهاز :' : 'Appareil :'}</span>
                <span className="font-bold text-neutral-100">
                  {editingRepairPrice.brand} {editingRepairPrice.model}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">{language === 'ar' ? 'التسبيق المؤدى :' : 'Acompte déjà versé :'}</span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatMAD(editingRepairPrice.depositAmount, language)}
                </span>
              </div>
              <div>
                <label className="block text-neutral-300 font-bold mb-1">
                  {language === 'ar' ? 'الثمن المتفق عليه الجديد (MAD) *' : 'Nouveau prix convenu (MAD) *'}
                </label>
                <input
                  type="number"
                  min={editingRepairPrice.depositAmount || 0}
                  step="0.01"
                  value={editPriceVal}
                  onChange={(e) => setEditPriceVal(parseFloat(e.target.value) || 0)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-end font-mono font-bold text-amber-400 text-sm focus:outline-hidden focus:border-amber-500"
                />
              </div>
              <div className="flex justify-between pt-2 border-t border-neutral-800">
                <span className="font-bold text-neutral-300">
                  {language === 'ar' ? 'الباقي الجديد للأداء :' : 'Nouveau solde restant :'}
                </span>
                <span className="font-mono font-black text-rose-400 text-sm">
                  {formatMAD(
                    Math.max(0, Math.round(((Number(editPriceVal) || 0) - (editingRepairPrice.depositAmount || 0)) * 100) / 100),
                    language
                  )}
                </span>
              </div>
              <div className="pt-2">
                <label className="block text-neutral-400 font-semibold mb-1">
                  {language === 'ar' ? 'ملاحظات (اختياري)' : 'Notes / Motif de remise (optionnel)'}
                </label>
                <input
                  type="text"
                  value={editNotesVal}
                  onChange={(e) => setEditNotesVal(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: تخفيض للزبون...' : 'ex: Remise accordée au client...'}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-neutral-800">
                <div>
                  <label className="block text-amber-400 font-bold mb-1">
                    👨‍🔧 {language === 'ar' ? 'المعلم المكلف' : 'Technicien'}
                  </label>
                  <input
                    type="text"
                    value={editTechName}
                    onChange={(e) => setEditTechName(e.target.value)}
                    placeholder={language === 'ar' ? 'اسم المعلم...' : 'Nom du technicien...'}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-amber-400 font-bold mb-1">
                    {language === 'ar' ? 'نسبة العمولة (%)' : 'Commission (%)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={editTechRate}
                    onChange={(e) => setEditTechRate(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-amber-400 font-mono font-bold text-end"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setEditingRepairPrice(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleSaveEditPrice}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold shadow-md active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>{t.save}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Spare Part Selection Modal */}
      {partModalRepair && (
        <Modal
          isOpen={!!partModalRepair}
          onClose={() => setPartModalRepair(null)}
          title={t.spareParts.selectPartToUse}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            {/* Target Repair Header Banner */}
            <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-neutral-100 text-sm">
                    {partModalRepair.brand} {partModalRepair.model}
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    {partModalRepair.repairNumber} · {partModalRepair.customerName}
                  </div>
                </div>
              </div>
              <div className="text-end">
                <div className="text-[10px] text-neutral-500">{language === 'ar' ? 'سعر الإصلاح' : 'Prix convenu'}</div>
                <div className="font-mono font-bold text-amber-400 text-sm">
                  {formatMAD(partModalRepair.agreedPrice, language)}
                </div>
              </div>
            </div>

            {/* Search Available Stock */}
            <div className="relative">
              <Search className="absolute start-3 top-2.5 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
                placeholder={t.spareParts.searchPlaceholder}
                className="w-full ps-9 pe-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* List of Available Spare Parts */}
            <div className="max-h-60 overflow-y-auto space-y-2 pe-1">
              {allSpareParts.filter((p) => {
                if (p.quantity <= 0) return false;
                if (!partSearch.trim()) return true;
                const q = partSearch.toLowerCase().trim();
                return (
                  p.name.toLowerCase().includes(q) ||
                  p.compatibleBrand.toLowerCase().includes(q) ||
                  p.compatibleModel.toLowerCase().includes(q)
                );
              }).length === 0 ? (
                <div className="py-8 text-center text-neutral-500 text-xs">
                  {language === 'ar'
                    ? 'لا توجد قطع غيار متوفرة في المخزون مطابقة للبحث.'
                    : 'Aucune pièce disponible en stock pour cette recherche.'}
                </div>
              ) : (
                allSpareParts
                  .filter((p) => {
                    if (p.quantity <= 0) return false;
                    if (!partSearch.trim()) return true;
                    const q = partSearch.toLowerCase().trim();
                    return (
                      p.name.toLowerCase().includes(q) ||
                      p.compatibleBrand.toLowerCase().includes(q) ||
                      p.compatibleModel.toLowerCase().includes(q)
                    );
                  })
                  .map((part) => {
                    const isSelected = selectedPartId === part.id;
                    const isBrandMatch =
                      part.compatibleBrand.toLowerCase().includes(partModalRepair.brand.toLowerCase()) ||
                      partModalRepair.brand.toLowerCase().includes(part.compatibleBrand.toLowerCase());

                    return (
                      <div
                        key={part.id}
                        onClick={() => setSelectedPartId(part.id!)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500 shadow-sm shadow-amber-500/10'
                            : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-100">{part.name}</span>
                            {isBrandMatch && (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300">
                                {language === 'ar' ? 'متوافق' : 'Compatible'}
                              </span>
                            )}
                            <span className="text-[10px] text-neutral-400 font-medium">
                              ({part.compatibleBrand} {part.compatibleModel})
                            </span>
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">
                            {language === 'ar' ? 'الجودة :' : 'Qualité :'} {part.quality.toUpperCase()} ·{' '}
                            <span className="text-emerald-400 font-bold font-mono">
                              {part.quantity} {language === 'ar' ? 'متوفرة' : 'en stock'}
                            </span>
                          </div>
                        </div>

                        {can('view_cost_price') && (
                          <div className="text-end">
                            <div className="font-mono font-bold text-amber-400 text-sm">
                              {formatMAD(part.purchasePrice, language)}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              {language === 'ar' ? 'سعر التكلفة' : 'Coût achat'}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>

            {/* Quantity Selector and Profit Preview */}
            {selectedPartId && (
              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-neutral-200">
                    {language === 'ar' ? 'الكمية المستعملة :' : 'Quantité à utiliser :'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={allSpareParts.find((p) => p.id === selectedPartId)?.quantity || 1}
                    value={partQuantity}
                    onChange={(e) => setPartQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1 text-center font-mono font-bold text-neutral-100"
                  />
                </div>

                {/* Calculation breakdown */}
                {can('view_profits') && (() => {
                  const part = allSpareParts.find((p) => p.id === selectedPartId);
                  if (!part) return null;
                  const addedCost = part.purchasePrice * partQuantity;
                  const currentPartsCost = partModalRepair.totalPartsCost || 0;
                  const totalNewCost = currentPartsCost + addedCost;
                  const projectedProfit = Math.max(0, partModalRepair.agreedPrice - totalNewCost);

                  return (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800 text-[11px]">
                      <div>
                        <span className="text-neutral-400 block">{t.spareParts.partsCost} :</span>
                        <span className="font-mono font-bold text-neutral-200">
                          {formatMAD(totalNewCost, language)}
                        </span>
                      </div>
                      <div className="text-end">
                        <span className="text-neutral-400 block">{t.spareParts.realProfit} :</span>
                        <span className="font-mono font-black text-emerald-400 text-xs">
                          {formatMAD(projectedProfit, language)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setPartModalRepair(null)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={!selectedPartId}
                onClick={handleConfirmAddPart}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition shadow-md disabled:opacity-40"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>
                  {language === 'ar'
                    ? 'إضافة للورشة وخصم من المخزون'
                    : 'Ajouter et déduire du stock'}
                </span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Dialog to Remove Used Part and Restore Stock */}
      <ConfirmDialog
        isOpen={!!removingPartInfo}
        onClose={() => setRemovingPartInfo(null)}
        onConfirm={handleConfirmRemovePart}
        title={t.spareParts.restoreStockConfirm}
        message={
          language === 'ar'
            ? `هل تريد إزالة القطعة "${removingPartInfo?.partName}" من هذا الإصلاح وإرجاع كميتها تلقائياً إلى مخزون قطع الغيار؟`
            : `Confirmez-vous le retrait de la pièce "${removingPartInfo?.partName}" de cette réparation et sa réintégration au stock de pièces détachées ?`
        }
        isDestructive={true}
      />

      {/* Confirm Dialog to Cancel/Delete Repair and Restore Stock */}
      <ConfirmDialog
        isOpen={!!deletingRepair}
        onClose={() => setDeletingRepair(null)}
        onConfirm={handleConfirmDeleteRepair}
        title={language === 'ar' ? 'إلغاء وحذف ملف الإصلاح' : 'Annuler et supprimer le dossier'}
        message={
          language === 'ar'
            ? `هل أنت متأكد من إلغاء وحذف ملف الإصلاح (${deletingRepair?.repairNumber})؟ في حال كانت هناك قطع غيار مسجلة في هذا الإصلاح، سيتم إرجاع كمياتها تلقائياً إلى المخزون.`
            : `Confirmez-vous l'annulation et la suppression du dossier (${deletingRepair?.repairNumber}) ? Les pièces de rechange utilisées seront automatiquement réintégrées au stock.`
        }
        confirmLabel={language === 'ar' ? 'نعم، إلغاء واسترجاع المخزون' : 'Oui, annuler & restituer'}
        isDestructive={true}
      />

      {/* Thermal & Browser Repair Receipt Preview / Print Modal */}
      <ReceiptPrintModal
        isOpen={!!receiptPrintRepair}
        onClose={() => setReceiptPrintRepair(null)}
        repair={receiptPrintRepair?.repair || null}
        repairType={receiptPrintRepair?.type || 'deposit'}
      />

      {/* QR Live Tracking Modal for Customer */}
      {trackingModalRepair && (
        <Modal
          isOpen={!!trackingModalRepair}
          onClose={() => setTrackingModalRepair(null)}
          title={
            language === 'ar'
              ? `رابط تتبع الإصلاح بالـ QR Code (${trackingModalRepair.repairNumber})`
              : `Suivi Réparation en Direct (${trackingModalRepair.repairNumber})`
          }
          maxWidth="md"
        >
          <div className="space-y-4 text-xs text-center">
            <div className="p-4 rounded-2xl bg-white text-black inline-block mx-auto shadow-xl">
              {trackingQrImg && (
                <img src={trackingQrImg} alt="Tracking QR" className="w-44 h-44 mx-auto" />
              )}
              <div className="font-mono font-black text-xs mt-1">
                {trackingModalRepair.repairNumber}
              </div>
            </div>

            <p className="text-neutral-300 leading-relaxed">
              {language === 'ar'
                ? 'عند مسح رمز QR من طرف الزبون (أو فتح الرابط)، تفتح له صفحة خاصة به تعرض حالة هاتفه الحالية والتكلفة المتبقية بدون الدخول إلى لوحة تحكم المحل.'
                : 'En scannant ce QR code, le client accède directement à une page mobile dédiée affichant le statut en direct de son téléphone et le reste à payer.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(trackingUrl);
                  success(language === 'ar' ? 'تم نسخ رابط التتبع بنجاح!' : 'Lien de suivi copié !');
                }}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 font-bold transition"
              >
                <Copy className="w-4 h-4" />
                <span>{language === 'ar' ? 'نسخ رابط التتبع' : 'Copier le lien'}</span>
              </button>

              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-700 font-bold transition"
              >
                <ExternalLink className="w-4 h-4 text-amber-400" />
                <span>{language === 'ar' ? 'معاينة صفحة الزبون' : 'Aperçu page client'}</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  const msg =
                    language === 'ar'
                      ? `مرحباً ${trackingModalRepair.customerName}، يمكنك تتبع حالة إصلاح هاتفك (${trackingModalRepair.brand} ${trackingModalRepair.model}) مباشرة عبر هذا الرابط:\n${trackingUrl}`
                      : `Bonjour ${trackingModalRepair.customerName}, suivez l'état de réparation de votre appareil (${trackingModalRepair.brand} ${trackingModalRepair.model}) en direct :\n${trackingUrl}`;
                  openWhatsAppChat(trackingModalRepair.customerPhone, msg);
                }}
                className="sm:col-span-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black transition shadow-lg"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {language === 'ar'
                    ? 'إرسال رابط التتبع المباشر للزبون عبر واتساب'
                    : 'Envoyer le lien de suivi au client sur WhatsApp'}
                </span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Technician Commission Summary Modal */}
      <Modal
        isOpen={isCommissionModalOpen}
        onClose={() => setIsCommissionModalOpen(false)}
        title={
          language === 'ar'
            ? '👨‍🔧 حساب عمولات المعلمين والتقنيين (Commissions)'
            : '👨‍🔧 Calcul des Commissions Techniciens'
        }
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs">
          {/* Period Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-neutral-950 border border-neutral-800">
            <span className="font-bold text-neutral-300">
              {language === 'ar' ? 'الفترة الزمنية :' : 'Période :'}
            </span>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'today', label: language === 'ar' ? 'اليوم' : "Aujourd'hui" },
                  { id: 'week', label: language === 'ar' ? 'آخر 7 أيام' : '7 derniers jours' },
                  { id: 'month', label: language === 'ar' ? 'هذا الشهر' : 'Ce mois' },
                  { id: 'all', label: language === 'ar' ? 'الكل' : 'Tout' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCommissionPeriod(p.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    commissionPeriod === p.id
                      ? 'bg-amber-500 text-neutral-950'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const todayStr = getMoroccoDateString();
            const dWeek = new Date();
            dWeek.setDate(dWeek.getDate() - 7);
            const weekStr = getMoroccoDateString(dWeek);
            const monthPrefix = todayStr.slice(0, 7);

            const periodRepairs = repairs.filter((r) => {
              if (r.status === 'cancelled') return false;
              const refDate = r.actualDeliveryDate || r.intakeDate;
              if (commissionPeriod === 'today') return refDate === todayStr;
              if (commissionPeriod === 'week') return refDate >= weekStr;
              if (commissionPeriod === 'month') return refDate.startsWith(monthPrefix);
              return true;
            });

            const byTech = new Map<
              string,
              {
                name: string;
                totalCount: number;
                deliveredCount: number;
                totalRevenue: number;
                totalPartsCost: number;
                totalNetProfit: number;
                totalCommission: number;
              }
            >();

            for (const r of periodRepairs) {
              const name = r.technicianName?.trim() || (language === 'ar' ? 'غير محدد (المحل)' : 'Non assigné');
              const curr = byTech.get(name) || {
                name,
                totalCount: 0,
                deliveredCount: 0,
                totalRevenue: 0,
                totalPartsCost: 0,
                totalNetProfit: 0,
                totalCommission: 0,
              };
              const partsCost = r.totalPartsCost || 0;
              const netProfit = r.netProfit !== undefined ? r.netProfit : Math.max(0, r.agreedPrice - partsCost);
              const rate = r.technicianCommissionRate || 0;
              const comm =
                r.technicianCommissionAmount !== undefined
                  ? r.technicianCommissionAmount
                  : Math.round(((netProfit * rate) / 100) * 100) / 100;

              curr.totalCount += 1;
              if (r.status === 'delivered' || r.status === 'ready') curr.deliveredCount += 1;
              curr.totalRevenue += r.agreedPrice || 0;
              curr.totalPartsCost += partsCost;
              curr.totalNetProfit += netProfit;
              curr.totalCommission += comm;
              byTech.set(name, curr);
            }

            const rows = Array.from(byTech.values()).sort((a, b) => b.totalCommission - a.totalCommission);

            if (rows.length === 0) {
              return (
                <div className="py-8 text-center text-neutral-400">
                  {language === 'ar'
                    ? 'لا توجد إصلاحات مسجلة في هذه الفترة.'
                    : 'Aucune réparation enregistrée sur cette période.'}
                </div>
              );
            }

            return (
              <div className="overflow-x-auto rounded-xl border border-neutral-800">
                <table className="w-full text-start border-collapse">
                  <thead className="bg-neutral-950 text-amber-400 border-b border-neutral-800">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{language === 'ar' ? 'المعلم / التقني' : 'Technicien'}</th>
                      <th className="py-2.5 px-3 text-center">{language === 'ar' ? 'عدد الهواتف' : 'Appareils'}</th>
                      <th className="py-2.5 px-3 text-end">{language === 'ar' ? 'مجموع الإصلاح' : 'Total Facturé'}</th>
                      <th className="py-2.5 px-3 text-end">{language === 'ar' ? 'تكلفة القطع' : 'Coût Pièces'}</th>
                      <th className="py-2.5 px-3 text-end">{language === 'ar' ? 'الربح الصافي' : 'Gain Net'}</th>
                      <th className="py-2.5 px-3 text-end">{language === 'ar' ? 'حق المعلم (العمولة)' : 'Commission Due'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {rows.map((row) => (
                      <tr key={row.name} className="hover:bg-neutral-900/60">
                        <td className="py-2.5 px-3 font-bold text-white">{row.name}</td>
                        <td className="py-2.5 px-3 text-center font-mono text-neutral-200">
                          {row.totalCount} ({row.deliveredCount} {language === 'ar' ? 'واجد/مسلم' : 'prêts/livrés'})
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono text-neutral-300">
                          {formatMAD(row.totalRevenue, language)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono text-rose-400">
                          {formatMAD(row.totalPartsCost, language)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono font-bold text-emerald-400">
                          {formatMAD(row.totalNetProfit, language)}
                        </td>
                        <td className="py-2.5 px-3 text-end font-mono font-black text-amber-400 text-sm">
                          {formatMAD(row.totalCommission, language)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
            💡{' '}
            {language === 'ar'
              ? 'يتم حساب عمولة المعلم أوتوماتيكياً من الربح الصافي لليد العاملة (الثمن المتفق عليه ناقص ثمن قطع الغيار المستعملة).'
              : "La commission du technicien est calculée automatiquement sur le bénéfice net de main-d'œuvre (Prix convenu moins le coût des pièces détachées)."}
          </div>
        </div>
      </Modal>

      {/* Admin Approval Modal for Worker (Edit Price / Cancel Repair) */}
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

