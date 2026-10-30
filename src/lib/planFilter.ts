import { floorLabel } from './format'
import type { TaskView } from '@shared/types'

export interface PlanFilter {
  /** 'all' or a Floor code */
  floor: string
  /** 'all' | 'not_started' | 'in_progress' | 'attention' | 'done' */
  status: string
  /** free text, matched against name and path */
  q: string
  /** 'all' | '' (no PIC) | a PIC name */
  pic: string
}

export const EMPTY_FILTER: PlanFilter = { floor: 'all', status: 'all', q: '', pic: 'all' }

export function hasPlanFilter(f: PlanFilter): boolean {
  return f.floor !== 'all' || f.status !== 'all' || f.q.trim() !== '' || f.pic !== 'all'
}

/** Leaf tasks that match the filter, plus every ancestor so the outline stays intact. */
export function filterPlanTasks(all: TaskView[], f: PlanFilter): TaskView[] {
  if (!hasPlanFilter(f)) return all
  const ql = f.q.trim().toLowerCase()
  const matches = (t: TaskView) => {
    if (f.floor !== 'all' && t.floor !== f.floor) return false
    if (f.pic !== 'all' && (f.pic === '' ? !!t.pic : t.pic !== f.pic)) return false
    if (f.status === 'attention' ? !(t.late || t.behind) : f.status !== 'all' && t.status !== f.status) return false
    if (ql && !t.name.toLowerCase().includes(ql) && !t.path.toLowerCase().includes(ql)) return false
    return true
  }
  const keep = new Set<number>()
  const byId = new Map(all.map((t) => [t.id, t]))
  for (const t of all) {
    if (t.hasChildren || !matches(t)) continue
    let cur: TaskView | undefined = t
    while (cur) {
      keep.add(cur.id)
      cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined
    }
  }
  return all.filter((t) => keep.has(t.id))
}

export function describePlanFilter(f: PlanFilter): string {
  const parts: string[] = []
  if (f.floor !== 'all') parts.push(floorLabel(f.floor))
  if (f.status !== 'all') parts.push({ not_started: 'Not started', in_progress: 'In progress', attention: 'Late or behind', done: 'Done' }[f.status] ?? f.status)
  if (f.pic !== 'all') parts.push(f.pic === '' ? 'No PIC assigned' : `PIC ${f.pic}`)
  if (f.q.trim()) parts.push(`"${f.q.trim()}"`)
  return parts.length ? parts.join(' · ') : 'All tasks'
}
