import { FLOORS } from '@shared/types'
import { APP_TZ } from '@shared/dates'
import type { IssueCategory, IssueSeverity, IssueStatus, TaskStatus, TodoPriority, TodoStatus } from '@shared/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** 2026-11-24 → 24 Nov 2026 */
export function fmtDate(iso: string | null | undefined, opts: { year?: boolean; weekday?: boolean } = {}): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const year = opts.year === false ? '' : ` ${y}`
  const wd = opts.weekday ? `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ` : ''
  return `${wd}${d} ${MONTHS[m - 1]}${year}`
}

export function fmtDateShort(iso: string | null | undefined): string {
  return fmtDate(iso, { year: false })
}

// Clock times are always rendered in the project timezone (Thailand, GMT+7), whatever the viewer's device is set to.
const clockParts = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function clock(iso: string): { y: string; m: number; d: number; hm: string } | null {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  const p: Record<string, string> = {}
  for (const x of clockParts.formatToParts(dt)) p[x.type] = x.value
  return { y: p.year, m: Number(p.month), d: Number(p.day), hm: `${p.hour}:${p.minute}` }
}

/** ISO timestamp → "30 Oct 2026, 09:19" in Thailand time. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const c = clock(iso)
  return c ? `${c.d} ${MONTHS[c.m - 1]} ${c.y}, ${c.hm}` : iso
}

/** ISO timestamp → "09:19" in Thailand time. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const c = clock(iso)
  return c ? c.hm : iso
}

export function fmtNum(n: number | null | undefined, maxFrac = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac })
}

export function fmtPct(n: number | null | undefined, frac = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${n.toLocaleString('en-US', { maximumFractionDigits: frac })}%`
}

export function fmtDelta(n: number, frac = 1): string {
  const s = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: frac })
  if (Math.abs(n) < 0.05) return '±0'
  return n > 0 ? `+${s}` : `−${s}`
}

export const taskStatusLabel: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
}

export const todoStatusLabel: Record<TodoStatus, string> = { open: 'Open', in_progress: 'In progress', done: 'Done' }
export const todoPriorityLabel: Record<TodoPriority, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export const issueStatusLabel: Record<IssueStatus, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' }
export const issueSeverityLabel: Record<IssueSeverity, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }
export const issueCategoryLabel: Record<IssueCategory, string> = {
  material: 'Material',
  access: 'Site access',
  design: 'Design',
  safety: 'Safety',
  quality: 'Quality',
  other: 'Other',
}

export const floorLabel = (f: string | null | undefined) => FLOORS.find((x) => x.value === f)?.label ?? '—'
