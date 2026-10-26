import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { firestore, auth, ensureFirebaseAuth, handleFirestoreError, OperationType } from '../firebase';
import {
  db,
  getDeviceId,
  getCurrentUserContext,
  getCurrentShopId,
  withSyncMetadata,
} from '../db';
import { UserRole } from '../types';

export type SyncStatusState = 'synced' | 'pending' | 'offline' | 'error' | 'unconfigured';

export interface SyncStatusSnapshot {
  status: SyncStatusState;
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  isSyncing: boolean;
  cloudProvider: 'firebase';
}

const LAST_SYNC_STORAGE_KEY = 'golden_shop_firebase_last_sync_at';

// Owner-only collections that employees must NEVER push or pull
const OWNER_ONLY_TABLES = new Set<string>([
  'expenses',
  'recurring_expenses',
  'suppliers',
  'supplier_payments',
  'supplier_purchase_orders',
]);

// Tables that should never be overwritten blindly if uuid exists
const INSERT_ONLY_TABLES = new Set<string>([
  'sales',
  'customer_payments',
  'supplier_payments',
  'stock_movements',
  'credit_audit_logs',
  'activity_logs',
  'cash_closures',
]);

export function isLocalOnlySettingKey(key?: string): boolean {
  if (!key) return false;
  return (
    key === 'access_security_state' ||
    key.startsWith('seq_') ||
    key.startsWith('lastBackup')
  );
}

type SyncListener = (snapshot: SyncStatusSnapshot) => void;
const listeners = new Set<SyncListener>();

let currentSnapshot: SyncStatusSnapshot = {
  status: typeof navigator !== 'undefined' && navigator.onLine ? 'synced' : 'offline',
  pendingCount: 0,
  conflictCount: 0,
  lastSyncedAt: localStorage.getItem(LAST_SYNC_STORAGE_KEY),
  lastError: null,
  isSyncing: false,
  cloudProvider: 'firebase',
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
        ? allOutbox.filter(
            (item) => !OWNER_ONLY_TABLES.has(item.table) && item.table !== 'settings'
          ).length
        : allOutbox.length;
    const conflictCount = await db.syncConflicts.filter((c) => !c.resolved).count();
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

    let nextStatus: SyncStatusState = currentSnapshot.status;
    if (!online) {
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
 * Mapping between local Dexie tables and Firestore collection names
 */
export const TABLE_MAP: Record<string, { dexieTable: string; collectionName: string }> = {
  settings: { dexieTable: 'settings', collectionName: 'settings' },
  products: { dexieTable: 'products', collectionName: 'products' },
  customers: { dexieTable: 'customers', collectionName: 'customers' },
  sales: { dexieTable: 'sales', collectionName: 'sales' },
  warranties: { dexieTable: 'warranties', collectionName: 'warranties' },
  sav_tickets: { dexieTable: 'savTickets', collectionName: 'sav_tickets' },
  repairs: { dexieTable: 'repairs', collectionName: 'repairs' },
  spare_parts: { dexieTable: 'spareParts', collectionName: 'spare_parts' },
  suppliers: { dexieTable: 'suppliers', collectionName: 'suppliers' },
  supplier_payments: { dexieTable: 'supplierPayments', collectionName: 'supplier_payments' },
  supplier_purchase_orders: {
    dexieTable: 'supplierPurchaseOrders',
    collectionName: 'supplier_purchase_orders',
  },
  customer_payments: { dexieTable: 'customerPayments', collectionName: 'customer_payments' },
  credit_audit_logs: { dexieTable: 'creditAuditLogs', collectionName: 'credit_audit_logs' },
  expenses: { dexieTable: 'expenses', collectionName: 'expenses' },
  recurring_expenses: { dexieTable: 'recurringExpenses', collectionName: 'recurring_expenses' },
  stock_movements: { dexieTable: 'stockMovements', collectionName: 'stock_movements' },
  cash_closures: { dexieTable: 'cashClosures', collectionName: 'cash_closures' },
  activity_logs: { dexieTable: 'activityLogs', collectionName: 'activity_logs' },
};

/**
 * Push an item to Firestore
 */
async function pushItemToFirestore(
  tableKey: string,
  operation: 'insert' | 'update' | 'delete',
  payload: any
): Promise<void> {
  const mapEntry = TABLE_MAP[tableKey];
  if (!mapEntry) return;

  const shopId = payload?.shop_id || getCurrentShopId();
  const docId = payload.uuid || payload.id?.toString() || payload.key;
  if (!docId) return;

  const colRef = collection(firestore, mapEntry.collectionName);
  const docRef = doc(colRef, String(docId));

  if (operation === 'delete') {
    // Soft delete if payload has deleted_at, else Firestore delete
    if (payload.deleted_at) {
      await setDoc(
        docRef,
        {
          ...payload,
          shop_id: shopId,
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
    } else {
      await deleteDoc(docRef);
    }
    return;
  }

  // Sanitize payload for Firestore (remove undefined values)
  const cleanData: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) {
      cleanData[k] = v;
    }
  }
  cleanData.shop_id = shopId;
  cleanData.updated_at = cleanData.updated_at || new Date().toISOString();

  await setDoc(docRef, cleanData, { merge: true });
}

/**
 * Process Local Outbox Queue to Firestore
 */
let isPushingOutbox = false;
export async function processOutbox(): Promise<{ success: boolean; processed: number; errors: number }> {
  if (isPushingOutbox) return { success: true, processed: 0, errors: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, processed: 0, errors: 0 };
  }

  isPushingOutbox = true;
  let processed = 0;
  let errors = 0;

  try {
    await ensureFirebaseAuth();
    const { role } = getCurrentUserContext();
    const outboxItems = await db.outbox.orderBy('id').limit(50).toArray();

    for (const item of outboxItems) {
      // Permission check: employee can't push owner tables
      if (role === 'employee' && (OWNER_ONLY_TABLES.has(item.table) || item.table === 'settings')) {
        continue;
      }

      // Check local-only settings
      if (item.table === 'settings' && isLocalOnlySettingKey(item.payload?.key)) {
        if (item.id) await db.outbox.delete(item.id);
        continue;
      }

      try {
        await pushItemToFirestore(item.table, item.operation, item.payload);
        if (item.id) await db.outbox.delete(item.id);
        processed++;
      } catch (err) {
        errors++;
        handleFirestoreError(err, OperationType.WRITE, item.table);
        console.warn(`Failed to push outbox item ${item.id} (${item.table}):`, err);
        // Increment attempts
        if (item.id) {
          await db.outbox.update(item.id, {
            attempts: (item.attempts || 0) + 1,
            lastError: String(err),
          });
        }
        break; // Stop batch on first critical failure
      }
    }

    const nowIso = new Date().toISOString();
    if (processed > 0) {
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, nowIso);
      currentSnapshot.lastSyncedAt = nowIso;
      currentSnapshot.lastError = null;
    }

    return { success: errors === 0, processed, errors };
  } finally {
    isPushingOutbox = false;
    await refreshSyncCounts();
  }
}

