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

/** The project's timezone. Every clock time in the app is shown in Thailand time (GMT+7). */
export const APP_TZ = 'Asia/Bangkok'
export const APP_TZ_OFFSET = '+07:00'

/** Today's date in the given IANA timezone (defaults to the project timezone). */
export function todayIn(timeZone: string = APP_TZ, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(now)
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Calendar date (YYYY-MM-DD) of an ISO timestamp in the project timezone. */
export function dateInAppTz(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : todayIn(APP_TZ, d)
}

/** UTC ISO bounds of the project-timezone calendar days `from` 00:00 to `to` 23:59:59.999 (either side optional). */
export function dayBoundsUtc(from?: string, to?: string): { from?: string; to?: string } {
  return {
    from: from ? new Date(`${from}T00:00:00${APP_TZ_OFFSET}`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999${APP_TZ_OFFSET}`).toISOString() : undefined,
  }
}
