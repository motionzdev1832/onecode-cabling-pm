import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Grid3x3, Plus, Search } from 'lucide-react'
import type { ScopeItem, TaskView } from '@shared/types'
import { localToday } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch, useLocalState, useMediaQuery } from '@/lib/hooks'
import { cls, floorLabel, fmtDate, fmtNum, fmtPct } from '@/lib/format'
import { Button, ErrorBanner, Input, Loading, Meter, PageHeader, Segmented, Select, Table, TaskStatusBadge, td, th } from '@/components/ui'
import Gantt from '@/components/Gantt'
import TaskDetail from '@/components/TaskDetail'
import AddTaskModal from '@/components/AddTaskModal'

type View = 'gantt' | 'list'
type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'attention' | 'done'

export default function PlanPage() {
  const { isAdmin } = useAuth()
  const [adding, setAdding] = useState(false)
  const tasks = useFetch<TaskView[]>('/api/tasks')
  const items = useFetch<ScopeItem[]>('/api/scope-items')
  const [view, setView] = useLocalState<View>('plan.view', 'gantt')
  const [zoom, setZoom] = useLocalState<number>('plan.zoom', 14)
  const [collapsedArr, setCollapsedArr] = useLocalState<number[]>('plan.collapsed', [])
  const [floor, setFloor] = useState<'all' | 'FL2' | 'FL3'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const today = localToday()
  const compact = useMediaQuery('(max-width: 639px)')
  const collapsed = useMemo(() => new Set(collapsedArr), [collapsedArr])

  const filtered = useMemo(() => {
    const all = tasks.data ?? []
    const hasFilter = floor !== 'all' || status !== 'all' || q.trim() !== ''
    if (!hasFilter) return all
    const ql = q.trim().toLowerCase()
    const matches = (t: TaskView) => {
      if (floor !== 'all' && t.floor !== floor) return false
      if (status === 'attention' ? !(t.late || t.behind) : status !== 'all' && t.status !== status) return false
      if (ql && !t.name.toLowerCase().includes(ql) && !t.path.toLowerCase().includes(ql)) return false
      return true
    }
    const keep = new Set<number>()
    const byId = new Map(all.map((t) => [t.id, t]))
    for (const t of all) {
      if (t.hasChildren || !matches(t)) continue
      let cur: TaskView | undefined = t
      while (cur) {
        keep.add(cur.id)
        cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined
      }
    }
    return all.filter((t) => keep.has(t.id))
  }, [tasks.data, floor, status, q])

  const toggle = (id: number) => setCollapsedArr((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const summaries = (tasks.data ?? []).filter((t) => t.hasChildren && t.parentId !== null).map((t) => t.id)
  const root = tasks.data?.find((t) => t.parentId === null)

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
        <Select value={floor} onChange={(e) => setFloor(e.target.value as typeof floor)} className="w-32">
          <option value="all">All floors</option>
          <option value="FL2">Floor 2</option>
          <option value="FL3">Floor 3</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="w-40">
          <option value="all">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="attention">Late or behind</option>
          <option value="done">Done</option>
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

      {tasks.error && <ErrorBanner message={tasks.error} onRetry={tasks.reload} />}
      {tasks.loading && !tasks.data && <Loading />}

      {tasks.data && view === 'gantt' && (
        <div className={cls(tasks.refreshing && 'opacity-60')}>
          <Gantt tasks={filtered} today={today} collapsed={collapsed} onToggle={toggle} onSelect={(t) => setSelected(t.id)} selectedId={selected} pxPerDay={zoom} compact={compact} />
          <p className="mt-2 text-xs text-ink-3">Bars show the planned window with the filled portion as actual progress. The thin dark line under a bar is the actual start to finish. Click a task for details.</p>
        </div>
      )}

      {tasks.data && view === 'list' && (
        <div className={cls('rounded-xl border border-line bg-white px-4 sm:px-5', tasks.refreshing && 'opacity-60')}>
          <Table>
            <thead>
              <tr>
                <th className={th}>Task</th>
                <th className={th}>Floor</th>
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
                  <td className={cls(td, t.hasChildren && 'font-semibold')} style={{ paddingLeft: 16 + Math.min(t.level, 4) * 16 }}>
                    {t.name}
                  </td>
                  <td className={cls(td, 'text-ink-2')}>{floorLabel(t.floor)}</td>
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
    </div>
  )
}
