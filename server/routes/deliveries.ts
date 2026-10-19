import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { deliveries, scopeItems } from '../db/schema'
import { requireAdmin } from '../auth'
import { idParam, logActivity, nowIso, parseBody } from '../util'
import { isoDate } from './project'

const r = new Hono<AppEnv>()

const schema = z.object({
  scopeItemId: z.number().int().positive(),
  deliveryDate: isoDate,
  qty: z.number().positive().max(1_000_000),
  reference: z.string().trim().max(120).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
})

r.get('/', async (c) => {
  const itemId = Number(c.req.query('scopeItemId'))
  const q = c.var.db.select().from(deliveries).orderBy(desc(deliveries.deliveryDate), desc(deliveries.id))
  const rows = Number.isInteger(itemId) && itemId > 0 ? await q.where(eq(deliveries.scopeItemId, itemId)).all() : await q.all()
  return c.json(rows)
})

r.post('/', requireAdmin, async (c) => {
  const body = await parseBody(c, schema)
  const item = await c.var.db.select().from(scopeItems).where(eq(scopeItems.id, body.scopeItemId)).get()
  if (!item) throw new HTTPException(404, { message: 'Scope item not found' })
  const row = await c.var.db.insert(deliveries).values({ ...body, createdBy: c.var.user!.id, createdAt: nowIso() }).returning().get()
  await logActivity(c, 'create', 'delivery', row.id, `Delivery: ${body.qty} ${item.unit} ${item.name} on ${body.deliveryDate}`)
  return c.json(row, 201)
})

r.put('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const body = await parseBody(c, schema.partial())
  const row = await c.var.db.update(deliveries).set(body).where(eq(deliveries.id, id)).returning().get()
  if (!row) throw new HTTPException(404, { message: 'Delivery not found' })
  await logActivity(c, 'update', 'delivery', id, `Edited delivery #${id}`)
  return c.json(row)
})

r.delete('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const row = await c.var.db.delete(deliveries).where(eq(deliveries.id, id)).returning().get()
  if (!row) throw new HTTPException(404, { message: 'Delivery not found' })
  await logActivity(c, 'delete', 'delivery', id, `Deleted delivery #${id}`)
  return c.json({ ok: true })
})

export default r
