import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import type { Issue, TaskView, Todo, WeeklyReportData } from '@shared/types'
import { addDays } from '@shared/dates'
import { localToday } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import { cls, fmtDate, fmtDateTime, fmtDelta, fmtNum, fmtPct, issueSeverityLabel, issueStatusLabel, floorLabel } from '@/lib/format'
import { Badge, Button, ErrorBanner, Input, Loading, PageHeader, TaskStatusBadge } from '@/components/ui'
import { severityTone } from './IssuesPage'

export default function ReportPage() {
  const [to, setTo] = useState(localToday())
  const { data, error, loading, reload, refreshing } = useFetch<WeeklyReportData>(`/api/report/weekly?to=${to}`)
  const itemName = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data])

  return (
    <div>
      <PageHeader
        title="Weekly report"
        description="Progress summary for the client, one week ending on the selected date"
        actions={
          <>
            <Button size="sm" onClick={() => setTo(addDays(to, -7))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-40" />
            <Button size="sm" onClick={() => setTo(addDays(to, 7))} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
          </>
        }
      />

      {error && !data && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <article className={cls('space-y-6', refreshing && 'opacity-60')}>
          <header className="rounded-xl border border-line bg-white px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-ink">{data.project.name}</h2>
                <p className="text-sm text-ink-2">
                  Weekly progress report · {fmtDate(data.from)} – {fmtDate(data.to)}
                </p>
              </div>
              <div className="text-right text-xs text-ink-3">
                {data.project.client && <div>Client: {data.project.client}</div>}
                <div>Generated {fmtDateTime(data.generatedAt)}</div>
              </div>
            </div>
          </header>

          <section className={cls('print-break grid grid-cols-2 gap-3', data.floors.length > 2 ? 'md:grid-cols-5' : 'md:grid-cols-4')}>
            <Tile label="Overall progress" value={fmtPct(data.overall.endActual)} sub={`${fmtDelta(data.overall.endActual - data.overall.startActual)} pts this week`} />
            <Tile label="Planned to date" value={fmtPct(data.overall.endPlanned)} sub={`variance ${fmtDelta(data.overall.endActual - data.overall.endPlanned)} pts`} tone={data.overall.endActual - data.overall.endPlanned < -5 ? 'critical' : undefined} />
            {data.floors.map((f) => (
              <Tile key={f.floor} label={f.label} value={fmtPct(f.endActual)} sub={`${fmtDelta(f.endActual - f.startActual)} pts this week · planned ${fmtPct(f.endPlanned)}`} />
            ))}
          </section>

          <Section title="Work completed this week" subtitle={`${data.weekLogs.length} task${data.weekLogs.length === 1 ? '' : 's'} worked · ${data.manpowerTotal} worker-days logged`}>
            {data.weekLogs.length === 0 ? (
              <Empty>No progress was logged in this period.</Empty>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
                    <th className="py-1.5 pr-3 font-medium">Task</th>
                    <th className="py-1.5 pr-3 font-medium">Installed this week</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Worker-days</th>
                    <th className="py-1.5 text-right font-medium">Task progress</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weekLogs.map((w) => (
                    <tr key={w.task.id} className="border-b border-line-2 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-ink">{w.task.name}</div>
                        <div className="text-xs text-ink-3">
                          {w.task.path}
                          {w.task.floor ? ` · ${floorLabel(w.task.floor)}` : ''}
                          {w.task.pic ? ` · PIC ${w.task.pic}` : ''}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-ink-2">
                        {Object.entries(w.qtyByItem).length === 0
                          ? '—'
                          : Object.entries(w.qtyByItem).map(([id, q]) => (
                              <div key={id}>
                                <span className="tabular font-medium text-ink">{fmtNum(q)}</span> {itemName.get(Number(id))?.unit} {itemName.get(Number(id))?.name ?? `Item ${id}`}
                              </div>
                            ))}
                        {w.logs.some((l) => l.note) && <div className="mt-1 text-xs text-ink-3">{w.logs.filter((l) => l.note).map((l) => `${fmtDate(l.logDate, { year: false })}: ${l.note}`).join(' · ')}</div>}
                      </td>
                      <td className="tabular py-2 pr-3 text-right text-ink-2">{w.manpower || '—'}</td>
                      <td className="tabular py-2 text-right">
                        {fmtPct(w.task.percent)}
                        <div className="text-xs text-ink-3">planned {fmtPct(w.task.plannedPercent)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Scope quantities" subtitle="Installed to date against the scope list">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
                  <th className="py-1.5 pr-3 font-medium">Item</th>
                  <th className="py-1.5 pr-3 text-right font-medium">This week</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Installed</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Scope</th>
                  <th className="py-1.5 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id} className="border-b border-line-2">
                    <td className="py-1.5 pr-3 text-ink">{it.name}</td>
                    <td className={cls('tabular py-1.5 pr-3 text-right', it.weekQty ? 'font-medium text-ink' : 'text-ink-3')}>{it.weekQty ? `+${fmtNum(it.weekQty)}` : '—'}</td>
                    <td className="tabular py-1.5 pr-3 text-right text-ink">{fmtNum(it.installedQty)}</td>
                    <td className="tabular py-1.5 pr-3 text-right text-ink-2">
                      {fmtNum(it.totalQty)} {it.unit}
                    </td>
                    <td className="tabular py-1.5 text-right text-ink-2">{fmtPct(it.totalQty ? (it.installedQty / it.totalQty) * 100 : 0, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Section title="Tasks completed" subtitle="Finished during this period">
              <TaskRows tasks={data.tasksCompleted} empty="No tasks were completed this week." />
            </Section>
            <Section title="Tasks in progress" subtitle={`As of ${fmtDate(data.to)}`}>
              <TaskRows tasks={data.tasksInProgress} empty="No tasks in progress." />
            </Section>
            <Section title="Late or behind schedule" subtitle="Needs attention">
              <TaskRows tasks={data.lateTasks} empty="Nothing is late or behind." showPlanned />
            </Section>
            <Section title="Planned for next week" subtitle={`${fmtDate(addDays(data.to, 1))} – ${fmtDate(addDays(data.to, 7))}`}>
              <TaskRows tasks={data.tasksNextWeek} empty="No tasks planned to run next week." />
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Section title="Issues" subtitle={`${data.issuesRaised.length} raised · ${data.issuesResolved.length} resolved · ${data.issuesOpen.length} open`}>
              <IssueRows issues={data.issuesOpen} label="Open" />
              <IssueRows issues={data.issuesResolved} label="Resolved this week" />
              {data.issuesOpen.length === 0 && data.issuesResolved.length === 0 && <Empty>No open issues and none resolved this week.</Empty>}
            </Section>
            <Section title="To-do" subtitle={`${data.todosDone.length} completed · ${data.todosOpen.length} open`}>
              <TodoRows todos={data.todosOpen} label="Open" today={data.to} />
              <TodoRows todos={data.todosDone} label="Completed this week" today={data.to} />
              {data.todosOpen.length === 0 && data.todosDone.length === 0 && <Empty>No to-dos.</Empty>}
            </Section>
          </div>
        </article>
      )}
    </div>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'critical' }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={cls('mt-0.5 text-2xl font-semibold', tone === 'critical' ? 'text-critical-text' : 'text-ink')}>{value}</div>
      {sub && <div className="text-xs text-ink-3">{sub}</div>}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="print-break rounded-xl border border-line bg-white px-5 py-4">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {subtitle && <p className="mb-3 text-xs text-ink-3">{subtitle}</p>}
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-ink-3">{children}</p>
}

function TaskRows({ tasks, empty, showPlanned }: { tasks: TaskView[]; empty: string; showPlanned?: boolean }) {
  if (tasks.length === 0) return <Empty>{empty}</Empty>
  return (
    <ul className="divide-y divide-line-2">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
          <div className="min-w-0">
            <div className="truncate text-ink">{t.name}</div>
            <div className="truncate text-xs text-ink-3">
              {t.path}
              {t.floor ? ` · ${floorLabel(t.floor)}` : ''}
              {t.pic ? ` · ${t.pic}` : ''} · {fmtDate(t.plannedStart, { year: false })} – {fmtDate(t.plannedFinish, { year: false })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="tabular text-xs text-ink-2">
              {fmtPct(t.percent, 0)}
              {showPlanned ? ` / ${fmtPct(t.plannedPercent, 0)}` : ''}
            </span>
            <TaskStatusBadge status={t.status} late={t.late} behind={t.behind} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function IssueRows({ issues, label }: { issues: Issue[]; label: string }) {
  if (issues.length === 0) return null
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <ul className="divide-y divide-line-2">
        {issues.map((i) => (
          <li key={i.id} className="py-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={severityTone[i.severity]}>{issueSeverityLabel[i.severity]}</Badge>
              <span className="text-ink">
                #{i.id} {i.title}
              </span>
              <span className="text-xs text-ink-3">· {issueStatusLabel[i.status]}{i.owner ? ` · ${i.owner}` : ''}</span>
            </div>
            {i.resolution && <div className="text-xs text-ink-2">Resolution: {i.resolution}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function TodoRows({ todos, label, today }: { todos: Todo[]; label: string; today: string }) {
  if (todos.length === 0) return null
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <ul className="divide-y divide-line-2">
        {todos.map((t) => {
          const overdue = t.status !== 'done' && !!t.dueDate && t.dueDate < today
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className={cls(t.status === 'done' ? 'text-ink-3 line-through' : 'text-ink')}>{t.title}</span>
              <span className={cls('shrink-0 text-xs', overdue ? 'font-medium text-critical-text' : 'text-ink-3')}>
                {t.assignee ? `${t.assignee} · ` : ''}
                {t.dueDate ? `due ${fmtDate(t.dueDate, { year: false })}` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
