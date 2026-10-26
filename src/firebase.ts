import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore (handles default or named database)
const dbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const firestore: Firestore =
  dbId && dbId !== '(default)' && dbId.trim() !== ''
    ? getFirestore(app, dbId)
    : getFirestore(app);

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

  console.error('Firestore Error:', JSON.stringify(errorInfo, null, 2));
  return errorInfo;
}

/**
 * Ensures an authenticated session exists for the device
 * Uses Anonymous sign-in if not signed in, so shop devices can immediately sync without friction.
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
            console.warn('Anonymous auth failed:', err);
            resolve(null);
          }
        }
      });
    });
  }
  return authInitPromise;
}

export { app };
export default firestore;
