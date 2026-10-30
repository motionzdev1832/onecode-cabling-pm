import type { TaskView } from '@shared/types'

export interface MoveTarget {
  parentId: number
  /** Sibling to place the task after; null = first under the parent. */
  afterId: number | null
}

/** Ids of task `id` and all of its descendants. */
export function subtreeIds(all: Pick<TaskView, 'id' | 'parentId'>[], id: number): Set<number> {
  const ids = new Set<number>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const t of all) {
      if (t.parentId !== null && ids.has(t.parentId) && !ids.has(t.id)) {
        ids.add(t.id)
        grew = true
      }
    }
  }
  return ids
}

/**
 * Where to put `t` so it moves one step past its nearest *visible* sibling. Filters can hide
 * siblings, so a plain swap with the adjacent sibling might not change anything on screen.
 * `all` and `visible` are in outline order. Returns null when the task is already at that end.
 */
export function stepTarget(all: TaskView[], visible: TaskView[], t: TaskView, dir: 'up' | 'down'): MoveTarget | null {
  if (t.parentId === null) return null
  const sibs = all.filter((x) => x.parentId === t.parentId)
  const vis = visible.filter((x) => x.parentId === t.parentId)
  const vi = vis.findIndex((x) => x.id === t.id)
  if (vi < 0) return null
  if (dir === 'up') {
    if (vi === 0) return null
    const prev = vis[vi - 1]
    const pi = sibs.findIndex((x) => x.id === prev.id)
    return { parentId: t.parentId, afterId: pi > 0 ? sibs[pi - 1].id : null }
  }
  if (vi === vis.length - 1) return null
  return { parentId: t.parentId, afterId: vis[vi + 1].id }
}
