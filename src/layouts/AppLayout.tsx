import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import { navItems } from '../modules/auth/permissions';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const nav = navItems(user?.role);
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  const nameParts = (user?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const initials = ((nameParts[0]?.[0] ?? '') + (nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '')).toUpperCase() || 'U';

  const roleLabel = (user?.role ?? '').replaceAll('_', ' ');
  const branchLine = user?.branch ? `${user.branch.name} · ${user.branch.city}, ${user.branch.state}` : null;

  const signOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand"><span className="brand-mark sm">MF</span> Microfinance</Link>
        <nav>
          {nav.map((item) => {
            if (item.type === 'link') {
              return (
                <NavLink key={item.module.to} to={item.module.to} end={item.module.end}>
                  {item.module.label}
                </NavLink>
              );
            }

            const childActive = item.children.some((c) =>
              c.end ? location.pathname === c.to : location.pathname.startsWith(c.to),
            );
            const open = openGroups[item.key] ?? childActive;

            return (
              <div key={item.key} className="nav-group">
                <button
                  type="button"
                  className={`nav-group-toggle${childActive ? ' has-active' : ''}`}
                  aria-expanded={open}
                  onClick={() => toggleGroup(item.key)}
                >
                  <span>{item.label}</span>
                  <span className={`nav-caret${open ? ' open' : ''}`} aria-hidden="true">▾</span>
                </button>
                {open && (
                  <div className="nav-sub">
                    {item.children.map((c) => (
                      <NavLink key={c.to} to={c.to} end={c.end}>{c.label}</NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip" tabIndex={0} role="button" aria-label="Account details">
            <span className="user-avatar" aria-hidden="true">{initials}</span>
            <span className="user-meta">
              <strong>{user?.fullName}</strong>
              <span className="user-role">{roleLabel}</span>
              {branchLine && <span className="user-branch">{branchLine}</span>}
            </span>

            <div className="user-popover" role="tooltip">
              <div className="user-popover-head">
                <span className="user-avatar lg" aria-hidden="true">{initials}</span>
                <div>
                  <strong>{user?.fullName}</strong>
                  <span className="user-role">{roleLabel}</span>
                </div>
              </div>
              <dl className="user-popover-list">
                <div>
                  <dt>Email</dt>
                  <dd>{user?.email}</dd>
                </div>
                {user?.branch ? (
                  <>
                    <div>
                      <dt>Branch</dt>
                      <dd>{user.branch.name} <span className="muted">({user.branch.code})</span></dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{user.branch.city}, {user.branch.state}</dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt>Scope</dt>
                    <dd>All branches</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
          <button className="ghost" onClick={() => setConfirmSignOut(true)}>Sign out</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>

      {confirmSignOut && (
        <div className="modal-overlay" onClick={() => setConfirmSignOut(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="signout-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>
            <h2 id="signout-title">Sign out?</h2>
            <p className="muted">You will need to sign in again to access the admin panel.</p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirmSignOut(false)}>Cancel</button>
              <button className="danger" onClick={signOut}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
