import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import type { ScopeItemProgress, TaskView } from '@shared/types'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { cls, fmtNum } from '@/lib/format'
import { Badge, Button, ErrorBanner, Loading, PageHeader, Select } from '@/components/ui'

const key = (taskId: number, itemId: number) => `${taskId}:${itemId}`

export default function AllocationPage() {
  const { isAdmin } = useAuth()
  const tasks = useFetch<TaskView[]>('/api/tasks')
  const items = useFetch<ScopeItemProgress[]>('/api/scope-items')
  const [cells, setCells] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [floor, setFloor] = useState<'all' | 'FL2' | 'FL3'>('all')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null)

  useEffect(() => {
    if (!tasks.data) return
    const next: Record<string, string> = {}
    for (const t of tasks.data) for (const tg of t.targets) next[key(t.id, tg.scopeItemId)] = String(tg.targetQty)
    setCells(next)
    setDirty(new Set())
  }, [tasks.data])

  const leaves = useMemo(() => (tasks.data ?? []).filter((t) => !t.hasChildren && (floor === 'all' || t.floor === floor)), [tasks.data, floor])
  const groups = useMemo(() => {
    const g: { path: string; tasks: TaskView[] }[] = []
    for (const t of leaves) {
      const last = g[g.length - 1]
      if (last && last.path === t.path) last.tasks.push(t)
      else g.push({ path: t.path || 'Project', tasks: [t] })
    }
    return g
  }, [leaves])

  const totals = useMemo(() => {
    const m = new Map<number, number>()
    for (const [k, v] of Object.entries(cells)) {
      const itemId = Number(k.split(':')[1])
      m.set(itemId, (m.get(itemId) ?? 0) + (Number(v) || 0))
    }
    return m
  }, [cells])

  const setCell = (taskId: number, itemId: number, v: string) => {
    const k = key(taskId, itemId)
    setCells((prev) => ({ ...prev, [k]: v }))
    setDirty((prev) => new Set(prev).add(k))
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const body = [...dirty].map((k) => {
        const [taskId, scopeItemId] = k.split(':').map(Number)
        return { taskId, scopeItemId, targetQty: Number(cells[k]) || 0 }
      })
      await api.put('/api/tasks/allocation/bulk', body)
      await Promise.all([tasks.reload(), items.reload()])
      setMsg({ tone: 'good', text: `Saved ${body.length} cell${body.length === 1 ? '' : 's'}` })
    } catch (e) {
      setMsg({ tone: 'critical', text: errorMessage(e) })
    } finally {
      setSaving(false)
    }
  }

  const list = items.data ?? []

  return (
    <div>
      <PageHeader
        title="Quantity allocation"
        description="Split each scope quantity across the leaf tasks that install it. Task progress is then measured as installed ÷ target."
        actions={
          <>
            <Link to="/plan">
              <Button>
                <ChevronLeft className="h-4 w-4" /> Back to plan
              </Button>
            </Link>
            {isAdmin && (
              <Button variant="primary" onClick={save} loading={saving} disabled={dirty.size === 0}>
                Save changes{dirty.size ? ` (${dirty.size})` : ''}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={floor} onChange={(e) => setFloor(e.target.value as typeof floor)} className="w-32">
          <option value="all">All floors</option>
          <option value="FL2">Floor 2</option>
          <option value="FL3">Floor 3</option>
        </Select>
        {msg && <Badge tone={msg.tone}>{msg.text}</Badge>}
        {!isAdmin && <span className="text-xs text-ink-3">Read-only: only an admin can change targets.</span>}
      </div>

      {(tasks.error || items.error) && <ErrorBanner message={tasks.error ?? items.error ?? ''} onRetry={() => void Promise.all([tasks.reload(), items.reload()])} />}
      {(tasks.loading || items.loading) && !(tasks.data && items.data) && <Loading />}

      {tasks.data && items.data && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                <th className="sticky left-0 z-30 min-w-[200px] border-b border-r border-line bg-white px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-3 sm:min-w-[280px]">Task</th>
                {list.map((it) => (
                  <th key={it.id} className="min-w-[96px] border-b border-line px-2 py-2 text-right align-bottom">
                    <div className="text-xs font-medium text-ink">{it.name}</div>
                    <div className="text-[11px] font-normal text-ink-3">
                      Scope {fmtNum(it.totalQty)} {it.unit}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g.path} group={g} items={list} cells={cells} dirty={dirty} editable={isAdmin} setCell={setCell} />
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-white">
              <tr>
                <td className="sticky left-0 z-30 border-t border-r border-line bg-white px-3 py-2 font-medium text-ink">Allocated / scope</td>
                {list.map((it) => {
                  const a = totals.get(it.id) ?? 0
                  const diff = a - it.totalQty
                  const tone = Math.abs(diff) < 0.001 ? 'text-good-text' : diff > 0 ? 'text-critical-text' : 'text-warn-text'
                  return (
                    <td key={it.id} className={cls('tabular border-t border-line px-2 py-2 text-right font-medium', tone)}>
                      {fmtNum(a)} / {fmtNum(it.totalQty)}
                      <div className="text-[11px] font-normal">{Math.abs(diff) < 0.001 ? 'fully allocated' : diff > 0 ? `${fmtNum(diff)} over` : `${fmtNum(-diff)} left`}</div>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function GroupRows({ group, items, cells, dirty, editable, setCell }: { group: { path: string; tasks: TaskView[] }; items: ScopeItemProgress[]; cells: Record<string, string>; dirty: Set<string>; editable: boolean; setCell: (t: number, i: number, v: string) => void }) {
  return (
    <>
      <tr>
        <td colSpan={items.length + 1} className="sticky left-0 border-b border-line-2 bg-plane px-3 py-1.5 text-xs font-semibold text-ink-2">
          {group.path}
        </td>
      </tr>
      {group.tasks.map((t) => (
        <tr key={t.id} className="hover:bg-plane/60">
          <td className="sticky left-0 z-10 border-b border-r border-line-2 bg-white px-3 py-1 text-ink">
            <div className="truncate" title={t.name}>
              {t.name}
            </div>
          </td>
          {items.map((it) => {
            const k = key(t.id, it.id)
            const v = cells[k] ?? ''
            const done = t.targets.find((x) => x.scopeItemId === it.id)?.doneQty ?? 0
            return (
              <td key={it.id} className={cls('border-b border-line-2 px-1 py-1 text-right', dirty.has(k) && 'bg-warn-soft/60')}>
                {editable ? (
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={v}
                    placeholder="·"
                    onChange={(e) => setCell(t.id, it.id, e.target.value)}
                    className="tabular h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-right text-ink hover:border-line focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20 placeholder:text-ink-3"
                    title={done ? `${fmtNum(done)} installed so far` : undefined}
                  />
                ) : (
                  <span className={cls('tabular block px-2', !v && 'text-ink-3')}>{v ? fmtNum(Number(v)) : '·'}</span>
                )}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
