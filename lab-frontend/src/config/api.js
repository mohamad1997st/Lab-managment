const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api');

const trimmedApiBaseUrl = String(rawApiBaseUrl || '').trim().replace(/\/+$/, '');

export const API_BASE_URL =
  trimmedApiBaseUrl && !trimmedApiBaseUrl.endsWith('/api')
    ? `${trimmedApiBaseUrl}/api`
    : trimmedApiBaseUrl;

export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

export const APP_ORIGIN =
  import.meta.env.VITE_APP_ORIGIN ??
  (typeof window !== 'undefined' ? window.location.origin : API_ORIGIN);
