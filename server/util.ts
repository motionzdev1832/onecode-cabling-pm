import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { and, desc, eq, gte, inArray, like, lte } from 'drizzle-orm'
import type { z } from 'zod'
import type { AppEnv } from './env'
import type { DB } from './db'
import { activityLog, dailyLogItems, dailyLogs, tasks, taskTargets } from './db/schema'
import type { TaskRow, TaskTarget } from '../shared/types'
import type { LogItemFlat } from '../shared/progress'
import { isValidIsoDate, todayIn } from '../shared/dates'

export const nowIso = () => new Date().toISOString()

export async function parseBody<T extends z.ZodTypeAny>(c: Context<AppEnv>, schema: T): Promise<z.infer<T>> {
  let json: unknown
  try {
    json = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' })
  }
  const result = schema.safeParse(json)
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
    throw new HTTPException(400, { message: msg })
  }
  return result.data
}

export function idParam(c: Context<AppEnv>, name = 'id'): number {
  const n = Number(c.req.param(name))
  if (!Number.isInteger(n) || n <= 0) throw new HTTPException(400, { message: `Invalid ${name}` })
  return n
}

/** "today" for progress calculations: ?today=YYYY-MM-DD from the browser, else Asia/Bangkok. */
export function todayFrom(c: Context<AppEnv>): string {
  const q = c.req.query('today')
  return isValidIsoDate(q) ? q : todayIn('Asia/Bangkok')
}

export async function logActivity(
  c: Context<AppEnv>,
  action: string,
  entity: string,
  entityId: string | number | null,
  summary: string,
): Promise<void> {
  const u = c.var.user
  await c.var.db.insert(activityLog).values({
    userId: u?.id ?? null,
    userName: u?.displayName ?? null,
    action,
    entity,
    entityId: entityId === null ? null : String(entityId),
    summary,
    createdAt: nowIso(),
  })
}

export async function loadProgressInputs(db: DB): Promise<{ tasks: TaskRow[]; targets: TaskTarget[]; logItems: LogItemFlat[] }> {
  const [taskRows, targetRows, itemRows] = await Promise.all([
    db.select().from(tasks).orderBy(tasks.sortOrder).all(),
    db.select().from(taskTargets).all(),
    db
      .select({
        taskId: dailyLogs.taskId,
        logDate: dailyLogs.logDate,
        scopeItemId: dailyLogItems.scopeItemId,
        qty: dailyLogItems.qty,
      })
      .from(dailyLogItems)
      .innerJoin(dailyLogs, eq(dailyLogItems.logId, dailyLogs.id))
      .all(),
  ])
  return { tasks: taskRows as TaskRow[], targets: targetRows, logItems: itemRows }
}

/** Summary tasks take the min start / max finish of their children, bottom-up. */
export async function rollupSummaryDates(db: DB): Promise<void> {
  const rows = await db.select().from(tasks).all()
  const byParent = new Map<number, typeof rows>()
  for (const t of rows) {
    if (t.parentId === null) continue
    const arr = byParent.get(t.parentId) ?? []
    arr.push(t)
    byParent.set(t.parentId, arr)
  }
  const updates: { id: number; plannedStart: string; plannedFinish: string }[] = []
  const visit = (t: (typeof rows)[number]): { start: string; finish: string } => {
    const kids = byParent.get(t.id)
    if (!kids || kids.length === 0) return { start: t.plannedStart, finish: t.plannedFinish }
    let start = '9999-12-31'
    let finish = '0000-01-01'
    for (const k of kids) {
      const r = visit(k)
      if (r.start < start) start = r.start
      if (r.finish > finish) finish = r.finish
    }
    if (start !== t.plannedStart || finish !== t.plannedFinish) updates.push({ id: t.id, plannedStart: start, plannedFinish: finish })
    return { start, finish }
  }
  for (const root of rows.filter((r) => r.parentId === null)) visit(root)
  for (const u of updates) {
    await db.update(tasks).set({ plannedStart: u.plannedStart, plannedFinish: u.plannedFinish }).where(eq(tasks.id, u.id))
  }
}

export interface ActivityQuery {
  user?: string
  entity?: string
  action?: string
  q?: string
  from?: string
  to?: string
  limit?: number
}

export async function queryActivity(db: DB, f: ActivityQuery) {
  const conds = []
  if (f.user) conds.push(eq(activityLog.userName, f.user))
  if (f.entity) conds.push(eq(activityLog.entity, f.entity))
  if (f.action) conds.push(eq(activityLog.action, f.action))
  if (f.q) conds.push(like(activityLog.summary, `%${f.q.replace(/[%_]/g, '')}%`))
  if (isValidIsoDate(f.from)) conds.push(gte(activityLog.createdAt, f.from))
  if (isValidIsoDate(f.to)) conds.push(lte(activityLog.createdAt, f.to + 'T23:59:59.999Z'))
  return db
    .select()
    .from(activityLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(activityLog.id))
    .limit(Math.min(1000, Math.max(1, f.limit ?? 200)))
    .all()
}

export async function activityFacets(db: DB) {
  const [users, entities, actions] = await Promise.all([
    db.select({ v: activityLog.userName }).from(activityLog).groupBy(activityLog.userName).all(),
    db.select({ v: activityLog.entity }).from(activityLog).groupBy(activityLog.entity).all(),
    db.select({ v: activityLog.action }).from(activityLog).groupBy(activityLog.action).all(),
  ])
  const vals = (rows: { v: string | null }[]) => rows.map((r) => r.v).filter((v): v is string => !!v).sort()
  return { users: vals(users), entities: vals(entities), actions: vals(actions) }
}

/** "field: old → new; …" for the keys present in `after` that differ from `before`. */
export function describeChanges(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'string' ? (v.length > 40 ? v.slice(0, 37) + '…' : v) : typeof v === 'object' ? JSON.stringify(v) : String(v))
  const parts: string[] = []
  for (const k of Object.keys(after)) {
    if (!(k in before)) continue
    const a = before[k]
    const b = after[k]
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue
    parts.push(`${k}: ${fmt(a)} → ${fmt(b)}`)
  }
  return parts.join('; ')
}

export function clientIp(c: Context<AppEnv>): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown IP'
}

export async function logsWithItems(db: DB, logRows: (typeof dailyLogs.$inferSelect)[]) {
  if (logRows.length === 0) return []
  const ids = logRows.map((l) => l.id)
  const items = await db.select().from(dailyLogItems).where(inArray(dailyLogItems.logId, ids)).all()
  const byLog = new Map<number, { scopeItemId: number; qty: number }[]>()
  for (const it of items) {
    const arr = byLog.get(it.logId) ?? []
    arr.push({ scopeItemId: it.scopeItemId, qty: it.qty })
    byLog.set(it.logId, arr)
  }
  return logRows.map((l) => ({ ...l, items: byLog.get(l.id) ?? [] }))
}
