import Dexie, { type Table } from 'dexie';
import {
  Product,
  Supplier,
  SupplierPayment,
  SupplierPurchaseOrder,
  SupplierPurchaseItem,
  Customer,
  CustomerPayment,
  Sale,
  Warranty,
  SavTicket,
  StoreSettings,
  SaleItem,
  Installment,
  CreditAuditLog,
  CustomerType,
  PaymentMethod,
  RepairOrder,
  RepairStatus,
  SparePart,
  UsedSparePart,
  Expense,
  RecurringExpense,
  ExpenseCategory,
  SyncOutboxItem,
  SyncConflictItem,
  ActivityLogEntry,
  StockMovement,
  StockMovementType,
  CashClosure,
  UserRole,
  PhoneCondition,
  PosBundle,
} from '../types';
import { getMoroccoDateString, getMoroccoYearMonth, addMonthsClamped, todayMA, monthMA, nowMA } from '../lib/dateUtils';
import { encryptSensitiveData, generateUUID } from '../lib/cryptoUtils';
import { getActiveShopPhoneNumber, setActiveShopPhoneNumber } from '../firebase';

const DEVICE_ID_STORAGE_KEY = 'golden_shop_device_id';
const SHOP_ID_STORAGE_KEY = 'golden_shop_id';
const DEVICE_PREFIX_STORAGE_KEY = 'golden_shop_device_prefix';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!id) {
      id = `dev_${generateUUID().slice(0, 8)}`;
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'dev_local';
  }
}

/**
 * Deterministic 2-char Device Prefix (e.g. A1, B4, C7) so two workers selling offline
 * on separate devices never generate colliding Bon or Repair numbers (e.g. BON-2026-A1-0045).
 */
export function getDevicePrefix(): string {
  try {
    const custom = localStorage.getItem(DEVICE_PREFIX_STORAGE_KEY);
    if (custom && /^[A-Z0-9]{1,4}$/.test(custom)) {
      return custom;
    }
    const devId = getDeviceId().replace(/^dev_/, '').toUpperCase();
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let hash = 0;
    for (let i = 0; i < devId.length; i++) {
      hash = (hash * 31 + devId.charCodeAt(i)) >>> 0;
    }
    const letter = letters[hash % letters.length];
    const digit = (hash % 9) + 1;
    const prefix = `${letter}${digit}`;
    localStorage.setItem(DEVICE_PREFIX_STORAGE_KEY, prefix);
    return prefix;
  } catch {
    return 'A1';
  }
}

export function setDevicePrefix(prefix: string): void {
  try {
    const clean = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (clean) {
      localStorage.setItem(DEVICE_PREFIX_STORAGE_KEY, clean);
    }
  } catch {}
}

/**
 * Store account is identified strictly and exclusively by Phone Number (e.g. "0661234567").
 * Firestore path: "shops/{phoneNumber}" with subcollections.
 * No Shop IDs or manual codes.
 */
export function getCurrentShopId(): string {
  const activePhone = getActiveShopPhoneNumber();
  return activePhone || '0600000000';
}

export function setCurrentShopId(phoneNumber: string): void {
  setActiveShopPhoneNumber(phoneNumber);
}

export function getCurrentUserContext(): { userId: string; role: UserRole; name: string; shopId: string } {
  try {
    const role = (localStorage.getItem('golden_shop_user_role') as UserRole) || 'owner';
    const userId = localStorage.getItem('golden_shop_user_id') || role;
    const defaultName =
      role === 'owner'
        ? 'الأدمين (Admin)'
        : 'العامل (Employé)';
    const name = localStorage.getItem('golden_shop_user_name') || defaultName;
    const shopId = getCurrentShopId();
    return { userId, role, name, shopId };
  } catch {
    return { userId: 'owner', role: 'owner', name: 'الأدمين (Admin)', shopId: getCurrentShopId() };
  }
}

export class GoldenShopDB extends Dexie {
  products!: Table<Product, number>;
  suppliers!: Table<Supplier, number>;
  supplierPayments!: Table<SupplierPayment, number>;
  supplierPurchaseOrders!: Table<SupplierPurchaseOrder, number>;
  customers!: Table<Customer, number>;
  customerPayments!: Table<CustomerPayment, number>;
  sales!: Table<Sale, number>;
  warranties!: Table<Warranty, number>;
  savTickets!: Table<SavTicket, number>;
  creditAuditLogs!: Table<CreditAuditLog, number>;
  repairs!: Table<RepairOrder, number>;
  spareParts!: Table<SparePart, number>;
  expenses!: Table<Expense, number>;
  recurringExpenses!: Table<RecurringExpense, number>;
  customExpenseCategories!: Table<{ key: string; name: string; uuid?: string; updated_at?: string; deleted_at?: string | null }, string>;
  settings!: Table<{ key: string; value: any; uuid?: string; updated_at?: string }, string>;
  outbox!: Table<SyncOutboxItem, number>;
  syncConflicts!: Table<SyncConflictItem, number>;
  activityLogs!: Table<ActivityLogEntry, number>;
  stockMovements!: Table<StockMovement, number>;
  cashClosures!: Table<CashClosure, number>;

  constructor() {
    super('GoldenShopDB');
    this.version(1).stores({
      products: '++id, name, category, barcode, supplierId, quantity, createdAt',
      suppliers: '++id, name, phone',
      supplierPayments: '++id, supplierId, date',
      customers: '++id, name, phone, CIN',
      customerPayments: '++id, customerId, saleId, date',
      sales: '++id, &bonNumber, customerId, date, status, paymentType',
      warranties: '++id, saleId, bonNumber, productId, imei, status, endDate',
      savTickets: '++id, warrantyId, status, bonNumber, imei, createdAt',
      settings: 'key',
    });
    this.version(2).stores({
      products: '++id, name, category, barcode, supplierId, quantity, createdAt',
      warranties: '++id, saleId, bonNumber, productId, imei, status, endDate',
    });
    this.version(3).stores({
      customers: '++id, name, phone, CIN, customerType',
      customerPayments: '++id, customerId, saleId, date, status',
      sales: '++id, &bonNumber, customerId, date, status, paymentType, dueDate',
      creditAuditLogs: '++id, customerId, saleId, entityType, date',
    });
    this.version(4).stores({
      repairs: '++id, &repairNumber, customerName, customerPhone, brand, model, imei, status, intakeDate, expectedDeliveryDate, createdAt',
    });
    this.version(5).stores({
      spareParts: '++id, name, compatibleBrand, compatibleModel, quality, quantity, supplierId, minAlertQty, createdAt',
    });
    this.version(6).stores({
      expenses: '++id, category, date, amount, isRecurring, createdAt',
      recurringExpenses: '++id, category, dayOfMonth, isActive, lastGeneratedMonth',
      customExpenseCategories: 'key',
    });

    // Version 7: UUID migration, updated_at, deleted_at, Sync Outbox, Conflicts, Activity Logs, Stock Movements, Cash Closures, Supplier Purchase Orders
    this.version(7)
      .stores({
        products: '++id, uuid, name, category, barcode, supplierId, quantity, createdAt, updated_at, deleted_at',
        suppliers: '++id, uuid, name, phone, updated_at, deleted_at',
        supplierPayments: '++id, uuid, supplierId, date, updated_at, deleted_at',
        supplierPurchaseOrders: '++id, uuid, &bonNumber, supplierId, date, createdAt, updated_at, deleted_at',
        customers: '++id, uuid, name, phone, CIN, customerType, updated_at, deleted_at',
        customerPayments: '++id, uuid, customerId, saleId, date, status, updated_at, deleted_at',
        sales: '++id, uuid, &bonNumber, customerId, date, status, paymentType, dueDate, saleKind, updated_at, deleted_at',
        warranties: '++id, uuid, saleId, bonNumber, productId, imei, status, endDate, updated_at, deleted_at',
        savTickets: '++id, uuid, warrantyId, status, bonNumber, imei, createdAt, updated_at, deleted_at',
        creditAuditLogs: '++id, uuid, customerId, saleId, entityType, date, updated_at, deleted_at',
        repairs: '++id, uuid, &repairNumber, customerName, customerPhone, brand, model, imei, status, intakeDate, expectedDeliveryDate, createdAt, updated_at, deleted_at',
        spareParts: '++id, uuid, name, compatibleBrand, compatibleModel, quality, quantity, supplierId, minAlertQty, createdAt, updated_at, deleted_at',
        expenses: '++id, uuid, category, date, amount, isRecurring, createdAt, updated_at, deleted_at',
        recurringExpenses: '++id, uuid, category, dayOfMonth, isActive, lastGeneratedMonth, updated_at, deleted_at',
        customExpenseCategories: 'key, uuid, updated_at',
        settings: 'key',
        outbox: '++id, uuid, table, operation, created_at',
        syncConflicts: '++id, entityTable, entityUuid, resolved, detectedAt',
        activityLogs: '++id, uuid, action, entityType, userRole, createdAt, updated_at',
        stockMovements: '++id, uuid, productId, type, date, createdAt, updated_at',
        cashClosures: '++id, uuid, &date, createdAt, updated_at',
      })
      .upgrade(async (tx) => {
        const now = new Date().toISOString();
        const deviceId = getDeviceId();

        // Maps from integer ID to generated UUID for relational linking
        const supplierUuidMap = new Map<number, string>();
        const productUuidMap = new Map<number, string>();
        const customerUuidMap = new Map<number, string>();
        const saleUuidMap = new Map<number, string>();
        const warrantyUuidMap = new Map<number, string>();
        const recurringUuidMap = new Map<number, string>();

        await tx
          .table('suppliers')
          .toCollection()
          .modify((s: Supplier) => {
            if (!s.uuid) s.uuid = generateUUID();
            if (!s.updated_at) s.updated_at = now;
            if (s.deleted_at === undefined) s.deleted_at = null;
            if (!s.device_id) s.device_id = deviceId;
            if (s.id) supplierUuidMap.set(s.id, s.uuid);
          });

        await tx
          .table('products')
          .toCollection()
          .modify((p: Product) => {
            if (!p.uuid) p.uuid = generateUUID();
            if (!p.updated_at) p.updated_at = p.createdAt || now;
            if (p.deleted_at === undefined) p.deleted_at = null;
            if (!p.device_id) p.device_id = deviceId;
            if (p.minAlertQty === undefined) p.minAlertQty = 5;
            if (p.supplierId && supplierUuidMap.has(p.supplierId)) {
              p.supplierUuid = supplierUuidMap.get(p.supplierId);
            }
            if (p.id) productUuidMap.set(p.id, p.uuid);
          });

        await tx
          .table('customers')
          .toCollection()
          .modify((c: Customer) => {
            if (!c.uuid) c.uuid = generateUUID();
            if (!c.updated_at) c.updated_at = now;
            if (c.deleted_at === undefined) c.deleted_at = null;
            if (!c.device_id) c.device_id = deviceId;
            if (c.id) customerUuidMap.set(c.id, c.uuid);
          });

        await tx
          .table('sales')
          .toCollection()
          .modify((s: Sale) => {
            if (!s.uuid) s.uuid = generateUUID();
            if (!s.updated_at) s.updated_at = now;
            if (s.deleted_at === undefined) s.deleted_at = null;
            if (!s.device_id) s.device_id = deviceId;
            if (s.customerId && customerUuidMap.has(s.customerId)) {
              s.customerUuid = customerUuidMap.get(s.customerId);
            }
            if (!s.saleKind) {
              s.saleKind = s.bonNumber?.startsWith('REP-') ? 'repair_delivery' : 'product';
            }
            if (Array.isArray(s.items)) {
              s.items = s.items.map((it) => ({
                ...it,
                productUuid: it.productId ? productUuidMap.get(it.productId) : undefined,
              }));
            }
            if (s.id) saleUuidMap.set(s.id, s.uuid);
          });

        await tx
          .table('warranties')
          .toCollection()
          .modify((w: Warranty) => {
            if (!w.uuid) w.uuid = generateUUID();
            if (!w.updated_at) w.updated_at = now;
            if (w.deleted_at === undefined) w.deleted_at = null;
            if (!w.device_id) w.device_id = deviceId;
            if (w.saleId && saleUuidMap.has(w.saleId)) w.saleUuid = saleUuidMap.get(w.saleId);
            if (w.productId && productUuidMap.has(w.productId)) w.productUuid = productUuidMap.get(w.productId);
            if (w.id) warrantyUuidMap.set(w.id, w.uuid);
          });

        await tx
          .table('savTickets')
          .toCollection()
          .modify((t: SavTicket) => {
            if (!t.uuid) t.uuid = generateUUID();
            if (!t.updated_at) t.updated_at = t.createdAt || now;
            if (t.deleted_at === undefined) t.deleted_at = null;
            if (!t.device_id) t.device_id = deviceId;
            if (t.warrantyId && warrantyUuidMap.has(t.warrantyId)) {
              t.warrantyUuid = warrantyUuidMap.get(t.warrantyId);
            }
          });

        await tx
          .table('customerPayments')
          .toCollection()
          .modify((cp: CustomerPayment) => {
            if (!cp.uuid) cp.uuid = generateUUID();
            if (!cp.updated_at) cp.updated_at = now;
            if (cp.deleted_at === undefined) cp.deleted_at = null;
            if (!cp.device_id) cp.device_id = deviceId;
            if (cp.customerId && customerUuidMap.has(cp.customerId)) {
              cp.customerUuid = customerUuidMap.get(cp.customerId);
            }
            if (cp.saleId && saleUuidMap.has(cp.saleId)) {
              cp.saleUuid = saleUuidMap.get(cp.saleId);
            }
          });

        await tx
          .table('supplierPayments')
          .toCollection()
          .modify((sp: SupplierPayment) => {
            if (!sp.uuid) sp.uuid = generateUUID();
            if (!sp.updated_at) sp.updated_at = now;
            if (sp.deleted_at === undefined) sp.deleted_at = null;
            if (!sp.device_id) sp.device_id = deviceId;
            if (sp.supplierId && supplierUuidMap.has(sp.supplierId)) {
              sp.supplierUuid = supplierUuidMap.get(sp.supplierId);
            }
          });

        await tx
          .table('creditAuditLogs')
          .toCollection()
          .modify((log: CreditAuditLog) => {
            if (!log.uuid) log.uuid = generateUUID();
            if (!log.updated_at) log.updated_at = log.date || now;
            if (log.deleted_at === undefined) log.deleted_at = null;
            if (!log.device_id) log.device_id = deviceId;
          });

        await tx
          .table('repairs')
          .toCollection()
          .modify((r: RepairOrder) => {
            if (!r.uuid) r.uuid = generateUUID();
            if (!r.updated_at) r.updated_at = r.updatedAt || now;
            if (r.deleted_at === undefined) r.deleted_at = null;
            if (!r.device_id) r.device_id = deviceId;
          });

        await tx
          .table('spareParts')
          .toCollection()
          .modify((sp: SparePart) => {
            if (!sp.uuid) sp.uuid = generateUUID();
            if (!sp.updated_at) sp.updated_at = sp.createdAt || now;
            if (sp.deleted_at === undefined) sp.deleted_at = null;
            if (!sp.device_id) sp.device_id = deviceId;
          });

        await tx
          .table('recurringExpenses')
          .toCollection()
          .modify((re: RecurringExpense) => {
            if (!re.uuid) re.uuid = generateUUID();
            if (!re.updated_at) re.updated_at = re.createdAt || now;
            if (re.deleted_at === undefined) re.deleted_at = null;
            if (!re.device_id) re.device_id = deviceId;
            if (re.id) recurringUuidMap.set(re.id, re.uuid);
          });

        await tx
          .table('expenses')
          .toCollection()
          .modify((ex: Expense) => {
            if (!ex.uuid) ex.uuid = generateUUID();
            if (!ex.updated_at) ex.updated_at = ex.createdAt || now;
            if (ex.deleted_at === undefined) ex.deleted_at = null;
            if (!ex.device_id) ex.device_id = deviceId;
            if (ex.recurringExpenseId && recurringUuidMap.has(ex.recurringExpenseId)) {
              ex.recurringExpenseUuid = recurringUuidMap.get(ex.recurringExpenseId);
            }
          });
      });

    this.version(8).stores({
      products: '++id, uuid, name, category, barcode, supplierId, quantity, createdAt, updated_at, deleted_at',
      suppliers: '++id, uuid, name, phone, updated_at, deleted_at',
      supplierPayments: '++id, uuid, supplierId, date, updated_at, deleted_at',
      supplierPurchaseOrders: '++id, uuid, &bonNumber, supplierId, date, createdAt, updated_at, deleted_at',
      customers: '++id, uuid, name, phone, CIN, customerType, updated_at, deleted_at',
      customerPayments: '++id, uuid, customerId, saleId, date, status, updated_at, deleted_at',
      sales: '++id, uuid, &bonNumber, customerId, date, status, paymentType, dueDate, saleKind, updated_at, deleted_at',
      warranties: '++id, uuid, saleId, bonNumber, productId, imei, status, endDate, updated_at, deleted_at',
      savTickets: '++id, uuid, warrantyId, status, bonNumber, imei, createdAt, updated_at, deleted_at',
      creditAuditLogs: '++id, uuid, customerId, customerUuid, saleId, entityType, date, updated_at, deleted_at',
      repairs: '++id, uuid, &repairNumber, customerName, customerPhone, brand, model, imei, status, intakeDate, expectedDeliveryDate, createdAt, updated_at, deleted_at',
      spareParts: '++id, uuid, name, compatibleBrand, compatibleModel, quality, quantity, supplierId, minAlertQty, createdAt, updated_at, deleted_at',
      expenses: '++id, uuid, category, date, amount, isRecurring, createdAt, updated_at, deleted_at',
      recurringExpenses: '++id, uuid, category, dayOfMonth, isActive, lastGeneratedMonth, updated_at, deleted_at',
      customExpenseCategories: 'key, uuid, updated_at',
      settings: 'key',
      outbox: '++id, uuid, table, operation, created_at',
      syncConflicts: '++id, entityTable, entityUuid, resolved, detectedAt',
      activityLogs: '++id, uuid, action, entityType, userRole, createdAt, updated_at',
      stockMovements: '++id, uuid, productId, type, date, createdAt, updated_at',
      cashClosures: '++id, uuid, date, createdAt, updated_at',
    });

    // Version 9 (R1): Additive migration for existing sales (returns = [], originalTotalAmount)
    this.version(9)
      .stores({
        sales: '++id, uuid, &bonNumber, customerId, date, status, paymentType, dueDate, saleKind, updated_at, deleted_at',
      })
      .upgrade(async (tx) => {
        await tx
          .table('sales')
          .toCollection()
          .modify((s: Sale) => {
            if (!Array.isArray(s.returns)) {
              s.returns = [];
            }
            if (s.originalTotalAmount === undefined) {
              s.originalTotalAmount = s.totalAmount;
            }
          });
      });
  }
}

