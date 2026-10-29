import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Receipt,
  Search,
  Plus,
  Trash2,
  Printer,
  UserCheck,
  UserPlus,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  FileText,
  ShieldCheck,
  Percent,
  Calendar,
  AlertTriangle,
  Clock,
  Split,
  PlusCircle,
  MessageCircle,
  Package,
} from 'lucide-react';
import { db, createSaleTransaction, getStoreSettings, reserveNumber, withSyncMetadata, queueOutboxOperation, getPosBundles, savePosBundles } from '../db';
import { Product, SaleItem, Customer, PaymentType, PriceType, Sale, Installment, CustomerType, PosBundle } from '../types';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { useLicensePlan } from '../lib/licensePlan';
import { formatMAD } from '../lib/currency';
import {
  openWhatsAppChat,
  renderWhatsAppMessage,
  DEFAULT_WHATSAPP_TEMPLATES_AR,
  DEFAULT_WHATSAPP_TEMPLATES_FR,
} from '../lib/whatsapp';
import { ScanButton } from '../components/ScanButton';
import { ReceiptPrintModal } from '../components/ReceiptPrintModal';
import { UsedPhoneTradeInModal } from '../components/UsedPhoneTradeInModal';
import { getMoroccoDateString } from '../lib/dateUtils';
import { GlassKpiCard, GoldInventoryBox3D } from '../components/GoldenGlassUI';

interface PosPageProps {
  onNavigateToBons?: () => void;
}

