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

// Auto-refresh on 401, single retry
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
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
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