export const db = new GoldenShopDB();

/**
 * Helper to enrich any entity with Multi-Tenant & Sync Metadata (UUID, shop_id, created_by, updated_at, device_id)
 */
export function withSyncMetadata<
  T extends {
    uuid?: string;
    shop_id?: string;
    created_by_user_id?: string;
    created_by_name?: string;
    updated_at?: string;
    deleted_at?: string | null;
    device_id?: string;
  }
>(entity: T): T {
  const { userId, name, shopId } = getCurrentUserContext();
  return {
    ...entity,
    uuid: entity.uuid || generateUUID(),
    shop_id: entity.shop_id || shopId,
    created_by_user_id: entity.created_by_user_id || userId,
    created_by_name: entity.created_by_name || name,
    updated_at: new Date().toISOString(),
    deleted_at: entity.deleted_at ?? null,
    device_id: getDeviceId(),
  };
}

/**
 * Enqueue a change in the local sync outbox for Supabase multi-device synchronization
 */
export async function queueOutboxOperation(
  table: string,
  operation: 'insert' | 'update' | 'delete',
  payload: any
): Promise<void> {
  try {
    const uuid = payload?.uuid || generateUUID();
    const { userId, name, shopId } = getCurrentUserContext();
    await db.outbox.add({
      uuid,
      table,
      operation,
      payload: {
        ...payload,
        uuid,
        shop_id: payload?.shop_id || shopId,
        created_by_user_id: payload?.created_by_user_id || userId,
        created_by_name: payload?.created_by_name || name,
        updated_at: payload?.updated_at || new Date().toISOString(),
        device_id: getDeviceId(),
      },
      created_at: new Date().toISOString(),
      attempts: 0,
    });

    // Asynchronously trigger Firebase sync without blocking local transaction
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      import('../lib/firebaseSync')
        .then((m) => m.processOutbox())
        .catch(() => {});
    }
  } catch (err) {
    console.warn('Could not enqueue outbox operation:', err);
  }
}

/**
 * Record an entry in the Shop Activity Log (Partie 3 #2)
 */
export async function logShopActivity(params: {
  action: ActivityLogEntry['action'];
  entityType: string;
  entityId?: string;
  details: string;
}): Promise<void> {
  try {
    const { role, name } = getCurrentUserContext();
    const entry = withSyncMetadata<ActivityLogEntry>({
      userRole: role,
      userName: name,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details,
      createdAt: new Date().toISOString(),
    });
    await db.activityLogs.add(entry);
    await queueOutboxOperation('activity_logs', 'insert', entry);
  } catch {}
}

/**
 * Record a Stock Movement (Partie 3 #8)
 */
export async function recordStockMovement(params: {
  productId: number;
  productUuid?: string;
  productName: string;
  type: StockMovementType;
  quantityDelta: number;
  previousQty: number;
  newQty: number;
  reason: string;
}): Promise<void> {
  try {
    const { name } = getCurrentUserContext();
    const movement = withSyncMetadata<StockMovement>({
      productId: params.productId,
      productUuid: params.productUuid,
      productName: params.productName,
      type: params.type,
      quantityDelta: params.quantityDelta,
      previousQty: params.previousQty,
      newQty: params.newQty,
      reason: params.reason,
      userName: name,
      date: getMoroccoDateString(),
      createdAt: new Date().toISOString(),
    });
    await db.stockMovements.add(movement);
    await queueOutboxOperation('stock_movements', 'insert', movement);
  } catch {}
}

const IMMUTABLE_TRIAL_END_KEY = 'golden_shop_immutable_trial_end';
const TRIAL_V2_MIGRATED_KEY = 'golden_shop_trial_v2_initialized';

/**
 * Returns a fixed 30-day trial expiration date (YYYY-MM-DD) calculated once on first install.
 * Never auto-extends on page reload or re-initialization.
 */
export function getOrCreateImmutableTrialEndDate(): string {
  try {
    const existing = localStorage.getItem(IMMUTABLE_TRIAL_END_KEY);
    if (existing && /^\d{4}-\d{2}-\d{2}$/.test(existing)) {
      return existing;
    }
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const isoDate = d.toISOString().slice(0, 10);
    localStorage.setItem(IMMUTABLE_TRIAL_END_KEY, isoDate);
    return isoDate;
  } catch {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }
}

// Default Store Settings (Starts on a 30-Day Full PRO Trial so new users test both Standard & VIP features for 30 days)
export const DEFAULT_SETTINGS: StoreSettings = {
  shopId: undefined,
  planTier: 'pro',
  subscriptionType: 'trial',
  subscriptionStatus: 'trial',
  subscriptionEndsAt: getOrCreateImmutableTrialEndDate(),
  planName: 'الفترة التجريبية الشاملة (30 يوم)',
  licenseKey: 'TRIAL-30DAYS-FREE',
  resellerWhatsApp: '0618961387',
  masterPin: '7788',
  featureOverrides: {},
  shopMembers: [],
  storeName: '',
  storeSubtitle: '',
  address: '',
  phone: '',
  ice: '',
  rc: '',
  defaultWarrantyMonths: 12,
  receiptPaperWidth: '80mm',
  language: 'fr',
  theme: 'dark',
  autoLockMinutes: 10,
  whatsappTemplates: {
    repairReady:
      'السلام عليكم {اسم_الزبون} 👋\nكنخبروك باللي التيليفون ديالك ({الموديل}) راه واجد للإصلاح فـ {اسم_المحل} ✅\nالمبلغ المتبقي: {الباقي} درهم.\nمرحبا بك فـ أي وقت!',
    creditReminder:
      'السلام عليكم أخي/أختي {اسم_الزبون}،\nتذكير ودي بخصوص رصيد الكريدي المتبقي: {الباقي} درهم لدى {اسم_المحل}.\nشكراً لتفهمكم ومرحباً بكم في أي وقت!',
    saleReceipt:
      'شكراً لك {اسم_الزبون} على تعاملك مع {اسم_المحل} 🛍️\nتفاصيل وصل الشراء ({رقم_البون}):\nالمجموع: {المبلغ_الإجمالي} درهم.\nالباقي: {الباقي} درهم.\nبالصحة والراحة ومرحباً بك دائماً!',
  },
};

/**
 * Get or initialize settings
 */
export async function getStoreSettings(): Promise<StoreSettings> {
  const shopId = getCurrentShopId();
  const immutableTrialEnd = getOrCreateImmutableTrialEndDate();
  const record = await db.settings.get('store_settings');
  if (record && record.value) {
    let val = { ...record.value } as StoreSettings;

    // One-time migration from the old placeholder 'GOLD-PRO-VIP-2026' to the 30-day trial
    try {
      const migrated = localStorage.getItem(TRIAL_V2_MIGRATED_KEY);
      if (!migrated && val.licenseKey === 'GOLD-PRO-VIP-2026') {
        val = {
          ...val,
          planTier: 'pro',
          subscriptionType: 'trial',
          subscriptionStatus: 'trial',
          subscriptionEndsAt: immutableTrialEnd,
          planName: 'الفترة التجريبية الشاملة (30 يوم)',
          licenseKey: 'TRIAL-30DAYS-FREE',
        };
        localStorage.setItem(TRIAL_V2_MIGRATED_KEY, '1');
        await db.settings.put({
          key: 'store_settings',
          value: val,
          updated_at: new Date().toISOString(),
        });
      }
    } catch {}

    // If on trial with default key, lock the trial end date so it never auto-extends
    if (val.subscriptionType === 'trial' && val.licenseKey === 'TRIAL-30DAYS-FREE') {
      if (!val.subscriptionEndsAt || val.subscriptionEndsAt > immutableTrialEnd) {
        val.subscriptionEndsAt = immutableTrialEnd;
      } else if (val.subscriptionEndsAt < immutableTrialEnd) {
        try {
          localStorage.setItem(IMMUTABLE_TRIAL_END_KEY, val.subscriptionEndsAt);
        } catch {}
      }
    }

    const currentPhone = getCurrentShopId();
    const merged: StoreSettings = {
      ...DEFAULT_SETTINGS,
      ...val,
      resellerWhatsApp: val.resellerWhatsApp || '0618961387',
      shopId: currentPhone,
    };
    return merged;
  }
  try {
    localStorage.setItem(TRIAL_V2_MIGRATED_KEY, '1');
  } catch {}
  const initialSettings: StoreSettings = {
    ...DEFAULT_SETTINGS,
    subscriptionEndsAt: immutableTrialEnd,
    shopId,
  };
  await db.settings.put({
    key: 'store_settings',
    value: initialSettings,
    updated_at: new Date().toISOString(),
  });
  return initialSettings;
}

/**
 * Save store settings
 */
export async function saveStoreSettings(settings: StoreSettings): Promise<void> {
  const now = new Date().toISOString();
  const shopId = settings.shopId || getCurrentShopId();
  setCurrentShopId(shopId);
  if (settings.subscriptionEndsAt && settings.subscriptionType === 'trial') {
    try {
      localStorage.setItem(IMMUTABLE_TRIAL_END_KEY, settings.subscriptionEndsAt);
    } catch {}
  }
  const enrichedSettings: StoreSettings = { ...settings, shopId };
  await db.settings.put({ key: 'store_settings', value: enrichedSettings, updated_at: now });
  await queueOutboxOperation('settings', 'update', {
    uuid: '00000000-0000-4000-8000-000000000001',
    key: 'store_settings',
    value: enrichedSettings,
    updated_at: now,
  });
}

/**
 * Get saved POS quick accessory bundles / packs
 */
export async function getPosBundles(): Promise<PosBundle[]> {
  try {
    const rec = await db.settings.get('pos_bundles');
    if (rec && Array.isArray(rec.value)) {
      return rec.value as PosBundle[];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Save POS quick accessory bundles / packs
 */
export async function savePosBundles(bundles: PosBundle[]): Promise<void> {
  const now = new Date().toISOString();
  await db.settings.put({ key: 'pos_bundles', value: bundles, updated_at: now });
  await queueOutboxOperation('settings', 'update', {
    uuid: '00000000-0000-4000-8000-000000000002',
    key: 'pos_bundles',
    value: bundles,
    updated_at: now,
  });
}

/**
 * Generate a collision-free offline/multi-device number using Device Prefix + Year + Sequence:
 * Format: "BON-2026-A10001" / "REP-2026-A10001" / "BA-2026-A10001"
 */
export async function generateProvisionalNumber(kind: 'bon' | 'repair' | 'po'): Promise<string> {
  const devPrefix = getDevicePrefix();
  const year = new Date().getFullYear();
  const seqKey =
    kind === 'bon' ? 'seq_prov_bon' : kind === 'repair' ? 'seq_prov_repair' : 'seq_prov_po';
  const prefix = kind === 'bon' ? 'BON' : kind === 'repair' ? 'REP' : 'BA';

  const seqRec = await db.settings.get(seqKey);
  const storedSeq = typeof seqRec?.value === 'number' ? seqRec.value : 0;
  const nextNum = storedSeq + 1;

  await db.settings.put({
    key: seqKey,
    value: nextNum,
    updated_at: new Date().toISOString(),
  });

  return `${prefix}-${year}-${devPrefix}${nextNum.toString().padStart(4, '0')}`;
}

/**
 * N1: Reserve document number BEFORE any Dexie transaction (never inside a Dexie transaction).
 * - Local mode (Supabase not configured): returns undefined so the inner transaction uses the local counter.
 * - Cloud mode: if online, calls Supabase RPC (next_bon_number, next_repair_number, next_purchase_order_number)
 *   with a 3s timeout; if offline or on error/timeout, returns "BON-2026-<DevicePrefix>0001".
 */
export async function reserveNumber(kind: 'bon' | 'repair' | 'po'): Promise<string | undefined> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    // Local mode: use device-prefixed local counter inside transaction
    return undefined;
  }

  const rpcName =
    kind === 'bon'
      ? 'next_bon_number'
      : kind === 'repair'
      ? 'next_repair_number'
      : 'next_purchase_order_number';

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { supabase } = await import('../lib/supabaseSync');
      if (supabase) {
        const rpcPromise = supabase.rpc(rpcName);
        const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error('RPC timeout 3s') }), 3000)
        );
        const result = await Promise.race([rpcPromise, timeoutPromise]);
        if (!result.error && typeof result.data === 'string' && result.data.trim().length > 0) {
          return result.data.trim();
        }
      }
    } catch {
      // Fallback to provisional number below
    }
  }

  return await generateProvisionalNumber(kind);
}

