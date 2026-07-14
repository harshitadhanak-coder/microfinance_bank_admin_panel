import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from '../../api/client';

interface AuthBranch { id: string; code: string; name: string; city: string; state: string }

interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  role: string;
  branchId: string | null;
  branch?: AuthBranch | null;
  lastLoginAt?: string | null;
  status?: string;
}

interface AuthCtx {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });

  /** Load the full profile (incl. assigned branch) for the current session. */
  const loadProfile = async () => {
    try {
      const { data } = await api.get('/auth/me');
      localStorage.setItem('user', JSON.stringify(data.data));
      setUser(data.data);
    } catch {
      // Token invalid/expired — the response interceptor handles the redirect.
    }
  };

  // On first load (e.g. a page refresh), refresh the profile so branch details
  // and the latest role are always present, not just what login returned.
  useEffect(() => {
    if (localStorage.getItem('accessToken')) void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    // Portal lock: this is the Admin Panel website — field officers must use the
    // Field Officer site instead. The backend rejects a role/portal mismatch.
    const { data } = await api.post('/auth/login', { email, password, portal: 'ADMIN' });
    const { accessToken, refreshToken, user } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    await loadProfile();
  };

  const logout = () => {
    api.post('/auth/logout', { refreshToken: localStorage.getItem('refreshToken') }).catch(() => undefined);
    localStorage.clear();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}
