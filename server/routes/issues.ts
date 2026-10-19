import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { issues } from '../db/schema'
import { requireAdmin } from '../auth'
import { idParam, logActivity, nowIso, parseBody, todayFrom } from '../util'
import { isoDate } from './project'

const r = new Hono<AppEnv>()

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.enum(['material', 'access', 'design', 'safety', 'quality', 'other']).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  taskId: z.number().int().positive().nullable().optional(),
  owner: z.string().trim().max(80).nullable().optional(),
  raisedDate: isoDate.optional(),
  dueDate: isoDate.nullable().optional(),
  resolvedDate: isoDate.nullable().optional(),
  resolution: z.string().max(4000).nullable().optional(),
})

r.get('/', async (c) => c.json(await c.var.db.select().from(issues).orderBy(desc(issues.id)).all()))

r.post('/', requireAdmin, async (c) => {
  const body = await parseBody(c, schema)
  const ts = nowIso()
  const raisedDate = body.raisedDate ?? todayFrom(c)
  const row = await c.var.db
    .insert(issues)
    .values({ ...body, raisedDate, createdBy: c.var.user!.id, createdAt: ts, updatedAt: ts })
    .returning()
    .get()
  await logActivity(c, 'create', 'issue', row.id, `Raised issue "${row.title}" (${row.severity})`)
  return c.json(row, 201)
})

r.put('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const body = await parseBody(c, schema.partial())
  const existing = await c.var.db.select().from(issues).where(eq(issues.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'Issue not found' })
  const ts = nowIso()
  const patch: Partial<typeof issues.$inferInsert> = { ...body, updatedAt: ts }
  const closing = body.status && ['resolved', 'closed'].includes(body.status) && !['resolved', 'closed'].includes(existing.status)
  if (closing && !body.resolvedDate && !existing.resolvedDate) patch.resolvedDate = todayFrom(c)
  if (body.status && ['open', 'in_progress'].includes(body.status) && body.resolvedDate === undefined) patch.resolvedDate = null
  const row = await c.var.db.update(issues).set(patch).where(eq(issues.id, id)).returning().get()
  await logActivity(c, 'update', 'issue', id, `Updated issue "${row!.title}"${body.status ? ` → ${body.status}` : ''}`)
  return c.json(row)
})

r.delete('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const row = await c.var.db.delete(issues).where(eq(issues.id, id)).returning().get()
  if (!row) throw new HTTPException(404, { message: 'Issue not found' })
  await logActivity(c, 'delete', 'issue', id, `Deleted issue "${row.title}"`)
  return c.json({ ok: true })
})

export default r
