import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { count, eq } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { activityLog, users } from '../db/schema'
import { createSession, destroySession, hashPassword, publicUser, verifyPassword } from '../auth'
import { clientIp, logActivity, nowIso, parseBody } from '../util'

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'at least 3 characters')
  .max(32)
  .regex(/^[a-z0-9._-]+$/i, 'letters, numbers, dot, dash or underscore only')
export const passwordSchema = z.string().min(8, 'at least 8 characters').max(128)

const auth = new Hono<AppEnv>()

async function userCount(c: { var: AppEnv['Variables'] }): Promise<number> {
  const row = await c.var.db.select({ n: count() }).from(users).get()
  return row?.n ?? 0
}

auth.get('/status', async (c) => {
  const n = await userCount(c)
  return c.json({ needsSetup: n === 0, user: c.var.user })
})

auth.post('/setup', async (c) => {
  if ((await userCount(c)) > 0) throw new HTTPException(403, { message: 'Setup already completed' })
  const body = await parseBody(
    c,
    z.object({ username: usernameSchema, password: passwordSchema, displayName: z.string().trim().min(1).max(64) }),
  )
  const { hash, salt } = await hashPassword(body.password)
  const row = await c.var.db
    .insert(users)
    .values({ username: body.username.toLowerCase(), displayName: body.displayName, passwordHash: hash, salt, role: 'admin', createdAt: nowIso() })
    .returning()
    .get()
  c.set('user', publicUser(row))
  await createSession(c, c.var.db, row.id)
  await logActivity(c, 'setup', 'user', row.id, `Created first admin account "${row.username}"`)
  return c.json({ user: publicUser(row) })
})

auth.post('/login', async (c) => {
  const body = await parseBody(c, z.object({ username: z.string().trim().min(1), password: z.string().min(1) }))
  const row = await c.var.db.select().from(users).where(eq(users.username, body.username.toLowerCase())).get()
  const ok = row ? await verifyPassword(body.password, row.salt, row.passwordHash) : false
  if (!row || !ok) {
    await c.var.db.insert(activityLog).values({
      userId: row?.id ?? null,
      userName: body.username.toLowerCase(),
      action: 'login_failed',
      entity: 'session',
      entityId: null,
      summary: `Failed sign-in attempt for "${body.username.toLowerCase()}" from ${clientIp(c)}`,
      createdAt: nowIso(),
    })
    throw new HTTPException(401, { message: 'Incorrect username or password' })
  }
  await createSession(c, c.var.db, row.id)
  c.set('user', publicUser(row))
  await logActivity(c, 'login', 'session', row.id, `Signed in from ${clientIp(c)}`)
  return c.json({ user: publicUser(row) })
})

auth.post('/logout', async (c) => {
  if (c.var.user) await logActivity(c, 'logout', 'session', c.var.user.id, 'Signed out')
  await destroySession(c, c.var.db)
  return c.json({ ok: true })
})

auth.get('/me', (c) => {
  if (!c.var.user) throw new HTTPException(401, { message: 'Sign in required' })
  return c.json({ user: c.var.user })
})

auth.post('/change-password', async (c) => {
  const me = c.var.user
  if (!me) throw new HTTPException(401, { message: 'Sign in required' })
  const body = await parseBody(c, z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }))
  const row = await c.var.db.select().from(users).where(eq(users.id, me.id)).get()
  if (!row || !(await verifyPassword(body.currentPassword, row.salt, row.passwordHash))) {
    throw new HTTPException(400, { message: 'Current password is incorrect' })
  }
  const { hash, salt } = await hashPassword(body.newPassword)
  await c.var.db.update(users).set({ passwordHash: hash, salt }).where(eq(users.id, me.id))
  await logActivity(c, 'password_change', 'user', me.id, 'Changed own password')
  return c.json({ ok: true })
})

export default auth
