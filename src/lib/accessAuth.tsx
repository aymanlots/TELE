import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  REMEMBER_DEVICE_MS,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  DEFAULT_AUTO_LOCK_MINUTES,
} from '../config/access';
import { db, getStoreSettings, saveStoreSettings, getCurrentShopId } from '../db';
import { UserRole, AppTab, AdminApprovalRequest, ShopMember } from '../types';
import {
  hashPinPBKDF2,
  verifyPinPBKDF2,
  setSessionPinSecret,
  generateUUID,
} from './cryptoUtils';
import {
  Permission,
  hasPermission,
  isOwnerRole,
  canAccessTab,
  normalizeRole,
} from './permissions';
import { openWhatsAppChat, normalizeMoroccanPhone } from './whatsapp';

export function normalizePhoneForCompare(phone: string | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00212')) return digits.slice(5);
  if (digits.startsWith('212') && digits.length >= 11) return digits.slice(3);
  if (digits.startsWith('0') && digits.length >= 9) return digits.slice(1);
  return digits;
}

interface RegisterAccountParams {
  fullName: string;
  storeName?: string;
  phone: string;
  password: string;
  role: 'owner' | 'employee';
  adminPasswordForWorker?: string;
}

interface LoginCredentialsParams {
  name?: string;
  phone: string;
  password: string;
  role: 'owner' | 'employee';
}

interface AccessAuthContextType {
  isUnlocked: boolean;
  isPinConfigured: boolean;
  isLockedOut: boolean;
  lockoutSecondsLeft: number;
  failedAttempts: number;
  maxAttempts: number;
  userRole: UserRole;
  activeRole: UserRole;
  isOwnerMode: boolean;
  can: (permission: Permission) => boolean;
  canAccess: (tab: AppTab) => boolean;
  setUserRole: (role: UserRole, customName?: string, customId?: string) => void;
  setupInitialPin: (newPin: string) => Promise<{ success: boolean; error?: string }>;
  verifyPin: (pin: string, role?: UserRole) => Promise<{ success: boolean; remainingAttempts: number; lockedOut: boolean }>;
  loginWithCredentials: (params: LoginCredentialsParams) => Promise<{
    success: boolean;
    error?: string;
    remainingAttempts: number;
    lockedOut: boolean;
  }>;
  registerAccount: (params: RegisterAccountParams) => Promise<{
    success: boolean;
    error?: string;
  }>;
  sendWhatsAppRecoveryCode: (phone: string) => Promise<{
    success: boolean;
    error?: string;
    maskedPhone?: string;
    autoSentViaGateway?: boolean;
  }>;
  resetAdminPasswordWithCode: (
    code: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  verifyAdminPasswordOnly: (password: string) => Promise<boolean>;
  submitAdminApprovalRequest: (
    req: Omit<AdminApprovalRequest, 'id' | 'createdAt' | 'status' | 'requestedBy'>
  ) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; error?: 'wrong_current' | 'invalid_format' }>;
  lock: () => void;
  autoLockMinutes: number;
  setAutoLockMinutesState: (mins: number) => void;
}

const AccessAuthContext = createContext<AccessAuthContextType | null>(null);

const STORAGE_KEYS = {
  VERIFIED_AT: 'golden_access_verified_at',
  SESSION_UNLOCKED: 'golden_access_session_unlocked',
  FAILED_ATTEMPTS: 'golden_access_failed_attempts',
  LOCKOUT_UNTIL: 'golden_access_lockout_until',
  PIN_PBKDF2: 'golden_access_pin_pbkdf2',
  LEGACY_CUSTOM_SHA256: 'golden_access_custom_sha256',
  USER_ROLE: 'golden_shop_user_role',
  RECOVERY_OTP: 'golden_shop_recovery_otp',
  RECOVERY_OTP_EXPIRES: 'golden_shop_recovery_otp_expires',
};

const IDB_SECURITY_KEY = 'access_security_state';

