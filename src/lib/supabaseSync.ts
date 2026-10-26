import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  db,
  getDeviceId,
  getCurrentUserContext,
  generateProvisionalNumber,
  reserveNumber as dbReserveNumber,
  withSyncMetadata,
} from '../db';
import { UserRole } from '../types';

export { dbReserveNumber as reserveNumber };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

export type SyncStatusState = 'synced' | 'pending' | 'offline' | 'error' | 'unconfigured';

export interface SyncStatusSnapshot {
  status: SyncStatusState;
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  isSyncing: boolean;
}

const LAST_SYNC_STORAGE_KEY = 'golden_shop_last_sync_at';

/**
 * S1 & N2: Owner-only tables that employees must NEVER push or pull.
 * Note: cash_closures is allowed for employees because employees can close the daily cash register.
 */
const OWNER_ONLY_TABLES = new Set<string>([
  'expenses',
  'recurring_expenses',
  'suppliers',
  'supplier_payments',
  'supplier_purchase_orders',
]);

/**
 * N2: Settings keys that are strictly local to the device and must NEVER be pushed or pulled.
 */
export function isLocalOnlySettingKey(key?: string): boolean {
  if (!key) return false;
  return (
    key === 'access_security_state' ||
    key.startsWith('seq_') ||
    key.startsWith('lastBackup')
  );
}

/**
 * D4: Insert-only tables (never overwritten by remote pull if uuid already exists locally).
 */
const INSERT_ONLY_TABLES = new Set<string>([
  'sales',
  'customer_payments',
  'supplier_payments',
  'stock_movements',
  'credit_audit_logs',
  'activity_logs',
  'cash_closures',
]);

type SyncListener = (snapshot: SyncStatusSnapshot) => void;
const listeners = new Set<SyncListener>();

let currentSnapshot: SyncStatusSnapshot = {
  status: isSupabaseConfigured ? (navigator.onLine ? 'synced' : 'offline') : 'unconfigured',
  pendingCount: 0,
  conflictCount: 0,
  lastSyncedAt: localStorage.getItem(LAST_SYNC_STORAGE_KEY),
  lastError: null,
  isSyncing: false,
};

function notifyListeners() {
  for (const l of listeners) {
    l({ ...currentSnapshot });
  }
}

export function subscribeSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  refreshSyncCounts().then(() => listener({ ...currentSnapshot }));
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshSyncCounts(): Promise<void> {
  try {
    const { role } = getCurrentUserContext();
    const allOutbox = await db.outbox.toArray();
    const pendingCount =
      role === 'employee'
        ? allOutbox.filter((item) => !OWNER_ONLY_TABLES.has(item.table) && item.table !== 'settings').length
        : allOutbox.length;
    const conflictCount = await db.syncConflicts.filter((c) => !c.resolved).count();
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

    let nextStatus: SyncStatusState = currentSnapshot.status;
    if (!isSupabaseConfigured) {
      nextStatus = 'unconfigured';
    } else if (!online) {
      nextStatus = 'offline';
    } else if (currentSnapshot.lastError) {
      nextStatus = 'error';
    } else if (pendingCount > 0) {
      nextStatus = 'pending';
    } else {
      nextStatus = 'synced';
    }

    currentSnapshot = {
      ...currentSnapshot,
      status: nextStatus,
      pendingCount,
      conflictCount,
    };
    notifyListeners();
  } catch {}
}

/**
 * Map local Dexie table names to remote Supabase table names
 */
const TABLE_MAP: Record<string, { dexieTable: string; remoteTable: string }> = {
  settings: { dexieTable: 'settings', remoteTable: 'settings' },
  products: { dexieTable: 'products', remoteTable: 'products' },
  customers: { dexieTable: 'customers', remoteTable: 'customers' },
  sales: { dexieTable: 'sales', remoteTable: 'sales' },
  warranties: { dexieTable: 'warranties', remoteTable: 'warranties' },
  sav_tickets: { dexieTable: 'savTickets', remoteTable: 'sav_tickets' },
  repairs: { dexieTable: 'repairs', remoteTable: 'repairs' },
  spare_parts: { dexieTable: 'spareParts', remoteTable: 'spare_parts' },
  suppliers: { dexieTable: 'suppliers', remoteTable: 'suppliers' },
  supplier_payments: { dexieTable: 'supplierPayments', remoteTable: 'supplier_payments' },
  supplier_purchase_orders: {
    dexieTable: 'supplierPurchaseOrders',
    remoteTable: 'supplier_purchase_orders',
  },
  customer_payments: { dexieTable: 'customerPayments', remoteTable: 'customer_payments' },
  credit_audit_logs: { dexieTable: 'creditAuditLogs', remoteTable: 'credit_audit_logs' },
  expenses: { dexieTable: 'expenses', remoteTable: 'expenses' },
  recurring_expenses: { dexieTable: 'recurringExpenses', remoteTable: 'recurring_expenses' },
  stock_movements: { dexieTable: 'stockMovements', remoteTable: 'stock_movements' },
  cash_closures: { dexieTable: 'cashClosures', remoteTable: 'cash_closures' },
  activity_logs: { dexieTable: 'activityLogs', remoteTable: 'activity_logs' },
};

/**
 * S1: Return the list of table keys to synchronize depending on the active user's role.
 * Employees NEVER sync expenses, recurring_expenses, suppliers, supplier_payments, supplier_purchase_orders, or cash_closures.
 */
