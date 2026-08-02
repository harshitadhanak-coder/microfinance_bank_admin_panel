import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { setEffectivePermissions } from './permissions';

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

const PERMISSIONS_KEY = 'permissions';

interface StoredPermissions {
  wildcard?: boolean;
  scope?: 'ALL' | 'BRANCH' | 'SELF' | 'ASSIGNED';
  permissions?: string[];
}

/**
 * Read the last-known permission set straight out of localStorage during module
 * init, so the very first render already has it. Without this the app would
 * render once with no permissions and bounce a matrix-driven role (Operations,
 * or any custom role) to /profile before the fetch came back.
 */
const hydratePermissionsFromStorage = (): StoredPermissions | null => {
  try {
    const raw = localStorage.getItem(PERMISSIONS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPermissions;
    setEffectivePermissions(parsed);
    return parsed;
  } catch {
    return null;
  }
};

interface AuthCtx {
  user: AuthUser | null;
  /** True when the current session must change its password before continuing. */
  mustChangePassword: boolean;
  /** Clear the forced-change flag once the password has been changed. */
  clearMustChangePassword: () => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(
    () => localStorage.getItem('mustChangePassword') === 'true',
  );
  // Bumped whenever the permission set changes, purely to re-render consumers:
  // `can()` / `visibleModules()` read the set from the permissions module rather
  // than from props, so React needs a state change to know to redraw the shell.
  const [, setPermissionVersion] = useState(() => {
    hydratePermissionsFromStorage();
    return 0;
  });

  const clearMustChangePassword = () => {
    localStorage.removeItem('mustChangePassword');
    setMustChangePassword(false);
  };

  /**
   * Load the effective permissions for the session. These decide the sidebar and
   * every in-page action for roles outside the six built-ins — including every
   * role created in Roles & Permissions.
   */
  const loadPermissions = async () => {
    try {
      const { data } = await api.get('/me/permissions');
      localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(data.data));
      setEffectivePermissions(data.data);
      setPermissionVersion((version) => version + 1);
    } catch {
      // Leave whatever was hydrated from storage in place; the response
      // interceptor handles an expired token.
    }
  };

  /**
   * Load the full profile (incl. assigned branch) for the current session.
   * `withPermissions` is false straight after signing in, where the login
   * response already supplied them — refetching would be a wasted round trip.
   */
  const loadProfile = async (withPermissions = true) => {
    try {
      const [{ data }] = await Promise.all([
        api.get('/auth/me'),
        withPermissions ? loadPermissions() : Promise.resolve(),
      ]);
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

  const login = async (email: string, password: string): Promise<boolean> => {
    // Portal lock: this is the Admin Panel website — field officers must use the
    // Field Officer site instead. The backend rejects a role/portal mismatch.
    const { data } = await api.post('/auth/login', { email, password, portal: 'ADMIN' });
    const { accessToken, refreshToken, user, permissions } = data.data;
    const mustChange = data.data.mustChangePassword === true;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    if (mustChange) localStorage.setItem('mustChangePassword', 'true');
    else localStorage.removeItem('mustChangePassword');
    setMustChangePassword(mustChange);
    setUser(user);

    // The sign-in response already carries the effective permission set, so the
    // sidebar and the landing-route decision are ready without waiting on a
    // second request. Only fall back to fetching them when talking to an older
    // backend that does not send them.
    if (permissions) {
      localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
      setEffectivePermissions(permissions);
      setPermissionVersion((version) => version + 1);
    } else {
      await loadPermissions();
    }

    // The full profile (assigned branch, lastLoginAt) is a nicety, not a gate:
    // login already returned the user. Refreshing it in the background lets the
    // app render immediately instead of holding the "Signing in…" button for
    // another round trip. Skipped entirely when a forced password change is
    // pending — that screen needs none of it.
    // Permissions are already in place by here (from the response or the
    // fallback fetch above), so the background refresh only needs the profile.
    if (!mustChange) void loadProfile(false);
    return mustChange;
  };

  const logout = () => {
    api.post('/auth/logout', { refreshToken: localStorage.getItem('refreshToken') }).catch(() => undefined);
    localStorage.clear();
    setEffectivePermissions(null);
    setUser(null);
    setMustChangePassword(false);
  };

  return (
    <Ctx.Provider value={{ user, mustChangePassword, clearMustChangePassword, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}
