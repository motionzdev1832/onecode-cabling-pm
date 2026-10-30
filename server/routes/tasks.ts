import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { AppEnv } from '../env'
import { dailyLogs, scopeItems, tasks, taskTargets } from '../db/schema'
import { requireAdmin } from '../auth'
import { describeChanges, idParam, loadProgressInputs, logActivity, logsWithItems, parseBody, rollupSummaryDates, todayFrom } from '../util'
import { buildTaskViews } from '../../shared/progress'
import { isoDate } from './project'
import { outlineAfterMove, subtreeIds, type MoveTarget } from '../taskOrder'

const r = new Hono<AppEnv>()

r.get('/', async (c) => {
  const inputs = await loadProgressInputs(c.var.db)
  return c.json(buildTaskViews({ ...inputs, today: todayFrom(c) }))
})

/** Distinct PIC names, for autocomplete. */
r.get('/pics', async (c) => {
  const rows = await c.var.db
    .select({ pic: tasks.pic })
    .from(tasks)
    .where(sql`${tasks.pic} is not null and ${tasks.pic} != ''`)
    .groupBy(tasks.pic)
    .orderBy(tasks.pic)
    .all()
  return c.json(rows.map((r) => r.pic))
})

r.get('/:id', async (c) => {
  const id = idParam(c)
  const inputs = await loadProgressInputs(c.var.db)
  const view = buildTaskViews({ ...inputs, today: todayFrom(c) }).find((t) => t.id === id)
  if (!view) throw new HTTPException(404, { message: 'Task not found' })
  const logRows = await c.var.db.select().from(dailyLogs).where(eq(dailyLogs.taskId, id)).orderBy(desc(dailyLogs.logDate), desc(dailyLogs.id)).all()
  const logs = await logsWithItems(c.var.db, logRows)
  return c.json({ task: view, logs })
})

const taskPatch = z
  .object({
    name: z.string().trim().min(1).max(200),
    floor: z.enum(['FL2', 'FL3']).nullable(),
    durationDays: z.number().positive().max(999),
    plannedStart: isoDate,
    plannedFinish: isoDate,
    actualStart: isoDate.nullable(),
    actualFinish: isoDate.nullable(),
    manualPercent: z.number().min(0).max(100).nullable(),
    notes: z.string().max(4000).nullable(),
    pic: z.string().trim().max(80).nullable(),
    /** When true, the PIC is also written to every descendant task. */
    picCascade: z.boolean(),
  })
  .partial()

r.put('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const { picCascade, ...body } = await parseBody(c, taskPatch)
  const existing = await c.var.db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'Task not found' })
  const merged = { ...existing, ...body }
  if (merged.plannedFinish < merged.plannedStart) throw new HTTPException(400, { message: 'Planned finish must not be before planned start' })
  if (merged.actualStart && merged.actualFinish && merged.actualFinish < merged.actualStart) {
    throw new HTTPException(400, { message: 'Actual finish must not be before actual start' })
  }
  const today = todayFrom(c)
  if ((body.actualStart && body.actualStart > today) || (body.actualFinish && body.actualFinish > today)) {
    throw new HTTPException(400, { message: 'Actual dates cannot be in the future' })
  }
  await c.var.db.update(tasks).set(body).where(eq(tasks.id, id))
  if (picCascade && body.pic !== undefined) {
    const all = await c.var.db.select({ id: tasks.id, parentId: tasks.parentId }).from(tasks).all()
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
    ids.delete(id)
    if (ids.size) await c.var.db.update(tasks).set({ pic: body.pic }).where(inArray(tasks.id, [...ids]))
  }
  if (body.plannedStart || body.plannedFinish) await rollupSummaryDates(c.var.db)
  const changes = describeChanges(existing, body)
  await logActivity(c, 'update', 'task', id, `Updated task "${existing.name}": ${changes || 'no changes'}${picCascade && body.pic !== undefined ? ' (PIC applied to all sub-tasks)' : ''}`)
  const inputs = await loadProgressInputs(c.var.db)
  return c.json(buildTaskViews({ ...inputs, today: todayFrom(c) }).find((t) => t.id === id))
})