/**
 * Generate next sequential Bon Number with Device Prefix (BON-2026-A10001 or G-A10001 format)
 * so multiple workers/devices working offline never collide when syncing.
 */
export async function getNextBonNumber(): Promise<string> {
  const devPrefix = getDevicePrefix();
  const year = new Date().getFullYear();
  const seqRec = await db.settings.get('seq_bon_g');
  let baseSeq = 0;

  if (typeof seqRec?.value === 'number') {
    baseSeq = seqRec.value;
  } else {
    await db.sales.each((s) => {
      if (!s.bonNumber) return;
      const match = s.bonNumber.match(/(\d{4})$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > baseSeq) {
          baseSeq = n;
        }
      }
    });
  }

  const nextNum = baseSeq + 1;
  await db.settings.put({
    key: 'seq_bon_g',
    value: nextNum,
    updated_at: new Date().toISOString(),
  });

  return `BON-${year}-${devPrefix}${nextNum.toString().padStart(4, '0')}`;
}

/**
 * Generate next Repair Number with Device Prefix (REP-2026-A10001) strictly sequential without gaps.
 */
export async function getNextRepairNumber(): Promise<string> {
  const devPrefix = getDevicePrefix();
  const year = new Date().getFullYear();
  const seqRec = await db.settings.get('seq_repair_r');
  let baseSeq = 0;

  if (typeof seqRec?.value === 'number') {
    baseSeq = seqRec.value;
  } else {
    await db.repairs.each((r) => {
      if (!r.repairNumber) return;
      const match = r.repairNumber.match(/(\d{4})$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > baseSeq) {
          baseSeq = n;
        }
      }
    });
  }

  const nextNum = baseSeq + 1;
  await db.settings.put({
    key: 'seq_repair_r',
    value: nextNum,
    updated_at: new Date().toISOString(),
  });

  return `REP-${year}-${devPrefix}${nextNum.toString().padStart(4, '0')}`;
}

/**
 * Generate next Purchase Order Number with Device Prefix (BA-2026-A10001).
 */
export async function getNextPurchaseOrderNumber(): Promise<string> {
  const devPrefix = getDevicePrefix();
  const year = new Date().getFullYear();
  const seqRec = await db.settings.get('seq_po_ba');
  let baseSeq = 0;

  if (typeof seqRec?.value === 'number') {
    baseSeq = seqRec.value;
  } else {
    await db.supplierPurchaseOrders.each((po) => {
      if (!po.bonNumber) return;
      const match = po.bonNumber.match(/(\d{4})$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > baseSeq) {
          baseSeq = n;
        }
      }
    });
  }

  const nextNum = baseSeq + 1;
  await db.settings.put({
    key: 'seq_po_ba',
    value: nextNum,
    updated_at: new Date().toISOString(),
  });

  return `BA-${year}-${devPrefix}${nextNum.toString().padStart(4, '0')}`;
}

/**
 * Check if IMEI already exists in DB
 */
export async function checkImeiUnique(imei: string, currentProductId?: number): Promise<boolean> {
  const trimmed = imei.trim();
  if (!trimmed) return true;
  const products = await db.products.toArray();
  for (const p of products) {
    if (p.deleted_at) continue;
    if (currentProductId && p.id === currentProductId) continue;
    if (p.imeiList && p.imeiList.some((item) => item.imei === trimmed)) {
      return false; // not unique
    }
  }
  return true;
}

/**
 * L3: Compute net total of a sale after returns:
 * getNetTotal(sale) = totalAmount - sum(returns[].amount)
 */
export function getNetTotal(sale: Pick<Sale, 'totalAmount' | 'returns'>): number {
  const baseTotal = Number(sale.totalAmount) || 0;
  const returnedSum = (sale.returns || []).reduce(
    (sum, r) => sum + (Number(r.amount) || 0),
    0
  );
  return Math.max(0, Math.round((baseTotal - returnedSum) * 100) / 100);
}

/**
 * Create Sale Transaction (Atomic)
 */
export async function createSaleTransaction(
  saleData: Omit<Sale, 'id' | 'bonNumber'>,
  customBonNumber?: string
): Promise<Sale> {
  if (!saleData.items || saleData.items.length === 0) {
    throw new Error('Le panier est vide. Veuillez ajouter au moins un article.');
  }
  const seenImeis = new Set<string>();
  for (const item of saleData.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error(`La quantité doit être strictement supérieure à 0 pour l'article "${item.name}".`);
    }
    if (!Number.isFinite(item.price) || item.price < 0) {
      throw new Error(`Le prix ne peut pas être négatif pour l'article "${item.name}".`);
    }
    if (item.category === 'phone') {
      if (item.quantity !== 1) {
        throw new Error(
          `Pour un téléphone (${item.name}), la quantité doit être exactement 1 (1 IMEI par ligne). / بالنسبة للهاتف، يجب أن تكون الكمية 1 بالضبط.`
        );
      }
      const cleanImei = (item.imei || '').trim();
      if (!cleanImei) {
        throw new Error(`IMEI obligatoire pour le téléphone: ${item.name}`);
      }
      if (seenImeis.has(cleanImei)) {
        throw new Error(`L'IMEI ${cleanImei} est sélectionné plusieurs fois dans le même panier.`);
      }
      seenImeis.add(cleanImei);
    }
  }

  // Recalculate subtotal, totalAmount, paidAmount, and remainingAmount on the DB side
  const computedSubtotal =
    Math.round(
      saleData.items.reduce((sum, it) => sum + Number(it.price) * Number(it.quantity), 0) * 100
    ) / 100;
  const rawDiscount = Number(saleData.discountAmount) || 0;
  if (!Number.isFinite(rawDiscount) || rawDiscount < 0) {
    throw new Error('La remise ne peut pas être négative ou invalide.');
  }
  const computedDiscount = Math.min(computedSubtotal, Math.round(rawDiscount * 100) / 100);
  const computedTotalAmount = Math.max(
    0,
    Math.round((computedSubtotal - computedDiscount) * 100) / 100
  );
  const computedPaidAmount = Math.round(Number(saleData.paidAmount) * 100) / 100;

  if (!Number.isFinite(computedPaidAmount) || computedPaidAmount < 0) {
    throw new Error('Le montant payé ne peut pas être négatif.');
  }
  if (computedPaidAmount > computedTotalAmount + 0.01) {
    throw new Error(
      `Le montant payé (${computedPaidAmount} DH) ne peut pas dépasser le montant total (${computedTotalAmount} DH).`
    );
  }

  const computedRemainingAmount = Math.max(
    0,
    Math.round((computedTotalAmount - computedPaidAmount) * 100) / 100
  );

  // Partie 1 #3: Forbid credit sale without a registered customer
  if (computedRemainingAmount > 0 && (!saleData.customerId || saleData.customerId <= 0)) {
    throw new Error(
      'Veuillez sélectionner un client pour toute vente avec reste à payer (crédit). / المرجو اختيار زبون لعملية بيع بالكريدي.'
    );
  }

  // N1: Reserve cloud number BEFORE opening the Dexie transaction (never await network inside Dexie tx)
  const preReservedBon = customBonNumber || (await reserveNumber('bon'));

  return await db.transaction(
    'rw',
    [
      db.sales,
      db.products,
      db.customers,
      db.warranties,
      db.customerPayments,
      db.settings,
      db.outbox,
      db.activityLogs,
      db.stockMovements,
    ],
    async () => {
      const bonNumber = preReservedBon || (await getNextBonNumber());
      const saleDate = saleData.date || getMoroccoDateString();
      const nowIso = new Date().toISOString();

      // L2(d): Verify customer exists and is not deleted inside the transaction before mutating stock
      let verifiedCustomer: Customer | undefined;
      if (saleData.customerId && saleData.customerId > 0) {
        verifiedCustomer = await db.customers.get(saleData.customerId);
        if (!verifiedCustomer || verifiedCustomer.deleted_at) {
          throw new Error('Client sélectionné introuvable ou supprimé. / الزبون المحدد غير موجود أو تم حذفه.');
        }
      }

      // 1. Verify and deduct stock & update IMEIs
      for (const item of saleData.items) {
        const product = await db.products.get(item.productId);
        if (!product || product.deleted_at) {
          throw new Error(`Produit introuvable (ID: ${item.productId})`);
        }

        const prevQty = product.quantity;

        if (product.category === 'phone') {
          if (item.quantity !== 1) {
            throw new Error(
              `Pour un téléphone (${product.name}), la quantité doit être exactement 1 (1 IMEI par ligne).`
            );
          }
          const cleanImei = (item.imei || '').trim();
          if (!cleanImei) {
            throw new Error(`IMEI obligatoire pour le téléphone: ${product.name}`);
          }
          const imeiEntry = product.imeiList.find(
            (i) => i.imei === cleanImei && i.status === 'in_stock'
          );
          if (!imeiEntry) {
            throw new Error(`L'IMEI ${cleanImei} n'est plus disponible en stock.`);
          }
          imeiEntry.status = 'sold';
          imeiEntry.soldAt = saleDate;
          imeiEntry.bonNumber = bonNumber;
          product.quantity = product.imeiList.filter((i) => i.status === 'in_stock').length;
        } else {
          if (product.quantity < item.quantity) {
            throw new Error(
              `Stock insuffisant pour ${product.name}. Disponible: ${product.quantity}, demandé: ${item.quantity}`
            );
          }
          product.quantity -= item.quantity;
        }

        const updatedProduct = withSyncMetadata(product);
        await db.products.put(updatedProduct);
        await queueOutboxOperation('products', 'update', updatedProduct);

        await recordStockMovement({
          productId: product.id!,
          productUuid: product.uuid,
          productName: product.name,
          type: 'out',
          quantityDelta: -item.quantity,
          previousQty: prevQty,
          newQty: product.quantity,
          reason: `Vente Bon ${bonNumber}`,
        });
      }

      // 2. Insert Sale
      const newSale: Sale = withSyncMetadata({
        ...saleData,
        bonNumber,
        subtotal: computedSubtotal,
        discountAmount: computedDiscount > 0 ? computedDiscount : undefined,
        originalTotalAmount: computedTotalAmount,
        totalAmount: computedTotalAmount,
        paidAmount: computedPaidAmount,
        remainingAmount: computedRemainingAmount,
        returns: [],
        date: saleDate,
        createdAt: saleData.createdAt || nowIso,
        status: 'active',
        saleKind: saleData.saleKind || 'product',
      });
      const saleId = await db.sales.add(newSale);
      newSale.id = saleId;
      await queueOutboxOperation('sales', 'insert', newSale);

      // 3. Create Warranties with clamped month calculation (Partie 1 #7)
      if (saleData.hasWarranty && saleData.warrantyMonths > 0) {
        const startDateStr = saleDate;
        const endDateStr = addMonthsClamped(startDateStr, saleData.warrantyMonths);

        for (const item of saleData.items) {
          const warranty: Warranty = withSyncMetadata<Warranty>({
            saleId,
            saleUuid: newSale.uuid,
            bonNumber,
            productId: item.productId,
            productUuid: item.productUuid,
            productName: item.name,
            imei: item.imei,
            customerName: saleData.customerName,
            customerPhone: saleData.customerPhone,
            startDate: startDateStr,
            endDate: endDateStr,
            status: 'active',
          });
          await db.warranties.add(warranty);
          await queueOutboxOperation('warranties', 'insert', warranty);
        }
      }

      // 4. Update Customer Credit and record initial payment if customer selected
      if (saleData.customerId) {
        const customer = await db.customers.get(saleData.customerId);
        if (!customer || customer.deleted_at) {
          throw new Error('Client sélectionné introuvable ou supprimé.');
        }
        if (computedRemainingAmount > 0) {
          customer.totalCredit =
            Math.round(((customer.totalCredit || 0) + computedRemainingAmount) * 100) / 100;
        }
        const updatedCustomer = withSyncMetadata(customer);
        await db.customers.put(updatedCustomer);
        await queueOutboxOperation('customers', 'update', updatedCustomer);

        if (computedPaidAmount > 0) {
          const initPayment = withSyncMetadata<CustomerPayment>({
            customerId: saleData.customerId,
            customerUuid: customer.uuid,
            saleId,
            saleUuid: newSale.uuid,
            bonNumber,
            appliedBons: [
              {
                saleId,
                saleUuid: newSale.uuid,
                bonNumber,
                amount: computedPaidAmount,
              },
            ],
            amount: computedPaidAmount,
            date: saleDate,
            paymentMethod: saleData.paymentMethod || 'cash',
            note: `Versement initial Bon ${bonNumber}`,
            status: 'active',
          });
          await db.customerPayments.add(initPayment);
          await queueOutboxOperation('customer_payments', 'insert', initPayment);
        }
      }

      await logShopActivity({
        action: 'sale',
        entityType: 'sale',
        entityId: bonNumber,
        details: `Vente ${bonNumber} - Client: ${saleData.customerName} - Total: ${computedTotalAmount} DH (Payé: ${computedPaidAmount} DH)`,
      });

      return newSale;
    }
  );
}

/**
 * Return Sale Item or Full Sale Transaction (Atomic - R1)
 * - Does NOT mutate totalAmount or paidAmount of the original bon.
 * - Preserves originalTotalAmount and appends to returns[] {date: todayMA(), itemIndex, amount, costAmount, refundedCash, debtReduction}.
 * - refundedCash is counted as a cash outflow on the return date (CashClosure, Dashboard, Reports).
 */
