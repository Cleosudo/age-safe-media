import { api } from './api';
import type {
  ChatHistoryResponse,
  ChatResponse,
  OutputPreferences,
  SuggestionsResponse,
} from '../types/api';

export interface ChatPayload {
  child_id: string;
  message: string;
  conversation_id?: string | null;
  preferences?: Partial<OutputPreferences>;
}

export const chatApi = {
  send: (payload: ChatPayload) => api.post<ChatResponse>('/chat', payload, { timeoutMs: 25000 }),
  history: (childId: string, conversationId?: string | null) =>
    api.get<ChatHistoryResponse>('/chat/history', {
      query: { child_id: childId, conversation_id: conversationId ?? undefined },
    }),
  suggestions: (childId: string) =>
    api.get<SuggestionsResponse>('/chat/suggestions', { query: { child_id: childId } }),
};
