// Cloudflare Worker entry: the Hono API handles /api/*; everything else is served
// from the static assets binding (built React app, SPA fallback configured in wrangler.toml).
import { app } from './app'
import type { Bindings } from './env'

type Env = Bindings & { ASSETS: Fetcher }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
