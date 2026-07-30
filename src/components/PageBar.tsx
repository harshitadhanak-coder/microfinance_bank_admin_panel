import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import { NotificationsBell } from './NotificationsBell';
import { Breadcrumb, Crumb } from './PageHeader';

/** Id of the slot AppLayout renders above the page for <PageBar> to fill. */
export const APP_BAR_SLOT_ID = 'app-bar-slot';

/**
 * The page's header surface — one white block, two rows (see `.pagebar` in
 * styles.css for the anatomy and the reasoning):
 *
 *   path   breadcrumb trail (where you are)   alerts + account (who you are)
 *   head   `children`: the page's <PageHeader> (what this page is + actions)
 *
 * It renders through a portal into AppLayout's slot, so a page opts in with one
 * wrapper and pages that don't use it keep their exact previous layout (the
 * empty slot collapses). Mount at most one per page.
 *
 *   <PageBar breadcrumb={[{ label: 'Dashboard', to: '/' }, { label: 'Employees' }]}>
 *     <PageHeader variant="feature" title="Employees" … />
 *   </PageBar>
 */
export function PageBar({ breadcrumb, actions, children }: {
  breadcrumb: Crumb[];
  /** Extra controls placed left of the standard alerts + account cluster. */
  actions?: ReactNode;
  /** The page's <PageHeader>, rendered on the same surface. */
  children?: ReactNode;
}) {
  const { user } = useAuth();
  // The slot lives in AppLayout, which has already mounted by the time a page
  // renders — resolve it in an effect so the portal target is never null-read
  // during the first render pass.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.getElementById(APP_BAR_SLOT_ID)); }, []);
  if (!host) return null;

  const parts = (user?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || 'U';

  return createPortal(
    <div className="pagebar">
      <div className="pagebar-row pagebar-path">
        <Breadcrumb items={breadcrumb} />
        <div className="pagebar-actions">
          {actions}
          <NotificationsBell />
          <Link to="/profile" className="pagebar-account" title={user?.fullName ?? 'Profile'}>
            <span className="user-avatar sm" aria-hidden="true">{initials}</span>
            <span className="pagebar-account-name">{user?.fullName}</span>
          </Link>
        </div>
      </div>
      {children && <div className="pagebar-row pagebar-head">{children}</div>}
    </div>,
    host,
  );
}
