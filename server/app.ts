import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './env'
import { getDb } from './db'
import { requireAuth, sessionMiddleware } from './auth'
import { activityFacets, queryActivity } from './util'
import authRoutes from './routes/auth'
import projectRoutes from './routes/project'
import scopeRoutes from './routes/scope'
import taskRoutes from './routes/tasks'
import logRoutes from './routes/logs'
import todoRoutes from './routes/todos'
import issueRoutes from './routes/issues'
import deliveryRoutes from './routes/deliveries'
import userRoutes from './routes/users'
import dashboardRoutes from './routes/dashboard'
import reportRoutes from './routes/report'

export const app = new Hono<AppEnv>().basePath('/api')

app.use('*', async (c, next) => {
  c.set('db', getDb(c.env.DB))
  c.header('Cache-Control', 'no-store')
  await next()
})
app.use('*', sessionMiddleware)

app.route('/auth', authRoutes)

const protectedApi = new Hono<AppEnv>()
protectedApi.use('*', requireAuth)
protectedApi.route('/project', projectRoutes)
protectedApi.route('/scope-items', scopeRoutes)
protectedApi.route('/tasks', taskRoutes)
protectedApi.route('/logs', logRoutes)
protectedApi.route('/todos', todoRoutes)
protectedApi.route('/issues', issueRoutes)
protectedApi.route('/deliveries', deliveryRoutes)
protectedApi.route('/users', userRoutes)
protectedApi.route('/dashboard', dashboardRoutes)
protectedApi.route('/report', reportRoutes)
protectedApi.get('/activity', async (c) => {
  const q = c.req.query()
  return c.json(
    await queryActivity(c.var.db, {
      user: q.user || undefined,
      entity: q.entity || undefined,
      action: q.action || undefined,
      q: q.q || undefined,
      from: q.from || undefined,
      to: q.to || undefined,
      limit: Number(q.limit) || 200,
    }),
  )
})
protectedApi.get('/activity/facets', async (c) => c.json(await activityFacets(c.var.db)))
app.route('/', protectedApi)

app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})
