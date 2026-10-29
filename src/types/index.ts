export type ProductCategory = 'phone' | 'accessory' | 'tv' | 'trotinette' | 'other';

export type IMEIStatus = 'in_stock' | 'sold' | 'returned';

export type UserRole = 'owner' | 'manager' | 'cashier' | 'technician' | 'employee';

export type SubscriptionStatus = 'trial' | 'active' | 'expired';

export interface ShopMember {
  id: string;
  shop_id: string;
  full_name: string;
  phone?: string; // WhatsApp phone number for login
  email?: string;
  role: UserRole;
  pin_code?: string; // Password / PIN code for login
  active: boolean;
  created_at: string;
}

export type ApprovalActionType =
  | 'edit_product'
  | 'delete_product'
  | 'edit_spare_part'
  | 'delete_spare_part'
  | 'edit_repair_price'
  | 'delete_repair'
  | 'delete_sale'
  | 'return_sale_item';

export interface AdminApprovalRequest {
  id: string;
  actionType: ApprovalActionType;
  title: string;
  description: string;
  requestedBy: string;
  requestedByPhone?: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  targetId?: number;
  payload?: any;
}

export interface BaseSyncEntity {
  uuid?: string;
  shop_id?: string;
  created_by_user_id?: string;
  created_by_name?: string;
  updated_at?: string;
  deleted_at?: string | null;
  device_id?: string;
}

export interface IMEIItem {
  imei: string;
  status: IMEIStatus;
  soldAt?: string;
  bonNumber?: string;
  condition?: 'new' | 'used_excellent' | 'used_good' | 'used_fair';
}

export type PhoneCondition = 'new' | 'used_excellent' | 'used_good' | 'used_fair';

export interface Product extends BaseSyncEntity {
  id?: number;
  name: string;
  category: ProductCategory;
  image?: string; // base64, compressed <= 400px
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  quantity: number;
  minAlertQty?: number; // Configurable low stock threshold (default 5)
  supplierId?: number;
  supplierUuid?: string;
  imeiList: IMEIItem[];
  barcode?: string;
  createdAt: string;
  notes?: string;
  // Used phone trade-in metadata (Partie 3 #5)
  isTradeIn?: boolean;
  condition?: PhoneCondition;
  batteryHealth?: number; // Battery percentage e.g. 88, 100
  tradeInCustomerName?: string;
  tradeInCustomerPhone?: string;
  tradeInCustomerCIN?: string;
  tradeInCinImage?: string; // base64 compressed CIN photo for Contrat de Reprise
  appliedMovementUuids?: string[];
}

export interface PosBundleItem {
  productId: number;
  productName: string;
  quantity: number;
}

export interface PosBundle {
  id: string;
  name: string;
  items: PosBundleItem[];
  bundlePrice: number;
  createdAt: string;
}

export interface Supplier extends BaseSyncEntity {
  id?: number;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  totalDebt: number; // What we owe to supplier
  paidAmount: number; // What we have paid
}

export interface SupplierPayment extends BaseSyncEntity {
  id?: number;
  supplierId: number;
  supplierUuid?: string;
  amount: number;
  date: string;
  note?: string;
}

export interface SupplierPurchaseItem {
  productId?: number;
  productName: string;
  category: ProductCategory;
  quantity: number;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  imeis?: string[];
  barcode?: string;
}

