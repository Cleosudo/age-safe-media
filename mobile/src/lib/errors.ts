import { ApiError } from '@/services/api';

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return error.detail;
    if (error.isAuthError) return 'Your session has expired. Please sign in again.';
    return error.detail;
  }
  return (error as Error)?.message ?? 'Something went wrong. Please try again.';
}
