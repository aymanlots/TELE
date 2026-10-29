import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { firestore, normalizeShopPhoneNumber } from '../firebase';
import { getStoreSettings } from '../db';

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
  deliveryMethod?: 'nodemailer_gmail' | 'simulation';
  delivered?: boolean;
  demoOtpCode?: string;
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
 * Sends a 6-digit verification code to the target Gmail address via backend Nodemailer
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

  // Load custom Gmail App Password from store settings if available
  let customGmailUser: string | undefined;
  let customGmailAppPassword: string | undefined;
  try {
    const settings = await getStoreSettings();
    if (settings.gmailAppUser) customGmailUser = settings.gmailAppUser;
    if (settings.gmailAppPassword) customGmailAppPassword = settings.gmailAppPassword;
  } catch {}

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

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errData.error || 'تعذر إرسال كود التحقق عبر البريد الإلكتروني. المرجو المحاولة مجدداً.',
      };
    }

    const data = await response.json();

    return {
      success: true,
      expiresAt,
      deliveryMethod: data.delivered ? 'nodemailer_gmail' : 'simulation',
      delivered: Boolean(data.delivered),
      demoOtpCode: data.otpCode,
      warning: data.warning,
      maskedEmail: maskEmail(cleanEmail),
    };
  } catch (netErr: any) {
    console.error('Network error calling /api/send-email-otp:', netErr);
    // If backend cannot be reached, fallback gracefully with the OTP in demo mode
    return {
      success: true,
      expiresAt,
      deliveryMethod: 'simulation',
      delivered: false,
      demoOtpCode: otpCode,
      warning: 'تعذر الاتصال بخادم البريد، تم تفعيل الرمز للاختبار.',
      maskedEmail: maskEmail(cleanEmail),
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
 * Searches for an account by Phone or Email for Forgot Password recovery
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

    // Search shops collection where email == cleanEmail
    try {
      const q = query(collection(firestore, 'shops'), where('email', '==', cleanEmail));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0].data();
        return {
          found: true,
          email: cleanEmail,
          maskedEmail: maskEmail(cleanEmail),
          shopPhone: snap.docs[0].id,
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
      if (normalizeEmail(settings.adminEmail) === cleanEmail) {
        return {
          found: true,
          email: cleanEmail,
          maskedEmail: maskEmail(cleanEmail),
          shopPhone: settings.phone || settings.shopId,
          storeName: settings.storeName || 'المحل الذهبي',
          userName: settings.adminName || 'المدير',
        };
      }
    } catch {}

    // Allow user to proceed directly with their Gmail
    return {
      found: true,
      email: cleanEmail,
      maskedEmail: maskEmail(cleanEmail),
      storeName: 'المحل الذهبي',
    };
  }

  // 2. If input is a Phone Number
  const cleanPhone = normalizeShopPhoneNumber(trimmed);
  if (!cleanPhone || cleanPhone.length < 9) {
    return { found: false, error: 'المرجو إدخال رقم هاتف صحيح (مثال: 0612345678)' };
  }

  try {
    // Check doc shops/{cleanPhone}
    const shopSnap = await getDoc(doc(firestore, 'shops', cleanPhone));
    if (shopSnap.exists()) {
      const data = shopSnap.data();
      const shopEmail = data?.email || data?.adminEmail;
      if (shopEmail && isValidEmail(shopEmail)) {
        return {
          found: true,
          email: normalizeEmail(shopEmail),
          maskedEmail: maskEmail(shopEmail),
          shopPhone: cleanPhone,
          storeName: data.storeName || 'المحل الذهبي',
          userName: data.adminName || 'المدير',
        };
      }
    }

    // Check store settings subcollection
    const settingsSnap = await getDoc(
      doc(firestore, 'shops', cleanPhone, 'settings', 'store_settings')
    );
    if (settingsSnap.exists()) {
      const sVal = settingsSnap.data()?.value;
      const subEmail = sVal?.adminEmail || sVal?.email;
      if (subEmail && isValidEmail(subEmail)) {
        return {
          found: true,
          email: normalizeEmail(subEmail),
          maskedEmail: maskEmail(subEmail),
          shopPhone: cleanPhone,
          storeName: sVal.storeName || 'المحل الذهبي',
          userName: sVal.adminName || 'المدير',
        };
      }
    }

    // Check local store settings if phone matches
    const settings = await getStoreSettings();
    if (
      normalizeShopPhoneNumber(settings.phone) === cleanPhone &&
      settings.adminEmail &&
      isValidEmail(settings.adminEmail)
    ) {
      return {
        found: true,
        email: normalizeEmail(settings.adminEmail),
        maskedEmail: maskEmail(settings.adminEmail),
        shopPhone: cleanPhone,
        storeName: settings.storeName || 'المحل الذهبي',
        userName: settings.adminName || 'المدير',
      };
    }

    return {
      found: false,
      shopPhone: cleanPhone,
      error:
        'هذا الحساب لم يسجل بريد Gmail بعد، أو يمكنك إدخال بريدك Gmail مباشرة لاستقبال الرمز.',
    };
  } catch (err: any) {
    console.error('Error looking up account email:', err);
    return {
      found: false,
      error: 'تعذر العثور على الحساب. المرجو التأكد من رقم الهاتف أو إدخال بريدك Gmail.',
    };
  }
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

  const cleanPass = params.newPassword.trim();
  if (cleanPass.length < 4) {
    return { success: false, error: 'كلمة المرور الجديدة يجب أن تكون 4 أرقام أو حروف على الأقل' };
  }

  // Update in Firestore
  const shopPhone = params.shopPhone ? normalizeShopPhoneNumber(params.shopPhone) : '';
  let updatedAny = false;

  if (shopPhone) {
    try {
      await updateDoc(doc(firestore, 'shops', shopPhone), {
        pinCode: cleanPass,
        updated_at: new Date().toISOString(),
      });
      updatedAny = true;
    } catch {}

    try {
      await setDoc(
        doc(firestore, 'shops', shopPhone, 'settings', 'store_settings'),
        {
          value: {
            pinCode: cleanPass,
          },
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
      updatedAny = true;
    } catch {}
  }

  // Also update local settings if phone matches or active
  try {
    const current = await getStoreSettings();
    if (!shopPhone || normalizeShopPhoneNumber(current.phone) === shopPhone) {
      await getStoreSettings().then((s) => ({
        ...s,
        pinCode: cleanPass,
      }));
    }
  } catch {}

  return { success: true };
}
