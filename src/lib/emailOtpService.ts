import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { firestore, normalizeShopPhoneNumber } from '../firebase';
import { getStoreSettings, saveStoreSettings } from '../db';

export const LOCAL_GMAIL_SMTP_KEY = 'golden_shop_gmail_smtp_config';

export interface LocalGmailSmtpConfig {
  gmailUser: string;
  gmailAppPassword: string;
}

export function getLocalGmailSmtpConfig(): LocalGmailSmtpConfig {
  try {
    const raw = localStorage.getItem(LOCAL_GMAIL_SMTP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        gmailUser: parsed.gmailUser || '',
        gmailAppPassword: parsed.gmailAppPassword || '',
      };
    }
  } catch {}
  return { gmailUser: '', gmailAppPassword: '' };
}

export function saveLocalGmailSmtpConfig(cfg: Partial<LocalGmailSmtpConfig>): void {
  try {
    const current = getLocalGmailSmtpConfig();
    localStorage.setItem(LOCAL_GMAIL_SMTP_KEY, JSON.stringify({ ...current, ...cfg }));
  } catch {}
}

export interface SendEmailOtpParams {
  email: string;
  type: 'register_verification' | 'password_reset' | 'test';
  storeName?: string;
  userName?: string;
  phone?: string;
}

export interface SendEmailOtpResult {
  success: boolean;
  error?: string;
  warning?: string;
  expiresAt?: number;
  deliveryMethod?: 'nodemailer_gmail';
  delivered?: boolean;
  maskedEmail?: string;
}

export interface VerifyEmailOtpParams {
  email: string;
  otp: string;
  type?: 'register_verification' | 'password_reset' | 'test';
}

export interface ResetPasswordWithEmailParams {
  email: string;
  otp: string;
  newPassword: string;
  shopPhone?: string;
}

export interface AccountEmailLookupResult {
  found: boolean;
  email?: string;
  maskedEmail?: string;
  shopPhone?: string;
  storeName?: string;
  userName?: string;
  error?: string;
}

/**
 * Normalizes email address to lower case and trimmed
 */
export function normalizeEmail(email: string | undefined): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Validates standard email address format
 */
