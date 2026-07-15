import { KeyboardEvent, ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from './icons';

type DrawerSize = 'sm' | 'md';

/**
 * Right-side slide-over for contextual detail / quick-edit without leaving the
 * list — peek a lead, quick-approve a leave, view a collection visit. A drawer
 * is a *peek*; a full record still lives on its own page. Shares the Modal's
 * dialog behaviour (Escape, scroll-lock, focus trap, focus restore).
 */
export function Drawer({
  onClose,
  title,
  subtitle,
  headerAside,
  footer,
  size = 'md',
  children,
}: {
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  headerAside?: ReactNode;
  footer?: ReactNode;
  size?: DrawerSize;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input,select,textarea,button') ??
      panel;
    target?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  const trapFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    )).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className="drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className={`drawer drawer-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
      >
        <header className="drawer-head">
          <div className="drawer-head-text">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {headerAside && <div className="drawer-head-aside">{headerAside}</div>}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel"><X size={18} /></button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
