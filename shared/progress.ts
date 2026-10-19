// Progress engine. Pure functions, used by the API (dashboard, tasks, report).
//
// Rules (agreed with the PM):
//  - Leaf task with quantity targets: % = Σ min(installed_i, target_i) / Σ target_i.
//  - Leaf task without targets: manual % (or 100 once an actual finish date is set).
//  - Summary task / project: duration-weighted average of its leaf tasks.
//  - Planned % on a date: linear across calendar days from planned start to planned finish (7-day week).

import type { Floor, TaskRow, TaskStatus, TaskTarget, TaskView, SCurvePoint } from './types'
import { addDays, clamp, daysBetween } from './dates'

export interface LogItemFlat {
  taskId: number
  logDate: string
  scopeItemId: number
  qty: number
}

export const BEHIND_THRESHOLD = 5

export function plannedPercentOn(task: Pick<TaskRow, 'plannedStart' | 'plannedFinish'>, date: string): number {
  const span = daysBetween(task.plannedStart, task.plannedFinish) + 1
  if (span <= 0) return date >= task.plannedFinish ? 100 : 0
  const elapsed = daysBetween(task.plannedStart, date) + 1
  return clamp(elapsed / span, 0, 1) * 100
}

function weightOf(t: TaskRow): number {
  return t.durationDays > 0 ? t.durationDays : 1
}

/** Installed quantity per (task, item) up to and including `date` (or all time when date is undefined). */
function installedByTaskItem(logItems: LogItemFlat[], date?: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const li of logItems) {
    if (date && li.logDate > date) continue
    const k = `${li.taskId}:${li.scopeItemId}`
    m.set(k, (m.get(k) ?? 0) + li.qty)
  }
  return m
}

function leafQuantityPercent(taskId: number, targets: TaskTarget[], installed: Map<string, number>): number | null {
  let target = 0
  let done = 0
  for (const t of targets) {
    if (t.taskId !== taskId || t.targetQty <= 0) continue
    target += t.targetQty
    done += Math.min(installed.get(`${t.taskId}:${t.scopeItemId}`) ?? 0, t.targetQty)
  }
  if (target <= 0) return null
  return (done / target) * 100
}

/** Manual-progress tasks: approximate % achieved by `date`, given today's manual value. */
function leafManualPercentOn(task: TaskRow, date: string, today: string): number {
  if (task.actualFinish && task.actualFinish <= date) return 100
  const current = task.manualPercent ?? 0
  if (!task.actualStart) return date >= today ? current : 0
  if (date < task.actualStart) return 0
  const end = task.actualFinish ?? today
  const span = Math.max(1, daysBetween(task.actualStart, end) + 1)
  const elapsed = clamp(daysBetween(task.actualStart, date) + 1, 0, span)
  return (current * elapsed) / span
}

export function leafPercentOn(
  task: TaskRow,
  date: string,
  today: string,
  targets: TaskTarget[],
  installedUpTo: Map<string, number>,
): number {
  const q = leafQuantityPercent(task.id, targets, installedUpTo)
  if (q !== null) {
    // An explicit actual finish closes the task even if a few units were never logged.
    if (task.actualFinish && task.actualFinish <= date) return 100
    return q
  }
  return leafManualPercentOn(task, date, today)
}

export interface ComputeOptions {
  tasks: TaskRow[]
  targets: TaskTarget[]
  logItems: LogItemFlat[]
  today: string
}

