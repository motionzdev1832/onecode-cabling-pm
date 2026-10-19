import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { sessions, users } from '../db/schema'
import { hashPassword, publicUser, requireAdmin } from '../auth'
import { idParam, logActivity, nowIso, parseBody } from '../util'
import { passwordSchema, usernameSchema } from './auth'

const r = new Hono<AppEnv>()
r.use('*', requireAdmin)

r.get('/', async (c) => {
  const rows = await c.var.db.select().from(users).orderBy(users.id).all()
  return c.json(rows.map(publicUser))
})

r.post('/', async (c) => {
  const body = await parseBody(
    c,
    z.object({ username: usernameSchema, password: passwordSchema, displayName: z.string().trim().min(1).max(64), role: z.enum(['admin', 'viewer']) }),
  )
  const dup = await c.var.db.select({ id: users.id }).from(users).where(eq(users.username, body.username.toLowerCase())).get()
  if (dup) throw new HTTPException(409, { message: 'Username already exists' })
  const { hash, salt } = await hashPassword(body.password)
  const row = await c.var.db
    .insert(users)
    .values({ username: body.username.toLowerCase(), displayName: body.displayName, role: body.role, passwordHash: hash, salt, createdAt: nowIso() })
    .returning()
    .get()
  await logActivity(c, 'create', 'user', row.id, `Added ${row.role} account "${row.username}"`)
  return c.json(publicUser(row), 201)
})

r.put('/:id', async (c) => {
  const id = idParam(c)
  const body = await parseBody(c, z.object({ displayName: z.string().trim().min(1).max(64), role: z.enum(['admin', 'viewer']), password: passwordSchema }).partial())
  const existing = await c.var.db.select().from(users).where(eq(users.id, id)).get()
  if (!existing) throw new HTTPException(404, { message: 'User not found' })
  if (body.role === 'viewer' && existing.role === 'admin') {
    const others = await c.var.db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.role, 'admin'), ne(users.id, id))).get()
    if ((others?.n ?? 0) === 0) throw new HTTPException(400, { message: 'At least one admin account must remain' })
  }
  const patch: Partial<typeof users.$inferInsert> = {}
  if (body.displayName) patch.displayName = body.displayName
  if (body.role) patch.role = body.role
  if (body.password) {
    const { hash, salt } = await hashPassword(body.password)
    patch.passwordHash = hash
    patch.salt = salt
    await c.var.db.delete(sessions).where(eq(sessions.userId, id))
  }
  const row = await c.var.db.update(users).set(patch).where(eq(users.id, id)).returning().get()
  await logActivity(c, 'update', 'user', id, `Updated account "${existing.username}" (${Object.keys(body).join(', ')})`)
  return c.json(publicUser(row!))
})

r.delete('/:id', async (c) => {
  const id = idParam(c)
  if (id === c.var.user!.id) throw new HTTPException(400, { message: 'You cannot delete your own account' })
  const row = await c.var.db.delete(users).where(eq(users.id, id)).returning().get()
  if (!row) throw new HTTPException(404, { message: 'User not found' })
  await logActivity(c, 'delete', 'user', id, `Deleted account "${row.username}"`)
  return c.json({ ok: true })
})

export default r
