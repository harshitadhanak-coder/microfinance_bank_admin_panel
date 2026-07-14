import { KeyboardEvent, ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader, X } from './icons';

type ModalSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'modal',                       // centred card — confirmations
  md: 'modal modal-wide',            // forms
  lg: 'modal modal-wide modal-lg',   // detail / table-heavy views
};

/** Elements Tab can land on — used by the focus trap and the auto-focus pass. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Stack of open dialog ids. Only the top-most dialog reacts to Escape, so a
 * confirmation opened on top of a detail modal closes just the confirmation.
 */
let modalCounter = 0;
const modalStack: number[] = [];

interface ModalProps {
  onClose: () => void;
  size?: ModalSize;
  /**
   * When set, the modal renders the standard icon + title + subtitle header
   * (and, with `footer`, a pinned action bar). Omit it for a bare card that
   * lays out its own content — e.g. a centred confirmation dialog.
   */
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Extra header content shown left of the close button (e.g. status pills). */
  headerAside?: ReactNode;
  /** Buttons for the pinned footer action bar. */
  footer?: ReactNode;
  /** Close when the dimmed backdrop is clicked. Defaults to true. */
  closeOnBackdrop?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The single modal primitive for the admin panel. It renders (through a portal
 * on document.body) the dimmed backdrop and an elevated card, and owns the
 * dialog behaviour every popup needs so no screen has to re-implement it:
 *   • Escape closes the top-most dialog only (dialogs can be safely nested).
 *   • Background scrolling is locked while it is open.
 *   • Focus moves into the dialog on open and is restored to the trigger on
 *     close; Tab is trapped within the card.
 * Pass `title` (with optional `icon`, `subtitle`, `headerAside`, `footer`) for
 * the standard header/body/footer layout, or omit it to lay out the card body
 * yourself.
 */
export function Modal({
  onClose,
  size = 'md',
  title,
  subtitle,
  icon,
  headerAside,
  footer,
  closeOnBackdrop = true,
  className,
  children,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const structured = title != null;

  // onClose can be an inline closure that changes identity each render; keep a
  // ref so the mount-once effect always calls the latest one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Register in the dialog stack; Escape closes only the top-most dialog.
  // Lock background scroll while open (save/restore composes correctly when
  // dialogs are nested).
  useEffect(() => {
    const id = ++modalCounter;
    modalStack.push(id);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Move focus into the dialog on open; restore it to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const target =
      card?.querySelector<HTMLElement>('[data-autofocus]') ??
      card?.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])') ??
      card;
    target?.focus({ preventScroll: true });
    return () => previouslyFocused?.focus?.({ preventScroll: true });
  }, []);

  // Keep Tab focus within the dialog.
  const trapFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !cardRef.current) return;
    const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        ref={cardRef}
        className={`${SIZE_CLASS[size]}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={structured ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapFocus}
      >
        {structured ? (
          <>
            <ModalHeader icon={icon} title={title} subtitle={subtitle} titleId={titleId} aside={headerAside} onClose={onClose} />
            {children}
            {footer != null && <div className="modal-actions">{footer}</div>}
          </>
        ) : (
          children
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Standard modal header — an icon badge, the title/subtitle stack and the
 * close button. Rendered automatically by `Modal` when a `title` is supplied;
 * exported for the rare screen that needs to compose a header by hand.
 */
export function ModalHeader({
  icon,
  title,
  subtitle,
  titleId,
  aside,
  onClose,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  titleId?: string;
  aside?: ReactNode;
  onClose: () => void;
}) {
  return (
    <header className="modal-head">
      {icon && <span className="modal-head-icon" aria-hidden="true">{icon}</span>}
      <div className="modal-head-text">
        <h2 id={titleId}>{title}</h2>
        {subtitle != null && <p className="muted">{subtitle}</p>}
      </div>
      {aside != null && <div className="modal-head-aside">{aside}</div>}
      <button type="button" className="icon-btn modal-head-close" onClick={onClose} aria-label="Close dialog">
        <X size={18} />
      </button>
    </header>
  );
}

type ConfirmTone = 'default' | 'info' | 'success' | 'warn' | 'danger';

/**
 * Reusable confirmation dialog for reversible-but-consequential actions
 * (stage changes, deletes, sign-out). Renders a compact centred card with a
 * tinted icon badge, a question, and Cancel / Confirm buttons. Nests safely on
 * top of any other `Modal`. Keep the caller's mutation untouched — just gate it
 * behind `onConfirm`.
 */
export function ConfirmDialog({
  title,
  message,
  icon,
  tone = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}: {
  title: ReactNode;
  message?: ReactNode;
  icon?: ReactNode;
  tone?: ConfirmTone;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal size="sm" onClose={onCancel} closeOnBackdrop={!loading}>
      {icon && <div className={`modal-icon modal-icon-${tone}`} aria-hidden="true">{icon}</div>}
      <h2>{title}</h2>
      {message != null && <p className="muted">{message}</p>}
      <div className="modal-actions">
        <button type="button" className="ghost" data-autofocus onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </button>
        <button type="button" className={tone === 'danger' ? 'danger' : ''} onClick={onConfirm} disabled={loading}>
          {loading ? <><Loader size={15} /> Working…</> : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
