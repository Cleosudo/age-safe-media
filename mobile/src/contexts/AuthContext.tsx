import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { accountApi } from '../services/account';
import { ApiError, setTokenProvider } from '../services/api';
import * as authService from '../services/auth';
import type { AccountPayload, AccountMeta, Parent } from '../types/api';

interface AuthContextValue {
  ready: boolean;
  session: authService.Session | null;
  parent: Parent | null;
  meta: AccountMeta | null;
  authMode: 'firebase' | 'demo';
  busy: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return error.detail;
    if (error.isAuthError) return 'Your session has expired. Please sign in again.';
    return error.detail;
  }
  return (error as Error)?.message ?? 'Something went wrong.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<authService.Session | null>(null);
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadAccount = useCallback(async (): Promise<AccountPayload | null> => {
    try {
      const payload = await accountApi.register();
      if (mounted.current) setAccount(payload);
      return payload;
    } catch (err) {
      if (mounted.current) setError(describe(err));
      return null;
    }
  }, []);

  useEffect(() => {
    setTokenProvider(() => authService.currentToken());
    let cancelled = false;

    (async () => {
      const restored = await authService.initAuth();
      if (cancelled) return;
      setSession(restored);
      if (restored) await loadAccount();
      if (!cancelled) setReady(true);
    })();

    const unsubscribe = authService.subscribe((next) => {
      if (!cancelled) setSession(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadAccount]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setError(null);
      try {
        const next = await authService.signIn(email, password);
        setSession(next);
        const payload = await loadAccount();
        if (!payload) throw new Error('Signed in, but the profile could not be loaded.');
      } catch (err) {
        setError(describe(err));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [loadAccount],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      setBusy(true);
      setError(null);
      try {
        const next = await authService.signUp(email, password, displayName);
        setSession(next);
        await loadAccount();
      } catch (err) {
        setError(describe(err));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [loadAccount],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await authService.signOut();
      setSession(null);
      setAccount(null);
      setError(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshAccount = useCallback(async () => {
    await loadAccount();
  }, [loadAccount]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      parent: account?.parent ?? null,
      meta: account?.meta ?? null,
      authMode: authService.firebaseEnabled ? 'firebase' : 'demo',
      busy,
      error,
      signIn,
      signUp,
      signOut,
      refreshAccount,
      clearError: () => setError(null),
    }),
    [ready, session, account, busy, error, signIn, signUp, signOut, refreshAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
