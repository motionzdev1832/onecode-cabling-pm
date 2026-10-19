import { Suspense, lazy, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Cable, Server } from 'lucide-react'
import type { DashboardData, TaskView } from '@shared/types'
import { daysBetween } from '@shared/dates'
import { BEHIND_THRESHOLD } from '@shared/progress'
import { useFetch } from '@/lib/hooks'
import { cls, fmtDate, fmtDelta, fmtNum, fmtPct, floorLabel } from '@/lib/format'
import { Badge, Card, ErrorBanner, Loading, Meter, PageHeader, Segmented, StatTile, TaskStatusBadge, Table, td, th, toneIcon } from '@/components/ui'
import { toSCurveSeries } from '@/lib/scurve'

const SCurveChart = lazy(() => import('@/components/charts').then((m) => ({ default: m.SCurveChart })))
const ManpowerChart = lazy(() => import('@/components/charts').then((m) => ({ default: m.ManpowerChart })))
const chartFallback = (h: number) => <div style={{ height: h }} className="animate-pulse rounded-lg bg-plane" />
import TaskDetail from '@/components/TaskDetail'

export default function DashboardPage() {
  const { data, error, loading, reload, refreshing } = useFetch<DashboardData>('/api/dashboard')
  const [curveView, setCurveView] = useState<'chart' | 'table'>('chart')
  const [selected, setSelected] = useState<number | null>(null)

  const series = useMemo(() => (data ? toSCurveSeries(data.scurve) : []), [data])
  const weekly = useMemo(() => (data ? data.scurve.filter((_p, i) => i % 7 === 0 || i === data.scurve.length - 1) : []), [data])

  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />
  if (loading && !data) return <Loading />
  if (!data) return null

  const { project, overall, counts, today } = data
  const variance = overall.actual - overall.planned
  const started = today >= project.plannedStart
  const finished = today > project.plannedFinish
  const health: { tone: 'good' | 'serious' | 'critical' | 'accent'; label: string } =
    overall.actual >= 100 ? { tone: 'good', label: 'Complete' } : variance <= -BEHIND_THRESHOLD ? { tone: variance <= -2 * BEHIND_THRESHOLD ? 'critical' : 'serious', label: 'Behind plan' } : variance >= BEHIND_THRESHOLD ? { tone: 'good', label: 'Ahead of plan' } : { tone: 'accent', label: 'On track' }

  const timeline = !started
    ? `Starts ${fmtDate(project.plannedStart)} · in ${daysBetween(today, project.plannedStart)} days`
    : finished
      ? `Planned finish ${fmtDate(project.plannedFinish)} was ${daysBetween(project.plannedFinish, today)} days ago`
      : `Day ${counts.daysElapsed} of ${counts.daysTotal} · ${counts.daysRemaining} days to planned finish`

  return (
    <div className={cls(refreshing && 'opacity-70 transition-opacity')}>
      <PageHeader title={project.name} description={`${project.client ? project.client + ' · ' : ''}${fmtDate(project.plannedStart)} – ${fmtDate(project.plannedFinish)} · ${timeline}`} />

      {/* Hero */}
      <section className="mb-4 rounded-xl border border-line bg-white px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[13px] text-ink-2">Overall progress</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-5xl font-semibold leading-none tracking-tight text-ink">{fmtPct(overall.actual)}</span>
              <span className="text-sm text-ink-2">
                planned {fmtPct(overall.planned)} · <span className={cls('font-medium', variance < -0.05 ? 'text-critical-text' : variance > 0.05 ? 'text-good-text' : 'text-ink-2')}>{fmtDelta(variance)} pts</span>
              </span>
            </div>
          </div>
          <Badge tone={health.tone} icon={toneIcon[health.tone]} className="text-sm">
            {health.label}
          </Badge>
        </div>
        <div className="mt-4">
          <Meter value={overall.actual} tone={health.tone === 'accent' ? 'accent' : health.tone} marker={overall.planned} />
          <div className="mt-1 flex justify-between text-[11px] text-ink-3">
            <span>{fmtDate(project.plannedStart, { year: false })}</span>
            <span>The dark tick marks today's planned progress</span>
            <span>{fmtDate(project.plannedFinish, { year: false })}</span>
          </div>
        </div>
      </section>

      {/* KPI row */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.floors.map((f) => (
          <StatTile key={f.floor} label={f.label} value={fmtPct(f.actual)} sub={`planned ${fmtPct(f.planned)}`} delta={{ value: Math.round((f.actual - f.planned) * 10) / 10, good: f.actual - f.planned >= 0, label: 'pts' }} />
        ))}
        <StatTile label="Tasks" value={`${counts.done} / ${counts.leafTasks}`} sub={`${counts.inProgress} in progress · ${counts.notStarted} not started`} />
        <StatTile label="Late or behind" value={counts.late + counts.behind} sub={`${counts.late} late · ${counts.behind} behind`} tone={counts.late > 0 ? 'critical' : counts.behind > 0 ? 'serious' : undefined} />
        <StatTile label="Open issues" value={counts.openIssues} sub={`${counts.criticalIssues} high or critical`} tone={counts.criticalIssues > 0 ? 'critical' : undefined} />
        <StatTile label="Open to-dos" value={counts.openTodos} sub={`${counts.overdueTodos} overdue`} tone={counts.overdueTodos > 0 ? 'serious' : undefined} />
      </div>

      {/* S-curve */}
      <Card
        title="Progress curve"
        description="Planned vs actual, duration-weighted across all leaf tasks"
        actions={<Segmented value={curveView} onChange={setCurveView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />}
        className="mb-4"
      >
        {curveView === 'chart' ? (
          <Suspense fallback={chartFallback(284)}>
            <SCurveChart data={series} today={today} />
          </Suspense>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={th}>Week of</th>
                <th className={cls(th, 'text-right')}>Planned</th>
                <th className={cls(th, 'text-right')}>Actual</th>
                <th className={cls(th, 'text-right')}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((p) => (
                <tr key={p.date}>
                  <td className={td}>{fmtDate(p.date)}</td>
                  <td className={cls(td, 'tabular text-right')}>{fmtPct(p.planned)}</td>
                  <td className={cls(td, 'tabular text-right')}>{p.actual === null ? '—' : fmtPct(p.actual)}</td>
                  <td className={cls(td, 'tabular text-right', p.actual !== null && p.actual - p.planned < -BEHIND_THRESHOLD ? 'text-critical-text' : 'text-ink-2')}>{p.actual === null ? '—' : fmtDelta(p.actual - p.planned)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Needs attention" description="Late tasks, and tasks more than 5 points under plan" actions={<Link to="/plan" className="text-xs font-medium text-accent-2 hover:underline">Open plan</Link>}>
          <TaskList tasks={data.lateTasks} empty="Nothing is late or behind." onSelect={setSelected} showPlanned />
        </Card>
        <Card title="In progress & starting soon" description="Active tasks and those planned to start within 7 days" actions={<Link to="/log" className="text-xs font-medium text-accent-2 hover:underline">Daily log</Link>}>
          <TaskList tasks={[...data.activeTasks, ...data.upcomingTasks.filter((u) => !data.activeTasks.some((a) => a.id === u.id))]} empty="No active or upcoming tasks this week." onSelect={setSelected} />
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card title="Scope progress" description="Installed quantity against the scope list" className="lg:col-span-3" actions={<Link to="/materials" className="text-xs font-medium text-accent-2 hover:underline">Materials</Link>}>
          <div className="space-y-3">
            {(['network', 'cable'] as const).map((cat) => (
              <div key={cat}>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
                  {cat === 'network' ? <Server className="h-3.5 w-3.5" /> : <Cable className="h-3.5 w-3.5" />}
                  {cat === 'network' ? 'Network installation' : 'Cable installation'}
                </div>
                <div className="space-y-2">
                  {data.items
                    .filter((it) => it.category === cat)
                    .map((it) => {
                      const pct = it.totalQty > 0 ? (it.installedQty / it.totalQty) * 100 : 0
                      return (
                        <div key={it.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[180px_1fr_auto]">
                          <span className="truncate text-[13px] text-ink">{it.name}</span>
                          <span className="tabular text-right text-xs text-ink-2 sm:order-3 sm:w-36">
                            {fmtNum(it.installedQty)} / {fmtNum(it.totalQty)} {it.unit}
                          </span>
                          <div className="col-span-2 sm:col-span-1 sm:order-2">
                            <Meter value={pct} thin tone={pct >= 100 ? 'good' : 'accent'} />
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Workers on site" description="Manpower logged per day, last 14 days" className="lg:col-span-2">
          <Suspense fallback={chartFallback(150)}>
            <ManpowerChart data={data.manpower7d} />
          </Suspense>
          <div className="mt-3 border-t border-line-2 pt-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">Recent log entries</div>
            {data.recentLogs.length === 0 ? (
              <p className="text-[13px] text-ink-3">No progress logged yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.recentLogs.slice(0, 5).map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate text-ink">{l.taskName}</span>
                    <span className="shrink-0 text-ink-3">{fmtDate(l.logDate, { year: false })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <TaskDetail taskId={selected} scopeItems={data.items} onClose={() => setSelected(null)} onChanged={() => void reload()} />
    </div>
  )
}

function TaskList({ tasks, empty, onSelect, showPlanned }: { tasks: TaskView[]; empty: string; onSelect: (id: number) => void; showPlanned?: boolean }) {
  if (tasks.length === 0) return <p className="text-[13px] text-ink-3">{empty}</p>
  return (
    <ul className="-my-1 divide-y divide-line-2">
      {tasks.map((t) => (
        <li key={t.id}>
          <button type="button" onClick={() => onSelect(t.id)} className="group flex w-full items-center gap-3 py-2 text-left">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[13px] font-medium text-ink group-hover:text-accent-2">
                <span className="truncate">{t.name}</span>
                <ArrowUpRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
              </div>
              <div className="truncate text-xs text-ink-3">
                {t.path}
                {t.floor ? ` · ${floorLabel(t.floor)}` : ''} · {fmtDate(t.plannedStart, { year: false })} – {fmtDate(t.plannedFinish, { year: false })}
              </div>
            </div>
            <div className="w-24 shrink-0">
              <Meter value={t.percent} thin tone={t.late ? 'critical' : t.behind ? 'serious' : 'accent'} marker={showPlanned ? t.plannedPercent : null} />
              <div className="mt-0.5 text-right text-[11px] text-ink-3">
                {fmtPct(t.percent, 0)}
                {showPlanned ? ` / ${fmtPct(t.plannedPercent, 0)}` : ''}
              </div>
            </div>
            <TaskStatusBadge status={t.status} late={t.late} behind={t.behind} />
          </button>
        </li>
      ))}
    </ul>
  )
}
