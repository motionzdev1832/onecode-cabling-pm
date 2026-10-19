import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../env'
import { project } from '../db/schema'
import { requireAdmin } from '../auth'
import { logActivity, parseBody } from '../util'
import { isValidIsoDate } from '../../shared/dates'

export const isoDate = z.string().refine(isValidIsoDate, 'must be YYYY-MM-DD')

const r = new Hono<AppEnv>()

r.get('/', async (c) => {
  const row = await c.var.db.select().from(project).where(eq(project.id, 1)).get()
  if (!row) throw new HTTPException(500, { message: 'Project row missing. Run the seed migration.' })
  return c.json(row)
})

r.put('/', requireAdmin, async (c) => {
  const body = await parseBody(
    c,
    z
      .object({
        name: z.string().trim().min(1).max(120),
        client: z.string().trim().max(120).nullable(),
        location: z.string().trim().max(200).nullable(),
        plannedStart: isoDate,
        plannedFinish: isoDate,
        notes: z.string().max(4000).nullable(),
      })
      .partial(),
  )
  if (body.plannedStart && body.plannedFinish && body.plannedFinish < body.plannedStart) {
    throw new HTTPException(400, { message: 'Planned finish must be after planned start' })
  }
  const row = await c.var.db.update(project).set(body).where(eq(project.id, 1)).returning().get()
  await logActivity(c, 'update', 'project', 1, 'Updated project settings')
  return c.json(row)
})

export default r
