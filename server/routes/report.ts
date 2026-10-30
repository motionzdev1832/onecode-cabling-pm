import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { dailyLogs, issues, project, todos } from '../db/schema'
import { loadProgressInputs, logsWithItems, todayFrom } from '../util'
import { buildTaskViews, leafTasks, weightedPercentOn } from '../../shared/progress'
import { addDays, isValidIsoDate } from '../../shared/dates'
import { FLOORS, type WeeklyReportData } from '../../shared/types'
import { scopeItemsWithProgress } from './scope'

const r = new Hono<AppEnv>()

r.get('/weekly', async (c) => {
  const db = c.var.db
  const today = todayFrom(c)
  const toQ = c.req.query('to')
  const to = isValidIsoDate(toQ) ? toQ : today
  const from = addDays(to, -6)
  const asOf = to < today ? to : today
  const proj = await db.select().from(project).where(eq(project.id, 1)).get()
  if (!proj) throw new HTTPException(500, { message: 'Project row missing' })

  const inputs = await loadProgressInputs(db)
  const views = buildTaskViews({ ...inputs, today: asOf })
  const leafViews = views.filter((v) => !v.hasChildren)
  const viewById = new Map(views.map((v) => [v.id, v]))
  const leaves = leafTasks(inputs.tasks)
  const pct = (ls: typeof leaves, date: string, kind: 'planned' | 'actual') => weightedPercentOn(ls, date, asOf, inputs.targets, inputs.logItems, kind)

  const weekLogRows = await db
    .select()
    .from(dailyLogs)
    .where(and(gte(dailyLogs.logDate, from), lte(dailyLogs.logDate, to)))
    .orderBy(asc(dailyLogs.logDate), asc(dailyLogs.id))
    .all()
  const weekLogs = await logsWithItems(db, weekLogRows)
  const byTask = new Map<number, typeof weekLogs>()
  for (const l of weekLogs) {
    const arr = byTask.get(l.taskId) ?? []
    arr.push(l)
    byTask.set(l.taskId, arr)
  }
  const weekQtyByItem = new Map<number, number>()
  const grouped = [...byTask.entries()].map(([taskId, logs]) => {
    const qtyByItem: Record<number, number> = {}
    let manpower = 0
    for (const l of logs) {
      manpower += l.manpower ?? 0
      for (const it of l.items) {
        qtyByItem[it.scopeItemId] = (qtyByItem[it.scopeItemId] ?? 0) + it.qty
        weekQtyByItem.set(it.scopeItemId, (weekQtyByItem.get(it.scopeItemId) ?? 0) + it.qty)
      }
    }
    return { task: viewById.get(taskId)!, logs, qtyByItem, manpower }
  })

  const lastLogDate = new Map<number, string>()
  for (const li of inputs.logItems) {
    const prev = lastLogDate.get(li.taskId)
    if (!prev || li.logDate > prev) lastLogDate.set(li.taskId, li.logDate)
  }
  const inWeek = (d: string | null | undefined) => !!d && d >= from && d <= to

  const [issuesRaised, issuesResolved, issuesOpen, todosDone, todosOpen] = await Promise.all([
    db.select().from(issues).where(and(gte(issues.raisedDate, from), lte(issues.raisedDate, to))).orderBy(desc(issues.id)).all(),
    db.select().from(issues).where(and(gte(issues.resolvedDate, from), lte(issues.resolvedDate, to))).orderBy(desc(issues.id)).all(),
    db.select().from(issues).where(lte(issues.raisedDate, to)).orderBy(desc(issues.id)).all(),
    db.select().from(todos).where(and(gte(todos.completedAt, from), lte(todos.completedAt, to + 'T23:59:59.999Z'))).orderBy(desc(todos.id)).all(),
    db.select().from(todos).orderBy(asc(todos.dueDate)).all(),
  ])

  const data: WeeklyReportData = {
    project: proj,
    from,
    to,
    generatedAt: new Date().toISOString(),
    overall: { startActual: pct(leaves, addDays(from, -1), 'actual'), endActual: pct(leaves, asOf, 'actual'), endPlanned: pct(leaves, to, 'planned') },
    floors: FLOORS.flatMap(({ value: floor, label }) => {
      const fl = leafTasks(inputs.tasks, floor)
      if (fl.length === 0) return []
      return [{ floor, label, startActual: pct(fl, addDays(from, -1), 'actual'), endActual: pct(fl, asOf, 'actual'), endPlanned: pct(fl, to, 'planned') }]
    }),
    items: (await scopeItemsWithProgress(db)).map((it) => ({ ...it, weekQty: weekQtyByItem.get(it.id) ?? 0 })),
    weekLogs: grouped.sort((a, b) => a.task.sortOrder - b.task.sortOrder),
    manpowerTotal: weekLogs.reduce((s, l) => s + (l.manpower ?? 0), 0),
    tasksCompleted: leafViews.filter((v) => v.status === 'done' && (inWeek(v.actualFinish) || (!v.actualFinish && inWeek(lastLogDate.get(v.id))))),
    tasksInProgress: leafViews.filter((v) => v.status === 'in_progress'),
    tasksNextWeek: leafViews.filter((v) => v.status !== 'done' && v.plannedStart <= addDays(to, 7) && v.plannedFinish > to),
    lateTasks: leafViews.filter((v) => v.late || v.behind),
    issuesRaised,
    issuesResolved,
    issuesOpen: issuesOpen.filter((i) => i.status === 'open' || i.status === 'in_progress'),
    todosDone,
    todosOpen: todosOpen.filter((t) => t.status !== 'done'),
  }
  return c.json(data)
})

export default r