r.post('/', requireAdmin, async (c) => {
  const body = await parseBody(
    c,
    z.object({
      parentId: z.number().int().positive(),
      name: z.string().trim().min(1).max(200),
      floor: z.enum(['FL2', 'FL3']).nullable().optional(),
      pic: z.string().trim().max(80).nullable().optional(),
      durationDays: z.number().positive().max(999),
      plannedStart: isoDate,
      plannedFinish: isoDate,
    }),
  )
  if (body.plannedFinish < body.plannedStart) throw new HTTPException(400, { message: 'Planned finish must not be before planned start' })
  const parent = await c.var.db.select().from(tasks).where(eq(tasks.id, body.parentId)).get()
  if (!parent) throw new HTTPException(404, { message: 'Parent task not found' })
  if (!parent.isSummary) {
    const parentLogs = await c.var.db.select({ n: sql<number>`count(*)` }).from(dailyLogs).where(eq(dailyLogs.taskId, parent.id)).get()
    if ((parentLogs?.n ?? 0) > 0) throw new HTTPException(409, { message: 'That task already has daily log entries, so it cannot become a summary row. Add the new task next to it instead.' })
  }
  // Insert after the parent's last descendant so the outline order stays intact.
  const all = await c.var.db.select({ id: tasks.id, parentId: tasks.parentId, sortOrder: tasks.sortOrder }).from(tasks).orderBy(tasks.sortOrder).all()
  const descendants = new Set<number>([parent.id])
  for (const t of all) if (t.parentId !== null && descendants.has(t.parentId)) descendants.add(t.id)
  const lastOrder = Math.max(...all.filter((t) => descendants.has(t.id)).map((t) => t.sortOrder))
  await c.var.db.update(tasks).set({ sortOrder: sql`${tasks.sortOrder} + 1` }).where(gt(tasks.sortOrder, lastOrder))
  const row = await c.var.db
    .insert(tasks)
    .values({
      parentId: parent.id,
      name: body.name,
      level: parent.level + 1,
      isSummary: false,
      floor: body.floor ?? parent.floor,
      pic: body.pic ?? parent.pic ?? null,
      durationDays: body.durationDays,
      plannedStart: body.plannedStart,
      plannedFinish: body.plannedFinish,
      sortOrder: lastOrder + 1,
    })
    .returning()
    .get()
  if (!parent.isSummary) {
    await c.var.db.update(tasks).set({ isSummary: true }).where(eq(tasks.id, parent.id))
    await c.var.db.delete(taskTargets).where(eq(taskTargets.taskId, parent.id))
  }
  await rollupSummaryDates(c.var.db)
  await logActivity(c, 'create', 'task', row.id, `Added task "${row.name}" under "${parent.name}"`)
  const inputs = await loadProgressInputs(c.var.db)
  return c.json(buildTaskViews({ ...inputs, today: todayFrom(c) }).find((t) => t.id === row.id), 201)
})

r.delete('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const row = await c.var.db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!row) throw new HTTPException(404, { message: 'Task not found' })
  if (row.parentId === null) throw new HTTPException(400, { message: 'The project root cannot be deleted' })
  const kids = await c.var.db.select({ n: sql<number>`count(*)` }).from(tasks).where(eq(tasks.parentId, id)).get()
  if ((kids?.n ?? 0) > 0) throw new HTTPException(409, { message: 'Delete or move the sub-tasks first' })
  const logs = await c.var.db.select({ n: sql<number>`count(*)` }).from(dailyLogs).where(eq(dailyLogs.taskId, id)).get()
  if ((logs?.n ?? 0) > 0) throw new HTTPException(409, { message: 'This task has daily log entries. Delete those first.' })
  await c.var.db.delete(tasks).where(eq(tasks.id, id))
  const siblings = await c.var.db.select({ n: sql<number>`count(*)` }).from(tasks).where(eq(tasks.parentId, row.parentId)).get()
  if ((siblings?.n ?? 0) === 0) await c.var.db.update(tasks).set({ isSummary: false }).where(eq(tasks.id, row.parentId))
  await rollupSummaryDates(c.var.db)
  await logActivity(c, 'delete', 'task', id, `Deleted task "${row.name}"`)
  return c.json({ ok: true })
})