export function buildTaskViews({ tasks, targets, logItems, today }: ComputeOptions): TaskView[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const children = new Map<number, TaskRow[]>()
  for (const t of tasks) {
    if (t.parentId !== null) {
      const arr = children.get(t.parentId) ?? []
      arr.push(t)
      children.set(t.parentId, arr)
    }
  }
  const installedAll = installedByTaskItem(logItems)
  const leafPct = new Map<number, number>()
  const leafPlanned = new Map<number, number>()
  for (const t of tasks) {
    if (children.has(t.id)) continue
    leafPct.set(t.id, leafPercentOn(t, today, today, targets, installedAll))
    leafPlanned.set(t.id, plannedPercentOn(t, today))
  }

  const leavesUnder = (id: number): TaskRow[] => {
    const kids = children.get(id)
    if (!kids || kids.length === 0) {
      const self = byId.get(id)
      return self ? [self] : []
    }
    return kids.flatMap((k) => leavesUnder(k.id))
  }

  const pathOf = (t: TaskRow): string => {
    const parts: string[] = []
    let cur: TaskRow | undefined = t
    while (cur && cur.parentId !== null) {
      const p = byId.get(cur.parentId)
      if (!p || p.parentId === null) break // skip the project root
      parts.unshift(p.name)
      cur = p
    }
    return parts.join(' › ')
  }

  const views: TaskView[] = []
  for (const t of tasks) {
    const kids = children.get(t.id) ?? []
    const hasChildren = kids.length > 0
    let percent: number
    let plannedPercent: number
    let method: TaskView['method']
    if (hasChildren) {
      const leaves = leavesUnder(t.id)
      const w = leaves.reduce((s, l) => s + weightOf(l), 0)
      percent = w ? leaves.reduce((s, l) => s + weightOf(l) * (leafPct.get(l.id) ?? 0), 0) / w : 0
      plannedPercent = w ? leaves.reduce((s, l) => s + weightOf(l) * (leafPlanned.get(l.id) ?? 0), 0) / w : 0
      method = 'rollup'
    } else {
      percent = leafPct.get(t.id) ?? 0
      plannedPercent = leafPlanned.get(t.id) ?? 0
      method = leafQuantityPercent(t.id, targets, installedAll) !== null ? 'quantity' : 'manual'
    }
    percent = round1(percent)
    plannedPercent = round1(plannedPercent)
    const done = percent >= 100 || (!hasChildren && !!t.actualFinish)
    const started = percent > 0 || !!t.actualStart || (hasChildren && kids.some((k) => k.actualStart))
    const status: TaskStatus = done ? 'done' : started ? 'in_progress' : 'not_started'
    const late = !done && today > t.plannedFinish
    const behind = !done && today >= t.plannedStart && plannedPercent - percent > BEHIND_THRESHOLD
    const tTargets = targets
      .filter((x) => x.taskId === t.id)
      .map((x) => ({
        scopeItemId: x.scopeItemId,
        targetQty: x.targetQty,
        doneQty: installedAll.get(`${t.id}:${x.scopeItemId}`) ?? 0,
      }))
    views.push({
      ...t,
      path: pathOf(t),
      percent: done ? 100 : percent,
      plannedPercent,
      status,
      late,
      behind,
      method,
      targets: tTargets,
      hasChildren,
    })
  }
  return views
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Duration-weighted project (or floor) % on a date, from leaf tasks. */
export function weightedPercentOn(
  leaves: TaskRow[],
  date: string,
  today: string,
  targets: TaskTarget[],
  logItems: LogItemFlat[],
  kind: 'planned' | 'actual',
): number {
  const w = leaves.reduce((s, l) => s + weightOf(l), 0)
  if (!w) return 0
  const installed = kind === 'actual' ? installedByTaskItem(logItems, date) : undefined
  const sum = leaves.reduce((s, l) => {
    const p = kind === 'planned' ? plannedPercentOn(l, date) : leafPercentOn(l, date, today, targets, installed!)
    return s + weightOf(l) * p
  }, 0)
  return round1(sum / w)
}

export function leafTasks(tasks: TaskRow[], floor?: Floor): TaskRow[] {
  const parents = new Set(tasks.map((t) => t.parentId).filter((p): p is number => p !== null))
  return tasks.filter((t) => !parents.has(t.id) && (floor ? t.floor === floor : true))
}

/** Planned vs actual S-curve, one point per `stepDays`, from project start to finish (actual stops at today). */
export function buildSCurve(
  leaves: TaskRow[],
  targets: TaskTarget[],
  logItems: LogItemFlat[],
  start: string,
  finish: string,
  today: string,
  stepDays = 1,
): SCurvePoint[] {
  const points: SCurvePoint[] = []
  const last = finish > today ? finish : today
  for (let d = start; d <= last; d = addDays(d, stepDays)) {
    points.push({
      date: d,
      planned: weightedPercentOn(leaves, d, today, targets, logItems, 'planned'),
      actual: d <= today ? weightedPercentOn(leaves, d, today, targets, logItems, 'actual') : null,
    })
  }
  if (points.length === 0 || points[points.length - 1].date !== last) {
    points.push({
      date: last,
      planned: weightedPercentOn(leaves, last, today, targets, logItems, 'planned'),
      actual: last <= today ? weightedPercentOn(leaves, last, today, targets, logItems, 'actual') : null,
    })
  }
  return points
}
