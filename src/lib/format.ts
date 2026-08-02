/**
 * Shared formatting + API helpers, de-duplicated from the per-page copies that
 * had accumulated across the HR and operations modules.
 */
import { AxiosError } from 'axios';

/** Indian-rupee formatting, tolerant of string/number/undefined amounts. */
export const inr = (value: number | string | null | undefined): string => {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  return `₹${(Number.isFinite(n) ? (n as number) : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

/** Short, locale-aware date (e.g. "15 Jul 2026"); em-dash for empty values. */
export const fmtDate = (value?: string | Date | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Day + month only (e.g. "15 Jul"), for compact calendar/label uses. */
export const fmtDayMonth = (value?: string | Date | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

/** yyyy-mm-dd in local time, for date inputs and same-day comparisons. */
export const isoLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Title-cases an ALL_CAPS or snake enum value (e.g. "HALF_DAY" → "Half day"). */
export const titleCase = (value: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, ' ') : value;

/** Domain acronyms that must not be sentence-cased into "Lwp" / "Hr". */
const ACRONYMS = new Set(['lwp', 'hr', 'id', 'pf', 'esi', 'tds', 'emi', 'kyc', 'ifsc', 'upi']);

/** 'periodSchemeId' → 'Period scheme'; 'lwpLeaveTypeId' → 'LWP leave type'. */
const fieldLabel = (key: string): string =>
  key
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, (c) => ` ${c.toLowerCase()}`)
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word, index) =>
      ACRONYMS.has(word) ? word.toUpperCase()
      : index === 0 ? word.replace(/^./, (c) => c.toUpperCase())
      : word,
    )
    .join(' ');

/**
 * Zod's default messages are written for developers ("Invalid uuid", "String
 * must contain at least 3 character(s)"). Rewrite the common ones into
 * something an HR user can act on. Anything unrecognised passes through, so a
 * schema that supplies its own wording is never mangled.
 */
const humanizeValidation = (message: string): string => {
  const rules: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
    [/^required$/i, 'Required.'],
    [/^invalid uuid$/i, 'Choose an option.'],
    [/^invalid date/i, 'Choose a valid date.'],
    [/^invalid email/i, 'Enter a valid email address.'],
    [/^expected number, received nan$/i, 'Enter a number.'],
    [/^expected (\w+), received (\w+)$/i, (m) => `Expected a ${m[1]}, got ${m[2]}.`],
    [/^string must contain at least (\d+) character/i, (m) => `Use at least ${m[1]} character${m[1] === '1' ? '' : 's'}.`],
    [/^string must contain at most (\d+) character/i, (m) => `Use at most ${m[1]} character${m[1] === '1' ? '' : 's'}.`],
    [/^number must be greater than or equal to ([\d.]+)$/i, (m) => `Must be ${m[1]} or more.`],
    [/^number must be less than or equal to ([\d.]+)$/i, (m) => `Must be ${m[1]} or less.`],
    [/^number must be greater than ([\d.]+)$/i, (m) => `Must be more than ${m[1]}.`],
    [/^array must contain at least (\d+) element/i, (m) => `Add at least ${m[1]}.`],
  ];

  for (const [pattern, replacement] of rules) {
    const match = message.match(pattern);
    if (match) return typeof replacement === 'string' ? replacement : replacement(match);
  }
  return message;
};

interface ApiErrorBody {
  message?: string;
  errors?: { message?: string }[];
  /** Zod fieldErrors from validateRequest: { field: ['reason', …] }. */
  details?: Record<string, string[] | undefined> | unknown;
}

const bodyOf = (error: unknown): ApiErrorBody | undefined =>
  error instanceof AxiosError ? (error.response?.data as ApiErrorBody | undefined) : undefined;

/**
 * Per-field validation problems from a 422, as { field: 'reason' }.
 *
 * The API already sends these — `validateRequest` puts Zod's `fieldErrors` in
 * `details` — but nothing read them, so every validation failure surfaced as
 * the generic "Some of the submitted values are invalid." and left the user
 * guessing which input was wrong. Forms can use this to mark the field itself.
 */
export const apiFieldErrors = (error: unknown): Record<string, string> => {
  const details = bodyOf(error)?.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};

  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(details as Record<string, unknown>)) {
    const first = Array.isArray(messages) ? messages.find((m) => typeof m === 'string') : messages;
    if (typeof first === 'string' && first.trim()) out[field] = humanizeValidation(first.trim());
  }
  return out;
};

/**
 * Best human-readable message from an error, falling back to a default.
 *
 * Field-level problems win over the generic wrapper: "Period scheme: Required"
 * tells the user what to change, "Some of the submitted values are invalid."
 * does not.
 */
export const apiMessage = (error: unknown, fallback: string): string => {
  if (error instanceof AxiosError) {
    const data = bodyOf(error);
    const fields = apiFieldErrors(error);
    const lines = Object.entries(fields).map(([field, message]) => `${fieldLabel(field)}: ${message}`);
    if (lines.length) return lines.join(' · ');
    return data?.message || data?.errors?.[0]?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};

/** Amount written in Indian-English words (for salary-slip net-pay lines). */
export const amountInWords = (amount: number): string => {
  const rupees = Math.floor(Math.abs(amount));
  if (rupees === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number): string => (n < 20 ? ones[n]! : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`);
  const three = (n: number): string => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + two(n % 100) : ''}` : two(n));
  let words = '';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  if (crore) words += `${three(crore)} Crore `;
  if (lakh) words += `${three(lakh)} Lakh `;
  if (thousand) words += `${three(thousand)} Thousand `;
  if (rest) words += three(rest);
  return `${words.trim()} Rupees Only`;
};
