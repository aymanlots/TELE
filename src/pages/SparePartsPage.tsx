import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Cpu,
  Plus,
  Search,
  AlertTriangle,
  Boxes,
  Edit2,
  Trash2,
  Layers,
  ShieldCheck,
  TrendingUp,
  Tag,
  Filter,
  ArrowUpDown,
  Smartphone,
  Truck,
  Minus,
  Lock,
} from 'lucide-react';
import {
  db,
  createSparePart,
  updateSparePart,
  deleteSparePart,
} from '../db';
import { SparePart, PartQuality, ApprovalActionType } from '../types';
import { useI18n } from '../i18n';
import { useViewMode } from '../lib/viewMode';
import { useAccessAuth } from '../lib/accessAuth';
import { useToast } from '../components/Toast';
import { formatMAD } from '../lib/currency';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdminApprovalModal } from '../components/AdminApprovalModal';
import { GlassKpiCard, GoldWrench3D } from '../components/GoldenGlassUI';

const COMMON_PART_NAMES = [
  'Écran OLED',
  'Écran Incell / LCD',
  'Batterie',
  'Connecteur de charge',
  'Caméra Arrière',
  'Caméra Avant',
  'Nappe Power / Volume',
  'Haut-parleur / Écouteur',
  'Vitre arrière / Châssis',
  'Micro / Nappe auxiliaire',
];

const COMMON_BRANDS = [
  'Apple (iPhone)',
  'Samsung',
  'Xiaomi / Redmi',
  'Infinix',
  'Oppo',
  'Tecno',
  'Huawei',
  'Realme',
  'Autre',
];

interface SparePartsPageProps {
  initialSearch?: string;
  initialAction?: string;
}

