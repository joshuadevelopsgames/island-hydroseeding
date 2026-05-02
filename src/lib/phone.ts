/**
 * Phone-number formatting helpers.
 *
 * Normalizes free-text phone input to a single canonical North American
 * display format: `(NNN) NNN-NNNN` (or `+1 (NNN) NNN-NNNN` when an explicit
 * country code is present). Anything that doesn't look like a NANP number is
 * returned unchanged so we never silently mangle international numbers,
 * extensions, etc.
 */

const NANP = /^\d{10}$/;
const NANP_WITH_COUNTRY = /^1\d{10}$/;

export function formatPhone(value: string | null | undefined): string {
  if (value == null) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (NANP.test(digits)) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (NANP_WITH_COUNTRY.test(digits)) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return trimmed;
}

/**
 * Normalize a phone string for storage. Returns `null` for empty input so the
 * column can store NULL rather than an empty string. Any non-NANP input is
 * preserved so callers can still type extensions or international numbers.
 */
export function normalizePhoneForSave(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return formatPhone(trimmed);
}
