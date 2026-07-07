import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import { visibleModules } from '../modules/auth/permissions';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const nav = visibleModules(user?.role);

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
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
          ))}
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
