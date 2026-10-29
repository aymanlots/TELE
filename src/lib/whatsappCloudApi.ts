/**
 * Meta WhatsApp Cloud API Integration & OTP Rate-Limiting Engine
 * - Generates cryptographically secure 6-digit OTP codes
 * - Enforces per-phone Rate Limiting (60s cooldown + max 3 requests per 15-minute window)
 * - Stores OTP records with 5-minute expiration in Firestore (`password_reset_otps/{phone}`)
 * - Sends OTP via official Meta WhatsApp Cloud API (`graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages`)
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import { firestore, normalizeShopPhoneNumber } from '../firebase';
import { formatWhatsAppPhone } from './whatsapp';
import { hashPinPBKDF2, verifyPinPBKDF2 } from './cryptoUtils';
import { getStoreSettings, saveStoreSettings } from '../db';
import { ShopMember, UserRole } from '../types';

export const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes exact expiration
export const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds minimum between sends
export const OTP_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes rate-limit window
export const OTP_MAX_REQUESTS_PER_WINDOW = 3; // Max 3 OTP sends per 15 minutes
export const OTP_MAX_VERIFY_ATTEMPTS = 5; // Max 5 wrong code guesses per OTP

const LOCAL_OTP_STORAGE_PREFIX = 'golden_shop_otp_record_';
const LOCAL_META_CONFIG_KEY = 'golden_shop_meta_cloud_config';

export interface MetaWhatsAppCloudConfig {
  phoneNumberId: string;
  accessToken: string;
  templateName?: string;
  templateLang?: string;
  apiVersion?: string;
  gatewayWebhookUrl?: string;
}

export interface PasswordResetOtpRecord {
  phone: string; // normalized 06xxxxxxxx
  e164Phone: string; // 2126xxxxxxxx
  shopPhone: string; // parent shop phone ID
  accountType: 'owner' | 'member';
  memberId?: string;
  userName: string;
  userRole: UserRole;
  otpCodeHash: string;
  createdAt: number; // ms
  expiresAt: number; // ms (createdAt + 5 minutes)
  expiresAtIso: string;
  used: boolean;
  usedAt?: number;
  verifyAttempts: number;
  // Rate limit tracking fields
  lastSentAt: number;
  windowStartAt: number;
  requestCountInWindow: number;
  lastDeliveryMethod?: 'meta_cloud_api' | 'custom_gateway' | 'simulation';
}

export interface ResolvedUserAccount {
  targetPhone: string; // normalized 06xxxxxxxx
  e164Phone: string; // 2126xxxxxxxx
  shopPhone: string; // shops/{shopPhone}
  accountType: 'owner' | 'member';
  memberId?: string;
  userName: string;
  userRole: UserRole;
  storeName: string;
}

/**
 * Generates a cryptographically random 6-digit OTP code (100000 - 999999)
 */
export function generateSixDigitOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const sixDigits = 100000 + (array[0] % 900000);
  return String(sixDigits);
}

/**
 * Masks a phone number for safe UI display (e.g. 0612345678 -> 0612•••678)
 */
