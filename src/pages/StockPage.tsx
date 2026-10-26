import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Boxes,
  Plus,
  Search,
  LayoutGrid,
  List,
  Edit,
  Trash2,
  History,
  Smartphone,
  Upload,
  AlertTriangle,
  X,
  Check,
  QrCode,
  ClipboardCheck,
  RefreshCw,
  FileText,
  Minus,
} from 'lucide-react';
import {
  db,
  checkImeiUnique,
  deleteProductTransaction,
  adjustProductStockTransaction,
  withSyncMetadata,
  queueOutboxOperation,
  recordStockMovement,
  getStoreSettings,
} from '../db';
import { Product, ProductCategory, IMEIItem, ApprovalActionType } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdminApprovalModal } from '../components/AdminApprovalModal';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { compressImage } from '../lib/image';
import { useViewMode } from '../lib/viewMode';
import { useAccessAuth } from '../lib/accessAuth';
import { getMoroccoDateString } from '../lib/dateUtils';
import { ScanButton } from '../components/ScanButton';
import { StickerPrintModal } from '../components/StickerPrintModal';
import { UsedPhoneTradeInModal } from '../components/UsedPhoneTradeInModal';
import { GlassKpiCard, GoldInventoryBox3D } from '../components/GoldenGlassUI';

interface StockPageProps {
  initialSearch?: string;
  initialAction?: 'add';
}

