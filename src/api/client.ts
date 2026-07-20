import axios from 'axios';

// Base URL of the backend API. Set VITE_API_BASE_URL to hit the backend on a
// specific host (e.g. http://localhost:4000/api/v1 in dev). When unset or empty
// — as in a same-origin production build — it falls back to the relative
// '/api/v1' path that nginx reverse-proxies to the backend.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Endpoints where a 401 means "these credentials are wrong", not "this session
 * expired". They must bypass the refresh-and-redirect below: signing in with a
 * bad password would otherwise trigger a failed token refresh, redirect to
 * /login, and reload the page — wiping the very error the form is showing.
 *
 * Authenticated password flows are deliberately absent: the backend answers a
 * wrong current password on /auth/change-password with a 400, not a 401, so the
 * session is never mistaken for expired.
 */
const CREDENTIAL_PATHS = ['/auth/login', '/auth/refresh-token', '/auth/forgot-password', '/auth/reset-password'];
const isCredentialRequest = (url?: string): boolean =>
  !!url && CREDENTIAL_PATHS.some((path) => url.includes(path));

// Auto-refresh on 401, single retry
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !isCredentialRequest(original.url)) {
      original._retry = true;
      try {
        refreshing ??= axios
          .post(`${API_BASE_URL}/auth/refresh-token`, { refreshToken: localStorage.getItem('refreshToken') })
          .then((r) => {
            const { accessToken, refreshToken } = r.data.data;
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            return accessToken as string;
          })
          .finally(() => { refreshing = null; });
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        localStorage.clear();
        // Already on the sign-in screen? Reloading it would only discard state.
        if (window.location.pathname !== '/login') window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/**
 * A transient failure is a network drop (no HTTP response — e.g. the dev backend
 * restarting) or a 5xx; these are worth retrying. A 4xx is deterministic and
 * must not be retried. Used by the query client so a brief backend blip
 * self-heals instead of surfacing an error across the page.
 */
export const isTransientError = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status >= 500;
};

/** React-Query `retry` predicate: retry transient errors up to `max` times. */
export const retryTransient = (max = 4) => (failureCount: number, error: unknown): boolean =>
  isTransientError(error) && failureCount < max;

/** Exponential backoff (0.5s → 1s → 2s → 4s cap) for retried requests. */
export const retryBackoff = (attempt: number): number => Math.min(500 * 2 ** attempt, 4000);