export async function returnSaleItemTransaction(
  saleId: number,
  itemIndex: number,
  notes?: string
): Promise<void> {
  return await db.transaction(
    'rw',
    [db.sales, db.products, db.customers, db.warranties, db.outbox, db.activityLogs, db.stockMovements],
    async () => {
      const sale = await db.sales.get(saleId);
      if (!sale) throw new Error('Bon de vente introuvable.');

      const item = sale.items[itemIndex];
      if (!item || item.isReturned) {
        throw new Error('Cet article a déjà été retourné ou est invalide.');
      }

      // 1. Restore product stock and IMEI
      const product = await db.products.get(item.productId);
      if (product) {
        const prevQty = product.quantity;
        if (product.category === 'phone' && item.imei) {
          const imeiEntry = product.imeiList.find((i) => i.imei === item.imei);
          if (imeiEntry) {
            imeiEntry.status = 'in_stock';
            imeiEntry.soldAt = undefined;
            imeiEntry.bonNumber = undefined;
          }
          product.quantity = product.imeiList.filter((i) => i.status === 'in_stock').length;
        } else {
          product.quantity += item.quantity;
        }
        const updatedProduct = withSyncMetadata(product);
        await db.products.put(updatedProduct);
        await queueOutboxOperation('products', 'update', updatedProduct);

        await recordStockMovement({
          productId: product.id!,
          productUuid: product.uuid,
          productName: product.name,
          type: 'return',
          quantityDelta: item.quantity,
          previousQty: prevQty,
          newQty: product.quantity,
          reason: `Retour article sur Bon ${sale.bonNumber}`,
        });
      }

      // 2. Void related warranty
      const saleWarranties = await db.warranties.where('bonNumber').equals(sale.bonNumber).toArray();
      const warranty = saleWarranties.find(
        (w) => w.productId === item.productId && (!item.imei || w.imei === item.imei)
      );
      if (warranty && warranty.id) {
        warranty.status = 'void';
        const updatedWarranty = withSyncMetadata(warranty);
        await db.warranties.put(updatedWarranty);
        await queueOutboxOperation('warranties', 'update', updatedWarranty);
      }

      // 3. Calculate net returned amount including proportional discount
      const originalSubtotal =
        sale.subtotal && sale.subtotal > 0
          ? sale.subtotal
          : sale.items.reduce((s, it) => s + it.price * it.quantity, 0);

      const itemGross = item.price * item.quantity;
      const itemCostTotal =
        Math.round((Number(item.costPrice) || 0) * (Number(item.quantity) || 1) * 100) / 100;
      const discountRatio =
        originalSubtotal > 0 && sale.discountAmount
          ? Math.max(0, (originalSubtotal - (sale.discountAmount || 0)) / originalSubtotal)
          : 1;
      const itemNetTotal = Math.round(itemGross * discountRatio * 100) / 100;

      // 4. Mark item returned, keep originalTotalAmount, totalAmount, and paidAmount intact (R1)
      item.isReturned = true;
      if (sale.originalTotalAmount === undefined) {
        sale.originalTotalAmount = sale.totalAmount;
      }

      const debtReduction =
        Math.round(Math.min(Math.max(0, sale.remainingAmount || 0), itemNetTotal) * 100) / 100;
      const refundedCash = Math.max(0, Math.round((itemNetTotal - debtReduction) * 100) / 100);

      if (sale.customerId && debtReduction > 0) {
        const customer = await db.customers.get(sale.customerId);
        if (customer && !customer.deleted_at) {
          customer.totalCredit = Math.max(
            0,
            Math.round(((customer.totalCredit || 0) - debtReduction) * 100) / 100
          );
          const updatedCust = withSyncMetadata(customer);
          await db.customers.put(updatedCust);
          await queueOutboxOperation('customers', 'update', updatedCust);
        }
      }

      sale.remainingAmount = Math.max(
        0,
        Math.round(((sale.remainingAmount || 0) - debtReduction) * 100) / 100
      );

      if (!Array.isArray(sale.returns)) {
        sale.returns = [];
      }
      const returnDate = todayMA();
      sale.returns.push({
        date: returnDate,
        itemIndex,
        amount: itemNetTotal,
        costAmount: itemCostTotal,
        refundedCash,
        debtReduction,
        notes,
      });

      const activeItems = sale.items.filter((it) => !it.isReturned);
      sale.status = activeItems.length === 0 ? 'returned' : 'partially_returned';

      if (notes) {
        sale.notes = sale.notes ? `${sale.notes}\n[Retour: ${notes}]` : `[Retour: ${notes}]`;
      }

      const updatedSale = withSyncMetadata(sale);
      await db.sales.put(updatedSale);
      await queueOutboxOperation('sales', 'update', updatedSale);

      await logShopActivity({
        action: 'return',
        entityType: 'sale',
        entityId: sale.bonNumber,
        details: `Retour article "${item.name}" sur Bon ${sale.bonNumber} (-${itemNetTotal} DH, Remboursé espèces: ${refundedCash} DH, Dette réduite: ${debtReduction} DH)`,
      });
    }
  );
}

/**
 * Delete a Sale Bon (Owner only) — Restores non-returned items to stock & adjusts customer credit
 */
export async function deleteSaleTransaction(saleId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.sales, db.products, db.customers, db.warranties, db.stockMovements, db.outbox, db.activityLogs],
    async () => {
      const sale = await db.sales.get(saleId);
      if (!sale) throw new Error('Bon introuvable.');

      for (const item of sale.items) {
        if (!item.isReturned && item.productId) {
          const prod = await db.products.get(item.productId);
          if (prod) {
            const before = prod.quantity;
            let after = before + item.quantity;
            let updatedImeiList = prod.imeiList;

            if (prod.category === 'phone' && item.imei && prod.imeiList) {
              updatedImeiList = prod.imeiList.map((entry) =>
                entry.imei === item.imei
                  ? { ...entry, status: 'in_stock' as const, soldAt: undefined, bonNumber: undefined }
                  : entry
              );
              after = updatedImeiList.filter((e) => e.status === 'in_stock').length;
            }

            const updatedProd = withSyncMetadata({
              ...prod,
              quantity: after,
              ...(updatedImeiList ? { imeiList: updatedImeiList } : {}),
            });
            await db.products.put(updatedProd);
            await queueOutboxOperation('products', 'update', updatedProd);
            await recordStockMovement({
              productId: prod.id!,
              productUuid: updatedProd.uuid,
              productName: prod.name,
              type: 'return',
              quantityDelta: item.quantity,
              previousQty: before,
              newQty: after,
              reason: `Suppression Bon ${sale.bonNumber}`,
            });
          }
        }
      }

      if (sale.customerId && sale.remainingAmount > 0) {
        const cust = await db.customers.get(sale.customerId);
        if (cust) {
          const newCredit = Math.max(0, Math.round((cust.totalCredit - sale.remainingAmount) * 100) / 100);
          const updatedCust = withSyncMetadata({ ...cust, totalCredit: newCredit });
          await db.customers.put(updatedCust);
          await queueOutboxOperation('customers', 'update', updatedCust);
        }
      }

      // Clean up warranties linked to this deleted sale bon
      const linkedWarranties = await db.warranties
        .filter((w) => w.saleId === saleId || w.bonNumber === sale.bonNumber)
        .toArray();
      for (const w of linkedWarranties) {
        if (w.id) {
          const deletedWarranty = withSyncMetadata({ ...w, deleted_at: new Date().toISOString() });
          await db.warranties.delete(w.id);
          await queueOutboxOperation('warranties', 'delete', deletedWarranty);
        }
      }

      const deletedSale = withSyncMetadata({ ...sale, deleted_at: new Date().toISOString() });
      await db.sales.delete(saleId);
      await queueOutboxOperation('sales', 'delete', deletedSale);

      await logShopActivity({
        action: 'delete',
        entityType: 'sale',
        entityId: sale.bonNumber,
        details: `Suppression du Bon ${sale.bonNumber} (${sale.totalAmount} DH)`,
      });
    }
  );
}

/**
 * Helper to apply payment amount across installments (supports partial installment payment - Partie 1 #4)
 */
function applyPaymentToInstallments(installments: Installment[], amountToApply: number, paymentDate: string) {
  let rem = amountToApply;
  for (const inst of installments) {
    if (rem <= 0) break;
    if (inst.paid) continue;

    const alreadyPaid = inst.paidAmount || 0;
    const needed = Math.max(0, inst.amount - alreadyPaid);
    if (needed <= 0) {
      inst.paid = true;
      continue;
    }

    if (rem >= needed - 0.01) {
      inst.paidAmount = inst.amount;
      inst.paid = true;
      inst.paidAt = paymentDate;
      rem = Math.max(0, rem - needed);
    } else {
      inst.paidAmount = Math.round((alreadyPaid + rem) * 100) / 100;
      inst.paid = false;
      rem = 0;
    }
  }
}

/**
 * Advanced Customer Payment Registration (Atomic Dexie transaction)
 * Supports specific bon application OR FIFO oldest-unpaid-first cascade
 */
export interface RegisterCustomerPaymentArgs {
  customerId: number;
  amount: number;
  date: string;
  note?: string;
  paymentMethod?: PaymentMethod;
  applyMode: 'specific' | 'fifo';
  specificSaleId?: number;
  allowFifoSurplus?: boolean;
}

export async function registerCustomerPaymentAdvancedTransaction(
  args: RegisterCustomerPaymentArgs
): Promise<number> {
  const {
    customerId,
    amount,
    date,
    note,
    paymentMethod = 'cash',
    applyMode,
    specificSaleId,
    allowFifoSurplus = false,
  } = args;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Le montant du versement doit être supérieur à zéro.');
  }
  if (applyMode === 'specific' && !specificSaleId) {
    throw new Error('Veuillez sélectionner un bon spécifique pour ce mode de règlement.');
  }

  return await db.transaction(
    'rw',
    [db.customers, db.customerPayments, db.sales, db.creditAuditLogs, db.outbox, db.activityLogs],
    async () => {
      const customer = await db.customers.get(customerId);
      if (!customer || customer.deleted_at) {
        throw new Error('Client introuvable ou supprimé.');
      }

      const paymentDate = date || getMoroccoDateString();

      // Partie 1 #4: Forbid payment when totalCredit is 0 or when amount exceeds totalCredit
      const currentCredit = customer.totalCredit || 0;
      if (currentCredit <= 0) {
        throw new Error(
          'Ce client n\'a aucun crédit dû (0 DH). Impossible d\'enregistrer un versement. / هذا الزبون ليس عليه أي دين حالياً.'
        );
      }
      if (amount > currentCredit + 0.01 && !allowFifoSurplus) {
        throw new Error(
          `Le montant (${amount} DH) ne peut pas dépasser le crédit total dû par le client (${currentCredit} DH).`
        );
      }

      let targetSaleId: number | undefined = undefined;
      let targetSaleUuid: string | undefined = undefined;
      let targetBonNumber: string | undefined = undefined;
      let actualAppliedAmount = 0;
      const appliedBons: {
        saleId?: number;
        saleUuid?: string;
        bonNumber: string;
        amount: number;
      }[] = [];

      if (applyMode === 'specific') {
        if (!specificSaleId) {
          throw new Error('Veuillez sélectionner un bon spécifique pour ce mode de règlement.');
        }
        const sale = await db.sales.get(specificSaleId);
        if (!sale || sale.deleted_at) {
          throw new Error('Bon de vente spécifié introuvable ou supprimé.');
        }
        if (sale.status === 'returned') {
          throw new Error("Impossible d'enregistrer un versement sur un bon retourné.");
        }
        if (sale.customerId !== customerId) {
          throw new Error('Le bon sélectionné ne correspond pas à ce client.');
        }
        if (amount > sale.remainingAmount + 0.01) {
          throw new Error(
            `Le versement (${amount} DH) dépasse le solde restant sur ce bon (${sale.remainingAmount} DH).`
          );
        }

        sale.paidAmount = Math.round((sale.paidAmount + amount) * 100) / 100;
        sale.remainingAmount = Math.max(
          0,
          Math.round((sale.remainingAmount - amount) * 100) / 100
        );

        if (sale.installments && sale.installments.length > 0) {
          applyPaymentToInstallments(sale.installments, amount, paymentDate);
        }

        const updatedSale = withSyncMetadata(sale);
        await db.sales.put(updatedSale);
        await queueOutboxOperation('sales', 'update', updatedSale);
        targetSaleId = sale.id;
        targetSaleUuid = sale.uuid;
        targetBonNumber = sale.bonNumber;
        actualAppliedAmount = Math.round(amount * 100) / 100;
        appliedBons.push({
          saleId: sale.id,
          saleUuid: sale.uuid,
          bonNumber: sale.bonNumber,
          amount: actualAppliedAmount,
        });
      } else {
        // FIFO cascade: apply to oldest unpaid bons first
        const allCustomerSales = await db.sales
          .where('customerId')
          .equals(customerId)
          .toArray();

        const unpaidSales = allCustomerSales
          .filter((s) => s.status !== 'returned' && s.remainingAmount > 0 && !s.deleted_at)
          .sort((a, b) => a.date.localeCompare(b.date) || (a.id || 0) - (b.id || 0));

        const totalUnpaidBons = unpaidSales.reduce((sum, s) => sum + s.remainingAmount, 0);

        // Partie 1 #4: In FIFO mode, if amount exceeds unpaid bons, require explicit confirmation
        if (unpaidSales.length > 0 && amount > totalUnpaidBons + 0.01 && !allowFifoSurplus) {
          const surplus = Math.round((amount - totalUnpaidBons) * 100) / 100;
          throw new Error(
            `FIFO_SURPLUS:${surplus}:Le montant saisi (${amount} DH) dépasse le total des bons impayés (${totalUnpaidBons} DH) d'un surplus de ${surplus} DH.`
          );
        }

        let rem = amount;
        for (const sale of unpaidSales) {
          if (rem <= 0) break;
          const toDeduct = Math.round(Math.min(sale.remainingAmount, rem) * 100) / 100;
          if (toDeduct <= 0) continue;

          sale.paidAmount = Math.round((sale.paidAmount + toDeduct) * 100) / 100;
          sale.remainingAmount = Math.max(
            0,
            Math.round((sale.remainingAmount - toDeduct) * 100) / 100
          );
          rem = Math.round((rem - toDeduct) * 100) / 100;
          actualAppliedAmount = Math.round((actualAppliedAmount + toDeduct) * 100) / 100;

          if (sale.installments && sale.installments.length > 0) {
            applyPaymentToInstallments(sale.installments, toDeduct, paymentDate);
          }

          const updatedSale = withSyncMetadata(sale);
          await db.sales.put(updatedSale);
          await queueOutboxOperation('sales', 'update', updatedSale);

          appliedBons.push({
            saleId: sale.id,
            saleUuid: sale.uuid,
            bonNumber: sale.bonNumber,
            amount: toDeduct,
          });

          if (!targetSaleId) {
            targetSaleId = sale.id;
            targetSaleUuid = sale.uuid;
            targetBonNumber = sale.bonNumber;
          }
        }
      }

      // P1: If allowFifoSurplus is true (or when bons are present), unallocated surplus must NOT reduce customer.totalCredit;
      // reduce customer.totalCredit strictly by the amount actually applied to bons.
      const creditReduction = allowFifoSurplus
        ? actualAppliedAmount
        : appliedBons.length > 0
        ? actualAppliedAmount
        : amount;

      // 1. Insert Payment
      const newPayment = withSyncMetadata<CustomerPayment>({
        customerId,
        customerUuid: customer.uuid,
        saleId: targetSaleId,
        saleUuid: targetSaleUuid,
        bonNumber: targetBonNumber,
        appliedBons,
        amount,
        date: paymentDate,
        note:
          note ||
          (applyMode === 'specific'
            ? `Règlement Bon ${targetBonNumber}`
            : 'Versement crédit (FIFO)'),
        paymentMethod,
        status: 'active',
      });
      const paymentId = await db.customerPayments.add(newPayment);
      await queueOutboxOperation('customer_payments', 'insert', { ...newPayment, id: paymentId });

      // 2. Update Customer Total Credit (reduced only by creditReduction = amount applied to bons)
      customer.totalCredit = Math.max(
        0,
        Math.round(((customer.totalCredit || 0) - creditReduction) * 100) / 100
      );
      const updatedCustomer = withSyncMetadata(customer);
      await db.customers.put(updatedCustomer);
      await queueOutboxOperation('customers', 'update', updatedCustomer);

      // 3. Add to Credit Audit Log
      const auditEntry = withSyncMetadata<CreditAuditLog>({
        customerId,
        customerUuid: customer.uuid,
        customerName: customer.name,
        saleId: targetSaleId,
        saleUuid: targetSaleUuid,
        bonNumber: targetBonNumber,
        entityType: 'payment',
        action: 'create',
        oldValue: `${currentCredit} DH`,
        newValue: `${amount} DH (${paymentMethod.toUpperCase()}, affecté aux bons: ${creditReduction} DH)`,
        reason:
          note ||
          (applyMode === 'specific'
            ? `Paiement Bon ${targetBonNumber}`
            : 'Paiement compte client (FIFO)'),
        date: nowMA(),
      });
      await db.creditAuditLogs.add(auditEntry);
      await queueOutboxOperation('credit_audit_logs', 'insert', auditEntry);

      await logShopActivity({
        action: 'payment',
        entityType: 'customer_payment',
        entityId: String(paymentId),
        details: `Versement client ${customer.name}: ${amount} DH (Affecté: ${creditReduction} DH, Mode: ${paymentMethod})`,
      });

      return paymentId;
    }
  );
}

