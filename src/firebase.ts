import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  Firestore,
  doc,
  collection,
  DocumentReference,
  CollectionReference,
} from 'firebase/firestore';
import {
  getAuth,
  Auth,
  signInAnonymously,
  onAuthStateChanged,
  User,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import rawConfig from '../firebase-applet-config.json';

// Guaranteed fallback config for tele-projet in case Netlify build doesn't receive env variables
const FALLBACK_CONFIG = {
  projectId: 'tele-projet',
  appId: '1:587504357080:web:835c7fc26da7398022d1ad',
  apiKey: 'AIzaSyCpURd1UKza5i7tNOV1ulCX4-j7ZlCEh_0',
  authDomain: 'tele-projet.firebaseapp.com',
  storageBucket: 'tele-projet.firebasestorage.app',
  messagingSenderId: '587504357080',
};

// Priority: 1. Vite environment variables -> 2. config file -> 3. Fallback defaults
export const resolvedFirebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    (rawConfig as any)?.apiKey ||
    FALLBACK_CONFIG.apiKey,
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    (rawConfig as any)?.authDomain ||
    FALLBACK_CONFIG.authDomain,
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID ||
    (rawConfig as any)?.projectId ||
    FALLBACK_CONFIG.projectId,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    (rawConfig as any)?.storageBucket ||
    FALLBACK_CONFIG.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    (rawConfig as any)?.messagingSenderId ||
    FALLBACK_CONFIG.messagingSenderId,
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    (rawConfig as any)?.appId ||
    FALLBACK_CONFIG.appId,
};

// Initialize Firebase App
export const app: FirebaseApp = !getApps().length
  ? initializeApp(resolvedFirebaseConfig)
  : getApp();

// Initialize Firestore with Offline IndexedDB Persistence enabled
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  firestoreInstance = getFirestore(app);
}

export const firestore: Firestore = firestoreInstance;

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

// Key storage for active authenticated shop account
export const ACTIVE_PHONE_STORAGE_KEY = 'golden_shop_phone_account';

/**
 * Normalizes phone numbers to standard Moroccan Document ID format: "06xxxxxxxx" or "07xxxxxxxx"
 */
export function normalizeShopPhoneNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return '';
  const clean = rawPhone.trim().replace(/[^\d+]/g, '');
  if (!clean) return '';

  let digits = clean.replace(/\D/g, '');
  if (digits.startsWith('00212')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('212') && digits.length >= 11) {
    digits = digits.slice(3);
  }

  // Prepend 0 if 9 digits starting with 6 or 7 (standard Moroccan mobile)
  if (digits.length === 9 && (digits.startsWith('6') || digits.startsWith('7'))) {
    digits = `0${digits}`;
  }

  return digits;
}

/**
 * Formats a phone number to international E.164 format (+2126xxxxxxxx) required by Firebase Auth
 */
export function formatPhoneForE164(rawPhone: string): string {
  const normalized = normalizeShopPhoneNumber(rawPhone);
  if (normalized.startsWith('0') && (normalized.startsWith('06') || normalized.startsWith('07') || normalized.startsWith('05'))) {
    return `+212${normalized.slice(1)}`;
  }
  if (rawPhone.trim().startsWith('+')) {
    return rawPhone.trim().replace(/[^\d+]/g, '');
  }
  return `+212${normalized}`;
}

export function getActiveShopPhoneNumber(): string {
  try {
    const saved = localStorage.getItem(ACTIVE_PHONE_STORAGE_KEY);
    return normalizeShopPhoneNumber(saved);
  } catch {
    return '';
  }
}

export function setActiveShopPhoneNumber(phone: string): void {
  const normalized = normalizeShopPhoneNumber(phone);
  if (normalized) {
    try {
      localStorage.setItem(ACTIVE_PHONE_STORAGE_KEY, normalized);
    } catch {}
  }
}

export function clearActiveShopPhoneNumber(): void {
  try {
    localStorage.removeItem(ACTIVE_PHONE_STORAGE_KEY);
  } catch {}
}

/**
 * Get the Firestore document reference for a shop by phone number: "shops/{phoneNumber}"
 */
export function getShopDocRef(phoneNumber?: string): DocumentReference | null {
  const phone = phoneNumber ? normalizeShopPhoneNumber(phoneNumber) : getActiveShopPhoneNumber();
  if (!phone) return null;
  return doc(firestore, 'shops', phone);
}

/**
 * Get a Firestore subcollection reference under the shop: "shops/{phoneNumber}/{subcollectionName}"
 */
export function getShopCollectionRef(subcollectionName: string, phoneNumber?: string): CollectionReference | null {
  const phone = phoneNumber ? normalizeShopPhoneNumber(phoneNumber) : getActiveShopPhoneNumber();
  if (!phone) return null;
  return collection(firestore, 'shops', phone, subcollectionName);
}

/**
 * Set up reCAPTCHA verifier for Phone Auth
 */
export function setupRecaptchaVerifier(containerOrButtonId: string): RecaptchaVerifier {
  if ((window as any).recaptchaVerifier) {
    try {
      (window as any).recaptchaVerifier.clear();
    } catch {}
  }
  const verifier = new RecaptchaVerifier(auth, containerOrButtonId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved
    },
    'expired-callback': () => {
      console.warn('reCAPTCHA expired');
    },
  });
  (window as any).recaptchaVerifier = verifier;
  return verifier;
}

/**
 * Send Phone Auth OTP code via Firebase Auth
 */
export async function sendPhoneOtp(
  phoneNumber: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  const e164 = formatPhoneForE164(phoneNumber);
  return await signInWithPhoneNumber(auth, e164, verifier);
}

/**
 * Confirm OTP code and complete Firebase login
 */
export async function verifyPhoneOtp(
  confirmationResult: ConfirmationResult,
  code: string
): Promise<User> {
  const res = await confirmationResult.confirm(code);
  return res.user;
}

// Operation types for Firestore security error diagnosis
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
    phoneNumber: string | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const currentUser = auth.currentUser;
  const errMessage = error instanceof Error ? error.message : String(error);

  const errorInfo: FirestoreErrorInfo = {
    error: errMessage,
    operationType,
    path,
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      phoneNumber: currentUser?.phoneNumber || null,
    },
  };

  console.warn('Firestore Operation Notice:', JSON.stringify(errorInfo, null, 2));
  return errorInfo;
}

/**
 * Ensures an authenticated session exists
 */
let authInitPromise: Promise<User | null> | null = null;

export async function ensureFirebaseAuth(): Promise<User | null> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  if (!authInitPromise) {
    authInitPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe();
        if (user) {
          resolve(user);
        } else {
          try {
            const cred = await signInAnonymously(auth);
            resolve(cred.user);
          } catch (err) {
            resolve(null);
          }
        }
      });
    });
  }
  return authInitPromise;
}

export default firestore;
