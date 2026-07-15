import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from './icons';

/**
 * Surface container: bordered white card on `--radius`, `--space-6` padding,
 * `--shadow-1`. Optional header (title + action) and footer. Use for grouped
 * detail sections and dashboard panels — replaces ad-hoc `.panel .pad` blocks.
 */
export function Card({
  title,
  action,
  footer,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {action && <div className="card-head-action">{action}</div>}
        </header>
      )}
      <div className={`card-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
      {footer && <footer className="card-foot">{footer}</footer>}
    </section>
  );
}

export type Delta = { value: string; direction: 'up' | 'down' | 'flat' };

/**
 * KPI tile: xs-uppercase label, Archivo tabular value, optional coloured delta
 * and an optional click-through to the source list (the whole tile becomes a
 * link). `tone` tints the leading icon badge.
 */
export function StatCard({
  label,
  value,
  hint,
  delta,
  icon,
  tone = 'brass',
  to,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  delta?: Delta;
  icon?: ReactNode;
  tone?: 'brass' | 'success' | 'info' | 'warning' | 'danger';
  to?: string;
}) {
  const inner = (
    <>
      <div className="statcard-top">
        <span className="statcard-label">{label}</span>
        {icon && <span className={`statcard-icon tone-${tone}`}>{icon}</span>}
      </div>
      <span className="statcard-value num">{value}</span>
      {(delta || hint || to) && (
        <div className="statcard-foot">
          {delta && <span className={`statcard-delta dir-${delta.direction}`}>{delta.value}</span>}
          {hint && <span className="statcard-hint">{hint}</span>}
          {to && <ArrowRight size={15} className="statcard-go" />}
        </div>
      )}
    </>
  );
  return to ? (
    <Link to={to} className="statcard statcard-link">{inner}</Link>
  ) : (
    <div className="statcard">{inner}</div>
  );
}
