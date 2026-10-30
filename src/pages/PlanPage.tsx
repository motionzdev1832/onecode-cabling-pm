import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, FileDown, FolderInput, Grid3x3, Plus, Search } from 'lucide-react'
import { FLOORS, type Floor, type ScopeItem, type TaskView } from '@shared/types'
import { api, errorMessage, localToday } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch, useLocalState, useMediaQuery } from '@/lib/hooks'
import { filterPlanTasks } from '@/lib/planFilter'
import { stepTarget } from '@/lib/planOrder'
import { cls, floorLabel, fmtDate, fmtNum, fmtPct } from '@/lib/format'
import { Button, ErrorBanner, IconButton, Input, Loading, Meter, PageHeader, Segmented, Select, Table, TaskStatusBadge, td, th } from '@/components/ui'
import Gantt from '@/components/Gantt'
import TaskDetail from '@/components/TaskDetail'
import AddTaskModal from '@/components/AddTaskModal'
import MoveTaskModal from '@/components/MoveTaskModal'

type View = 'gantt' | 'list'
type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'attention' | 'done'

export default function PlanPage() {
  const { isAdmin } = useAuth()
  const [adding, setAdding] = useState(false)
  const [reorder, setReorder] = useState(false)
  const [movingId, setMovingId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [moveErr, setMoveErr] = useState<string | null>(null)
  const tasks = useFetch<TaskView[]>('/api/tasks')
  const items = useFetch<ScopeItem[]>('/api/scope-items')
  const [view, setView] = useLocalState<View>('plan.view', 'gantt')
  const [zoom, setZoom] = useLocalState<number>('plan.zoom', 14)
  const [collapsedArr, setCollapsedArr] = useLocalState<number[]>('plan.collapsed', [])
  const [floor, setFloor] = useState<'all' | Floor>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [q, setQ] = useState('')
  const [pic, setPic] = useState<string>('all')
  const [selected, setSelected] = useState<number | null>(null)
  const today = localToday()
  const compact = useMediaQuery('(max-width: 639px)')
  const collapsed = useMemo(() => new Set(collapsedArr), [collapsedArr])

  const all = useMemo(() => tasks.data ?? [], [tasks.data])
  const filtered = useMemo(() => filterPlanTasks(all, { floor, status, q, pic }), [all, floor, status, q, pic])
  const exportPdf = () => {
    const p = new URLSearchParams({ floor, status, pic, q, auto: '1' })
    window.open(`/plan/print?${p.toString()}`, '_blank', 'noopener')
  }
  const pics = useMemo(() => [...new Set(all.map((t) => t.pic).filter((p): p is string => !!p))].sort(), [all])

  const toggle = (id: number) => setCollapsedArr((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const summaries = all.filter((t) => t.hasChildren && t.parentId !== null).map((t) => t.id)
  const root = all.find((t) => t.parentId === null)

  // Reorder mode (admin): nudge a task past its nearest visible sibling; the server returns the refreshed list.
  const step = async (t: TaskView, dir: 'up' | 'down') => {
    const target = stepTarget(all, filtered, t, dir)
    if (!target) return
    setBusyId(t.id)
    setMoveErr(null)
    try {
      tasks.setData(await api.put<TaskView[]>(`/api/tasks/${t.id}/move`, target))
    } catch (e) {
      setMoveErr(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }
  const reordering = isAdmin && reorder
  const controls = reordering
    ? (t: TaskView) =>
        t.parentId === null ? null : (
          <span className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <IconButton label="Move up" disabled={busyId !== null || !stepTarget(all, filtered, t, 'up')} onClick={() => void step(t, 'up')}>
              <ArrowUp className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Move down" disabled={busyId !== null || !stepTarget(all, filtered, t, 'down')} onClick={() => void step(t, 'down')}>
              <ArrowDown className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Move to…" disabled={busyId !== null} onClick={() => setMovingId(t.id)}>
              <FolderInput className="h-3.5 w-3.5" />
            </IconButton>
          </span>
        )
    : undefined

  return (
    <div>
      <PageHeader
        title="Plan"
        description={root ? `Baseline ${fmtDate(root.plannedStart)} – ${fmtDate(root.plannedFinish)} · ${fmtPct(root.percent)} complete, ${fmtPct(root.plannedPercent)} planned` : undefined}
        actions={
          <>
            {isAdmin && (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add task
              </Button>
            )}
            {isAdmin && (
              <Button variant={reorder ? 'primary' : 'secondary'} aria-pressed={reorder} onClick={() => setReorder((v) => !v)} title="Move tasks up or down, or under another task">
                {reorder ? <Check className="h-4 w-4" /> : <ArrowUpDown className="h-4 w-4" />} {reorder ? 'Done' : 'Reorder'}
              </Button>
            )}
            <Button onClick={exportPdf} title="Opens a print view; choose Save as PDF">
              <FileDown className="h-4 w-4" /> Export PDF
            </Button>
            <Link to="/plan/quantities">
              <Button>
                <Grid3x3 className="h-4 w-4" /> Quantities
              </Button>
            </Link>
            <Segmented value={view} onChange={setView} options={[{ value: 'gantt', label: 'Gantt' }, { value: 'list', label: 'List' }]} />
          </>
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className="w-48 pl-8" />
        </div>
        <Select value={floor} onChange={(e) => setFloor(e.target.value as typeof floor)} className="w-40">
          <option value="all">All floors</option>
          {FLOORS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="w-40">
          <option value="all">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="attention">Late or behind</option>
          <option value="done">Done</option>
        </Select>
        <Select value={pic} onChange={(e) => setPic(e.target.value)} className="w-40">
          <option value="all">All PICs</option>
          <option value="">No PIC assigned</option>
          {pics.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        {view === 'gantt' && (
          <>
            <Segmented value={String(zoom)} onChange={(v) => setZoom(Number(v))} options={[{ value: '8', label: 'Month' }, { value: '14', label: 'Week' }, { value: '28', label: 'Day' }]} />
            <Button size="sm" variant="ghost" onClick={() => setCollapsedArr(collapsedArr.length ? [] : summaries)}>
              {collapsedArr.length ? 'Expand all' : 'Collapse all'}
            </Button>
          </>
        )}
      </div>

      {reordering && (
        <div className="no-print mb-3 rounded-lg border border-accent-soft bg-accent-wash px-3 py-2 text-[13px] text-accent-2">
          Reorder mode: the arrows move a task up or down among its siblings (sub-tasks move with it). The folder button moves it under another task or to an exact position.
        </div>
      )}
      {moveErr && (
        <div className="mb-3">
          <ErrorBanner message={moveErr} />
        </div>
      )}

      {tasks.error && <ErrorBanner message={tasks.error} onRetry={tasks.reload} />}
      {tasks.loading && !tasks.data && <Loading />}

      {tasks.data && view === 'gantt' && (
        <div className={cls(tasks.refreshing && 'opacity-60')}>
          <Gantt tasks={filtered} today={today} collapsed={collapsed} onToggle={toggle} onSelect={(t) => setSelected(t.id)} selectedId={selected} pxPerDay={zoom} compact={compact} rowEnd={controls} />
          <p className="mt-2 text-xs text-ink-3">Bars show the planned window with the filled portion as actual progress. The thin dark line under a bar is the actual start to finish. Click a task for details.</p>
        </div>
      )}

      {tasks.data && view === 'list' && (
        <div className={cls('rounded-xl border border-line bg-white px-4 sm:px-5', tasks.refreshing && 'opacity-60')}>
          <Table>
            <thead>
              <tr>
                {controls && <th className={cls(th, 'w-px px-2 sm:px-3')} aria-label="Reorder" />}
                <th className={cls(th, 'min-w-[220px]')}>Task</th>
                <th className={th}>Floor</th>
                <th className={th}>PIC</th>
                <th className={th}>Planned</th>
                <th className={cls(th, 'text-right')}>Days</th>
                <th className={cls(th, 'w-48')}>Progress</th>
                <th className={cls(th, 'text-right')}>Planned %</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-plane" onClick={() => setSelected(t.id)}>
                  {controls && <td className={cls(td, 'w-px whitespace-nowrap px-2 py-1.5 sm:px-3')}>{controls(t)}</td>}
                  <td className={cls(td, t.hasChildren && 'font-semibold')} style={{ paddingLeft: 16 + Math.min(t.level, 4) * 16 }}>
                    {t.name}
                  </td>
                  <td className={cls(td, 'text-ink-2')}>{floorLabel(t.floor)}</td>
                  <td className={cls(td, 'text-ink-2')}>{t.pic ?? '—'}</td>
                  <td className={cls(td, 'whitespace-nowrap text-ink-2')}>
                    {fmtDate(t.plannedStart, { year: false })} – {fmtDate(t.plannedFinish, { year: false })}
                  </td>
                  <td className={cls(td, 'tabular text-right text-ink-2')}>{fmtNum(t.durationDays)}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <Meter value={t.percent} thin tone={t.status === 'done' ? 'good' : t.late ? 'critical' : t.behind ? 'serious' : 'accent'} marker={t.plannedPercent} />
                      <span className="tabular w-12 text-right text-xs text-ink-2">{fmtPct(t.percent, 0)}</span>
                    </div>
                  </td>
                  <td className={cls(td, 'tabular text-right text-ink-2')}>{fmtPct(t.plannedPercent, 0)}</td>
                  <td className={td}>
                    <TaskStatusBadge status={t.status} late={t.late} behind={t.behind} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <TaskDetail taskId={selected} scopeItems={items.data ?? []} onClose={() => setSelected(null)} onChanged={() => void tasks.reload()} />
      {adding && (
        <AddTaskModal
          onClose={() => setAdding(false)}
          onSaved={async (t) => {
            setAdding(false)
            await tasks.reload()
            setSelected(t.id)
          }}
        />
      )}
      {movingId !== null && (
        <MoveTaskModal
          taskId={movingId}
          onClose={() => setMovingId(null)}
          onMoved={(list) => {
            setMovingId(null)
            tasks.setData(list)
          }}
        />
      )}
    </div>
  )
}
