import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import type { DailyLog, ScopeItem, TaskView } from '@shared/types'
import { addDays } from '@shared/dates'
import { api, errorMessage, localToday } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { cls, fmtDate, fmtNum, floorLabel } from '@/lib/format'
import { Button, ConfirmDialog, EmptyState, ErrorBanner, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '@/components/ui'
import TaskPicker from '@/components/TaskPicker'

type LogRow = DailyLog & { taskName: string }
type Range = '7' | '30' | 'all'

export default function DailyLogPage() {
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const [range, setRange] = useState<Range>('30')
  const [taskFilter, setTaskFilter] = useState<number | null>(null)
  const today = localToday()
  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (range !== 'all') p.set('from', addDays(today, -(Number(range) - 1)))
    if (taskFilter) p.set('taskId', String(taskFilter))
    p.set('limit', '500')
    return `/api/logs?${p.toString()}`
  }, [range, taskFilter, today])
  const logs = useFetch<LogRow[]>(query)
  const tasks = useFetch<TaskView[]>('/api/tasks')
  const items = useFetch<ScopeItem[]>('/api/scope-items')

  const [editing, setEditing] = useState<LogRow | 'new' | null>(null)
  const [presetTask, setPresetTask] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<LogRow | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (params.get('new') === '1' && isAdmin) {
      setPresetTask(params.get('task') ? Number(params.get('task')) : null)
      setEditing('new')
      setParams({}, { replace: true })
    }
  }, [params, setParams, isAdmin])

  const byDate = useMemo(() => {
    const m = new Map<string, LogRow[]>()
    for (const l of logs.data ?? []) {
      const arr = m.get(l.logDate) ?? []
      arr.push(l)
      m.set(l.logDate, arr)
    }
    return [...m.entries()]
  }, [logs.data])

  const taskById = useMemo(() => new Map((tasks.data ?? []).map((t) => [t.id, t])), [tasks.data])
  const itemById = useMemo(() => new Map((items.data ?? []).map((i) => [i.id, i])), [items.data])

  const afterChange = async () => {
    await Promise.all([logs.reload(), tasks.reload()])
  }

  const doDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await api.del(`/api/logs/${deleting.id}`)
      setDeleting(null)
      await afterChange()
    } catch (e) {
      alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Daily log"
        description="Installed quantities and manpower, recorded per task per day"
        actions={
          isAdmin && (
            <Button
              variant="primary"
              onClick={() => {
                setPresetTask(null)
                setEditing('new')
              }}
            >
              <Plus className="h-4 w-4" /> New entry
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="w-36">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="all">All entries</option>
        </Select>
        <div className="w-full sm:w-80">
          <TaskPicker tasks={tasks.data ?? []} value={taskFilter} onChange={setTaskFilter} placeholder="All tasks" />
        </div>
      </div>

      {logs.error && <ErrorBanner message={logs.error} onRetry={logs.reload} />}
      {logs.loading && !logs.data && <Loading />}
      {logs.data && logs.data.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title="No entries in this range"
          description={isAdmin ? 'Record what was installed today: pick the task, enter the quantities and the number of workers.' : 'Nothing has been logged for this range yet.'}
          action={
            isAdmin && (
              <Button variant="primary" onClick={() => setEditing('new')}>
                <Plus className="h-4 w-4" /> New entry
              </Button>
            )
          }
        />
      )}

      <div className={cls('space-y-5', logs.refreshing && 'opacity-60')}>
        {byDate.map(([date, rows]) => {
          const manpower = rows.reduce((s, r) => s + (r.manpower ?? 0), 0)
          return (
            <section key={date}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-ink">{fmtDate(date, { weekday: true })}</h2>
                <span className="text-xs text-ink-3">
                  {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                  {manpower ? ` · ${manpower} workers` : ''}
                </span>
              </div>
              <div className="divide-y divide-line-2 rounded-xl border border-line bg-white">
                {rows.map((l) => {
                  const t = taskById.get(l.taskId)
                  return (
                    <div key={l.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink">{l.taskName}</div>
                        {t && (
                          <div className="truncate text-xs text-ink-3">
                            {t.path}
                            {t.floor ? ` · ${floorLabel(t.floor)}` : ''}
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {l.items.length === 0 && <span className="text-xs italic text-ink-3">No quantities</span>}
                          {l.items.map((it) => (
                            <span key={it.scopeItemId} className="rounded-md bg-accent-wash px-1.5 py-0.5 text-xs text-accent-2">
                              <span className="tabular font-semibold">{fmtNum(it.qty)}</span> {itemById.get(it.scopeItemId)?.unit ?? ''} {itemById.get(it.scopeItemId)?.name ?? `Item ${it.scopeItemId}`}
                            </span>
                          ))}
                          {l.manpower !== null && <span className="rounded-md bg-plane px-1.5 py-0.5 text-xs text-ink-2">{l.manpower} workers</span>}
                        </div>
                        {l.note && <div className="mt-1 text-[13px] text-ink-2">{l.note}</div>}
                        <div className="mt-1 text-[11px] text-ink-3">{l.createdByName ? `by ${l.createdByName}` : ''}</div>
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-plane hover:text-ink" onClick={() => setEditing(l)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-critical-soft hover:text-critical-text" onClick={() => setDeleting(l)} aria-label="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {editing && tasks.data && items.data && (
        <LogForm
          initial={editing === 'new' ? null : editing}
          presetTask={presetTask}
          tasks={tasks.data}
          items={items.data}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await afterChange()
          }}
        />
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={busy} title="Delete log entry" message={deleting ? `Delete the entry for ${fmtDate(deleting.logDate)} on "${deleting.taskName}"? Installed quantities from this entry will be removed.` : ''} />
    </div>
  )
}

function LogForm({ initial, presetTask, tasks, items, onClose, onSaved }: { initial: DailyLog | null; presetTask: number | null; tasks: TaskView[]; items: ScopeItem[]; onClose: () => void; onSaved: () => void }) {
  const [logDate, setLogDate] = useState(initial?.logDate ?? localToday())
  const [taskId, setTaskId] = useState<number | null>(initial?.taskId ?? presetTask)
  const [qty, setQty] = useState<Record<number, string>>(() => Object.fromEntries((initial?.items ?? []).map((i) => [i.scopeItemId, String(i.qty)])))
  const [extra, setExtra] = useState<number[]>([])
  const [manpower, setManpower] = useState(initial?.manpower === null || initial?.manpower === undefined ? '' : String(initial.manpower))
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const task = taskId ? tasks.find((t) => t.id === taskId) : undefined
  const targetItems = task ? task.targets.map((t) => t.scopeItemId) : []
  const shownItems = useMemo(() => {
    const ids = new Set<number>([...targetItems, ...extra, ...Object.keys(qty).map(Number).filter((k) => qty[k] !== '')])
    return items.filter((i) => ids.has(i.id))
  }, [items, targetItems, extra, qty])
  const addable = items.filter((i) => !shownItems.some((s) => s.id === i.id))

  const submit = async () => {
    if (!taskId) {
      setError('Pick a task')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = {
        logDate,
        taskId,
        manpower: manpower === '' ? null : Number(manpower),
        note: note || null,
        items: Object.entries(qty)
          .filter(([, v]) => v !== '' && Number(v) > 0)
          .map(([k, v]) => ({ scopeItemId: Number(k), qty: Number(v) })),
      }
      if (initial) await api.put(`/api/logs/${initial.id}`, body)
      else await api.post('/api/logs', body)
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Edit log entry' : 'New log entry'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {initial ? 'Save' : 'Add entry'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          </Field>
          <Field label="Workers on site">
            <Input type="number" min={0} step={1} inputMode="numeric" value={manpower} onChange={(e) => setManpower(e.target.value)} placeholder="e.g. 6" />
          </Field>
        </div>
        <Field label="Task">
          <TaskPicker tasks={tasks} value={taskId} onChange={setTaskId} />
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-2">Installed quantities</span>
            {addable.length > 0 && (
              <Select className="h-8 w-44 text-xs" value="" onChange={(e) => e.target.value && setExtra([...extra, Number(e.target.value)])}>
                <option value="">+ Add another item</option>
                {addable.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          {!task && <p className="text-xs text-ink-3">Pick a task to see its target items.</p>}
          {task && shownItems.length === 0 && <p className="text-xs text-ink-3">This task has no quantity targets yet. Add an item above, or set targets in Plan › Quantities.</p>}
          <div className="space-y-1.5">
            {shownItems.map((it) => {
              const tg = task?.targets.find((t) => t.scopeItemId === it.id)
              const remaining = tg ? Math.max(0, tg.targetQty - tg.doneQty + (initial?.items.find((x) => x.scopeItemId === it.id)?.qty ?? 0)) : null
              return (
                <div key={it.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">{it.name}</div>
                    {tg && (
                      <div className="text-[11px] text-ink-3">
                        {fmtNum(tg.doneQty)} of {fmtNum(tg.targetQty)} done · {fmtNum(remaining ?? 0)} remaining
                      </div>
                    )}
                  </div>
                  <Input type="number" min={0} step={1} inputMode="numeric" className="h-8 w-24 text-right" placeholder="0" value={qty[it.id] ?? ''} onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })} />
                  <span className="w-6 text-xs text-ink-3">{it.unit}</span>
                </div>
              )
            })}
          </div>
        </div>
        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done, blockers, remarks" />
        </Field>
      </div>
    </Modal>
  )
}
