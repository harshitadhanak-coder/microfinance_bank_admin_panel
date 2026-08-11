/**
 * Shared client-side validators. Kept deliberately small — the backend Zod
 * schemas are the authoritative gate; these give the user an immediate, clear
 * message before a request is ever sent.
 */

/** The one phone rule, mirrored from the backend `phoneNumberSchema`. */
export const PHONE_ERROR = 'Phone number must be exactly 10 digits.';

/** True when the value is exactly 10 digits and nothing else. */
export const isValidPhone = (value: string): boolean => /^[0-9]{10}$/.test(value.trim());

/**
 * Returns an error message for an invalid phone, or null when it is valid.
 * When `required` is false an empty value is allowed (returns null).
 */
export const validatePhone = (value: string, required = true): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return required ? PHONE_ERROR : null;
  return isValidPhone(trimmed) ? null : PHONE_ERROR;
};

/**
 * Restricts free typing to digits, capped at 10 — for onChange handlers so a
 * phone field can never hold letters, spaces or an over-length value.
 */
export const sanitizePhoneInput = (value: string): string => value.replace(/\D/g, '').slice(0, 10);