const moveBody = z.union([
  z.object({ direction: z.enum(['up', 'down']) }),
  z.object({ parentId: z.number().int().positive(), afterId: z.number().int().positive().nullable() }),
])

/**
 * Reorder a task: one step up/down among its siblings, or under a chosen parent after a chosen
 * sibling (afterId null = first). Sub-tasks move with it. Returns the full refreshed task list.
 */
r.put('/:id/move', requireAdmin, async (c) => {
  const id = idParam(c)
  const body = await parseBody(c, moveBody)
  const db = c.var.db
  const all = await db.select().from(tasks).orderBy(tasks.sortOrder).all()
  const task = all.find((t) => t.id === id)
  if (!task) throw new HTTPException(404, { message: 'Task not found' })
  const oldParentId = task.parentId
  if (oldParentId === null) throw new HTTPException(400, { message: 'The project root cannot be moved' })
  const sub = subtreeIds(all, id)
  let target: MoveTarget
  let how: string
  if ('direction' in body) {
    const sibs = all.filter((t) => t.parentId === oldParentId)
    const i = sibs.findIndex((t) => t.id === id)
    if (body.direction === 'up') {
      if (i === 0) throw new HTTPException(400, { message: 'Already first among its siblings' })
      target = { parentId: oldParentId, afterId: i >= 2 ? sibs[i - 2].id : null }
    } else {
      if (i === sibs.length - 1) throw new HTTPException(400, { message: 'Already last among its siblings' })
      target = { parentId: oldParentId, afterId: sibs[i + 1].id }
    }
    how = `Moved task "${task.name}" ${body.direction}`
  } else {
    if (sub.has(body.parentId)) throw new HTTPException(400, { message: 'A task cannot be moved under itself or one of its sub-tasks' })
    const parent = all.find((t) => t.id === body.parentId)
    if (!parent) throw new HTTPException(404, { message: 'Parent task not found' })
    const after = body.afterId === null ? null : all.find((t) => t.id === body.afterId)
    if (body.afterId !== null && (!after || after.parentId !== parent.id || after.id === id)) {
      throw new HTTPException(400, { message: 'The position must be another task under the chosen parent' })
    }
    target = { parentId: parent.id, afterId: body.afterId }
    how = `Moved task "${task.name}" under "${parent.name}"${after ? ` after "${after.name}"` : ' as first'}`
  }
  const newParent = all.find((t) => t.id === target.parentId)
  if (!newParent) throw new HTTPException(404, { message: 'Parent task not found' })
  const parentChanged = newParent.id !== oldParentId
  const newParentHasKids = all.some((t) => t.parentId === newParent.id)
  if (parentChanged && !newParentHasKids) {
    const n = await db.select({ n: sql<number>`count(*)` }).from(dailyLogs).where(eq(dailyLogs.taskId, newParent.id)).get()
    if ((n?.n ?? 0) > 0) throw new HTTPException(409, { message: 'That task already has daily log entries, so it cannot become a summary row' })
  }
  const ordered = outlineAfterMove(all, id, target)
  const levelDelta = newParent.level + 1 - task.level
  const floorTo = parentChanged && newParent.floor && newParent.floor !== task.floor ? newParent.floor : null
  const updates: { id: number; set: Partial<typeof tasks.$inferInsert> }[] = []
  ordered.forEach((t, i) => {
    const set: Partial<typeof tasks.$inferInsert> = {}
    if (t.sortOrder !== i + 1) set.sortOrder = i + 1
    if (t.id === id && parentChanged) set.parentId = newParent.id
    if (sub.has(t.id)) {
      if (levelDelta !== 0) set.level = t.level + levelDelta
      if (floorTo && t.floor !== floorTo) set.floor = floorTo
    }
    if (Object.keys(set).length) updates.push({ id: t.id, set })
  })
  if (parentChanged) {
    if (!newParentHasKids) updates.push({ id: newParent.id, set: { isSummary: true } })
    if (!all.some((t) => t.parentId === oldParentId && t.id !== id)) updates.push({ id: oldParentId, set: { isSummary: false } })
  }
  if (updates.length > 0) {
    const stmts: BatchItem<'sqlite'>[] = updates.map((u) => db.update(tasks).set(u.set).where(eq(tasks.id, u.id)))
    if (parentChanged && !newParentHasKids) stmts.push(db.delete(taskTargets).where(eq(taskTargets.taskId, newParent.id)))
    for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40) as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
    await rollupSummaryDates(db)
    await logActivity(c, 'move', 'task', id, how + (floorTo ? ` (floor set to ${floorTo})` : ''))
  }
  const inputs = await loadProgressInputs(db)
  return c.json(buildTaskViews({ ...inputs, today: todayFrom(c) }))
})