export function isValidEmail(email: string | undefined): boolean {
  if (!email) return false;
  const clean = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

/**
 * Specifically checks if email is a Gmail address
 */
export function isGmailAddress(email: string | undefined): boolean {
  if (!email) return false;
  const clean = normalizeEmail(email);
  return clean.endsWith('@gmail.com') || clean.endsWith('@googlemail.com');
}

/**
 * Masks email address for secure user display (e.g. ai***li@gmail.com)
 */
export function maskEmail(email: string | undefined): string {
  if (!email) return '';
  const clean = normalizeEmail(email);
  const parts = clean.split('@');
  if (parts.length !== 2) return clean;
  const [name, domain] = parts;
  if (name.length <= 2) {
    return `${name.charAt(0)}***@${domain}`;
  }
  const firstChars = name.slice(0, 2);
  const lastChars = name.slice(-2);
  return `${firstChars}***${lastChars}@${domain}`;
}

/**
 * Generates an OTP document ID from email
 */
function getEmailDocId(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * Sends a 6-digit verification code to the target Gmail address via backend Nodemailer.
 * NEVER returns or exposes the OTP code in the client response.
 */
export async function sendEmailOtp(params: SendEmailOtpParams): Promise<SendEmailOtpResult> {
  const cleanEmail = normalizeEmail(params.email);

  if (!isValidEmail(cleanEmail)) {
    return {
      success: false,
      error: 'المرجو إدخال بريد إلكتروني Gmail صحيح (مثال: exemple@gmail.com)',
    };
  }

  // Generate random 6-digit OTP
  const otpCode = String(Math.floor(100000 + Math.random() * 900000));
  const now = Date.now();
  const expiresAt = now + 5 * 60 * 1000; // Strictly 5 minutes expiration

  // Load custom Gmail App Password from local config, store settings, or Firestore platform_config
  const localSmtp = getLocalGmailSmtpConfig();
  let customGmailUser: string | undefined = localSmtp.gmailUser || undefined;
  let customGmailAppPassword: string | undefined = localSmtp.gmailAppPassword || undefined;

  try {
    const settings = await getStoreSettings();
    if (settings.gmailAppUser && !customGmailUser) customGmailUser = settings.gmailAppUser;
    if (settings.gmailAppPassword && !customGmailAppPassword) {
      customGmailAppPassword = settings.gmailAppPassword;
    }
  } catch {}

  if (!customGmailAppPassword && params.phone) {
    try {
      const cleanShopPhone = normalizeShopPhoneNumber(params.phone);
      if (cleanShopPhone) {
        const shopSnap = await getDoc(doc(firestore, 'shops', cleanShopPhone));
        if (shopSnap.exists()) {
          const d = shopSnap.data();
          if (d?.gmailAppUser && !customGmailUser) customGmailUser = String(d.gmailAppUser);
          if (d?.gmailAppPassword && !customGmailAppPassword) {
            customGmailAppPassword = String(d.gmailAppPassword);
          }
        }
      }
    } catch {}
  }

  if (!customGmailAppPassword) {
    try {
      const globalSmtp = await getDoc(doc(firestore, 'platform_config', 'email_smtp'));
      if (globalSmtp.exists()) {
        const g = globalSmtp.data();
        if (g?.gmailAppUser && !customGmailUser) customGmailUser = String(g.gmailAppUser);
        if (g?.gmailAppPassword && !customGmailAppPassword) {
          customGmailAppPassword = String(g.gmailAppPassword);
        }
      }
    } catch {}
  }

  // 1. Store OTP in Firestore with 5-minute lifespan
  const docId = getEmailDocId(cleanEmail);
  const otpDocRef = doc(firestore, 'email_verification_otps', docId);

  try {
    await setDoc(otpDocRef, {
      email: cleanEmail,
      otp: otpCode,
      type: params.type,
      storeName: params.storeName || 'المحل الذهبي',
      userName: params.userName || '',
      phone: params.phone || '',
      createdAt: now,
      expiresAt,
      attempts: 0,
      verified: false,
    });
  } catch (firestoreErr) {
    console.warn('Firestore OTP record notice:', firestoreErr);
  }

  // 2. Dispatch to backend Express Nodemailer endpoint
  try {
    const response = await fetch('/api/send-email-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: cleanEmail,
        otp: otpCode,
        type: params.type,
        storeName: params.storeName || 'المحل الذهبي',
        userName: params.userName,
        customGmailUser,
        customGmailAppPassword,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.delivered) {
      return {
        success: false,
        delivered: false,
        error:
          data.error ||
          'تعذر إرسال كود التحقق إلى بريد Gmail لأن كلمة مرور تطبيق Gmail (App Password) غير مضبوطة بعد. يمكنك التفعيل أو الاسترجاع مجاناً وبشكل فوري عبر زر (التأكيد عبر حساب Google).',
      };
    }

    return {
      success: true,
      expiresAt,
      deliveryMethod: 'nodemailer_gmail',
      delivered: true,
      maskedEmail: maskEmail(cleanEmail),
    };
  } catch (netErr: any) {
    console.error('Network error calling /api/send-email-otp:', netErr);
    return {
      success: false,
      delivered: false,
      error:
        'تعذر الاتصال بخادم البريد حالياً. يمكنك استخدام زر (التأكيد الفوري والمجاني عبر حساب Google).',
    };
  }
}

/**
 * Verifies the 6-digit code against Firestore record
 */
export async function verifyEmailOtp(params: VerifyEmailOtpParams): Promise<{
  success: boolean;
  error?: string;
}> {
  const cleanEmail = normalizeEmail(params.email);
  const cleanCode = (params.otp || '').trim();

  if (cleanCode.length !== 6) {
    return { success: false, error: 'المرجو إدخال كود التحقق كاملاً المكون من 6 أرقام.' };
  }

  const docId = getEmailDocId(cleanEmail);
  const otpDocRef = doc(firestore, 'email_verification_otps', docId);

  try {
    const snap = await getDoc(otpDocRef);
    if (!snap.exists()) {
      return {
        success: false,
        error: 'لم يتم العثور على رمز تحقق صالح لهذا البريد. المرجو طلب رمز جديد.',
      };
    }

    const data = snap.data();
    const now = Date.now();

    // Check expiration (5 minutes)
    if (now > (data.expiresAt || 0)) {
      return {
        success: false,
        error: 'انتهت صلاحية رمز التحقق (صالح لمدة 5 دقائق فقط). المرجو النقر على إعادة الإرسال.',
      };
    }

    // Check attempts limit (max 5)
    if ((data.attempts || 0) >= 5) {
      return {
        success: false,
        error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة. المرجو طلب رمز جديد.',
      };
    }

    // Check code match
    if (String(data.otp).trim() !== cleanCode) {
      // Increment failed attempts
      await updateDoc(otpDocRef, {
        attempts: (data.attempts || 0) + 1,
      }).catch(() => {});

      const remaining = 5 - ((data.attempts || 0) + 1);
      return {
        success: false,
        error: `رمز التحقق غير صحيح. باقي لديك ${remaining} محاولات.`,
      };
    }

    // Code matches! Mark as verified
    await updateDoc(otpDocRef, {
      verified: true,
      verifiedAt: now,
    }).catch(() => {});

    return { success: true };
  } catch (err: any) {
    console.error('Error verifying email OTP:', err);
    return {
      success: false,
      error: 'حدث خطأ أثناء التحقق من الرمز. المرجو المحاولة مجدداً.',
    };
  }
}

/**
 * Searches for an existing registered account by Phone or Email for Forgot Password recovery.
 * Rejects unregistered phone numbers or unregistered emails.
 */
export async function lookupAccountEmailForPasswordReset(
  queryInput: string
): Promise<AccountEmailLookupResult> {
  const trimmed = queryInput.trim();
  if (!trimmed) {
    return { found: false, error: 'المرجو إدخال رقم الهاتف أو بريد Gmail المسجل' };
  }

  // 1. If input is an email address
  if (trimmed.includes('@')) {
    const cleanEmail = normalizeEmail(trimmed);
    if (!isValidEmail(cleanEmail)) {
      return { found: false, error: 'صيغة البريد الإلكتروني غير صحيحة' };
    }

    // Search shops collection where email == cleanEmail or adminEmail == cleanEmail
    try {
      const q1 = query(collection(firestore, 'shops'), where('email', '==', cleanEmail));
      const snap1 = await getDocs(q1);
      if (!snap1.empty) {
        const docData = snap1.docs[0].data();
        return {
          found: true,
          email: cleanEmail,
          maskedEmail: maskEmail(cleanEmail),
          shopPhone: snap1.docs[0].id,
          storeName: docData.storeName || 'المحل الذهبي',
          userName: docData.adminName || 'المدير',
        };
      }

      const q2 = query(collection(firestore, 'shops'), where('adminEmail', '==', cleanEmail));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        const docData = snap2.docs[0].data();
        return {
          found: true,
          email: cleanEmail,
          maskedEmail: maskEmail(cleanEmail),
          shopPhone: snap2.docs[0].id,
          storeName: docData.storeName || 'المحل الذهبي',
          userName: docData.adminName || 'المدير',
        };
      }
    } catch (e) {
      console.warn('Query by email notice:', e);
    }

    // Check local store settings if matches
    try {
      const settings = await getStoreSettings();
      if (
        normalizeEmail(settings.adminEmail) === cleanEmail &&
        (settings.phone || settings.shopId)
      ) {
        return {
          found: true,
          email: cleanEmail,
          maskedEmail: maskEmail(cleanEmail),
          shopPhone: normalizeShopPhoneNumber(settings.phone || settings.shopId),
          storeName: settings.storeName || 'المحل الذهبي',
          userName: settings.adminName || 'المدير',
        };
      }
    } catch {}

    return {
      found: false,
      error: 'هذا البريد الإلكتروني غير مرتبط بأي حساب محل مسجل في النظام! تأكد من البريد أو أدخل رقم هاتف المحل.',
    };
  }

  // 2. If input is a Phone Number
  const cleanPhone = normalizeShopPhoneNumber(trimmed);
  if (!cleanPhone || cleanPhone.length < 9) {
    return { found: false, error: 'المرجو إدخال رقم هاتف صحيح (مثال: 0612345678)' };
  }

  try {
    let shopExists = false;
    let foundStoreName = 'المحل الذهبي';
    let foundUserName = 'المدير';

    // Check doc shops/{cleanPhone}
    const shopSnap = await getDoc(doc(firestore, 'shops', cleanPhone));
    if (shopSnap.exists()) {
      shopExists = true;
      const data = shopSnap.data();
      foundStoreName = data?.storeName || foundStoreName;
      foundUserName = data?.adminName || foundUserName;
      const shopEmail = data?.email || data?.adminEmail;
      if (shopEmail && isValidEmail(shopEmail)) {
        return {
          found: true,
          email: normalizeEmail(shopEmail),
          maskedEmail: maskEmail(shopEmail),
          shopPhone: cleanPhone,
          storeName: foundStoreName,
          userName: foundUserName,
        };
      }
    }

    // Check store settings subcollection
    const settingsSnap = await getDoc(
      doc(firestore, 'shops', cleanPhone, 'settings', 'store_settings')
    );
    if (settingsSnap.exists()) {
      shopExists = true;
      const sVal = settingsSnap.data()?.value;
      foundStoreName = sVal?.storeName || foundStoreName;
      foundUserName = sVal?.adminName || foundUserName;
      const subEmail = sVal?.adminEmail || sVal?.email;
      if (subEmail && isValidEmail(subEmail)) {
        return {
          found: true,
          email: normalizeEmail(subEmail),
          maskedEmail: maskEmail(subEmail),
          shopPhone: cleanPhone,
          storeName: foundStoreName,
          userName: foundUserName,
        };
      }
    }

    // Check local store settings if phone matches
    const settings = await getStoreSettings();
    if (normalizeShopPhoneNumber(settings.phone) === cleanPhone && settings.pinCode) {
      shopExists = true;
      if (settings.adminEmail && isValidEmail(settings.adminEmail)) {
        return {
          found: true,
          email: normalizeEmail(settings.adminEmail),
          maskedEmail: maskEmail(settings.adminEmail),
          shopPhone: cleanPhone,
          storeName: settings.storeName || foundStoreName,
          userName: settings.adminName || foundUserName,
        };
      }
    }

    if (!shopExists) {
      return {
        found: false,
        error: 'رقم الهاتف هذا غير مسجل في النظام! تأكد من الرقم أو أنشئ حساباً جديداً.',
      };
    }

    return {
      found: false,
      shopPhone: cleanPhone,
      storeName: foundStoreName,
      userName: foundUserName,
      error:
        'هذا الحساب مسجل بدون بريد Gmail، أو لم يتم ربط بريد Gmail به بعد.',
    };
  } catch (err: any) {
    console.error('Error looking up account email:', err);
    return {
      found: false,
      error: 'تعذر العثور على الحساب. المرجو التأكد من رقم الهاتف أو البريد الإلكتروني.',
    };
  }
}

/**
 * Updates the shop's PIN/password in Firestore and local IndexedDB
 */
export async function updateShopPasswordInDb(
  shopPhone: string,
  newPassword: string,
  verifiedEmail?: string
): Promise<{ success: boolean; error?: string }> {
  const cleanPass = newPassword.trim();
  if (cleanPass.length < 4) {
    return { success: false, error: 'كلمة المرور الجديدة يجب أن تكون 4 أرقام على الأقل.' };
  }

  const cleanPhone = normalizeShopPhoneNumber(shopPhone);
  if (!cleanPhone) {
    return { success: false, error: 'رقم حساب المحل غير محدد.' };
  }

  try {
    await setDoc(
      doc(firestore, 'shops', cleanPhone),
      {
        pinCode: cleanPass,
        updated_at: new Date().toISOString(),
        ...(verifiedEmail
          ? {
              email: normalizeEmail(verifiedEmail),
              adminEmail: normalizeEmail(verifiedEmail),
              emailVerified: true,
            }
          : {}),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('Update shop doc notice:', e);
  }

  try {
    const setRef = doc(firestore, 'shops', cleanPhone, 'settings', 'store_settings');
    const setSnap = await getDoc(setRef);
    const existingVal = setSnap.exists() ? setSnap.data()?.value || {} : {};
    await setDoc(
      setRef,
      {
        value: {
          ...existingVal,
          pinCode: cleanPass,
          ...(verifiedEmail ? { adminEmail: normalizeEmail(verifiedEmail), emailVerified: true } : {}),
        },
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch {}

  try {
    const current = await getStoreSettings();
    const localPhone = normalizeShopPhoneNumber(current.phone || current.shopId);
    if (!localPhone || localPhone === cleanPhone) {
      await saveStoreSettings({
        ...current,
        pinCode: cleanPass,
        ...(verifiedEmail ? { adminEmail: normalizeEmail(verifiedEmail), emailVerified: true } : {}),
      });
    }
  } catch {}

  return { success: true };
}

/**
 * Resets user password/PIN after validating the 6-digit email OTP
 */
export async function resetPasswordWithEmailOtp(
  params: ResetPasswordWithEmailParams
): Promise<{ success: boolean; error?: string; storeName?: string }> {
  const verifyRes = await verifyEmailOtp({
    email: params.email,
    otp: params.otp,
    type: 'password_reset',
  });

  if (!verifyRes.success) {
    return { success: false, error: verifyRes.error };
  }

  const lookup = await lookupAccountEmailForPasswordReset(params.shopPhone || params.email);
  const resolvedPhone =
    (params.shopPhone ? normalizeShopPhoneNumber(params.shopPhone) : '') ||
    lookup.shopPhone ||
    '';

  if (!resolvedPhone) {
    return {
      success: false,
      error: 'تعذر تحديد رقم حساب المحل المرتبط بهذا البريد.',
    };
  }

  return await updateShopPasswordInDb(resolvedPhone, params.newPassword, params.email);
}

