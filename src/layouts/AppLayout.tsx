import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import { navSections } from '../modules/auth/permissions';
import type { ModuleDef } from '../modules/auth/permissions';
import { MODULE_ICONS, GROUP_ICONS } from '../modules/nav/moduleIcons';
import { recordVisit } from '../modules/nav/frequent';
import { Modal } from '../components/Modal';
import { CommandPalette } from '../components/CommandPalette';
import { NotificationsBell } from '../components/NotificationsBell';
import { APP_BAR_SLOT_ID } from '../components/PageBar';
import { ChevronDown, LogOut, Menu, PanelLeft } from '../components/icons';

const COLLAPSE_KEY = 'mf-sidebar-collapsed';
const NAV_OPEN_KEY = 'mf-nav-open';

/** Does this module own the current URL? Mirrors NavLink's active logic. */
const isActivePath = (m: ModuleDef, pathname: string): boolean =>
  m.end ? pathname === m.to : pathname === m.to || pathname.startsWith(`${m.to}/`);

/**
 * Longest-prefix wins: `/collections` must not stay lit while we are on its
 * nested sibling `/collections/records` (same for `/reconciliation` and its
 * `/deposits` child), yet it must still light up on a detail route like
 * `/collections/123` that no sibling claims. Treating the shadowed parent as
 * `end` for that render gives NavLink both behaviours for free.
 */
const isShadowed = (m: ModuleDef, all: ModuleDef[], pathname: string): boolean =>
  all.some((o) => o.to.length > m.to.length && o.to.startsWith(`${m.to}/`) && isActivePath(o, pathname));

/**
 * Pointing at a group head opens it after this pause. The delay is what makes
 * hover-to-open usable rather than chaotic: without it, dragging the pointer
 * down the sidebar would fire every group it crosses and shove the rows out
 * from under the cursor mid-click.
 */
const HOVER_OPEN_MS = 220;

/** Reads the persisted open-group list, migrating the older single-key value. */
const readOpenGroups = (): string[] => {
  const raw = localStorage.getItem(NAV_OPEN_KEY);
  if (!raw) return [];
  try {
    const saved = JSON.parse(raw) as unknown;
    if (Array.isArray(saved)) return saved.filter((k): k is string => typeof k === 'string');
    return typeof saved === 'string' ? [saved] : [];
  } catch {
    // The first version stored a bare group key, which is not valid JSON.
    return [raw];
  }
};

/**
 * The admin shell: sidebar tree, then the page.
 *
 * The nav is a single column — Overview links, then a collapsible group per
 * area. Unlike the first version, several groups may be open at once and the
 * open set is persisted, so navigating never folds away the group you are
 * working in; the sidebar scrolls instead. Ctrl-K opens a palette over all ~35
 * screens for anyone who would rather type than click.
 */
export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Rail collapse (desktop, persisted) and drawer open (mobile, transient).
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(readOpenGroups);
  // A group opened by pointing at it. Kept apart from `openGroups` so a hover
  // preview closes again when the pointer leaves — only a click makes it stick.
  const [hoverGroup, setHoverGroup] = useState<string | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  const cancelHover = () => { window.clearTimeout(hoverTimer.current); };
  // Touch and pen users get no hover state, and firing on their first tap would
  // open a group they only meant to scroll past.
  const hoverEnabled = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const onHeadEnter = (key: string) => {
    if (!hoverEnabled() || collapsed) return;
    cancelHover();
    hoverTimer.current = window.setTimeout(() => setHoverGroup(key), HOVER_OPEN_MS);
  };
  // Leaving the nav entirely drops the preview; moving between heads inside it
  // just re-arms the timer, so the tree does not flicker on the way down.
  const onNavLeave = () => { cancelHover(); setHoverGroup(null); };

  useEffect(() => cancelHover, []);

  useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(openGroups)); }, [openGroups]);
  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Ctrl/⌘-K opens the palette from anywhere.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const sections = navSections(user?.role);
  const allModules = sections.flatMap((s) => s.modules);

  // Open the group that owns the current page (e.g. after a deep link) without
  // touching the others, and count the visit for the palette's default list.
  useEffect(() => {
    const owner = sections.find((s) => s.key !== 'overview' && s.modules.some((m) => isActivePath(m, location.pathname)));
    if (owner) setOpenGroups((groups) => (groups.includes(owner.key) ? groups : [...groups, owner.key]));
    const visited = allModules.find((m) => isActivePath(m, location.pathname) && !isShadowed(m, allModules, location.pathname));
    if (visited) recordVisit(visited.to);
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

        <nav className="sidebar-nav" onMouseLeave={onNavLeave}>
          {sections.map((section) => {
            // Overview stays as always-visible top-level links.
            if (section.key === 'overview') {
              return section.modules.map((m) => (
                <NavLink
                  key={m.to}
                  to={m.to}
                  end={m.end || isShadowed(m, allModules, location.pathname)}
                  title={m.label}
                  className="nav-item"
                >
                  <span className="nav-item-icon">{MODULE_ICONS[m.key]}</span>
                  <span className="nav-item-label">{m.label}</span>
                </NavLink>
              ));
            }
            const open = openGroups.includes(section.key) || hoverGroup === section.key;
            const hasActive = section.modules.some((m) => isActivePath(m, location.pathname));
            return (
              <div key={section.key} className={`nav-group${open ? ' open' : ''}${hasActive ? ' has-active' : ''}`}>
                <button
                  type="button"
                  className="nav-group-head"
                  // Collapsed, the rail shows only group icons and there is
                  // nowhere to expand into — so a click reopens the sidebar on
                  // that group. Otherwise it toggles; a hover-previewed group is
                  // not yet in openGroups, so the toggle promotes it to sticky.
                  onClick={() => {
                    cancelHover();
                    setHoverGroup(null);
                    if (collapsed) {
                      setCollapsed(false);
                      setOpenGroups((g) => (g.includes(section.key) ? g : [...g, section.key]));
                      return;
                    }
                    setOpenGroups((g) => (g.includes(section.key) ? g.filter((k) => k !== section.key) : [...g, section.key]));
                  }}
                  onMouseEnter={() => onHeadEnter(section.key)}
                  onMouseLeave={cancelHover}
                  aria-expanded={open}
                  title={section.label}
                >
                  <span className="nav-item-icon">{GROUP_ICONS[section.key]}</span>
                  <span className="nav-item-label">{section.label}</span>
                  <ChevronDown size={14} className="nav-group-caret" />
                </button>
                <div className="nav-group-items">
                  <div className="nav-group-inner">
                    {section.modules.map((m, i) => (
                      <NavLink
                        key={m.to}
                        to={m.to}
                        end={m.end || isShadowed(m, allModules, location.pathname)}
                        title={m.label}
                        className="nav-item sub"
                        // Row position drives the stagger delay on open.
                        style={{ '--i': i } as CSSProperties}
                      >
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

      {/* The page column: an app-bar slot pages can fill via <PageBar> (it
          collapses when unused), then the page itself. */}
      <main className="content-shell">
        <div id={APP_BAR_SLOT_ID} className="pagebar-slot" />
        <div className="content"><Outlet /></div>
      </main>

      {paletteOpen && <CommandPalette sections={sections} onClose={() => setPaletteOpen(false)} />}

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
