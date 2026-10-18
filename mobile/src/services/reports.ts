import { api } from './api';
import type { Report, ReportRange } from '../types/api';

export const reportsApi = {
  activity: (childId: string, range: ReportRange) =>
    api.get<Report>('/reports/activity', { query: { child_id: childId, range } }),
};
