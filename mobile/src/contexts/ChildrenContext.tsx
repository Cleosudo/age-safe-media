import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from './AuthContext';
import { ApiError } from '../services/api';
import { childrenApi } from '../services/children';
import type { Child, ChildInput, ChildMeta, DisplayMode, OutputPreferences, SortMode } from '../types/api';

const ACTIVE_CHILD_KEY = 'agesafe.activeChild.v1';

interface ChildrenContextValue {
  children: Child[];
  activeChild: Child | null;
  activeChildId: string | null;
  meta: ChildMeta | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setActiveChild: (childId: string) => Promise<void>;
  createChild: (input: ChildInput) => Promise<Child>;
  updateChild: (childId: string, input: Partial<ChildInput>) => Promise<Child>;
  deleteChild: (childId: string) => Promise<void>;
  saveRestrictions: (
    childId: string,
    restrictions: { blocked_categories: string[]; age_band_depth: 1 | 2 | 3 },
  ) => Promise<Child>;
  savePreferences: (
    childId: string,
    preferences: Partial<Pick<OutputPreferences, 'max_recommendations' | 'display_mode' | 'sort' | 'show_explanations'>>,
  ) => Promise<Child>;
  setDisplayMode: (mode: DisplayMode) => Promise<void>;
  setSort: (sort: SortMode) => Promise<void>;
  setCount: (count: number) => Promise<void>;
}

const ChildrenContext = createContext<ChildrenContextValue | undefined>(undefined);

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.detail;
  return (error as Error)?.message ?? 'Could not load child profiles.';
}

export function ChildrenProvider({ children: nodes }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [meta, setMeta] = useState<ChildMeta | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydratedFor = useRef<string | null>(null);

  const load = useCallback(async (): Promise<Child[]> => {
    setLoading(true);
    setError(null);
    try {
      const [list, metaResponse] = await Promise.all([childrenApi.list(), childrenApi.meta()]);
      setChildren(list.children);
      setMeta(metaResponse);
      return list.children;
    } catch (err) {
      setError(describe(err));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      setChildren([]);
      setActiveId(null);
      hydratedFor.current = null;
      return;
    }
    if (hydratedFor.current === session.uid) return;
    hydratedFor.current = session.uid;

    (async () => {
      const stored = await AsyncStorage.getItem(ACTIVE_CHILD_KEY);
      const list = await load();
      const preferred = stored && list.some((child) => child.id === stored) ? stored : list[0]?.id ?? null;
      setActiveId(preferred);
      if (preferred) await AsyncStorage.setItem(ACTIVE_CHILD_KEY, preferred);
    })();
  }, [session, ready, load]);

  const setActiveChild = useCallback(async (childId: string) => {
    setActiveId(childId);
    await AsyncStorage.setItem(ACTIVE_CHILD_KEY, childId);
  }, []);

  const upsertLocal = useCallback((child: Child) => {
    setChildren((current) => {
      const index = current.findIndex((entry) => entry.id === child.id);
      if (index === -1) return [...current, child];
      const next = [...current];
      next[index] = child;
      return next;
    });
  }, []);

  const createChild = useCallback(
    async (input: ChildInput) => {
      const child = await childrenApi.create(input);
      setChildren((current) => [...current, child]);
      setActiveId(child.id);
      await AsyncStorage.setItem(ACTIVE_CHILD_KEY, child.id);
      return child;
    },
    [],
  );

  const updateChild = useCallback(
    async (childId: string, input: Partial<ChildInput>) => {
      const updated = await childrenApi.update(childId, input);
      upsertLocal(updated);
      return updated;
    },
    [upsertLocal],
  );

  const deleteChild = useCallback(
    async (childId: string) => {
      await childrenApi.remove(childId);
      setChildren((current) => {
        const next = current.filter((child) => child.id !== childId);
        setActiveId((active) => {
          if (active !== childId) return active;
          const fallback = next[0]?.id ?? null;
          if (fallback) void AsyncStorage.setItem(ACTIVE_CHILD_KEY, fallback);
          else void AsyncStorage.removeItem(ACTIVE_CHILD_KEY);
          return fallback;
        });
        return next;
      });
    },
    [],
  );

  const saveRestrictions = useCallback(
    async (childId: string, restrictions: { blocked_categories: string[]; age_band_depth: 1 | 2 | 3 }) => {
      const updated = await childrenApi.updateRestrictions(childId, restrictions);
      upsertLocal(updated);
      return updated;
    },
    [upsertLocal],
  );

  const savePreferences = useCallback(
    async (childId: string, preferences: Partial<OutputPreferences>) => {
      const existing = children.find((child) => child.id === childId)?.preferences;
      const merged: OutputPreferences = {
        max_recommendations: 5,
        display_mode: 'summary',
        sort: 'relevance',
        show_explanations: true,
        ...(existing ?? {}),
        ...preferences,
      };
      // optimistic update keeps the chat controls snappy
      setChildren((current) =>
        current.map((child) => (child.id === childId ? { ...child, preferences: merged } : child)),
      );
      try {
        const updated = await childrenApi.updatePreferences(childId, merged);
        upsertLocal(updated);
        return updated;
      } catch (err) {
        const snapshot = children.find((entry) => entry.id === childId);
        if (snapshot && existing) {
          upsertLocal({ ...snapshot, preferences: existing });
        }
        throw err;
      }
    },
    [children, upsertLocal],
  );

  const activeChild = useMemo(
    () => children.find((child) => child.id === activeId) ?? null,
    [children, activeId],
  );

  const setDisplayMode = useCallback(
    async (mode: DisplayMode) => {
      if (!activeChild) return;
      await savePreferences(activeChild.id, { display_mode: mode });
    },
    [activeChild, savePreferences],
  );

  const setSort = useCallback(
    async (sort: SortMode) => {
      if (!activeChild) return;
      await savePreferences(activeChild.id, { sort });
    },
    [activeChild, savePreferences],
  );

  const setCount = useCallback(
    async (count: number) => {
      if (!activeChild) return;
      await savePreferences(activeChild.id, { max_recommendations: count });
    },
    [activeChild, savePreferences],
  );

  const value = useMemo<ChildrenContextValue>(
    () => ({
      children,
      activeChild,
      activeChildId: activeId,
      meta,
      loading,
      error,
      refresh: async () => {
        await load();
      },
      setActiveChild,
      createChild,
      updateChild,
      deleteChild,
      saveRestrictions,
      savePreferences,
      setDisplayMode,
      setSort,
      setCount,
    }),
    [
      children,
      activeChild,
      activeId,
      meta,
      loading,
      error,
      load,
      setActiveChild,
      createChild,
      updateChild,
      deleteChild,
      saveRestrictions,
      savePreferences,
      setDisplayMode,
      setSort,
      setCount,
    ],
  );

  return <ChildrenContext.Provider value={value}>{nodes}</ChildrenContext.Provider>;
}

export function useChildren(): ChildrenContextValue {
  const context = useContext(ChildrenContext);
  if (!context) throw new Error('useChildren must be used inside <ChildrenProvider>');
  return context;
}
