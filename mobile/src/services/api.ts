import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Base URL resolution.
 *
 * 1. `EXPO_PUBLIC_API_URL` always wins (use this for staging / production).
 * 2. On a physical device we reuse the Metro host (`192.168.x.x:8081`) and swap
 *    the port, which is the only reliable way to avoid `localhost` on device.
 * 3. Fallbacks: localhost (web/simulator), 10.0.2.2 (Android emulator).
 */
const API_PORT = Number(process.env.EXPO_PUBLIC_API_PORT ?? 8010);

function metroHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    Constants.manifest?.debuggerHost;
  if (!hostUri || typeof hostUri !== 'string') return null;
  const host = hostUri.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

export function apiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  if (Platform.OS === 'web') return `http://localhost:${API_PORT}`;

  const host = metroHost();
  if (host) return `http://${host}:${API_PORT}`;

  return Platform.OS === 'android'
    ? `http://10.0.2.2:${API_PORT}`
    : `http://127.0.0.1:${API_PORT}`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, detail: string, fieldErrors: Record<string, string> = {}) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

type TokenProvider = () => Promise<string | null>;

let tokenProvider: TokenProvider = async () => null;

export function setTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeoutMs = 15000, signal } = options;
  const url = buildUrl(path, query);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener?.('abort', onAbort);

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = await tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = (error as Error)?.name === 'AbortError';
    throw new ApiError(
      0,
      aborted
        ? 'The request timed out. Check that the API server is running.'
        : `Cannot reach the API at ${apiBaseUrl()}. Is the backend running?`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const data = (payload ?? {}) as {
      detail?: string;
      message?: string;
      errors?: { field?: string; message?: string }[];
    };
    const fieldErrors: Record<string, string> = {};
    for (const entry of data.errors ?? []) {
      if (entry?.field) fieldErrors[entry.field] = entry.message ?? 'Invalid value';
    }
    const detail =
      data.detail ??
      data.message ??
      (response.status === 401
        ? 'Your session expired. Please sign in again.'
        : `Request failed (${response.status})`);
    throw new ApiError(response.status, detail, fieldErrors);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
