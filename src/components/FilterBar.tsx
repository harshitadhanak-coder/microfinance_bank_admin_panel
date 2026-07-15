import { ReactNode } from 'react';
import { X } from './icons';

export interface FilterChip {
  key: string;
  /** e.g. "Status: Active" */
  label: string;
  onRemove: () => void;
}

/**
 * A consistent filter surface: inline filter controls (`children`) with a row
 * of removable active-filter chips beneath and a one-click "Clear all". Replaces
 * the ad-hoc `.filter-bar` CSS class each page reinvented. The owner keeps the
 * filter state (ideally reflected in the URL) and passes derived `chips`.
 */
export function FilterBar({
  children,
  chips = [],
  onReset,
  actions,
  className,
}: {
  children: ReactNode;
  chips?: FilterChip[];
  onReset?: () => void;
  /** Right-aligned controls (e.g. density toggle, export). */
  actions?: ReactNode;
  /** Extra class on the root, e.g. `filterbar-compact` to tighten control widths. */
  className?: string;
}) {
  return (
    <div className={`filterbar${className ? ` ${className}` : ''}`}>
      <div className="filterbar-row">
        <div className="filterbar-controls">{children}</div>
        {actions && <div className="filterbar-actions">{actions}</div>}
      </div>
      {chips.length > 0 && (
        <div className="filterbar-chips">
          {chips.map((c) => (
            <button key={c.key} type="button" className="filter-chip" onClick={c.onRemove}>
              {c.label}
              <X size={13} />
            </button>
          ))}
          {onReset && (
            <button type="button" className="filter-reset" onClick={onReset}>Clear all</button>
          )}
        </div>
      )}
    </div>
  );
}
