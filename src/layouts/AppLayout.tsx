import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import { navSections } from '../modules/auth/permissions';
import type { ModuleDef, ModuleGroup, ModuleKey } from '../modules/auth/permissions';
import { Modal } from '../components/Modal';
import { NotificationsBell } from '../components/NotificationsBell';
import {
  AlertCircle, Banknote, CalendarCheck, CalendarOff, ChevronDown, FileSpreadsheet, HandCoins,
  Landmark, LayoutDashboard, ListChecks, LogOut, Menu, PanelLeft, Settings2, Target, UserCheck,
  Users, Wallet, Briefcase,
} from '../components/icons';

/** One icon per navigation module so the sidebar reads at a glance. */
const MODULE_ICONS: Record<ModuleKey, ReactNode> = {
  dashboard: <LayoutDashboard size={18} />,
  hrDashboard: <Briefcase size={18} />,
  employees: <Users size={18} />,
  employeeImport: <FileSpreadsheet size={18} />,
  attendance: <CalendarCheck size={18} />,
  attendanceRequests: <ListChecks size={18} />,
  holidays: <CalendarOff size={18} />,
  leave: <CalendarOff size={18} />,
  payroll: <Wallet size={18} />,
  salaryAdvances: <HandCoins size={18} />,
  hrPolicy: <Settings2 size={18} />,
  orgChart: <UserCheck size={18} />,
  shifts: <CalendarCheck size={18} />,
  exit: <LogOut size={18} />,
  announcements: <AlertCircle size={18} />,
  hrPolicyLibrary: <FileSpreadsheet size={18} />,
  masters: <Settings2 size={18} />,
  reports: <FileSpreadsheet size={18} />,
  employeeLoans: <Banknote size={18} />,
  branches: <Landmark size={18} />,
  loans: <ListChecks size={18} />,
  loanLink: <UserCheck size={18} />,
  applications: <ListChecks size={18} />,
  leads: <Target size={18} />,
  collections: <HandCoins size={18} />,
  collectionImport: <FileSpreadsheet size={18} />,
  collectionRecords: <ListChecks size={18} />,
  collectionSettlement: <Landmark size={18} />,
  settlements: <HandCoins size={18} />,
  bankDeposits: <Banknote size={18} />,
  bankReconciliation: <Landmark size={18} />,
  users: <UserCheck size={18} />,
  documents: <FileSpreadsheet size={18} />,
  settings: <Settings2 size={18} />,
};

/** One icon per collapsible menu group (Overview items render as top-level links). */
const GROUP_ICONS: Record<ModuleGroup, ReactNode> = {
  overview: <LayoutDashboard size={18} />,
  hr: <Users size={18} />,
  finance: <Wallet size={18} />,
  operations: <Landmark size={18} />,
  insights: <FileSpreadsheet size={18} />,
  admin: <Settings2 size={18} />,
};

const COLLAPSE_KEY = 'mf-sidebar-collapsed';
const NAV_OPEN_KEY = 'mf-nav-open';

/** Does this module own the current URL? Mirrors NavLink's active logic. */
const isActivePath = (m: ModuleDef, pathname: string): boolean =>
  m.end ? pathname === m.to : pathname === m.to || pathname.startsWith(`${m.to}/`);

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Rail collapse (desktop, persisted) and drawer open (mobile, transient).
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Accordion menu: at most one group of submenu links open at a time, so the
  // whole nav always fits the viewport without its own scrollbar.
  const [openGroup, setOpenGroup] = useState<string | null>(() => localStorage.getItem(NAV_OPEN_KEY));

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => {
    if (openGroup) localStorage.setItem(NAV_OPEN_KEY, openGroup);
    else localStorage.removeItem(NAV_OPEN_KEY);
  }, [openGroup]);
  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const sections = navSections(user?.role);

  // Keep the group that owns the current page open (e.g. after a deep link).
  useEffect(() => {
    const owner = sections.find((s) => s.key !== 'overview' && s.modules.some((m) => isActivePath(m, location.pathname)));
    if (owner) setOpenGroup(owner.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const nameParts = (user?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const initials = ((nameParts[0]?.[0] ?? '') + (nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : '')).toUpperCase() || 'U';
  const roleLabel = (user?.role ?? '').replaceAll('_', ' ');

  const signOut = () => { logout(); navigate('/login'); };

  return (
    <div className={`shell${collapsed ? ' shell-collapsed' : ''}${drawerOpen ? ' shell-drawer-open' : ''}`}>
      {/* Mobile top bar — hamburger + brand. Hidden on lg+. */}
      <header className="topbar">
        <button type="button" className="icon-btn topbar-toggle" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          <Menu size={18} />
        </button>
        <Link to="/" className="topbar-brand"><span className="brand-mark sm">MF</span> Microfinance</Link>
        <div style={{ marginLeft: 'auto' }}><NotificationsBell /></div>
      </header>

      {/* Backdrop for the mobile drawer. */}
      <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <Link to="/" className="brand" title="Microfinance">
            <span className="brand-mark sm">MF</span>
            <span className="brand-name">Microfinance</span>
          </Link>
          {!collapsed && <NotificationsBell />}
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
          {sections.map((section) => {
            // Overview stays as always-visible top-level links.
            if (section.key === 'overview') {
              return section.modules.map((m) => (
                <NavLink key={m.to} to={m.to} end={m.end} title={m.label} className="nav-item">
                  <span className="nav-item-icon">{MODULE_ICONS[m.key]}</span>
                  <span className="nav-item-label">{m.label}</span>
                </NavLink>
              ));
            }
            const open = openGroup === section.key;
            const hasActive = section.modules.some((m) => isActivePath(m, location.pathname));
            return (
              <div key={section.key} className={`nav-group${open ? ' open' : ''}${hasActive ? ' has-active' : ''}`}>
                <button
                  type="button"
                  className="nav-group-head"
                  onClick={() => setOpenGroup((g) => (g === section.key ? null : section.key))}
                  aria-expanded={open}
                  title={section.label}
                >
                  <span className="nav-item-icon">{GROUP_ICONS[section.key]}</span>
                  <span className="nav-item-label">{section.label}</span>
                  <ChevronDown size={14} className="nav-group-caret" />
                </button>
                <div className="nav-group-items">
                  <div className="nav-group-inner">
                    {section.modules.map((m) => (
                      <NavLink key={m.to} to={m.to} end={m.end} title={m.label} className="nav-item sub">
                        <span className="nav-item-icon">{MODULE_ICONS[m.key]}</span>
                        <span className="nav-item-label">{m.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
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