export interface SupplierPurchaseOrder extends BaseSyncEntity {
  id?: number;
  bonNumber: string; // e.g. BA-0001
  provisionalNumber?: string; // Preserved offline number (BA-L-xxxx) after cloud renumbering
  supplierId: number;
  supplierUuid?: string;
  supplierName: string;
  date: string; // YYYY-MM-DD
  items: SupplierPurchaseItem[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  notes?: string;
  createdAt: string;
}

export type CustomerType = 'wholesale' | 'retail';

export interface Customer extends BaseSyncEntity {
  id?: number;
  name: string;
  phone: string;
  CIN?: string;
  address?: string;
  customerType?: CustomerType; // 'wholesale' (Grossiste) or 'retail' (Détaillant)
  creditLimit?: number; // Optional credit ceiling in DH
  totalCredit: number; // Balance owed to shop
}

export interface Installment {
  id: string; // unique identifier
  amount: number;
  paidAmount?: number; // Tracks partial payments on installment (Partie 1 #4)
  dueDate: string; // YYYY-MM-DD
  paid: boolean;
  paidAt?: string;
  note?: string;
}

export type PaymentMethod = 'cash' | 'cheque' | 'transfer' | 'other';

export interface AppliedBonPayment {
  saleId?: number;
  saleUuid?: string;
  bonNumber: string;
  amount: number;
}

export interface CustomerPayment extends BaseSyncEntity {
  id?: number;
  customerId: number;
  customerUuid?: string;
  saleId?: number; // if applied to a specific bon
  saleUuid?: string;
  bonNumber?: string;
  appliedBons?: AppliedBonPayment[];
  amount: number;
  date: string;
  note?: string;
  paymentMethod?: PaymentMethod;
  status?: 'active' | 'cancelled';
  cancellationReason?: string;
  cancelledAt?: string;
}

export type CreditAuditAction = 'create' | 'edit' | 'cancel';
export type CreditAuditEntity = 'payment' | 'due_date' | 'installment' | 'credit_limit';

export interface CreditAuditLog extends BaseSyncEntity {
  id?: number;
  customerId: number;
  customerUuid?: string;
  customerName: string;
  saleId?: number;
  saleUuid?: string;
  bonNumber?: string;
  entityType: CreditAuditEntity;
  action: CreditAuditAction;
  oldValue: string;
  newValue: string;
  reason: string;
  date: string; // ISO date-time string
}

export type PriceType = 'retail' | 'wholesale';
export type PaymentType = 'cash' | 'credit' | 'installment';
export type SaleStatus = 'active' | 'returned' | 'partially_returned';
export type SaleKind = 'product' | 'repair_deposit' | 'repair_delivery';

export interface SaleItem {
  productId: number;
  productUuid?: string;
  name: string;
  category: ProductCategory;
  imei?: string;
  quantity: number;
  price: number; // Actual sold unit price (customizable per sale)
  originalPrice?: number; // Catalog retail or wholesale price
  costPrice: number;
  type: PriceType;
  isReturned?: boolean;
}

export interface SaleReturnEntry {
  date: string; // YYYY-MM-DD (todayMA())
  itemIndex: number;
  amount: number; // Net item amount (price * qty - proportional discount)
  costAmount?: number; // Item cost (costPrice * qty)
  refundedCash: number; // Cash refunded on return date
  debtReduction: number; // Customer credit reduced on return date
  notes?: string;
}

export interface Sale extends BaseSyncEntity {
  id?: number;
  bonNumber: string; // Format: G-0001 (or G-L-<dev4>-0001 offline, or REP-xxxx for repair cashflow)
  provisionalNumber?: string; // Preserved offline number (G-L-xxxx) after cloud renumbering
  customerId?: number;
  customerUuid?: string;
  customerName: string;
  customerPhone?: string;
  items: SaleItem[];
  subtotal?: number; // Total items before discount
  discountAmount?: number; // Total discount amount in DH
  discountType?: 'fixed' | 'percent';
  discountValue?: number; // Raw entered discount value (DH or %)
  originalTotalAmount?: number; // Initial net total at sale creation (preserved across returns)
  totalAmount: number; // Final total at sale creation (not mutated on returns per R1)
  paidAmount: number;
  remainingAmount: number;
  returns?: SaleReturnEntry[]; // Recorded returns on this bon (R1)
  paymentType: PaymentType;
  paymentMethod?: PaymentMethod; // cash, cheque, transfer
  dueDate?: string; // Optional payment due date (YYYY-MM-DD)
  installments?: Installment[]; // Optional manual/automatic installments schedule
  hasWarranty?: boolean; // Whether warranty was selected for this sale
  warrantyMonths: number; // 0 if no warranty, or >= 1
  date: string;
  createdAt?: string;
  notes?: string;
  status: SaleStatus;
  saleKind?: SaleKind; // Distinguishes normal product sale vs repair deposit/delivery cash entry
  repairId?: number;
  repairUuid?: string;
}

export type WarrantyStatus = 'active' | 'expired' | 'void';

export interface Warranty extends BaseSyncEntity {
  id?: number;
  saleId: number;
  saleUuid?: string;
  bonNumber: string;
  provisionalNumber?: string;
  productId: number;
  productUuid?: string;
  productName: string;
  imei?: string;
  customerName: string;
  customerPhone?: string;
  startDate: string;
  endDate: string;
  status: WarrantyStatus;
}

export type SavTicketStatus = 'open' | 'in_progress' | 'resolved';

export interface SavTicket extends BaseSyncEntity {
  id?: number;
  warrantyId?: number;
  warrantyUuid?: string;
  bonNumber?: string;
  imei?: string;
  customerName: string;
  customerPhone?: string;
  productName?: string;
  issue: string;
  status: SavTicketStatus;
  createdAt: string;
  resolvedAt?: string;
  cost?: number;
  resolutionNotes?: string;
}

export interface WhatsAppTemplates {
  repairReady?: string;
  creditReminder?: string;
  saleReceipt?: string;
}

export type ReceiptPaperWidth = '58mm' | '80mm' | 'A4';

export type PlanTier = 'standard' | 'pro';
export type SubscriptionType = 'lifetime' | 'annual' | 'monthly' | 'trial';
export type PlanFeatureKey =
  | 'repairs'
  | 'spare_parts'
  | 'repair_qr'
  | 'tech_commission'
  | 'reprise_contract'
  | 'pos_bundles'
  | 'whatsapp_reports'
  | 'multi_employee'
  | 'advanced_reports'
  | 'expenses';

export interface PlanFeatureOverrides {
  repairs?: boolean;
  spare_parts?: boolean;
  repair_qr?: boolean;
  tech_commission?: boolean;
  reprise_contract?: boolean;
  pos_bundles?: boolean;
  whatsapp_reports?: boolean;
  multi_employee?: boolean;
  advanced_reports?: boolean;
  expenses?: boolean;
}

export interface StoreSettings {
  shopId?: string;
  planTier?: PlanTier; // 'standard' | 'pro'
  subscriptionType?: SubscriptionType; // 'lifetime' | 'annual' | 'trial'
  subscriptionStatus?: SubscriptionStatus; // 'trial' | 'active' | 'expired'
  subscriptionEndsAt?: string; // YYYY-MM-DD
  planName?: string;
  licenseKey?: string;
  resellerWhatsApp?: string; // Phone number of the developer / reseller
  masterPin?: string; // Secret PIN for Developer Master Control Panel (default 7788)
  featureOverrides?: PlanFeatureOverrides;
  shopMembers?: ShopMember[];
  adminName?: string;
  adminPhone?: string; // Admin WhatsApp phone number for login & password recovery
  pinCode?: string; // 4+ digit secret PIN protecting the phone account across all devices
  whatsappGatewayUrl?: string; // Optional webhook/CallMeBot URL for background WhatsApp OTP
  metaPhoneNumberId?: string; // Meta WhatsApp Cloud API Phone Number ID
  metaAccessToken?: string; // Meta WhatsApp Cloud API Permanent/System Access Token
  metaTemplateName?: string; // Meta WhatsApp Cloud API OTP Template Name (optional)
  metaTemplateLang?: string; // Meta WhatsApp Cloud API Template Language (e.g. 'ar', 'fr', 'en_US')
  pendingApprovals?: AdminApprovalRequest[];
  storeName: string;
  storeSubtitle?: string;
  logo?: string;
  address: string;
  phone: string;
  ice?: string; // Identifiant Commun de l'Entreprise
  rc?: string;
  defaultWarrantyMonths: number;
  receiptPaperWidth?: ReceiptPaperWidth; // '58mm' | '80mm' | 'A4'
  language: 'ar' | 'fr';
  theme: 'dark' | 'light';
  lastBackupDate?: string;
  autoLockMinutes?: number;
  whatsappTemplates?: WhatsAppTemplates;
  cloudMigratedAt?: string;
  employeeEmail?: string;
  employeeActive?: boolean;
}

export type PartQuality = 'original' | 'oem' | 'copy';

export interface SparePart extends BaseSyncEntity {
  id?: number;
  name: string; // e.g. Ecran OLED, Batterie, Connecteur, Camera...
  compatibleBrand: string; // e.g. Samsung, Apple, Xiaomi, Oppo...
  compatibleModel: string; // e.g. Galaxy A14, iPhone 11, Redmi Note 12...
  quality: PartQuality; // 'original' | 'oem' | 'copy'
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  supplierId?: number;
  supplierUuid?: string;
  supplierName?: string;
  minAlertQty: number; // default e.g. 2
  notes?: string;
  createdAt: string;
}

export interface UsedSparePart {
  partId: number;
  partUuid?: string;
  name: string;
  brand: string;
  model: string;
  quality: PartQuality;
  purchasePrice: number; // cost to shop
  sellingPrice: number; // price billed
  quantity: number;
  dateAdded: string;
}

export type RepairStatus = 'pending' | 'in_progress' | 'waiting_parts' | 'ready' | 'delivered' | 'cancelled';

export interface RepairOrder extends BaseSyncEntity {
  id?: number;
  repairNumber: string; // e.g. R-0001
  provisionalNumber?: string; // Preserved offline number (R-L-xxxx) after cloud renumbering
  customerName: string;
  customerPhone: string;
  brand: string;
  model: string;
  imei?: string;
  issue: string;
  conditionNotes?: string;
  lockCode?: string; // Stored AES-GCM encrypted in DB
  agreedPrice: number;
  depositAmount: number;
  remainingAmount: number;
  intakeDate: string; // YYYY-MM-DD
  expectedDeliveryDate?: string; // YYYY-MM-DD
  actualDeliveryDate?: string; // YYYY-MM-DD
  status: RepairStatus;
  technicianName?: string; // Assigned repair technician (المعلم)
  technicianCommissionRate?: number; // Commission % on net labor profit (e.g. 30, 50)
  technicianCommissionAmount?: number; // Calculated commission in DH
  technicianNotes?: string;
  usedParts?: UsedSparePart[];
  totalPartsCost?: number; // Sum of used parts cost
  netProfit?: number; // agreedPrice - totalPartsCost
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | 'rent'
  | 'electricity'
  | 'water'
  | 'internet'
  | 'salary'
  | 'goods'
  | 'other'
  | string;

export interface Expense extends BaseSyncEntity {
  id?: number;
  title?: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // YYYY-MM-DD
  note?: string;
  isRecurring?: boolean;
  recurringExpenseId?: number;
  recurringExpenseUuid?: string;
  createdAt: string;
}

export interface RecurringExpense extends BaseSyncEntity {
  id?: number;
  title: string;
  amount: number;
  category: ExpenseCategory;
  dayOfMonth: number; // 1 to 31
  note?: string;
  isActive: boolean;
  lastGeneratedMonth?: string; // YYYY-MM
  createdAt: string;
}

/**
 * Sync Outbox & Conflict Records (Partie 2 #3)
 */
export interface SyncOutboxItem {
  id?: number;
  uuid: string; // Target entity UUID
  table: string;
  operation: 'insert' | 'update' | 'delete';
  payload: any;
  created_at: string;
  attempts: number;
  lastError?: string;
}

export interface SyncConflictItem {
  id?: number;
  entityTable: string;
  entityUuid: string;
  localRecord: any;
  remoteRecord: any;
  detectedAt: string;
  resolved: boolean;
}

/**
 * Activity Log (Partie 3 #2)
 */
export interface ActivityLogEntry extends BaseSyncEntity {
  id?: number;
  userRole: UserRole;
  userName: string;
  action: 'sale' | 'return' | 'payment' | 'payment_edit' | 'payment_cancel' | 'delete' | 'stock_adjustment' | 'purchase_order' | 'trade_in' | 'cash_closure' | 'repair';
  entityType: string;
  entityId?: string;
  details: string;
  createdAt: string;
}

/**
 * Stock Movement & Physical Inventory Count (Partie 3 #8)
 */
export type StockMovementType = 'in' | 'out' | 'adjustment' | 'purchase' | 'trade_in' | 'return';

export interface StockMovement extends BaseSyncEntity {
  id?: number;
  productId: number;
  productUuid?: string;
  productName: string;
  type: StockMovementType;
  quantityDelta: number; // positive or negative
  previousQty: number;
  newQty: number;
  reason: string;
  userName: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

/**
 * Daily Cash Closure (Partie 3 #4)
 */
export interface CashClosure extends BaseSyncEntity {
  id?: number;
  date: string; // YYYY-MM-DD
  expectedCash: number;
  expectedCheque: number;
  expectedTransfer: number;
  totalExpenses: number;
  netExpectedCash: number; // expectedCash - totalExpenses
  countedCash: number;
  discrepancy: number; // countedCash - netExpectedCash
  notes?: string;
  closedBy: string;
  createdAt: string;
}

export type AppTab =
  | 'dashboard'
  | 'stock'
  | 'spare-parts'
  | 'pos'
  | 'bons'
  | 'repairs'
  | 'expenses'
  | 'warranty'
  | 'customers'
  | 'suppliers'
  | 'reports'
  | 'activity'
  | 'settings';
