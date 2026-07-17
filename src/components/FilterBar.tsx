import { ReactNode } from 'react';
import { X } from './icons';

export interface FilterChip {
  key: string;
  /** e.g. "Status: Active" */
  label: string;
  onRemove: () => void;
}

/**
 * A consistent filter surface: one horizontal toolbar — leading search (grows
 * to fill), inline filter controls (`children`), then a Reset button when any
 * filter is active — with removable active-filter chips beneath. Replaces the
 * ad-hoc `.filter-bar` CSS class each page reinvented. The owner keeps the
 * filter state (ideally reflected in the URL) and passes derived `chips`.
 */
export function FilterBar({
  children,
  chips = [],
  onReset,
  onClearAll,
  search,
  actions,
  className,
}: {
  children: ReactNode;
  chips?: FilterChip[];
  onReset?: () => void;
  /**
   * When set, renders a single "Clear all" reset at the end of the active-filter
   * chip row — where users look to clear filters — instead of a button up in the
   * toolbar. The row appears whenever there are chips OR this is set.
   */
  onClearAll?: () => void;
  /** Leading search field — first and largest element of the toolbar. */
  search?: ReactNode;
  /** Right-aligned controls (e.g. density toggle, export). */
  actions?: ReactNode;
  /** Extra class on the root, e.g. `filterbar-compact` to tighten control widths. */
  className?: string;
}) {
  return (
    <div className={`filterbar${className ? ` ${className}` : ''}`}>
      <div className="filterbar-row">
        {search && <div className="filterbar-search">{search}</div>}
        <div className="filterbar-controls">{children}</div>
        {onReset && (
          <button type="button" className="ghost filterbar-reset" onClick={onReset}>Reset</button>
        )}
        {actions && <div className="filterbar-actions">{actions}</div>}
      </div>
      {(chips.length > 0 || onClearAll) && (
        <div className="filterbar-chips">
          {chips.map((c) => (
            <button key={c.key} type="button" className="filter-chip" onClick={c.onRemove}>
              {c.label}
              <X size={13} />
            </button>
          ))}
          {onClearAll && (
            <button type="button" className="filter-reset" onClick={onClearAll}>Clear all</button>
          )}
        </div>
      )}
    </div>
  );
}
