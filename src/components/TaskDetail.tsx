import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import type { DailyLog, ScopeItem, TaskView } from '@shared/types'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { cls, floorLabel, fmtDate, fmtNum, fmtPct } from '@/lib/format'
import { Button, ErrorBanner, Field, Input, Loading, Meter, Modal, Select, TaskStatusBadge, Textarea } from './ui'

interface Props {
  taskId: number | null
  scopeItems: ScopeItem[]
  onClose: () => void
  onChanged: () => void
}

type Form = {
  name: string
  floor: '' | 'FL2' | 'FL3'
  plannedStart: string
  plannedFinish: string
  durationDays: string
  actualStart: string
  actualFinish: string
  manualPercent: string
  notes: string
}

export default function TaskDetail({ taskId, scopeItems, onClose, onChanged }: Props) {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFetch<{ task: TaskView; logs: DailyLog[] }>(taskId ? `/api/tasks/${taskId}` : null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [targets, setTargets] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setEditing(false)
    setErr(null)
  }, [taskId])

  useEffect(() => {
    if (!data) return
    const t = data.task
    setForm({
      name: t.name,
      floor: t.floor ?? '',
      plannedStart: t.plannedStart,
      plannedFinish: t.plannedFinish,
      durationDays: String(t.durationDays),
      actualStart: t.actualStart ?? '',
      actualFinish: t.actualFinish ?? '',
      manualPercent: t.manualPercent === null ? '' : String(t.manualPercent),
      notes: t.notes ?? '',
    })
    const tg: Record<number, string> = {}
    for (const x of t.targets) tg[x.scopeItemId] = String(x.targetQty)
    setTargets(tg)
  }, [data])

  const task = data?.task
  const itemName = (id: number) => scopeItems.find((s) => s.id === id)?.name ?? `Item ${id}`
  const itemUnit = (id: number) => scopeItems.find((s) => s.id === id)?.unit ?? ''

  const save = async () => {
    if (!task || !form) return
    setSaving(true)
    setErr(null)
    try {
      await api.put(`/api/tasks/${task.id}`, {
        name: form.name,
        floor: form.floor || null,
        plannedStart: form.plannedStart,
        plannedFinish: form.plannedFinish,
        durationDays: Number(form.durationDays),
        actualStart: form.actualStart || null,
        actualFinish: form.actualFinish || null,
        manualPercent: task.hasChildren || task.method === 'quantity' ? undefined : form.manualPercent === '' ? null : Number(form.manualPercent),
        notes: form.notes || null,
      })
      if (!task.hasChildren) {
        const list = scopeItems.map((s) => ({ scopeItemId: s.id, targetQty: Number(targets[s.id] || 0) }))
        await api.put(`/api/tasks/${task.id}/targets`, list)
      }
      setEditing(false)
      await reload()
      onChanged()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const markDone = async () => {
    if (!task) return
    setSaving(true)
    setErr(null)
    try {
      const today = new Date()
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      await api.put(`/api/tasks/${task.id}`, { actualFinish: iso, actualStart: task.actualStart ?? iso, manualPercent: task.method === 'manual' ? 100 : undefined })
      await reload()
      onChanged()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={taskId !== null}
      onClose={onClose}
      title={task ? task.name : 'Task'}
      wide
      footer={
        isAdmin && task ? (
          editing ? (
            <>
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" onClick={save} loading={saving}>
                Save changes
              </Button>
            </>
          ) : (
            <>
              {!task.hasChildren && task.status !== 'done' && (
                <Button onClick={markDone} loading={saving}>
                  Mark complete
                </Button>
              )}
              {!task.hasChildren && (
                <Button onClick={() => navigate(`/log?task=${task.id}&new=1`)}>
                  <ClipboardList className="h-4 w-4" /> Log progress
                </Button>
              )}
              <Button variant="primary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          )
        ) : undefined
      }
    >
      {loading && !data && <Loading />}
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {err && (
        <div className="mb-3">
          <ErrorBanner message={err} />
        </div>
      )}
      {task && form && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            {task.path && <span>{task.path}</span>}
            {task.floor && <span>· {floorLabel(task.floor)}</span>}
            <TaskStatusBadge status={task.status} late={task.late} behind={task.behind} />
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-ink">
                {fmtPct(task.percent)} complete
                <span className="ml-2 text-xs font-normal text-ink-3">
                  {task.method === 'quantity' ? 'by installed quantity' : task.method === 'manual' ? 'manual estimate' : 'rolled up from sub-tasks'}
                </span>
              </span>
              <span className="text-xs text-ink-3">Planned {fmtPct(task.plannedPercent)} as of today</span>
            </div>
            <Meter value={task.percent} tone={task.status === 'done' ? 'good' : task.late ? 'critical' : task.behind ? 'serious' : 'accent'} marker={task.plannedPercent} />
          </div>

          {!editing ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              <Info label="Planned start" value={fmtDate(task.plannedStart)} />
              <Info label="Planned finish" value={fmtDate(task.plannedFinish)} />
              <Info label="Duration" value={`${fmtNum(task.durationDays)} days`} />
              <Info label="Floor" value={floorLabel(task.floor)} />
              <Info label="Actual start" value={fmtDate(task.actualStart)} />
              <Info label="Actual finish" value={fmtDate(task.actualFinish)} />
              {task.notes && (
                <div className="col-span-2 sm:col-span-4">
                  <div className="text-xs text-ink-3">Notes</div>
                  <div className="whitespace-pre-wrap text-ink">{task.notes}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Task name" className="sm:col-span-2">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Floor">
                <Select value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value as Form['floor'] })}>
                  <option value="">—</option>
                  <option value="FL2">Floor 2</option>
                  <option value="FL3">Floor 3</option>
                </Select>
              </Field>
              <Field label="Duration (days)" hint="Used as the weight in roll-ups">
                <Input type="number" min={0.5} step={0.5} value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} disabled={task.hasChildren} />
              </Field>
              <Field label="Planned start">
                <Input type="date" value={form.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.target.value })} disabled={task.hasChildren} />
              </Field>
              <Field label="Planned finish">
                <Input type="date" value={form.plannedFinish} onChange={(e) => setForm({ ...form, plannedFinish: e.target.value })} disabled={task.hasChildren} />
              </Field>
              {!task.hasChildren && (
                <>
                  <Field label="Actual start">
                    <Input type="date" value={form.actualStart} onChange={(e) => setForm({ ...form, actualStart: e.target.value })} />
                  </Field>
                  <Field label="Actual finish" hint="Setting this marks the task complete">
                    <Input type="date" value={form.actualFinish} onChange={(e) => setForm({ ...form, actualFinish: e.target.value })} />
                  </Field>
                  {task.method !== 'quantity' && (
                    <Field label="Manual progress (%)" hint="Only used when the task has no quantity targets">
                      <Input type="number" min={0} max={100} step={1} value={form.manualPercent} onChange={(e) => setForm({ ...form, manualPercent: e.target.value })} />
                    </Field>
                  )}
                </>
              )}
              <Field label="Notes" className="sm:col-span-2">
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>
          )}

          {!task.hasChildren && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Quantity targets</h3>
              {editing ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {scopeItems.map((s) => (
                    <label key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-[13px]">
                      <span className="truncate text-ink-2">{s.name}</span>
                      <Input type="number" min={0} step={1} className="h-8 w-24 text-right" value={targets[s.id] ?? ''} placeholder="0" onChange={(e) => setTargets({ ...targets, [s.id]: e.target.value })} />
                    </label>
                  ))}
                </div>
              ) : task.targets.length === 0 ? (
                <p className="text-[13px] text-ink-3">No quantity targets yet. {isAdmin ? 'Edit the task or use Plan › Quantities to allocate scope quantities to this task.' : ''}</p>
              ) : (
                <div className="divide-y divide-line-2 rounded-lg border border-line">
                  {task.targets.map((tg) => {
                    const pct = tg.targetQty > 0 ? (Math.min(tg.doneQty, tg.targetQty) / tg.targetQty) * 100 : 0
                    return (
                      <div key={tg.scopeItemId} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                        <span className="w-40 shrink-0 truncate text-ink">{itemName(tg.scopeItemId)}</span>
                        <Meter value={pct} thin className="flex-1" tone={pct >= 100 ? 'good' : 'accent'} />
                        <span className="tabular w-32 shrink-0 text-right text-ink-2">
                          {fmtNum(tg.doneQty)} / {fmtNum(tg.targetQty)} {itemUnit(tg.scopeItemId)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {data && data.logs.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Progress log</h3>
              <div className="divide-y divide-line-2 rounded-lg border border-line">
                {data.logs.slice(0, 10).map((l) => (
                  <div key={l.id} className="px-3 py-2 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">{fmtDate(l.logDate, { weekday: true })}</span>
                      {l.manpower !== null && <span className="text-ink-3">{l.manpower} workers</span>}
                    </div>
                    <div className={cls('text-ink-2', l.items.length === 0 && 'italic text-ink-3')}>
                      {l.items.length === 0 ? 'No quantities' : l.items.map((it) => `${fmtNum(it.qty)} ${itemUnit(it.scopeItemId)} ${itemName(it.scopeItemId)}`).join(' · ')}
                    </div>
                    {l.note && <div className="text-ink-3">{l.note}</div>}
                  </div>
                ))}
                {data.logs.length > 10 && <div className="px-3 py-2 text-xs text-ink-3">{data.logs.length - 10} more entries in Daily log</div>}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  )
}
