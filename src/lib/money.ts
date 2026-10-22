/**
 * Money is always stored as integer minor units (e.g. cents, or whole shillings
 * for UGX where the currency has 0 decimal places). Never use floats for storage.
 */

const digitsCache = new Map<string, number>()

/** Number of decimal places the currency uses (UGX → 0, USD → 2). */
export function currencyDigits(currency: string): number {
  const cached = digitsCache.get(currency)
  if (cached !== undefined) return cached
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  digitsCache.set(currency, digits)
  return digits
}

export function formatMoney(
  minor: number,
  currency: string,
  options: { signed?: boolean; locale?: string } = {},
): string {
  const digits = currencyDigits(currency)
  const major = minor / 10 ** digits
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: options.signed ? "exceptZero" : "auto",
  })
  return formatter.format(major)
}

/** Converts a user-typed amount such as "1,250.50" into minor units. Returns null if invalid. */
export function parseMoney(input: string, currency: string): number | null {
  const digits = currencyDigits(currency)
  let text = input.trim().replace(/\s/g, "")
  // "12,50" means 12.50 in comma-decimal locales. Without this it would read as 1250.
  const commaDecimal = /^[\d.]*,\d{1,2}$/.test(text) && !text.includes(".")
  if (commaDecimal) {
    // For whole-number currencies this is ambiguous, so reject it rather than guess.
    if (digits === 0) return null
    text = text.replace(",", ".")
  }
  const cleaned = text.replace(/,/g, "")
  if (!cleaned) return null
  const pattern =
    digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{0,${digits}})?$`)
  if (!pattern.test(cleaned)) return null
  const value = Math.round(Number(cleaned) * 10 ** digits)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/** Major-unit string for prefilling an input, e.g. 125050 → "1250.50" (or "125050" for UGX). */
export function toInputValue(minor: number, currency: string): string {
  const digits = currencyDigits(currency)
  return (minor / 10 ** digits).toFixed(digits)
}

/** Percentage change from previous to current. Returns null when there is no baseline. */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / Math.abs(previous)) * 100)
}