export function getSyncTableEntriesForRole(
  role: UserRole
): [string, { dexieTable: string; remoteTable: string }][] {
  return Object.entries(TABLE_MAP).filter(([tableKey]) => {
    if (role !== 'owner' && OWNER_ONLY_TABLES.has(tableKey)) {
      return false;
    }
    return true;
  });
}

/**
 * Formats a local Dexie record into the remote Supabase row format (with Multi-Tenant shop_id & creator audit)
 */
function toRemoteRow(remoteTable: string, payload: any): Record<string, any> {
  const { userId, name, shopId } = getCurrentUserContext();
  const base = {
    id: payload.uuid,
    uuid: payload.uuid,
    shop_id: payload.shop_id || shopId,
    created_by_user_id: payload.created_by_user_id || userId,
    created_by_name: payload.created_by_name || name,
    local_id: typeof payload.id === 'number' ? payload.id : null,
    payload,
    raw_data: payload,
    device_id: payload.device_id || getDeviceId(),
    updated_at: payload.updated_at || new Date().toISOString(),
    deleted_at: payload.deleted_at || null,
  };

  switch (remoteTable) {
    case 'settings':
      return {
        ...base,
        id: payload.uuid || '00000000-0000-4000-8000-000000000001',
        uuid: payload.uuid || '00000000-0000-4000-8000-000000000001',
        key: payload.key || 'store_settings',
        value: payload.value ?? payload,
      };
    case 'products':
      return {
        ...base,
        name: payload.name || '',
        category: payload.category || 'other',
        barcode: payload.barcode || null,
        quantity: payload.quantity ?? 0,
        min_alert_qty: payload.minAlertQty ?? 5,
        purchase_price: payload.purchasePrice ?? 0,
        retail_price: payload.retailPrice ?? 0,
        wholesale_price: payload.wholesalePrice ?? 0,
      };
    case 'customers':
      return {
        ...base,
        name: payload.name || '',
        phone: payload.phone || null,
        cin: payload.CIN || null,
        total_credit: payload.totalCredit ?? 0,
      };
    case 'sales':
      return {
        ...base,
        bon_number: payload.bonNumber || 'G-0001',
        provisional_number: payload.provisionalNumber || null,
        customer_uuid: payload.customerUuid || null,
        customer_name: payload.customerName || 'Client',
        date: payload.date || '',
        total_amount: payload.totalAmount ?? 0,
        paid_amount: payload.paidAmount ?? 0,
        remaining_amount: payload.remainingAmount ?? 0,
        status: payload.status || 'active',
        sale_kind: payload.saleKind || 'product',
      };
    case 'warranties':
      return {
        ...base,
        bon_number: payload.bonNumber || '',
        provisional_number: payload.provisionalNumber || null,
        imei: payload.imei || null,
        status: payload.status || 'active',
      };
    case 'sav_tickets':
      return {
        ...base,
        bon_number: payload.bonNumber || null,
        imei: payload.imei || null,
        status: payload.status || 'open',
      };
    case 'repairs':
      return {
        ...base,
        repair_number: payload.repairNumber || 'R-0001',
        provisional_number: payload.provisionalNumber || null,
        customer_name: payload.customerName || '',
        customer_phone: payload.customerPhone || null,
        status: payload.status || 'pending',
        agreed_price: payload.agreedPrice ?? 0,
        deposit_amount: payload.depositAmount ?? 0,
        remaining_amount: payload.remainingAmount ?? 0,
        total_parts_cost: payload.totalPartsCost ?? 0,
        net_profit: payload.netProfit ?? 0,
      };
    case 'spare_parts':
      return {
        ...base,
        name: payload.name || '',
        quantity: payload.quantity ?? 0,
        purchase_price: payload.purchasePrice ?? 0,
        selling_price: payload.sellingPrice ?? 0,
      };
    case 'suppliers':
      return {
        ...base,
        name: payload.name || '',
        phone: payload.phone || null,
        total_debt: payload.totalDebt ?? 0,
        paid_amount: payload.paidAmount ?? 0,
      };
    case 'supplier_payments':
      return {
        ...base,
        supplier_uuid: payload.supplierUuid || null,
        amount: payload.amount ?? 0,
        date: payload.date || '',
      };
    case 'supplier_purchase_orders':
      return {
        ...base,
        bon_number: payload.bonNumber || '',
        provisional_number: payload.provisionalNumber || null,
        supplier_uuid: payload.supplierUuid || null,
        total_amount: payload.totalAmount ?? 0,
      };
    case 'customer_payments':
      return {
        ...base,
        customer_uuid: payload.customerUuid || null,
        sale_uuid: payload.saleUuid || null,
        amount: payload.amount ?? 0,
        date: payload.date || '',
        status: payload.status || 'active',
      };
    case 'credit_audit_logs':
      return {
        ...base,
        customer_uuid: payload.customerUuid || null,
        action: payload.action || 'create',
      };
    case 'expenses':
      return {
        ...base,
        category: payload.category || 'other',
        amount: payload.amount ?? 0,
        date: payload.date || '',
      };
    case 'recurring_expenses':
      return {
        ...base,
        title: payload.title || '',
        amount: payload.amount ?? 0,
      };
    case 'stock_movements':
      return {
        ...base,
        product_uuid: payload.productUuid || null,
        type: payload.type || 'adjustment',
        quantity_delta: payload.quantityDelta ?? 0,
      };
    case 'cash_closures':
      return {
        ...base,
        date: payload.date || '',
        counted_cash: payload.countedCash ?? 0,
        discrepancy: payload.discrepancy ?? 0,
      };
    case 'activity_logs':
      return {
        ...base,
        action: payload.action || 'sale',
        entity_type: payload.entityType || 'sale',
      };
    default:
      return base;
  }
}

