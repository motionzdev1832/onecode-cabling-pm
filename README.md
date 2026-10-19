# OneQode AI Farm Cabling · PM Control

Progress-control web app for the AI Farm cabling and equipment installation project
(Nov 2026 – Mar 2027). Runs entirely on Cloudflare: one Worker serves the static React app
(Workers Static Assets) and the API, with D1 (SQLite) as the database.

## What it does

| Page | Purpose |
|---|---|
| Dashboard | Overall / per-floor progress vs plan, S-curve, late or behind tasks, scope quantities, manpower |
| Plan | Gantt and list of the 70-task baseline (from the MS Project plan); task details, actual dates, targets |
| Plan › Quantities | Matrix to split each scope quantity (e.g. 5,172 MPO patch cords) across the leaf tasks that install it |
| Daily log | Installed quantities + workers on site, per task per day. This drives all progress figures |
| To-do | Action list with owner, due date, priority |
| Issues | Blockers and risks with severity, category, owner, resolution |
| Materials | Scope vs delivered vs installed per item, with a delivery register |
| Weekly report | Printable one-week summary for the client (Print / Save as PDF) |
| Activity | Audit trail of every change |
| Users / Settings | Admin creates viewer accounts; project dates; change password |

Roles: **admin** (the PM: full edit) and **viewer** (client: read-only everywhere).

### How progress is calculated

- A leaf task **with quantity targets** = installed ÷ target (from the daily log).
- A leaf task **without targets** (e.g. testing) = its manual % (100% once an actual finish date is set).
- Summary rows, floors and the project = **duration-weighted** average of their leaf tasks.
- **Planned %** assumes each task progresses evenly from planned start to planned finish, 7 days a week.
- **Behind** = more than 5 points under planned %. **Late** = planned finish passed and not done.

## Stack

- Frontend: React 19, Vite, TypeScript, Tailwind CSS v4, Recharts, lucide icons
- API: Hono inside the Worker (`server/worker.ts` → `server/app.ts`); non-API paths are served from static assets
- Data: Cloudflare D1 via Drizzle ORM (`server/db/schema.ts`, migrations in `drizzle/`)
- Shared progress engine used by the API: `shared/progress.ts`

## Local development

```bash
npm install
npm run db:migrate:local      # creates the local D1 database and seeds the plan + scope list
npm run dev                   # Vite on http://localhost:5173 (API proxied to wrangler on :8788)
```

Open http://localhost:5173. The first visit asks you to create the admin account.

To preview the production build locally: `npm run build && npm run preview` → http://127.0.0.1:8788.

## Deploy to Cloudflare Workers

One-time setup (needs `npx wrangler login` in an interactive terminal):

```bash
# 1. Create the production database and copy its id into wrangler.toml (database_id)
npx wrangler d1 create oneqode-cabling-pm

# 2. Apply the schema + seed to the remote database
npm run db:migrate:remote
```

Then either:

**A. Git integration (what this project uses):** push this repo to GitHub, then in the
Cloudflare dashboard → Workers & Pages → Create → Workers → Import a repository. Build settings:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Node version: picked up from `.node-version` (24)

Bindings (D1, static assets) come from `wrangler.toml`, so nothing needs configuring in the
dashboard. Every push to `main` builds and deploys; other branches get preview URLs.

**B. Direct upload from this machine:**

```bash
npm run deploy                # builds and runs `wrangler deploy`
```

After the first deploy, open the `*.workers.dev` URL (or your custom domain) and create the admin
account. Then add viewer accounts under **Users**.

### Later schema changes

Edit `server/db/schema.ts`, run `npm run db:generate`, then `npm run db:migrate:local` /
`npm run db:migrate:remote`. The baseline plan and scope list live in `scripts/seed-data.mjs`;
`node scripts/gen-seed.mjs` regenerates `drizzle/0001_seed.sql` (only used on a fresh database).

## Project layout

```
server/worker.ts             Worker entry: /api → Hono app, everything else → static assets
server/                      API (auth, routes, Drizzle schema)
shared/                      Types, date helpers, progress engine (shared with the client)
src/                         React app (pages, components, lib)
drizzle/                     SQL migrations (0000 schema, 0001 seed)
scripts/                     Seed data + generator
wrangler.toml                Worker, static assets and D1 configuration
```
