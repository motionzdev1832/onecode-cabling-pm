import { useEffect, useMemo, useState } from 'react'
import { FLOORS, type Floor, type TaskView } from '@shared/types'
import { daysBetween } from '@shared/dates'
import { api, errorMessage, localToday } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import { Button, ErrorBanner, Field, Input, Loading, Modal, Select } from './ui'

interface Props {
  /** Fix the parent (e.g. "Add sub-task" from a task's detail). Otherwise the user picks one. */
  parentId?: number | null
  onClose: () => void
  onSaved: (task: TaskView) => void
}

/**
 * Adds a task under a parent. Adding under the project root creates a top-level (main) task;
 * adding under any other task makes that task a summary row and the new one its sub-task.
 */
export default function AddTaskModal({ parentId: fixedParent, onClose, onSaved }: Props) {
  const tasks = useFetch<TaskView[]>('/api/tasks')
  const root = useMemo(() => (tasks.data ?? []).find((t) => t.parentId === null) ?? null, [tasks.data])
  const [parentId, setParentId] = useState<number | null>(fixedParent ?? null)
  const [name, setName] = useState('')
  const [floor, setFloor] = useState<'' | Floor>('')
  const [start, setStart] = useState(localToday())
  const [finish, setFinish] = useState(localToday())
  const [duration, setDuration] = useState('1')
  const [touchedFloor, setTouchedFloor] = useState(false)
  const [pic, setPic] = useState('')
  const [touchedPic, setTouchedPic] = useState(false)
  const pics = useFetch<string[]>('/api/tasks/pics')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Parents on offer: summary rows, the root, and untouched leaf tasks (no targets, not started).
  const parentOptions = useMemo(
    () => (tasks.data ?? []).filter((t) => t.parentId === null || t.hasChildren || (t.targets.length === 0 && t.status === 'not_started')),
    [tasks.data],
  )
  const parent = useMemo(() => (tasks.data ?? []).find((t) => t.id === parentId) ?? null, [tasks.data, parentId])

  useEffect(() => {
    if (parentId === null && root) setParentId(root.id)
  }, [root, parentId])

  // Sensible defaults from the parent: its floor and its planned start.
  useEffect(() => {
    if (!parent) return
    if (!touchedFloor) setFloor(parent.floor ?? '')
    if (!touchedPic) setPic(parent.pic ?? '')
    if (parent.parentId !== null) {
      setStart(parent.plannedStart)
      setFinish(parent.plannedStart)
      setDuration('1')
    }
  }, [parent, touchedFloor, touchedPic])

  const onDates = (s: string, f: string) => {
    setStart(s)
    setFinish(f)
    if (s && f && f >= s) setDuration(String(daysBetween(s, f) + 1))
  }

  const submit = async () => {
    if (!parentId) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.post<TaskView>('/api/tasks', {
        parentId,
        name,
        floor: floor || null,
        durationDays: Number(duration) || 1,
        plannedStart: start,
        plannedFinish: finish,
        pic: pic.trim() || null,
      })
      onSaved(created)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const indent = (t: TaskView) => '  '.repeat(Math.min(t.level, 5))

  return (
    <Modal
      open
      onClose={onClose}
      title={fixedParent && parent ? `Add sub-task under "${parent.name}"` : 'Add task'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim() || !parentId || !start || !finish || finish < start}>
            Add task
          </Button>
        </>
      }
    >
      {tasks.loading && !tasks.data && <Loading />}
      {tasks.error && <ErrorBanner message={tasks.error} onRetry={tasks.reload} />}
      {tasks.data && (
        <div className="space-y-3">
          {error && <ErrorBanner message={error} />}
          {!fixedParent && (
            <Field label="Place under" hint="Under the project = a new main task. Under another task = a sub-task of it (that task becomes a summary row).">
              <Select value={parentId ?? ''} onChange={(e) => setParentId(Number(e.target.value))}>
                {parentOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.parentId === null ? `${t.name} (project, top level)` : `${indent(t)}${t.hasChildren ? '' : '• '}${t.name}`}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Task name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Cabling work from Rack row H to Rack row I" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Planned start">
              <Input type="date" value={start} onChange={(e) => onDates(e.target.value, finish < e.target.value ? e.target.value : finish)} />
            </Field>
            <Field label="Planned finish">
              <Input type="date" value={finish} min={start} onChange={(e) => onDates(start, e.target.value)} />
            </Field>
            <Field label="Duration (days)" hint="Weight in roll-ups; defaults to the date span">
              <Input type="number" min={0.5} step={0.5} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
            <Field label="Floor">
              <Select
                value={floor}
                onChange={(e) => {
                  setTouchedFloor(true)
                  setFloor(e.target.value as typeof floor)
                }}
              >
                <option value="">—</option>
                {FLOORS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="PIC (person in charge)" className="col-span-2">
              <Input
                list="pic-suggestions-add"
                value={pic}
                onChange={(e) => {
                  setTouchedPic(true)
                  setPic(e.target.value)
                }}
                placeholder="Name or team"
              />
              <datalist id="pic-suggestions-add">
                {(pics.data ?? []).map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
          </div>
          {start && finish && finish < start && <p className="text-xs text-critical-text">Planned finish must not be before planned start.</p>}
          <p className="text-xs text-ink-3">
            New tasks start with no quantity targets. After adding, set targets in Plan › Quantities (or edit the task) so progress is measured from the daily log.
          </p>
        </div>
      )}
    </Modal>
  )
}
