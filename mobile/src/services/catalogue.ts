import { api } from './api';
import type { CatalogItem } from '../types/api';

export const catalogueApi = {
  byIds: (ids: string[]) =>
    api.get<{ items: CatalogItem[]; count: number }>('/catalogue', {
      query: { ids: ids.join(',') },
    }),
};