/**
 * Helper to replace a provisional number inside all pending outbox payloads
 * and preserve the old provisional number in provisionalNumber.
 */
async function propagateNumberInOutbox(oldNum: string, newNum: string): Promise<void> {
  const allOutbox = await db.outbox.toArray();
  for (const ob of allOutbox) {
    if (!ob.id || !ob.payload) continue;
    let changed = false;
    const p = { ...ob.payload };

    if (p.bonNumber === oldNum) {
      if (!p.provisionalNumber) p.provisionalNumber = oldNum;
      p.bonNumber = newNum;
      changed = true;
    }
    if (p.repairNumber === oldNum) {
      if (!p.provisionalNumber) p.provisionalNumber = oldNum;
      p.repairNumber = newNum;
      changed = true;
    }
    if (p.bonNumber === `REP-${oldNum}`) {
      if (!p.provisionalNumber) p.provisionalNumber = `REP-${oldNum}`;
      p.bonNumber = `REP-${newNum}`;
      changed = true;
    }
    if (p.bonNumber === `REP-DEP-${oldNum}`) {
      if (!p.provisionalNumber) p.provisionalNumber = `REP-DEP-${oldNum}`;
      p.bonNumber = `REP-DEP-${newNum}`;
      changed = true;
    }
    if (p.entityId === oldNum) {
      p.entityId = newNum;
      changed = true;
    }
    if (typeof p.reason === 'string' && p.reason.includes(oldNum)) {
      p.reason = p.reason.split(oldNum).join(newNum);
      changed = true;
    }
    if (typeof p.note === 'string' && p.note.includes(oldNum)) {
      p.note = p.note.split(oldNum).join(newNum);
      changed = true;
    }
    if (typeof p.notes === 'string' && p.notes.includes(oldNum)) {
      p.notes = p.notes.split(oldNum).join(newNum);
      changed = true;
    }
    if (typeof p.details === 'string' && p.details.includes(oldNum)) {
      p.details = p.details.split(oldNum).join(newNum);
      changed = true;
    }
    if (Array.isArray(p.appliedBons)) {
      let abChanged = false;
      p.appliedBons = p.appliedBons.map((ab: any) => {
        if (ab.bonNumber === oldNum) {
          abChanged = true;
          return { ...ab, bonNumber: newNum };
        }
        return ab;
      });
      if (abChanged) changed = true;
    }
    if (Array.isArray(p.imeiList)) {
      let imChanged = false;
      p.imeiList = p.imeiList.map((im: any) => {
        if (im.bonNumber === oldNum) {
          imChanged = true;
          return { ...im, bonNumber: newNum };
        }
        return im;
      });
      if (imChanged) changed = true;
    }

    if (changed) {
      await db.outbox.update(ob.id, { payload: p });
    }
  }
}

/**
 * N1 & N2: Renumber all provisional offline documents (G-L-*, R-L-*, BA-L-*) in createdAt order
 * via atomic Supabase RPCs, preserve the old number in provisionalNumber, and update every copy
 * of the number across all local tables (including derived REP-<repairNumber> / REP-DEP-<repairNumber> bons) and outbox.
 * Never reuses a number.
 */
