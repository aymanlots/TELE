import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  REMEMBER_DEVICE_MS,
  MAX_FAILED_ATTEMPTS,
  DEFAULT_AUTO_LOCK_MINUTES,
} from '../config/access';
import { db, getStoreSettings, saveStoreSettings, setCurrentShopId } from '../db';
import { UserRole, AppTab, AdminApprovalRequest } from '../types';
import {
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
import { initFirebaseSync, stopRealtimeSync } from './firebaseSync';
import {
  createAndSendPasswordResetOtp,
  verifyOtpAndResetUserPassword,
  findUserAccountByWhatsAppPhone,
  syncShopMembersPhoneIndex,
} from './whatsappCloudApi';
import {
  sendEmailOtp,
  verifyEmailOtp,
  resetPasswordWithEmailOtp,
  lookupAccountEmailForPasswordReset,
  normalizeEmail,
  isValidEmail,
  SendEmailOtpResult,
  AccountEmailLookupResult,
} from './emailOtpService';

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
  loginWithPhone: (
    phone: string,
    storeName?: string,
    pinCode?: string,
    mode?: 'login' | 'register',
    email?: string,
    emailVerified?: boolean
  ) => Promise<{ success: boolean; error?: string }>;
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
    targetPhone?: string;
    userName?: string;
    storeName?: string;
    accountType?: 'owner' | 'member';
    expiresAt?: number;
    retryAfterSeconds?: number;
    remainingRequestsInWindow?: number;
    deliveryMethod?: 'meta_cloud_api' | 'custom_gateway' | 'simulation';
    apiWarning?: string;
    demoOtpCode?: string;
  }>;
  sendEmailRecoveryCode: (phoneOrEmail: string) => Promise<
    SendEmailOtpResult & { account?: AccountEmailLookupResult }
  >;
  resetAdminPasswordWithCode: (
    code: string,
    newPassword: string,
    phone?: string
  ) => Promise<{
    success: boolean;
    error?: string;
    shopPhone?: string;
    userName?: string;
    accountType?: 'owner' | 'member';
  }>;
  resetAdminPasswordWithEmailCode: (
    email: string,
    code: string,
    newPassword: string,
    shopPhone?: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
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
  LAST_LOGGED_PHONE: 'golden_shop_last_logged_phone',
};