/**
 * Edit Customer Payment (Atomic Dexie transaction with Audit Log)
 */
export interface EditCustomerPaymentArgs {
  paymentId: number;
  newAmount: number;
  newDate: string;
  newNote?: string;
  newPaymentMethod?: PaymentMethod;
  reason: string;
}

export async function editCustomerPaymentTransaction(
  args: EditCustomerPaymentArgs
): Promise<void> {
  const { paymentId, newAmount, newDate, newNote, newPaymentMethod, reason } = args;

  if (!reason || !reason.trim()) {
    throw new Error('Un motif est obligatoire pour toute modification de règlement.');
  }
  if (newAmount <= 0 || isNaN(newAmount)) {
    throw new Error('Le nouveau montant doit être supérieur à zéro.');
  }

  return await db.transaction(
    'rw',
    [db.customers, db.customerPayments, db.sales, db.creditAuditLogs, db.outbox, db.activityLogs],
    async () => {
      const payment = await db.customerPayments.get(paymentId);
      if (!payment) throw new Error('Règlement introuvable.');
      if (payment.status === 'cancelled') {
        throw new Error('Ce règlement est annulé et ne peut plus être modifié.');
      }

      const customer = await db.customers.get(payment.customerId);
      if (!customer) throw new Error('Client introuvable.');

      const oldAmount = payment.amount;
      const delta = newAmount - oldAmount;

      if (delta > (customer.totalCredit || 0) + 0.01) {
        throw new Error(
          `L'augmentation (${delta} DH) dépasse le solde dû par le client (${customer.totalCredit} DH).`
        );
      }

      customer.totalCredit = Math.max(0, Math.round(((customer.totalCredit || 0) - delta) * 100) / 100);
      const updatedCustomer = withSyncMetadata(customer);
      await db.customers.put(updatedCustomer);
      await queueOutboxOperation('customers', 'update', updatedCustomer);

      if (payment.saleId) {
        const sale = await db.sales.get(payment.saleId);
        if (sale) {
          sale.paidAmount = Math.max(0, Math.round((sale.paidAmount + delta) * 100) / 100);
          sale.remainingAmount = Math.max(0, Math.round((sale.totalAmount - sale.paidAmount) * 100) / 100);
          const updatedSale = withSyncMetadata(sale);
          await db.sales.put(updatedSale);
          await queueOutboxOperation('sales', 'update', updatedSale);
        }
      }

      const auditEntry = withSyncMetadata<CreditAuditLog>({
        customerId: customer.id!,
        customerUuid: customer.uuid,
        customerName: customer.name,
        saleId: payment.saleId,
        entityType: 'payment',
        action: 'edit',
        oldValue: `${oldAmount} DH le ${payment.date}`,
        newValue: `${newAmount} DH le ${newDate}`,
        reason: reason.trim(),
        date: nowMA(),
      });
      await db.creditAuditLogs.add(auditEntry);
      await queueOutboxOperation('credit_audit_logs', 'insert', auditEntry);

      payment.amount = newAmount;
      payment.date = newDate;
      if (newNote !== undefined) payment.note = newNote;
      if (newPaymentMethod) payment.paymentMethod = newPaymentMethod;
      const updatedPayment = withSyncMetadata(payment);
      await db.customerPayments.put(updatedPayment);
      await queueOutboxOperation('customer_payments', 'update', updatedPayment);

      await logShopActivity({
        action: 'payment_edit',
        entityType: 'customer_payment',
        entityId: String(paymentId),
        details: `Modification paiement client ${customer.name}: ${oldAmount} DH -> ${newAmount} DH (${reason.trim()})`,
      });
    }
  );
}

/**
 * Cancel Customer Payment (Atomic Dexie transaction with Audit Log)
 */
export async function cancelCustomerPaymentTransaction(
  paymentId: number,
  reason: string
): Promise<void> {
  if (!reason || !reason.trim()) {
    throw new Error("Un motif est obligatoire pour l'annulation d'un règlement.");
  }

  return await db.transaction(
    'rw',
    [db.customers, db.customerPayments, db.sales, db.creditAuditLogs, db.outbox, db.activityLogs],
    async () => {
      const payment = await db.customerPayments.get(paymentId);
      if (!payment) throw new Error('Règlement introuvable.');
      if (payment.status === 'cancelled') {
        throw new Error('Ce règlement a déjà été annulé.');
      }

      const customer = await db.customers.get(payment.customerId);
      if (!customer) throw new Error('Client introuvable.');

      customer.totalCredit = Math.round(((customer.totalCredit || 0) + payment.amount) * 100) / 100;
      const updatedCustomer = withSyncMetadata(customer);
      await db.customers.put(updatedCustomer);
      await queueOutboxOperation('customers', 'update', updatedCustomer);

      if (payment.saleId) {
        const sale = await db.sales.get(payment.saleId);
        if (sale) {
          sale.paidAmount = Math.max(0, Math.round((sale.paidAmount - payment.amount) * 100) / 100);
          sale.remainingAmount = Math.min(sale.totalAmount, Math.round((sale.remainingAmount + payment.amount) * 100) / 100);
          const updatedSale = withSyncMetadata(sale);
          await db.sales.put(updatedSale);
          await queueOutboxOperation('sales', 'update', updatedSale);
        }
      }

      payment.status = 'cancelled';
      payment.cancellationReason = reason.trim();
      payment.cancelledAt = new Date().toISOString();
      const updatedPayment = withSyncMetadata(payment);
      await db.customerPayments.put(updatedPayment);
      await queueOutboxOperation('customer_payments', 'update', updatedPayment);

      const auditEntry = withSyncMetadata<CreditAuditLog>({
        customerId: customer.id!,
        customerUuid: customer.uuid,
        customerName: customer.name,
        saleId: payment.saleId,
        entityType: 'payment',
        action: 'cancel',
        oldValue: `${payment.amount} DH`,
        newValue: '0 DH (Annulé)',
        reason: reason.trim(),
        date: nowMA(),
      });
      await db.creditAuditLogs.add(auditEntry);
      await queueOutboxOperation('credit_audit_logs', 'insert', auditEntry);

      await logShopActivity({
        action: 'payment_cancel',
        entityType: 'customer_payment',
        entityId: String(paymentId),
        details: `Annulation paiement client ${customer.name}: ${payment.amount} DH (${reason.trim()})`,
      });
    }
  );
}

/**
 * Update Bon Due Date (Atomic Dexie transaction with Audit Log)
 */
export async function updateSaleDueDateTransaction(
  saleId: number,
  newDueDate: string,
  reason: string
): Promise<void> {
  if (!reason || !reason.trim()) {
    throw new Error("Un motif est obligatoire pour modifier la date d'échéance.");
  }

  return await db.transaction(
    'rw',
    [db.sales, db.creditAuditLogs, db.customers, db.outbox],
    async () => {
      const sale = await db.sales.get(saleId);
      if (!sale) throw new Error('Bon de vente introuvable.');

      const oldDueDate = sale.dueDate || 'Non définie';
      sale.dueDate = newDueDate;
      const updatedSale = withSyncMetadata(sale);
      await db.sales.put(updatedSale);
      await queueOutboxOperation('sales', 'update', updatedSale);

      const auditEntry = withSyncMetadata<CreditAuditLog>({
        customerId: sale.customerId || 0,
        customerName: sale.customerName,
        saleId: sale.id,
        bonNumber: sale.bonNumber,
        entityType: 'due_date',
        action: 'edit',
        oldValue: oldDueDate,
        newValue: newDueDate,
        reason: reason.trim(),
        date: nowMA(),
      });
      await db.creditAuditLogs.add(auditEntry);
      await queueOutboxOperation('credit_audit_logs', 'insert', auditEntry);
    }
  );
}

/**
 * Update Bon Installment Schedule (Atomic Dexie transaction with Audit Log)
 */
export async function updateSaleInstallmentsTransaction(
  saleId: number,
  installments: Installment[],
  reason: string
): Promise<void> {
  if (!reason || !reason.trim()) {
    throw new Error("Un motif est obligatoire pour modifier l'échéancier.");
  }

  const totalInstallments = installments.reduce((sum, i) => sum + i.amount, 0);

  return await db.transaction(
    'rw',
    [db.sales, db.creditAuditLogs, db.customers, db.outbox],
    async () => {
      const sale = await db.sales.get(saleId);
      if (!sale) throw new Error('Bon de vente introuvable.');

      if (totalInstallments > sale.remainingAmount + 0.01) {
        throw new Error(
          `Le total de l'échéancier (${totalInstallments} DH) ne peut pas dépasser le reste à payer (${sale.remainingAmount} DH).`
        );
      }

      for (const inst of installments) {
        if (inst.amount <= 0) {
          throw new Error('Chaque tranche doit avoir un montant supérieur à zéro.');
        }
      }

      const oldCount = sale.installments?.length || 0;
      sale.installments = installments;
      const updatedSale = withSyncMetadata(sale);
      await db.sales.put(updatedSale);
      await queueOutboxOperation('sales', 'update', updatedSale);

      const auditEntry = withSyncMetadata<CreditAuditLog>({
        customerId: sale.customerId || 0,
        customerName: sale.customerName,
        saleId: sale.id,
        bonNumber: sale.bonNumber,
        entityType: 'installment',
        action: 'edit',
        oldValue: `${oldCount} tranches`,
        newValue: `${installments.length} tranches (Total: ${totalInstallments} DH)`,
        reason: reason.trim(),
        date: nowMA(),
      });
      await db.creditAuditLogs.add(auditEntry);
      await queueOutboxOperation('credit_audit_logs', 'insert', auditEntry);
    }
  );
}

/**
 * Update Customer Profile & Credit Ceiling (with Audit Log)
 */
export async function updateCustomerCreditSettingsTransaction(
  customerId: number,
  updates: {
    name?: string;
    phone?: string;
    CIN?: string;
    address?: string;
    customerType?: CustomerType;
    creditLimit?: number;
  },
  reason?: string
): Promise<void> {
  return await db.transaction(
    'rw',
    [db.customers, db.creditAuditLogs, db.outbox],
    async () => {
      const customer = await db.customers.get(customerId);
      if (!customer) throw new Error('Client introuvable.');

      const oldLimit = customer.creditLimit;
      const newLimit = updates.creditLimit;

      if (updates.name !== undefined) customer.name = updates.name.trim();
      if (updates.phone !== undefined) customer.phone = updates.phone.trim();
      if (updates.CIN !== undefined) customer.CIN = updates.CIN.trim() || undefined;
      if (updates.address !== undefined) customer.address = updates.address.trim() || undefined;
      if (updates.customerType !== undefined) customer.customerType = updates.customerType;
      customer.creditLimit = newLimit;

      const updatedCustomer = withSyncMetadata(customer);
      await db.customers.put(updatedCustomer);
      await queueOutboxOperation('customers', 'update', updatedCustomer);

      if (oldLimit !== newLimit) {
        const auditEntry = withSyncMetadata<CreditAuditLog>({
          customerId,
          customerUuid: customer.uuid,
          customerName: customer.name,
          entityType: 'credit_limit',
          action: 'edit',
          oldValue: oldLimit ? `${oldLimit} DH` : 'Non défini',
          newValue: newLimit ? `${newLimit} DH` : 'Non défini',
          reason: reason?.trim() || 'Mise à jour du plafond de crédit',
          date: nowMA(),
        });
        await db.creditAuditLogs.add(auditEntry);
        await queueOutboxOperation('credit_audit_logs', 'insert', auditEntry);
      }
    }
  );
}

/**
 * Legacy registerCustomerPaymentTransaction wrapper for existing callers
 */
export async function registerCustomerPaymentTransaction(
  customerId: number,
  amount: number,
  date: string,
  note?: string,
  saleId?: number
): Promise<void> {
  await registerCustomerPaymentAdvancedTransaction({
    customerId,
    amount,
    date,
    note,
    applyMode: saleId ? 'specific' : 'fifo',
    specificSaleId: saleId,
  });
}

/**
 * Register Supplier Payment Transaction
 */
export async function registerSupplierPaymentTransaction(
  supplierId: number,
  amount: number,
  date: string,
  note?: string
): Promise<void> {
  return await db.transaction(
    'rw',
    [db.suppliers, db.supplierPayments, db.outbox, db.activityLogs],
    async () => {
      const supplier = await db.suppliers.get(supplierId);
      if (!supplier) throw new Error('Fournisseur introuvable.');

      if (amount <= 0) throw new Error('Le montant doit être supérieur à zéro.');

      const paymentDate = date || getMoroccoDateString();
      const sp = withSyncMetadata<SupplierPayment>({
        supplierId,
        supplierUuid: supplier.uuid,
        amount,
        date: paymentDate,
        note: note || 'Règlement fournisseur',
      });
      await db.supplierPayments.add(sp);
      await queueOutboxOperation('supplier_payments', 'insert', sp);

      supplier.paidAmount = (supplier.paidAmount || 0) + amount;
      const updatedSupplier = withSyncMetadata(supplier);
      await db.suppliers.put(updatedSupplier);
      await queueOutboxOperation('suppliers', 'update', updatedSupplier);
    }
  );
}

/**
 * Create Supplier Purchase Order ("Bon d'achat fournisseur" - Partie 3 #3)
 * Automatically increments product stock (with batch IMEIs) and updates supplier debt.
 */
