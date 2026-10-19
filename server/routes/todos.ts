import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { todos } from '../db/schema'
import { requireAdmin } from '../auth'
import { idParam, logActivity, nowIso, parseBody } from '../util'
import { isoDate } from './project'

const r = new Hono<AppEnv>()

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  assignee: z.string().trim().max(80).nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
  taskId: z.number().int().positive().nullable().optional(),
})

r.get('/', async (c) => c.json(await c.var.db.select().from(todos).orderBy(desc(todos.id)).all()))

r.post('/', requireAdmin, async (c) => {
  const body = await parseBody(c, schema)
  const ts = nowIso()
  const row = await c.var.db
    .insert(todos)
    .values({ ...body, createdBy: c.var.user!.id, createdAt: ts, updatedAt: ts, completedAt: body.status === 'done' ? ts : null })
    .returning()
    .get()
  await logActivity(c, 'create', 'todo', row.id, `Added to-do "${row.title}"`)
  return c.json(row, 201)
})

r.put('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const body = await parseBody(c, schema.partial())
  const existing = await c.var.db.select().from(todos).where(eq(todos.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'To-do not found' })
  const ts = nowIso()
  let completedAt = existing.completedAt
  if (body.status && body.status !== existing.status) completedAt = body.status === 'done' ? ts : null
  const row = await c.var.db.update(todos).set({ ...body, updatedAt: ts, completedAt }).where(eq(todos.id, id)).returning().get()
  await logActivity(c, 'update', 'todo', id, `Updated to-do "${row!.title}"${body.status ? ` → ${body.status}` : ''}`)
  return c.json(row)
})

r.delete('/:id', requireAdmin, async (c) => {
  const id = idParam(c)
  const row = await c.var.db.delete(todos).where(eq(todos.id, id)).returning().get()
  if (!row) throw new HTTPException(404, { message: 'To-do not found' })
  await logActivity(c, 'delete', 'todo', id, `Deleted to-do "${row.title}"`)
  return c.json({ ok: true })
})

export default r