export const PosPage: React.FC<PosPageProps> = ({ onNavigateToBons }) => {
  const { t, language } = useI18n();
  const { success, error } = useToast();
  const { isFeatureAllowed, requireFeature } = useLicensePlan();

  // Search & Catalog
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Cart
  const [cart, setCart] = useState<SaleItem[]>([]);

  // Customer Section
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(undefined);
  const [customerName, setCustomerName] = useState('Client Comptoir');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCIN, setCustomerCIN] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('retail');
  const [customerCreditLimit, setCustomerCreditLimit] = useState<number | undefined>(undefined);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);

  // Credit Limit Warning Override state
  const [confirmedCreditLimitOverride, setConfirmedCreditLimitOverride] = useState(false);

  // Payment & Terms
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [paidAmount, setPaidAmount] = useState<number>(0);

  // Due Date (Échéance) for Credit / Remaining Balance
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return getMoroccoDateString(d);
  });

  // Optional Installments Schedule (Échéancier)
  const [showInstallments, setShowInstallments] = useState(false);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [splitCount, setSplitCount] = useState<number>(3);
  const [splitFreq, setSplitFreq] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');

  // 1. Warranty is optional per sale (OFF by default)
  const [warrantyEnabled, setWarrantyEnabled] = useState<boolean>(false);
  // 2. Free warranty duration (number of months, min 1)
  const [warrantyMonths, setWarrantyMonths] = useState<number>(12);

  // 4. Discount per sale (DH or %)
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState<number>(0);

  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Post-sale success modal
  const [lastCreatedSale, setLastCreatedSale] = useState<Sale | null>(null);
  const [receiptPreviewSale, setReceiptPreviewSale] = useState<Sale | null>(null);
  const [showTradeInModal, setShowTradeInModal] = useState(false);

  // Accessory Bundles / Packs state
  const [bundles, setBundles] = useState<PosBundle[]>([]);
  const [isBundleModalOpen, setIsBundleModalOpen] = useState(false);
  const [newBundleName, setNewBundleName] = useState('');
  const [newBundlePrice, setNewBundlePrice] = useState<number>(0);
  const [newBundleItems, setNewBundleItems] = useState<{ productId: number; quantity: number }[]>([]);

  // Live queries from Dexie (strip base64 images from list - Partie 1 #11)
  const products =
    useLiveQuery(async () => {
      const list = await db.products.toArray();
      return list
        .filter((p) => !p.deleted_at)
        .map(({ image, ...rest }) => rest as Product);
    }, []) || [];
  const customers =
    useLiveQuery(async () => {
      const list = await db.customers.toArray();
      return list.filter((c) => !c.deleted_at);
    }, []) || [];

  // Initialize default warranty duration setting and load POS bundles
  useEffect(() => {
    async function loadSettings() {
      const s = await getStoreSettings();
      if (s.defaultWarrantyMonths !== undefined && s.defaultWarrantyMonths > 0) {
        setWarrantyMonths(s.defaultWarrantyMonths);
      }
      const savedBundles = await getPosBundles();
      setBundles(savedBundles);
    }
    loadSettings();
  }, []);

  // Add an entire Accessory Bundle (Pack) to Cart in 1 click
  const handleApplyBundle = (bundle: PosBundle) => {
    if (!requireFeature('pos_bundles', 'باكات الإكسسوارات السريعة (Bundles)', 'إنشاء باقات سريعة مخفضة تنقص من الستوك بكليكة واحدة.')) return;
    const validLines: { product: Product; qty: number }[] = [];
    for (const bItem of bundle.items) {
      const prod = products.find((p) => p.id === bItem.productId);
      if (!prod) continue;
      if (prod.quantity < bItem.quantity) {
        error(
          language === 'ar'
            ? `المنتج "${prod.name}" داخل الباك غير متوفر بالكمية الكافية (${prod.quantity} متوفرة).`
            : `Stock insuffisant pour "${prod.name}" dans ce pack (${prod.quantity} dispo).`
        );
        return;
      }
      validLines.push({ product: prod, qty: bItem.quantity });
    }

    if (validLines.length === 0) {
      error(
        language === 'ar'
          ? 'منتجات هذا الباك لم تعد موجودة في المخزون.'
          : 'Les produits de ce pack ne sont plus dans le stock.'
      );
      return;
    }

    // Distribute bundle price across items proportionally so total equals bundle.bundlePrice
    const rawSum = validLines.reduce((s, l) => s + l.product.retailPrice * l.qty, 0);
    const updatedCart = [...cart];

    let allocatedSum = 0;
    validLines.forEach((line, index) => {
      const isLast = index === validLines.length - 1;
      const lineShare =
        rawSum > 0
          ? isLast
            ? Math.max(0, bundle.bundlePrice - allocatedSum)
            : Math.round(((line.product.retailPrice * line.qty) / rawSum) * bundle.bundlePrice * 100) / 100
          : Math.round((bundle.bundlePrice / validLines.length) * 100) / 100;
      const unitBundlePrice = Math.round((lineShare / line.qty) * 100) / 100;
      allocatedSum += unitBundlePrice * line.qty;

      updatedCart.push({
        productId: line.product.id!,
        name: `${line.product.name} [${bundle.name}]`,
        category: line.product.category,
        quantity: line.qty,
        price: unitBundlePrice,
        originalPrice: line.product.retailPrice,
        costPrice: line.product.purchasePrice,
        type: 'retail',
      });
    });

    setCart(updatedCart);
    success(
      language === 'ar'
        ? `تمت إضافة "${bundle.name}" للسلة بثمن الباك (${bundle.bundlePrice} DH)`
        : `Pack "${bundle.name}" ajouté au panier (${bundle.bundlePrice} DH)`
    );
  };

  const handleSaveNewBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBundleName.trim() || newBundleItems.length === 0 || newBundlePrice <= 0) {
      error(
        language === 'ar'
          ? 'يرجى إدخال اسم الباك، الثمن الإجمالي، واختيار منتج واحد على الأقل.'
          : 'Veuillez saisir le nom du pack, le prix global et au moins un article.'
      );
      return;
    }
    const created: PosBundle = {
      id: `pack_${Date.now()}`,
      name: newBundleName.trim(),
      bundlePrice: Number(newBundlePrice),
      items: newBundleItems.map((it) => {
        const p = products.find((prod) => prod.id === it.productId);
        return {
          productId: it.productId,
          productName: p?.name || `Produit #${it.productId}`,
          quantity: it.quantity,
        };
      }),
      createdAt: getMoroccoDateString(),
    };
    const next = [...bundles, created];
    setBundles(next);
    await savePosBundles(next);
    setNewBundleName('');
    setNewBundlePrice(0);
    setNewBundleItems([]);
    setIsBundleModalOpen(false);
    success(language === 'ar' ? 'تم حفظ الباك السريع بنجاح!' : 'Pack enregistré avec succès !');
  };

  const handleDeleteBundle = async (id: string) => {
    const next = bundles.filter((b) => b.id !== id);
    setBundles(next);
    await savePosBundles(next);
  };

  // Calculate Subtotal (sum of all cart lines)
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Calculate Discount amount in DH
  const rawDiscountAmount = discountType === 'percent'
    ? Math.round(((subtotal * (discountValue || 0)) / 100) * 100) / 100
    : Math.max(0, discountValue || 0);

  const discountAmount = Math.min(subtotal, Math.max(0, rawDiscountAmount));
  const finalTotal = Math.max(0, subtotal - discountAmount);

  // Sync paidAmount default when finalTotal changes and payment is cash
  useEffect(() => {
    if (paymentType === 'cash') {
      setPaidAmount(finalTotal);
    }
  }, [finalTotal, paymentType]);

  const remainingAmount = Math.max(0, finalTotal - paidAmount);

  // Automatically calculated warranty end date
  const calculatedWarrantyEndDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + (warrantyMonths || 1));
    return d.toLocaleDateString(language === 'ar' ? 'ar-MA' : 'fr-MA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [warrantyMonths, language]);

  // Add Product to Cart
  const handleAddToCart = (product: Product) => {
    if (product.quantity <= 0) {
      error(`${product.name} est en rupture de stock.`);
      return;
    }

    if (product.category === 'phone') {
      // Find available IMEI
      const availableImei = product.imeiList?.find(
        (i) => i.status === 'in_stock' && !cart.some((c) => c.imei === i.imei)
      );

      if (!availableImei) {
        error(`Tous les numéros IMEI de ${product.name} sont déjà dans le panier ou vendus.`);
        return;
      }

      const newItem: SaleItem = {
        productId: product.id!,
        name: product.name,
        category: 'phone',
        imei: availableImei.imei,
        quantity: 1,
        price: product.retailPrice,
        originalPrice: product.retailPrice,
        costPrice: product.purchasePrice,
        type: 'retail',
      };
      setCart((prev) => [...prev, newItem]);
      success(`${product.name} ajouté (IMEI: ${availableImei.imei})`);
    } else {
      // Non-phone item
      const existingIndex = cart.findIndex((item) => item.productId === product.id);
      if (existingIndex >= 0) {
        const existing = cart[existingIndex];
        if (existing.quantity + 1 > product.quantity) {
          error(`Stock maximal atteint (${product.quantity}) pour ${product.name}.`);
          return;
        }
        const updated = [...cart];
        updated[existingIndex] = {
          ...existing,
          quantity: existing.quantity + 1,
        };
        setCart(updated);
      } else {
        const newItem: SaleItem = {
          productId: product.id!,
          name: product.name,
          category: product.category,
          quantity: 1,
          price: product.retailPrice,
          originalPrice: product.retailPrice,
          costPrice: product.purchasePrice,
          type: 'retail',
        };
        setCart((prev) => [...prev, newItem]);
      }
      success(`${product.name} ajouté au panier.`);
    }
  };

  // Change IMEI for phone item in cart
  const handleChangeItemImei = (cartIndex: number, newImei: string) => {
    const updated = [...cart];
    updated[cartIndex].imei = newImei;
    setCart(updated);
  };

  // Instant Camera Scan in POS (Barcode, QR, or Phone IMEI)
  const handlePosScan = (scannedCode: string, meta?: { isIMEI?: boolean; raw?: string }) => {
    const code = scannedCode.trim();
    if (!code) return;

    // 1. Check if code matches a specific phone IMEI in stock
    for (const p of products) {
      if (p.category === 'phone' && p.imeiList) {
        const matchedImei = p.imeiList.find(
          (im) => im.imei === code || (meta?.raw && im.imei === meta.raw.trim())
        );
        if (matchedImei) {
          if (matchedImei.status !== 'in_stock') {
            error(
              language === 'ar'
                ? `هذا الـ IMEI (${matchedImei.imei}) مباع مسبقاً أو غير متوفر في المخزون.`
                : `Cet IMEI (${matchedImei.imei}) est déjà vendu ou indisponible.`
            );
            return;
          }
          if (cart.some((c) => c.imei === matchedImei.imei)) {
            error(
              language === 'ar'
                ? `هذا الهاتف (${matchedImei.imei}) موجود بالفعل في السلة!`
                : `Ce téléphone (IMEI: ${matchedImei.imei}) est déjà dans le panier !`
            );
            return;
          }

          const unitPrice =
            customerType === 'wholesale' && p.wholesalePrice > 0
              ? p.wholesalePrice
              : p.retailPrice;

          const newItem: SaleItem = {
            productId: p.id!,
            name: p.name,
            category: 'phone',
            imei: matchedImei.imei,
            quantity: 1,
            price: unitPrice,
            originalPrice: unitPrice,
            costPrice: p.purchasePrice,
            type: customerType === 'wholesale' ? 'wholesale' : 'retail',
          };
          setCart((prev) => [...prev, newItem]);
          success(
            language === 'ar'
              ? `${t.scanner.phoneWithIMEIFound} (${p.name} - ${matchedImei.imei})`
              : `${t.scanner.phoneWithIMEIFound} (${p.name} - ${matchedImei.imei})`
          );
          return;
        }
      }
    }

    // 2. Check if code matches a product barcode
    const matchedProduct = products.find(
      (p) => p.barcode && p.barcode.trim().toLowerCase() === code.toLowerCase()
    );
    if (matchedProduct) {
      handleAddToCart(matchedProduct);
      return;
    }

    // 3. Check if code matches product name or QR code format
    const matchedByName = products.find(
      (p) => p.name.trim().toLowerCase() === code.toLowerCase() || `PROD-${p.id}` === code
    );
    if (matchedByName) {
      handleAddToCart(matchedByName);
      return;
    }

    // 4. Not found
    setProductSearch(code);
    if (/^\d{15}$/.test(code) || meta?.isIMEI) {
      error(`${t.scanner.imeiNotFound} (${code})`);
    } else {
      error(`${t.scanner.productNotFound} (${code})`);
    }
  };

  // 4. Update Item Price manually per sale line (does NOT alter catalog product price)
  const handleUpdatePrice = (cartIndex: number, newPrice: number) => {
    const updated = [...cart];
    updated[cartIndex] = {
      ...updated[cartIndex],
      price: Math.max(0, newPrice),
    };
    setCart(updated);
  };

  // Toggle Retail / Wholesale Price for item
  const handleTogglePriceType = (cartIndex: number) => {
    const item = cart[cartIndex];
    const product = products.find((p) => p.id === item.productId);
    if (!product) return;

    const newType: PriceType = item.type === 'retail' ? 'wholesale' : 'retail';
    const newPrice = newType === 'retail' ? product.retailPrice : product.wholesalePrice;

    const updated = [...cart];
    updated[cartIndex] = {
      ...item,
      type: newType,
      price: newPrice,
    };
    setCart(updated);
  };

  // Update Item Quantity
  const handleUpdateQuantity = (cartIndex: number, qty: number) => {
    const item = cart[cartIndex];
    const product = products.find((p) => p.id === item.productId);
    if (!product) return;

    if (qty > product.quantity) {
      error(`Stock insuffisant (${product.quantity} disponibles).`);
      return;
    }

    if (qty <= 0) {
      handleRemoveItem(cartIndex);
      return;
    }

    const updated = [...cart];
    updated[cartIndex] = { ...item, quantity: qty };
    setCart(updated);
  };

  // Remove Item from Cart
  const handleRemoveItem = (cartIndex: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== cartIndex));
  };

  // Select Customer from existing list
  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    setCustomerCIN(cust.CIN || '');
    setCustomerType(cust.customerType || 'retail');
    setConfirmedCreditLimitOverride(false);
  };

  // Create New Customer Inline
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;

    try {
      const customerPayload = withSyncMetadata<Customer>({
        name: customerName.trim(),
        phone: customerPhone.trim(),
        CIN: customerCIN.trim() || undefined,
        customerType: customerType || 'retail',
        creditLimit: customerCreditLimit && customerCreditLimit > 0 ? customerCreditLimit : undefined,
        totalCredit: 0,
      });
      const newId = await db.customers.add(customerPayload);
      await queueOutboxOperation('customers', 'insert', { ...customerPayload, id: newId });
      setSelectedCustomerId(newId);
      setShowNewCustomerModal(false);
      success("Nouveau client enregistré.");
    } catch {
      error("Erreur lors de l'enregistrement du client.");
    }
  };

  // Helper: Shortcut to set Due Date (+15j, +30j, +60j)
  const handleSetDueDateOffset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDueDate(getMoroccoDateString(d));
  };

  // Helper: Auto-split Installment Schedule
  const handleGenerateAutoInstallments = () => {
    if (remainingAmount <= 0) {
      error("Le reste à payer est de 0 DH. Aucun échéancier requis.");
      return;
    }
    const count = Math.max(1, splitCount);
    const baseAmount = Math.floor(remainingAmount / count);
    const remainder = remainingAmount - (baseAmount * count);
    const intervalDays = splitFreq === 'weekly' ? 7 : splitFreq === 'biweekly' ? 15 : 30;

    const generated: Installment[] = [];
    for (let i = 0; i < count; i++) {
      const d = new Date();
      d.setDate(d.getDate() + intervalDays * (i + 1));
      const trancheAmount = i === count - 1 ? baseAmount + remainder : baseAmount;
      generated.push({
        id: `inst_${Date.now()}_${i}`,
        amount: trancheAmount,
        dueDate: getMoroccoDateString(d),
        paid: false,
        note: `Tranche ${i + 1}/${count}`,
      });
    }
    setInstallments(generated);
    success(`Échéancier de ${count} tranches généré.`);
  };

  // Helper: Add custom blank installment
  const handleAddSingleInstallment = () => {
    const currentSum = installments.reduce((sum, i) => sum + i.amount, 0);
    const remainingToAllocate = Math.max(0, remainingAmount - currentSum);
    const d = new Date();
    d.setDate(d.getDate() + 30 * (installments.length + 1));
    setInstallments([
      ...installments,
      {
        id: `inst_${Date.now()}_${installments.length}`,
        amount: remainingToAllocate > 0 ? remainingToAllocate : 100,
        dueDate: getMoroccoDateString(d),
        paid: false,
        note: `Échéance ${installments.length + 1}`,
      },
    ]);
  };

  const handleUpdateInstallment = (idx: number, field: keyof Installment, val: any) => {
    const copy = [...installments];
    copy[idx] = { ...copy[idx], [field]: val };
    setInstallments(copy);
  };

  const handleRemoveInstallment = (idx: number) => {
    setInstallments(installments.filter((_, i) => i !== idx));
  };

  // Process & Validate Sale (Atomic Dexie transaction)
  // N2: All UI validations (including phone qty === 1 and credit limit) must pass BEFORE calling reserveNumber('bon')
  const handleCheckout = async (printImmediate: boolean = true) => {
    if (cart.length === 0) {
      error(t.pos.emptyCart);
      return;
    }

    // 1. Validate unit prices >= 0, quantity > 0, and phone quantity === 1 + IMEI
    const seenImeis = new Set<string>();
    for (const item of cart) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        error(`Quantité invalide pour ${item.name}.`);
        return;
      }
      if (item.price < 0 || isNaN(item.price)) {
        error(t.pos.invalidPriceError);
        return;
      }
      if (item.category === 'phone') {
        if (item.quantity !== 1) {
          error(
            language === 'ar'
              ? `بالنسبة للهاتف (${item.name})، يجب أن تكون الكمية 1 بالضبط.`
              : `Pour un téléphone (${item.name}), la quantité doit être exactement 1.`
          );
          return;
        }
        const cleanImei = (item.imei || '').trim();
        if (!cleanImei) {
          error(t.pos.selectImeiError);
          return;
        }
        if (seenImeis.has(cleanImei)) {
          error(`L'IMEI ${cleanImei} est sélectionné plusieurs fois dans le panier.`);
          return;
        }
        seenImeis.add(cleanImei);
      }
    }

    // 2. Validate discount cannot exceed total
    if (discountAmount < 0 || discountAmount > subtotal) {
      error(t.pos.discountExceedsError);
      return;
    }

    // 3. Validate paid amount cannot be negative or exceed final total
    if (paidAmount < 0 || paidAmount > finalTotal + 0.01) {
      error(t.pos.paidExceedsError);
      return;
    }

    // 4. Partie 1 #3: Forbid credit sale (remainingAmount > 0) when no customer is selected
    if (remainingAmount > 0 && (!selectedCustomerId || selectedCustomerId <= 0)) {
      error(
        language === 'ar'
          ? 'لا يمكن تسجيل بيع بالكريدي بدون اختيار زبون! المرجو تحديد زبون من القائمة أو إضافة زبون جديد.'
          : 'Impossible de valider une vente à crédit (reste à payer > 0) sans sélectionner un client !'
      );
      return;
    }

    // 5. N2: Validate customer credit limit BEFORE reserving a bon number
    if (remainingAmount > 0 && selectedCustomerId) {
      const selCust = customers.find((c) => c.id === selectedCustomerId);
      if (!selCust) {
        error(
          language === 'ar'
            ? 'الزبون المحدد غير موجود.'
            : 'Le client sélectionné est introuvable.'
        );
        return;
      }
      const projectedDebt = (selCust.totalCredit || 0) + remainingAmount;
      const isLimitExceeded = Boolean(
        selCust.creditLimit &&
          selCust.creditLimit > 0 &&
          projectedDebt > selCust.creditLimit
      );
      if (isLimitExceeded && !confirmedCreditLimitOverride) {
        error(
          language === 'ar'
            ? `تم تجاوز سقف الكريدي المسموح به (${selCust.creditLimit} DH). يرجى تأكيد التجاوز أولاً.`
            : `Plafond de crédit dépassé (${selCust.creditLimit} DH). Veuillez confirmer le dépassement avant de valider.`
        );
        return;
      }
    }

    // 6. Validate installments total cannot exceed remaining amount
    if (installments.length > 0 && remainingAmount > 0) {
      const sumInst = installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      if (sumInst > remainingAmount + 0.01) {
        error(`Le total de l'échéancier (${sumInst} DH) ne peut pas dépasser le reste à payer (${remainingAmount} DH).`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const reservedBon = await reserveNumber('bon');
      const sale = await createSaleTransaction(
        {
          customerId: selectedCustomerId,
          customerName: customerName.trim() || 'Client Comptoir',
          customerPhone: customerPhone.trim() || undefined,
          items: cart,
          subtotal,
          discountAmount: discountAmount > 0 ? discountAmount : undefined,
          discountType: discountAmount > 0 ? discountType : undefined,
          discountValue: discountAmount > 0 ? discountValue : undefined,
          totalAmount: finalTotal,
          paidAmount,
          remainingAmount,
          paymentType,
          dueDate: remainingAmount > 0 && dueDate ? dueDate : undefined,
          installments: remainingAmount > 0 && installments.length > 0 ? installments : undefined,
          hasWarranty: warrantyEnabled,
          warrantyMonths: warrantyEnabled ? Math.max(1, warrantyMonths) : 0,
          date: getMoroccoDateString(),
          notes: notes.trim() || undefined,
          status: 'active',
        },
        reservedBon
      );

      setLastCreatedSale(sale);
      success(`${t.pos.saleSuccess} (N° ${sale.bonNumber})`);

      if (printImmediate) {
        const settings = await getStoreSettings();
        const { generateBonPDF, generateWarrantyPDF } = await import('../lib/pdfGenerator');
        await generateBonPDF(sale, settings, 'save');
        if (warrantyEnabled) {
          await generateWarrantyPDF(sale, settings, 'save');
        }
      }

      // Reset cart and fields
      setCart([]);
      setDiscountValue(0);
      setWarrantyEnabled(false);
      setPaidAmount(0);
      setNotes('');
      setSelectedCustomerId(undefined);
      setCustomerName('Client Comptoir');
      setCustomerPhone('');
      setCustomerCIN('');
      setInstallments([]);
      setShowInstallments(false);
      setConfirmedCreditLimitOverride(false);
    } catch (err: any) {
      error(err.message || "Erreur lors de la validation du bon.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Send WhatsApp sale receipt
  const handleSendWhatsApp = async (sale: Sale) => {
    if (!sale.customerPhone || !sale.customerPhone.trim()) {
      error(t.whatsapp.noPhoneAlert);
      return;
    }

    try {
      const settings = await getStoreSettings();
      const templates = settings.whatsappTemplates || {};
      const fallbackTemplates =
        language === 'ar' ? DEFAULT_WHATSAPP_TEMPLATES_AR : DEFAULT_WHATSAPP_TEMPLATES_FR;
      const template = templates.saleReceipt || fallbackTemplates.saleReceipt;

      const text = renderWhatsAppMessage(template, {
        clientName: sale.customerName,
        bonNumber: sale.bonNumber,
        total: sale.totalAmount,
        remaining: sale.remainingAmount,
        storeName: settings.storeName || (language === 'ar' ? 'المحل' : 'Le magasin'),
      });

      const opened = openWhatsAppChat(sale.customerPhone, text);
      if (opened) {
        success(language === 'ar' ? 'تم فتح تطبيق واتساب بنجاح.' : 'Discussion WhatsApp ouverte avec succès.');
      } else {
        error(language === 'ar' ? 'رقم الهاتف غير صالح للمراسلة عبر واتساب.' : 'Numéro de téléphone non valide pour WhatsApp.');
      }
    } catch {
      error(language === 'ar' ? 'حدث خطأ أثناء فتح واتساب.' : "Erreur lors de l'ouverture de WhatsApp.");
    }
  };

  // Filter Catalog
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    const q = productSearch.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.imeiList && p.imeiList.some((i) => i.imei.includes(q) && i.status === 'in_stock'));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* 3 Top 3D Gold KPI Cards — Identical to Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassKpiCard
          title={language === 'ar' ? 'إجمالي السلة الحالي' : 'Total Panier Actuel'}
          value={formatMAD(finalTotal, language)}
          subtitle={`${ language === 'ar' ? 'عدد المواد:' : 'Articles:' } ${cart.reduce((s, i) => s + i.quantity, 0)}`}
          variant="gold"
          iconType="money"
        />
        <GlassKpiCard
          title={language === 'ar' ? 'المبلغ المؤدى نقداً' : 'Montant Payé'}
          value={formatMAD(paidAmount, language)}
          subtitle={
            remainingAmount > 0
              ? `${language === 'ar' ? 'المتبقي كريدي:' : 'Reste crédit:'} ${formatMAD(remainingAmount, language)}`
              : language === 'ar'
              ? 'خالص بالكامل • 100%'
              : 'Soldé • 100%'
          }
          variant="green"
          iconType="trend"
        />
        <GlassKpiCard
          title={language === 'ar' ? 'السلع المتوفرة للبيع' : 'Articles Disponibles'}
          value={`${filteredProducts.filter((p) => p.quantity > 0).length} SKU`}
          subtitle={`${language === 'ar' ? 'إجمالي القطع:' : 'Unités:'} ${products.reduce((s, p) => s + Math.max(0, p.quantity), 0)}`}
          variant="white"
          iconType="box"
        />
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (7 cols): Catalog Search + Glass Product Cards + Cart */}
        <div className="lg:col-span-7 space-y-4">
          {/* Catalog Search & Category Filters */}
          <div className="relative overflow-hidden bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.55)] space-y-4">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#FFD700] absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder={language === 'ar' ? 'ابحث بالاسم أو الباركود أو IMEI...' : 'Scanner code-barres ou rechercher par nom, IMEI...'}
                    className="w-full bg-black/60 border border-yellow-500/25 rounded-full ps-10 pe-4 py-2.5 text-xs text-white placeholder-gray-400 focus:outline-hidden focus:border-[#FFD700]"
                  />
                </div>
                <ScanButton
                  onScan={handlePosScan}
                  mode="any"
                  continuous={true}
                  variant="button"
                  label={language === 'ar' ? '📷 مسح' : '📷 Scanner'}
                  title={t.scanner.scanBarcodeOrQR}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!requireFeature('reprise_contract', 'شراء هاتف مستعمل (Reprise)', 'عقد شراء هاتف مستعمل رسمي مع صورة CIN والتوقيع لحماية المحل.')) return;
                  setShowTradeInModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gradient-to-r from-yellow-500/20 to-amber-500/10 hover:from-yellow-500/30 hover:to-amber-500/20 text-[#FFD700] border border-yellow-500/40 font-bold text-xs transition shadow-[0_4px_15px_rgba(255,215,0,0.15)]"
              >
                <Smartphone className="w-4 h-4 text-[#FFD700]" />
                <span>{language === 'ar' ? 'شراء هاتف مستعمل (Reprise)' : 'Reprise Occasion'}</span>
                {!isFeatureAllowed('reprise_contract') && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-300 text-[9px] font-mono font-bold">
                    PRO 🔒
                  </span>
                )}
              </button>
            </div>

            {/* Quick category filter */}
            <div className="flex items-center gap-2 overflow-x-auto py-1 text-xs">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3.5 py-1.5 rounded-full transition font-bold ${
                  selectedCategory === 'all'
                    ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                    : 'bg-black/50 text-gray-300 border border-yellow-500/20 hover:border-yellow-500/40 hover:text-white'
                }`}
              >
                {t.all}
              </button>
              {(['phone', 'accessory', 'tv', 'trotinette', 'other'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full transition whitespace-nowrap font-bold ${
                    selectedCategory === cat
                      ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-black shadow-[0_4px_15px_rgba(255,215,0,0.3)]'
                      : 'bg-black/50 text-gray-300 border border-yellow-500/20 hover:border-yellow-500/40 hover:text-white'
                  }`}
                >
                  {t.stock.categories[cat]}
                </button>
              ))}
            </div>

            {/* Quick Accessory Bundles / Packs Bar */}
            <div className="pt-2 border-t border-yellow-500/15 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-black text-[#FFD700] flex items-center gap-1 me-1">
                  <Package className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'الباكات السريعة (Packs):' : 'Packs Rapides:'}</span>
                </span>
                {bundles.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleApplyBundle(b)}
                    className="px-3 py-1 rounded-full bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/40 text-white text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95"
                  >
                    <span>🎁 {b.name}</span>
                    <span className="font-mono font-black text-[#FFD700]">{b.bundlePrice} DH</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!requireFeature('pos_bundles', 'باكات الإكسسوارات السريعة (Bundles)', 'إنشاء باقات سريعة مخفضة تنقص من الستوك بكليكة واحدة.')) return;
                  setIsBundleModalOpen(true);
                }}
                className="px-2.5 py-1 rounded-full bg-black/60 hover:bg-black/80 border border-yellow-500/30 text-[#FFD700] text-[11px] font-bold flex items-center gap-1 transition"
              >
                <Plus className="w-3 h-3" />
                <span>{language === 'ar' ? 'إنشاء / إدارة الباكات' : 'Gérer les Packs'}</span>
                {!isFeatureAllowed('pos_bundles') && (
                  <span className="px-1 py-0.2 rounded bg-amber-500/25 text-amber-300 text-[9px] font-mono font-bold">
                    PRO 🔒
                  </span>
                )}
              </button>
            </div>

            {/* Product Catalog Grid — Dashboard Glass Card Style */}
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 pe-1">
              {filteredProducts.length === 0 ? (
                <div className="sm:col-span-2 py-8 text-center text-xs text-gray-400">
                  {language === 'ar' ? 'ما كاين والو، زيد السلعة فالمخزن باش تبدا تبيع' : 'Aucun produit en stock, ajoutez des articles au stock.'}
                </div>
              ) : (
                filteredProducts.slice(0, 12).map((p) => {
                  const isOutOfStock = p.quantity <= 0;
                  return (
                    <div
                      key={p.id}
                      onClick={() => !isOutOfStock && handleAddToCart(p)}
                      className={`relative overflow-hidden p-4 rounded-[20px] border transition-all duration-300 flex items-center justify-between gap-3 ${
                        isOutOfStock
                          ? 'opacity-40 bg-black/40 border-white/10 cursor-not-allowed'
                          : 'bg-black/65 backdrop-blur-xl border-yellow-500/25 hover:border-[#FFD700] hover:scale-[1.02] cursor-pointer shadow-[0_8px_24px_rgba(0,0,0,0.4)]'
                      }`}
                    >
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: 'radial-gradient(circle at 20% 50%, rgba(255, 200, 50, 0.12) 0%, transparent 70%)',
                        }}
                      />
                      <div className="relative z-10 flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center shrink-0">
                          <GoldInventoryBox3D className="w-8 h-8" />
                        </div>
                        <div className="truncate">
                          <div className="font-bold text-white text-xs sm:text-sm truncate">{p.name}</div>
                          <div className="text-[11px] text-gray-300 flex items-center gap-2 mt-0.5">
                            <span className="text-[#22c55e] font-bold">Stock: {p.quantity}</span>
                            {p.category === 'phone' && (
                              <span className="px-1.5 py-0.2 rounded bg-yellow-500/20 text-[#FFD700] font-mono text-[10px]">
                                IMEI
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="relative z-10 text-end shrink-0">
                        <div className="font-mono font-black text-sm sm:text-base text-[#FFD700]" dir="ltr">
                          {formatMAD(p.retailPrice, language)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Cart Table — Glass Card */}
          <div className="relative overflow-hidden bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.55)] space-y-3">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <span>{t.pos.cart}</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-yellow-500/20 text-[#FFD700] border border-yellow-500/30">
                  {cart.length}
                </span>
              </h2>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold"
                >
                  {language === 'ar' ? 'إفراغ السلة' : 'Vider le panier'}
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400 border border-dashed border-yellow-500/20 rounded-[16px] bg-black/40">
                {t.pos.emptyCart}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pe-1">
                {cart.map((item, idx) => {
                  const product = products.find((p) => p.id === item.productId);
                  const availableImeis =
                    product?.imeiList?.filter(
                      (i) => i.status === 'in_stock' && (!cart.some((c, cIdx) => cIdx !== idx && c.imei === i.imei))
                    ) || [];

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-[16px] bg-black/60 border border-yellow-500/20 flex flex-col gap-2 text-xs shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-bold text-white text-sm">{item.name}</div>
                          {/* Price type toggle pill & Editable unit price */}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <button
                              type="button"
                              onClick={() => handleTogglePriceType(idx)}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                                item.type === 'retail'
                                  ? 'bg-yellow-500/20 text-[#FFD700] border border-yellow-500/40'
                                  : 'bg-white/10 text-gray-200 border border-white/20'
                              }`}
                            >
                              {item.type === 'retail' ? 'Détail' : 'Gros'}
                            </button>

                            {/* 4. Editable Unit Price Input */}
                            <div className="flex items-center gap-1 bg-black/70 border border-yellow-500/30 rounded-lg px-2 py-0.5" title="Prix unitaire personnalisable pour cette vente">
                              <span className="text-[10px] text-gray-400">P.U:</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.price}
                                onChange={(e) => handleUpdatePrice(idx, parseFloat(e.target.value) || 0)}
                                className="w-16 bg-transparent font-mono text-[#FFD700] text-[11px] font-black text-end focus:outline-hidden"
                              />
                              <span className="text-[10px] text-[#FFD700]">DH</span>
                            </div>
                          </div>
                        </div>

                        {/* Quantity controls (disabled if phone) */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.category === 'phone' ? (
                            <span className="font-mono px-2.5 py-1 bg-yellow-500/15 border border-yellow-500/30 rounded-lg text-[#FFD700] text-[11px] font-bold">
                              Qté: 1
                            </span>
                          ) : (
                            <div className="flex items-center bg-black/70 rounded-lg border border-yellow-500/30">
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(idx, item.quantity - 1)}
                                className="px-2.5 py-1 text-gray-300 hover:text-white font-bold"
                              >
                                -
                              </button>
                              <span className="font-mono px-2 text-white font-bold">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(idx, item.quantity + 1)}
                                className="px-2.5 py-1 text-gray-300 hover:text-white font-bold"
                              >
                                +
                              </button>
                            </div>
                          )}

                          <div className="font-mono font-black text-[#FFD700] w-24 text-end text-sm">
                            {formatMAD(item.price * item.quantity, language)}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-gray-400 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Phone IMEI Selection Dropdown */}
                      {item.category === 'phone' && (
                        <div className="pt-2 border-t border-yellow-500/15 flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-[#FFD700] shrink-0" />
                          <label className="text-[11px] text-gray-300 shrink-0">IMEI :</label>
                          <select
                            value={item.imei || ''}
                            onChange={(e) => handleChangeItemImei(idx, e.target.value)}
                            className="flex-1 bg-black/80 border border-yellow-500/30 rounded-lg px-2.5 py-1 text-[11px] text-[#FFD700] font-mono focus:outline-hidden"
                          >
                            <option value="">Sélectionner un IMEI en stock...</option>
                            {availableImeis.map((im) => (
                              <option key={im.imei} value={im.imei}>
                                {im.imei}
                              </option>
                            ))}
                          </select>
                          <ScanButton
                            onScan={(scannedImei) => {
                              const match = availableImeis.find((im) => im.imei === scannedImei.trim());
                              if (match) {
                                handleChangeItemImei(idx, match.imei);
                                success(`IMEI ${match.imei} sélectionné !`);
                              } else {
                                error(
                                  language === 'ar'
                                    ? `الـ IMEI (${scannedImei}) غير متوفر لهذا الموديل في المخزون.`
                                    : `L'IMEI (${scannedImei}) n'est pas en stock pour ce modèle.`
                                );
                              }
                            }}
                            mode="imei"
                            size="sm"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Customer, Payment, Total & Print */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative overflow-hidden bg-black/35 backdrop-blur-md border border-amber-500/30 rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.55)] space-y-4 text-xs">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-300/40 to-transparent" />
            {/* Customer Header */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-bold text-white flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-[#FFD700]" />
                  <span>{t.pos.customerInfo}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(true)}
                  className="text-amber-400 hover:text-amber-300 text-[11px] font-semibold flex items-center gap-1"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Nouveau</span>
                </button>
              </div>

              {/* Customer Selector */}
              <select
                value={selectedCustomerId || ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  setSelectedCustomerId(val);
                  if (val) {
                    const cust = customers.find((c) => c.id === val);
                    if (cust) handleSelectCustomer(cust);
                  } else {
                    setCustomerName('Client Comptoir');
                    setCustomerPhone('');
                    setCustomerCIN('');
                  }
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50 mb-2"
              >
                <option value="">Client Comptoir (Passager)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''} {c.totalCredit > 0 ? `· Crédit: ${c.totalCredit} DH` : ''}
                  </option>
                ))}
              </select>

              {/* Inline Customer details */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nom du client"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 text-xs"
                />
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Téléphone"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 text-xs font-mono"
                />
              </div>

              {/* Selected Customer Credit Info & Limit Warning */}
              {selectedCustomerId && (() => {
                const selCust = customers.find((c) => c.id === selectedCustomerId);
                if (!selCust) return null;
                const projectedDebt = (selCust.totalCredit || 0) + remainingAmount;
                const isLimitExceeded = Boolean(
                  selCust.creditLimit && selCust.creditLimit > 0 && projectedDebt > selCust.creditLimit && remainingAmount > 0
                );

                return (
                  <div className="mt-2 space-y-2">
                    <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            selCust.customerType === 'wholesale'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-neutral-800 text-neutral-300'
                          }`}
                        >
                          {selCust.customerType === 'wholesale' ? t.customers.wholesale : t.customers.retail}
                        </span>
                        <span className="text-neutral-400">Crédit actuel :</span>
                        <span className="font-mono font-bold text-amber-400">
                          {formatMAD(selCust.totalCredit, language)}
                        </span>
                      </div>
                      {selCust.creditLimit && selCust.creditLimit > 0 && (
                        <span className="text-neutral-400 text-[10px]">
                          Plafond : <strong className="text-neutral-200">{formatMAD(selCust.creditLimit, language)}</strong>
                        </span>
                      )}
                    </div>

                    {/* Credit Limit Exceeded Warning */}
                    {isLimitExceeded && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-xs space-y-2">
                        <div className="flex items-start gap-2 text-amber-400">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold">{t.pos.creditLimitExceededWarning}</div>
                            <div className="text-[11px] text-amber-300/90 mt-0.5">
                              {t.pos.creditLimitExceededDesc}{' '}
                              <strong className="font-mono text-white">{formatMAD(projectedDebt, language)}</strong>{' '}
                              ({t.pos.creditLimitMax} : {formatMAD(selCust.creditLimit!, language)}).
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setConfirmedCreditLimitOverride(!confirmedCreditLimitOverride)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1.5 ${
                              confirmedCreditLimitOverride
                                ? 'bg-amber-500 text-neutral-950 font-bold'
                                : 'bg-neutral-900 border border-amber-500/50 text-amber-300 hover:bg-neutral-800'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {confirmedCreditLimitOverride ? 'Dépassement autorisé' : t.pos.continueAnyway}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Payment Mode */}
            <div className="pt-3 border-t border-neutral-800">
              <label className="block font-semibold text-neutral-300 mb-1.5">
                {t.pos.paymentType}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['cash', 'credit', 'installment'] as PaymentType[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setPaymentType(mode);
                      if (mode === 'cash') setPaidAmount(finalTotal);
                      if (mode === 'credit') setPaidAmount(0);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition ${
                      paymentType === mode
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {mode === 'cash' ? 'Cash' : mode === 'credit' ? 'Crédit' : 'Facilité'}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Discount Section (DH or %) */}
            <div className="pt-3 border-t border-neutral-800">
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.pos.discount}</span>
                </label>
                <div className="flex items-center bg-neutral-950 rounded-md border border-neutral-800 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`px-2 py-0.5 rounded transition ${
                      discountType === 'fixed'
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    DH
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-2 py-0.5 rounded transition ${
                      discountType === 'percent'
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max={discountType === 'percent' ? 100 : subtotal}
                  step="any"
                  value={discountValue || ''}
                  onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder={discountType === 'percent' ? 'ex: 10%' : 'ex: 100 DH'}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 font-mono text-xs focus:outline-hidden focus:border-amber-500/50"
                />
                {discountAmount > 0 && (
                  <span className="text-xs font-mono font-bold text-rose-400 shrink-0">
                    - {formatMAD(discountAmount, language)}
                  </span>
                )}
              </div>
            </div>

            {/* 1 & 2. Warranty Section: Optional Toggle & Free Duration */}
            <div className="pt-3 border-t border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <label
                  onClick={() => setWarrantyEnabled(!warrantyEnabled)}
                  className="font-semibold text-neutral-300 flex items-center gap-2 cursor-pointer select-none"
                >
                  <ShieldCheck className={`w-4 h-4 ${warrantyEnabled ? 'text-amber-400' : 'text-neutral-500'}`} />
                  <span>{t.pos.warrantyToggle} (ضمان)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setWarrantyEnabled(!warrantyEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    warrantyEnabled ? 'bg-amber-500' : 'bg-neutral-800'
                  }`}
                  aria-pressed={warrantyEnabled}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-neutral-950 shadow-md ring-0 transition duration-200 ease-in-out ${
                      warrantyEnabled ? (language === 'ar' ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {warrantyEnabled ? (
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-neutral-400">
                      {t.pos.warrantyDurationMonths} :
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={warrantyMonths}
                        onChange={(e) => setWarrantyMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-center font-mono font-bold text-amber-400 text-xs focus:outline-hidden focus:border-amber-500"
                      />
                      <span className="text-[11px] text-neutral-400 font-semibold">{t.pos.months}</span>
                    </div>
                  </div>

                  {/* Quick duration shortcuts: 1, 3, 6, 12, 24 */}
                  <div className="flex items-center gap-1.5">
                    {[1, 3, 6, 12, 24].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setWarrantyMonths(m)}
                        className={`flex-1 py-1 rounded text-[11px] font-mono font-semibold border text-center transition ${
                          warrantyMonths === m
                            ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>

                  {/* Calculated end date */}
                  <div className="text-[11px] text-neutral-400 flex items-center justify-between pt-1 border-t border-neutral-800/80">
                    <span>{t.pos.warrantyValidUntil} :</span>
                    <span className="font-semibold text-emerald-400 font-mono">
                      {calculatedWarrantyEndDate}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-neutral-500 italic">
                  {t.pos.warrantyDisabled} — Aucun certificat de garantie ne sera généré.
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block font-semibold text-neutral-300 mb-1">
                {t.notes}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ex: Acompte espèces, reste fin du mois..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 text-xs"
              />
            </div>

              {/* Total / Paid / Remaining Calculation Box */}
            <div className="p-4 rounded-[16px] bg-black/60 border border-yellow-500/25 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-300">
                <span>{t.pos.subtotal} :</span>
                <span className="font-mono font-bold text-sm text-white">
                  {formatMAD(subtotal, language)}
                </span>
              </div>

              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-rose-400">
                  <span>
                    {t.pos.discount} {discountType === 'percent' && discountValue ? `(${discountValue}%)` : ''} :
                  </span>
                  <span className="font-mono font-bold text-sm">
                    - {formatMAD(discountAmount, language)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-yellow-500/20">
                <span className="text-white font-black">{t.total} Net :</span>
                <span className="font-mono font-black text-lg text-[#FFD700]">
                  {formatMAD(finalTotal, language)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-yellow-500/20">
                <span className="text-[#22c55e] font-bold">{t.pos.paidAmount} (DH) :</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={finalTotal}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                  className="w-32 bg-black/80 border border-yellow-500/30 rounded-lg px-2.5 py-1 text-end font-mono font-black text-[#22c55e] text-xs focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-yellow-500/20">
                <span className="text-gray-300">{t.pos.remainingCredit} :</span>
                <span
                  className={`font-mono font-black ${
                    remainingAmount > 0 ? 'text-rose-400' : 'text-[#22c55e]'
                  }`}
                >
                  {formatMAD(remainingAmount, language)}
                </span>
              </div>
            </div>

            {/* 1 & 2. Due Date & Installment Schedule (When there is a remaining balance) */}
            {remainingAmount > 0 && (
              <div className="pt-3 border-t border-yellow-500/20 space-y-3">
                {/* Due Date (Date d'échéance) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-semibold text-gray-200 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#FFD700]" />
                      <span>{t.pos.dueDate}</span>
                    </label>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleSetDueDateOffset(15)}
                        className="px-2 py-0.5 rounded bg-black/60 hover:bg-black/80 border border-yellow-500/25 text-gray-200"
                      >
                        {t.pos.dueDateShortcut15}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetDueDateOffset(30)}
                        className="px-2 py-0.5 rounded bg-black/60 hover:bg-black/80 border border-yellow-500/25 text-gray-200"
                      >
                        {t.pos.dueDateShortcut30}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetDueDateOffset(60)}
                        className="px-2 py-0.5 rounded bg-black/60 hover:bg-black/80 border border-yellow-500/25 text-gray-200"
                      >
                        {t.pos.dueDateShortcut60}
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-black/60 border border-yellow-500/25 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-hidden focus:border-[#FFD700]"
                  />
                </div>

                {/* Optional Installment Schedule (Échéancier) */}
                <div className="p-3 rounded-lg bg-black/60 border border-yellow-500/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label
                      onClick={() => setShowInstallments(!showInstallments)}
                      className="font-semibold text-gray-200 flex items-center gap-2 cursor-pointer select-none text-xs"
                    >
                      <Clock className="w-3.5 h-3.5 text-[#FFD700]" />
                      <span>{t.pos.scheduleInstallments}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowInstallments(!showInstallments)}
                      className="text-[#FFD700] text-[11px] font-semibold hover:underline"
                    >
                      {showInstallments ? 'Masquer' : 'Configurer'}
                    </button>
                  </div>

                  {showInstallments && (
                    <div className="space-y-3 pt-2 border-t border-yellow-500/15">
                      {/* Automatic Split Controls */}
                      <div className="p-2.5 rounded bg-black/70 border border-yellow-500/20 space-y-2">
                        <span className="text-[11px] font-semibold text-gray-200 flex items-center gap-1">
                          <Split className="w-3 h-3 text-[#FFD700]" />
                          <span>{t.pos.autoSplit}</span>
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <label className="text-[10px] text-gray-400 block mb-0.5">{t.pos.splitCount}</label>
                            <div className="flex gap-1">
                              {[2, 3, 4, 6].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setSplitCount(n)}
                                  className={`flex-1 py-1 rounded text-center font-mono text-xs ${
                                    splitCount === n
                                      ? 'bg-gradient-to-r from-yellow-500 to-amber-300 text-black font-bold'
                                      : 'bg-black/80 text-gray-400'
                                  }`}
                                >
                                  {n}x
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 block mb-0.5">{t.pos.splitFrequency}</label>
                            <select
                              value={splitFreq}
                              onChange={(e) => setSplitFreq(e.target.value as any)}
                              className="w-full bg-black/80 border border-yellow-500/25 rounded px-1.5 py-1 text-white text-[11px]"
                            >
                              <option value="monthly">{t.pos.freqMonthly}</option>
                              <option value="biweekly">{t.pos.freqBiWeekly}</option>
                              <option value="weekly">{t.pos.freqWeekly}</option>
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateAutoInstallments}
                          className="w-full py-1 text-[11px] font-semibold bg-yellow-500/15 hover:bg-yellow-500/25 text-[#FFD700] rounded border border-yellow-500/30 transition"
                        >
                          Calculer les tranches
                        </button>
                      </div>

                      {/* Installments Rows */}
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {installments.map((inst, idx) => (
                          <div
                            key={inst.id || idx}
                            className="flex items-center gap-1.5 bg-black/70 p-1.5 rounded border border-yellow-500/20 text-[11px]"
                          >
                            <span className="font-mono text-gray-400 w-5 text-center">#{idx + 1}</span>
                            <input
                              type="number"
                              min="1"
                              step="any"
                              value={inst.amount}
                              onChange={(e) =>
                                handleUpdateInstallment(idx, 'amount', parseFloat(e.target.value) || 0)
                              }
                              className="w-20 bg-black/90 border border-yellow-500/25 rounded px-1.5 py-0.5 text-end font-mono text-[#FFD700] text-xs"
                            />
                            <span className="text-[10px] text-gray-400">DH</span>
                            <input
                              type="date"
                              value={inst.dueDate}
                              onChange={(e) => handleUpdateInstallment(idx, 'dueDate', e.target.value)}
                              className="flex-1 bg-black/90 border border-yellow-500/25 rounded px-1.5 py-0.5 text-white font-mono text-[10px]"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveInstallment(idx)}
                              className="text-gray-500 hover:text-rose-400 p-0.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={handleAddSingleInstallment}
                          className="text-[11px] text-[#FFD700] hover:text-amber-300 font-medium flex items-center gap-1"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>{t.pos.addInstallment}</span>
                        </button>
                        <span className="text-[10px] font-mono text-gray-400">
                          Total :{' '}
                          <strong
                            className={
                              installments.reduce((s, i) => s + (Number(i.amount) || 0), 0) > remainingAmount
                                ? 'text-rose-400'
                                : 'text-[#22c55e]'
                            }
                          >
                            {formatMAD(installments.reduce((s, i) => s + (Number(i.amount) || 0), 0), language)}
                          </strong>{' '}
                          / {formatMAD(remainingAmount, language)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={isSubmitting || cart.length === 0}
                onClick={() => handleCheckout(true)}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-full bg-gradient-to-r from-yellow-500 to-amber-300 hover:from-yellow-400 hover:to-amber-200 disabled:opacity-50 text-black font-black text-sm transition shadow-[0_6px_20px_rgba(255,215,0,0.35)]"
              >
                <Printer className="w-4 h-4" />
                <span>{t.pos.saveAndPrint}</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting || cart.length === 0}
                onClick={() => handleCheckout(false)}
                className="w-full py-2.5 px-4 rounded-full bg-black/60 hover:bg-black/80 border border-yellow-500/30 disabled:opacity-50 text-white font-bold text-xs transition"
              >
                {t.pos.saveOnly}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Customer Modal */}
      <Modal
        isOpen={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        title="Ajouter un Client Rapide"
        maxWidth="md"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Nom Complet *</label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Téléphone *</label>
              <input
                type="text"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+212 6..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Type de client</label>
              <select
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value as CustomerType)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              >
                <option value="retail">Détaillant (Détail)</option>
                <option value="wholesale">Grossiste (Gros)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">CIN (Optionnel)</label>
              <input
                type="text"
                value={customerCIN}
                onChange={(e) => setCustomerCIN(e.target.value)}
                placeholder="ex: BE123456"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-neutral-300 font-medium mb-1">{t.customers.creditLimit}</label>
              <input
                type="number"
                min="0"
                step="any"
                value={customerCreditLimit || ''}
                onChange={(e) => setCustomerCreditLimit(parseFloat(e.target.value) || undefined)}
                placeholder="ex: 10000 DH"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setShowNewCustomerModal(false)}
              className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-500 text-neutral-950 font-bold rounded-lg"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      {/* Post-Sale Success Dialog */}
      {lastCreatedSale && (
        <Modal
          isOpen={!!lastCreatedSale}
          onClose={() => setLastCreatedSale(null)}
          title="Bon de Vente Validé !"
          maxWidth="md"
        >
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="font-mono text-xl font-bold text-amber-400">
              {lastCreatedSale.bonNumber}
            </div>
            <p className="text-xs text-neutral-300">
              Vente enregistrée pour <strong>{lastCreatedSale.customerName}</strong> d'un montant de{' '}
              <strong>{formatMAD(lastCreatedSale.totalAmount, language)}</strong>.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => setReceiptPreviewSale(lastCreatedSale)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {language === 'ar'
                    ? 'معاينة وطباعة الوصل (58mm / 80mm / A4)'
                    : 'Aperçu & Imprimer Reçu (58mm / 80mm / A4)'}
                </span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const settings = await getStoreSettings();
                  const { generateBonPDF } = await import('../lib/pdfGenerator');
                  await generateBonPDF(lastCreatedSale, settings, 'save');
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 font-bold text-xs shadow"
              >
                <FileText className="w-4 h-4" />
                <span>PDF (A4)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSendWhatsApp(lastCreatedSale)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-xs shadow transition active:scale-95"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{language === 'ar' ? 'إرسال بالواتساب' : 'Envoyer par WhatsApp'}</span>
              </button>

              {lastCreatedSale.hasWarranty && lastCreatedSale.warrantyMonths > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const settings = await getStoreSettings();
                    const { generateWarrantyPDF } = await import('../lib/pdfGenerator');
                    await generateWarrantyPDF(lastCreatedSale, settings, 'save');
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Imprimer Garantie (A4)</span>
                </button>
              )}

              {onNavigateToBons && (
                <button
                  type="button"
                  onClick={() => {
                    setLastCreatedSale(null);
                    onNavigateToBons();
                  }}
                  className="w-full sm:w-auto px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs"
                >
                  Voir dans l'historique
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Thermal / Browser Receipt Print & Preview Modal */}
      <ReceiptPrintModal
        isOpen={!!receiptPreviewSale}
        onClose={() => setReceiptPreviewSale(null)}
        sale={receiptPreviewSale}
      />

      {/* Used Phone Trade-In Modal (Partie 3 #5) */}
      <UsedPhoneTradeInModal
        isOpen={showTradeInModal}
        onClose={() => setShowTradeInModal(false)}
      />

      {/* Quick Accessory Bundles / Packs Manager Modal */}
      <Modal
        isOpen={isBundleModalOpen}
        onClose={() => setIsBundleModalOpen(false)}
        title={
          language === 'ar'
            ? '🎁 إدارة باكات الإكسسوارات السريعة (Packs / Bundles POS)'
            : '🎁 Gestion des Packs & Bundles Rapides'
        }
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <form onSubmit={handleSaveNewBundle} className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
            <h4 className="font-bold text-amber-400">
              {language === 'ar' ? 'إنشاء باك جديد (مثال: باك الحماية = بوشيط + أنكاسابل + شارجور)' : 'Créer un nouveau Pack'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {language === 'ar' ? 'اسم الباك *' : 'Nom du Pack *'}
                </label>
                <input
                  type="text"
                  required
                  value={newBundleName}
                  onChange={(e) => setNewBundleName(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: باك الحماية الشامل' : 'ex: Pack Protection'}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-neutral-300 font-semibold mb-1">
                  {language === 'ar' ? 'ثمن الباك الإجمالي (DH) *' : 'Prix global du Pack (DH) *'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={newBundlePrice || ''}
                  onChange={(e) => setNewBundlePrice(parseFloat(e.target.value) || 0)}
                  placeholder="ex: 100"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 font-mono font-bold text-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-300 font-semibold mb-1">
                {language === 'ar' ? 'اختر السلع المكونة للباك (تُخصم من المخزون أوتوماتيكياً):' : 'Articles inclus dans le pack :'}
              </label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-neutral-800 divide-y divide-neutral-800 bg-neutral-900/60">
                {products
                  .filter((p) => p.category !== 'phone' && p.id)
                  .map((p) => {
                    const selected = newBundleItems.find((i) => i.productId === p.id);
                    return (
                      <div key={p.id} className="p-2 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 cursor-pointer flex-1 truncate">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewBundleItems((prev) => [...prev, { productId: p.id!, quantity: 1 }]);
                              } else {
                                setNewBundleItems((prev) => prev.filter((i) => i.productId !== p.id));
                              }
                            }}
                            className="accent-amber-500"
                          />
                          <span className="text-neutral-200 font-medium truncate">{p.name}</span>
                          <span className="text-[10px] font-mono text-neutral-400">({p.retailPrice} DH)</span>
                        </label>
                        {selected && (
                          <input
                            type="number"
                            min="1"
                            value={selected.quantity}
                            onChange={(e) => {
                              const q = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setNewBundleItems((prev) =>
                                prev.map((i) => (i.productId === p.id ? { ...i, quantity: q } : i))
                              );
                            }}
                            className="w-14 bg-neutral-950 border border-neutral-700 rounded px-1.5 py-0.5 text-center font-mono text-amber-400"
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black transition"
              >
                {language === 'ar' ? '+ حفظ الباك السريع' : '+ Enregistrer le Pack'}
              </button>
            </div>
          </form>

          {/* Existing Bundles List */}
          <div className="space-y-2">
            <h4 className="font-bold text-neutral-300">
              {language === 'ar' ? 'الباكات المسجلة حالياً :' : 'Packs enregistrés :'}
            </h4>
            {bundles.length === 0 ? (
              <p className="text-neutral-500 text-center py-3">
                {language === 'ar' ? 'لا يوجد أي باك مسجل بعد.' : 'Aucun pack enregistré.'}
              </p>
            ) : (
              bundles.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>🎁 {b.name}</span>
                      <span className="font-mono text-amber-400">{b.bundlePrice} DH</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      {b.items.map((i) => `${i.quantity}x ${i.productName}`).join(' + ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleApplyBundle(b);
                        setIsBundleModalOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold"
                    >
                      {language === 'ar' ? 'إضافة للسلة' : 'Ajouter'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBundle(b.id)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