export function maskPhoneNumber(phone: string): string {
  const clean = normalizeShopPhoneNumber(phone);
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)}•••${clean.slice(-3)}`;
}

/**
 * Save or load Meta WhatsApp Cloud API config locally + Firestore
 */
export function getLocalMetaCloudConfig(): Partial<MetaWhatsAppCloudConfig> {
  try {
    const raw = localStorage.getItem(LOCAL_META_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveLocalMetaCloudConfig(cfg: Partial<MetaWhatsAppCloudConfig>): void {
  try {
    const current = getLocalMetaCloudConfig();
    localStorage.setItem(LOCAL_META_CONFIG_KEY, JSON.stringify({ ...current, ...cfg }));
  } catch {}
}

/**
 * Resolves Meta WhatsApp Cloud API credentials from:
 * 1. Vite Environment Variables (VITE_META_WHATSAPP_PHONE_NUMBER_ID, VITE_META_WHATSAPP_ACCESS_TOKEN)
 * 2. Local / StoreSettings config
 * 3. Firestore `shops/{shopPhone}` or `platform_config/whatsapp_cloud_api`
 */
export async function resolveMetaWhatsAppConfig(
  shopPhone?: string
): Promise<MetaWhatsAppCloudConfig> {
  const envPhoneId = (import.meta.env.VITE_META_WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const envToken = (import.meta.env.VITE_META_WHATSAPP_ACCESS_TOKEN || '').trim();
  const envTemplate = (import.meta.env.VITE_META_WHATSAPP_TEMPLATE_NAME || '').trim();
  const envLang = (import.meta.env.VITE_META_WHATSAPP_TEMPLATE_LANG || 'ar').trim();
  const envVersion = (import.meta.env.VITE_META_WHATSAPP_API_VERSION || 'v20.0').trim();

  const localCfg = getLocalMetaCloudConfig();
  let settingsPhoneId = localCfg.phoneNumberId || '';
  let settingsToken = localCfg.accessToken || '';
  let settingsTemplate = localCfg.templateName || '';
  let settingsLang = localCfg.templateLang || '';
  let gatewayUrl = localCfg.gatewayWebhookUrl || '';

  try {
    const storeSettings = await getStoreSettings();
    if (storeSettings.metaPhoneNumberId) settingsPhoneId = storeSettings.metaPhoneNumberId.trim();
    if (storeSettings.metaAccessToken) settingsToken = storeSettings.metaAccessToken.trim();
    if (storeSettings.metaTemplateName) settingsTemplate = storeSettings.metaTemplateName.trim();
    if (storeSettings.metaTemplateLang) settingsLang = storeSettings.metaTemplateLang.trim();
    if (storeSettings.whatsappGatewayUrl) gatewayUrl = storeSettings.whatsappGatewayUrl.trim();
  } catch {}

  // If still missing and we have a shopPhone, check Firestore shop document or global config
  if ((!settingsPhoneId || !settingsToken) && shopPhone) {
    try {
      const shopSnap = await getDoc(doc(firestore, 'shops', shopPhone));
      if (shopSnap.exists()) {
        const d = shopSnap.data();
        if (d?.metaPhoneNumberId && !settingsPhoneId) settingsPhoneId = String(d.metaPhoneNumberId).trim();
        if (d?.metaAccessToken && !settingsToken) settingsToken = String(d.metaAccessToken).trim();
        if (d?.metaTemplateName && !settingsTemplate) settingsTemplate = String(d.metaTemplateName).trim();
        if (d?.whatsappGatewayUrl && !gatewayUrl) gatewayUrl = String(d.whatsappGatewayUrl).trim();
      }
    } catch {}
  }

  if (!settingsPhoneId || !settingsToken) {
    try {
      const globalSnap = await getDoc(doc(firestore, 'platform_config', 'whatsapp_cloud_api'));
      if (globalSnap.exists()) {
        const g = globalSnap.data();
        if (g?.phoneNumberId && !settingsPhoneId) settingsPhoneId = String(g.phoneNumberId).trim();
        if (g?.accessToken && !settingsToken) settingsToken = String(g.accessToken).trim();
        if (g?.templateName && !settingsTemplate) settingsTemplate = String(g.templateName).trim();
      }
    } catch {}
  }

  return {
    phoneNumberId: settingsPhoneId || envPhoneId,
    accessToken: settingsToken || envToken,
    templateName: settingsTemplate || envTemplate || undefined,
    templateLang: settingsLang || envLang || 'ar',
    apiVersion: envVersion || 'v20.0',
    gatewayWebhookUrl: gatewayUrl || undefined,
  };
}

/**
 * Indexes a shop's members by their WhatsApp phone numbers in Firestore `user_phone_index/{memberPhone}`
 * so multi-user lookup is instantaneous across devices.
 */
export async function syncShopMembersPhoneIndex(
  shopPhone: string,
  storeName: string,
  members: ShopMember[]
): Promise<void> {
  const cleanShopPhone = normalizeShopPhoneNumber(shopPhone);
  if (!cleanShopPhone || !Array.isArray(members)) return;

  for (const m of members) {
    const memberPhone = normalizeShopPhoneNumber(m.phone);
    if (!memberPhone || memberPhone.length < 9) continue;
    try {
      await setDoc(
        doc(firestore, 'user_phone_index', memberPhone),
        {
          phone: memberPhone,
          shopPhone: cleanShopPhone,
          memberId: m.id,
          fullName: m.full_name,
          role: m.role,
          active: m.active,
          pinCode: m.pin_code || '',
          storeName: storeName || 'المحل الذهبي',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {}
  }
}

/**
 * Finds any user account (Shop Owner, Co-Admin, or Employee) across all shops by their WhatsApp phone number.
 */
export async function findUserAccountByWhatsAppPhone(
  rawPhone: string
): Promise<ResolvedUserAccount | null> {
  const cleanPhone = normalizeShopPhoneNumber(rawPhone);
  if (!cleanPhone || cleanPhone.length < 9) return null;
  const e164Phone = formatWhatsAppPhone(cleanPhone);

  // 1. Check if cleanPhone is a primary Shop Owner account (`shops/{cleanPhone}`)
  try {
    const shopSnap = await getDoc(doc(firestore, 'shops', cleanPhone));
    if (shopSnap.exists()) {
      const data = shopSnap.data();
      return {
        targetPhone: cleanPhone,
        e164Phone,
        shopPhone: cleanPhone,
        accountType: 'owner',
        userName: data?.adminName || data?.storeName || 'المدير (مول المحل)',
        userRole: 'owner',
        storeName: data?.storeName || 'المحل الذهبي',
      };
    }
  } catch {}

  // 2. Check fast multi-user index `user_phone_index/{cleanPhone}`
  try {
    const idxSnap = await getDoc(doc(firestore, 'user_phone_index', cleanPhone));
    if (idxSnap.exists()) {
      const idx = idxSnap.data();
      if (idx?.shopPhone && idx?.active !== false) {
        return {
          targetPhone: cleanPhone,
          e164Phone,
          shopPhone: normalizeShopPhoneNumber(idx.shopPhone),
          accountType: 'member',
          memberId: idx.memberId,
          userName: idx.fullName || 'مستخدم المحل',
          userRole: (idx.role as UserRole) || 'employee',
          storeName: idx.storeName || 'المحل الذهبي',
        };
      }
    }
  } catch {}

  // 3. Scan `shops` collection for an owner's `adminPhone` or a member inside `shopMembers`
  try {
    const shopsSnap = await getDocs(collection(firestore, 'shops'));
    for (const shopDoc of shopsSnap.docs) {
      const sData = shopDoc.data();
      const sPhone = normalizeShopPhoneNumber(shopDoc.id);

      if (normalizeShopPhoneNumber(sData?.adminPhone) === cleanPhone) {
        return {
          targetPhone: cleanPhone,
          e164Phone,
          shopPhone: sPhone,
          accountType: 'owner',
          userName: sData?.adminName || sData?.storeName || 'المدير',
          userRole: 'owner',
          storeName: sData?.storeName || 'المحل الذهبي',
        };
      }

      const membersOnDoc: ShopMember[] = Array.isArray(sData?.shopMembers)
        ? sData.shopMembers
        : [];
      const foundInDoc = membersOnDoc.find(
        (m) => m.active && normalizeShopPhoneNumber(m.phone) === cleanPhone
      );
      if (foundInDoc) {
        return {
          targetPhone: cleanPhone,
          e164Phone,
          shopPhone: sPhone,
          accountType: 'member',
          memberId: foundInDoc.id,
          userName: foundInDoc.full_name || 'العامل',
          userRole: foundInDoc.role || 'employee',
          storeName: sData?.storeName || 'المحل الذهبي',
        };
      }

      // Also check settings/store_settings subcollection
      try {
        const setSnap = await getDoc(doc(firestore, 'shops', sPhone, 'settings', 'store_settings'));
        if (setSnap.exists()) {
          const val = setSnap.data()?.value;
          if (normalizeShopPhoneNumber(val?.adminPhone) === cleanPhone) {
            return {
              targetPhone: cleanPhone,
              e164Phone,
              shopPhone: sPhone,
              accountType: 'owner',
              userName: val?.adminName || val?.storeName || 'المدير',
              userRole: 'owner',
              storeName: val?.storeName || 'المحل الذهبي',
            };
          }
          const subMembers: ShopMember[] = Array.isArray(val?.shopMembers) ? val.shopMembers : [];
          const foundSub = subMembers.find(
            (m) => m.active && normalizeShopPhoneNumber(m.phone) === cleanPhone
          );
          if (foundSub) {
            return {
              targetPhone: cleanPhone,
              e164Phone,
              shopPhone: sPhone,
              accountType: 'member',
              memberId: foundSub.id,
              userName: foundSub.full_name || 'العامل',
              userRole: foundSub.role || 'employee',
              storeName: val?.storeName || 'المحل الذهبي',
            };
          }
        }
      } catch {}
    }
  } catch {}

  // 4. Check local IndexedDB storeSettings fallback
  try {
    const localSettings = await getStoreSettings();
    const localOwnerPhone = normalizeShopPhoneNumber(localSettings.phone || localSettings.adminPhone);
    if (localOwnerPhone === cleanPhone) {
      return {
        targetPhone: cleanPhone,
        e164Phone,
        shopPhone: localOwnerPhone,
        accountType: 'owner',
        userName: localSettings.adminName || localSettings.storeName || 'المدير',
        userRole: 'owner',
        storeName: localSettings.storeName || 'المحل الذهبي',
      };
    }
    const localMembers = Array.isArray(localSettings.shopMembers) ? localSettings.shopMembers : [];
    const foundLocal = localMembers.find(
      (m) => m.active && normalizeShopPhoneNumber(m.phone) === cleanPhone
    );
    if (foundLocal) {
      return {
        targetPhone: cleanPhone,
        e164Phone,
        shopPhone: localOwnerPhone || cleanPhone,
        accountType: 'member',
        memberId: foundLocal.id,
        userName: foundLocal.full_name || 'العامل',
        userRole: foundLocal.role || 'employee',
        storeName: localSettings.storeName || 'المحل الذهبي',
      };
    }
  } catch {}

  return null;
}

/**
 * Reads an existing OTP record from Firestore (or localStorage fallback)
 */
export async function getOtpRecordFromDb(
  cleanPhone: string
): Promise<PasswordResetOtpRecord | null> {
  try {
    const snap = await getDoc(doc(firestore, 'password_reset_otps', cleanPhone));
    if (snap.exists()) {
      return snap.data() as PasswordResetOtpRecord;
    }
  } catch {}

  try {
    const localRaw = localStorage.getItem(`${LOCAL_OTP_STORAGE_PREFIX}${cleanPhone}`);
    if (localRaw) {
      return JSON.parse(localRaw) as PasswordResetOtpRecord;
    }
  } catch {}

  return null;
}

/**
 * Saves an OTP record to Firestore (`password_reset_otps/{cleanPhone}` and `shops/{shopPhone}/otp_codes/{cleanPhone}`)
 * and localStorage fallback.
 */
async function saveOtpRecordToDb(record: PasswordResetOtpRecord): Promise<void> {
  try {
    localStorage.setItem(
      `${LOCAL_OTP_STORAGE_PREFIX}${record.phone}`,
      JSON.stringify(record)
    );
  } catch {}

  try {
    await setDoc(doc(firestore, 'password_reset_otps', record.phone), record);
  } catch (e) {
    console.warn('Firestore password_reset_otps save notice:', e);
  }

  if (record.shopPhone) {
    try {
      await setDoc(
        doc(firestore, 'shops', record.shopPhone, 'otp_codes', record.phone),
        record
      );
    } catch {}
  }
}

/**
 * Evaluates Rate Limiting rules for a phone number:
 * - Rule 1: 60-second cooldown between consecutive OTP requests
 * - Rule 2: Maximum 3 OTP requests within a 15-minute sliding window
 */
export function evaluateOtpRateLimit(
  existing: PasswordResetOtpRecord | null,
  now: number = Date.now()
): {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingInWindow: number;
  nextWindowStartAt: number;
  nextRequestCount: number;
  reason?: 'cooldown' | 'window_limit';
} {
  if (!existing) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingInWindow: OTP_MAX_REQUESTS_PER_WINDOW - 1,
      nextWindowStartAt: now,
      nextRequestCount: 1,
    };
  }

  // Check 60s cooldown since lastSentAt
  const elapsedSinceLastSend = now - (existing.lastSentAt || 0);
  if (elapsedSinceLastSend < OTP_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((OTP_COOLDOWN_MS - elapsedSinceLastSend) / 1000);
    const windowExpired = now - (existing.windowStartAt || 0) >= OTP_RATE_WINDOW_MS;
    const usedCount = windowExpired ? 0 : existing.requestCountInWindow || 0;
    return {
      allowed: false,
      retryAfterSeconds,
      remainingInWindow: Math.max(0, OTP_MAX_REQUESTS_PER_WINDOW - usedCount),
      nextWindowStartAt: existing.windowStartAt || now,
      nextRequestCount: usedCount,
      reason: 'cooldown',
    };
  }

  // Check 15-minute window limit
  const elapsedInWindow = now - (existing.windowStartAt || 0);
  if (elapsedInWindow >= OTP_RATE_WINDOW_MS) {
    // Window reset!
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingInWindow: OTP_MAX_REQUESTS_PER_WINDOW - 1,
      nextWindowStartAt: now,
      nextRequestCount: 1,
    };
  }

  const currentCount = existing.requestCountInWindow || 0;
  if (currentCount >= OTP_MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((OTP_RATE_WINDOW_MS - elapsedInWindow) / 1000);
    return {
      allowed: false,
      retryAfterSeconds,
      remainingInWindow: 0,
      nextWindowStartAt: existing.windowStartAt,
      nextRequestCount: currentCount,
      reason: 'window_limit',
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingInWindow: Math.max(0, OTP_MAX_REQUESTS_PER_WINDOW - (currentCount + 1)),
    nextWindowStartAt: existing.windowStartAt || now,
    nextRequestCount: currentCount + 1,
  };
}

/**
 * Dispatches the 6-digit OTP via Meta WhatsApp Cloud API (`graph.facebook.com`)
 */
export async function sendOtpViaMetaWhatsAppCloudApi(params: {
  e164Phone: string;
  otpCode: string;
  userName: string;
  storeName: string;
  shopPhone?: string;
}): Promise<{
  delivered: boolean;
  method: 'meta_cloud_api' | 'custom_gateway' | 'simulation';
  messageId?: string;
  apiError?: string;
}> {
  const config = await resolveMetaWhatsAppConfig(params.shopPhone);
  const recipient = params.e164Phone.replace(/\D/g, '');

  const textBodyAr =
    `🔐 *كود استرجاع كلمة السر (OTP)*\n\n` +
    `مرحباً *${params.userName}* (${params.storeName})،\n` +
    `رمز التحقق الخاص بك المكون من 6 أرقام هو:\n\n` +
    `👈 *${params.otpCode}*\n\n` +
    `⏳ ينتهي هذا الكود خلال *5 دقائق*.\n` +
    `⚠️ لا تشارك هذا الرمز مع أي شخص لحماية حسابك.`;

  // 1. Official Meta WhatsApp Cloud API (graph.facebook.com)
  if (config.phoneNumberId && config.accessToken) {
    const version = config.apiVersion || 'v20.0';
    const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(
      config.phoneNumberId
    )}/messages`;

    // If a template name is configured, try sending a template message first
    if (config.templateName) {
      try {
        const templatePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'template',
          template: {
            name: config.templateName,
            language: { code: config.templateLang || 'ar' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: params.otpCode }],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: params.otpCode }],
              },
            ],
          },
        };

        const tplRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(templatePayload),
        });

        if (tplRes.ok) {
          const tplData = await tplRes.json();
          return {
            delivered: true,
            method: 'meta_cloud_api',
            messageId: tplData?.messages?.[0]?.id,
          };
        }

        // Fallback: try body-only template (without URL button component)
        const bodyOnlyTemplatePayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'template',
          template: {
            name: config.templateName,
            language: { code: config.templateLang || 'ar' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: params.otpCode }],
              },
            ],
          },
        };

        const tplBodyRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyOnlyTemplatePayload),
        });

        if (tplBodyRes.ok) {
          const tplBodyData = await tplBodyRes.json();
          return {
            delivered: true,
            method: 'meta_cloud_api',
            messageId: tplBodyData?.messages?.[0]?.id,
          };
        }
      } catch (e) {
        console.warn('Meta Cloud API template attempt notice:', e);
      }
    }

    // Standard Text Message via Meta WhatsApp Cloud API
    try {
      const textPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: {
          preview_url: false,
          body: textBodyAr,
        },
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(textPayload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return {
          delivered: true,
          method: 'meta_cloud_api',
          messageId: data?.messages?.[0]?.id,
        };
      } else {
        const errMsg =
          data?.error?.message || `Meta Cloud API HTTP ${res.status}`;
        return {
          delivered: false,
          method: 'meta_cloud_api',
          apiError: errMsg,
        };
      }
    } catch (err: any) {
      return {
        delivered: false,
        method: 'meta_cloud_api',
        apiError: err?.message || 'تعذر الاتصال بخادم Meta WhatsApp Cloud API',
      };
    }
  }

  // 2. Optional Custom Webhook / Gateway URL fallback
  if (config.gatewayWebhookUrl) {
    try {
      const url = config.gatewayWebhookUrl
        .replace(/\{phone\}/g, encodeURIComponent(recipient))
        .replace(/\{code\}/g, encodeURIComponent(params.otpCode))
        .replace(/\{text\}/g, encodeURIComponent(textBodyAr));

      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        return {
          delivered: true,
          method: 'custom_gateway',
        };
      }
    } catch {}
  }

  return {
    delivered: false,
    method: 'simulation',
    apiError: 'META_CREDENTIALS_MISSING',
  };
}