/**
 * Trigger Cloud Sync (Process Outbox & Refresh)
 */
export async function triggerCloudSync(): Promise<{ success: boolean }> {
  if (currentSnapshot.isSyncing) return { success: true };
  currentSnapshot.isSyncing = true;
  notifyListeners();

  try {
    const res = await processOutbox();
    currentSnapshot.lastError = res.errors > 0 ? 'Erreur lors de l’envoi' : null;
    return { success: res.success };
  } catch (err: any) {
    currentSnapshot.lastError = err?.message || 'Erreur de connexion';
    return { success: false };
  } finally {
    currentSnapshot.isSyncing = false;
    await refreshSyncCounts();
  }
}

/**
 * Real-time active listeners for multi-device synchronization
 */
let activeUnsubscribers: Unsubscribe[] = [];

export function startRealtimeSync(): () => void {
  stopRealtimeSync();

  const shopId = getCurrentShopId();
  const { role } = getCurrentUserContext();

  const syncableCollections = [
    'products',
    'customers',
    'sales',
    'repairs',
    'spare_parts',
    'warranties',
    'sav_tickets',
    'cash_closures',
  ];

  if (role !== 'employee') {
    syncableCollections.push('expenses', 'recurring_expenses', 'suppliers', 'supplier_payments');
  }

  ensureFirebaseAuth().then((user) => {
    if (!user) return;

    for (const colName of syncableCollections) {
      try {
        const q = query(
          collection(firestore, colName),
          where('shop_id', '==', shopId)
        );

        const unsub = onSnapshot(
          q,
          async (snapshot) => {
            for (const change of snapshot.docChanges()) {
              if (change.type === 'added' || change.type === 'modified') {
                const data = change.doc.data();
                await applyRemoteChange(colName, data);
              }
            }
          },
          (err) => {
            handleFirestoreError(err, OperationType.LIST, colName);
          }
        );

        activeUnsubscribers.push(unsub);
      } catch (err) {
        console.warn(`Could not start listener for ${colName}:`, err);
      }
    }
  });

  return stopRealtimeSync;
}

export function stopRealtimeSync(): void {
  for (const unsub of activeUnsubscribers) {
    try {
      unsub();
    } catch {}
  }
  activeUnsubscribers = [];
}

/**
 * Apply a remote record into local Dexie if it is newer
 */
