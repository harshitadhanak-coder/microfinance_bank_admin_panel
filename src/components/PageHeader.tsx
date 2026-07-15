import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

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

/**
 * Universal page header — the same anatomy on every page:
 *
 *   [Breadcrumb]
 *   [Title]                         [secondary actions] [primary action]
 *   [subtitle / meta / status]
 *   [tabs]
 *
 * `actions` is the right-aligned action cluster (put the one primary action
 * last). `meta` sits under the title for record context/status. `tabs` renders
 * the page's sub-view switch beneath the header.
 */
export function PageHeader({
  breadcrumb,
  title,
  badge,
  subtitle,
  meta,
  actions,
  tabs,
}: {
  breadcrumb?: Crumb[];
  title: ReactNode;
  /** Optional status indicator / badge shown inline beside the title. */
  badge?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="page-header">
      {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}
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
  );
}