export async function renumberProvisionalDocuments(role: UserRole): Promise<void> {
  if (!supabase) return;

  // 1. Renumber provisional Sales (G-L-*) in order of createdAt
  const provisionalSales = (await db.sales.toArray())
    .filter((s) => s.bonNumber?.startsWith('G-L-'))
    .sort((a, b) =>
      (a.createdAt || a.updated_at || a.date || '').localeCompare(
        b.createdAt || b.updated_at || b.date || ''
      )
    );

  for (const sale of provisionalSales) {
    const oldBon = sale.bonNumber;
    const { data: rpcBon, error } = await supabase.rpc('next_bon_number');
    if (error || !rpcBon || typeof rpcBon !== 'string') continue;
    const newBon = rpcBon.trim();

    if (sale.id) {
      await db.sales.update(sale.id, {
        bonNumber: newBon,
        provisionalNumber: sale.provisionalNumber || oldBon,
      });
    }

    // Update warranties.bonNumber and preserve provisionalNumber
    const warranties = await db.warranties.where('bonNumber').equals(oldBon).toArray();
    for (const w of warranties) {
      if (w.id) {
        await db.warranties.update(w.id, {
          bonNumber: newBon,
          provisionalNumber: w.provisionalNumber || oldBon,
        });
      }
    }

    // Update savTickets.bonNumber
    const tickets = await db.savTickets.where('bonNumber').equals(oldBon).toArray();
    for (const t of tickets) {
      if (t.id) await db.savTickets.update(t.id, { bonNumber: newBon });
    }

    // Update customerPayments.bonNumber, appliedBons, and note
    const allPayments = await db.customerPayments.toArray();
    for (const cp of allPayments) {
      if (!cp.id) continue;
      let cpChanged = false;
      const patch: Partial<typeof cp> = {};
      if (cp.bonNumber === oldBon) {
        patch.bonNumber = newBon;
        cpChanged = true;
      }
      if (typeof cp.note === 'string' && cp.note.includes(oldBon)) {
        patch.note = cp.note.split(oldBon).join(newBon);
        cpChanged = true;
      }
      if (Array.isArray(cp.appliedBons) && cp.appliedBons.some((ab) => ab.bonNumber === oldBon)) {
        patch.appliedBons = cp.appliedBons.map((ab) =>
          ab.bonNumber === oldBon ? { ...ab, bonNumber: newBon } : ab
        );
        cpChanged = true;
      }
      if (cpChanged) {
        await db.customerPayments.update(cp.id, patch);
      }
    }

    // Update creditAuditLogs
    const allAudits = await db.creditAuditLogs.toArray();
    for (const log of allAudits) {
      if (!log.id) continue;
      if (log.bonNumber === oldBon || (log.reason && log.reason.includes(oldBon))) {
        await db.creditAuditLogs.update(log.id, {
          bonNumber: log.bonNumber === oldBon ? newBon : log.bonNumber,
          reason: log.reason ? log.reason.split(oldBon).join(newBon) : log.reason,
        });
      }
    }

    // Update activityLogs
    const allActivities = await db.activityLogs.toArray();
    for (const act of allActivities) {
      if (!act.id) continue;
      if (act.entityId === oldBon || (act.details && act.details.includes(oldBon))) {
        await db.activityLogs.update(act.id, {
          entityId: act.entityId === oldBon ? newBon : act.entityId,
          details: act.details ? act.details.split(oldBon).join(newBon) : act.details,
        });
      }
    }

    // Update stockMovements.reason
    const allMovements = await db.stockMovements.toArray();
    for (const mov of allMovements) {
      if (!mov.id) continue;
      if (mov.reason && mov.reason.includes(oldBon)) {
        await db.stockMovements.update(mov.id, {
          reason: mov.reason.split(oldBon).join(newBon),
        });
      }
    }

    // Update products.imeiList.bonNumber
    const allProducts = await db.products.toArray();
    for (const prod of allProducts) {
      if (!prod.id || !Array.isArray(prod.imeiList)) continue;
      if (prod.imeiList.some((im) => im.bonNumber === oldBon)) {
        const updatedImeiList = prod.imeiList.map((im) =>
          im.bonNumber === oldBon ? { ...im, bonNumber: newBon } : im
        );
        await db.products.update(prod.id, { imeiList: updatedImeiList });
      }
    }

    // Update outbox payloads
    await propagateNumberInOutbox(oldBon, newBon);
  }

  // 2. Renumber provisional Repairs (R-L-*) in order of createdAt
  const provisionalRepairs = (await db.repairs.toArray())
    .filter((r) => r.repairNumber?.startsWith('R-L-'))
    .sort((a, b) =>
      (a.createdAt || a.updated_at || a.intakeDate || '').localeCompare(
        b.createdAt || b.updated_at || b.intakeDate || ''
      )
    );

  for (const rep of provisionalRepairs) {
    const oldRep = rep.repairNumber;
    const { data: rpcRep, error } = await supabase.rpc('next_repair_number');
    if (error || !rpcRep || typeof rpcRep !== 'string') continue;
    const newRep = rpcRep.trim();

    if (rep.id) {
      await db.repairs.update(rep.id, {
        repairNumber: newRep,
        provisionalNumber: rep.provisionalNumber || oldRep,
      });
    }

    // Update linked derived REP-<repairNumber> and REP-DEP-<repairNumber> sales
    const linkedSales = await db.sales
      .filter(
        (s) =>
          s.bonNumber === `REP-${oldRep}` ||
          s.bonNumber === `REP-DEP-${oldRep}` ||
          s.repairId === rep.id ||
          Boolean(rep.uuid && s.repairUuid === rep.uuid)
      )
      .toArray();
    for (const ls of linkedSales) {
      if (!ls.id) continue;
      const oldDerivedBon = ls.bonNumber;
      const updatedBon = ls.bonNumber.split(oldRep).join(newRep);
      const updatedNotes = ls.notes ? ls.notes.split(oldRep).join(newRep) : ls.notes;
      const updatedItems = Array.isArray(ls.items)
        ? ls.items.map((it) => ({
            ...it,
            name: it.name ? it.name.split(oldRep).join(newRep) : it.name,
          }))
        : ls.items;
      await db.sales.update(ls.id, {
        bonNumber: updatedBon,
        provisionalNumber: ls.provisionalNumber || oldDerivedBon,
        notes: updatedNotes,
        items: updatedItems,
      });
    }

    // Update activityLogs
    const allActivities = await db.activityLogs.toArray();
    for (const act of allActivities) {
      if (!act.id) continue;
      if (act.entityId === oldRep || (act.details && act.details.includes(oldRep))) {
        await db.activityLogs.update(act.id, {
          entityId: act.entityId === oldRep ? newBonOrRep(act.entityId, oldRep, newRep) : act.entityId,
          details: act.details ? act.details.split(oldRep).join(newRep) : act.details,
        });
      }
    }

    await propagateNumberInOutbox(oldRep, newRep);
  }

  // 3. Renumber provisional Purchase Orders (BA-L-*) in order of createdAt (Owner only)
  if (role === 'owner') {
    const provisionalPOs = (await db.supplierPurchaseOrders.toArray())
      .filter((po) => po.bonNumber?.startsWith('BA-L-'))
      .sort((a, b) =>
        (a.createdAt || a.updated_at || a.date || '').localeCompare(
          b.createdAt || b.updated_at || b.date || ''
        )
      );

    for (const po of provisionalPOs) {
      const oldPo = po.bonNumber;
      const { data: rpcPo, error } = await supabase.rpc('next_purchase_order_number');
      if (error || !rpcPo || typeof rpcPo !== 'string') continue;
      const newPo = rpcPo.trim();

      if (po.id) {
        await db.supplierPurchaseOrders.update(po.id, {
          bonNumber: newPo,
          provisionalNumber: po.provisionalNumber || oldPo,
        });
      }

      const allMovements = await db.stockMovements.toArray();
      for (const mov of allMovements) {
        if (mov.id && mov.reason && mov.reason.includes(oldPo)) {
          await db.stockMovements.update(mov.id, {
            reason: mov.reason.split(oldPo).join(newPo),
          });
        }
      }

      const allActivities = await db.activityLogs.toArray();
      for (const act of allActivities) {
        if (!act.id) continue;
        if (act.entityId === oldPo || (act.details && act.details.includes(oldPo))) {
          await db.activityLogs.update(act.id, {
            entityId: act.entityId === oldPo ? newPo : act.entityId,
            details: act.details ? act.details.split(oldPo).join(newPo) : act.details,
          });
        }
      }

      await propagateNumberInOutbox(oldPo, newPo);
    }
  }
}

