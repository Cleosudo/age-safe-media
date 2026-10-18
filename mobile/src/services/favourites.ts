import { api } from './api';
import type {
  FavouriteMutation,
  FavouritesResponse,
  FeedbackMutation,
  FeedbackRating,
} from '../types/api';

export const favouritesApi = {
  list: (childId?: string | null) =>
    api.get<FavouritesResponse>('/favourites', { query: { child_id: childId ?? undefined } }),
  add: (childId: string, itemId: string) =>
    api.post<FavouriteMutation>('/favourites', { child_id: childId, item_id: itemId }),
  remove: (childId: string, itemId: string) =>
    api.delete<FavouriteMutation>(`/favourites/${encodeURIComponent(itemId)}`, {
      query: { child_id: childId },
    }),
  feedback: (childId: string, itemId: string, rating: FeedbackRating, reason = '') =>
    api.post<FeedbackMutation>('/feedback', {
      child_id: childId,
      item_id: itemId,
      rating,
      reason,
    }),
};