/**
 * Full workflow:
 * 1. Find user by WhatsApp phone (supports owners, co-admins, and employees across multiple shops)
 * 2. Check Rate Limit (60s cooldown + max 3 per 15 mins)
 * 3. Generate 6-digit OTP and store in Firestore with 5-minute expiry
 * 4. Send via Meta WhatsApp Cloud API
 */
export async function createAndSendPasswordResetOtp(rawPhone: string): Promise<{
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
}> {
  const cleanPhone = normalizeShopPhoneNumber(rawPhone);
  if (!cleanPhone || cleanPhone.length < 9) {
    return {
      success: false,
      error: 'المرجو إدخال رقم واتساب صحيح (مثال: 0612345678 أو 0712345678).',
    };
  }

  // 1. Lookup User Account (Multi-User: Owner or Employee)
  const resolvedUser = await findUserAccountByWhatsAppPhone(cleanPhone);
  if (!resolvedUser) {
    return {
      success: false,
      error:
        'رقم الواتساب هذا غير مسجل في أي حساب (لا كمدير ولا كعامل). تأكد من الرقم أو أنشئ حساباً جديداً.',
    };
  }

  // 2. Check Rate Limit in Database
  const now = Date.now();
  const existingRecord = await getOtpRecordFromDb(cleanPhone);
  const rateCheck = evaluateOtpRateLimit(existingRecord, now);

  if (!rateCheck.allowed) {
    if (rateCheck.reason === 'cooldown') {
      return {
        success: false,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
        remainingRequestsInWindow: rateCheck.remainingInWindow,
        error: `حماية Rate Limit: المرجو الانتظار ${rateCheck.retryAfterSeconds} ثانية قبل طلب كود تحقق جديد.`,
      };
    } else {
      const mins = Math.ceil(rateCheck.retryAfterSeconds / 60);
      return {
        success: false,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
        remainingRequestsInWindow: 0,
        error: `حماية Rate Limit: لقد تجاوزت الحد الأقصى (${OTP_MAX_REQUESTS_PER_WINDOW} أكواد في 15 دقيقة). المرجو المحاولة بعد ${mins} دقيقة.`,
      };
    }
  }

  // 3. Generate 6-digit OTP & hash it for database storage
  const otpCode = generateSixDigitOtp();
  const otpCodeHash = await hashPinPBKDF2(otpCode);
  const expiresAt = now + OTP_EXPIRY_MS; // 5 minutes

  // 4. Send via Meta WhatsApp Cloud API
  const dispatchResult = await sendOtpViaMetaWhatsAppCloudApi({
    e164Phone: resolvedUser.e164Phone,
    otpCode,
    userName: resolvedUser.userName,
    storeName: resolvedUser.storeName,
    shopPhone: resolvedUser.shopPhone,
  });

  // 5. Store OTP record in Firestore with 5-minute expiration & updated rate limit counters
  const record: PasswordResetOtpRecord = {
    phone: cleanPhone,
    e164Phone: resolvedUser.e164Phone,
    shopPhone: resolvedUser.shopPhone,
    accountType: resolvedUser.accountType,
    memberId: resolvedUser.memberId,
    userName: resolvedUser.userName,
    userRole: resolvedUser.userRole,
    otpCodeHash,
    createdAt: now,
    expiresAt,
    expiresAtIso: new Date(expiresAt).toISOString(),
    used: false,
    verifyAttempts: 0,
    lastSentAt: now,
    windowStartAt: rateCheck.nextWindowStartAt,
    requestCountInWindow: rateCheck.nextRequestCount,
    lastDeliveryMethod: dispatchResult.method,
  };

  await saveOtpRecordToDb(record);

  return {
    success: true,
    maskedPhone: maskPhoneNumber(cleanPhone),
    targetPhone: cleanPhone,
    userName: resolvedUser.userName,
    storeName: resolvedUser.storeName,
    accountType: resolvedUser.accountType,
    expiresAt,
    retryAfterSeconds: Math.ceil(OTP_COOLDOWN_MS / 1000),
    remainingRequestsInWindow: rateCheck.remainingInWindow,
    deliveryMethod: dispatchResult.method,
    apiWarning: dispatchResult.delivered ? undefined : dispatchResult.apiError,
    // Only returned when Meta Cloud API credentials are not yet configured so user can test or send via WhatsApp
    demoOtpCode: dispatchResult.delivered ? undefined : otpCode,
  };
}

