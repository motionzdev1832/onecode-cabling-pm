import { useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import type { Project, TaskView } from '@shared/types'
import { addDays, daysBetween, toUtcMs } from '@shared/dates'
import { localToday } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import { describePlanFilter, filterPlanTasks, type PlanFilter } from '@/lib/planFilter'
import { cls, fmtDate, fmtDateTime, fmtPct } from '@/lib/format'
import { Button, ErrorBanner, Loading } from '@/components/ui'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Printable plan (A4 landscape): outline table + Gantt scaled to the page width.
 * Opened from Plan › Export PDF; the browser's "Save as PDF" produces the file.
 */
export default function PlanPrintPage() {
  const [params] = useSearchParams()
  const filter: PlanFilter = {
    floor: params.get('floor') ?? 'all',
    status: params.get('status') ?? 'all',
    pic: params.get('pic') ?? 'all',
    q: params.get('q') ?? '',
  }
  const auto = params.get('auto') === '1'
  const today = localToday()
  const tasks = useFetch<TaskView[]>('/api/tasks')
  const project = useFetch<Project>('/api/project')
  const printedOnce = useRef(false)

  // Landscape page for this view only.
  useEffect(() => {
    const el = document.createElement('style')
    el.textContent = '@page { size: A4 landscape; margin: 10mm 10mm 12mm; }'
    document.head.appendChild(el)
    document.title = 'Project plan'
    return () => {
      document.head.removeChild(el)
    }
  }, [])

  const rows = useMemo(() => filterPlanTasks(tasks.data ?? [], filter), [tasks.data, filter.floor, filter.status, filter.pic, filter.q]) // eslint-disable-line react-hooks/exhaustive-deps
  const root = tasks.data?.find((t) => t.parentId === null)

  useEffect(() => {
    if (!auto || printedOnce.current || !tasks.data || !project.data) return
    printedOnce.current = true
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [auto, tasks.data, project.data])

  const scale = useMemo(() => {
    const list = rows.length ? rows : (tasks.data ?? [])
    if (list.length === 0) return null
    let min = list[0].plannedStart
    let max = list[0].plannedFinish
    for (const t of list) {
      if (t.plannedStart < min) min = t.plannedStart
      if (t.plannedFinish > max) max = t.plannedFinish
      if (t.actualFinish && t.actualFinish > max) max = t.actualFinish
    }
    const showToday = today >= addDays(min, -14) && today <= addDays(max, 14)
    if (showToday) {
      if (today < min) min = today
      if (today > max) max = today
    }
    const start = addDays(min, -1)
    const end = addDays(max, 2)
    const days = daysBetween(start, end) + 1
    const months: { label: string; left: number; width: number }[] = []
    let cursor = start
    while (cursor <= end) {
      const d = new Date(toUtcMs(cursor))
      const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
      const segEnd = nextMonth <= end ? addDays(nextMonth, -1) : end
      const left = (daysBetween(start, cursor) / days) * 100
      const width = ((daysBetween(cursor, segEnd) + 1) / days) * 100
      months.push({ label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, left, width })
      cursor = nextMonth
    }
    const pct = (iso: string) => Math.max(0, Math.min(100, (daysBetween(start, iso) / days) * 100))
    return { start, days, months, pct, todayPct: showToday ? pct(today) + 0.5 / days : null }
  }, [rows, tasks.data, today])

  const statusText = (t: TaskView) => (t.status === 'done' ? 'Done' : t.late ? 'Late' : t.behind ? 'Behind' : t.status === 'in_progress' ? 'In progress' : 'Not started')
  const statusClass = (t: TaskView) => (t.status === 'done' ? 'text-good-text' : t.late ? 'text-critical-text font-medium' : t.behind ? 'text-serious-text font-medium' : t.status === 'in_progress' ? 'text-accent-2' : 'text-ink-3')
  const fillClass = (t: TaskView) => (t.hasChildren ? 'bg-ink-2' : t.status === 'done' ? 'bg-accent-2' : t.late ? 'bg-critical' : t.behind ? 'bg-serious' : 'bg-accent')

  const leaf = rows.filter((t) => !t.hasChildren)
  const counts = {
    done: leaf.filter((t) => t.status === 'done').length,
    inProgress: leaf.filter((t) => t.status === 'in_progress').length,
    late: leaf.filter((t) => t.late).length,
    behind: leaf.filter((t) => t.behind && !t.late).length,
  }

  return (
    <div className="min-h-full bg-white text-ink [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-4 py-2">
        <div className="text-[13px] text-ink-2">Print preview · choose <span className="font-medium text-ink">Save as PDF</span> as the destination (landscape is preset)</div>
        <div className="flex gap-2">
          <Link to="/plan">
            <Button>
              <ArrowLeft className="h-4 w-4" /> Back to plan
            </Button>
          </Link>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Save as PDF
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1150px] px-4 py-4 print:max-w-none print:p-0">
        {(tasks.error || project.error) && <ErrorBanner message={tasks.error ?? project.error ?? ''} />}
        {(!tasks.data || !project.data) && !tasks.error && !project.error && <Loading />}

        {tasks.data && project.data && scale && (
          <>
            <header className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-ink/60 pb-2">
              <div>
                <h1 className="text-base font-semibold leading-tight">{project.data.name} · Project plan</h1>
                <div className="text-[11px] text-ink-2">
                  {project.data.client ? `${project.data.client} · ` : ''}
                  Baseline {fmtDate(project.data.plannedStart)} – {fmtDate(project.data.plannedFinish)} · Filter: {describePlanFilter(filter)}
                </div>
              </div>
              <div className="text-right text-[11px] text-ink-2">
                {root && (
                  <div>
                    Overall <span className="font-semibold text-ink">{fmtPct(root.percent)}</span> complete · planned {fmtPct(root.plannedPercent)} as of {fmtDate(today)}
                  </div>
                )}
                <div>
                  {leaf.length} tasks · {counts.done} done · {counts.inProgress} in progress · {counts.late} late · {counts.behind} behind · printed {fmtDateTime(new Date().toISOString())}
                </div>
              </div>
            </header>

            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-2">
              <Legend swatch="bg-accent-soft" label="Planned window" />
              <Legend swatch="bg-accent" label="Actual progress" />
              <Legend swatch="bg-accent-2" label="Done" />
              <Legend swatch="bg-serious" label="Behind plan" />
              <Legend swatch="bg-critical" label="Late" />
              <Legend swatch="bg-ink-2" label="Summary row" />
              {scale.todayPct !== null && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-px bg-accent" /> Today ({fmtDate(today, { year: false })})
                </span>
              )}
            </div>

            <table className="w-full border-collapse text-[10px] leading-tight">
              <colgroup>
                <col style={{ width: '27%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '3.5%' }} />
                <col style={{ width: '4.5%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '37%' }} />
              </colgroup>
              <thead className="[display:table-header-group]">
                <tr className="border-b border-ink/50 text-left text-[9px] uppercase tracking-wide text-ink-2">
                  <th className="py-1 pr-1 font-medium">Task</th>
                  <th className="py-1 pr-1 font-medium">PIC</th>
                  <th className="py-1 pr-1 font-medium">Start</th>
                  <th className="py-1 pr-1 font-medium">Finish</th>
                  <th className="py-1 pr-1 text-right font-medium">Days</th>
                  <th className="py-1 pr-1 text-right font-medium">Done</th>
                  <th className="py-1 pr-1 font-medium">Status</th>
                  <th className="p-0 font-medium normal-case tracking-normal">
                    <div className="relative h-5">
                      {scale.months.map((m) => (
                        <div key={m.label} className="absolute top-0 h-full overflow-hidden whitespace-nowrap border-l border-line pl-1 text-[9px] leading-5 text-ink-2" style={{ left: `${m.left}%`, width: `${m.width}%` }}>
                          {m.width > 6 ? m.label : ''}
                        </div>
                      ))}
                      {scale.todayPct !== null && <div className="absolute top-0 h-full w-px bg-accent" style={{ left: `${scale.todayPct}%` }} />}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const left = scale.pct(t.plannedStart)
                  const width = Math.max(0.4, ((daysBetween(t.plannedStart, t.plannedFinish) + 1) / scale.days) * 100)
                  return (
                    <tr key={t.id} className="break-inside-avoid border-b border-line-2">
                      <td className={cls('py-[3px] pr-1 align-middle', t.hasChildren && 'font-semibold')} style={{ paddingLeft: 2 + Math.min(t.level, 5) * 10 }}>
                        {t.name}
                      </td>
                      <td className="py-[3px] pr-1 align-middle text-ink-2">{t.pic ?? ''}</td>
                      <td className="tabular py-[3px] pr-1 align-middle whitespace-nowrap">{fmtDate(t.plannedStart, { year: false })}</td>
                      <td className="tabular py-[3px] pr-1 align-middle whitespace-nowrap">{fmtDate(t.plannedFinish, { year: false })}</td>
                      <td className="tabular py-[3px] pr-1 text-right align-middle">{t.durationDays}</td>
                      <td className="tabular py-[3px] pr-1 text-right align-middle">{Math.round(t.percent)}%</td>
                      <td className={cls('py-[3px] pr-1 align-middle whitespace-nowrap', statusClass(t))}>{statusText(t)}</td>
                      <td className="p-0 align-middle">
                        <div className="relative h-[15px]">
                          {scale.months.map((m) => (
                            <div key={m.label} className="absolute top-0 h-full border-l border-line-2" style={{ left: `${m.left}%` }} />
                          ))}
                          {scale.todayPct !== null && <div className="absolute top-0 h-full w-px bg-accent/70" style={{ left: `${scale.todayPct}%` }} />}
                          <div className={cls('absolute rounded-[2px]', t.hasChildren ? 'top-[5px] h-[5px] bg-line' : 'top-[3px] h-[9px] bg-accent-soft')} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}>
                            <div className={cls('h-full rounded-[2px]', fillClass(t))} style={{ width: `${Math.min(100, t.percent)}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <p className="mt-2 text-[9px] text-ink-3">
              Done % = installed quantity ÷ target for tasks with quantity targets, manual estimate otherwise; summary rows are duration-weighted. Planned % assumes even progress across each task's planned window, 7 days a week.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cls('inline-block h-2 w-4 rounded-[2px]', swatch)} /> {label}
    </span>
  )
}
