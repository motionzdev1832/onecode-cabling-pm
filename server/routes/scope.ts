import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import type { AppEnv } from '../env'
import type { DB } from '../db'
import { dailyLogItems, deliveries, scopeItems, taskTargets } from '../db/schema'
import { requireAdmin } from '../auth'
import { describeChanges, logActivity, parseBody, idParam } from '../util'
import type { ScopeItemProgress } from '../../shared/types'

const r = new Hono<AppEnv>()

export async function scopeItemsWithProgress(db: DB): Promise<ScopeItemProgress[]> {
  const [items, alloc, inst, deliv] = await Promise.all([
    db.select().from(scopeItems).orderBy(scopeItems.sortOrder).all(),
    db
      .select({ id: taskTargets.scopeItemId, qty: sql<number>`coalesce(sum(${taskTargets.targetQty}), 0)` })
      .from(taskTargets)
      .groupBy(taskTargets.scopeItemId)
      .all(),
    db
      .select({ id: dailyLogItems.scopeItemId, qty: sql<number>`coalesce(sum(${dailyLogItems.qty}), 0)` })
      .from(dailyLogItems)
      .groupBy(dailyLogItems.scopeItemId)
      .all(),
    db
      .select({ id: deliveries.scopeItemId, qty: sql<number>`coalesce(sum(${deliveries.qty}), 0)` })
      .from(deliveries)
      .groupBy(deliveries.scopeItemId)
      .all(),
  ])
  const m = (rows: { id: number; qty: number }[]) => new Map(rows.map((x) => [x.id, Number(x.qty)]))
  const a = m(alloc)
  const i = m(inst)
  const d = m(deliv)
  return items.map((it) => ({
    ...it,
    allocatedQty: a.get(it.id) ?? 0,
    installedQty: i.get(it.id) ?? 0,
    deliveredQty: d.get(it.id) ?? 0,
  }))
}

r.get('/', async (c) => c.json(await scopeItemsWithProgress(c.var.db)))

const itemSchema = z.object({
  code: z.string().trim().min(1).max(16).regex(/^[A-Z0-9_-]+$/i, 'letters, numbers, dash or underscore'),
  name: z.string().trim().min(1).max(120),
  category: z.enum(['network', 'cable']),
  unit: z.string().trim().min(1).max(16),
  totalQty: z.number().nonnegative(),
})

r.post('/', requireAdmin, async (c) => {
  const body = await parseBody(c, itemSchema)
  const max = await c.var.db.select({ n: sql<number>`coalesce(max(${scopeItems.sortOrder}), 0)` }).from(scopeItems).get()
  const row = await c.var.db
    .insert(scopeItems)
    .values({ ...body, code: body.code.toUpperCase(), sortOrder: (max?.n ?? 0) + 1 })
    .returning()
    .get()
  await logActivity(c, 'create', 'scope_item', row.id, `Added scope item "${row.name}" (${row.totalQty} ${row.unit})`)
  return c.json(row, 201)
})

r.put('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const body = await parseBody(c, itemSchema.partial())
  if (body.code) body.code = body.code.toUpperCase()
  const existing = await c.var.db.select().from(scopeItems).where(eq(scopeItems.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'Scope item not found' })
  const row = await c.var.db.update(scopeItems).set(body).where(eq(scopeItems.id, id)).returning().get()
  await logActivity(c, 'update', 'scope_item', id, `Updated scope item "${existing.name}": ${describeChanges(existing, body) || 'no changes'}`)
  return c.json(row)
})

r.delete('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const used = await c.var.db.select({ n: sql<number>`count(*)` }).from(dailyLogItems).where(eq(dailyLogItems.scopeItemId, id)).get()
  if ((used?.n ?? 0) > 0) throw new HTTPException(409, { message: 'This item has daily log entries. Delete those first.' })
  const row = await c.var.db.delete(scopeItems).where(eq(scopeItems.id, id)).returning().get()
  if (!row) throw new HTTPException(404, { message: 'Scope item not found' })
  await logActivity(c, 'delete', 'scope_item', id, `Deleted scope item "${row.name}"`)
  return c.json({ ok: true })
})

export default r