interface PersistedSecurityState {
  pinPbkdf2?: string;
  failedAttempts?: number;
  lockoutUntil?: number;
}

async function readIdbSecurityState(): Promise<PersistedSecurityState> {
  try {
    const rec = await db.settings.get(IDB_SECURITY_KEY);
    if (rec && rec.value && typeof rec.value === 'object') {
      return rec.value as PersistedSecurityState;
    }
  } catch {}
  return {};
}

async function writeIdbSecurityState(patch: Partial<PersistedSecurityState>): Promise<void> {
  try {
    const current = await readIdbSecurityState();
    await db.settings.put({
      key: IDB_SECURITY_KEY,
      value: { ...current, ...patch },
      updated_at: new Date().toISOString(),
    });
  } catch {}
}

/**
 * Legacy SHA-256 helper for transparent one-time migration of existing custom PINs
 */
export async function computeSha256(plainText: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(plainText.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const AccessAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPinConfigured, setIsPinConfigured] = useState<boolean>(() => {
    try {
      const pbkdf2 = localStorage.getItem(STORAGE_KEYS.PIN_PBKDF2);
      const legacySha = localStorage.getItem(STORAGE_KEYS.LEGACY_CUSTOM_SHA256);
      return Boolean((pbkdf2 && pbkdf2.startsWith('pbkdf2:')) || (legacySha && legacySha.length === 64));
    } catch {
      return false;
    }
  });

  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      const verifiedAtStr = localStorage.getItem(STORAGE_KEYS.VERIFIED_AT);
      const sessionUnlocked = localStorage.getItem(STORAGE_KEYS.SESSION_UNLOCKED);
      const pbkdf2 = localStorage.getItem(STORAGE_KEYS.PIN_PBKDF2);
      const legacySha = localStorage.getItem(STORAGE_KEYS.LEGACY_CUSTOM_SHA256);
      if (!pbkdf2 && !legacySha) {
        return false; // Must set up initial account on first launch
      }
      if (!verifiedAtStr || sessionUnlocked !== 'true') {
        return false;
      }
      const verifiedAt = Number(verifiedAtStr);
      if (Date.now() - verifiedAt < REMEMBER_DEVICE_MS) {
        return true;
      }
      localStorage.removeItem(STORAGE_KEYS.SESSION_UNLOCKED);
      return false;
    } catch {
      return false;
    }
  });

  const [userRole, setUserRoleState] = useState<UserRole>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USER_ROLE) as UserRole | null;
      return normalizeRole(saved || 'owner');
    } catch {
      return 'owner';
    }
  });

  const setUserRole = useCallback((role: UserRole, customName?: string, customId?: string) => {
    const normalized = normalizeRole(role);
    setUserRoleState(normalized);
    try {
      localStorage.setItem(STORAGE_KEYS.USER_ROLE, normalized);
      const roleDefaultName = normalized === 'owner' ? 'الأدمين (المدير)' : 'العامل (الموظف)';
      localStorage.setItem('golden_shop_user_name', customName || roleDefaultName);
      localStorage.setItem('golden_shop_user_id', customId || normalized);
    } catch {}
  }, []);

  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(STORAGE_KEYS.FAILED_ATTEMPTS)) || 0;
    } catch {
      return 0;
    }
  });

  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState<number>(0);
  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(DEFAULT_AUTO_LOCK_MINUTES);
  const lastActivityRef = useRef<number>(Date.now());

  // Sync security state (PIN hash + lockout persistence) between IndexedDB and localStorage
  useEffect(() => {
    async function syncSecurityState() {
      try {
        const settings = await getStoreSettings();
        if (settings.autoLockMinutes !== undefined) {
          setAutoLockMinutesState(settings.autoLockMinutes);
        }

        const idbState = await readIdbSecurityState();
        const localPbkdf2 = localStorage.getItem(STORAGE_KEYS.PIN_PBKDF2);

        if (!localPbkdf2 && idbState.pinPbkdf2) {
          localStorage.setItem(STORAGE_KEYS.PIN_PBKDF2, idbState.pinPbkdf2);
          setIsPinConfigured(true);
        } else if (localPbkdf2 && !idbState.pinPbkdf2) {
          await writeIdbSecurityState({ pinPbkdf2: localPbkdf2 });
          setIsPinConfigured(true);
        } else if (localPbkdf2 || idbState.pinPbkdf2) {
          setIsPinConfigured(true);
        }

        const localLockout = Number(localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL)) || 0;
        const idbLockout = idbState.lockoutUntil || 0;
        const effectiveLockout = Math.max(localLockout, idbLockout);

        if (effectiveLockout > Date.now()) {
          localStorage.setItem(STORAGE_KEYS.LOCKOUT_UNTIL, String(effectiveLockout));
          setLockoutSecondsLeft(Math.ceil((effectiveLockout - Date.now()) / 1000));
        }

        const localAttempts = Number(localStorage.getItem(STORAGE_KEYS.FAILED_ATTEMPTS)) || 0;
        const idbAttempts = idbState.failedAttempts || 0;
        const effectiveAttempts = Math.max(localAttempts, idbAttempts);
        if (effectiveAttempts > 0) {
          setFailedAttempts(effectiveAttempts);
          localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, String(effectiveAttempts));
        }
      } catch {}
    }
    syncSecurityState();
  }, []);

  // Check ongoing lockout every second
  useEffect(() => {
    function evaluateLockout() {
      try {
        const lockoutUntilStr = localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL);
        if (lockoutUntilStr) {
          const lockoutUntil = Number(lockoutUntilStr);
          const diffMs = lockoutUntil - Date.now();
          if (diffMs > 0) {
            setLockoutSecondsLeft(Math.ceil(diffMs / 1000));
            return true;
          } else {
            localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
            localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, '0');
            writeIdbSecurityState({ lockoutUntil: 0, failedAttempts: 0 });
            setFailedAttempts(0);
            setLockoutSecondsLeft(0);
            return false;
          }
        }
      } catch {}
      setLockoutSecondsLeft(0);
      return false;
    }

    evaluateLockout();
    const interval = setInterval(evaluateLockout, 1000);
    return () => clearInterval(interval);
  }, []);

  // Lock function
  const lock = useCallback(() => {
    setIsUnlocked(false);
    try {
      localStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'false');
    } catch {}
  }, []);

  // Auto-lock on inactivity
  useEffect(() => {
    if (!isUnlocked || autoLockMinutes <= 0) return;

    lastActivityRef.current = Date.now();
    const handleUserInteraction = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach((ev) => window.addEventListener(ev, handleUserInteraction, { passive: true }));

    const checkInterval = setInterval(() => {
      const inactiveMs = Date.now() - lastActivityRef.current;
      const thresholdMs = autoLockMinutes * 60 * 1000;
      if (inactiveMs >= thresholdMs) {
        lock();
      }
    }, 5000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserInteraction));
      clearInterval(checkInterval);
    };
  }, [isUnlocked, autoLockMinutes, lock]);

  // Verify whether a plain password/PIN matches the Admin's stored hash
  const verifyAdminPasswordOnly = useCallback(async (password: string): Promise<boolean> => {
    const clean = password.trim();
    if (!clean) return false;
    const idbState = await readIdbSecurityState();
    const pbkdf2Record = localStorage.getItem(STORAGE_KEYS.PIN_PBKDF2) || idbState.pinPbkdf2;
    if (pbkdf2Record && pbkdf2Record.startsWith('pbkdf2:')) {
      const ok = await verifyPinPBKDF2(clean, pbkdf2Record);
      if (ok) return true;
    }
    const legacySha = localStorage.getItem(STORAGE_KEYS.LEGACY_CUSTOM_SHA256);
    if (legacySha && legacySha.length === 64) {
      const inputSha = await computeSha256(clean);
      if (inputSha === legacySha) return true;
    }
    // Check if matches an active recovery OTP
    try {
      const otp = localStorage.getItem(STORAGE_KEYS.RECOVERY_OTP);
      const exp = Number(localStorage.getItem(STORAGE_KEYS.RECOVERY_OTP_EXPIRES)) || 0;
      if (otp && exp > Date.now() && otp === clean) {
        return true;
      }
    } catch {}
    return false;
  }, []);

  // First-launch PIN configuration
  const setupInitialPin = async (newPin: string): Promise<{ success: boolean; error?: string }> => {
    const clean = newPin.trim();
    if (clean.length < 4) {
      return { success: false, error: 'invalid_format' };
    }

    const pbkdf2Record = await hashPinPBKDF2(clean);
    const now = Date.now();
    try {
      localStorage.setItem(STORAGE_KEYS.PIN_PBKDF2, pbkdf2Record);
      localStorage.setItem(STORAGE_KEYS.VERIFIED_AT, String(now));
      localStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'true');
      localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, '0');
      localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    } catch {}

    await writeIdbSecurityState({
      pinPbkdf2: pbkdf2Record,
      failedAttempts: 0,
      lockoutUntil: 0,
    });

    setSessionPinSecret(clean);
    setIsPinConfigured(true);
    setFailedAttempts(0);
    setLockoutSecondsLeft(0);
    setIsUnlocked(true);
    return { success: true };
  };

  // Commercial SaaS Account Registration (Admin or Worker)
  const registerAccount = async (
    params: RegisterAccountParams
  ): Promise<{ success: boolean; error?: string }> => {
    const { fullName, storeName, phone, password, role, adminPasswordForWorker } = params;
    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();
    const cleanPass = password.trim();

    if (!cleanName) {
      return { success: false, error: 'المرجو إدخال الاسم الكامل.' };
    }
    if (!cleanPhone || normalizePhoneForCompare(cleanPhone).length < 8) {
      return { success: false, error: 'المرجو إدخال رقم هاتف واتساب صحيح (مثال: 0612345678).' };
    }
    if (cleanPass.length < 4) {
      return { success: false, error: 'كلمة المرور يجب أن تتكون من 4 أحرف أو أرقام على الأقل.' };
    }

    const settings = await getStoreSettings();

    if (role === 'owner') {
      // If an admin account is already configured with a password, require current admin password or recovery
      const idbState = await readIdbSecurityState();
      const existingPin = localStorage.getItem(STORAGE_KEYS.PIN_PBKDF2) || idbState.pinPbkdf2;
      if (existingPin && settings.adminPhone) {
        return {
          success: false,
          error: 'حساب الأدمين مسجل مسبقاً لهذا المحل. استعمل "تسجيل الدخول" أو "نسيت كلمة المرور".',
        };
      }

      const pbkdf2Record = await hashPinPBKDF2(cleanPass);
      const now = Date.now();
      try {
        localStorage.setItem(STORAGE_KEYS.PIN_PBKDF2, pbkdf2Record);
        localStorage.setItem(STORAGE_KEYS.VERIFIED_AT, String(now));
        localStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'true');
        localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, '0');
        localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
      } catch {}

      await writeIdbSecurityState({
        pinPbkdf2: pbkdf2Record,
        failedAttempts: 0,
        lockoutUntil: 0,
      });

      await saveStoreSettings({
        ...settings,
        storeName: storeName?.trim() || settings.storeName || 'المحل الذهبي',
        adminName: cleanName,
        adminPhone: cleanPhone,
        phone: settings.phone || cleanPhone,
      });

      setSessionPinSecret(cleanPass);
      setUserRole('owner', cleanName, 'owner');
      setIsPinConfigured(true);
      setFailedAttempts(0);
      setLockoutSecondsLeft(0);
      setIsUnlocked(true);
      return { success: true };
    } else {
      // Registering a Worker (العامل) requires Admin approval password if Admin is already configured
      const idbState = await readIdbSecurityState();
      const existingPin = localStorage.getItem(STORAGE_KEYS.PIN_PBKDF2) || idbState.pinPbkdf2;
      if (existingPin) {
        if (!adminPasswordForWorker || !(await verifyAdminPasswordOnly(adminPasswordForWorker))) {
          return {
            success: false,
            error: 'لإضافة حساب عامل جديد، يجب إدخال كلمة مرور الأدمين للموافقة.',
          };
        }
      }

      const existingMembers = Array.isArray(settings.shopMembers) ? settings.shopMembers : [];
      const newWorker: ShopMember = {
        id: generateUUID(),
        shop_id: settings.shopId || getCurrentShopId(),
        full_name: cleanName,
        phone: cleanPhone,
        role: 'employee',
        pin_code: cleanPass,
        active: true,
        created_at: new Date().toISOString(),
      };

      const updatedMembers = [...existingMembers, newWorker];
      await saveStoreSettings({
        ...settings,
        shopMembers: updatedMembers,
      });

      const now = Date.now();
      try {
        localStorage.setItem(STORAGE_KEYS.VERIFIED_AT, String(now));
        localStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'true');
        localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, '0');
      } catch {}

      setSessionPinSecret(cleanPass);
      setUserRole('employee', cleanName, newWorker.id);
      setFailedAttempts(0);
      setLockoutSecondsLeft(0);
      setIsUnlocked(true);
      return { success: true };
    }
  };

  // Commercial SaaS Login with Name + WhatsApp Phone + Password/PIN
  const loginWithCredentials = async (
    params: LoginCredentialsParams
  ): Promise<{
    success: boolean;
    error?: string;
    remainingAttempts: number;
    lockedOut: boolean;
  }> => {
    const { name, phone, password, role } = params;
    const idbState = await readIdbSecurityState();
    const localLockout = Number(localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL)) || 0;
    const effectiveLockout = Math.max(localLockout, idbState.lockoutUntil || 0);

    if (effectiveLockout > Date.now()) {
      return {
        success: false,
        error: 'تم قفل المحاولات مؤقتاً بسبب إدخال خاطئ متكرر.',
        remainingAttempts: 0,
        lockedOut: true,
      };
    }

    const cleanPass = password.trim();
    const cleanPhoneNorm = normalizePhoneForCompare(phone);
    const settings = await getStoreSettings();

    let isMatch = false;
    let matchedName = name?.trim() || '';
    let matchedId = role === 'owner' ? 'owner' : 'employee';
    let matchedRole: 'owner' | 'employee' = role;

    if (role === 'owner') {
      // Check Admin phone if already configured
      const savedAdminPhoneNorm = normalizePhoneForCompare(settings.adminPhone || settings.phone);
      if (savedAdminPhoneNorm && cleanPhoneNorm && savedAdminPhoneNorm !== cleanPhoneNorm) {
        return {
          success: false,
          error: 'رقم الهاتف واتساب غير مطابق لرقم الأدمين المسجل.',
          remainingAttempts: Math.max(1, MAX_FAILED_ATTEMPTS - failedAttempts),
          lockedOut: false,
        };
      }

      const passValid = await verifyAdminPasswordOnly(cleanPass);
      if (passValid) {
        isMatch = true;
        matchedName = name?.trim() || settings.adminName || 'الأدمين (المدير)';
        matchedRole = 'owner';
        // Save adminName & adminPhone if not saved yet
        if (!settings.adminPhone && phone.trim()) {
          await saveStoreSettings({
            ...settings,
            adminName: matchedName,
            adminPhone: phone.trim(),
            phone: settings.phone || phone.trim(),
          });
        }
      }
    } else {
      // Worker login (العامل)
      const members = Array.isArray(settings.shopMembers) ? settings.shopMembers : [];
      const activeWorkers = members.filter((m) => m.active && normalizeRole(m.role) === 'employee');

      const matchedWorker = activeWorkers.find((m) => {
        const pinMatches = m.pin_code && m.pin_code.trim() === cleanPass;
        if (!pinMatches) return false;
        if (m.phone && cleanPhoneNorm) {
          return normalizePhoneForCompare(m.phone) === cleanPhoneNorm;
        }
        return true;
      });

      if (matchedWorker) {
        isMatch = true;
        matchedName = matchedWorker.full_name || name?.trim() || 'العامل';
        matchedId = matchedWorker.id;
        matchedRole = 'employee';
        // Update worker's phone if it wasn't saved before
        if (!matchedWorker.phone && phone.trim()) {
          const updatedMembers = members.map((m) =>
            m.id === matchedWorker.id ? { ...m, phone: phone.trim() } : m
          );
          await saveStoreSettings({ ...settings, shopMembers: updatedMembers });
        }
      } else if (activeWorkers.length === 0) {
        return {
          success: false,
          error: 'لا يوجد حساب عامل مسجل بعد. اضغط على "إنشاء حساب جديد" لإضافة عامل بموافقة الأدمين.',
          remainingAttempts: MAX_FAILED_ATTEMPTS,
          lockedOut: false,
        };
      }
    }

    if (isMatch) {
      const now = Date.now();
      try {
        localStorage.setItem(STORAGE_KEYS.VERIFIED_AT, String(now));
        localStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'true');
        localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, '0');
        localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
      } catch {}

      await writeIdbSecurityState({ failedAttempts: 0, lockoutUntil: 0 });
      setSessionPinSecret(cleanPass);
      setUserRole(matchedRole, matchedName, matchedId);
      setFailedAttempts(0);
      setLockoutSecondsLeft(0);
      lastActivityRef.current = now;
      setIsUnlocked(true);

      return { success: true, remainingAttempts: MAX_FAILED_ATTEMPTS, lockedOut: false };
    } else {
      const currentFailed = Math.max(failedAttempts, idbState.failedAttempts || 0);
      const nextAttempts = currentFailed + 1;
      setFailedAttempts(nextAttempts);

      if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
        try {
          localStorage.setItem(STORAGE_KEYS.LOCKOUT_UNTIL, String(lockoutUntil));
          localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, String(nextAttempts));
        } catch {}
        await writeIdbSecurityState({ failedAttempts: nextAttempts, lockoutUntil });
        setLockoutSecondsLeft(Math.ceil(LOCKOUT_DURATION_MS / 1000));
        return {
          success: false,
          error: 'تم تجاوز عدد المحاولات المسموح بها.',
          remainingAttempts: 0,
          lockedOut: true,
        };
      } else {
        try {
          localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, String(nextAttempts));
        } catch {}
        await writeIdbSecurityState({ failedAttempts: nextAttempts });
        return {
          success: false,
          error: 'كلمة المرور أو البيانات غير صحيحة.',
          remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - nextAttempts),
          lockedOut: false,
        };
      }
    }
  };

  // Send Automatic WhatsApp Recovery Code for Admin
  const sendWhatsAppRecoveryCode = async (
    phone: string
  ): Promise<{
    success: boolean;
    error?: string;
    maskedPhone?: string;
    autoSentViaGateway?: boolean;
  }> => {
    const cleanInputNorm = normalizePhoneForCompare(phone);
    if (!cleanInputNorm || cleanInputNorm.length < 8) {
      return { success: false, error: 'المرجو إدخال رقم هاتف واتساب صحيح.' };
    }

    const settings = await getStoreSettings();
    const registeredPhone = settings.adminPhone || settings.phone || '';
    const registeredNorm = normalizePhoneForCompare(registeredPhone);

    if (registeredNorm && registeredNorm !== cleanInputNorm) {
      return {
        success: false,
        error: 'رقم الواتساب المدخل لا يطابق رقم هاتف الأدمين المسجل في النظام.',
      };
    }

    // Generate 6-digit recovery code / temporary password
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    const code = String(100000 + (randomArray[0] % 900000));
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    try {
      localStorage.setItem(STORAGE_KEYS.RECOVERY_OTP, code);
      localStorage.setItem(STORAGE_KEYS.RECOVERY_OTP_EXPIRES, String(expiresAt));
    } catch {}

    // If no adminPhone was saved yet, save it now
    const targetPhone = registeredPhone || phone.trim();
    if (!settings.adminPhone) {
      await saveStoreSettings({ ...settings, adminPhone: targetPhone });
    }

    const shopTitle = settings.storeName?.trim() || 'المحل الذهبي';
    const adminTitle = settings.adminName?.trim() || 'الأدمين';
    const recoveryMessage =
      `🔐 *${shopTitle} — استرجاع كلمة مرور الأدمين*\n\n` +
      `مرحباً *${adminTitle}*،\n` +
      `كود الاسترجاع وكلمة المرور المؤقتة الخاصة بك هي:\n` +
      `👉 *${code}*\n\n` +
      `يمكنك إدخال هذا الكود في التطبيق لتعيين كلمة مرور جديدة (صالح لمدة 15 دقيقة).`;

    let autoSentViaGateway = false;

    // 1. Try background webhook / WhatsApp Gateway if configured
    if (settings.whatsappGatewayUrl && settings.whatsappGatewayUrl.trim()) {
      try {
        const normalizedIntl = normalizeMoroccanPhone(targetPhone) || targetPhone;
        const url = settings.whatsappGatewayUrl
          .trim()
          .replace('{phone}', encodeURIComponent(normalizedIntl))
          .replace('{text}', encodeURIComponent(recoveryMessage))
          .replace('{code}', encodeURIComponent(code));
        await fetch(url, { method: 'GET', mode: 'no-cors' });
        autoSentViaGateway = true;
      } catch {}
    }

    // 2. Dispatch direct WhatsApp message to Admin's number
    openWhatsAppChat(targetPhone, recoveryMessage);

    return {
      success: true,
      maskedPhone: targetPhone,
      autoSentViaGateway,
    };
  };

  // Reset Admin Password using the WhatsApp Recovery Code
  const resetAdminPasswordWithCode = async (
    code: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanCode = code.trim();
    const cleanNew = newPassword.trim();

    if (cleanNew.length < 4) {
      return {
        success: false,
        error: 'كلمة المرور الجديدة يجب أن تتكون من 4 أرقام أو أحرف على الأقل.',
      };
    }

    const storedOtp = localStorage.getItem(STORAGE_KEYS.RECOVERY_OTP);
    const expiresAt = Number(localStorage.getItem(STORAGE_KEYS.RECOVERY_OTP_EXPIRES)) || 0;

    if (!storedOtp || Date.now() > expiresAt) {
      return {
        success: false,
        error: 'انتهت صلاحية كود الاسترجاع. المرجو طلب كود جديد عبر واتساب.',
      };
    }

    if (storedOtp !== cleanCode) {
      return {
        success: false,
        error: 'كود الاسترجاع غير صحيح. تأكد من الرسالة المرسلة لـ واتساب.',
      };
    }

    const newPbkdf2 = await hashPinPBKDF2(cleanNew);
    const now = Date.now();
    try {
      localStorage.setItem(STORAGE_KEYS.PIN_PBKDF2, newPbkdf2);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_CUSTOM_SHA256);
      localStorage.removeItem(STORAGE_KEYS.RECOVERY_OTP);
      localStorage.removeItem(STORAGE_KEYS.RECOVERY_OTP_EXPIRES);
      localStorage.setItem(STORAGE_KEYS.VERIFIED_AT, String(now));
      localStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'true');
      localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, '0');
      localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    } catch {}

    await writeIdbSecurityState({
      pinPbkdf2: newPbkdf2,
      failedAttempts: 0,
      lockoutUntil: 0,
    });

    const settings = await getStoreSettings();
    setSessionPinSecret(cleanNew);
    setUserRole('owner', settings.adminName || 'الأدمين (المدير)', 'owner');
    setIsPinConfigured(true);
    setFailedAttempts(0);
    setLockoutSecondsLeft(0);
    setIsUnlocked(true);

    return { success: true };
  };

  // Submit a Worker Edit/Delete Request to Admin Approval Queue
  const submitAdminApprovalRequest = useCallback(
    async (req: Omit<AdminApprovalRequest, 'id' | 'createdAt' | 'status' | 'requestedBy'>) => {
      const settings = await getStoreSettings();
      const workerName = localStorage.getItem('golden_shop_user_name') || 'العامل';
      const newReq: AdminApprovalRequest = {
        ...req,
        id: generateUUID(),
        requestedBy: workerName,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      const existing = Array.isArray(settings.pendingApprovals) ? settings.pendingApprovals : [];
      await saveStoreSettings({
        ...settings,
        pendingApprovals: [newReq, ...existing],
      });
    },
    []
  );

  // Legacy verifyPin support
  const verifyPin = async (
    pin: string,
    role?: UserRole
  ): Promise<{ success: boolean; remainingAttempts: number; lockedOut: boolean }> => {
    const normalized = normalizeRole(role);
    const res = await loginWithCredentials({
      phone: '',
      password: pin,
      role: normalized,
    });
    return {
      success: res.success,
      remainingAttempts: res.remainingAttempts,
      lockedOut: res.lockedOut,
    };
  };

  // Change PIN/Password from Settings (requires verifying current PIN/Password)
  const changePin = async (
    currentPin: string,
    newPin: string
  ): Promise<{ success: boolean; error?: 'wrong_current' | 'invalid_format' }> => {
    const cleanNew = newPin.trim();
    if (cleanNew.length < 4) {
      return { success: false, error: 'invalid_format' };
    }

    const currentValid = await verifyAdminPasswordOnly(currentPin);
    if (!currentValid) {
      return { success: false, error: 'wrong_current' };
    }

    const newPbkdf2 = await hashPinPBKDF2(cleanNew);
    try {
      localStorage.setItem(STORAGE_KEYS.PIN_PBKDF2, newPbkdf2);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_CUSTOM_SHA256);
      localStorage.setItem(STORAGE_KEYS.VERIFIED_AT, String(Date.now()));
    } catch {}
    await writeIdbSecurityState({ pinPbkdf2: newPbkdf2 });
    setSessionPinSecret(cleanNew);

    return { success: true };
  };

  const isLockedOut = lockoutSecondsLeft > 0;
  const isOwnerMode = isOwnerRole(userRole);
  const can = useCallback((permission: Permission) => hasPermission(userRole, permission), [userRole]);
  const canAccess = useCallback((tab: AppTab) => canAccessTab(userRole, tab), [userRole]);

  return (
    <AccessAuthContext.Provider
      value={{
        isUnlocked,
        isPinConfigured,
        isLockedOut,
        lockoutSecondsLeft,
        failedAttempts,
        maxAttempts: MAX_FAILED_ATTEMPTS,
        userRole,
        activeRole: userRole,
        isOwnerMode,
        can,
        canAccess,
        setUserRole,
        setupInitialPin,
        verifyPin,
        loginWithCredentials,
        registerAccount,
        sendWhatsAppRecoveryCode,
        resetAdminPasswordWithCode,
        verifyAdminPasswordOnly,
        submitAdminApprovalRequest,
        changePin,
        lock,
        autoLockMinutes,
        setAutoLockMinutesState,
      }}
    >
      {children}
    </AccessAuthContext.Provider>
  );
};

export const useAccessAuth = () => {
  const context = useContext(AccessAuthContext);
  if (!context) {
    throw new Error('useAccessAuth must be used within an AccessAuthProvider');
  }
  return context;
};