export async function createSupplierPurchaseOrderTransaction(
  params: {
    supplierId: number;
    date?: string;
    items: SupplierPurchaseItem[];
    paidAmount: number;
    notes?: string;
  },
  customBonNumber?: string
): Promise<SupplierPurchaseOrder> {
  // N1: Reserve cloud number BEFORE opening the Dexie transaction
  const preReservedBon = customBonNumber || (await reserveNumber('po'));

  return await db.transaction(
    'rw',
    [
      db.suppliers,
      db.supplierPayments,
      db.supplierPurchaseOrders,
      db.products,
      db.settings,
      db.outbox,
      db.activityLogs,
      db.stockMovements,
    ],
    async () => {
      const supplier = await db.suppliers.get(params.supplierId);
      if (!supplier) throw new Error('Fournisseur introuvable.');

      const poDate = params.date || getMoroccoDateString();
      const now = new Date().toISOString();

      // Generate BA-0001 number inside atomic transaction (or use pre-reserved cloud number)
      const bonNumber = preReservedBon || (await getNextPurchaseOrderNumber());

      let totalAmount = 0;

      for (const item of params.items) {
        const lineQty =
          item.category === 'phone' && item.imeis && item.imeis.length > 0
            ? item.imeis.length
            : item.quantity;
        totalAmount += lineQty * item.purchasePrice;

        if (item.productId) {
          const existing = await db.products.get(item.productId);
          if (existing) {
            const prevQty = existing.quantity;
            existing.purchasePrice = item.purchasePrice;
            if (item.retailPrice > 0) existing.retailPrice = item.retailPrice;
            if (item.wholesalePrice > 0) existing.wholesalePrice = item.wholesalePrice;

            if (existing.category === 'phone' && item.imeis?.length) {
              const existingImeis = new Set((existing.imeiList || []).map((i) => i.imei));
              for (const rawImei of item.imeis) {
                const cleanImei = rawImei.trim();
                if (cleanImei && !existingImeis.has(cleanImei)) {
                  existing.imeiList.push({ imei: cleanImei, status: 'in_stock' });
                }
              }
              existing.quantity = existing.imeiList.filter((i) => i.status === 'in_stock').length;
            } else {
              existing.quantity += lineQty;
            }

            const updatedProd = withSyncMetadata(existing);
            await db.products.put(updatedProd);
            await queueOutboxOperation('products', 'update', updatedProd);

            await recordStockMovement({
              productId: existing.id!,
              productUuid: existing.uuid,
              productName: existing.name,
              type: 'purchase',
              quantityDelta: lineQty,
              previousQty: prevQty,
              newQty: existing.quantity,
              reason: `Bon d'achat ${bonNumber} (${supplier.name})`,
            });
            continue;
          }
        }

        // Create new product if not linked to an existing one
        const imeiList =
          item.category === 'phone' && item.imeis
            ? item.imeis.map((im) => ({ imei: im.trim(), status: 'in_stock' as const }))
            : [];
        const newProd = withSyncMetadata<Product>({
          name: item.productName,
          category: item.category,
          purchasePrice: item.purchasePrice,
          retailPrice: item.retailPrice || Math.round(item.purchasePrice * 1.25),
          wholesalePrice: item.wholesalePrice || Math.round(item.purchasePrice * 1.12),
          quantity: item.category === 'phone' ? imeiList.length : lineQty,
          minAlertQty: 5,
          supplierId: supplier.id,
          supplierUuid: supplier.uuid,
          imeiList,
          barcode: item.barcode,
          createdAt: now,
        });
        const newProdId = await db.products.add(newProd);
        await queueOutboxOperation('products', 'insert', { ...newProd, id: newProdId });

        await recordStockMovement({
          productId: newProdId,
          productUuid: newProd.uuid,
          productName: newProd.name,
          type: 'purchase',
          quantityDelta: newProd.quantity,
          previousQty: 0,
          newQty: newProd.quantity,
          reason: `Nouvel article via Bon d'achat ${bonNumber}`,
        });
      }

      const paidAmount = Math.min(totalAmount, Math.max(0, params.paidAmount || 0));
      const remainingAmount = Math.max(0, totalAmount - paidAmount);

      // Update supplier totalDebt and paidAmount
      supplier.totalDebt = (supplier.totalDebt || 0) + totalAmount;
      supplier.paidAmount = (supplier.paidAmount || 0) + paidAmount;
      const updatedSupplier = withSyncMetadata(supplier);
      await db.suppliers.put(updatedSupplier);
      await queueOutboxOperation('suppliers', 'update', updatedSupplier);

      if (paidAmount > 0) {
        const sp = withSyncMetadata<SupplierPayment>({
          supplierId: supplier.id!,
          supplierUuid: supplier.uuid,
          amount: paidAmount,
          date: poDate,
          note: `Acompte sur Bon d'achat ${bonNumber}`,
        });
        await db.supplierPayments.add(sp);
        await queueOutboxOperation('supplier_payments', 'insert', sp);
      }

      const po = withSyncMetadata<SupplierPurchaseOrder>({
        bonNumber,
        supplierId: supplier.id!,
        supplierUuid: supplier.uuid,
        supplierName: supplier.name,
        date: poDate,
        items: params.items,
        totalAmount,
        paidAmount,
        remainingAmount,
        notes: params.notes,
        createdAt: now,
      });
      const poId = await db.supplierPurchaseOrders.add(po);
      po.id = poId;
      await queueOutboxOperation('supplier_purchase_orders', 'insert', po);

      await logShopActivity({
        action: 'purchase_order',
        entityType: 'supplier_purchase_order',
        entityId: bonNumber,
        details: `Bon d'achat ${bonNumber} chez ${supplier.name} - Total: ${totalAmount} DH (Payé: ${paidAmount} DH)`,
      });

      return po;
    }
  );
}

/**
 * Used Phone Trade-in ("Reprise de téléphone d'occasion" - Partie 3 #5)
 */
export async function registerUsedPhoneTradeInTransaction(params: {
  modelName: string;
  imei: string;
  condition: PhoneCondition;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice?: number;
  customerName: string;
  customerPhone?: string;
  customerCIN?: string;
  customerCinImage?: string;
  notes?: string;
}): Promise<Product> {
  const cleanImei = params.imei.trim();
  const isUnique = await checkImeiUnique(cleanImei);
  if (!isUnique) {
    throw new Error(`Cet IMEI (${cleanImei}) existe déjà dans le stock.`);
  }

  return await db.transaction(
    'rw',
    [db.products, db.expenses, db.outbox, db.activityLogs, db.stockMovements],
    async () => {
      const now = new Date().toISOString();
      const conditionLabel =
        params.condition === 'used_excellent'
          ? 'Occasion - Excellent'
          : params.condition === 'used_good'
          ? 'Occasion - Bon état'
          : 'Occasion - État correct';

      const newProduct = withSyncMetadata<Product>({
        name: `${params.modelName.trim()} (${conditionLabel})`,
        category: 'phone',
        purchasePrice: params.purchasePrice,
        retailPrice: params.retailPrice,
        wholesalePrice: params.wholesalePrice || params.retailPrice,
        quantity: 1,
        minAlertQty: 1,
        imeiList: [
          {
            imei: cleanImei,
            status: 'in_stock',
            condition: params.condition,
          },
        ],
        createdAt: now,
        isTradeIn: true,
        condition: params.condition,
        tradeInCustomerName: params.customerName.trim(),
        tradeInCustomerPhone: params.customerPhone?.trim(),
        tradeInCustomerCIN: params.customerCIN?.trim(),
        tradeInCinImage: params.customerCinImage,
        notes: params.notes
          ? `[Reprise de ${params.customerName} - CIN: ${params.customerCIN || 'N/A'}] ${params.notes}`
          : `Reprise téléphone d'occasion de ${params.customerName} (CIN: ${params.customerCIN || 'N/A'})`,
      });

      const id = await db.products.add(newProduct);
      newProduct.id = id;
      await queueOutboxOperation('products', 'insert', newProduct);

      await recordStockMovement({
        productId: id,
        productUuid: newProduct.uuid,
        productName: newProduct.name,
        type: 'trade_in',
        quantityDelta: 1,
        previousQty: 0,
        newQty: 1,
        reason: `Reprise occasion (${params.customerName}) - IMEI ${cleanImei}`,
      });

      await logShopActivity({
        action: 'trade_in',
        entityType: 'product',
        entityId: cleanImei,
        details: `Reprise occasion: ${params.modelName} (IMEI: ${cleanImei}) à ${params.purchasePrice} DH de ${params.customerName}`,
      });

      return newProduct;
    }
  );
}

/**
 * Manual Stock Adjustment / Physical Count Adjustment (Partie 3 #8)
 */
export async function adjustProductStockTransaction(params: {
  productId: number;
  newQuantity: number;
  reason: string;
}): Promise<void> {
  return await db.transaction(
    'rw',
    [db.products, db.stockMovements, db.activityLogs, db.outbox],
    async () => {
      const product = await db.products.get(params.productId);
      if (!product) throw new Error('Produit introuvable.');

      const prevQty = product.quantity;
      const delta = params.newQuantity - prevQty;
      if (delta === 0) return;

      product.quantity = Math.max(0, params.newQuantity);
      const updated = withSyncMetadata(product);
      await db.products.put(updated);
      await queueOutboxOperation('products', 'update', updated);

      await recordStockMovement({
        productId: product.id!,
        productUuid: product.uuid,
        productName: product.name,
        type: 'adjustment',
        quantityDelta: delta,
        previousQty: prevQty,
        newQty: product.quantity,
        reason: params.reason.trim() || 'Ajustement inventaire physique',
      });

      await logShopActivity({
        action: 'stock_adjustment',
        entityType: 'product',
        entityId: String(product.id),
        details: `Ajustement stock "${product.name}": ${prevQty} -> ${product.quantity} (${params.reason.trim()})`,
      });
    }
  );
}

/**
 * Delete product with integrity check
 */
export async function deleteProductTransaction(productId: number): Promise<void> {
  return await db.transaction(
    'rw',
    [db.products, db.sales, db.warranties, db.outbox, db.activityLogs],
    async () => {
      const product = await db.products.get(productId);
      const sales = await db.sales.toArray();
      const hasSales = sales.some((s) => s.items.some((i) => i.productId === productId));
      if (hasSales) {
        throw new Error('Impossible de supprimer ce produit car des ventes y sont associées.');
      }

      const warranties = await db.warranties.toArray();
      const hasWarranties = warranties.some((w) => w.productId === productId);
      if (hasWarranties) {
        throw new Error('Impossible de supprimer ce produit car des garanties y sont associées.');
      }

      await db.products.delete(productId);
      if (product?.uuid) {
        await queueOutboxOperation('products', 'delete', {
          uuid: product.uuid,
          deleted_at: new Date().toISOString(),
        });
      }
      await logShopActivity({
        action: 'delete',
        entityType: 'product',
        entityId: String(productId),
        details: `Suppression produit "${product?.name || productId}"`,
      });
    }
  );
}

/**
 * Export full database to JSON (Version 4 - Partie 1 #9 & #10)
 * Ensures repair lockCode is encrypted and never exported in plain text.
 */
export async function exportDatabaseJson(): Promise<string> {
  const rawRepairs = await db.repairs.toArray();
  const safeRepairs: RepairOrder[] = [];
  for (const r of rawRepairs) {
    if (r.lockCode && r.lockCode.trim()) {
      const encryptedCode = await encryptSensitiveData(r.lockCode);
      safeRepairs.push({ ...r, lockCode: encryptedCode });
    } else {
      safeRepairs.push(r);
    }
  }

  const data = {
    exportedAt: new Date().toISOString(),
    version: 4,
    products: await db.products.toArray(),
    suppliers: await db.suppliers.toArray(),
    supplierPayments: await db.supplierPayments.toArray(),
    supplierPurchaseOrders: await db.supplierPurchaseOrders.toArray(),
    customers: await db.customers.toArray(),
    customerPayments: await db.customerPayments.toArray(),
    sales: await db.sales.toArray(),
    warranties: await db.warranties.toArray(),
    savTickets: await db.savTickets.toArray(),
    repairs: safeRepairs,
    spareParts: await db.spareParts.toArray(),
    creditAuditLogs: await db.creditAuditLogs.toArray(),
    expenses: await db.expenses.toArray(),
    recurringExpenses: await db.recurringExpenses.toArray(),
    customExpenseCategories: await db.customExpenseCategories.toArray(),
    stockMovements: await db.stockMovements.toArray(),
    cashClosures: await db.cashClosures.toArray(),
    activityLogs: await db.activityLogs.toArray(),
    settings: await db.settings.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Validate a parsed backup object before touching any database table (Partie 1 #10)
 */
export function validateBackupStructure(data: any): { valid: boolean; reason?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, reason: 'Le fichier JSON ne contient pas un objet de sauvegarde valide.' };
  }
  if (typeof data.version !== 'number' || data.version < 1) {
    return { valid: false, reason: 'Numéro de version de sauvegarde manquant ou invalide.' };
  }
  const requiredArrays = ['products', 'customers', 'sales'];
  for (const key of requiredArrays) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      return { valid: false, reason: `La table "${key}" dans le fichier est corrompue.` };
    }
  }
  if (!Array.isArray(data.products) && !Array.isArray(data.sales) && !Array.isArray(data.customers)) {
    return { valid: false, reason: 'Aucune table de données reconnue dans ce fichier JSON.' };
  }
  return { valid: true };
}

/**
 * Import full database from JSON (Partie 1 #10)
 * - Strictly validates JSON structure BEFORE clearing anything
 * - Saves an automatic emergency backup prior to clearing
 */
export async function importDatabaseJson(jsonString: string): Promise<void> {
  let data: any;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Fichier JSON invalide ou corrompu. Aucune donnée locale n\'a été modifiée.');
  }

  const check = validateBackupStructure(data);
  if (!check.valid) {
    throw new Error(check.reason || 'Structure de sauvegarde invalide.');
  }

  // Automatic pre-import backup in localStorage so data can never be lost
  try {
    const emergencyBackup = await exportDatabaseJson();
    localStorage.setItem('golden_pre_import_emergency_backup', emergencyBackup);
    localStorage.setItem('golden_pre_import_emergency_backup_at', new Date().toISOString());
  } catch {}

  await db.transaction(
    'rw',
    [
      db.products,
      db.suppliers,
      db.supplierPayments,
      db.supplierPurchaseOrders,
      db.customers,
      db.customerPayments,
      db.sales,
      db.warranties,
      db.savTickets,
      db.repairs,
      db.spareParts,
      db.creditAuditLogs,
      db.expenses,
      db.recurringExpenses,
      db.customExpenseCategories,
      db.stockMovements,
      db.cashClosures,
      db.activityLogs,
      db.settings,
    ],
    async () => {
      await db.products.clear();
      await db.suppliers.clear();
      await db.supplierPayments.clear();
      await db.supplierPurchaseOrders.clear();
      await db.customers.clear();
      await db.customerPayments.clear();
      await db.sales.clear();
      await db.warranties.clear();
      await db.savTickets.clear();
      await db.repairs.clear();
      await db.spareParts.clear();
      await db.creditAuditLogs.clear();
      await db.expenses.clear();
      await db.recurringExpenses.clear();
      await db.customExpenseCategories.clear();
      await db.stockMovements.clear();
      await db.cashClosures.clear();
      await db.activityLogs.clear();
      await db.settings.clear();

      if (data.products?.length) await db.products.bulkPut(data.products);
      if (data.suppliers?.length) await db.suppliers.bulkPut(data.suppliers);
      if (data.supplierPayments?.length) await db.supplierPayments.bulkPut(data.supplierPayments);
      if (data.supplierPurchaseOrders?.length) await db.supplierPurchaseOrders.bulkPut(data.supplierPurchaseOrders);
      if (data.customers?.length) await db.customers.bulkPut(data.customers);
      if (data.customerPayments?.length) await db.customerPayments.bulkPut(data.customerPayments);
      if (data.sales?.length) await db.sales.bulkPut(data.sales);
      if (data.warranties?.length) await db.warranties.bulkPut(data.warranties);
      if (data.savTickets?.length) await db.savTickets.bulkPut(data.savTickets);
      if (data.repairs?.length) await db.repairs.bulkPut(data.repairs);
      if (data.spareParts?.length) await db.spareParts.bulkPut(data.spareParts);
      if (data.creditAuditLogs?.length) await db.creditAuditLogs.bulkPut(data.creditAuditLogs);
      if (data.expenses?.length) await db.expenses.bulkPut(data.expenses);
      if (data.recurringExpenses?.length) await db.recurringExpenses.bulkPut(data.recurringExpenses);
      if (data.customExpenseCategories?.length) await db.customExpenseCategories.bulkPut(data.customExpenseCategories);
      if (data.stockMovements?.length) await db.stockMovements.bulkPut(data.stockMovements);
      if (data.cashClosures?.length) await db.cashClosures.bulkPut(data.cashClosures);
      if (data.activityLogs?.length) await db.activityLogs.bulkPut(data.activityLogs);
      if (data.settings?.length) await db.settings.bulkPut(data.settings);
    }
  );
}