async function clearLocalDataForPhoneSwitch(): Promise<void> {
  try {
    await Promise.all([
      db.products.clear(),
      db.customers.clear(),
      db.sales.clear(),
      db.repairs.clear(),
      db.spareParts.clear(),
      db.warranties.clear(),
      db.savTickets.clear(),
      db.suppliers.clear(),
      db.supplierPayments.clear(),
      db.supplierPurchaseOrders.clear(),
      db.customerPayments.clear(),
      db.expenses.clear(),
      db.recurringExpenses.clear(),
      db.cashClosures.clear(),
      db.stockMovements.clear(),
      db.outbox.clear(),
      db.syncConflicts.clear(),
    ]);
  } catch (e) {
    console.warn('Notice clearing tables on phone switch:', e);
  }
}

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

  // Phone + Secret PIN Authentication: Link & protect account across any device
  const loginWithPhone = useCallback(
    async (
      rawPhone: string,
      storeName?: string,
      pinCode?: string,
      mode: 'login' | 'register' = 'login',
      email?: string,
      emailVerified?: boolean
    ): Promise<{ success: boolean; error?: string }> => {
      const cleanPhone = normalizeShopPhoneNumber(rawPhone);
      if (!cleanPhone || cleanPhone.length < 9) {
        return { success: false, error: 'المرجو إدخال رقم هاتف صحيح (مثال: 0612345678)' };
      }

      const cleanPin = (pinCode || '').trim();
      if (cleanPin.length < 4) {
        return {
          success: false,
          error: 'المرجو إدخال الكود السري المكون من 4 أرقام على الأقل لحماية حسابك.',
        };
      }

      const cleanEmail = email ? normalizeEmail(email) : '';
      if (mode === 'register') {
        if (!cleanEmail || !isValidEmail(cleanEmail)) {
          return {
            success: false,
            error: 'المرجو إدخال بريد Gmail صحيح وتأكيده لإكمال التسجيل أول مرة.',
          };
        }
      }

      try {
        const currentSettings = await getStoreSettings();
        const prevShopPhone = normalizeShopPhoneNumber(
          localStorage.getItem(STORAGE_KEYS.LAST_LOGGED_PHONE) ||
            currentSettings.phone ||
            currentSettings.shopId
        );

        // First, inspect shops/{cleanPhone} in Firestore BEFORE modifying local data
        let effectiveShopPhone = cleanPhone;
        let remoteStoreName = storeName?.trim() || '';
        let remotePinCode = '';
        let shopExistsInCloud = false;
        let shopDocRef = doc(firestore, 'shops', effectiveShopPhone);

        try {
          const shopSnap = await getDoc(shopDocRef);
          if (shopSnap.exists()) {
            shopExistsInCloud = true;
            const data = shopSnap.data();
            if (data?.storeName && !remoteStoreName) {
              remoteStoreName = data.storeName;
            }
            if (data?.pinCode) {
              remotePinCode = String(data.pinCode).trim();
            }
          } else if (mode === 'login') {
            // Multi-user lookup: check if cleanPhone is a registered Employee / Co-Admin WhatsApp number
            const resolvedMember = await findUserAccountByWhatsAppPhone(cleanPhone);
            if (resolvedMember && resolvedMember.shopPhone) {
              effectiveShopPhone = resolvedMember.shopPhone;
              shopDocRef = doc(firestore, 'shops', effectiveShopPhone);
              const parentSnap = await getDoc(shopDocRef);
              if (parentSnap.exists()) {
                shopExistsInCloud = true;
                const pData = parentSnap.data();
                if (pData?.storeName && !remoteStoreName) {
                  remoteStoreName = pData.storeName;
                }
                if (pData?.pinCode) {
                  remotePinCode = String(pData.pinCode).trim();
                }
              }
            }
          }
        } catch (e) {
          console.warn('Firestore shop check notice:', e);
        }

        // Also check settings/store_settings subcollection in Firestore
        let remoteMembers = Array.isArray(currentSettings.shopMembers)
          ? currentSettings.shopMembers
          : [];
        if (shopExistsInCloud) {
          try {
            const settingsSnap = await getDoc(
              doc(firestore, 'shops', effectiveShopPhone, 'settings', 'store_settings')
            );
            if (settingsSnap.exists()) {
              const sVal = settingsSnap.data()?.value;
              if (sVal?.pinCode && !remotePinCode) {
                remotePinCode = String(sVal.pinCode).trim();
              }
              if (Array.isArray(sVal?.shopMembers)) {
                remoteMembers = sVal.shopMembers;
              }
            }
          } catch {}
        }

        // Verify PIN when account already has a configured PIN
        const effectiveStoredPin =
          remotePinCode ||
          (prevShopPhone === effectiveShopPhone && currentSettings.pinCode
            ? String(currentSettings.pinCode).trim()
            : '');

        let matchedRole: UserRole = 'owner';
        let matchedUserName = currentSettings.adminName || 'المدير';
        let matchedUserId = 'owner';

        if (mode === 'register' && shopExistsInCloud && effectiveStoredPin && effectiveStoredPin !== cleanPin) {
          return {
            success: false,
            error:
              'هذا الرقم مسجل مسبقاً بكود سري آخر! إذا كان حسابك، اختر "تسجيل الدخول" وأدخل الكود السري الصحيح.',
          };
        }

        if (effectiveStoredPin) {
          // If the user logged in using a member's personal WhatsApp number, check that member first
          const directPhoneMember = remoteMembers.find(
            (m) =>
              m.active &&
              normalizeShopPhoneNumber(m.phone) === cleanPhone &&
              m.pin_code &&
              String(m.pin_code).trim() === cleanPin
          );

          if (directPhoneMember) {
            matchedRole = directPhoneMember.role || 'employee';
            matchedUserName = directPhoneMember.full_name || 'العامل';
            matchedUserId = directPhoneMember.id || 'employee';
          } else if (cleanPhone === effectiveShopPhone && cleanPin === effectiveStoredPin) {
            matchedRole = 'owner';
          } else {
            // Check if PIN belongs to any active employee/member of this shop
            const matchedMember = remoteMembers.find(
              (m) => m.active && m.pin_code && String(m.pin_code).trim() === cleanPin
            );
            if (matchedMember) {
              matchedRole = matchedMember.role || 'employee';
              matchedUserName = matchedMember.full_name || 'العامل';
              matchedUserId = matchedMember.id || 'employee';
            } else {
              return {
                success: false,
                error:
                  'الكود السري (PIN) غير صحيح لهذا الحساب. إذا نسيت كلمة السر اضغط على "نسيت كلمة السر؟".',
              };
            }
          }
        }

        // Now that PIN is verified, if switching from a different phone number, clear old local tables
        if (prevShopPhone && prevShopPhone !== effectiveShopPhone) {
          stopRealtimeSync();
          await clearLocalDataForPhoneSwitch();
        }
        localStorage.setItem(STORAGE_KEYS.LAST_LOGGED_PHONE, effectiveShopPhone);

        // 1. Set active phone in local storage
        setActiveShopPhoneNumber(effectiveShopPhone);
        setCurrentShopId(effectiveShopPhone);
        setActivePhoneState(effectiveShopPhone);

        // 2. Save or update parent document shops/{effectiveShopPhone} with pinCode (if owner)
        const ownerPinToSave = effectiveStoredPin || cleanPin;
        try {
          await setDoc(
            shopDocRef,
            {
              phone: effectiveShopPhone,
              phoneNumber: effectiveShopPhone,
              storeName: remoteStoreName || currentSettings.storeName || 'المحل الذهبي',
              pinCode: ownerPinToSave,
              updated_at: new Date().toISOString(),
              ...(shopExistsInCloud ? {} : { created_at: new Date().toISOString() }),
              ...(cleanEmail
                ? {
                    email: cleanEmail,
                    adminEmail: cleanEmail,
                    emailVerified: Boolean(emailVerified),
                  }
                : {}),
            },
            { merge: true }
          );
        } catch (e) {
          console.warn('Firestore shop save notice:', e);
        }

        // 3. Pull existing cloud records for shops/{effectiveShopPhone} BEFORE unlocking
        try {
          const { pullShopDataFromFirestore } = await import('./firebaseSync');
          await pullShopDataFromFirestore(effectiveShopPhone);
        } catch (e) {
          console.warn('Initial pull notice:', e);
        }

        // 4. Update local store settings with the resolved store name, phone number & PIN
        const latestSettings = await getStoreSettings();
        const finalStoreName =
          remoteStoreName ||
          (shopExistsInCloud ? latestSettings.storeName : '') ||
          currentSettings.storeName ||
          'المحل الذهبي';

        await saveStoreSettings({
          ...latestSettings,
          shopId: effectiveShopPhone,
          phone: effectiveShopPhone,
          adminPhone: latestSettings.adminPhone || effectiveShopPhone,
          adminEmail: cleanEmail || latestSettings.adminEmail,
          emailVerified: cleanEmail ? Boolean(emailVerified) : latestSettings.emailVerified,
          pinCode: ownerPinToSave,
          storeName: finalStoreName,
        });

        // Index shop members by phone in Firestore for multi-user login & OTP recovery
        if (Array.isArray(latestSettings.shopMembers) && latestSettings.shopMembers.length > 0) {
          syncShopMembersPhoneIndex(
            effectiveShopPhone,
            finalStoreName,
            latestSettings.shopMembers
          ).catch(() => {});
        }

        // 5. Mark session unlocked and update timestamp
        const now = Date.now();
        localStorage.setItem(STORAGE_KEYS.VERIFIED_AT, String(now));
        localStorage.setItem(STORAGE_KEYS.SESSION_UNLOCKED, 'true');
        localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, '0');
        localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);

        setSessionPinSecret(effectiveShopPhone);
        setUserRole(
          matchedRole,
          matchedRole === 'owner' ? latestSettings.adminName || 'المدير' : matchedUserName,
          matchedUserId
        );
        setIsUnlocked(true);
        setFailedAttempts(0);
        setLockoutSecondsLeft(0);
        lastActivityRef.current = now;

        // 6. Start Firebase real-time listeners & background sync for shops/{effectiveShopPhone}
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
    stopRealtimeSync();
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
  const setupInitialPin = async () => ({ success: true });
  const verifyPin = async () => ({
    success: true,
    remainingAttempts: MAX_FAILED_ATTEMPTS,
    lockedOut: false,
  });

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

  const sendWhatsAppRecoveryCode = useCallback(async (phone: string) => {
    return await createAndSendPasswordResetOtp(phone);
  }, []);

  const sendEmailRecoveryCode = useCallback(async (phoneOrEmail: string) => {
    const lookup = await lookupAccountEmailForPasswordReset(phoneOrEmail);
    if (!lookup.found || !lookup.email) {
      return {
        success: false,
        error: lookup.error || 'تعذر العثور على الحساب أو البريد المرتبط به.',
        account: lookup,
      };
    }
    const sendRes = await sendEmailOtp({
      email: lookup.email,
      type: 'password_reset',
      storeName: lookup.storeName || 'المحل الذهبي',
      userName: lookup.userName,
      phone: lookup.shopPhone,
    });
    return {
      ...sendRes,
      account: lookup,
    };
  }, []);

  const resetAdminPasswordWithCode = useCallback(
    async (code: string, newPassword: string, phone?: string) => {
      return await verifyOtpAndResetUserPassword({
        rawPhone: phone || activePhone,
        otpCode: code,
        newPassword,
      });
    },
    [activePhone]
  );

  const resetAdminPasswordWithEmailCode = useCallback(
    async (email: string, code: string, newPassword: string, shopPhone?: string) => {
      return await resetPasswordWithEmailOtp({
        email,
        otp: code,
        newPassword,
        shopPhone: shopPhone || activePhone,
      });
    },
    [activePhone]
  );

  const verifyAdminPasswordOnly = async () => true;

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

  const changePin = async (
    currentPin: string,
    newPin: string
  ): Promise<{ success: boolean; error?: 'wrong_current' | 'invalid_format' }> => {
    const cleanNew = newPin.trim();
    if (cleanNew.length < 4) {
      return { success: false, error: 'invalid_format' };
    }
    const settings = await getStoreSettings();
    if (settings.pinCode && settings.pinCode.trim() !== currentPin.trim()) {
      return { success: false, error: 'wrong_current' };
    }
    await saveStoreSettings({
      ...settings,
      pinCode: cleanNew,
    });
    const phone = getActiveShopPhoneNumber();
    if (phone) {
      try {
        await setDoc(
          doc(firestore, 'shops', phone),
          { pinCode: cleanNew, updated_at: new Date().toISOString() },
          { merge: true }
        );
      } catch {}
    }
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
        sendEmailRecoveryCode,
        resetAdminPasswordWithCode,
        resetAdminPasswordWithEmailCode,
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
