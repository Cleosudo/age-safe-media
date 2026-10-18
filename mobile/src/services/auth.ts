import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Authentication service.
 *
 * With Firebase environment variables present the app uses Firebase Auth
 * (e-mail + password) and forwards the ID token to the API.
 * Without them the app falls back to a local demo session so the whole stack
 * can be demonstrated offline — the backend accepts `dev:<email>` tokens only
 * while `DEV_AUTH=true`.
 */

export interface Session {
  uid: string;
  email: string;
  displayName: string;
  provider: 'firebase' | 'dev';
}

type Listener = (session: Session | null) => void;

const DEV_STORAGE_KEY = 'agesafe.devSession.v1';

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

const listeners = new Set<Listener>();
let currentSession: Session | null = null;
let firebaseAuth: import('firebase/auth').Auth | null = null;

function emit(session: Session | null): void {
  currentSession = session;
  listeners.forEach((listener) => listener(session));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentSession);
  return () => listeners.delete(listener);
}

export function getSession(): Session | null {
  return currentSession;
}

// --------------------------------------------------------------------------- //
// Firebase
// --------------------------------------------------------------------------- //
async function getFirebaseAuth(): Promise<import('firebase/auth').Auth> {
  if (firebaseAuth) return firebaseAuth;
  const { getApp, getApps, initializeApp } = await import('firebase/app');
  const { getAuth, initializeAuth } = await import('firebase/auth');
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  if (Platform.OS === 'web') {
    firebaseAuth = getAuth(app);
    return firebaseAuth;
  }

  // React Native needs explicit AsyncStorage persistence. The helper lives on
  // the react-native entry point of firebase/auth, which is not part of the
  // public TypeScript surface, hence the narrowed require + cast.
  try {
    type PersistenceFactory = (storage: unknown) => import('firebase/auth').Persistence;
    const authModule = require('firebase/auth') as {
      getReactNativePersistence?: PersistenceFactory;
    };
    const AsyncStorageModule = require('@react-native-async-storage/async-storage').default;
    if (authModule.getReactNativePersistence) {
      firebaseAuth = initializeAuth(app, {
        persistence: authModule.getReactNativePersistence(AsyncStorageModule),
      });
    } else {
      firebaseAuth = getAuth(app);
    }
  } catch {
    firebaseAuth = getAuth(app);
  }
  return firebaseAuth;
}

export async function initAuth(): Promise<Session | null> {
  if (!firebaseEnabled) {
    const raw = await AsyncStorage.getItem(DEV_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Session;
        emit(parsed);
        return parsed;
      } catch {
        await AsyncStorage.removeItem(DEV_STORAGE_KEY);
      }
    }
    emit(null);
    return null;
  }

  const { onAuthStateChanged } = await import('firebase/auth');
  const auth = await getFirebaseAuth();

  return new Promise<Session | null>((resolve) => {
    let settled = false;
    onAuthStateChanged(auth, (user) => {
      const session = user
        ? {
            uid: user.uid,
            email: user.email ?? '',
            displayName: user.displayName ?? '',
            provider: 'firebase' as const,
          }
        : null;
      emit(session);
      if (!settled) {
        settled = true;
        resolve(session);
      }
    });
  });
}

export async function signIn(email: string, password: string): Promise<Session> {
  const normalised = email.trim().toLowerCase();
  if (firebaseEnabled) {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const auth = await getFirebaseAuth();
    try {
      const credential = await signInWithEmailAndPassword(auth, normalised, password);
      const session: Session = {
        uid: credential.user.uid,
        email: credential.user.email ?? normalised,
        displayName: credential.user.displayName ?? '',
        provider: 'firebase',
      };
      emit(session);
      return session;
    } catch (error) {
      throw new Error(translateFirebaseError(error));
    }
  }

  if (!normalised.includes('@') || normalised.length < 5) {
    throw new Error('Enter a valid e-mail address.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  const session: Session = {
    uid: `dev-${normalised}`,
    email: normalised,
    displayName: normalised.split('@')[0],
    provider: 'dev',
  };
  await AsyncStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(session));
  emit(session);
  return session;
}

export async function signUp(email: string, password: string, displayName: string): Promise<Session> {
  const normalised = email.trim().toLowerCase();
  if (firebaseEnabled) {
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    const auth = await getFirebaseAuth();
    try {
      const credential = await createUserWithEmailAndPassword(auth, normalised, password);
      if (displayName.trim()) {
        await updateProfile(credential.user, { displayName: displayName.trim() });
      }
      const session: Session = {
        uid: credential.user.uid,
        email: credential.user.email ?? normalised,
        displayName: displayName.trim(),
        provider: 'firebase',
      };
      emit(session);
      return session;
    } catch (error) {
      throw new Error(translateFirebaseError(error));
    }
  }

  if (!normalised.includes('@') || normalised.length < 5) {
    throw new Error('Enter a valid e-mail address.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }
  const session: Session = {
    uid: `dev-${normalised}`,
    email: normalised,
    displayName: displayName.trim() || normalised.split('@')[0],
    provider: 'dev',
  };
  await AsyncStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(session));
  emit(session);
  return session;
}

export async function signOut(): Promise<void> {
  if (firebaseEnabled) {
    const { signOut: fbSignOut } = await import('firebase/auth');
    const auth = await getFirebaseAuth();
    await fbSignOut(auth);
  }
  await AsyncStorage.removeItem(DEV_STORAGE_KEY);
  emit(null);
}

/** Fresh bearer token for the API client. */
export async function currentToken(): Promise<string | null> {
  if (!currentSession) return null;
  if (currentSession.provider === 'dev') return `dev:${currentSession.email}`;
  try {
    const auth = await getFirebaseAuth();
    const token = await auth.currentUser?.getIdToken();
    return token ?? null;
  } catch {
    return null;
  }
}

export function translateFirebaseError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That e-mail address is not valid.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mail or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists for that e-mail.';
    case 'auth/weak-password':
      return 'Choose a password with at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment.';
    default:
      return (error as Error)?.message ?? 'Could not complete authentication.';
  }
}