/**
 * Clear all data when explicitly confirmed by owner (Start from 0 / البدء من الصفر)
 */
export async function clearAllData(): Promise<void> {
  console.log('[DB] clearAllData: Starting total wipe of all tables and stores...');
  try {
    const tables = [
      db.products,
      db.suppliers,
      db.supplierPayments,
      db.supplierPurchaseOrders,
      db.customers,
      db.customerPayments,
      db.sales,
      db.warranties,
      db.savTickets,
      db.repairs,
      db.spareParts,
      db.expenses,
      db.recurringExpenses,
      db.customExpenseCategories,
      db.stockMovements,
      db.cashClosures,
      db.activityLogs,
      db.creditAuditLogs,
      db.outbox,
      db.syncConflicts,
    ];

    // Clear each table safely with individual try/catch
    for (const tbl of tables) {
      try {
        await tbl.clear();
        console.log(`[DB] clearAllData: Cleared table "${tbl.name}"`);
      } catch (tblErr) {
        console.warn(`[DB] clearAllData: Warning clearing table "${tbl.name}":`, tblErr);
      }
    }

    // Reset counters and backup date in settings store
    try {
      const allSettings = await db.settings.toArray();
      for (const item of allSettings) {
        if (
          item.key.startsWith('seq_') ||
          item.key === 'lastBackupDate' ||
          item.key === 'access_security_state'
        ) {
          await db.settings.delete(item.key);
        }
      }
      // Re-initialize clean store settings
      await db.settings.put({
        key: 'store_settings',
        value: DEFAULT_SETTINGS,
        updated_at: new Date().toISOString(),
      });
      console.log('[DB] clearAllData: Reset sequences and store_settings to default.');
    } catch (setErr) {
      console.warn('[DB] clearAllData: Warning resetting settings:', setErr);
    }

    console.log('[DB] clearAllData: Total wipe completed successfully.');
  } catch (err) {
    console.error('[DB] clearAllData: Fatal error during wipe:', err);
    throw err;
  }
}

/**
 * Wipe all data, storage, and restart application completely from 0
 */
export async function wipeAllDataAndRestart(): Promise<void> {
  console.log('[WIPE] Starting full wipe: storage + IndexedDB + reload');
  try {
    // 1. Wipe all Dexie IndexedDB tables
    await clearAllData();

    // 2. Clear browser storage
    try {
      const savedLang = localStorage.getItem('golden_shop_language') || 'ar';
      localStorage.clear();
      sessionStorage.clear();
      // Keep language preference so UI stays in user's chosen language
      localStorage.setItem('golden_shop_language', savedLang);
      console.log('[WIPE] localStorage and sessionStorage cleared.');
    } catch (storageErr) {
      console.warn('[WIPE] Error clearing browser storage:', storageErr);
    }

    console.log('[WIPE] Data wipe complete.');
  } catch (err) {
    console.error('[WIPE] Error during wipeAllDataAndRestart:', err);
    throw err;
  }
}

/**
 * Create a new Repair Order in the workshop
 * - Encrypts lockCode with AES-GCM (Partie 1 #9)
 * - Records depositAmount as encaissement on the deposit date (Partie 1 #2)
 */
export async function createRepairOrder(
  data: Omit<RepairOrder, 'id' | 'repairNumber' | 'createdAt' | 'updatedAt'>,
  customRepairNumber?: string
): Promise<RepairOrder> {
  const now = new Date().toISOString();
  const intakeDate = data.intakeDate || getMoroccoDateString();
  const encryptedLockCode = data.lockCode ? await encryptSensitiveData(data.lockCode) : undefined;
  // N1: Reserve cloud number BEFORE opening the Dexie transaction
  const preReservedRepairNum = customRepairNumber || (await reserveNumber('repair'));

  return await db.transaction(
    'rw',
    [db.repairs, db.sales, db.settings, db.outbox, db.activityLogs],
    async () => {
      const repairNumber = preReservedRepairNum || (await getNextRepairNumber());
      const partsCostInit = Number(data.totalPartsCost) || 0;
      const netProfitInit = Math.round(((Number(data.agreedPrice) || 0) - partsCostInit) * 100) / 100;
      const commRateInit = Math.max(0, Math.min(100, Number(data.technicianCommissionRate) || 0));
      const commAmountInit =
        commRateInit > 0
          ? Math.round(Math.max(0, netProfitInit) * (commRateInit / 100) * 100) / 100
          : 0;

      const newOrder: RepairOrder = withSyncMetadata({
        ...data,
        intakeDate,
        lockCode: encryptedLockCode,
        repairNumber,
        netProfit: netProfitInit,
        technicianName: data.technicianName?.trim() || undefined,
        technicianCommissionRate: commRateInit > 0 ? commRateInit : undefined,
        technicianCommissionAmount: commAmountInit > 0 ? commAmountInit : 0,
        createdAt: now,
        updatedAt: now,
      });

      const id = await db.repairs.add(newOrder);
      newOrder.id = id;
      await queueOutboxOperation('repairs', 'insert', newOrder);

      // Partie 1 #2: Record depositAmount as cash encaissement on the date of the deposit
      if (data.depositAmount > 0) {
        const depositSale = withSyncMetadata<Sale>({
          bonNumber: `REP-DEP-${repairNumber}`,
          date: intakeDate,
          customerId: 0,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          items: [
            {
              productId: 0,
              name: `Acompte réparation: ${data.brand} ${data.model} (${repairNumber})`,
              category: 'other',
              quantity: 1,
              price: data.depositAmount,
              costPrice: 0,
              type: 'retail',
              imei: data.imei,
            },
          ],
          subtotal: data.depositAmount,
          discountAmount: 0,
          totalAmount: data.depositAmount,
          paidAmount: data.depositAmount,
          remainingAmount: 0,
          paymentType: 'cash',
          paymentMethod: 'cash',
          warrantyMonths: 0,
          hasWarranty: false,
          status: 'active',
          saleKind: 'repair_deposit',
          repairId: id,
          repairUuid: newOrder.uuid,
          notes: `Acompte initial réparation ${repairNumber} - ${data.brand} ${data.model}`,
        });
        await db.sales.add(depositSale);
        await queueOutboxOperation('sales', 'insert', depositSale);
      }

      await logShopActivity({
        action: 'repair',
        entityType: 'repair',
        entityId: repairNumber,
        details: `Réception réparation ${repairNumber}: ${data.brand} ${data.model} (${data.customerName}) - Prix: ${data.agreedPrice} DH, Acompte: ${data.depositAmount} DH`,
      });

      return newOrder;
    }
  );
}

/**
 * Update stage / status of a repair order with 1 click
 */
export async function updateRepairStatus(
  repairId: number,
  status: RepairStatus,
  technicianNotes?: string
): Promise<void> {
  const now = new Date().toISOString();
  const updateData: Partial<RepairOrder> = {
    status,
    updatedAt: now,
    updated_at: now,
  };
  if (technicianNotes !== undefined) {
    updateData.technicianNotes = technicianNotes;
  }
  await db.repairs.update(repairId, updateData);
  const updated = await db.repairs.get(repairId);
  if (updated) {
    await queueOutboxOperation('repairs', 'update', updated);
  }
}

/**
 * L1: Modify agreedPrice (and optional condition/technician notes + technician commission) of a repair order before delivery.
 * Recalculates remainingAmount = agreedPrice - depositAmount and netProfit = agreedPrice - totalPartsCost.
 */
export async function updateRepairAgreedPrice(
  repairId: number,
  newAgreedPrice: number,
  notes?: string,
  technicianName?: string,
  technicianCommissionRate?: number
): Promise<RepairOrder> {
  if (!Number.isFinite(newAgreedPrice) || newAgreedPrice < 0) {
    throw new Error('Le prix convenu ne peut pas être négatif. / الثمن المتفق عليه لا يمكن أن يكون سالباً.');
  }
  const now = new Date().toISOString();
  return await db.transaction('rw', [db.repairs, db.outbox, db.activityLogs], async () => {
    const repair = await db.repairs.get(repairId);
    if (!repair || repair.deleted_at) {
      throw new Error('Dossier de réparation introuvable.');
    }
    if (repair.status === 'delivered') {
      throw new Error('Impossible de modifier le prix convenu d\'une réparation déjà livrée.');
    }
    if (repair.status === 'cancelled') {
      throw new Error('Impossible de modifier une réparation annulée.');
    }
    const deposit = Number(repair.depositAmount) || 0;
    if (newAgreedPrice < deposit - 0.01) {
      throw new Error(
        `Le prix convenu (${newAgreedPrice} DH) ne peut pas être inférieur à l'acompte déjà versé (${deposit} DH).`
      );
    }
    const newRemaining = Math.max(0, Math.round((newAgreedPrice - deposit) * 100) / 100);
    const partsCost = Number(repair.totalPartsCost) || 0;
    const newNetProfit = Math.round((newAgreedPrice - partsCost) * 100) / 100;

    const effectiveRate =
      technicianCommissionRate !== undefined
        ? Math.max(0, Math.min(100, Number(technicianCommissionRate) || 0))
        : Number(repair.technicianCommissionRate) || 0;
    const newCommAmount =
      effectiveRate > 0
        ? Math.round(Math.max(0, newNetProfit) * (effectiveRate / 100) * 100) / 100
        : 0;

    const updatePayload: Partial<RepairOrder> = {
      agreedPrice: Math.round(newAgreedPrice * 100) / 100,
      remainingAmount: newRemaining,
      netProfit: newNetProfit,
      technicianCommissionRate: effectiveRate > 0 ? effectiveRate : undefined,
      technicianCommissionAmount: newCommAmount,
      updatedAt: now,
      updated_at: now,
    };
    if (notes !== undefined) {
      updatePayload.technicianNotes = notes;
    }
    if (technicianName !== undefined) {
      updatePayload.technicianName = technicianName.trim() || undefined;
    }

    await db.repairs.update(repairId, updatePayload);
    const updatedRepair = await db.repairs.get(repairId);
    if (!updatedRepair) {
      throw new Error('Erreur lors de la mise à jour de la réparation.');
    }
    await queueOutboxOperation('repairs', 'update', updatedRepair);
    await logShopActivity({
      action: 'repair',
      entityType: 'repair',
      entityId: repair.repairNumber,
      details: `Modification prix convenu réparation ${repair.repairNumber}: ${repair.agreedPrice} DH -> ${updatePayload.agreedPrice} DH (Reste: ${newRemaining} DH)`,
    });
    return updatedRepair;
  });
}

/**
 * Update Technician & Commission Rate on any repair (even after delivery)
 */
export async function updateRepairTechnician(
  repairId: number,
  technicianName: string,
  commissionRate: number
): Promise<RepairOrder> {
  const now = new Date().toISOString();
  return await db.transaction('rw', [db.repairs, db.outbox], async () => {
    const repair = await db.repairs.get(repairId);
    if (!repair || repair.deleted_at) {
      throw new Error('Dossier de réparation introuvable.');
    }
    const partsCost = Number(repair.totalPartsCost) || 0;
    const netProfit =
      repair.netProfit !== undefined ? repair.netProfit : Math.max(0, repair.agreedPrice - partsCost);
    const rate = Math.max(0, Math.min(100, Number(commissionRate) || 0));
    const commAmount =
      rate > 0 ? Math.round(Math.max(0, netProfit) * (rate / 100) * 100) / 100 : 0;

    await db.repairs.update(repairId, {
      technicianName: technicianName.trim() || undefined,
      technicianCommissionRate: rate > 0 ? rate : undefined,
      technicianCommissionAmount: commAmount,
      updatedAt: now,
      updated_at: now,
    });
    const updated = await db.repairs.get(repairId);
    if (!updated) throw new Error('Erreur mise à jour technicien.');
    await queueOutboxOperation('repairs', 'update', updated);
    return updated;
  });
}

/**
 * Deliver a repaired phone to the customer (Partie 1 #2 & L1):
 * - Marks status as 'delivered' and sets actualDeliveryDate in Morocco timezone
 * - Requires the remaining balance to be collected in full (to grant a discount, update agreedPrice first)
 * - Verifies status is neither 'delivered' nor 'cancelled'
 * - Records remaining balance collected on delivery date with saleKind: 'repair_delivery'
 *   and costPrice = repair.totalPartsCost so repair profit is NEVER double-counted!
 */
