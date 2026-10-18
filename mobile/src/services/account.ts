import { api } from './api';
import type { AccountPayload, ServerConfig } from '../types/api';

export const accountApi = {
  me: () => api.get<AccountPayload>('/account/me'),
  register: () => api.post<AccountPayload>('/account/register'),
  updateProfile: (displayName: string) =>
    api.patch<AccountPayload>('/account/me', { display_name: displayName }),
  config: () => api.get<ServerConfig>('/config'),
};
