import { UserRole, AppTab } from '../types';

export type Permission =
  | 'view_cost_price'
  | 'view_profits'
  | 'view_financial_dashboard'
  | 'edit_records'
  | 'manage_settings'
  | 'delete_records'
  | 'cancel_payments'
  | 'manage_backups'
  | 'manage_users'
  | 'manage_expenses'
  | 'manage_suppliers'
  | 'view_reports'
  | 'view_activity_logs'
  | 'make_sales'
  | 'manage_stock'
  | 'manage_repairs'
  | 'manage_customers'
  | 'manage_payments';

const ADMIN_PERMISSIONS: Permission[] = [
  'view_cost_price',
  'view_profits',
  'view_financial_dashboard',
  'edit_records',
  'manage_settings',
  'delete_records',
  'cancel_payments',
  'manage_backups',
  'manage_users',
  'manage_expenses',
  'manage_suppliers',
  'view_reports',
  'view_activity_logs',
  'make_sales',
  'manage_stock',
  'manage_repairs',
  'manage_customers',
  'manage_payments',
];

// العامل (Employee): كيشوف غير الخدمة والستوك (زيد ونقص) وما كيشوفش الجهة المالية وما يقدرش يعدل أو يمسح بلا موافقة الأدمين
const WORKER_PERMISSIONS: Permission[] = [
  'make_sales',
  'manage_stock',
  'manage_repairs',
  'manage_customers',
  'manage_payments',
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: ADMIN_PERMISSIONS,
  employee: WORKER_PERMISSIONS,
  manager: WORKER_PERMISSIONS,
  cashier: WORKER_PERMISSIONS,
  technician: WORKER_PERMISSIONS,
};

const ADMIN_ALLOWED_TABS: AppTab[] = [
  'dashboard',
  'pos',
  'stock',
  'spare-parts',
  'repairs',
  'expenses',
  'reports',
  'activity',
  'bons',
  'customers',
  'suppliers',
  'warranty',
  'settings',
];

// العامل (Employee): كيدخل غير لأقسام الخدمة والستوك بدون لوحة القيادة المالية أو التقارير أو المصاريف أو الإعدادات
const WORKER_ALLOWED_TABS: AppTab[] = [
  'pos',
  'stock',
  'spare-parts',
  'repairs',
  'bons',
  'customers',
  'warranty',
];

const ROLE_ALLOWED_TABS: Record<UserRole, AppTab[]> = {
  owner: ADMIN_ALLOWED_TABS,
  employee: WORKER_ALLOWED_TABS,
  manager: WORKER_ALLOWED_TABS,
  cashier: WORKER_ALLOWED_TABS,
  technician: WORKER_ALLOWED_TABS,
};

export function normalizeRole(role: UserRole | undefined): 'owner' | 'employee' {
  if (!role) return 'owner';
  if (role === 'owner') return 'owner';
  return 'employee';
}

export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  const effectiveRole = normalizeRole(role);
  const allowed = ROLE_PERMISSIONS[effectiveRole] || ROLE_PERMISSIONS.owner;
  return allowed.includes(permission);
}

export function isOwnerRole(role: UserRole | undefined): boolean {
  return normalizeRole(role) === 'owner';
}

export function canAccessTab(role: UserRole | undefined, tab: AppTab): boolean {
  const effectiveRole = normalizeRole(role);
  const allowedTabs = ROLE_ALLOWED_TABS[effectiveRole] || ROLE_ALLOWED_TABS.owner;
  return allowedTabs.includes(tab);
}

export function getDefaultTabForRole(role: UserRole | undefined): AppTab {
  const effectiveRole = normalizeRole(role);
  if (effectiveRole === 'employee') return 'pos';
  return 'dashboard';
}

export function getRoleLabel(role: UserRole | undefined, lang: 'ar' | 'fr' = 'ar'): string {
  const r = normalizeRole(role);
  if (lang === 'ar') {
    return r === 'owner' ? 'الأدمين (المدير)' : 'العامل (الموظف)';
  } else {
    return r === 'owner' ? 'Admin (Propriétaire)' : 'Employé (Opérateur)';
  }
}

