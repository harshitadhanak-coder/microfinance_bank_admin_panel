import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hover / focus tooltip for content that is too long to sit in a table cell.
 *
 * It renders into `document.body` rather than next to its trigger on purpose:
 * the data tables scroll inside `.table-scroll` (`overflow: auto`), and an
 * absolutely-positioned bubble inside that container gets clipped at the edge
 * exactly when it is most needed. A fixed-position portal escapes the clip.
 *
 * Position is measured after mount so the bubble can flip above the trigger
 * when there is no room below, and is clamped to the viewport so it never hangs
 * off-screen. `title` is deliberately NOT used — the native tooltip cannot be
 * styled, takes a second to appear, and truncates multi-line text.
 */
export function Tooltip({ content, children, className }: {
  /** Rich content for the bubble. Nothing renders when this is empty. */
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  /**
   * Positions the bubble once it is in the DOM, since its size is unknown until
   * then and both the flip and the clamp depend on it.
   *
   * Runs after every render rather than only on open, and re-positions until
   * the result stops moving. A single measuring pass is not enough: the bubble
   * is first rendered unpositioned to be measured, and its height can settle
   * differently once placed — which left a stale height in the clamp and a
   * tooltip hanging off the bottom of the screen.
   */
  useLayoutEffect(() => {
    if (!open) {
      if (position) setPosition(null);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    const bubble = bubbleRef.current?.getBoundingClientRect();
    if (!trigger || !bubble) return;

    const margin = 8;
    const below = trigger.bottom + margin;
    const fitsBelow = below + bubble.height <= window.innerHeight - margin;
    const preferred = fitsBelow ? below : trigger.top - bubble.height - margin;

    // Clamp both axes to the viewport. Flipping alone is not enough: a trigger
    // sitting at (or past) the edge of a scrolling table leaves "above it" just
    // as far off-screen as "below it".
    const clamp = (value: number, extent: number, viewport: number) =>
      Math.min(Math.max(margin, value), Math.max(margin, viewport - extent - margin));

    const next = {
      top: clamp(preferred, bubble.height, window.innerHeight),
      left: clamp(trigger.left, bubble.width, window.innerWidth),
    };
    // Converges after a pass or two; the equality check is what stops the loop.
    if (!position || Math.abs(position.top - next.top) > 0.5 || Math.abs(position.left - next.left) > 0.5) {
      setPosition(next);
    }
  });

  // A scroll or resize invalidates the measured position; closing is honest and
  // cheaper than tracking the trigger across a scrolling container.
  const close = useCallback(() => setOpen(false), []);
  useLayoutEffect(() => {
    if (!open) return undefined;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  if (!content) return <>{children}</>;

  return (
    <span
      ref={triggerRef}
      className={className}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={close}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={close}
    >
      {children}
      {open && createPortal(
        <div
          ref={bubbleRef}
          role="tooltip"
          className="tooltip-pop"
          /*
           * Positioned with a transform, not `left`/`top`. A fixed element's
           * shrink-to-fit width is capped by the space between its `left` and
           * the viewport edge, so setting `left` near the right-hand side
           * squeezed the bubble into a narrow, very tall column. Anchored at
           * 0,0 it always lays out at its natural width, and the transform
           * moves it afterwards. Hidden until measured so it never flashes in
           * the corner.
           */
          style={position
            ? { transform: `translate3d(${position.left}px, ${position.top}px, 0)` }
            : { opacity: 0 }}
        >
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}