// ---- Quantity targets (allocation of scope quantities to leaf tasks) ----

const targetList = z.array(z.object({ scopeItemId: z.number().int().positive(), targetQty: z.number().min(0) }))

r.put('/:id/targets', requireAdmin, async (c) => {
  const id = idParam(c)
  const body = await parseBody(c, targetList)
  const task = await c.var.db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!task) throw new HTTPException(404, { message: 'Task not found' })
  const kids = await c.var.db.select({ n: sql<number>`count(*)` }).from(tasks).where(eq(tasks.parentId, id)).get()
  if ((kids?.n ?? 0) > 0) throw new HTTPException(400, { message: 'Targets can only be set on leaf tasks' })
  await c.var.db.delete(taskTargets).where(eq(taskTargets.taskId, id))
  const rows = body.filter((t) => t.targetQty > 0).map((t) => ({ taskId: id, scopeItemId: t.scopeItemId, targetQty: t.targetQty }))
  if (rows.length) await c.var.db.insert(taskTargets).values(rows)
  await logActivity(c, 'update', 'task_targets', id, `Set quantity targets on "${task.name}"`)
  const inputs = await loadProgressInputs(c.var.db)
  return c.json(buildTaskViews({ ...inputs, today: todayFrom(c) }).find((t) => t.id === id))
})

/** Bulk matrix update: [{taskId, scopeItemId, targetQty}] — 0 removes the cell. */
r.put('/allocation/bulk', requireAdmin, async (c) => {
  const body = await parseBody(c, z.array(z.object({ taskId: z.number().int().positive(), scopeItemId: z.number().int().positive(), targetQty: z.number().min(0) })).max(5000))
  if (body.length === 0) return c.json({ ok: true, updated: 0 })
  const taskIds = [...new Set(body.map((b) => b.taskId))]
  const parents = await c.var.db.select({ id: tasks.parentId }).from(tasks).where(inArray(tasks.parentId, taskIds)).all()
  const summaryIds = new Set(parents.map((p) => p.id))
  const bad = taskIds.find((t) => summaryIds.has(t))
  if (bad) throw new HTTPException(400, { message: `Task ${bad} is a summary task; targets go on leaf tasks only` })
  const itemIds = [...new Set(body.map((b) => b.scopeItemId))]
  const items = await c.var.db.select({ id: scopeItems.id }).from(scopeItems).where(inArray(scopeItems.id, itemIds)).all()
  if (items.length !== itemIds.length) throw new HTTPException(400, { message: 'Unknown scope item' })
  for (const cell of body) {
    await c.var.db.delete(taskTargets).where(and(eq(taskTargets.taskId, cell.taskId), eq(taskTargets.scopeItemId, cell.scopeItemId)))
    if (cell.targetQty > 0) await c.var.db.insert(taskTargets).values(cell)
  }
  await logActivity(c, 'update', 'task_targets', null, `Updated quantity allocation (${body.length} cells)`)
  return c.json({ ok: true, updated: body.length })
})

export default r
