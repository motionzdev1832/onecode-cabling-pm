import { useEffect, useMemo, useState } from 'react'
import type { TaskView } from '@shared/types'
import { api, errorMessage } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import { floorLabel } from '@/lib/format'
import { subtreeIds } from '@/lib/planOrder'
import { Button, ErrorBanner, Field, Loading, Modal, Select } from './ui'

interface Props {
  taskId: number
  onClose: () => void
  /** Called with the refreshed task list (outline order) after a successful move. */
  onMoved: (tasks: TaskView[]) => void
}

/** Position value: 'first' or 'after:<sibling id>'. */
const positionOf = (all: TaskView[], task: TaskView): string => {
  const sibs = all.filter((t) => t.parentId === task.parentId)
  const i = sibs.findIndex((t) => t.id === task.id)
  return i > 0 ? `after:${sibs[i - 1].id}` : 'first'
}

/** Move a task (with its sub-tasks) under another parent and/or to another position among its siblings. */
export default function MoveTaskModal({ taskId, onClose, onMoved }: Props) {
  const tasks = useFetch<TaskView[]>('/api/tasks')
  const all = useMemo(() => tasks.data ?? [], [tasks.data])
  const task = useMemo(() => all.find((t) => t.id === taskId) ?? null, [all, taskId])
  const excluded = useMemo(() => (task ? subtreeIds(all, task.id) : new Set<number>()), [all, task])
  const [parentId, setParentId] = useState<number | null>(null)
  const [position, setPosition] = useState('first')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Parents on offer: the project root, summary rows and untouched leaf tasks; never the task itself or its sub-tasks.
  const parentOptions = useMemo(
    () => all.filter((t) => !excluded.has(t.id) && (t.parentId === null || t.hasChildren || (t.targets.length === 0 && t.status === 'not_started'))),
    [all, excluded],
  )
  const siblings = useMemo(() => all.filter((t) => t.parentId === parentId && t.id !== taskId), [all, parentId, taskId])
  const newParent = useMemo(() => all.find((t) => t.id === parentId) ?? null, [all, parentId])

  // Defaults: where the task is now.
  useEffect(() => {
    if (!task || parentId !== null) return
    setParentId(task.parentId)
    setPosition(positionOf(all, task))
  }, [task, all, parentId])

  const chooseParent = (pid: number) => {
    setParentId(pid)
    if (task && pid === task.parentId) {
      setPosition(positionOf(all, task))
    } else {
      const sibs = all.filter((t) => t.parentId === pid && t.id !== taskId)
      setPosition(sibs.length ? `after:${sibs[sibs.length - 1].id}` : 'first')
    }
  }

  const unchanged = !!task && parentId === task.parentId && position === positionOf(all, task)

  const submit = async () => {
    if (!task || parentId === null) return
    setBusy(true)
    setError(null)
    try {
      const list = await api.put<TaskView[]>(`/api/tasks/${task.id}/move`, { parentId, afterId: position === 'first' ? null : Number(position.slice('after:'.length)) })
      onMoved(list)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const indent = (t: TaskView) => '   '.repeat(Math.min(t.level, 5))
  const changesParent = !!task && !!newParent && newParent.id !== task.parentId
  const floorChange = changesParent && newParent.floor && newParent.floor !== task.floor ? newParent.floor : null

  return (
    <Modal
      open
      onClose={onClose}
      title={task ? `Move "${task.name}"` : 'Move task'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!task || parentId === null || unchanged}>
            Move task
          </Button>
        </>
      }
    >
      {tasks.loading && !tasks.data && <Loading />}
      {tasks.error && <ErrorBanner message={tasks.error} onRetry={tasks.reload} />}
      {task && (
        <div className="space-y-3">
          {error && <ErrorBanner message={error} />}
          <Field label="Move under" hint="Under the project = a main task. Under another task = a sub-task of it.">
            <Select value={parentId ?? ''} onChange={(e) => chooseParent(Number(e.target.value))}>
              {parentOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.parentId === null ? `${t.name} (project, top level)` : `${indent(t)}${t.hasChildren ? '' : '• '}${t.name}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Position">
            <Select value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="first">{siblings.length ? `First, before "${siblings[0].name}"` : 'First'}</option>
              {siblings.map((s) => (
                <option key={s.id} value={`after:${s.id}`}>
                  After: {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <ul className="space-y-1 text-xs text-ink-3">
            {task.hasChildren && <li>Its sub-tasks move with it.</li>}
            {floorChange && <li>Floor changes to {floorLabel(floorChange)} to match the new parent.</li>}
            {changesParent && newParent && !newParent.hasChildren && newParent.parentId !== null && <li>“{newParent.name}” becomes a summary row; its progress will roll up from its sub-tasks.</li>}
          </ul>
        </div>
      )}
    </Modal>
  )
}