function newBonOrRep(entityId: string | undefined, oldVal: string, newVal: string): string {
  if (!entityId) return newVal;
  return entityId.split(oldVal).join(newVal);
}

/**
 * D4: Recalculate customers.totalCredit and suppliers.totalDebt from local sales/payments/POs after pull.
 */
async function recalculateCustomerAndSupplierBalances(role: UserRole): Promise<void> {
  const allCustomers = await db.customers.toArray();
  const allSales = (await db.sales.toArray()).filter((s) => !s.deleted_at && s.status !== 'returned');
  const allCustomerPayments = (await db.customerPayments.toArray()).filter(
    (p) => !p.deleted_at && p.status !== 'cancelled'
  );

  for (const cust of allCustomers) {
    if (!cust.id || cust.deleted_at) continue;
    const custSales = allSales.filter(
      (s) => s.customerId === cust.id || (cust.uuid && s.customerUuid === cust.uuid)
    );
    const totalSalesDebt = custSales.reduce((acc, s) => {
      const baseTotal = s.originalTotalAmount ?? s.totalAmount ?? 0;
      const debtRed = (s.returns || []).reduce((rSum, r) => rSum + (Number(r.debtReduction) || 0), 0);
      return acc + Math.max(0, baseTotal - debtRed);
    }, 0);

    // Payments applied to this customer's bons
    const custPayments = allCustomerPayments.filter(
      (p) => p.customerId === cust.id || (cust.uuid && p.customerUuid === cust.uuid)
    );
    const totalPaid = custPayments.reduce((acc, p) => {
      if (Array.isArray(p.appliedBons) && p.appliedBons.length > 0) {
        return acc + p.appliedBons.reduce((s, ab) => s + (Number(ab.amount) || 0), 0);
      }
      return acc + (Number(p.amount) || 0);
    }, 0);

    const recomputedCredit = Math.max(0, Math.round((totalSalesDebt - totalPaid) * 100) / 100);
    if (Math.abs((cust.totalCredit || 0) - recomputedCredit) > 0.01) {
      await db.customers.update(cust.id, { totalCredit: recomputedCredit });
    }
  }

  if (role === 'owner') {
    const allSuppliers = await db.suppliers.toArray();
    const allPOs = (await db.supplierPurchaseOrders.toArray()).filter((po) => !po.deleted_at);
    const allSupplierPayments = (await db.supplierPayments.toArray()).filter((sp) => !sp.deleted_at);

    for (const sup of allSuppliers) {
      if (!sup.id || sup.deleted_at) continue;
      const supPOs = allPOs.filter(
        (po) => po.supplierId === sup.id || (sup.uuid && po.supplierUuid === sup.uuid)
      );
      if (supPOs.length > 0) {
        const recomputedDebt = supPOs.reduce((acc, po) => acc + (Number(po.totalAmount) || 0), 0);
        const supPayments = allSupplierPayments.filter(
          (sp) => sp.supplierId === sup.id || (sup.uuid && sp.supplierUuid === sup.uuid)
        );
        const recomputedPaid = supPayments.reduce((acc, sp) => acc + (Number(sp.amount) || 0), 0);
        await db.suppliers.update(sup.id, {
          totalDebt: Math.round(recomputedDebt * 100) / 100,
          paidAmount: Math.round(recomputedPaid * 100) / 100,
        });
      }
    }
  }
}

/**
 * Push local Outbox in batches + Pull incremental remote updates from Supabase
 */
