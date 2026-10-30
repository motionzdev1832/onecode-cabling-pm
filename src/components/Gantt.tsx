import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { TaskView } from '@shared/types'
import { addDays, daysBetween, toUtcMs } from '@shared/dates'
import { cls, fmtDate, fmtPct, taskStatusLabel } from '@/lib/format'

const ROW_H = 34

/** Row label: drop the repeated "Cabling work from " prefix; the full name stays in the tooltip. */
const shortName = (name: string) => name.replace(/^Cabling work from /i, '')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Props {
  tasks: TaskView[]
  today: string
  collapsed: Set<number>
  onToggle: (id: number) => void
  onSelect: (task: TaskView) => void
  selectedId?: number | null
  pxPerDay?: number
  /** Tighter indentation and label column for phones. */
  compact?: boolean
  /** Replaces the percent figure at the end of the label cell (e.g. reorder controls). */
  rowEnd?: (task: TaskView) => ReactNode
}

interface Tip {
  x: number
  y: number
  task: TaskView
}

export default function Gantt({ tasks, today, collapsed, onToggle, onSelect, selectedId, pxPerDay = 14, compact = false, rowEnd }: Props) {
  const indent = compact ? 8 : 14
  const [tip, setTip] = useState<Tip | null>(null)

  const { rows, start, days, months, weeks } = useMemo(() => {
    const hidden = new Set<number>()
    const byParent = new Map<number | null, TaskView[]>()
    for (const t of tasks) {
      const arr = byParent.get(t.parentId) ?? []
      arr.push(t)
      byParent.set(t.parentId, arr)
    }
    const hide = (id: number) => {
      for (const k of byParent.get(id) ?? []) {
        hidden.add(k.id)
        hide(k.id)
      }
    }
    for (const id of collapsed) hide(id)
    const rows = tasks.filter((t) => !hidden.has(t.id))
    let min = today
    let max = today
    for (const t of tasks) {
      if (t.plannedStart < min) min = t.plannedStart
      if (t.plannedFinish > max) max = t.plannedFinish
      if (t.actualStart && t.actualStart < min) min = t.actualStart
      if (t.actualFinish && t.actualFinish > max) max = t.actualFinish
    }
    const start = addDays(min, -3)
    const end = addDays(max, 4)
    const days = daysBetween(start, end) + 1
    const months: { label: string; offset: number; span: number }[] = []
    const weeks: { label: string; offset: number }[] = []
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i)
      const dt = new Date(toUtcMs(d))
      if (i === 0 || d.endsWith('-01')) months.push({ label: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`, offset: i, span: 0 })
      months[months.length - 1].span++
      if (dt.getUTCDay() === 1) weeks.push({ label: String(dt.getUTCDate()), offset: i })
    }
    return { rows, start, days, months, weeks }
  }, [tasks, collapsed, today])

  const x = (iso: string) => daysBetween(start, iso) * pxPerDay
  const width = days * pxPerDay
  const todayX = x(today)
  const showTip = (e: MouseEvent, task: TaskView) => setTip({ x: e.clientX, y: e.clientY, task })

  return (
    <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
      <div style={{ width: `calc(var(--label-w) + ${width}px)`, ['--label-w' as string]: 'var(--gantt-label-w, 260px)' }} className="[--gantt-label-w:200px] sm:[--gantt-label-w:260px] lg:[--gantt-label-w:320px]">
        {/* Header */}
        <div className="sticky top-0 z-20 flex border-b border-line bg-white">
          <div className="sticky left-0 z-30 flex w-[var(--label-w)] shrink-0 items-end border-r border-line bg-white px-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3" style={{ height: 44 }}>
            Task
          </div>
          <div className="relative shrink-0" style={{ width, height: 44 }}>
            {months.map((m) => (
              <div key={m.offset} className="absolute top-0 h-5 border-l border-line pl-1.5 text-[11px] font-medium leading-5 text-ink-2 whitespace-nowrap overflow-hidden" style={{ left: m.offset * pxPerDay, width: m.span * pxPerDay }}>
                {m.label}
              </div>
            ))}
            {weeks.map((w) => (
              <div key={w.offset} className="absolute top-5 h-6 border-l border-line-2 pl-1 text-[10px] leading-6 text-ink-3" style={{ left: w.offset * pxPerDay }}>
                {w.label}
              </div>
            ))}
            {todayX >= 0 && todayX <= width && (
              <div className="absolute top-[26px] z-10 -translate-x-1/2 rounded bg-accent px-1 text-[10px] font-medium leading-4 text-white" style={{ left: todayX + pxPerDay / 2 }}>
                Today
              </div>
            )}
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {/* weekend shading + today line */}
          <div className="pointer-events-none absolute inset-y-0 left-[var(--label-w)]" style={{ width }}>
            {weeks.map((w) => (
              <div key={w.offset} className="absolute inset-y-0 bg-plane" style={{ left: (w.offset - 2) * pxPerDay, width: pxPerDay * 2 }} />
            ))}
            {todayX >= 0 && todayX <= width && <div className="absolute inset-y-0 w-px bg-accent" style={{ left: todayX + pxPerDay / 2 }} />}
          </div>

          {rows.map((t) => {
            const left = x(t.plannedStart)
            const w = Math.max(pxPerDay, (daysBetween(t.plannedStart, t.plannedFinish) + 1) * pxPerDay)
            const isSummary = t.hasChildren
            const tone = t.status === 'done' ? 'bg-accent-2' : t.late ? 'bg-critical' : t.behind ? 'bg-serious' : 'bg-accent'
            const selected = selectedId === t.id
            return (
              <div key={t.id} className={cls('group flex border-b border-line-2', selected ? 'bg-accent-wash/60' : 'hover:bg-plane/70')} style={{ height: ROW_H }}>
                <div
                  className={cls('sticky left-0 z-10 flex w-[var(--label-w)] shrink-0 cursor-pointer items-center gap-1 border-r border-line pr-2 text-[13px]', selected ? 'bg-accent-wash' : 'bg-white group-hover:bg-plane')}
                  style={{ paddingLeft: 8 + Math.min(t.level, 4) * indent }}
                  onClick={() => onSelect(t)}
                >
                  {isSummary ? (
                    <button
                      type="button"
                      className="-ml-1 rounded p-0.5 text-ink-3 hover:bg-line-2 hover:text-ink"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggle(t.id)
                      }}
                      aria-label={collapsed.has(t.id) ? 'Expand' : 'Collapse'}
                    >
                      {collapsed.has(t.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <span className={cls('min-w-0 flex-1 truncate', isSummary ? 'font-semibold text-ink' : 'text-ink')} title={t.pic ? `${t.name} · PIC ${t.pic}` : t.name}>
                    {shortName(t.name)}
                    {t.pic && <span className="ml-1.5 font-normal text-ink-3">· {t.pic}</span>}
                  </span>
                  {rowEnd ? (
                    rowEnd(t)
                  ) : (
                    <span className={cls('tabular shrink-0 text-[11px]', t.status === 'done' ? 'text-good-text' : t.late ? 'text-critical-text' : t.behind ? 'text-serious-text' : 'text-ink-3')}>{Math.round(t.percent)}%</span>
                  )}
                </div>
                <div className="relative shrink-0" style={{ width }}>
                  <div
                    className={cls('absolute cursor-pointer', isSummary ? 'top-[14px] h-1.5 rounded-sm bg-line' : 'top-[10px] h-3.5 rounded bg-accent-soft')}
                    style={{ left, width: w }}
                    onMouseEnter={(e) => showTip(e, t)}
                    onMouseMove={(e) => showTip(e, t)}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => onSelect(t)}
                  >
                    <div className={cls('h-full rounded-[inherit]', isSummary ? 'bg-ink-2' : tone)} style={{ width: `${Math.min(100, t.percent)}%` }} />
                  </div>
                  {!isSummary && t.actualStart && (
                    <div
                      className="pointer-events-none absolute top-[26px] h-0.5 rounded bg-ink-2"
                      style={{ left: x(t.actualStart), width: Math.max(pxPerDay, (daysBetween(t.actualStart, t.actualFinish ?? (today < t.actualStart ? t.actualStart : today)) + 1) * pxPerDay) }}
                      title="Actual"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {tip && (
        <div className="pointer-events-none fixed z-50 w-64 rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md" style={{ left: Math.min(tip.x + 12, window.innerWidth - 270), top: tip.y + 14 }}>
          <div className="font-medium text-ink">{tip.task.name}</div>
          {tip.task.path && <div className="text-ink-3">{tip.task.path}</div>}
          <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-ink-2">
            <span>Planned</span>
            <span className="text-ink">
              {fmtDate(tip.task.plannedStart, { year: false })} – {fmtDate(tip.task.plannedFinish, { year: false })} · {tip.task.durationDays}d
            </span>
            {tip.task.actualStart && (
              <>
                <span>Actual</span>
                <span className="text-ink">
                  {fmtDate(tip.task.actualStart, { year: false })} – {tip.task.actualFinish ? fmtDate(tip.task.actualFinish, { year: false }) : 'ongoing'}
                </span>
              </>
            )}
            <span>Progress</span>
            <span className="text-ink">
              {fmtPct(tip.task.percent)} actual · {fmtPct(tip.task.plannedPercent)} planned
            </span>
            <span>Status</span>
            <span className="text-ink">{tip.task.late ? 'Late' : tip.task.behind ? 'Behind schedule' : taskStatusLabel[tip.task.status]}</span>
            <span>PIC</span>
            <span className="text-ink">{tip.task.pic ?? '—'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
