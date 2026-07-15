import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import { navSections } from '../modules/auth/permissions';
import type { ModuleKey } from '../modules/auth/permissions';
import { Modal } from '../components/Modal';
import {
  Banknote, CalendarCheck, CalendarOff, FileSpreadsheet, HandCoins,
  Landmark, LayoutDashboard, ListChecks, LogOut, Menu, PanelLeft, Settings2, Target, UserCheck,
  Users, Wallet, Briefcase,
} from '../components/icons';

/** One icon per navigation module so the sidebar reads at a glance. */
const MODULE_ICONS: Record<ModuleKey, ReactNode> = {
  dashboard: <LayoutDashboard size={20} />,
  hrDashboard: <Briefcase size={20} />,
  employees: <Users size={20} />,
  attendance: <CalendarCheck size={20} />,
  holidays: <CalendarOff size={20} />,
  leave: <CalendarOff size={20} />,
  payroll: <Wallet size={20} />,
  salaryAdvances: <HandCoins size={20} />,
  masters: <Settings2 size={20} />,
  reports: <FileSpreadsheet size={20} />,
  employeeLoans: <Banknote size={20} />,
  branches: <Landmark size={20} />,
  loans: <ListChecks size={20} />,
  loanLink: <UserCheck size={20} />,
  applications: <ListChecks size={20} />,
  leads: <Target size={20} />,
  collections: <HandCoins size={20} />,
  settlements: <HandCoins size={20} />,
  users: <UserCheck size={20} />,
  documents: <FileSpreadsheet size={20} />,
  settings: <Settings2 size={20} />,
};

const COLLAPSE_KEY = 'mf-sidebar-collapsed';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Rail collapse (desktop, persisted) and drawer open (mobile, transient).
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);
  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const sections = navSections(user?.role);

  const nameParts = (user?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const initials = ((nameParts[0]?.[0] ?? '') + (nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '')).toUpperCase() || 'U';
  const roleLabel = (user?.role ?? '').replaceAll('_', ' ');

  const signOut = () => { logout(); navigate('/login'); };

  return (
    <div className={`shell${collapsed ? ' shell-collapsed' : ''}${drawerOpen ? ' shell-drawer-open' : ''}`}>
      {/* Mobile top bar — hamburger + brand. Hidden on lg+. */}
      <header className="topbar">
        <button type="button" className="icon-btn topbar-toggle" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <Link to="/" className="topbar-brand"><span className="brand-mark sm">MF</span> Microfinance</Link>
      </header>

      {/* Backdrop for the mobile drawer. */}
      <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <Link to="/" className="brand" title="Microfinance">
            <span className="brand-mark sm">MF</span>
            <span className="brand-name">Microfinance</span>
          </Link>
          <button
            type="button"
            className="icon-btn sidebar-collapse"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <PanelLeft size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {sections.map((section) => (
            <div key={section.key} className="nav-section">
              <p className="nav-section-label">{section.label}</p>
              {section.modules.map((m) => (
                <NavLink key={m.to} to={m.to} end={m.end} title={m.label} className="nav-item">
                  <span className="nav-item-icon">{MODULE_ICONS[m.key]}</span>
                  <span className="nav-item-label">{m.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <NavLink to="/profile" className="profile-link" title={user?.fullName ?? 'Profile'}>
            <span className="user-avatar" aria-hidden="true">{initials}</span>
            <span className="user-meta">
              <strong>{user?.fullName}</strong>
              <span className="user-role">{roleLabel}</span>
            </span>
          </NavLink>
          <button type="button" className="signout-btn" onClick={() => setConfirmSignOut(true)} title="Sign out">
            <LogOut size={15} /> <span className="signout-label">Sign out</span>
          </button>
        </div>
      </aside>

      <main className="content"><Outlet /></main>

      {confirmSignOut && (
        <Modal size="sm" onClose={() => setConfirmSignOut(false)}>
          <div className="modal-icon" aria-hidden="true"><LogOut size={24} /></div>
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
