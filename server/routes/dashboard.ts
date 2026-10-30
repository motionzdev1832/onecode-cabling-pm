import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { dailyLogs, issues, project, tasks as tasksTable, todos } from '../db/schema'
import { loadProgressInputs, logsWithItems, todayFrom } from '../util'
import { buildSCurve, buildTaskViews, leafTasks, weightedPercentOn } from '../../shared/progress'
import { addDays, daysBetween } from '../../shared/dates'
import { FLOORS, type DashboardData } from '../../shared/types'
import { scopeItemsWithProgress } from './scope'

const r = new Hono<AppEnv>()

r.get('/', async (c) => {
  const db = c.var.db
  const today = todayFrom(c)
  const proj = await db.select().from(project).where(eq(project.id, 1)).get()
  if (!proj) throw new HTTPException(500, { message: 'Project row missing' })
  const inputs = await loadProgressInputs(db)
  const views = buildTaskViews({ ...inputs, today })
  const leaves = leafTasks(inputs.tasks)
  const leafViews = views.filter((v) => !v.hasChildren)

  const overall = {
    actual: weightedPercentOn(leaves, today, today, inputs.targets, inputs.logItems, 'actual'),
    planned: weightedPercentOn(leaves, today, today, inputs.targets, inputs.logItems, 'planned'),
  }
  // One tile per floor that actually has leaf tasks (e.g. no Uplink tile until uplink work is in the plan).
  const floors = FLOORS.flatMap(({ value: floor, label }) => {
    const fl = leafTasks(inputs.tasks, floor)
    if (fl.length === 0) return []
    return [
      {
        floor,
        label,
        actual: weightedPercentOn(fl, today, today, inputs.targets, inputs.logItems, 'actual'),
        planned: weightedPercentOn(fl, today, today, inputs.targets, inputs.logItems, 'planned'),
      },
    ]
  })

  const start = inputs.tasks.reduce((m, t) => (t.plannedStart < m ? t.plannedStart : m), proj.plannedStart)
  const finish = inputs.tasks.reduce((m, t) => (t.plannedFinish > m ? t.plannedFinish : m), proj.plannedFinish)
  const scurve = buildSCurve(leaves, inputs.targets, inputs.logItems, start, finish, today, 1)

  const [openIssueRows, todoRows, recentLogRows, manpowerRows] = await Promise.all([
    db.select({ severity: issues.severity }).from(issues).where(inArray(issues.status, ['open', 'in_progress'])).all(),
    db.select({ dueDate: todos.dueDate }).from(todos).where(ne(todos.status, 'done')).all(),
    db
      .select({ log: dailyLogs, taskName: tasksTable.name })
      .from(dailyLogs)
      .innerJoin(tasksTable, eq(dailyLogs.taskId, tasksTable.id))
      .orderBy(desc(dailyLogs.logDate), desc(dailyLogs.id))
      .limit(8)
      .all(),
    db
      .select({ date: dailyLogs.logDate, manpower: sql<number>`coalesce(sum(${dailyLogs.manpower}), 0)` })
      .from(dailyLogs)
      .where(and(gte(dailyLogs.logDate, addDays(today, -13))))
      .groupBy(dailyLogs.logDate)
      .all(),
  ])
  const recentLogs = await logsWithItems(db, recentLogRows.map((x) => x.log))
  const nameOf = new Map(recentLogRows.map((x) => [x.log.id, x.taskName]))
  const mp = new Map(manpowerRows.map((m) => [m.date, Number(m.manpower)]))
  const manpower7d = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i - 13)
    return { date: d, manpower: mp.get(d) ?? 0 }
  })

  const daysTotal = daysBetween(proj.plannedStart, proj.plannedFinish) + 1
  const daysElapsed = Math.min(Math.max(daysBetween(proj.plannedStart, today) + 1, 0), daysTotal)

  const data: DashboardData = {
    today,
    project: proj,
    overall,
    floors,
    items: await scopeItemsWithProgress(db),
    scurve,
    counts: {
      leafTasks: leafViews.length,
      done: leafViews.filter((v) => v.status === 'done').length,
      inProgress: leafViews.filter((v) => v.status === 'in_progress').length,
      notStarted: leafViews.filter((v) => v.status === 'not_started').length,
      late: leafViews.filter((v) => v.late).length,
      behind: leafViews.filter((v) => v.behind && !v.late).length,
      openIssues: openIssueRows.length,
      criticalIssues: openIssueRows.filter((i) => i.severity === 'critical' || i.severity === 'high').length,
      openTodos: todoRows.length,
      overdueTodos: todoRows.filter((t) => t.dueDate && t.dueDate < today).length,
      daysElapsed,
      daysTotal,
      daysRemaining: Math.max(daysBetween(today, proj.plannedFinish), 0),
    },
    activeTasks: leafViews.filter((v) => v.status === 'in_progress').slice(0, 12),
    upcomingTasks: leafViews.filter((v) => v.status === 'not_started' && v.plannedStart >= today && v.plannedStart <= addDays(today, 7)).slice(0, 12),
    lateTasks: leafViews.filter((v) => v.late || v.behind).sort((a, b) => a.plannedFinish.localeCompare(b.plannedFinish)).slice(0, 12),
    recentLogs: recentLogs.map((l) => ({ ...l, taskName: nameOf.get(l.id) ?? '' })),
    manpower7d,
  }
  return c.json(data)
})

export default r