export async function triggerCloudSync(): Promise<{ success: boolean; error?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    await refreshSyncCounts();
    return { success: false, error: 'Supabase non configuré' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await refreshSyncCounts();
    return { success: false, error: 'Mode hors-ligne' };
  }
  if (currentSnapshot.isSyncing) {
    return { success: true };
  }

  currentSnapshot = { ...currentSnapshot, isSyncing: true, lastError: null };
  notifyListeners();

  try {
    const { role } = getCurrentUserContext();

    // N1: Renumber provisional offline documents in order of createdAt and update all references before pushing
    await renumberProvisionalDocuments(role);

    // 1. Process Outbox in batches of 50 (filtered by role per S1)
    const pendingItems = await db.outbox.orderBy('id').limit(50).toArray();

    for (const item of pendingItems) {
      if (!item.id) continue;

      // S1: Employees never push owner-only tables or settings writes
      if (role === 'employee' && (OWNER_ONLY_TABLES.has(item.table) || item.table === 'settings')) {
        await db.outbox.delete(item.id);
        continue;
      }

      // N2: Never push local-only settings keys ('access_security_state', 'seq_*', 'lastBackup*')
      if (
        item.table === 'settings' &&
        isLocalOnlySettingKey(item.payload?.key)
      ) {
        await db.outbox.delete(item.id);
        continue;
      }

      const mapping = TABLE_MAP[item.table];
      if (!mapping) {
        await db.outbox.delete(item.id);
        continue;
      }

      const payload = { ...item.payload };

      if (item.operation === 'delete') {
        const { error } = await supabase
          .from(mapping.remoteTable)
          .update({
            deleted_at: payload.deleted_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.uuid);
        if (error) throw error;
      } else {
        const row = toRemoteRow(mapping.remoteTable, payload);
        const { error } = await supabase
          .from(mapping.remoteTable)
          .upsert(row, { onConflict: 'id' });
        if (error) throw error;
      }

      await db.outbox.delete(item.id);
    }

    // 2. Pull incremental remote changes since lastSyncAt (S1: role-filtered table list)
    const lastSyncAt = localStorage.getItem(LAST_SYNC_STORAGE_KEY) || '1970-01-01T00:00:00.000Z';
    const currentDeviceId = getDeviceId();
    const roleTables = getSyncTableEntriesForRole(role);

    for (const [tableKey, mapping] of roleTables) {
      const { data: rows, error } = await supabase
        .from(mapping.remoteTable)
        .select('*')
        .gt('updated_at', lastSyncAt)
        .order('updated_at', { ascending: true })
        .limit(200);

      if (error || !rows || rows.length === 0) continue;

      const dexieTable = (db as any)[mapping.dexieTable];
      if (!dexieTable) continue;

      for (const remoteRow of rows) {
        if (remoteRow.device_id === currentDeviceId) continue; // Ignore our own echo

        const remotePayload = { ...(remoteRow.payload || {}) };
        const entityUuid = remoteRow.id;

        if (tableKey === 'settings') {
          const settingKey = remoteRow.key || remotePayload.key || 'store_settings';
          // N2: Never pull local-only settings keys ('access_security_state', 'seq_*', 'lastBackup*')
          if (isLocalOnlySettingKey(settingKey)) {
            continue;
          }
          const settingVal = remoteRow.value ?? remotePayload.value ?? remotePayload;
          await db.settings.put({
            key: settingKey,
            value: settingVal,
            uuid: entityUuid,
            updated_at: remoteRow.updated_at,
          });
          continue;
        }

        const localMatch = await dexieTable.where('uuid').equals(entityUuid).first();

        if (remoteRow.deleted_at) {
          if (localMatch && localMatch.id) {
            await dexieTable.delete(localMatch.id);
          }
          continue;
        }

        // N1 Pull: Check for bonNumber / repairNumber collision with a DIFFERENT uuid
        if (
          (tableKey === 'sales' || tableKey === 'supplier_purchase_orders') &&
          remotePayload.bonNumber
        ) {
          const existingByBon = await dexieTable
            .where('bonNumber')
            .equals(remotePayload.bonNumber)
            .first();
          if (existingByBon && existingByBon.uuid !== entityUuid) {
            const provBon = await generateProvisionalNumber(
              tableKey === 'sales' ? 'bon' : 'po'
            );
            await db.syncConflicts.add({
              entityTable: tableKey,
              entityUuid,
              localRecord: existingByBon,
              remoteRecord: { ...remotePayload },
              detectedAt: new Date().toISOString(),
              resolved: false,
            });
            remotePayload.bonNumber = provBon;
          }
        } else if (tableKey === 'repairs' && remotePayload.repairNumber) {
          const existingByRep = await dexieTable
            .where('repairNumber')
            .equals(remotePayload.repairNumber)
            .first();
          if (existingByRep && existingByRep.uuid !== entityUuid) {
            const provRep = await generateProvisionalNumber('repair');
            await db.syncConflicts.add({
              entityTable: tableKey,
              entityUuid,
              localRecord: existingByRep,
              remoteRecord: { ...remotePayload },
              detectedAt: new Date().toISOString(),
              resolved: false,
            });
            remotePayload.repairNumber = provRep;
          }
        }

        if (!localMatch) {
          // Insert new record from remote
          const toInsert = {
            ...remotePayload,
            uuid: entityUuid,
            updated_at: remoteRow.updated_at,
          };
          delete toInsert.id; // Let Dexie assign local auto-increment id
          const insertedId = await dexieTable.add(toInsert);

          // D4: When a new remote stock_movement arrives, apply its delta to products.quantity once
          if (tableKey === 'stock_movements' && entityUuid) {
            const prodUuid = toInsert.productUuid || remoteRow.product_uuid;
            if (prodUuid) {
              const prod = await db.products.where('uuid').equals(prodUuid).first();
              if (prod && prod.id) {
                const applied = new Set<string>(prod.appliedMovementUuids || []);
                if (!applied.has(entityUuid)) {
                  applied.add(entityUuid);
                  const nextQty = Math.max(
                    0,
                    (Number(prod.quantity) || 0) + (Number(toInsert.quantityDelta) || 0)
                  );
                  await db.products.update(prod.id, {
                    quantity: nextQty,
                    appliedMovementUuids: Array.from(applied),
                  });
                }
              }
            }
          }
          void insertedId;
        } else {
          // D4: Insert-only tables are NEVER overwritten once present locally by uuid
          if (INSERT_ONLY_TABLES.has(tableKey)) {
            const hasLocalOutbox = await db.outbox.where('uuid').equals(entityUuid).count();
            if (hasLocalOutbox > 0) {
              await db.syncConflicts.add({
                entityTable: tableKey,
                entityUuid,
                localRecord: localMatch,
                remoteRecord: remotePayload,
                detectedAt: new Date().toISOString(),
                resolved: false,
              });
            }
            continue;
          }

          // D4: For mutable tables, never overwrite products.quantity or customers.totalCredit / suppliers.totalDebt
          const localTime = new Date(localMatch.updated_at || 0).getTime();
          const remoteTime = new Date(remoteRow.updated_at || 0).getTime();
          if (remoteTime >= localTime) {
            const mergedRecord: any = {
              ...localMatch,
              ...remotePayload,
              id: localMatch.id,
              uuid: entityUuid,
              updated_at: remoteRow.updated_at,
            };

            if (tableKey === 'products') {
              // Never overwrite local quantity from remote product snapshot; delta is applied via stock_movements
              mergedRecord.quantity = localMatch.quantity;
              mergedRecord.appliedMovementUuids = localMatch.appliedMovementUuids || [];
            } else if (tableKey === 'customers') {
              mergedRecord.totalCredit = localMatch.totalCredit;
            } else if (tableKey === 'suppliers') {
              mergedRecord.totalDebt = localMatch.totalDebt;
              mergedRecord.paidAmount = localMatch.paidAmount;
            }

            await dexieTable.put(mergedRecord);
          }
        }
      }
    }

    // D4: Recalculate customer totalCredit and supplier totalDebt from sales/payments after pull
    await recalculateCustomerAndSupplierBalances(role);

    const nowIso = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, nowIso);
    currentSnapshot = {
      ...currentSnapshot,
      lastSyncedAt: nowIso,
      lastError: null,
      isSyncing: false,
    };
    await refreshSyncCounts();
    return { success: true };
  } catch (err: any) {
    currentSnapshot = {
      ...currentSnapshot,
      status: 'error',
      lastError: err?.message || 'Erreur de synchronisation',
      isSyncing: false,
    };
    notifyListeners();
    return { success: false, error: currentSnapshot.lastError || 'Erreur' };
  }
}

