import { api } from './api';
import type { Child, ChildInput, ChildMeta, OutputPreferences } from '../types/api';

export const childrenApi = {
  list: () => api.get<{ children: Child[]; count: number }>('/children'),
  meta: () => api.get<ChildMeta>('/children/meta'),
  get: (childId: string) => api.get<Child>(`/children/${childId}`),
  create: (input: ChildInput) => api.post<Child>('/children', input),
  update: (childId: string, input: Partial<ChildInput>) => api.patch<Child>(`/children/${childId}`, input),
  updatePreferences: (childId: string, preferences: Partial<OutputPreferences>) => {
    const payload: Record<string, unknown> = { preferences };
    return api.patch<Child>(`/children/${childId}`, payload);
  },
  updateRestrictions: (
    childId: string,
    restrictions: { blocked_categories: string[]; age_band_depth: 1 | 2 | 3 },
  ) => api.put<Child>(`/children/${childId}/restrictions`, restrictions),
  remove: (childId: string) => api.delete<void>(`/children/${childId}`),
};
