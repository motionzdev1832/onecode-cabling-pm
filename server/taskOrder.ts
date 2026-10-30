// Outline ordering helpers for moving tasks. Pure functions; the route applies the result.

import type { TaskRow } from '../shared/types'

export interface MoveTarget {
  parentId: number
  /** Sibling to place the task after; null = first under the parent. */
  afterId: number | null
}

type OrderRow = Pick<TaskRow, 'id' | 'parentId' | 'sortOrder'>

/** The task and every descendant. */
export function subtreeIds(rows: Pick<TaskRow, 'id' | 'parentId'>[], id: number): Set<number> {
  const ids = new Set<number>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const t of rows) {
      if (t.parentId !== null && ids.has(t.parentId) && !ids.has(t.id)) {
        ids.add(t.id)
        grew = true
      }
    }
  }
  return ids
}

/**
 * Depth-first outline order after moving task `id` (with its sub-tasks) to `target`.
 * Does not change parentId on the rows; the caller persists that along with the new sort order.
 */
export function outlineAfterMove<T extends OrderRow>(rows: T[], id: number, target: MoveTarget): T[] {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  const moving = sorted.find((r) => r.id === id)
  if (!moving) throw new Error(`Task ${id} not found`)
  const children = new Map<number | null, T[]>()
  for (const r of sorted) {
    if (r.id === id) continue
    const arr = children.get(r.parentId) ?? []
    arr.push(r)
    children.set(r.parentId, arr)
  }
  const sibs = children.get(target.parentId) ?? []
  const at = target.afterId === null ? 0 : sibs.findIndex((s) => s.id === target.afterId) + 1
  if (target.afterId !== null && at === 0) throw new Error(`Task ${target.afterId} is not under parent ${target.parentId}`)
  sibs.splice(at, 0, moving)
  children.set(target.parentId, sibs)
  const out: T[] = []
  const visit = (pid: number | null) => {
    for (const k of children.get(pid) ?? []) {
      out.push(k)
      visit(k.id)
    }
  }
  visit(null)
  return out
}
