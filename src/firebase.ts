import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  Firestore,
} from 'firebase/firestore';
import { getAuth, Auth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
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
  // If already initialized (e.g. during HMR or multiple mounts)
  firestoreInstance = getFirestore(app);
}

export const firestore: Firestore = firestoreInstance;

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

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
    emailVerified: boolean | null;
    isAnonymous: boolean | null;
    tenantId: string | null;
    providerData: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      phoneNumber: string | null;
      photoURL: string | null;
    }>;
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
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerData:
        currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          phoneNumber: provider.phoneNumber,
          photoURL: provider.photoURL,
        })) || [],
    },
  };

  console.warn('Firestore Operation Notice:', JSON.stringify(errorInfo, null, 2));
  return errorInfo;
}

/**
 * Ensures an authenticated session exists for the device
 * Uses Anonymous sign-in if available. If disabled in Firebase console, gracefully resolves null.
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
            // Anonymous sign-in might not be turned on in Firebase Console yet; don't break the app
            console.info('Firebase anonymous auth optional info:', (err as any)?.message || err);
            resolve(null);
          }
        }
      });
    });
  }
  return authInitPromise;
}

export default firestore;
