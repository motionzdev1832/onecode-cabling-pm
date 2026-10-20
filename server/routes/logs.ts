import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { dailyLogItems, dailyLogs, scopeItems, tasks, users } from '../db/schema'
import { requireAdmin } from '../auth'
import { idParam, logActivity, logsWithItems, nowIso, parseBody, todayFrom } from '../util'
import { addDays, isValidIsoDate } from '../../shared/dates'
import { isoDate } from './project'

const r = new Hono<AppEnv>()

const logSchema = z.object({
  logDate: isoDate,
  taskId: z.number().int().positive(),
  manpower: z.number().int().min(0).max(999).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  items: z.array(z.object({ scopeItemId: z.number().int().positive(), qty: z.number().min(0).max(1_000_000) })).max(50),
})

r.get('/', async (c) => {
  const db = c.var.db
  const from = c.req.query('from')
  const to = c.req.query('to')
  const taskId = Number(c.req.query('taskId'))
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit')) || 200))
  const conds = []
  if (isValidIsoDate(from)) conds.push(gte(dailyLogs.logDate, from))
  if (isValidIsoDate(to)) conds.push(lte(dailyLogs.logDate, to))
  if (Number.isInteger(taskId) && taskId > 0) conds.push(eq(dailyLogs.taskId, taskId))
  const rows = await db
    .select({ log: dailyLogs, createdByName: users.displayName, taskName: tasks.name })
    .from(dailyLogs)
    .leftJoin(users, eq(dailyLogs.createdBy, users.id))
    .innerJoin(tasks, eq(dailyLogs.taskId, tasks.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(dailyLogs.logDate), desc(dailyLogs.id))
    .limit(limit)
    .all()
  const withItems = await logsWithItems(db, rows.map((x) => x.log))
  const meta = new Map(rows.map((x) => [x.log.id, x]))
  return c.json(withItems.map((l) => ({ ...l, createdByName: meta.get(l.id)?.createdByName ?? null, taskName: meta.get(l.id)?.taskName ?? '' })))
})

/** "150 Ea MPO Patch Cord, 10 Ea MPO Y Cable; 6 workers" for the audit trail. */
async function describeLog(c: Context<AppEnv>, body: z.infer<typeof logSchema>): Promise<string> {
  const items = await c.var.db.select({ id: scopeItems.id, name: scopeItems.name, unit: scopeItems.unit }).from(scopeItems).all()
  const byId = new Map(items.map((i) => [i.id, i]))
  const parts = body.items.filter((i) => i.qty > 0).map((i) => `${i.qty} ${byId.get(i.scopeItemId)?.unit ?? ''} ${byId.get(i.scopeItemId)?.name ?? i.scopeItemId}`)
  const s = parts.length ? parts.join(', ') : 'no quantities'
  return body.manpower ? `${s}; ${body.manpower} workers` : s
}

async function validateLog(c: Context<AppEnv>, body: z.infer<typeof logSchema>) {
  const db = c.var.db
  if (body.logDate > addDays(todayFrom(c), 1)) throw new HTTPException(400, { message: 'Log date cannot be in the future' })
  const task = await db.select().from(tasks).where(eq(tasks.id, body.taskId)).get()
  if (!task) throw new HTTPException(404, { message: 'Task not found' })
  const kids = await db.select({ n: sql<number>`count(*)` }).from(tasks).where(eq(tasks.parentId, task.id)).get()
  if ((kids?.n ?? 0) > 0) throw new HTTPException(400, { message: 'Log progress against a leaf task, not a summary task' })
  const ids = body.items.map((i) => i.scopeItemId)
  if (new Set(ids).size !== ids.length) throw new HTTPException(400, { message: 'Duplicate scope item in items' })
  if (ids.length) {
    const found = await db.select({ id: scopeItems.id }).from(scopeItems).all()
    const known = new Set(found.map((f) => f.id))
    if (ids.some((id) => !known.has(id))) throw new HTTPException(400, { message: 'Unknown scope item' })
  }
  return task
}

r.post('/', requireAdmin, async (c) => {
  const body = await parseBody(c, logSchema)
  const task = await validateLog(c, body)
  const db = c.var.db
  const ts = nowIso()
  const row = await db
    .insert(dailyLogs)
    .values({ logDate: body.logDate, taskId: body.taskId, manpower: body.manpower ?? null, note: body.note ?? null, createdBy: c.var.user!.id, createdAt: ts, updatedAt: ts })
    .returning()
    .get()
  const items = body.items.filter((i) => i.qty > 0).map((i) => ({ logId: row.id, scopeItemId: i.scopeItemId, qty: i.qty }))
  if (items.length) await db.insert(dailyLogItems).values(items)
  // First log against a task sets its actual start if not set.
  if (!task.actualStart || body.logDate < task.actualStart) await db.update(tasks).set({ actualStart: body.logDate }).where(eq(tasks.id, task.id))
  await logActivity(c, 'create', 'daily_log', row.id, `Logged progress on "${task.name}" for ${body.logDate}: ${await describeLog(c, body)}`)
  const [full] = await logsWithItems(db, [row])
  return c.json(full, 201)
})

r.put('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const body = await parseBody(c, logSchema)
  const task = await validateLog(c, body)
  const db = c.var.db
  const existing = await db.select().from(dailyLogs).where(eq(dailyLogs.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'Log not found' })
  await db
    .update(dailyLogs)
    .set({ logDate: body.logDate, taskId: body.taskId, manpower: body.manpower ?? null, note: body.note ?? null, updatedAt: nowIso() })
    .where(eq(dailyLogs.id, id))
  await db.delete(dailyLogItems).where(eq(dailyLogItems.logId, id))
  const items = body.items.filter((i) => i.qty > 0).map((i) => ({ logId: id, scopeItemId: i.scopeItemId, qty: i.qty }))
  if (items.length) await db.insert(dailyLogItems).values(items)
  if (!task.actualStart || body.logDate < task.actualStart) await db.update(tasks).set({ actualStart: body.logDate }).where(eq(tasks.id, task.id))
  await logActivity(c, 'update', 'daily_log', id, `Edited progress log on "${task.name}" for ${body.logDate}: now ${await describeLog(c, body)}`)
  const row = await db.select().from(dailyLogs).where(eq(dailyLogs.id, id)).get()
  const [full] = await logsWithItems(db, [row!])
  return c.json(full)
})

r.delete('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const row = await c.var.db.delete(dailyLogs).where(eq(dailyLogs.id, id)).returning().get()
  if (!row) throw new HTTPException(404, { message: 'Log not found' })
  await logActivity(c, 'delete', 'daily_log', id, `Deleted progress log for ${row.logDate}`)
  return c.json({ ok: true })
})

export default r
