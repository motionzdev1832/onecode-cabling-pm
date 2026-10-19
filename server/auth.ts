import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import type { AppEnv } from './env'
import type { DB } from './db'
import { sessions, users } from './db/schema'
import type { User } from '../shared/types'

const COOKIE = 'pm_session'
const SESSION_DAYS = 30
const PBKDF2_ITERATIONS = 100_000

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return toHex(arr)
}

async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return toHex(bits)
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomHex(16)
  const hash = await pbkdf2(password, salt)
  return { hash, salt }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const hash = await pbkdf2(password, salt)
  return timingSafeEqualHex(hash, expectedHash)
}

export function publicUser(row: typeof users.$inferSelect): User {
  return { id: row.id, username: row.username, displayName: row.displayName, role: row.role, createdAt: row.createdAt }
}

export async function createSession(c: Context<AppEnv>, db: DB, userId: number): Promise<void> {
  const id = randomHex(32)
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000)
  await db.insert(sessions).values({ id, userId, createdAt: now.toISOString(), expiresAt: expires.toISOString() })
  setCookie(c, COOKIE, id, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: new URL(c.req.url).protocol === 'https:',
    expires,
  })
}

export async function destroySession(c: Context<AppEnv>, db: DB): Promise<void> {
  const id = getCookie(c, COOKIE)
  if (id) await db.delete(sessions).where(eq(sessions.id, id))
  deleteCookie(c, COOKIE, { path: '/' })
}

/** Loads the current user (if any) into c.var.user. Never rejects. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null)
  const id = getCookie(c, COOKIE)
  if (id) {
    const db = c.var.db
    const row = await db
      .select({ s: sessions, u: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, id))
      .get()
    if (row) {
      if (row.s.expiresAt > new Date().toISOString()) c.set('user', publicUser(row.u))
      else await db.delete(sessions).where(eq(sessions.id, id))
    }
  }
  await next()
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) throw new HTTPException(401, { message: 'Sign in required' })
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) throw new HTTPException(401, { message: 'Sign in required' })
  if (c.var.user.role !== 'admin') throw new HTTPException(403, { message: 'Admin access required' })
  await next()
}
