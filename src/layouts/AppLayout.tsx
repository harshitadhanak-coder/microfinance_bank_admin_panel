import { ReactNode, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import { navItems } from '../modules/auth/permissions';
import type { ModuleKey } from '../modules/auth/permissions';
import { Modal } from '../components/Modal';
import {
  Banknote, Briefcase, CalendarCheck, CalendarOff, ChevronDown, HandCoins,
  Landmark, LayoutDashboard, ListChecks, LogOut, Settings2, Target, UserCheck,
  Users, Wallet,
} from '../components/icons';

/** One icon per navigation module so the sidebar reads at a glance. */
const MODULE_ICONS: Record<ModuleKey, ReactNode> = {
  dashboard: <LayoutDashboard />,
  hrDashboard: <LayoutDashboard />,
  employees: <Users />,
  attendance: <CalendarCheck />,
  leave: <CalendarOff />,
  payroll: <Wallet />,
  employeeLoans: <Banknote />,
  branches: <Landmark />,
  loans: <ListChecks />,
  loanLink: <UserCheck />,
  applications: <ListChecks />,
  leads: <Target />,
  collections: <HandCoins />,
  settlements: <HandCoins />,
};

const GROUP_ICONS: Record<string, ReactNode> = {
  hr: <Briefcase />,
  operations: <Settings2 />,
};

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
                  {MODULE_ICONS[item.module.key]}
                  <span>{item.module.label}</span>
                </NavLink>
              );
            }

            const childActive = item.children.some((c) =>
              c.end ? location.pathname === c.to : location.pathname.startsWith(c.to),
            );
            // Collapsed by default; the user opens a section explicitly.
            const open = openGroups[item.key] ?? false;

            return (
              <div key={item.key} className="nav-group">
                <button
                  type="button"
                  className={`nav-group-toggle${childActive ? ' has-active' : ''}`}
                  aria-expanded={open}
                  onClick={() => toggleGroup(item.key)}
                >
                  {GROUP_ICONS[item.key]}
                  <span className="nav-label">{item.label}</span>
                  {!open && childActive && <span className="nav-active-dot" aria-hidden="true" />}
                  <span className={`nav-caret${open ? ' open' : ''}`} aria-hidden="true"><ChevronDown size={14} /></span>
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
          <button className="ghost" onClick={() => setConfirmSignOut(true)}><LogOut size={15} /> Sign out</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>

      {confirmSignOut && (
        <Modal size="sm" onClose={() => setConfirmSignOut(false)}>
          <div className="modal-icon" aria-hidden="true">
            <LogOut size={24} />
          </div>
          <h2>Sign out?</h2>
          <p className="muted">You will need to sign in again to access the admin panel.</p>
          <div className="modal-actions">
            <button className="ghost" data-autofocus onClick={() => setConfirmSignOut(false)}>Cancel</button>
            <button className="danger" onClick={signOut}>Sign out</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
