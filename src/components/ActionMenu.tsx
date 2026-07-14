import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from './icons';

export interface ActionItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Draw a divider above this item to separate action groups. */
  separatorBefore?: boolean;
}

const MENU_WIDTH = 200;
const GAP = 6;

/**
 * A single row-level actions control: a three-dot (⋮) trigger that opens a
 * dropdown of the actions valid for that row. The menu renders through a portal
 * with fixed positioning so it is never clipped by the table's horizontal
 * scroll container, and it closes on outside click, Escape, scroll or resize.
 *
 * Keeping every row to one fixed-width control gives the table a clean, aligned
 * Actions column — the enterprise pattern used across the rest of the product.
 */
export function ActionMenu({ items, label = 'Actions', disabled }: { items: ActionItem[]; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? items.length * 40 + 12;
    // Right-align the menu to the trigger; flip above if it would overflow.
    const left = Math.max(GAP, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - GAP));
    const opensUp = rect.bottom + GAP + height > window.innerHeight && rect.top - GAP - height > 0;
    const top = opensUp ? rect.top - GAP - height : rect.bottom + GAP;
    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDocClick);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open]);

  const select = (item: ActionItem) => {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`icon-btn action-trigger${open ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={18} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="action-menu"
          role="menu"
          style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
        >
          {items.map((item) => (
            <div key={item.key} role="none">
              {item.separatorBefore && <div className="action-menu-sep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={item.tone === 'danger' ? 'danger' : undefined}
                disabled={item.disabled}
                onClick={() => select(item)}
              >
                {item.icon && <span className="action-menu-icon" aria-hidden="true">{item.icon}</span>}
                {item.label}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