/**
 * One-time migration of all local Dexie tables to Supabase ("Migrer vers le cloud" - Partie 2 #6)
 */
export async function migrateAllLocalDataToCloud(
  onProgress?: (percent: number, stepLabel: string) => void
): Promise<{ success: boolean; totalMigrated: number; error?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return {
      success: false,
      totalMigrated: 0,
      error: 'Veuillez configurer VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    // N2: Compute highest local sequential numbers (G-, R-, BA-) and advance cloud sequences first
    const allSales = await db.sales.toArray();
    let maxBon = 0;
    for (const s of allSales) {
      const m = /^G-(\d+)$/.exec(s.bonNumber || '');
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxBon) maxBon = num;
      }
    }

    const allRepairs = await db.repairs.toArray();
    let maxRepair = 0;
    for (const r of allRepairs) {
      const m = /^R-(\d+)$/.exec(r.repairNumber || '');
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxRepair) maxRepair = num;
      }
    }

    const allPOs = await db.supplierPurchaseOrders.toArray();
    let maxPo = 0;
    for (const po of allPOs) {
      const m = /^BA-(\d+)$/.exec(po.bonNumber || '');
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxPo) maxPo = num;
      }
    }

    await supabase.rpc('set_counters_if_greater', {
      p_bon: maxBon,
      p_repair: maxRepair,
      p_po: maxPo,
    });

    // Also renumber any provisional offline documents before migrating
    const { role } = getCurrentUserContext();
    await renumberProvisionalDocuments(role);

    const entries = Object.entries(TABLE_MAP);
    let totalMigrated = 0;

    for (let i = 0; i < entries.length; i++) {
      const [key, mapping] = entries[i];
      const pct = Math.round(((i + 1) / entries.length) * 100);
      if (onProgress) onProgress(pct, mapping.remoteTable);

      const dexieTable = (db as any)[mapping.dexieTable];
      if (!dexieTable) continue;

      const records = await dexieTable.toArray();
      if (!records.length) continue;

      const rowsToUpsert = [];
      for (const rec of records) {
        if (key === 'settings' && isLocalOnlySettingKey(rec.key)) {
          continue;
        }
        const synced = withSyncMetadata(rec);
        if (rec.id && !rec.uuid) {
          await dexieTable.put(synced);
        }
        rowsToUpsert.push(toRemoteRow(mapping.remoteTable, synced));
      }

      // Upsert in chunks of 50
      for (let c = 0; c < rowsToUpsert.length; c += 50) {
        const chunk = rowsToUpsert.slice(c, c + 50);
        const { error } = await supabase.from(mapping.remoteTable).upsert(chunk, { onConflict: 'id' });
        if (error) throw error;
        totalMigrated += chunk.length;
      }
    }

    // Clear outbox since everything is freshly uploaded
    await db.outbox.clear();
    const nowIso = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, nowIso);
    await refreshSyncCounts();

    return { success: true, totalMigrated };
  } catch (err: any) {
    return {
      success: false,
      totalMigrated: 0,
      error: err?.message || 'Erreur lors de la migration vers Supabase.',
    };
  }
}