export async function deliverRepairOrder(
  repairId: number,
  finalAmountCollected?: number
): Promise<void> {
  const todayStr = getMoroccoDateString();
  const now = new Date().toISOString();

  await db.transaction('rw', [db.repairs, db.sales, db.outbox, db.activityLogs], async () => {
    const repair = await db.repairs.get(repairId);
    if (!repair || repair.deleted_at) throw new Error('Dossier de réparation introuvable.');
    if (repair.status === 'delivered') {
      throw new Error('Cette réparation a déjà été livrée.');
    }
    if (repair.status === 'cancelled') {
      throw new Error(
        'Cette réparation est annulée et ne peut pas être livrée. / تم إلغاء هذا الإصلاح ولا يمكن تسليمه.'
      );
    }

    const partsCost = repair.totalPartsCost || 0;
    const revenueAmount =
      finalAmountCollected !== undefined ? Number(finalAmountCollected) : repair.remainingAmount;
    if (revenueAmount < 0 || !Number.isFinite(revenueAmount)) {
      throw new Error('Le montant encaissé à la livraison ne peut pas être négatif.');
    }
    if (Math.abs(revenueAmount - repair.remainingAmount) > 0.01) {
      throw new Error(
        'Le solde doit être encaissé en totalité. Pour accorder une remise, modifiez d\'abord le prix convenu. / يجب تحصيل المبلغ المتبقي بالكامل. لمنح تخفيض، يرجى تعديل الثمن المتفق عليه أولاً.'
      );
    }

    const totalCollectedForRepair = (repair.depositAmount || 0) + revenueAmount;
    const computedNetProfit = totalCollectedForRepair - partsCost;
    const commRate = Number(repair.technicianCommissionRate) || 0;
    const computedCommAmount =
      commRate > 0 ? Math.round(Math.max(0, computedNetProfit) * (commRate / 100) * 100) / 100 : 0;

    await db.repairs.update(repairId, {
      status: 'delivered',
      actualDeliveryDate: todayStr,
      remainingAmount: 0,
      netProfit: computedNetProfit,
      technicianCommissionAmount: computedCommAmount,
      updatedAt: now,
      updated_at: now,
    });

    const updatedRepair = await db.repairs.get(repairId);
    if (updatedRepair) {
      await queueOutboxOperation('repairs', 'update', updatedRepair);
    }

    // Record remaining payment collected at delivery as cash encaissement
    if (revenueAmount > 0 || partsCost > 0) {
      const nextBon = `REP-${repair.repairNumber}`;
      const existingBon = await db.sales.where('bonNumber').equals(nextBon).first();
      if (!existingBon) {
        const deliverySale = withSyncMetadata<Sale>({
          bonNumber: nextBon,
          date: todayStr,
          customerId: 0,
          customerName: repair.customerName,
          customerPhone: repair.customerPhone,
          items: [
            {
              productId: 0,
              name: `Solde livraison réparation: ${repair.brand} ${repair.model} (${repair.repairNumber})`,
              category: 'other',
              quantity: 1,
              price: revenueAmount,
              costPrice: partsCost,
              type: 'retail',
              imei: repair.imei,
            },
          ],
          subtotal: revenueAmount,
          discountAmount: 0,
          totalAmount: revenueAmount,
          paidAmount: revenueAmount,
          remainingAmount: 0,
          paymentType: 'cash',
          paymentMethod: 'cash',
          warrantyMonths: 0,
          hasWarranty: false,
          status: 'active',
          saleKind: 'repair_delivery',
          repairId,
          repairUuid: repair.uuid,
          notes: `Règlement livraison réparation ${repair.repairNumber} - ${repair.brand} ${repair.model}`,
        });
        await db.sales.add(deliverySale);
        await queueOutboxOperation('sales', 'insert', deliverySale);
      }
    }

    await logShopActivity({
      action: 'repair',
      entityType: 'repair',
      entityId: repair.repairNumber,
      details: `Livraison réparation ${repair.repairNumber} (${repair.customerName}) - Encaissé à la livraison: ${revenueAmount} DH`,
    });
  });
}

/**
 * Cancel or delete a repair order:
 * Restores any used parts back into spare parts stock, then deletes the repair order.
 */
export async function cancelOrDeleteRepairOrder(repairId: number): Promise<void> {
  await db.transaction('rw', [db.repairs, db.spareParts, db.sales, db.outbox, db.activityLogs], async () => {
    const repair = await db.repairs.get(repairId);
    if (!repair) return;

    if (repair.usedParts && repair.usedParts.length > 0) {
      for (const used of repair.usedParts) {
        const partInDb = await db.spareParts.get(used.partId);
        if (partInDb) {
          await db.spareParts.update(used.partId, {
            quantity: partInDb.quantity + used.quantity,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    // Remove associated REP- sales if any
    const relatedSales = await db.sales
      .filter(
        (s) =>
          s.repairId === repairId ||
          s.bonNumber === `REP-${repair.repairNumber}` ||
          s.bonNumber === `REP-DEP-${repair.repairNumber}`
      )
      .toArray();
    for (const rs of relatedSales) {
      if (rs.id) await db.sales.delete(rs.id);
    }

    await db.repairs.delete(repairId);
    if (repair.uuid) {
      await queueOutboxOperation('repairs', 'delete', {
        uuid: repair.uuid,
        deleted_at: new Date().toISOString(),
      });
    }

    await logShopActivity({
      action: 'delete',
      entityType: 'repair',
      entityId: repair.repairNumber,
      details: `Annulation/Suppression réparation ${repair.repairNumber}`,
    });
  });
}

/**
 * Create a new spare part in inventory
 */
export async function createSparePart(
  data: Omit<SparePart, 'id' | 'createdAt'>
): Promise<SparePart> {
  const newPart: SparePart = withSyncMetadata({
    ...data,
    createdAt: new Date().toISOString(),
  });
  const id = await db.spareParts.add(newPart);
  newPart.id = id;
  await queueOutboxOperation('spare_parts', 'insert', newPart);
  return newPart;
}

/**
 * Update spare part
 */
export async function updateSparePart(
  id: number,
  data: Partial<SparePart>
): Promise<void> {
  await db.spareParts.update(id, { ...data, updated_at: new Date().toISOString() });
  const updated = await db.spareParts.get(id);
  if (updated) {
    await queueOutboxOperation('spare_parts', 'update', updated);
  }
}

/**
 * Delete spare part
 */
export async function deleteSparePart(id: number): Promise<void> {
  const part = await db.spareParts.get(id);
  await db.spareParts.delete(id);
  if (part?.uuid) {
    await queueOutboxOperation('spare_parts', 'delete', {
      uuid: part.uuid,
      deleted_at: new Date().toISOString(),
    });
  }
}

/**
 * Add a spare part from stock into a repair order
 */
export async function addPartToRepair(
  repairId: number,
  partId: number,
  quantityToUse: number = 1
): Promise<void> {
  await db.transaction('rw', [db.repairs, db.spareParts, db.outbox], async () => {
    const repair = await db.repairs.get(repairId);
    if (!repair) throw new Error('Dossier de réparation introuvable');

    const part = await db.spareParts.get(partId);
    if (!part) throw new Error('Pièce de rechange introuvable');

    if (part.quantity < quantityToUse) {
      throw new Error(`Stock insuffisant pour cette pièce (disponible: ${part.quantity})`);
    }

    const now = new Date().toISOString();
    await db.spareParts.update(partId, {
      quantity: part.quantity - quantityToUse,
      updated_at: now,
    });

    const usedItem: UsedSparePart = {
      partId: part.id!,
      partUuid: part.uuid,
      name: part.name,
      brand: part.compatibleBrand,
      model: part.compatibleModel,
      quality: part.quality,
      purchasePrice: part.purchasePrice,
      sellingPrice: part.sellingPrice,
      quantity: quantityToUse,
      dateAdded: now,
    };

    const currentUsed = repair.usedParts || [];
    const updatedUsed = [...currentUsed, usedItem];

    const totalPartsCost = updatedUsed.reduce(
      (sum, p) => sum + p.purchasePrice * p.quantity,
      0
    );
    const netProfit = repair.agreedPrice - totalPartsCost;
    const commRate = Number(repair.technicianCommissionRate) || 0;
    const commAmount =
      commRate > 0 ? Math.round(Math.max(0, netProfit) * (commRate / 100) * 100) / 100 : 0;

    await db.repairs.update(repairId, {
      usedParts: updatedUsed,
      totalPartsCost,
      netProfit,
      technicianCommissionAmount: commAmount,
      updatedAt: now,
      updated_at: now,
    });

    const updatedRepair = await db.repairs.get(repairId);
    if (updatedRepair) {
      await queueOutboxOperation('repairs', 'update', updatedRepair);
    }
  });
}

/**
 * Remove a used part from a repair order and return it back to stock
 */
export async function removePartFromRepair(
  repairId: number,
  partIndex: number
): Promise<void> {
  await db.transaction('rw', [db.repairs, db.spareParts, db.outbox], async () => {
    const repair = await db.repairs.get(repairId);
    if (!repair || !repair.usedParts || !repair.usedParts[partIndex]) {
      throw new Error('Pièce utilisée introuvable dans ce dossier');
    }

    const now = new Date().toISOString();
    const itemToRemove = repair.usedParts[partIndex];

    const partInDb = await db.spareParts.get(itemToRemove.partId);
    if (partInDb) {
      await db.spareParts.update(itemToRemove.partId, {
        quantity: partInDb.quantity + itemToRemove.quantity,
        updated_at: now,
      });
    }

    const updatedUsed = repair.usedParts.filter((_, idx) => idx !== partIndex);
    const totalPartsCost = updatedUsed.reduce(
      (sum, p) => sum + p.purchasePrice * p.quantity,
      0
    );
    const netProfit = repair.agreedPrice - totalPartsCost;
    const commRate = Number(repair.technicianCommissionRate) || 0;
    const commAmount =
      commRate > 0 ? Math.round(Math.max(0, netProfit) * (commRate / 100) * 100) / 100 : 0;

    await db.repairs.update(repairId, {
      usedParts: updatedUsed,
      totalPartsCost,
      netProfit,
      technicianCommissionAmount: commAmount,
      updatedAt: now,
      updated_at: now,
    });

    const updatedRepair = await db.repairs.get(repairId);
    if (updatedRepair) {
      await queueOutboxOperation('repairs', 'update', updatedRepair);
    }
  });
}

/**
 * Create a new expense entry
 */
export async function createExpense(
  data: Omit<Expense, 'id' | 'createdAt'>
): Promise<Expense> {
  const newExpense: Expense = withSyncMetadata({
    ...data,
    date: data.date || getMoroccoDateString(),
    createdAt: new Date().toISOString(),
  });
  const id = await db.expenses.add(newExpense);
  newExpense.id = id;
  await queueOutboxOperation('expenses', 'insert', newExpense);
  return newExpense;
}

/**
 * Update an existing expense
 */
export async function updateExpense(
  id: number,
  data: Partial<Expense>
): Promise<void> {
  await db.expenses.update(id, { ...data, updated_at: new Date().toISOString() });
  const updated = await db.expenses.get(id);
  if (updated) {
    await queueOutboxOperation('expenses', 'update', updated);
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(id: number): Promise<void> {
  const exp = await db.expenses.get(id);
  await db.expenses.delete(id);
  if (exp?.uuid) {
    await queueOutboxOperation('expenses', 'delete', {
      uuid: exp.uuid,
      deleted_at: new Date().toISOString(),
    });
  }
}

/**
 * Create a recurring monthly expense template
 */
export async function createRecurringExpense(
  data: Omit<RecurringExpense, 'id' | 'createdAt'>
): Promise<RecurringExpense> {
  const newRecurring: RecurringExpense = withSyncMetadata({
    ...data,
    createdAt: new Date().toISOString(),
  });
  const id = await db.recurringExpenses.add(newRecurring);
  newRecurring.id = id;
  await queueOutboxOperation('recurring_expenses', 'insert', newRecurring);
  await processRecurringExpenses();
  return newRecurring;
}

/**
 * Update recurring expense template
 */
export async function updateRecurringExpense(
  id: number,
  data: Partial<RecurringExpense>
): Promise<void> {
  await db.recurringExpenses.update(id, { ...data, updated_at: new Date().toISOString() });
  const updated = await db.recurringExpenses.get(id);
  if (updated) {
    await queueOutboxOperation('recurring_expenses', 'update', updated);
  }
}

/**
 * Delete recurring expense template
 */
export async function deleteRecurringExpense(id: number): Promise<void> {
  const rec = await db.recurringExpenses.get(id);
  await db.recurringExpenses.delete(id);
  if (rec?.uuid) {
    await queueOutboxOperation('recurring_expenses', 'delete', {
      uuid: rec.uuid,
      deleted_at: new Date().toISOString(),
    });
  }
}

/**
 * Process active recurring expenses using Morocco local year-month (Partie 1 #6)
 */
export async function processRecurringExpenses(): Promise<number> {
  const now = new Date();
  const currentYearMonth = getMoroccoYearMonth(now);

  let generatedCount = 0;

  try {
    const recurringList = await db.recurringExpenses.toArray();
    for (const r of recurringList) {
      if (!r.isActive || !r.id || r.deleted_at) continue;

      if (r.lastGeneratedMonth !== currentYearMonth) {
        const targetDay = Math.min(Math.max(1, r.dayOfMonth || 1), 28);
        const expenseDate = `${currentYearMonth}-${String(targetDay).padStart(2, '0')}`;

        const existing = await db.expenses
          .filter(
            (e) =>
              e.recurringExpenseId === r.id &&
              e.date.startsWith(currentYearMonth) &&
              !e.deleted_at
          )
          .first();

        if (!existing) {
          const newExp = withSyncMetadata<Expense>({
            title: r.title,
            amount: r.amount,
            category: r.category,
            date: expenseDate,
            note: r.note ? `${r.note} (شهري تلقائي)` : 'مصروف شهري متكرر تلقائي',
            isRecurring: true,
            recurringExpenseId: r.id,
            recurringExpenseUuid: r.uuid,
            createdAt: now.toISOString(),
          });
          await db.expenses.add(newExp);
          await queueOutboxOperation('expenses', 'insert', newExp);
          generatedCount++;
        }

        await db.recurringExpenses.update(r.id, {
          lastGeneratedMonth: currentYearMonth,
          updated_at: now.toISOString(),
        });
      }
    }
  } catch (err) {
    console.error('Error processing recurring expenses:', err);
  }

  return generatedCount;
}

/**
 * Add custom expense category
 */
export async function addCustomExpenseCategory(key: string, name: string): Promise<void> {
  const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
  await db.customExpenseCategories.put({
    key: cleanKey,
    name: name.trim(),
    uuid: generateUUID(),
    updated_at: new Date().toISOString(),
  });
}

/**
 * Get all custom expense categories
 */
export async function getCustomExpenseCategories(): Promise<{ key: string; name: string }[]> {
  try {
    return await db.customExpenseCategories.toArray();
  } catch {
    return [];
  }
}

/**
 * Daily Cash Closure ("Clôture de caisse journalière" - Partie 3 #4)
 */
export async function saveDailyCashClosure(
  data: Omit<CashClosure, 'id' | 'createdAt' | 'closedBy'>
): Promise<CashClosure> {
  const { name } = getCurrentUserContext();
  const now = new Date().toISOString();
  const existing = await db.cashClosures.where('date').equals(data.date).first();

  const closure: CashClosure = withSyncMetadata({
    ...data,
    id: existing?.id,
    uuid: existing?.uuid || generateUUID(),
    closedBy: name,
    createdAt: existing?.createdAt || now,
  });

  const id = await db.cashClosures.put(closure);
  closure.id = id;
  await queueOutboxOperation('cash_closures', existing ? 'update' : 'insert', closure);

  await logShopActivity({
    action: 'cash_closure',
    entityType: 'cash_closure',
    entityId: data.date,
    details: `Clôture de caisse du ${data.date} - Attendu: ${data.netExpectedCash} DH, Compté: ${data.countedCash} DH, Écart: ${data.discrepancy} DH`,
  });

  return closure;
}

/**
 * Reset database when explicitly called
 */
export async function seedDemoData(): Promise<void> {
  await clearAllData();
}

/**
 * Initialize DB on first launch (Partie 1 #1):
 * NEVER calls clearAllData() automatically! Preserves all existing user data.
 */
export async function initializeDatabaseIfNeeded(): Promise<void> {
  await getStoreSettings();
  await processRecurringExpenses();
}

