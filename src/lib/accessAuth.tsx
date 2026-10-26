import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  REMEMBER_DEVICE_MS,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  DEFAULT_AUTO_LOCK_MINUTES,
} from '../config/access';
import { db, getStoreSettings, saveStoreSettings, setCurrentShopId } from '../db';
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
import {
  getActiveShopPhoneNumber,
  setActiveShopPhoneNumber,
  clearActiveShopPhoneNumber,
  normalizeShopPhoneNumber,
  firestore,
} from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { initFirebaseSync } from './firebaseSync';

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
  password?: string;
  role: 'owner' | 'employee';
  adminPasswordForWorker?: string;
}

interface LoginCredentialsParams {
  name?: string;
  phone: string;
  password?: string;
  role?: 'owner' | 'employee';
}

interface AccessAuthContextType {
  isUnlocked: boolean;
  isPinConfigured: boolean;
  activePhone: string;
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
  loginWithPhone: (phone: string, storeName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  lock: () => void;
  autoLockMinutes: number;
  setAutoLockMinutesState: (mins: number) => void;
  // Legacy / convenience helpers
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
}

const AccessAuthContext = createContext<AccessAuthContextType | null>(null);

const STORAGE_KEYS = {
  VERIFIED_AT: 'golden_access_verified_at',
  SESSION_UNLOCKED: 'golden_access_session_unlocked',
  FAILED_ATTEMPTS: 'golden_access_failed_attempts',
  LOCKOUT_UNTIL: 'golden_access_lockout_until',
  PIN_PBKDF2: 'golden_access_pin_pbkdf2',
  USER_ROLE: 'golden_shop_user_role',
  RECOVERY_OTP: 'golden_shop_recovery_otp',
  RECOVERY_OTP_EXPIRES: 'golden_shop_recovery_otp_expires',
};

export const AccessAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePhone, setActivePhoneState] = useState<string>(() => getActiveShopPhoneNumber());

  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      const savedPhone = getActiveShopPhoneNumber();
      if (!savedPhone) return false;
      const verifiedAtStr = localStorage.getItem(STORAGE_KEYS.VERIFIED_AT);
      const sessionUnlocked = localStorage.getItem(STORAGE_KEYS.SESSION_UNLOCKED);
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

  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState<number>(0);
  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(DEFAULT_AUTO_LOCK_MINUTES);
  const lastActivityRef = useRef<number>(Date.now());

  // Phone Authentication: Link account by phone number directly
  const loginWithPhone = useCallback(
    async (rawPhone: string, storeName?: string): Promise<{ success: boolean; error?: string }> => {
      const cleanPhone = normalizeShopPhoneNumber(rawPhone);
      if (!cleanPhone || cleanPhone.length < 9) {
        return { success: false, error: 'المرجو إدخال رقم هاتف صحيح (مثال: 0612345678)' };
      }

      try {
        // 1. Set active phone in local storage
        setActiveShopPhoneNumber(cleanPhone);
        setCurrentShopId(cleanPhone);
        setActivePhoneState(cleanPhone);

        // 2. Load or create document shops/{cleanPhone} in Firestore
        let remoteStoreName = storeName?.trim() || '';
        try {
          const shopDocRef = doc(firestore, 'shops', cleanPhone);
          const shopSnap = await getDoc(shopDocRef);
          if (shopSnap.exists()) {
            const data = shopSnap.data();
            if (data?.storeName) {
              remoteStoreName = data.storeName;
            }
          } else {
            await setDoc(
              shopDocRef,
              {
                phone: cleanPhone,
                storeName: remoteStoreName || 'المحل الذهبي',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { merge: true }
            );
          }
        } catch (e) {
          console.warn('Firestore shop check notice:', e);
        }

        // 3. Update local store settings to match phone number & store name
        const currentSettings = await getStoreSettings();
        await saveStoreSettings({
          ...currentSettings,
          shopId: cleanPhone,
          phone: cleanPhone,
          adminPhone: cleanPhone,
          storeName: remoteStoreName || currentSettings.storeName || 'المحل الذهبي',
        });

        // 4. Mark session unlocked and update timestamp
        const now = Date.now();
        localStorage.setItem(STORAGE_KEYS.VERIFIED_AT, String(now));
        localStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'true');
        localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, '0');
        localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);

        setSessionPinSecret(cleanPhone);
        setUserRole('owner', currentSettings.adminName || 'المدير', 'owner');
        setIsUnlocked(true);
        setFailedAttempts(0);
        setLockoutSecondsLeft(0);
        lastActivityRef.current = now;

        // 5. Initialize Firebase real-time listeners for this phone
        initFirebaseSync();

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'فشل تسجيل الدخول برقم الهاتف.' };
      }
    },
    [setUserRole]
  );

  // Logout: Clear phone account and lock
  const logout = useCallback(() => {
    clearActiveShopPhoneNumber();
    setActivePhoneState('');
    setIsUnlocked(false);
    try {
      localStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'false');
      localStorage.removeItem(STORAGE_KEYS.VERIFIED_AT);
    } catch {}
  }, []);

  // Lock function: lock screen without clearing phone account
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

  // Legacy compatibility helpers
  const setupInitialPin = async (newPin: string) => {
    return { success: true };
  };

  const verifyPin = async (pin: string, role?: UserRole) => {
    return { success: true, remainingAttempts: MAX_FAILED_ATTEMPTS, lockedOut: false };
  };

  const loginWithCredentials = async (params: LoginCredentialsParams) => {
    if (params.phone) {
      const res = await loginWithPhone(params.phone);
      return {
        success: res.success,
        error: res.error,
        remainingAttempts: MAX_FAILED_ATTEMPTS,
        lockedOut: false,
      };
    }
    return {
      success: true,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      lockedOut: false,
    };
  };

  const registerAccount = async (params: RegisterAccountParams) => {
    return await loginWithPhone(params.phone, params.storeName);
  };

  const sendWhatsAppRecoveryCode = async (phone: string) => {
    return { success: true, maskedPhone: phone };
  };

  const resetAdminPasswordWithCode = async (code: string, newPass: string) => {
    return { success: true };
  };

  const verifyAdminPasswordOnly = async (password: string) => {
    return true;
  };

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

  const changePin = async (currentPin: string, newPin: string) => {
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
        isPinConfigured: Boolean(activePhone),
        activePhone,
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
        loginWithPhone,
        logout,
        lock,
        autoLockMinutes,
        setAutoLockMinutesState,
        setupInitialPin,
        verifyPin,
        loginWithCredentials,
        registerAccount,
        sendWhatsAppRecoveryCode,
        resetAdminPasswordWithCode,
        verifyAdminPasswordOnly,
        submitAdminApprovalRequest,
        changePin,
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