export const StockPage: React.FC<StockPageProps> = ({ initialSearch, initialAction }) => {
  const { t, language } = useI18n();
  const { success, error } = useToast();
  const { isMobileMode } = useViewMode();
  const { can } = useAccessAuth();
  const isAr = language === 'ar';

  const [search, setSearch] = useState(initialSearch || '');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [visibleCount, setVisibleCount] = useState(24);

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(initialAction === 'add');
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<number | null>(null);
  const [isTradeInModalOpen, setIsTradeInModalOpen] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [inventoryCounts, setInventoryCounts] = useState<Record<number, number>>({});
  const [inventoryReason, setInventoryReason] = useState('Inventaire physique magasin');
  const [stickerModalState, setStickerModalState] = useState<{
    isOpen: boolean;
    product?: Product | null;
    imei?: string;
  }>({ isOpen: false });
  const [approvalModal, setApprovalModal] = useState<{
    isOpen: boolean;
    actionType: ApprovalActionType;
    title: string;
    description: string;
    targetId?: number;
    payload?: any;
    onApproved: () => void;
  } | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<ProductCategory>('phone');
  const [formPurchasePrice, setFormPurchasePrice] = useState<number>(0);
  const [formRetailPrice, setFormRetailPrice] = useState<number>(0);
  const [formWholesalePrice, setFormWholesalePrice] = useState<number>(0);
  const [formQuantity, setFormQuantity] = useState<number>(1);
  const [formMinAlertQty, setFormMinAlertQty] = useState<number>(5);
  const [formSupplierId, setFormSupplierId] = useState<number | undefined>(undefined);
  const [formBarcode, setFormBarcode] = useState('');
  const [formImage, setFormImage] = useState<string | undefined>(undefined);
  const [formNotes, setFormNotes] = useState('');

  // IMEI state for phones
  const [formImeiList, setFormImeiList] = useState<IMEIItem[]>([]);
  const [singleImeiInput, setSingleImeiInput] = useState('');
  const [multiImeiInput, setMultiImeiInput] = useState('');
  const [showMultiImeiModal, setShowMultiImeiModal] = useState(false);

  // Live queries from Dexie
  const products =
    useLiveQuery(async () => {
      const all = await db.products.toArray();
      return all.filter((p) => !p.deleted_at);
    }, []) || [];
  const suppliers =
    useLiveQuery(async () => {
      const all = await db.suppliers.toArray();
      return all.filter((s) => !s.deleted_at);
    }, []) || [];
  const sales =
    useLiveQuery(async () => {
      const all = await db.sales.toArray();
      return all.filter((s) => !s.deleted_at);
    }, []) || [];
  const stockMovements =
    useLiveQuery(async () => {
      return await db.stockMovements.toArray();
    }, []) || [];

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  const resetForm = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('phone');
    setFormPurchasePrice(0);
    setFormRetailPrice(0);
    setFormWholesalePrice(0);
    setFormQuantity(1);
    setFormMinAlertQty(5);
    setFormSupplierId(undefined);
    setFormBarcode('');
    setFormImage(undefined);
    setFormNotes('');
    setFormImeiList([]);
    setSingleImeiInput('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsEditModalOpen(true);
  };

  const openEditFormDirect = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormCategory(p.category);
    setFormPurchasePrice(p.purchasePrice);
    setFormRetailPrice(p.retailPrice);
    setFormWholesalePrice(p.wholesalePrice);
    setFormQuantity(p.quantity);
    setFormMinAlertQty(p.minAlertQty ?? 5);
    setFormSupplierId(p.supplierId);
    setFormBarcode(p.barcode || '');
    setFormImage(p.image);
    setFormNotes(p.notes || '');
    setFormImeiList(p.imeiList ? [...p.imeiList] : []);
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    if (!can('edit_records')) {
      setApprovalModal({
        isOpen: true,
        actionType: 'edit_product',
        title: `تعديل منتج: ${p.name}`,
        description: `يرغب العامل في فتح وتعديل بيانات المنتج "${p.name}" (السعر الحالي: ${p.retailPrice} DH، الكمية: ${p.quantity}).`,
        targetId: p.id,
        onApproved: () => openEditFormDirect(p),
      });
      return;
    }
    openEditFormDirect(p);
  };

  const handleRequestDeleteProduct = (p: Product) => {
    if (!p.id) return;
    if (!can('delete_records')) {
      setApprovalModal({
        isOpen: true,
        actionType: 'delete_product',
        title: `حذف منتج من المخزون: ${p.name}`,
        description: `يرغب العامل في حذف المنتج "${p.name}" من المخزون نهائياً.`,
        targetId: p.id,
        onApproved: async () => {
          try {
            await deleteProductTransaction(p.id!);
            success(isAr ? 'تم حذف المنتج بموافقة الأدمين.' : 'Produit supprimé.');
          } catch (err: any) {
            error(err.message || t.stock.cantDeleteLinked);
          }
        },
      });
      return;
    }
    setDeleteProductId(p.id);
  };

  // Quick Stock +1 / -1 ("زيد ونقص فـ الستوك") for Worker & Admin
  const handleQuickAdjustStock = async (p: Product, delta: number) => {
    if (!p.id || p.category === 'phone') return;
    const newQty = Math.max(0, (p.quantity || 0) + delta);
    if (newQty === p.quantity) return;
    try {
      await adjustProductStockTransaction({
        productId: p.id,
        newQuantity: newQty,
        reason: delta > 0 ? 'زيادة سريعة في الستوك (+)' : 'نقصان سريع من الستوك (-)',
      });
      success(
        isAr
          ? `تم تحديث كمية "${p.name}" إلى ${newQty} قطعة`
          : `Stock "${p.name}" mis à jour : ${newQty}`
      );
    } catch (err: any) {
      error(err.message || 'تعذر تعديل الكمية');
    }
  };

  // Handle single IMEI add
  const handleAddSingleImei = async () => {
    const imei = singleImeiInput.trim();
    if (!imei) return;

    if (imei.length !== 15 || !/^\d{15}$/.test(imei)) {
      error(t.stock.invalidImeiLength);
      return;
    }

    // Check duplicate in current form
    if (formImeiList.some((i) => i.imei === imei)) {
      error(t.stock.duplicateImeiError);
      return;
    }

    // Check duplicate across DB
    const isUnique = await checkImeiUnique(imei, editingProduct?.id);
    if (!isUnique) {
      error(t.stock.duplicateImeiError);
      return;
    }

    const updated = [...formImeiList, { imei, status: 'in_stock' as const }];
    setFormImeiList(updated);
    setSingleImeiInput('');
  };

  // Handle multi IMEI paste
  const handleAddMultiImei = async () => {
    const lines = multiImeiInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let addedCount = 0;
    const newItems = [...formImeiList];

    for (const imei of lines) {
      if (imei.length === 15 && /^\d{15}$/.test(imei)) {
        if (!newItems.some((i) => i.imei === imei)) {
          const isUnique = await checkImeiUnique(imei, editingProduct?.id);
          if (isUnique) {
            newItems.push({ imei, status: 'in_stock' });
            addedCount++;
          }
        }
      }
    }

    setFormImeiList(newItems);
    setMultiImeiInput('');
    setShowMultiImeiModal(false);
    success(`${addedCount} IMEIs ajoutés avec succès.`);
  };

  const handleRemoveImei = (index: number) => {
    const updated = formImeiList.filter((_, idx) => idx !== index);
    setFormImeiList(updated);
  };

  // Handle Image Upload & Compression
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 400, 0.85);
      setFormImage(compressed);
      success("Photo compressée avec succès.");
    } catch {
      error("Erreur lors de la compression de la photo.");
    }
  };

  // Save product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      error("Veuillez saisir un nom de produit.");
      return;
    }

    // Derived quantity for phones
    const derivedQuantity =
      formCategory === 'phone'
        ? formImeiList.filter((i) => i.status === 'in_stock').length
        : Math.max(0, formQuantity);

    const productPayload: Product = withSyncMetadata<Product>({
      ...(editingProduct as Product),
      name: formName.trim(),
      category: formCategory,
      purchasePrice:
        !can('view_cost_price') && editingProduct?.id
          ? editingProduct.purchasePrice || 0
          : Number(formPurchasePrice) || 0,
      retailPrice: Number(formRetailPrice) || 0,
      wholesalePrice: Number(formWholesalePrice) || 0,
      quantity: derivedQuantity,
      minAlertQty: Math.max(0, Number(formMinAlertQty) ?? 5),
      supplierId: formSupplierId ? Number(formSupplierId) : undefined,
      barcode: formBarcode.trim() || undefined,
      image: formImage,
      notes: formNotes.trim() || undefined,
      imeiList: formCategory === 'phone' ? formImeiList : [],
      createdAt: editingProduct?.createdAt || getMoroccoDateString(),
    });

    try {
      if (editingProduct?.id) {
        const prevQty = editingProduct.quantity ?? derivedQuantity;
        await db.products.put({ ...productPayload, id: editingProduct.id });
        await queueOutboxOperation('products', 'update', { ...productPayload, id: editingProduct.id });
        if (derivedQuantity !== prevQty) {
          await recordStockMovement({
            productId: editingProduct.id,
            productUuid: productPayload.uuid,
            productName: productPayload.name,
            type: 'adjustment',
            quantityDelta: derivedQuantity - prevQty,
            previousQty: prevQty,
            newQty: derivedQuantity,
            reason: 'Modification fiche produit',
          });
        }
        success(isAr ? 'تم تحديث المنتج بنجاح.' : 'Produit mis à jour avec succès.');
      } else {
        const newId = await db.products.add(productPayload);
        await queueOutboxOperation('products', 'insert', { ...productPayload, id: newId });
        await recordStockMovement({
          productId: newId,
          productUuid: productPayload.uuid,
          productName: productPayload.name,
          type: 'in',
          quantityDelta: derivedQuantity,
          previousQty: 0,
          newQty: derivedQuantity,
          reason: 'Entrée initiale au stock',
        });
        success(isAr ? 'تمت إضافة المنتج للمخزون.' : 'Nouveau produit ajouté au stock.');
      }
      setIsEditModalOpen(false);
      resetForm();
    } catch (err: any) {
      error(err.message || "Erreur lors de l'enregistrement.");
    }
  };

  // Apply Physical Inventory Counts (Partie 3 #8)
  const handleApplyInventoryCounts = async () => {
    try {
      let adjustedCount = 0;
      for (const [idStr, countedQty] of Object.entries(inventoryCounts)) {
        const prodId = Number(idStr);
        const prod = products.find((p) => p.id === prodId);
        if (prod && prod.category !== 'phone' && prod.quantity !== countedQty) {
          await adjustProductStockTransaction({
            productId: prodId,
            newQuantity: countedQty,
            reason: inventoryReason || 'Inventaire physique',
          });
          adjustedCount++;
        }
      }
      success(
        isAr
          ? `تم تحديث الجرد الفعلي (${adjustedCount} منتجات معدلة).`
          : `Inventaire physique validé (${adjustedCount} produit(s) ajusté(s)).`
      );
      setIsInventoryModalOpen(false);
    } catch (err: any) {
      error(err.message || "Erreur lors de l'inventaire.");
    }
  };

  // Delete product
  const handleConfirmDelete = async () => {
    if (!deleteProductId) return;
    if (!can('delete_records')) {
      error(isAr ? 'غير مسموح بحذف المنتجات.' : 'Action réservée au propriétaire.');
      setDeleteProductId(null);
      return;
    }
    try {
      await deleteProductTransaction(deleteProductId);
      success(isAr ? 'تم حذف المنتج من المخزون.' : 'Produit supprimé du stock.');
      setDeleteProductId(null);
    } catch (err: any) {
      error(err.message || t.stock.cantDeleteLinked);
    }
  };

  // Filtering
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.imeiList && p.imeiList.some((i) => i.imei.includes(q)));
    return matchesCategory && matchesSearch;
  });

  const paginatedProducts = filteredProducts.slice(0, visibleCount);

  // Quantity Badge styling using configurable minAlertQty (Partie 1 #12)
  const getQuantityBadge = (qty: number, minAlertQty: number = 5) => {
    if (qty < minAlertQty) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
          {qty} en stock
        </span>
      );
    }
    if (qty < minAlertQty * 2) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {qty} en stock
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        {qty} en stock
      </span>
    );
  };

  const totalStockCost = products.reduce((acc, p) => acc + (p.purchasePrice || 0) * Math.max(0, p.quantity), 0);
  const totalStockRetail = products.reduce((acc, p) => acc + (p.retailPrice || 0) * Math.max(0, p.quantity), 0);
  const totalStockUnits = products.reduce((acc, p) => acc + Math.max(0, p.quantity), 0);
  const lowStockCount = products.filter((p) => (p.quantity || 0) <= (p.minAlertQty ?? 5)).length;

  return (
    <div className="space-y-4">
      {/* 3 Top 3D Gold KPI Cards — Financial for Admin, Operational Stock Counts Only for Worker */}
      {can('view_cost_price') ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassKpiCard
            title={language === 'ar' ? 'قيمة المخزون بسعر الشراء' : 'Valeur Stock (Achat)'}
            value={formatMAD(totalStockCost, language)}
            subtitle={`${products.length} SKU • ${totalStockUnits} ${language === 'ar' ? 'قطعة' : 'unités'}`}
            variant="gold"
            iconType="money"
          />
          <GlassKpiCard
            title={language === 'ar' ? 'القيمة البيعية والربح المتوقع' : 'Valeur Vente & Marge'}
            value={formatMAD(totalStockRetail, language)}
            subtitle={`${language === 'ar' ? 'الربح المتوقع:' : 'Marge:'} ${formatMAD(Math.max(0, totalStockRetail - totalStockCost), language)}`}
            variant="green"
            iconType="trend"
          />
          <GlassKpiCard
            title={language === 'ar' ? 'إجمالي السلع المتوفرة' : 'Total Articles en Stock'}
            value={`${filteredProducts.length} SKU`}
            subtitle={`${totalStockUnits} ${language === 'ar' ? 'قطعة في المحل • 100%' : 'pièces en stock • 100%'}`}
            variant="white"
            iconType="box"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassKpiCard
            title={language === 'ar' ? 'إجمالي الأصناف المسجلة' : 'Références en Stock'}
            value={`${filteredProducts.length} SKU`}
            subtitle={language === 'ar' ? 'سلع ومنتجات جاهزة للخدمة' : 'Articles disponibles'}
            variant="gold"
            iconType="box"
          />
          <GlassKpiCard
            title={language === 'ar' ? 'إجمالي القطع في الستوك (زيد ونقص)' : 'Total Unités en Stock'}
            value={`${totalStockUnits} PCS`}
            subtitle={language === 'ar' ? 'يمكنك زيادة أو نقصان الكمية مباشرة' : 'Ajustement rapide +/- activé'}
            variant="green"
            iconType="box"
          />
          <GlassKpiCard
            title={language === 'ar' ? 'تنبيهات نواقص الستوك' : 'Alertes Stock Faible'}
            value={`${lowStockCount}`}
            subtitle={
              lowStockCount > 0
                ? language === 'ar'
                  ? 'منتجات قاربت على النفاد'
                  : 'Articles sous le seuil'
                : language === 'ar'
                ? 'المخزون مكتمل • 100%'
                : 'Stock optimal'
            }
            variant="white"
            iconType="wrench"
          />
        </div>
      )}

      {/* Filter, Search & Actions Glass Bar */}
      <div className="relative overflow-hidden bg-black/65 backdrop-blur-xl border border-yellow-500/20 rounded-[20px] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search + Camera Scan */}
          <div className="flex items-center gap-2 w-full lg:w-96">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#FFD700] absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={language === 'ar' ? 'ابحث بالاسم أو الباركود أو IMEI...' : 'Nom, IMEI, code-barres...'}
                className="w-full bg-black/60 border border-yellow-500/25 rounded-full ps-10 pe-4 py-2.5 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:border-[#FFD700]"
              />
            </div>
            <ScanButton
              onScan={(scannedCode) => {
                const code = scannedCode.trim();
                setSearch(code);
                const q = code.toLowerCase();
                const matched = products.find(
                  (p) =>
                    (p.barcode && p.barcode.toLowerCase() === q) ||
                    (p.imeiList && p.imeiList.some((im) => im.imei === code)) ||
                    p.name.toLowerCase() === q ||
                    `prod-${p.id}` === q ||
                    String(p.id) === code
                );
                if (matched) {
                  handleOpenEdit(matched);
                  success(
                    language === 'ar'
                      ? `تم فتح صفحة المنتج: ${matched.name}`
                      : `Fiche produit ouverte : ${matched.name}`
                  );
                }
              }}
              mode="any"
              variant="compact"
              label={language === 'ar' ? '📷 مسح' : '📷 Scanner'}
            />
          </div>

          {/* Action Buttons */}
          <div className={`flex flex-wrap items-center gap-2 ${isMobileMode ? 'w-full' : 'shrink-0'}`}>
            {!isMobileMode && (
              <div className="flex items-center bg-black/60 p-1 rounded-full border border-yellow-500/25">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-full transition ${
                    viewMode === 'table'
                      ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Vue Tableau"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-full transition ${
                    viewMode === 'grid'
                      ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Vue Grille"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsTradeInModalOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-[#22c55e] border border-emerald-500/30 font-bold transition px-3.5 py-2 text-xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{isAr ? 'شراء مستعمل (Reprise)' : 'Reprise Occasion'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const initialMap: Record<number, number> = {};
                products.forEach((p) => {
                  if (p.id && p.category !== 'phone') initialMap[p.id] = p.quantity;
                });
                setInventoryCounts(initialMap);
                setIsInventoryModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-full bg-black/60 hover:bg-black/80 text-gray-200 border border-yellow-500/25 font-bold transition px-3.5 py-2 text-xs"
            >
              <ClipboardCheck className="w-4 h-4 text-[#FFD700]" />
              <span>{isAr ? 'الجرد الفعلي' : 'Inventaire'}</span>
            </button>

            <button
              type="button"
              onClick={() => setStickerModalState({ isOpen: true, product: null })}
              className="flex items-center justify-center gap-1.5 rounded-full bg-black/60 hover:bg-black/80 text-[#FFD700] border border-yellow-500/30 font-bold transition px-3.5 py-2 text-xs"
            >
              <QrCode className="w-4 h-4" />
              <span>{language === 'ar' ? 'طباعة ستيكرات QR' : 'Étiquettes QR / Code'}</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 hover:from-yellow-400 hover:to-amber-200 text-black font-black transition shadow-[0_4px_15px_rgba(255,215,0,0.3)] px-4 py-2 text-xs"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>{t.stock.addProduct}</span>
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto w-full py-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
              selectedCategory === 'all'
                ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                : 'bg-black/50 text-gray-300 border border-yellow-500/20 hover:border-yellow-500/40 hover:text-white'
            }`}
          >
            {t.all}
          </button>
          {(['phone', 'accessory', 'tv', 'trotinette', 'other'] as ProductCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                  : 'bg-black/50 text-gray-300 border border-yellow-500/20 hover:border-yellow-500/40 hover:text-white'
              }`}
            >
              {t.stock.categories[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Product Content: Grid View or Glassmorphism Table View */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-black/65 backdrop-blur-xl rounded-[20px] border border-yellow-500/20 text-gray-400 text-xs flex flex-col items-center justify-center gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <GoldInventoryBox3D className="w-16 h-16" />
          <p className="text-sm font-bold text-white">
            {search || selectedCategory !== 'all'
              ? (language === 'ar' ? 'ما كاين حتى نتيجة لهاد البحث' : 'Aucun résultat trouvé pour cette recherche')
              : (language === 'ar' ? 'ما كاين والو، زيد أول سلعة فالمخزن' : 'Aucun produit en stock, ajoutez le premier')}
          </p>
          {!search && selectedCategory === 'all' && (
            <button
              onClick={handleOpenAdd}
              className="mt-1 px-5 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black rounded-full text-xs transition flex items-center gap-1.5 shadow-[0_4px_15px_rgba(255,215,0,0.3)]"
            >
              <Plus className="w-4 h-4" />
              <span>{t.stock.addProduct}</span>
            </button>
          )}
        </div>
      ) : isMobileMode ? (
        /* Mobile Mode: Vertical Glass Cards */
        <div className="space-y-3.5">
          {paginatedProducts.map((p) => (
            <div
              key={p.id}
              className="p-4 rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 space-y-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-20 h-20 rounded-2xl bg-black/70 border border-yellow-500/25 flex items-center justify-center overflow-hidden shrink-0 relative">
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <GoldInventoryBox3D className="w-12 h-12" />
                  )}
                  <div className="absolute top-1 start-1 scale-90 origin-top-left">
                    {getQuantityBadge(p.quantity, p.minAlertQty ?? 5)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFD700] font-mono">
                      {t.stock.categories[p.category]}
                    </span>
                    {p.category === 'phone' && p.imeiList && p.imeiList.length > 0 && (
                      <span className="text-[10px] bg-yellow-500/20 text-[#FFD700] px-1.5 py-0.5 rounded font-mono">
                        {p.imeiList.filter((i) => i.status === 'in_stock').length} IMEI
                      </span>
                    )}
                  </div>

                  <h3 className="font-extrabold text-sm text-white truncate mt-0.5" title={p.name}>
                    {p.name}
                  </h3>

                  {p.barcode && (
                    <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                      Réf: {p.barcode}
                    </div>
                  )}

                  <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-yellow-500/15">
                    <div>
                      <span className="text-[10px] text-gray-400 block">
                        {language === 'ar' ? 'البيع بالتقسيط' : 'Prix Détail'}
                      </span>
                      <span className="font-mono font-black text-[#FFD700] text-sm">
                        {formatMAD(p.retailPrice, language)}
                      </span>
                    </div>
                    <div className="text-end">
                      <span className="text-[10px] text-gray-400 block">
                        {language === 'ar' ? 'الجملة' : 'Prix Gros'}
                      </span>
                      <span className="font-mono font-semibold text-gray-200 text-xs">
                        {formatMAD(p.wholesalePrice, language)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Stock +/- (زيد ونقص) for Mobile */}
              {p.category !== 'phone' && (
                <div className="flex items-center justify-between bg-black/60 border border-yellow-500/20 rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-gray-300">
                    {isAr ? 'زيد ونقص فـ الستوك:' : 'Ajuster Stock :'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuickAdjustStock(p, -1)}
                      disabled={p.quantity <= 0}
                      className="w-8 h-8 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 flex items-center justify-center font-black transition disabled:opacity-30 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-mono font-black text-sm text-[#FFD700] min-w-[32px] text-center">
                      {p.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickAdjustStock(p, 1)}
                      className="w-8 h-8 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-black transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Large Touch Actions for Mobile */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-yellow-500/15">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(p)}
                  className="py-3 px-2 rounded-xl bg-black/60 hover:bg-black/80 border border-yellow-500/20 text-white font-bold text-xs flex items-center justify-center gap-1 transition active:scale-95 min-h-[44px]"
                >
                  <Edit className="w-3.5 h-3.5 text-[#FFD700]" />
                  <span>{t.edit}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStickerModalState({ isOpen: true, product: p })}
                  className="py-3 px-2 rounded-xl bg-yellow-500/15 hover:bg-yellow-500/25 text-[#FFD700] border border-yellow-500/30 font-bold text-xs flex items-center justify-center gap-1 transition active:scale-95 min-h-[44px]"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryProduct(p)}
                  className="py-3 px-2 rounded-xl bg-black/60 hover:bg-black/80 border border-yellow-500/20 text-gray-200 font-medium text-xs flex items-center justify-center gap-1 transition active:scale-95 min-h-[44px]"
                >
                  <History className="w-3.5 h-3.5 text-[#FFD700]" />
                  <span>{language === 'ar' ? 'السجل' : 'Hist.'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestDeleteProduct(p)}
                  className="py-3 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold text-xs flex items-center justify-center gap-1 transition active:scale-95 min-h-[44px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {paginatedProducts.map((p) => (
            <div
              key={p.id}
              className="rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/20 overflow-hidden flex flex-col justify-between hover:border-[#FFD700] hover:scale-[1.02] transition-all duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.4)] group"
            >
              <div>
                <div className="h-44 bg-black/60 relative overflow-hidden flex items-center justify-center border-b border-yellow-500/20">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <GoldInventoryBox3D className="w-16 h-16" />
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#FFD700]">
                        {p.category}
                      </span>
                    </div>
                  )}
                  <div className="absolute top-2 end-2">
                    {getQuantityBadge(p.quantity, p.minAlertQty ?? 5)}
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <div className="text-xs text-[#FFD700] uppercase tracking-wider font-bold">
                    {t.stock.categories[p.category]}
                  </div>
                  <h3 className="text-sm font-black text-white line-clamp-1" title={p.name}>
                    {p.name}
                  </h3>

                  {p.barcode && (
                    <div className="text-[11px] font-mono text-gray-400">
                      Réf: {p.barcode}
                    </div>
                  )}

                  <div className="pt-2 border-t border-yellow-500/20 flex items-center justify-between text-xs">
                    <div>
                      <div className="text-[10px] text-gray-400">Détail</div>
                      <div className="font-mono font-black text-[#FFD700]">
                        {formatMAD(p.retailPrice, language)}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-[10px] text-gray-400">Gros</div>
                      <div className="font-mono font-semibold text-gray-200">
                        {formatMAD(p.wholesalePrice, language)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 bg-black/60 border-t border-yellow-500/20 flex items-center justify-between">
                {p.category !== 'phone' ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleQuickAdjustStock(p, -1)}
                      disabled={p.quantity <= 0}
                      className="w-6 h-6 rounded-md bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 flex items-center justify-center transition disabled:opacity-30 cursor-pointer"
                      title="نقصان قطعة (-1)"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono font-black text-xs text-[#FFD700] px-1">
                      {p.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickAdjustStock(p, 1)}
                      className="w-6 h-6 rounded-md bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 flex items-center justify-center transition cursor-pointer"
                      title="زيادة قطعة (+1)"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setHistoryProduct(p)}
                    className="flex items-center gap-1 text-[11px] text-gray-300 hover:text-[#FFD700] transition"
                    title={t.stock.viewHistory}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Historique</span>
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStickerModalState({ isOpen: true, product: p })}
                    className="p-1.5 rounded-lg text-[#FFD700] hover:bg-yellow-500/15 transition"
                    title={language === 'ar' ? 'طباعة ستيكر QR / باركود' : 'Imprimer étiquette QR / Code-barres'}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleOpenEdit(p)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition"
                    title={t.edit}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRequestDeleteProduct(p)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/15 transition"
                    title={t.delete}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Glassmorphism Table View (bg-black/60 backdrop-blur-xl with gold borders) */
        <div className="relative overflow-hidden rounded-[20px] bg-black/65 backdrop-blur-xl border border-yellow-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-x-auto">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
          <table className="w-full text-start text-xs">
            <thead className="bg-black/70 text-[#FFD700] uppercase text-[11px] font-black tracking-wider border-b border-yellow-500/25">
              <tr>
                <th className="py-3.5 px-4 text-start">{t.stock.productName}</th>
                <th className="py-3.5 px-4 text-start">{t.stock.category}</th>
                <th className="py-3.5 px-4 text-center">{t.stock.quantity}</th>
                {can('view_cost_price') && (
                  <th className="py-3.5 px-4 text-end">{t.stock.purchasePrice}</th>
                )}
                <th className="py-3.5 px-4 text-end">{t.stock.retailPrice}</th>
                <th className="py-3.5 px-4 text-end">{t.stock.wholesalePrice}</th>
                <th className="py-3.5 px-4 text-center">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-500/15">
              {paginatedProducts.map((p) => (
                <tr key={p.id} className="hover:bg-yellow-500/10 transition">
                  <td className="py-3.5 px-4 font-bold text-white flex items-center gap-3">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt=""
                        className="w-9 h-9 rounded-xl object-cover border border-yellow-500/30 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center shrink-0">
                        <GoldInventoryBox3D className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span>{p.name}</span>
                        {p.isTradeIn && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-[#22c55e] border border-emerald-500/30 font-mono">
                            {isAr ? 'مستعمل' : 'Reprise'}
                          </span>
                        )}
                      </div>
                      {p.barcode && <div className="text-[10px] text-gray-400 font-mono">{p.barcode}</div>}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-gray-300 font-semibold">
                    {t.stock.categories[p.category]}
                  </td>
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <div className="inline-flex items-center justify-center gap-1.5">
                      {p.category !== 'phone' && (
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustStock(p, -1)}
                          disabled={p.quantity <= 0}
                          className="w-6 h-6 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 flex items-center justify-center transition disabled:opacity-30 cursor-pointer"
                          title="نقصان من الستوك (-1)"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                      )}
                      {getQuantityBadge(p.quantity, p.minAlertQty ?? 5)}
                      {p.category !== 'phone' && (
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustStock(p, 1)}
                          className="w-6 h-6 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 flex items-center justify-center transition cursor-pointer"
                          title="زيادة في الستوك (+1)"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                  {can('view_cost_price') && (
                    <td className="py-3.5 px-4 text-end font-mono text-gray-300 whitespace-nowrap">
                      {formatMAD(p.purchasePrice, language)}
                    </td>
                  )}
                  <td className="py-3.5 px-4 text-end font-mono font-black text-[#FFD700] whitespace-nowrap">
                    {formatMAD(p.retailPrice, language)}
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono text-gray-200 whitespace-nowrap">
                    {formatMAD(p.wholesalePrice, language)}
                  </td>
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      {p.isTradeIn && (
                        <button
                          type="button"
                          onClick={async () => {
                            const s = await getStoreSettings();
                            const { generateTradeInContractPDF } = await import('../lib/pdfGenerator');
                            await generateTradeInContractPDF(p, s, 'save');
                          }}
                          className="p-1.5 rounded-lg bg-emerald-500/15 text-[#22c55e] hover:bg-emerald-500/25 border border-emerald-500/30 transition"
                          title={isAr ? 'تحميل عقد شراء هاتف مستعمل رسمي (PDF)' : 'Télécharger Contrat de Reprise PDF'}
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setStickerModalState({ isOpen: true, product: p })}
                        className="p-1.5 rounded-lg bg-yellow-500/15 text-[#FFD700] hover:bg-yellow-500/25 border border-yellow-500/30 transition"
                        title={language === 'ar' ? 'طباعة ستيكر QR / باركود' : 'Imprimer étiquette QR / Code-barres'}
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setHistoryProduct(p)}
                        className="p-1.5 rounded-lg bg-black/50 text-gray-300 hover:text-[#FFD700] border border-yellow-500/20 transition"
                        title={t.stock.viewHistory}
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 rounded-lg bg-black/50 text-gray-300 hover:text-white border border-yellow-500/20 transition"
                        title={t.edit}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRequestDeleteProduct(p)}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition"
                        title={t.delete}
                      >
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

      {/* Load More Pagination */}
      {filteredProducts.length > visibleCount && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 24)}
            className="px-6 py-2.5 rounded-full bg-black/65 backdrop-blur-xl hover:bg-black/80 border border-yellow-500/30 text-[#FFD700] text-xs font-black transition shadow-lg"
          >
            {isAr
              ? `عرض المزيد (${filteredProducts.length - visibleCount} متبقية)`
              : `Voir plus (${filteredProducts.length - visibleCount} restants)`}
          </button>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={editingProduct?.id ? t.stock.editProduct : t.stock.addProduct}
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Designation */}
            <div className="md:col-span-2">
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.productName} *
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="ex: iPhone 15 Pro Max 256GB"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.category}
              </label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as ProductCategory)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
              >
                <option value="phone">{t.stock.categories.phone}</option>
                <option value="accessory">{t.stock.categories.accessory}</option>
                <option value="tv">{t.stock.categories.tv}</option>
                <option value="trotinette">{t.stock.categories.trotinette}</option>
                <option value="other">{t.stock.categories.other}</option>
              </select>
            </div>

            {/* Supplier */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.supplier}
              </label>
              <select
                value={formSupplierId || ''}
                onChange={(e) => setFormSupplierId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
              >
                <option value="">Aucun fournisseur sélectionné</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Purchase Price */}
            {can('view_cost_price') && (
              <div>
                <label className="block font-medium text-neutral-300 mb-1">
                  {t.stock.purchasePrice} (DH) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={formPurchasePrice || ''}
                  onChange={(e) => setFormPurchasePrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
              </div>
            )}

            {/* Retail Price */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.retailPrice} (DH) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={formRetailPrice || ''}
                onChange={(e) => setFormRetailPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono font-bold text-amber-400 focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Wholesale Price */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.wholesalePrice} (DH)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formWholesalePrice || ''}
                onChange={(e) => setFormWholesalePrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Quantity (disabled if category = phone) */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.quantity} {formCategory === 'phone' && '(Calculée des IMEI)'}
              </label>
              <input
                type="number"
                min="0"
                disabled={formCategory === 'phone'}
                value={
                  formCategory === 'phone'
                    ? formImeiList.filter((i) => i.status === 'in_stock').length
                    : formQuantity
                }
                onChange={(e) => setFormQuantity(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono disabled:opacity-60 disabled:cursor-not-allowed focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Low Stock Alert Threshold (minAlertQty - Partie 1 #12) */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {isAr ? 'حد التنبيه بنفاد المخزون' : "Seuil d'alerte stock faible"}
              </label>
              <input
                type="number"
                min="0"
                value={formMinAlertQty}
                onChange={(e) => setFormMinAlertQty(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-amber-400 font-mono focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Barcode */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.barcode}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={formBarcode}
                  onChange={(e) => setFormBarcode(e.target.value)}
                  placeholder="ex: 195949012831"
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
                />
                <ScanButton
                  onScan={(code) => {
                    setFormBarcode(code.trim());
                    success(`${t.scanner.scanSuccess}: ${code.trim()}`);
                  }}
                  mode="barcode"
                  size="md"
                />
              </div>
            </div>

            {/* Image Upload with Compression */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.image}
              </label>
              <div className="flex items-center gap-3">
                {formImage ? (
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-neutral-700 shrink-0">
                    <img src={formImage} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFormImage(undefined)}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 text-rose-400 transition"
                      title={t.stock.removeImage}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-neutral-950 border border-dashed border-neutral-800 flex items-center justify-center text-neutral-600 shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                )}
                <label className="flex-1 cursor-pointer">
                  <span className="block px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-center text-neutral-300 font-medium transition">
                    {formImage ? t.stock.changeImage : t.stock.uploadImage}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Special IMEI Management Section for Phones */}
          {formCategory === 'phone' && (
            <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4" />
                    <span>{t.stock.imeiManagement}</span>
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {t.stock.imeiHelper}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMultiImeiModal(true)}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-amber-400 rounded-md border border-neutral-700"
                >
                  {t.stock.pasteMultipleImei}
                </button>
              </div>

              {/* Single IMEI input row */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={15}
                  value={singleImeiInput}
                  onChange={(e) => setSingleImeiInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="359876543210123 (15 chiffres)"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono tracking-wider focus:outline-hidden focus:border-amber-500/50"
                />
                <ScanButton
                  onScan={async (scannedCode) => {
                    const imei = scannedCode.trim();
                    if (imei.length !== 15 || !/^\d{15}$/.test(imei)) {
                      setSingleImeiInput(imei.replace(/\D/g, '').slice(0, 15));
                      error(t.stock.invalidImeiLength);
                      return;
                    }
                    if (formImeiList.some((i) => i.imei === imei)) {
                      error(t.stock.duplicateImeiError);
                      return;
                    }
                    const isUnique = await checkImeiUnique(imei, editingProduct?.id);
                    if (!isUnique) {
                      error(t.stock.duplicateImeiError);
                      return;
                    }
                    setFormImeiList((prev) => [...prev, { imei, status: 'in_stock' }]);
                    setSingleImeiInput('');
                    success(`IMEI ${imei} ${language === 'ar' ? 'تمت إضافته!' : 'ajouté !'}`);
                  }}
                  mode="imei"
                  continuous={true}
                  size="md"
                />
                <button
                  type="button"
                  onClick={handleAddSingleImei}
                  disabled={singleImeiInput.trim().length !== 15}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-bold rounded-lg transition"
                >
                  {t.stock.addImei}
                </button>
              </div>

              {/* List of current IMEIs */}
              <div className="max-h-36 overflow-y-auto space-y-1.5 pt-2">
                {formImeiList.length === 0 ? (
                  <p className="text-[11px] text-neutral-500 italic">
                    Aucun IMEI enregistré pour le moment.
                  </p>
                ) : (
                  formImeiList.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 font-mono text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500">#{idx + 1}</span>
                        <span className="text-neutral-200">{item.imei}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            item.status === 'in_stock'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {item.status === 'in_stock' ? t.stock.inStock : t.stock.sold}
                        </span>
                        {item.status === 'in_stock' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveImei(idx)}
                            className="text-neutral-500 hover:text-rose-400 transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-5 py-2 font-bold text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition shadow-sm"
            >
              {t.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Paste Multi-IMEI Modal */}
      <Modal
        isOpen={showMultiImeiModal}
        onClose={() => setShowMultiImeiModal(false)}
        title={t.stock.pasteMultipleImei}
        maxWidth="md"
      >
        <div className="space-y-3 text-xs">
          <p className="text-neutral-400">
            Collez un numéro IMEI de 15 chiffres par ligne. Les doublons et numéros invalides seront ignorés.
          </p>
          <textarea
            rows={8}
            value={multiImeiInput}
            onChange={(e) => setMultiImeiInput(e.target.value)}
            placeholder="359871234567891&#10;359871234567892&#10;359871234567893"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-neutral-100 font-mono text-xs focus:outline-hidden focus:border-amber-500/50"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowMultiImeiModal(false)}
              className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleAddMultiImei}
              className="px-4 py-1.5 bg-amber-500 text-neutral-950 font-bold rounded-lg"
            >
              Ajouter les IMEIs
            </button>
          </div>
        </div>
      </Modal>

      {/* Product History Timeline Modal */}
      {historyProduct && (
        <Modal
          isOpen={!!historyProduct}
          onClose={() => setHistoryProduct(null)}
          title={`${t.stock.productHistory} : ${historyProduct.name}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between">
              <div>
                <span className="text-neutral-400">Stock actuel : </span>
                <span className="font-bold font-mono text-amber-400">{historyProduct.quantity}</span>
              </div>
              <div>
                <span className="text-neutral-400">Date d'ajout : </span>
                <span className="font-mono text-neutral-200">{historyProduct.createdAt}</span>
              </div>
            </div>

            {/* Sales linking to this product */}
            <div>
              <h4 className="font-bold text-neutral-200 mb-2">Ventes enregistrées</h4>
              {sales.filter((s) => s.items.some((it) => it.productId === historyProduct.id)).length === 0 ? (
                <p className="text-neutral-500 italic">Aucune vente enregistrée pour ce produit.</p>
              ) : (
                <div className="space-y-2">
                  {sales
                    .filter((s) => s.items.some((it) => it.productId === historyProduct.id))
                    .map((s) => {
                      const item = s.items.find((it) => it.productId === historyProduct.id);
                      return (
                        <div
                          key={s.id}
                          className="p-3 rounded-lg bg-neutral-800/60 border border-neutral-800 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-amber-400 font-mono">{s.bonNumber}</div>
                            <div className="text-neutral-300 text-[11px] mt-0.5">
                              {s.customerName} · {s.date}
                            </div>
                            {item?.imei && (
                              <div className="font-mono text-[10px] text-neutral-400">
                                IMEI: {item.imei}
                              </div>
                            )}
                          </div>
                          <div className="text-end">
                            <span className="font-mono font-bold text-neutral-100">
                              {formatMAD(item ? item.price * item.quantity : 0, language)}
                            </span>
                            {item?.isReturned && (
                              <div className="text-[10px] text-rose-400 font-semibold mt-0.5">
                                RETOURNÉ
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* If phone, show full IMEI inventory statuses */}
            {historyProduct.category === 'phone' && historyProduct.imeiList && (
              <div>
                <h4 className="font-bold text-neutral-200 mb-2">Statut des Numéros IMEI</h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {historyProduct.imeiList.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-between font-mono text-[11px]"
                    >
                      <span className="text-neutral-300">{item.imei}</span>
                      <div className="flex items-center gap-2">
                        {item.bonNumber && (
                          <span className="text-neutral-500">Bon {item.bonNumber}</span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            item.status === 'in_stock'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {item.status === 'in_stock' ? t.stock.inStock : t.stock.sold}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setStickerModalState({
                              isOpen: true,
                              product: historyProduct,
                              imei: item.imei,
                            })
                          }
                          className="p-1 rounded text-amber-400 hover:bg-amber-500/20 transition"
                          title={language === 'ar' ? 'طباعة ستيكر لهذا الـ IMEI' : 'Imprimer étiquette pour cet IMEI'}
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Stock Movements History (Partie 3 #8) */}
            <div>
              <h4 className="font-bold text-amber-400 mb-2">
                {isAr ? 'سجل حركات المخزون (دخول / خروج / جرد)' : 'Journal des Mouvements de Stock'}
              </h4>
              {stockMovements.filter((m) => m.productId === historyProduct.id).length === 0 ? (
                <p className="text-neutral-500 italic">
                  {isAr ? 'لا توجد حركات مسجلة بعد.' : 'Aucun mouvement enregistré.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {stockMovements
                    .filter((m) => m.productId === historyProduct.id)
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((m) => (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between text-[11px]"
                      >
                        <div>
                          <div className="font-semibold text-neutral-200">{m.reason}</div>
                          <div className="text-[10px] text-neutral-500 font-mono">
                            {m.date} · {m.userName} ({m.previousQty} → {m.newQty})
                          </div>
                        </div>
                        <span
                          className={`font-mono font-bold ${
                            m.quantityDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {m.quantityDelta >= 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Physical Inventory Count Modal (Partie 3 #8) */}
      <Modal
        isOpen={isInventoryModalOpen}
        onClose={() => setIsInventoryModalOpen(false)}
        title={isAr ? 'الجرد الفعلي وتصحيح المخزون' : 'Inventaire Physique & Ajustement de Stock'}
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          <p className="text-neutral-400">
            {isAr
              ? 'أدخل الكمية الفعلية المحسوبة في المحل لكل منتج لتسجيل الفارق وتحديث المخزون.'
              : 'Saisissez la quantité réelle comptée en rayon. Les écarts seront automatiquement enregistrés dans l’historique des mouvements.'}
          </p>

          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {isAr ? 'سبب التعديل / الجرد' : "Motif de l'inventaire"}
            </label>
            <input
              type="text"
              value={inventoryReason}
              onChange={(e) => setInventoryReason(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-neutral-800 divide-y divide-neutral-800">
            {products
              .filter((p) => p.category !== 'phone' && p.id)
              .map((p) => {
                const counted = inventoryCounts[p.id!] ?? p.quantity;
                const diff = counted - p.quantity;
                return (
                  <div
                    key={p.id}
                    className="p-2.5 bg-neutral-900 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-neutral-100 truncate">{p.name}</div>
                      <div className="text-[10px] text-neutral-400 font-mono">
                        {isAr ? 'الكمية النظرية:' : 'Théorique:'} {p.quantity}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono font-bold text-xs ${
                          diff === 0
                            ? 'text-neutral-500'
                            : diff > 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={counted}
                        onChange={(e) =>
                          setInventoryCounts((prev) => ({
                            ...prev,
                            [p.id!]: Math.max(0, parseInt(e.target.value, 10) || 0),
                          }))
                        }
                        className="w-20 bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-center font-mono font-bold text-amber-400"
                      />
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsInventoryModalOpen(false)}
              className="px-3.5 py-2 rounded-lg bg-neutral-800 text-neutral-300"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleApplyInventoryCounts}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold"
            >
              {isAr ? 'تأكيد الجرد وتحديث المخزون' : "Valider l'inventaire"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Used Phone Trade-In Modal (Partie 3 #5) */}
      <UsedPhoneTradeInModal
        isOpen={isTradeInModalOpen}
        onClose={() => setIsTradeInModalOpen(false)}
      />

      {/* Sticker QR & Code128 Label Print Modal */}
      <StickerPrintModal
        isOpen={stickerModalState.isOpen}
        onClose={() => setStickerModalState({ isOpen: false })}
        products={products}
        initialProduct={stickerModalState.product}
        initialImei={stickerModalState.imei}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteProductId}
        onClose={() => setDeleteProductId(null)}
        onConfirm={handleConfirmDelete}
        title="Supprimer le Produit"
        message={t.stock.deleteConfirm}
        isDestructive={true}
      />

      {/* Admin Approval Modal for Worker Edit/Delete */}
      {approvalModal && (
        <AdminApprovalModal
          isOpen={approvalModal.isOpen}
          onClose={() => setApprovalModal(null)}
          onApproved={approvalModal.onApproved}
          actionType={approvalModal.actionType}
          title={approvalModal.title}
          description={approvalModal.description}
          targetId={approvalModal.targetId}
          payload={approvalModal.payload}
        />
      )}
    </div>
  );
};
