import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Truck,
  Search,
  Plus,
  CreditCard,
  History,
  Edit,
  Trash2,
  Phone,
  MapPin,
  ShoppingBag,
  PackagePlus,
} from 'lucide-react';
import {
  db,
  registerSupplierPaymentTransaction,
  createSupplierPurchaseOrderTransaction,
  withSyncMetadata,
  queueOutboxOperation,
  logShopActivity,
  reserveNumber,
} from '../db';
import { Supplier, SupplierPurchaseItem, ProductCategory } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ScanButton } from '../components/ScanButton';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { useViewMode } from '../lib/viewMode';
import { useAccessAuth } from '../lib/accessAuth';
import { getMoroccoDateString } from '../lib/dateUtils';

export const SuppliersPage: React.FC = () => {
  const { t, language } = useI18n();
  const { success, error } = useToast();
  const { isMobileMode } = useViewMode();
  const { can } = useAccessAuth();
  const isAr = language === 'ar';

  const [search, setSearch] = useState('');

  // Add / Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier> | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [totalDebt, setTotalDebt] = useState<number>(0);

  // Payment Modal
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState('');

  // Purchase Order ("Bon d'Achat Fournisseur" - Partie 3 #3) Modal
  const [poSupplier, setPoSupplier] = useState<Supplier | null>(null);
  const [poItems, setPoItems] = useState<SupplierPurchaseItem[]>([]);
  const [poPaidAmount, setPoPaidAmount] = useState<string>('0');
  const [poNotes, setPoNotes] = useState('');
  // Draft item for PO
  const [selectedExistingProductId, setSelectedExistingProductId] = useState<string>('');
  const [itemProductName, setItemProductName] = useState('');
  const [itemCategory, setItemCategory] = useState<ProductCategory>('accessory');
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemPurchasePrice, setItemPurchasePrice] = useState<number>(0);
  const [itemRetailPrice, setItemRetailPrice] = useState<number>(0);
  const [itemWholesalePrice, setItemWholesalePrice] = useState<number>(0);
  const [itemImeisText, setItemImeisText] = useState('');

  // History Modal
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);

  // Delete
  const [deleteSupplierId, setDeleteSupplierId] = useState<number | null>(null);

  // Live queries
  const suppliers =
    useLiveQuery(async () => {
      const all = await db.suppliers.toArray();
      return all.filter((s) => !s.deleted_at);
    }, []) || [];
  const payments =
    useLiveQuery(async () => {
      const all = await db.supplierPayments.toArray();
      return all.filter((p) => !p.deleted_at);
    }, []) || [];
  const purchaseOrders =
    useLiveQuery(async () => {
      const all = await db.supplierPurchaseOrders.toArray();
      return all.filter((po) => !po.deleted_at);
    }, []) || [];
  const products =
    useLiveQuery(async () => {
      const all = await db.products.toArray();
      return all
        .filter((p) => !p.deleted_at)
        .map(({ image, ...rest }) => rest);
    }, []) || [];

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setName('');
    setPhone('');
    setAddress('');
    setTotalDebt(0);
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setName(s.name);
    setPhone(s.phone);
    setAddress(s.address || '');
    setTotalDebt(s.totalDebt);
    setIsEditModalOpen(true);
  };

  const handleOpenPurchaseOrder = (s: Supplier) => {
    setPoSupplier(s);
    setPoItems([]);
    setPoPaidAmount('0');
    setPoNotes('');
    setSelectedExistingProductId('');
    setItemProductName('');
    setItemCategory('accessory');
    setItemQuantity(1);
    setItemPurchasePrice(0);
    setItemRetailPrice(0);
    setItemWholesalePrice(0);
    setItemImeisText('');
  };

  const handleSelectExistingProductForPo = (prodIdStr: string) => {
    setSelectedExistingProductId(prodIdStr);
    if (!prodIdStr) return;
    const prod = products.find((p) => String(p.id) === prodIdStr);
    if (prod) {
      setItemProductName(prod.name);
      setItemCategory(prod.category);
      setItemPurchasePrice(prod.purchasePrice);
      setItemRetailPrice(prod.retailPrice);
      setItemWholesalePrice(prod.wholesalePrice);
    }
  };

  const handleAddPoItem = () => {
    if (!itemProductName.trim()) {
      error(isAr ? 'المرجو إدخال اسم المنتج.' : "Veuillez saisir le nom de l'article.");
      return;
    }
    const parsedImeis = itemImeisText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const finalQty =
      itemCategory === 'phone' && parsedImeis.length > 0
        ? parsedImeis.length
        : Math.max(1, Number(itemQuantity) || 1);

    if (itemCategory === 'phone' && parsedImeis.length === 0) {
      error(
        isAr
          ? 'بالنسبة للهواتف، يجب إدخال رقم IMEI واحد على الأقل.'
          : 'Pour les téléphones, veuillez saisir au moins un numéro IMEI.'
      );
      return;
    }

    const newItem: SupplierPurchaseItem = {
      productId: selectedExistingProductId ? Number(selectedExistingProductId) : undefined,
      productName: itemProductName.trim(),
      category: itemCategory,
      quantity: finalQty,
      purchasePrice: Number(itemPurchasePrice) || 0,
      retailPrice: Number(itemRetailPrice) || Math.round((Number(itemPurchasePrice) || 0) * 1.25),
      wholesalePrice:
        Number(itemWholesalePrice) || Math.round((Number(itemPurchasePrice) || 0) * 1.15),
      imeis: itemCategory === 'phone' ? parsedImeis : undefined,
    };

    setPoItems((prev) => [...prev, newItem]);
    setSelectedExistingProductId('');
    setItemProductName('');
    setItemQuantity(1);
    setItemPurchasePrice(0);
    setItemRetailPrice(0);
    setItemWholesalePrice(0);
    setItemImeisText('');
  };

  const poTotalAmount = poItems.reduce((sum, it) => sum + it.purchasePrice * it.quantity, 0);

  const handleSavePurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poSupplier?.id) return;
    if (poItems.length === 0) {
      error(
        isAr
          ? 'أضف منتجاً واحداً على الأقل في وصل الشراء.'
          : "Ajoutez au moins un article au bon d'achat."
      );
      return;
    }

    try {
      const reservedPoNum = await reserveNumber('po');
      const createdOrder = await createSupplierPurchaseOrderTransaction(
        {
          supplierId: poSupplier.id,
          date: getMoroccoDateString(),
          items: poItems,
          paidAmount: parseFloat(poPaidAmount) || 0,
          notes: poNotes.trim() || undefined,
        },
        reservedPoNum
      );
      success(
        isAr
          ? `تم حفظ وصل الشراء ${createdOrder.bonNumber} وتحديث المخزون وحساب المورد.`
          : `Bon d'achat ${createdOrder.bonNumber} enregistré et stock mis à jour.`
      );
      setPoSupplier(null);
    } catch (err: any) {
      error(err.message || (isAr ? 'خطأ أثناء حفظ وصل الشراء.' : "Erreur lors de l'enregistrement."));
    }
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      error(isAr ? 'الاسم والهاتف إجباريان.' : 'Nom et téléphone obligatoires.');
      return;
    }

    try {
      if (editingSupplier?.id) {
        const existing = await db.suppliers.get(editingSupplier.id);
        if (existing) {
          const updated = withSyncMetadata({
            ...existing,
            name: name.trim(),
            phone: phone.trim(),
            address: address.trim() || undefined,
            totalDebt: Number(totalDebt) || 0,
          });
          await db.suppliers.put(updated);
          await queueOutboxOperation('suppliers', 'update', updated);
        }
        success(isAr ? 'تم تحديث المورد.' : 'Fournisseur mis à jour.');
      } else {
        const created = withSyncMetadata<Supplier>({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim() || undefined,
          totalDebt: Number(totalDebt) || 0,
          paidAmount: 0,
        });
        const id = await db.suppliers.add(created);
        await queueOutboxOperation('suppliers', 'insert', { ...created, id });
        success(isAr ? 'تمت إضافة المورد بنجاح.' : 'Nouveau fournisseur ajouté.');
      }
      setIsEditModalOpen(false);
    } catch {
      error(isAr ? 'خطأ أثناء حفظ المورد.' : "Erreur lors de l'enregistrement du fournisseur.");
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentSupplier?.id || paymentAmount <= 0) return;

    try {
      await registerSupplierPaymentTransaction(
        paymentSupplier.id,
        paymentAmount,
        getMoroccoDateString(),
        paymentNote.trim() || 'Versement facture fournisseur'
      );
      success(
        isAr ? 'تم تسجيل دفعة المورد بنجاح.' : 'Versement fournisseur enregistré avec succès.'
      );
      setPaymentSupplier(null);
      setPaymentAmount(0);
      setPaymentNote('');
    } catch (err: any) {
      error(err.message || (isAr ? 'خطأ أثناء تسجيل الدفعة.' : 'Erreur lors du versement.'));
    }
  };

  const handleDeleteSupplier = async () => {
    if (!deleteSupplierId) return;
    if (!can('delete_records')) {
      error(isAr ? 'غير مسموح بحذف الموردين.' : 'Action réservée au propriétaire.');
      setDeleteSupplierId(null);
      return;
    }
    try {
      const hasProducts = products.some((p) => p.supplierId === deleteSupplierId);
      if (hasProducts) {
        error(
          isAr
            ? 'لا يمكن حذف هذا المورد لأن هناك منتجات مرتبطة به في المخزون.'
            : 'Impossible de supprimer ce fournisseur car des produits en stock y sont rattachés.'
        );
        setDeleteSupplierId(null);
        return;
      }
      const existing = await db.suppliers.get(deleteSupplierId);
      await db.suppliers.delete(deleteSupplierId);
      if (existing?.uuid) {
        await queueOutboxOperation('suppliers', 'delete', {
          uuid: existing.uuid,
          deleted_at: new Date().toISOString(),
        });
      }
      await logShopActivity({
        action: 'delete',
        entityType: 'supplier',
        entityId: String(deleteSupplierId),
        details: `Suppression fournisseur "${existing?.name || deleteSupplierId}"`,
      });
      success(isAr ? 'تم حذف المورد.' : 'Fournisseur supprimé.');
      setDeleteSupplierId(null);
    } catch {
      error(isAr ? 'خطأ أثناء الحذف.' : 'Erreur lors de la suppression.');
    }
  };

  // Filter
  const filteredSuppliers = suppliers.filter((s) => {
    const q = search.toLowerCase().trim();
    return !q || s.name.toLowerCase().includes(q) || s.phone.includes(q);
  });

  const totalBalanceOwed = suppliers.reduce(
    (sum, s) => sum + Math.max(0, s.totalDebt - s.paidAmount),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-400" />
            <span>{t.suppliers.title}</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            {isAr ? 'مجموع الديون المتبقية للموردين : ' : 'Total solde dû aux fournisseurs : '}
            <span className="font-mono font-bold text-amber-400">
              {formatMAD(totalBalanceOwed, language)}
            </span>
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className={`flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition shadow-sm active:scale-95 shrink-0 ${
            isMobileMode ? 'w-full py-3.5 px-4 text-sm min-h-[48px]' : 'px-3.5 py-2 text-xs'
          }`}
        >
          <Plus className={isMobileMode ? 'w-5 h-5' : 'w-4 h-4'} />
          <span>{t.suppliers.addSupplier}</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-4 rounded-2xl bg-black/35 backdrop-blur-md border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث عن مورد...' : 'Rechercher un fournisseur...'}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg ps-9 pe-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Suppliers Grid */}
      {filteredSuppliers.length === 0 ? (
        <div className="py-16 text-center text-xs text-neutral-400 bg-neutral-900/40 rounded-xl border border-neutral-800 flex flex-col items-center justify-center gap-3">
          <Truck className="w-10 h-10 text-neutral-600" />
          <p className="text-sm font-medium text-neutral-300">
            {search
              ? isAr
                ? 'ما كاين حتى مورد بهاد الاسم'
                : 'Aucun fournisseur trouvé pour cette recherche'
              : isAr
              ? 'ما كاين والو، زيد أول مورد'
              : 'Aucun fournisseur pour le moment, ajoutez le premier'}
          </p>
          {!search && (
            <button
              onClick={handleOpenAdd}
              className="mt-1 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.suppliers.addSupplier}</span>
            </button>
          )}
        </div>
      ) : (
        <div
          className={
            isMobileMode ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
          }
        >
          {filteredSuppliers.map((sup) => {
            const balanceOwed = Math.max(0, sup.totalDebt - sup.paidAmount);
            const supPOs = purchaseOrders.filter((po) => po.supplierId === sup.id);
            return (
              <div
                key={sup.id}
                className="p-4 sm:p-5 rounded-2xl bg-neutral-900 border border-neutral-800 flex flex-col justify-between space-y-4 hover:border-neutral-700 transition shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-neutral-100">{sup.name}</h3>
                      <a
                        href={`tel:${sup.phone}`}
                        className="text-xs text-neutral-300 hover:text-amber-400 mt-1 flex items-center gap-1.5 font-mono transition"
                      >
                        <Phone className="w-3.5 h-3.5 text-neutral-400" />
                        <span>{sup.phone}</span>
                      </a>
                    </div>
                    {supPOs.length > 0 && (
                      <span className="text-[10px] font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md font-bold">
                        {supPOs.length} {isAr ? 'وصولات شراء' : 'Bons BA'}
                      </span>
                    )}
                  </div>
                  {sup.address && (
                    <div className="text-[11px] text-neutral-400 mt-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate">{sup.address}</span>
                    </div>
                  )}

                  {/* Balances Box */}
                  <div className="mt-4 p-3.5 rounded-xl bg-neutral-950 border border-neutral-800/80 space-y-1.5 text-xs">
                    <div className="flex justify-between text-neutral-400">
                      <span>{isAr ? 'مجموع الفواتير :' : 'Total facturé :'}</span>
                      <span className="font-mono">{formatMAD(sup.totalDebt, language)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                      <span>{isAr ? 'مجموع المؤدى :' : 'Total réglé :'}</span>
                      <span className="font-mono text-emerald-400">
                        {formatMAD(sup.paidAmount, language)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-neutral-800 font-bold">
                      <span className="text-neutral-300">{t.suppliers.balanceOwed} :</span>
                      <span
                        className={`font-mono ${
                          balanceOwed > 0 ? 'text-amber-400 font-black' : 'text-emerald-400'
                        }`}
                      >
                        {formatMAD(balanceOwed, language)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div
                  className={`pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2 ${
                    isMobileMode ? 'flex-wrap' : ''
                  }`}
                >
                  <div className={`flex items-center gap-1.5 ${isMobileMode ? 'flex-1' : ''}`}>
                    {/* Bon d'achat fournisseur button (Partie 3 #3) */}
                    <button
                      onClick={() => handleOpenPurchaseOrder(sup)}
                      className={`font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                        isMobileMode
                          ? 'flex-1 py-3 px-3 text-xs min-h-[44px]'
                          : 'px-2.5 py-1.5 text-[11px]'
                      }`}
                      title={isAr ? 'وصل شراء سلعة جديد' : "Nouveau Bon d'Achat (BA)"}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>{isAr ? 'وصل شراء' : "Bon d'Achat"}</span>
                    </button>

                    {balanceOwed > 0 && (
                      <button
                        onClick={() => {
                          setPaymentSupplier(sup);
                          setPaymentAmount(balanceOwed);
                        }}
                        className={`font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                          isMobileMode
                            ? 'flex-1 py-3 px-3 text-xs min-h-[44px]'
                            : 'px-2.5 py-1.5 text-[11px]'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>{isAr ? 'تسجيل دفعة' : 'Verser'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => setHistorySupplier(sup)}
                      className={`rounded-xl text-neutral-300 hover:text-amber-400 bg-neutral-800 hover:bg-neutral-750 transition flex items-center justify-center ${
                        isMobileMode ? 'py-3 px-3.5 min-h-[44px]' : 'p-2'
                      }`}
                      title={t.suppliers.paymentHistory}
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleOpenEdit(sup)}
                      className={`rounded-xl text-neutral-300 hover:text-neutral-100 bg-neutral-800 hover:bg-neutral-700 transition flex items-center justify-center ${
                        isMobileMode ? 'py-3 px-3 min-h-[44px]' : 'p-2'
                      }`}
                      title={t.edit}
                    >
                      <Edit className="w-4 h-4 text-amber-400" />
                    </button>
                    {can('delete_records') && (
                      <button
                        onClick={() => setDeleteSupplierId(sup.id!)}
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

      {/* Create Supplier Purchase Order ("Bon d'Achat Fournisseur" - Partie 3 #3) */}
      {poSupplier && (
        <Modal
          isOpen={true}
          onClose={() => setPoSupplier(null)}
          title={
            isAr
              ? `وصل شراء سلعة من المورد : ${poSupplier.name}`
              : `Nouveau Bon d'Achat Fournisseur — ${poSupplier.name}`
          }
          maxWidth="xl"
        >
          <form onSubmit={handleSavePurchaseOrder} className="space-y-4 text-xs">
            {/* Add Line Item Card */}
            <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
              <div className="flex items-center gap-2 font-bold text-amber-400">
                <PackagePlus className="w-4 h-4" />
                <span>
                  {isAr
                    ? 'إضافة منتج لوصل الشراء (يزيد في المخزون تلقائياً)'
                    : 'Ajouter un article au bon (alimente le stock automatiquement)'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1">
                    {isAr ? 'منتج موجود في المخزون (اختياري)' : 'Produit existant (optionnel)'}
                  </label>
                  <select
                    value={selectedExistingProductId}
                    onChange={(e) => handleSelectExistingProductForPo(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-neutral-100"
                  >
                    <option value="">
                      {isAr ? '-- منتج جديد أو كتابة يدوية --' : '-- Nouvel article --'}
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({isAr ? 'المخزون:' : 'Stock:'} {p.quantity})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">
                    {isAr ? 'اسم المنتج *' : "Désignation de l'article *"}
                  </label>
                  <input
                    type="text"
                    value={itemProductName}
                    onChange={(e) => setItemProductName(e.target.value)}
                    placeholder="ex: iPhone 15 Pro 256Go / Chargeur 20W..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-neutral-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-neutral-400 mb-1">
                    {isAr ? 'الفئة' : 'Catégorie'}
                  </label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value as ProductCategory)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-2 text-neutral-100"
                  >
                    <option value="phone">{isAr ? 'هاتف' : 'Téléphone'}</option>
                    <option value="accessory">{isAr ? 'إكسسوار' : 'Accessoire'}</option>
                    <option value="tv">{isAr ? 'تلفاز' : 'TV'}</option>
                    <option value="trotinette">{isAr ? 'تروتينيت' : 'Trottinette'}</option>
                    <option value="other">{isAr ? 'أخرى' : 'Autre'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">
                    {isAr ? 'الكمية' : 'Quantité'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-neutral-100 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">
                    {isAr ? 'ثمن الشراء (درهم)' : "Prix d'achat (DH)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemPurchasePrice}
                    onChange={(e) => setItemPurchasePrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-amber-400 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-neutral-400 mb-1">
                    {isAr ? 'ثمن البيع بالتقسيط' : 'Prix vente détail'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemRetailPrice}
                    onChange={(e) => setItemRetailPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-emerald-400 font-mono font-bold"
                  />
                </div>
              </div>

              {itemCategory === 'phone' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-neutral-400">
                      {isAr
                        ? 'أرقام IMEI للهواتف المشتراة (كل رقم في سطر أو مفصول بفاصلة) *'
                        : 'Numéros IMEI des téléphones achetés (1 par ligne) *'}
                    </label>
                    <ScanButton
                      mode="imei"
                      onScan={(code) =>
                        setItemImeisText((prev) => (prev ? `${prev}\n${code}` : code))
                      }
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={itemImeisText}
                    onChange={(e) => setItemImeisText(e.target.value)}
                    placeholder="354891092837465..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-100 font-mono"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddPoItem}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إضافة للوصل' : 'Ajouter à la liste'}</span>
                </button>
              </div>
            </div>

            {/* Items Table */}
            {poItems.length > 0 && (
              <div className="rounded-xl border border-neutral-800 overflow-hidden">
                <table className="w-full text-start border-collapse">
                  <thead className="bg-neutral-950 text-neutral-400 text-[11px]">
                    <tr>
                      <th className="p-2.5 text-start">{isAr ? 'المنتج' : 'Article'}</th>
                      <th className="p-2.5 text-center">{isAr ? 'الكمية' : 'Qté'}</th>
                      <th className="p-2.5 text-end">{isAr ? 'ثمن الشراء' : 'P.U Achat'}</th>
                      <th className="p-2.5 text-end">{isAr ? 'المجموع' : 'Sous-total'}</th>
                      <th className="p-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 bg-neutral-900">
                    {poItems.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-bold text-neutral-200">
                          {it.productName}
                          {it.imeis && it.imeis.length > 0 && (
                            <div className="text-[10px] font-mono text-neutral-400">
                              IMEI: {it.imeis.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 text-center font-mono">{it.quantity}</td>
                        <td className="p-2.5 text-end font-mono">
                          {formatMAD(it.purchasePrice, language)}
                        </td>
                        <td className="p-2.5 text-end font-mono font-bold text-amber-400">
                          {formatMAD(it.purchasePrice * it.quantity, language)}
                        </td>
                        <td className="p-2.5 text-end">
                          <button
                            type="button"
                            onClick={() =>
                              setPoItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-rose-400 hover:text-rose-300 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals & Payment */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-neutral-950 border border-neutral-800">
              <div>
                <span className="text-neutral-400 block mb-1">
                  {isAr ? 'إجمالي الفاتورة' : 'Total Bon d’Achat'}
                </span>
                <span className="font-mono font-black text-base text-amber-400">
                  {formatMAD(poTotalAmount, language)}
                </span>
              </div>

              <div>
                <label className="text-neutral-300 font-medium block mb-1">
                  {isAr ? 'المبلغ المؤدى للمورد الآن (درهم)' : 'Montant versé maintenant (DH)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={poPaidAmount}
                  onChange={(e) => setPoPaidAmount(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-emerald-400 font-mono font-bold"
                />
              </div>

              <div>
                <span className="text-neutral-400 block mb-1">
                  {isAr ? 'الباقي في ذمة المحل' : 'Reste à payer (Dette)'}
                </span>
                <span className="font-mono font-black text-base text-rose-400">
                  {formatMAD(
                    Math.max(0, poTotalAmount - (parseFloat(poPaidAmount) || 0)),
                    language
                  )}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">
                {isAr ? 'ملاحظات وصل الشراء' : 'Notes / N° Facture fournisseur'}
              </label>
              <input
                type="text"
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                placeholder={isAr ? 'رقم الفاتورة أو ملاحظة...' : 'Référence facture, livraison...'}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPoSupplier(null)}
                className="px-3.5 py-2 rounded-lg bg-neutral-800 text-neutral-300"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold"
              >
                {isAr ? 'حفظ وصل الشراء وتحديث المخزون' : "Valider le Bon d'Achat"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add / Edit Supplier Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={
          editingSupplier?.id
            ? isAr
              ? 'تعديل بيانات المورد'
              : 'Modifier le Fournisseur'
            : t.suppliers.addSupplier
        }
        maxWidth="md"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {isAr ? 'الاسم / الشركة *' : 'Nom / Société *'}
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
              {isAr ? 'الهاتف *' : 'Téléphone *'}
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+212 5..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {isAr ? 'العنوان' : 'Adresse'}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ex: Derb Ghallef, Casablanca"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>
          <div>
            <label className="block text-neutral-300 font-medium mb-1">
              {isAr ? 'مجموع الفواتير (درهم)' : 'Total Facturé (DH)'}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalDebt}
              onChange={(e) => setTotalDebt(parseFloat(e.target.value) || 0)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
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
      {paymentSupplier && (
        <Modal
          isOpen={true}
          onClose={() => setPaymentSupplier(null)}
          title={`${isAr ? 'تسجيل دفعة للمورد' : 'Enregistrer Versement Fournisseur'} - ${
            paymentSupplier.name
          }`}
          maxWidth="md"
        >
          <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center font-mono">
              <span className="text-neutral-400">
                {isAr ? 'الباقي في ذمة المحل :' : 'Solde restant dû :'}
              </span>
              <span className="font-bold text-amber-400 text-sm">
                {formatMAD(
                  Math.max(0, paymentSupplier.totalDebt - paymentSupplier.paidAmount),
                  language
                )}
              </span>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                {isAr ? 'المبلغ المؤدى (درهم) *' : 'Montant à verser (DH) *'}
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono font-bold text-amber-400"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                {isAr ? 'طريقة الدفع / مرجع الفاتورة' : 'Mode / Référence règlement'}
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="ex: Virement bancaire, chèque N°..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentSupplier(null)}
                className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-lg"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg shadow-sm"
              >
                {isAr ? 'تأكيد الدفعة' : 'Valider le versement'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Supplier History Modal (Purchase Orders + Payments) */}
      {historySupplier && (
        <Modal
          isOpen={true}
          onClose={() => setHistorySupplier(null)}
          title={`${isAr ? 'سجل وصولات الشراء والدفعات :' : 'Historique Achats & Versements :'} ${
            historySupplier.name
          }`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center font-mono">
              <span className="text-neutral-400">
                {isAr ? 'مجموع المؤدى :' : 'Total Réglé :'}{' '}
              </span>
              <span className="font-bold text-emerald-400">
                {formatMAD(historySupplier.paidAmount, language)}
              </span>
            </div>

            {/* Purchase Orders Section */}
            <div className="space-y-2">
              <h4 className="font-bold text-amber-400">
                {isAr ? 'وصولات الشراء (Bons d’Achat)' : 'Bons d’Achat (BA)'}
              </h4>
              {purchaseOrders.filter((po) => po.supplierId === historySupplier.id).length === 0 ? (
                <p className="text-neutral-500 italic">
                  {isAr ? 'لا توجد وصولات شراء مسجلة.' : 'Aucun bon d’achat enregistré.'}
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {purchaseOrders
                    .filter((po) => po.supplierId === historySupplier.id)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((po) => (
                      <div
                        key={po.id}
                        className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1"
                      >
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-bold text-indigo-300">
                            {po.bonNumber} · {po.date}
                          </span>
                          <span className="font-bold text-amber-400">
                            {formatMAD(po.totalAmount, language)}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          {po.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Payments Section */}
            <div className="space-y-2">
              <h4 className="font-bold text-emerald-400">
                {isAr ? 'الدفعات المسجلة' : 'Versements effectués'}
              </h4>
              {payments.filter((p) => p.supplierId === historySupplier.id).length === 0 ? (
                <p className="text-center py-4 text-neutral-500 italic">
                  {isAr
                    ? 'لا توجد دفعات مسجلة لهذا المورد.'
                    : 'Aucun versement enregistré pour ce fournisseur.'}
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {payments
                    .filter((p) => p.supplierId === historySupplier.id)
                    .map((p) => (
                      <div
                        key={p.id}
                        className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between font-mono"
                      >
                        <div>
                          <div className="font-bold text-emerald-400">
                            {formatMAD(p.amount, language)}
                          </div>
                          <div className="text-[11px] text-neutral-400 font-sans mt-0.5">
                            {p.note || 'Règlement fournisseur'}
                          </div>
                        </div>
                        <span className="text-neutral-500 text-xs">{p.date}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteSupplierId}
        onClose={() => setDeleteSupplierId(null)}
        onConfirm={handleDeleteSupplier}
        title={isAr ? 'حذف المورد' : 'Supprimer le fournisseur'}
        message={
          isAr
            ? 'هل أنت متأكد من حذف هذا المورد؟'
            : 'Êtes-vous sûr de vouloir supprimer ce fournisseur ?'
        }
        isDestructive={true}
      />
    </div>
  );
};