export const SparePartsPage: React.FC<SparePartsPageProps> = ({
  initialSearch,
  initialAction,
}) => {
  const { t, language } = useI18n();
  const { isMobileMode } = useViewMode();
  const { can } = useAccessAuth();
  const { success, error } = useToast();

  const [search, setSearch] = useState(initialSearch || '');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [qualityFilter, setQualityFilter] = useState<string>('all');
  const [onlyLowStock, setOnlyLowStock] = useState<boolean>(false);

  // Modal Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(initialAction === 'add');
  const [editingPart, setEditingPart] = useState<SparePart | null>(null);
  const [name, setName] = useState('');
  const [compatibleBrand, setCompatibleBrand] = useState('');
  const [compatibleModel, setCompatibleModel] = useState('');
  const [quality, setQuality] = useState<PartQuality>('original');
  const [quantity, setQuantity] = useState<number>(1);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [supplierId, setSupplierId] = useState<number | undefined>(undefined);
  const [minAlertQty, setMinAlertQty] = useState<number>(2);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete Confirm
  const [deletingPart, setDeletingPart] = useState<SparePart | null>(null);

  // Admin Approval Gate for Worker (Edit / Delete Spare Part)
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
    actionType: 'edit_spare_part',
    targetLabel: '',
    details: '',
    onApproved: () => {},
  });

  // Live queries
  const spareParts =
    useLiveQuery(
      () =>
        db.spareParts
          .orderBy('id')
          .reverse()
          .toArray()
          .then((arr) => arr.filter((p) => !p.deleted_at)),
      []
    ) || [];
  const suppliers =
    useLiveQuery(
      () => db.suppliers.toArray().then((arr) => arr.filter((s) => !s.deleted_at)),
      []
    ) || [];

  // Open modal for new part
  const handleOpenAdd = () => {
    setEditingPart(null);
    setName('');
    setCompatibleBrand('');
    setCompatibleModel('');
    setQuality('original');
    setQuantity(1);
    setPurchasePrice(0);
    setSellingPrice(0);
    setSupplierId(undefined);
    setMinAlertQty(2);
    setNotes('');
    setIsModalOpen(true);
  };

  // Open modal for editing
  const openEditPartModalDirect = (part: SparePart) => {
    setEditingPart(part);
    setName(part.name);
    setCompatibleBrand(part.compatibleBrand);
    setCompatibleModel(part.compatibleModel);
    setQuality(part.quality);
    setQuantity(part.quantity);
    setPurchasePrice(part.purchasePrice);
    setSellingPrice(part.sellingPrice);
    setSupplierId(part.supplierId);
    setMinAlertQty(part.minAlertQty ?? 2);
    setNotes(part.notes || '');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (part: SparePart) => {
    if (can('edit_records')) {
      openEditPartModalDirect(part);
      return;
    }
    setApprovalConfig({
      isOpen: true,
      actionType: 'edit_spare_part',
      targetId: part.id,
      targetLabel: `${part.name} (${part.compatibleBrand} ${part.compatibleModel})`,
      details:
        language === 'ar'
          ? `طلب تعديل بيانات أو ثمن قطعة الغيار "${part.name}" (${part.compatibleBrand} ${part.compatibleModel}).`
          : `Demande de modification de la pièce "${part.name}".`,
      onApproved: () => openEditPartModalDirect(part),
    });
  };

  const handleRequestDeletePart = (part: SparePart) => {
    if (can('delete_records')) {
      setDeletingPart(part);
      return;
    }
    setApprovalConfig({
      isOpen: true,
      actionType: 'delete_spare_part',
      targetId: part.id,
      targetLabel: `${part.name} (${part.compatibleBrand} ${part.compatibleModel})`,
      details:
        language === 'ar'
          ? `طلب حذف قطعة الغيار "${part.name}" (${part.compatibleBrand} ${part.compatibleModel}) من المخزون.`
          : `Demande de suppression de la pièce "${part.name}" du stock.`,
      onApproved: () => setDeletingPart(part),
    });
  };

  // Save part (Create / Update)
  const handleSavePart = async () => {
    if (!name.trim()) {
      error(
        language === 'ar'
          ? 'يرجى إدخال اسم القطعة (شاشة، بطارية...).'
          : 'Veuillez saisir le nom de la pièce.'
      );
      return;
    }
    if (!compatibleBrand.trim() || !compatibleModel.trim()) {
      error(
        language === 'ar'
          ? 'يرجى تحديد الماركة والموديل المتوافق.'
          : 'Veuillez renseigner la marque et le modèle compatibles.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedSupplier = suppliers.find((s) => s.id === supplierId);

      const partData = {
        name: name.trim(),
        compatibleBrand: compatibleBrand.trim(),
        compatibleModel: compatibleModel.trim(),
        quality,
        quantity: Math.max(0, Number(quantity) || 0),
        purchasePrice: Math.max(0, Number(purchasePrice) || 0),
        sellingPrice: Math.max(0, Number(sellingPrice) || 0),
        supplierId: supplierId ? Number(supplierId) : undefined,
        supplierName: selectedSupplier?.name,
        minAlertQty: Math.max(0, Number(minAlertQty) || 2),
        notes: notes.trim() || undefined,
      };

      if (editingPart && editingPart.id) {
        await updateSparePart(editingPart.id, partData);
        success(language === 'ar' ? 'تم تحديث القطعة بنجاح.' : 'Pièce mise à jour avec succès.');
      } else {
        await createSparePart(partData);
        success(language === 'ar' ? 'تم تسجيل القطعة بنجاح في المخزون.' : 'Pièce ajoutée au stock avec succès.');
      }
      setIsModalOpen(false);
    } catch {
      error(language === 'ar' ? 'حدث خطأ أثناء الحفظ.' : "Erreur lors de l'enregistrement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete part
  const handleConfirmDelete = async () => {
    if (!deletingPart || !deletingPart.id) return;
    try {
      await deleteSparePart(deletingPart.id);
      success(language === 'ar' ? 'تم حذف القطعة من المخزون.' : 'Pièce supprimée du stock.');
      setDeletingPart(null);
    } catch {
      error(language === 'ar' ? 'حدث خطأ أثناء الحذف.' : 'Erreur lors de la suppression.');
    }
  };

  // Quick quantity increment/decrement
  const handleQuickAdjustStock = async (part: SparePart, delta: number) => {
    if (!part.id) return;
    const newQty = Math.max(0, part.quantity + delta);
    await updateSparePart(part.id, { quantity: newQty });
  };

  // Filtered parts
  const filteredParts = spareParts.filter((p) => {
    // Low stock filter
    if (onlyLowStock && p.quantity > (p.minAlertQty ?? 2)) return false;

    // Quality filter
    if (qualityFilter !== 'all' && p.quality !== qualityFilter) return false;

    // Brand filter
    if (brandFilter !== 'all' && p.compatibleBrand.toLowerCase() !== brandFilter.toLowerCase())
      return false;

    // Text search
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      p.compatibleBrand.toLowerCase().includes(q) ||
      p.compatibleModel.toLowerCase().includes(q) ||
      (p.supplierName && p.supplierName.toLowerCase().includes(q))
    );
  });

  // KPI Calculations
  const totalStockValue = spareParts.reduce(
    (acc, p) => acc + p.purchasePrice * p.quantity,
    0
  );
  const totalPiecesCount = spareParts.reduce((acc, p) => acc + p.quantity, 0);
  const lowStockPartsCount = spareParts.filter(
    (p) => p.quantity <= (p.minAlertQty ?? 2)
  ).length;

  // Unique brands for filter
  const uniqueBrands = Array.from(
    new Set(spareParts.map((p) => p.compatibleBrand).filter(Boolean))
  );

  // Quality badge helper
  const getQualityBadge = (q: PartQuality) => {
    switch (q) {
      case 'original':
        return {
          label: t.spareParts.original,
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs shadow-emerald-500/10',
        };
      case 'oem':
        return {
          label: t.spareParts.oem,
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs shadow-amber-500/10',
        };
      case 'copy':
        return {
          label: t.spareParts.copy,
          color: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        };
    }
  };

  return (
    <div className="space-y-4">
      {/* Top 3D Gold KPI Cards — Financial Stock Value strictly hidden from Worker */}
      <div className={`grid grid-cols-1 ${can('view_cost_price') ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
        {can('view_cost_price') && (
          <GlassKpiCard
            title={t.spareParts.totalStockValue}
            value={formatMAD(totalStockValue, language)}
            subtitle={`${spareParts.length} ${language === 'ar' ? 'مرجع مسجل' : 'références'}`}
            variant="gold"
            iconType="money"
          />
        )}
        <GlassKpiCard
          title={t.spareParts.totalPartsCount}
          value={`${totalPiecesCount} PCS`}
          subtitle={language === 'ar' ? 'قطعة غيار متوفرة في المحل' : 'unités physiques en stock'}
          variant="green"
          iconType="box"
        />
        <GlassKpiCard
          title={t.spareParts.lowStockCount}
          value={`${lowStockPartsCount}`}
          subtitle={
            lowStockPartsCount > 0
              ? language === 'ar'
                ? 'تحتاج إعادة طلب عاجلة'
                : 'Sous le seuil de sécurité'
              : language === 'ar'
              ? 'المخزون كافي • 100%'
              : 'Niveau optimal • 100%'
          }
          variant="white"
          iconType="wrench"
          onClick={() => setOnlyLowStock((prev) => !prev)}
        />
      </div>

      {/* Search, Filter & Add Part Glass Bar */}
      <div className="relative overflow-hidden bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.55)] space-y-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FFD700]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.spareParts.searchPlaceholder}
              className="w-full ps-10 pe-4 py-2.5 bg-black/60 border border-yellow-500/25 focus:border-[#FFD700] rounded-full text-xs text-white placeholder-gray-400 focus:outline-hidden"
            />
          </div>

          {/* Brand Filter */}
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="py-2.5 px-3.5 bg-black/60 border border-yellow-500/25 rounded-full text-xs text-white focus:border-[#FFD700] focus:outline-hidden cursor-pointer"
          >
            <option value="all">{t.spareParts.filterBrand}</option>
            {uniqueBrands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Quality Filter */}
          <select
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            className="py-2.5 px-3.5 bg-black/60 border border-yellow-500/25 rounded-full text-xs text-white focus:border-[#FFD700] focus:outline-hidden cursor-pointer"
          >
            <option value="all">{t.spareParts.filterQuality}</option>
            <option value="original">{t.spareParts.original}</option>
            <option value="oem">{t.spareParts.oem}</option>
            <option value="copy">{t.spareParts.copy}</option>
          </select>

          {/* Low Stock Toggle Button */}
          <button
            onClick={() => setOnlyLowStock((prev) => !prev)}
            className={`flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs font-bold transition border ${
              onlyLowStock
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-xs'
                : 'bg-black/60 text-gray-300 border-yellow-500/25 hover:border-yellow-500/40'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${onlyLowStock ? 'text-rose-400' : 'text-[#FFD700]'}`} />
            <span>{t.spareParts.onlyLowStock}</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 hover:from-yellow-400 hover:to-amber-200 text-black font-black text-xs transition shadow-[0_4px_15px_rgba(255,215,0,0.3)] active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>{t.spareParts.addPart}</span>
          </button>
        </div>
      </div>

      {/* Main Parts View: Glass Cards Grid or Glassmorphism Table */}
      {isMobileMode ? (
        <div className="space-y-3">
          {filteredParts.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-3 bg-black/65 backdrop-blur-xl border border-yellow-500/20 rounded-[20px]">
              <GoldWrench3D className="w-16 h-16" />
              <p className="text-sm font-bold text-white">
                {search || brandFilter !== 'all' || qualityFilter !== 'all' || onlyLowStock
                  ? t.spareParts.noPartsSearch
                  : t.spareParts.noParts}
              </p>
            </div>
          ) : (
            filteredParts.map((part) => {
              const qualityBadge = getQualityBadge(part.quality);
              const isLow = part.quantity <= (part.minAlertQty ?? 2);
              const isOut = part.quantity === 0;

              return (
                <div
                  key={part.id}
                  className="p-4 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 space-y-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center shrink-0">
                        <GoldWrench3D className="w-8 h-8" />
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          <span>{part.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${qualityBadge.color}`}
                          >
                            {qualityBadge.label}
                          </span>
                        </div>
                        <div className="text-xs text-gray-300 mt-1 flex items-center gap-1.5 font-medium">
                          <Smartphone className="w-3.5 h-3.5 text-[#FFD700]" />
                          <span>
                            {part.compatibleBrand} · {part.compatibleModel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-end shrink-0">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black font-mono border ${
                          isOut
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : isLow
                            ? 'bg-amber-500/20 text-[#FFD700] border-yellow-500/40'
                            : 'bg-emerald-500/20 text-[#22c55e] border-emerald-500/40'
                        }`}
                      >
                        {part.quantity} pcs
                      </span>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-black/60 border border-yellow-500/20 text-xs font-mono">
                    {can('view_cost_price') && (
                      <div>
                        <span className="text-[10px] text-gray-400 block uppercase">
                          {language === 'ar' ? 'سعر الشراء' : 'Achat'}
                        </span>
                        <span className="text-white font-bold">
                          {formatMAD(part.purchasePrice, language)}
                        </span>
                      </div>
                    )}
                    <div className={can('view_cost_price') ? 'text-end' : 'col-span-2'}>
                      <span className="text-[10px] text-gray-400 block uppercase">
                        {language === 'ar' ? 'سعر البيع/التركيب' : 'Vente/Pose'}
                      </span>
                      <span className="text-[#FFD700] font-black">
                        {formatMAD(part.sellingPrice, language)}
                      </span>
                    </div>
                  </div>

                  {/* Quick Adjust & Actions Bar */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleQuickAdjustStock(part, -1)}
                        disabled={part.quantity <= 0}
                        className="p-1.5 rounded-lg bg-black/70 border border-yellow-500/25 hover:border-[#FFD700] text-white disabled:opacity-40 transition"
                        title="-1"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono text-xs font-black px-2 text-[#FFD700]">
                        {part.quantity}
                      </span>
                      <button
                        onClick={() => handleQuickAdjustStock(part, 1)}
                        className="p-1.5 rounded-lg bg-black/70 border border-yellow-500/25 hover:border-[#FFD700] text-white transition"
                        title="+1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(part)}
                        className="p-2 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-[#FFD700] transition flex items-center gap-1"
                        title={t.edit}
                      >
                        {!can('edit_records') && <Lock className="w-2.5 h-2.5" />}
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRequestDeletePart(part)}
                        className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 transition flex items-center gap-1"
                        title={t.delete}
                      >
                        {!can('delete_records') && <Lock className="w-2.5 h-2.5" />}
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Desktop Mode: Glassmorphism Table */
        <div className="relative overflow-hidden rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/25 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-black/70 text-[#FFD700] uppercase text-[11px] font-black tracking-wider border-b border-yellow-500/25">
                <tr>
                  <th className="py-3.5 px-4 text-start">{t.spareParts.name}</th>
                  <th className="py-3.5 px-4 text-start">
                    {language === 'ar' ? 'الماركة والموديل' : 'Appareil Compatible'}
                  </th>
                  <th className="py-3.5 px-4 text-start">{t.spareParts.quality}</th>
                  <th className="py-3.5 px-4 text-center">{t.spareParts.quantity}</th>
                  {can('view_cost_price') && (
                    <th className="py-3.5 px-4 text-end">{t.spareParts.purchasePrice}</th>
                  )}
                  <th className="py-3.5 px-4 text-end">{t.spareParts.sellingPrice}</th>
                  <th className="py-3.5 px-4 text-start">{t.spareParts.supplier}</th>
                  <th className="py-3.5 px-4 text-center">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-500/15">
                {filteredParts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-gray-400 text-xs">
                      {search || brandFilter !== 'all' || qualityFilter !== 'all' || onlyLowStock
                        ? t.spareParts.noPartsSearch
                        : t.spareParts.noParts}
                    </td>
                  </tr>
                ) : (
                  filteredParts.map((part) => {
                    const qualityBadge = getQualityBadge(part.quality);
                    const isLow = part.quantity <= (part.minAlertQty ?? 2);
                    const isOut = part.quantity === 0;

                    return (
                      <tr key={part.id} className="hover:bg-yellow-500/10 transition">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center shrink-0">
                              <GoldWrench3D className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="font-bold text-white">{part.name}</div>
                              {part.notes && (
                                <div className="text-[11px] text-gray-400 truncate max-w-xs mt-0.5">
                                  {part.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-bold text-white">
                            {part.compatibleBrand}
                          </div>
                          <div className="text-[11px] text-[#FFD700] font-mono">
                            {part.compatibleModel}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${qualityBadge.color}`}
                          >
                            {qualityBadge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-center">
                          <div className="inline-flex items-center gap-1.5 bg-black/70 px-2.5 py-1 rounded-full border border-yellow-500/25">
                            <button
                              onClick={() => handleQuickAdjustStock(part, -1)}
                              disabled={part.quantity <= 0}
                              className="text-gray-300 hover:text-white disabled:opacity-30"
                              title="-1"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span
                              className={`font-mono font-black text-xs px-1 ${
                                isOut
                                  ? 'text-rose-400'
                                  : isLow
                                  ? 'text-[#FFD700]'
                                  : 'text-[#22c55e]'
                              }`}
                            >
                              {part.quantity}
                            </span>
                            <button
                              onClick={() => handleQuickAdjustStock(part, 1)}
                              className="text-gray-300 hover:text-white"
                              title="+1"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        {can('view_cost_price') && (
                          <td className="py-3.5 px-4 text-end font-mono text-gray-300 whitespace-nowrap">
                            {formatMAD(part.purchasePrice, language)}
                          </td>
                        )}
                        <td className="py-3.5 px-4 text-end font-mono font-black text-[#FFD700] whitespace-nowrap">
                          {formatMAD(part.sellingPrice, language)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-gray-300">
                          {part.supplierName || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(part)}
                              className="p-1.5 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/30 text-[#FFD700] transition flex items-center gap-0.5"
                              title={t.edit}
                            >
                              {!can('edit_records') && <Lock className="w-2.5 h-2.5" />}
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRequestDeletePart(part)}
                              className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 transition flex items-center gap-0.5"
                              title={t.delete}
                            >
                              {!can('delete_records') && <Lock className="w-2.5 h-2.5" />}
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Add / Edit Spare Part */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPart ? t.spareParts.editPart : t.spareParts.addPart}
        maxWidth="2xl"
      >
        <div className="space-y-4">
          {/* Quick Suggestions Strip */}
          <div>
            <label className="text-[11px] font-bold text-neutral-400 block mb-1.5">
              {language === 'ar' ? 'اقتراحات سريعة لاسم القطعة:' : 'Suggestions rapides :'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PART_NAMES.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setName(suggestion)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition border ${
                    name === suggestion
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 font-bold'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Part Name */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                {t.spareParts.name} <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.spareParts.namePlaceholder}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-hidden"
              />
            </div>

            {/* Compatible Brand */}
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                {t.spareParts.compatibleBrand} <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                value={compatibleBrand}
                onChange={(e) => setCompatibleBrand(e.target.value)}
                placeholder="ex: Samsung, Apple, Xiaomi..."
                list="brand-suggestions"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-hidden"
              />
              <datalist id="brand-suggestions">
                {COMMON_BRANDS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            {/* Compatible Model */}
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                {t.spareParts.compatibleModel} <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                value={compatibleModel}
                onChange={(e) => setCompatibleModel(e.target.value)}
                placeholder="ex: Galaxy A14, iPhone 11, Redmi Note 12..."
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-hidden"
              />
            </div>

            {/* Quality Selector */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                {t.spareParts.quality}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['original', 'oem', 'copy'] as PartQuality[]).map((q) => {
                  const badge = getQualityBadge(q);
                  const isSelected = quality === q;
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuality(q)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                        isSelected
                          ? `${badge.color} ring-1 ring-amber-400/50`
                          : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {badge.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                {t.spareParts.quantity}
              </label>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 rounded-xl text-xs font-mono font-bold text-neutral-100 focus:outline-hidden"
              />
            </div>

            {/* Min Alert Quantity */}
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                {t.spareParts.minAlertQty}
              </label>
              <input
                type="number"
                min="0"
                value={minAlertQty}
                onChange={(e) => setMinAlertQty(Number(e.target.value))}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 rounded-xl text-xs font-mono text-neutral-100 focus:outline-hidden"
              />
            </div>

            {/* Purchase Price */}
            {can('view_cost_price') && (
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1">
                  {t.spareParts.purchasePrice}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 rounded-xl text-xs font-mono text-neutral-100 focus:outline-hidden"
                />
              </div>
            )}

            {/* Selling / Pose Price */}
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                {t.spareParts.sellingPrice}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 rounded-xl text-xs font-mono font-bold text-amber-400 focus:outline-hidden"
              />
            </div>

            {/* Supplier Selector */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                {t.spareParts.supplier}
              </label>
              <select
                value={supplierId || ''}
                onChange={(e) =>
                  setSupplierId(e.target.value ? Number(e.target.value) : undefined)
                }
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 rounded-xl text-xs text-neutral-100 focus:outline-hidden cursor-pointer"
              >
                <option value="">
                  {language === 'ar' ? 'بدون مورد محدد' : 'Aucun fournisseur'}
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                {t.spareParts.notes}
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Détails techniques, provenance, garantie fournisseur..."
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 focus:border-amber-500/60 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSavePart}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black transition shadow-md active:scale-95 disabled:opacity-50"
            >
              {editingPart ? t.save : t.add}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deletingPart}
        onClose={() => setDeletingPart(null)}
        onConfirm={handleConfirmDelete}
        title={t.spareParts.deletePart}
        message={
          language === 'ar'
            ? `هل أنت متأكد من حذف القطعة "${deletingPart?.name} (${deletingPart?.compatibleBrand} ${deletingPart?.compatibleModel})" من المخزون؟`
            : `Confirmez-vous la suppression de la pièce "${deletingPart?.name} (${deletingPart?.compatibleBrand} ${deletingPart?.compatibleModel})" du stock ?`
        }
        isDestructive={true}
      />

      {/* Admin Approval Modal for Worker (Edit / Delete Spare Part) */}
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
