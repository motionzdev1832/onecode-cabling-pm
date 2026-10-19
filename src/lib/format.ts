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

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

export const floorLabel = (f: string | null | undefined) => (f === 'FL2' ? 'Floor 2' : f === 'FL3' ? 'Floor 3' : '—')