/**
 * Verifies the 6-digit OTP code from the database (checking 5-minute expiry, used flag, and max attempts)
 * and updates the password/PIN for the matching user (Owner or ShopMember).
 */
export async function verifyOtpAndResetUserPassword(params: {
  rawPhone: string;
  otpCode: string;
  newPassword: string;
}): Promise<{
  success: boolean;
  error?: string;
  shopPhone?: string;
  userName?: string;
  accountType?: 'owner' | 'member';
}> {
  const cleanPhone = normalizeShopPhoneNumber(params.rawPhone);
  const cleanOtp = (params.otpCode || '').replace(/\D/g, '').trim();
  const cleanNewPin = (params.newPassword || '').trim();

  if (!cleanPhone || cleanPhone.length < 9) {
    return { success: false, error: 'رقم الواتساب غير صحيح.' };
  }
  if (cleanOtp.length !== 6) {
    return { success: false, error: 'المرجو إدخال كود التحقق المكون من 6 أرقام كاملاً.' };
  }
  if (cleanNewPin.length < 4) {
    return {
      success: false,
      error: 'كلمة السر الجديدة يجب أن تتكون من 4 أرقام أو حروف على الأقل.',
    };
  }

  const record = await getOtpRecordFromDb(cleanPhone);
  if (!record) {
    return {
      success: false,
      error: 'لم يتم العثور على طلب استرجاع لهذا الرقم. المرجو طلب كود OTP جديد.',
    };
  }

  if (record.used) {
    return {
      success: false,
      error: 'هذا الكود تم استخدامه مسبقاً. المرجو طلب كود تحقق جديد.',
    };
  }

  const now = Date.now();
  if (now > record.expiresAt) {
    return {
      success: false,
      error: 'انتهت صلاحية كود التحقق (مرت أكثر من 5 دقائق). المرجو طلب كود جديد.',
    };
  }

  if ((record.verifyAttempts || 0) >= OTP_MAX_VERIFY_ATTEMPTS) {
    return {
      success: false,
      error: 'تم تجاوز الحد الأقصى لمحاولات إدخال الكود (5 محاولات). المرجو طلب كود جديد.',
    };
  }

  const isValidOtp = await verifyPinPBKDF2(cleanOtp, record.otpCodeHash);
  if (!isValidOtp) {
    const nextAttempts = (record.verifyAttempts || 0) + 1;
    const remaining = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - nextAttempts);
    const updatedRecord: PasswordResetOtpRecord = {
      ...record,
      verifyAttempts: nextAttempts,
      used: remaining === 0 ? true : record.used,
    };
    await saveOtpRecordToDb(updatedRecord);

    return {
      success: false,
      error:
        remaining > 0
          ? `كود التحقق (OTP) غير صحيح. المحاولات المتبقية: ${remaining}`
          : 'كود التحقق غير صحيح وتم إبطال صلاحيته لتجاوز عدد المحاولات. اطلب كوداً جديداً.',
    };
  }

  // OTP is valid! Mark OTP as used immediately
  const usedRecord: PasswordResetOtpRecord = {
    ...record,
    used: true,
    usedAt: now,
  };
  await saveOtpRecordToDb(usedRecord);

  const shopPhone = record.shopPhone || cleanPhone;

  // Update password in Firestore & local DB depending on whether user is 'owner' or 'member'
  if (record.accountType === 'owner') {
    // 1. Update shops/{shopPhone}
    try {
      await setDoc(
        doc(firestore, 'shops', shopPhone),
        {
          pinCode: cleanNewPin,
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {}

    // 2. Update shops/{shopPhone}/settings/store_settings
    try {
      const setRef = doc(firestore, 'shops', shopPhone, 'settings', 'store_settings');
      const setSnap = await getDoc(setRef);
      if (setSnap.exists()) {
        const data = setSnap.data();
        const val = data?.value || {};
        await updateDoc(setRef, {
          value: { ...val, pinCode: cleanNewPin },
          updated_at: new Date().toISOString(),
        });
      }
    } catch {}

    // 3. Update local StoreSettings if matching shop
    try {
      const localSettings = await getStoreSettings();
      const localPhone = normalizeShopPhoneNumber(localSettings.phone || localSettings.shopId);
      if (!localPhone || localPhone === shopPhone) {
        await saveStoreSettings({
          ...localSettings,
          pinCode: cleanNewPin,
        });
      }
    } catch {}
  } else {
    // Member / Employee account password reset
    // 1. Update user_phone_index/{cleanPhone}
    try {
      await setDoc(
        doc(firestore, 'user_phone_index', cleanPhone),
        {
          pinCode: cleanNewPin,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {}

    // 2. Update shopMembers in shops/{shopPhone}/settings/store_settings and shops/{shopPhone}
    try {
      const setRef = doc(firestore, 'shops', shopPhone, 'settings', 'store_settings');
      const setSnap = await getDoc(setRef);
      if (setSnap.exists()) {
        const data = setSnap.data();
        const val = data?.value || {};
        const members: ShopMember[] = Array.isArray(val.shopMembers) ? val.shopMembers : [];
        const updatedMembers = members.map((m) =>
          m.id === record.memberId || normalizeShopPhoneNumber(m.phone) === cleanPhone
            ? { ...m, pin_code: cleanNewPin }
            : m
        );
        await updateDoc(setRef, {
          value: { ...val, shopMembers: updatedMembers },
          updated_at: new Date().toISOString(),
        });
        await setDoc(
          doc(firestore, 'shops', shopPhone),
          {
            shopMembers: updatedMembers,
            updated_at: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch {}

    // 3. Update local StoreSettings if matching shop
    try {
      const localSettings = await getStoreSettings();
      if (Array.isArray(localSettings.shopMembers)) {
        const updatedLocalMembers = localSettings.shopMembers.map((m) =>
          m.id === record.memberId || normalizeShopPhoneNumber(m.phone) === cleanPhone
            ? { ...m, pin_code: cleanNewPin }
            : m
        );
        await saveStoreSettings({
          ...localSettings,
          shopMembers: updatedLocalMembers,
        });
      }
    } catch {}
  }

  return {
    success: true,
    shopPhone,
    userName: record.userName,
    accountType: record.accountType,
  };
}
