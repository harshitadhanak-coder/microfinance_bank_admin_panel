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

/** Best human-readable message from an Axios/error, falling back to a default. */
export const apiMessage = (error: unknown, fallback: string): string => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: string; errors?: { message?: string }[] } | undefined;
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