async function applyRemoteChange(collectionName: string, remoteData: any): Promise<void> {
  const mapEntry = Object.values(TABLE_MAP).find((m) => m.collectionName === collectionName);
  if (!mapEntry) return;

  const tableName = mapEntry.dexieTable;
  const table = (db as any)[tableName];
  if (!table) return;

  const uuid = remoteData.uuid;
  if (!uuid) return;

  // Don't overwrite if it was generated on this device within the last 5 seconds to prevent echo
  const thisDevice = getDeviceId();
  if (remoteData.device_id === thisDevice) {
    return;
  }

  try {
    const existing = await table.where('uuid').equals(uuid).first();

    if (!existing) {
      // Remote insert
      await table.add(remoteData);
    } else {
      // If insert-only table, skip update
      if (INSERT_ONLY_TABLES.has(collectionName)) {
        return;
      }

      const localUpdated = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const remoteUpdated = remoteData.updated_at ? new Date(remoteData.updated_at).getTime() : 0;

      if (remoteUpdated >= localUpdated) {
        await table.put({
          ...existing,
          ...remoteData,
          id: existing.id, // Preserve Dexie local auto-increment id
        });
      }
    }
  } catch (err) {
    console.warn(`Error applying remote change in ${tableName}:`, err);
  }
}

/**
 * Full Migration: Push all local store records to Firebase Firestore in one click
 */
export async function migrateAllLocalDataToFirestore(
  onProgress?: (progressPct: number, currentTable: string) => void
): Promise<{ success: boolean; totalMigrated: number; error?: string }> {
  try {
    await ensureFirebaseAuth();
    const shopId = getCurrentShopId();
    let totalMigrated = 0;

    const tablesToMigrate: Array<{ dexieTable: string; collectionName: string; label: string }> = [
      { dexieTable: 'products', collectionName: 'products', label: 'السلع والهواتف' },
      { dexieTable: 'customers', collectionName: 'customers', label: 'الزبناء والكريديات' },
      { dexieTable: 'sales', collectionName: 'sales', label: 'المبيعات والوصولات' },
      { dexieTable: 'repairs', collectionName: 'repairs', label: 'إصلاحات الورشة' },
      { dexieTable: 'spareParts', collectionName: 'spare_parts', label: 'قطع الغيار' },
      { dexieTable: 'warranties', collectionName: 'warranties', label: 'الضمانات' },
      { dexieTable: 'savTickets', collectionName: 'sav_tickets', label: 'تذاكر SAV' },
      { dexieTable: 'suppliers', collectionName: 'suppliers', label: 'الموردون' },
      { dexieTable: 'supplierPayments', collectionName: 'supplier_payments', label: 'دفعات الموردين' },
      { dexieTable: 'supplierPurchaseOrders', collectionName: 'supplier_purchase_orders', label: 'فواتير الموردين' },
      { dexieTable: 'customerPayments', collectionName: 'customer_payments', label: 'أداءات الكريدي' },
      { dexieTable: 'expenses', collectionName: 'expenses', label: 'المصاريف' },
      { dexieTable: 'recurringExpenses', collectionName: 'recurring_expenses', label: 'المصاريف الدورية' },
      { dexieTable: 'cashClosures', collectionName: 'cash_closures', label: 'إغلاق الصندوق' },
      { dexieTable: 'stockMovements', collectionName: 'stock_movements', label: 'حركات المخزون' },
    ];

    const totalSteps = tablesToMigrate.length;

    for (let i = 0; i < totalSteps; i++) {
      const item = tablesToMigrate[i];
      if (onProgress) {
        const pct = Math.round(((i + 1) / totalSteps) * 100);
        onProgress(pct, item.label);
      }

      const table = (db as any)[item.dexieTable];
      if (!table) continue;

      const records = await table.toArray();
      for (const rec of records) {
        try {
          const docUuid = rec.uuid || rec.id?.toString();
          if (!docUuid) continue;

          const docRef = doc(firestore, item.collectionName, String(docUuid));
          const cleanRec: Record<string, any> = {};
          for (const [k, v] of Object.entries(rec)) {
            if (v !== undefined) cleanRec[k] = v;
          }
          cleanRec.shop_id = shopId;
          cleanRec.updated_at = cleanRec.updated_at || new Date().toISOString();

          await setDoc(docRef, cleanRec, { merge: true });
          totalMigrated++;
        } catch (itemErr) {
          console.warn(`Error migrating record in ${item.dexieTable}:`, itemErr);
        }
      }
    }

    const nowIso = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, nowIso);
    currentSnapshot.lastSyncedAt = nowIso;
    currentSnapshot.lastError = null;
    await refreshSyncCounts();

    return { success: true, totalMigrated };
  } catch (err: any) {
    const errorInfo = handleFirestoreError(err, OperationType.WRITE, 'migration');
    return { success: false, totalMigrated: 0, error: errorInfo.error };
  }
}

// Background auto-sync interval
let autoSyncInterval: any = null;

export function initFirebaseSync(): void {
  // Start real-time sync listeners
  startRealtimeSync();

  // Process outbox immediately
  processOutbox();

  // Listen to window online event
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      triggerCloudSync();
      startRealtimeSync();
    });
    window.addEventListener('offline', () => {
      refreshSyncCounts();
    });

    if (!autoSyncInterval) {
      // Process outbox every 15 seconds if items are pending
      autoSyncInterval = setInterval(() => {
        if (navigator.onLine) {
          processOutbox();
        }
      }, 15000);
    }
  }
}
