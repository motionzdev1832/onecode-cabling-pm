// Date helpers that work on ISO date strings (YYYY-MM-DD) in a timezone-free way.

const DAY_MS = 86_400_000

export function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Whole days from a to b (b - a). Negative if b is before a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS)
}

export function addDays(iso: string, n: number): string {
  return fromUtcMs(toUtcMs(iso) + n * DAY_MS)
}

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const ms = toUtcMs(s)
  return !Number.isNaN(ms) && fromUtcMs(ms) === s
}

/** Today's date in the given IANA timezone (defaults to Asia/Bangkok). */
export function todayIn(timeZone = 'Asia/Bangkok', now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(now)
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
