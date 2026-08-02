import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../modules/auth/AuthContext';
import { NotificationsBell } from './NotificationsBell';

export interface Crumb {
  label: string;
  /** Omit `to` for the current (leaf) page — rendered as plain text. */
  to?: string;
}

/**
 * Breadcrumb trail shown above a page title: `Section / List / Record`.
 * Ancestors link; the last crumb is the current page (non-link).
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (!items.length) return null;
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="crumb">
            {c.to && !last ? <Link to={c.to}>{c.label}</Link> : <span aria-current={last ? 'page' : undefined}>{c.label}</span>}
            {!last && <span className="crumb-sep" aria-hidden="true">/</span>}
          </span>
        );
      })}
    </nav>
  );
}

/** Id of the slot AppLayout renders above the page (kept in sync with <PageBar>). */
const APP_BAR_SLOT = 'app-bar-slot';

/**
 * Universal page header — the same anatomy on every page:
 *
 *   [Breadcrumb + account chrome]  ← the top "page bar" strip (portaled up)
 *   [Title]                        [secondary actions] [primary action]
 *   [subtitle / meta / status]
 *   [tabs]
 *
 * When a `breadcrumb` is supplied it is rendered into the shared top strip
 * (breadcrumb on the left, notifications + account on the right) instead of
 * inline — so every page gets the same premium header layout as Employees with
 * no per-page changes. Pages that opt into <PageBar> directly (and pass no
 * breadcrumb here) are unaffected.
 *
 * `actions` is the right-aligned action cluster (put the one primary action
 * last). `meta` sits under the title for record context/status. `tabs` renders
 * the page's sub-view switch beneath the header.
 *
 * `variant="feature"` is the opt-in treatment for a module's landing page: a
 * denser, more deliberate title block, sized for a header surface (see
 * <PageBar>) rather than for the open page.
 */
export function PageHeader({
  breadcrumb,
  title,
  badge,
  subtitle,
  meta,
  actions,
  tabs,
  variant = 'default',
}: {
  breadcrumb?: Crumb[];
  title: ReactNode;
  /** Optional status indicator / badge shown inline beside the title. */
  badge?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  variant?: 'default' | 'feature';
}) {
  const { user } = useAuth();
  const hasCrumb = !!breadcrumb && breadcrumb.length > 0;

  // The slot lives in AppLayout, mounted before any page renders; resolve it in
  // an effect so the portal target is never null-read during the first pass.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(hasCrumb ? document.getElementById(APP_BAR_SLOT) : null); }, [hasCrumb]);

  const parts = (user?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || 'U';

  return (
    <>
      {hasCrumb && host && createPortal(
        <div className="pagebar">
          <div className="pagebar-row pagebar-path">
            <Breadcrumb items={breadcrumb!} />
            <div className="pagebar-actions">
              <NotificationsBell />
              <Link to="/profile" className="pagebar-account" title={user?.fullName ?? 'Profile'}>
                <span className="user-avatar sm" aria-hidden="true">{initials}</span>
                <span className="pagebar-account-name">{user?.fullName}</span>
              </Link>
            </div>
          </div>
        </div>,
        host,
      )}
      <header className={`page-header${variant === 'feature' ? ' page-header--feature' : ''}`}>
        <div className="page-header-row">
          <div className="page-header-title">
            <div className="page-header-titlerow">
              <h1>{title}</h1>
              {badge && <span className="page-header-badge">{badge}</span>}
            </div>
            {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="page-header-actions">{actions}</div>}
        </div>
        {meta && <div className="page-header-meta">{meta}</div>}
        {tabs}
      </header>
    </>
  );
}