/**
 * Alias for flushing offline outbox & syncing with Supabase Cloud
 */
export const flushSupabaseOutbox = triggerCloudSync;

/**
 * Supabase Auth helpers (Multi-Tenant & Granular Roles)
 */
export async function signInSupabaseUser(
  email: string,
  password: string
): Promise<{ success: boolean; role?: UserRole; shopId?: string; fullName?: string; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase non configuré.' };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { success: false, error: error?.message || 'Identifiants invalides.' };
  }

  let role: UserRole = 'owner';
  let shopId: string | undefined = data.user.app_metadata?.shop_id;
  let fullName: string = data.user.user_metadata?.full_name || data.user.email || 'Utilisateur';

  try {
    const { data: member } = await supabase
      .from('shop_members')
      .select('shop_id, full_name, role, active')
      .eq('id', data.user.id)
      .maybeSingle();

    const profile =
      member ||
      (
        await supabase
          .from('users_profile')
          .select('shop_id, full_name, role, active')
          .eq('id', data.user.id)
          .maybeSingle()
      ).data;

    if (profile) {
      if (profile.active === false) {
        await supabase.auth.signOut();
        return { success: false, error: 'هذا الحساب معطل من طرف مول المحل / Ce compte a été désactivé.' };
      }
      if (profile.role) {
        role = profile.role as UserRole;
      }
      if (profile.shop_id) {
        shopId = profile.shop_id;
      }
      if (profile.full_name) {
        fullName = profile.full_name;
      }
    }
  } catch {}

  localStorage.setItem('golden_shop_user_id', data.user.id);
  localStorage.setItem('golden_shop_user_role', role);
  localStorage.setItem('golden_shop_user_name', fullName);
  if (shopId) {
    localStorage.setItem('golden_shop_id', shopId);
  }
  await triggerCloudSync();
  return { success: true, role, shopId, fullName };
}

export async function signOutSupabaseUser(): Promise<void> {
  if (supabase) {
    await supabase.auth.signOut();
  }
}

export interface ShopUserProfile {
  id: string;
  shop_id?: string;
  email: string;
  full_name?: string;
  role: UserRole;
  pin_code?: string;
  active: boolean;
  created_at?: string;
}

export async function fetchShopUsers(): Promise<ShopUserProfile[]> {
  if (!supabase || !isSupabaseConfigured) return [];
  const { data: members, error: errMembers } = await supabase
    .from('shop_members')
    .select('id, shop_id, email, full_name, role, pin_code, active, created_at')
    .order('created_at', { ascending: true });
  if (!errMembers && members) {
    return members as ShopUserProfile[];
  }
  const { data, error } = await supabase
    .from('users_profile')
    .select('id, email, full_name, role, active, created_at')
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as ShopUserProfile[];
}

export async function createEmployeeViaEdgeFunction(
  email: string,
  password: string,
  fullName: string,
  role: UserRole = 'cashier',
  pinCode?: string
): Promise<{ success: boolean; user?: ShopUserProfile; error?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return { success: false, error: 'Supabase non configuré.' };
  }
  const { shopId } = getCurrentUserContext();
  const { data, error } = await supabase.functions.invoke('create-employee', {
    body: { email, password, fullName, role, shop_id: shopId, pin_code: pinCode },
  });
  if (error) {
    return { success: false, error: error.message || 'Erreur Edge Function create-employee.' };
  }
  if (data?.error) {
    return { success: false, error: data.error };
  }
  return { success: true, user: data?.user };
}

export async function toggleEmployeeActiveStatus(
  userId: string,
  active: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return { success: false, error: 'Supabase non configuré.' };
  }
  const { error } = await supabase
    .from('shop_members')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    const { error: fallbackErr } = await supabase
      .from('users_profile')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (fallbackErr) {
      return { success: false, error: fallbackErr.message };
    }
  }
  return { success: true };
}

let realtimeChannelInitialized = false;

/**
 * Subscribe to Supabase Realtime Postgres Changes scoped to the current shop_id
 * so any sale, stock update, or repair created by a worker appears live on the owner's screen.
 */
export function initSupabaseRealtimeSync(): void {
  if (!supabase || !isSupabaseConfigured || realtimeChannelInitialized) return;
  realtimeChannelInitialized = true;
  try {
    const { shopId } = getCurrentUserContext();
    supabase
      .channel(`shop-realtime-${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload: any) => {
          const recordShopId = payload?.new?.shop_id || payload?.old?.shop_id;
          if (!recordShopId || recordShopId === shopId) {
            triggerCloudSync();
          }
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('Supabase Realtime subscription warning:', err);
  }
}

// Start background sync loop (online event + 30s interval + Realtime channel)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    refreshSyncCounts();
    flushSupabaseOutbox();
  });
  window.addEventListener('offline', () => {
    refreshSyncCounts();
  });
  setInterval(() => {
    if (isSupabaseConfigured && navigator.onLine) {
      triggerCloudSync();
    } else {
      refreshSyncCounts();
    }
  }, 30000);
  if (isSupabaseConfigured) {
    setTimeout(() => initSupabaseRealtimeSync(), 1500);
  }
}
