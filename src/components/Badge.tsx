import { ReactNode } from 'react';

/**
 * The single status-badge primitive. A `tone` maps to a tokenised bg/fg pair
 * (see --status-*-bg / --status-*-fg), so every "approved green" or "overdue
 * red" in the app comes from one place instead of copy-pasted .pill-* colors.
 *
 * Prefer `<Badge status="APPROVED">` — the domain-status → tone mapping below
 * covers the enums used across loans, leave, payroll, leads and settlements, so
 * callers pass the raw backend status and get a consistently-coloured chip.
 */
export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brass';

/** Domain status → badge tone. One documented mapping for the whole app. */
const STATUS_TONE: Record<string, BadgeTone> = {
  // positive / active / settled
  ACTIVE: 'success', APPROVED: 'success', PAID: 'success', COMPLETED: 'success',
  CONVERTED: 'success', VERIFIED: 'success', STANDARD: 'success', PRESENT: 'success',
  DISBURSED: 'success', OPEN: 'success', SUCCESS: 'success',
  // pending / in-progress / due-soon
  PENDING: 'warning', PENDING_APPROVAL: 'warning', SUBMITTED: 'warning', NEW: 'warning',
  CONTACTED: 'warning', INITIATED: 'warning', UNDER_REVIEW: 'warning', DUE: 'warning',
  HALF_DAY: 'warning', ON_LEAVE: 'warning', SMA_0: 'warning', SMA_1: 'warning',
  SPECIAL_MENTION_0: 'warning', SPECIAL_MENTION_1: 'warning', PROCESSING: 'warning',
  ON_NOTICE: 'warning',
  // employment lifecycle
  ONBOARDING: 'info', SEPARATED: 'neutral',
  // negative / rejected / overdue
  REJECTED: 'danger', OVERDUE: 'danger', INACTIVE: 'danger', DROPPED: 'danger',
  WRITTEN_OFF: 'danger', NPA: 'danger', SMA_2: 'danger', SPECIAL_MENTION_2: 'danger',
  NON_PERFORMING: 'danger', ABSENT: 'danger', LOCKED: 'danger', FAILED: 'danger',
  // informational / terminal-neutral
  DRAFT: 'info', APPLIED: 'info', SITE_VISIT: 'info', DOCUMENT_COLLECTED: 'info',
  CLOSED: 'info', SETTLED: 'info', FORECLOSED: 'info', HOLIDAY: 'info',
};

const toneOf = (status: string): BadgeTone => STATUS_TONE[status.toUpperCase()] ?? 'neutral';

/** Humanise an enum: PENDING_APPROVAL → "Pending approval". */
const humanise = (s: string) =>
  s.replace(/[_-]+/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function Badge({
  status,
  tone,
  children,
  dot = false,
  count,
}: {
  /** Raw backend status — auto-mapped to a tone and humanised as the label. */
  status?: string;
  /** Force a tone (overrides the status mapping). */
  tone?: BadgeTone;
  /** Explicit label; defaults to the humanised status. */
  children?: ReactNode;
  /** Leading status dot. */
  dot?: boolean;
  /** Trailing count chip. */
  count?: number;
}) {
  const resolvedTone = tone ?? (status ? toneOf(status) : 'neutral');
  const label = children ?? (status ? humanise(status) : '');
  return (
    <span className={`badge badge-${resolvedTone}`}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {label}
      {count != null && <span className="badge-count">{count}</span>}
    </span>
  );
}
