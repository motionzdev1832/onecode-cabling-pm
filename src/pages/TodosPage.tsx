import { useMemo, useState } from 'react'
import { Check, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react'
import type { TaskView, Todo, TodoPriority, TodoStatus } from '@shared/types'
import { api, errorMessage, localToday } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { cls, fmtDate, todoPriorityLabel, todoStatusLabel } from '@/lib/format'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorBanner, Field, Input, Loading, Modal, PageHeader, Select, Textarea, type Tone } from '@/components/ui'
import TaskPicker from '@/components/TaskPicker'

const priorityTone: Record<TodoPriority, Tone> = { low: 'neutral', medium: 'accent', high: 'serious' }
const priorityRank: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 }

export default function TodosPage() {
  const { isAdmin } = useAuth()
  const todos = useFetch<Todo[]>('/api/todos')
  const tasks = useFetch<TaskView[]>('/api/tasks')
  const [show, setShow] = useState<'open' | 'done' | 'all'>('open')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Todo | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Todo | null>(null)
  const [busy, setBusy] = useState(false)
  const today = localToday()

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return (todos.data ?? [])
      .filter((t) => (show === 'all' ? true : show === 'done' ? t.status === 'done' : t.status !== 'done'))
      .filter((t) => !ql || t.title.toLowerCase().includes(ql) || (t.assignee ?? '').toLowerCase().includes(ql))
      .sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1
        if (b.status === 'done' && a.status !== 'done') return -1
        const da = a.dueDate ?? '9999'
        const db = b.dueDate ?? '9999'
        if (da !== db) return da.localeCompare(db)
        return priorityRank[a.priority] - priorityRank[b.priority]
      })
  }, [todos.data, show, q])

  const taskName = (id: number | null) => (id ? (tasks.data ?? []).find((t) => t.id === id)?.name : undefined)

  const toggleDone = async (t: Todo) => {
    try {
      const updated = await api.put<Todo>(`/api/todos/${t.id}`, { status: t.status === 'done' ? 'open' : 'done' })
      todos.setData((prev) => (prev ?? []).map((x) => (x.id === t.id ? updated : x)))
    } catch (e) {
      alert(errorMessage(e))
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await api.del(`/api/todos/${deleting.id}`)
      setDeleting(null)
      await todos.reload()
    } catch (e) {
      alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="To-do list"
        description="Actions for the team, with owners and due dates"
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> New to-do
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className="w-36">
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="all">All</option>
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or assignee" className="w-56" />
      </div>

      {todos.error && <ErrorBanner message={todos.error} onRetry={todos.reload} />}
      {todos.loading && !todos.data && <Loading />}
      {todos.data && list.length === 0 && <EmptyState icon={<ListTodo className="h-8 w-8" />} title={show === 'open' ? 'No open to-dos' : 'Nothing here'} description={isAdmin ? 'Add actions that need to happen: orders, approvals, site preparation.' : undefined} />}

      {list.length > 0 && (
        <div className={cls('divide-y divide-line-2 rounded-xl border border-line bg-white', todos.refreshing && 'opacity-60')}>
          {list.map((t) => {
            const overdue = t.status !== 'done' && !!t.dueDate && t.dueDate < today
            return (
              <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => toggleDone(t)}
                  className={cls('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', t.status === 'done' ? 'border-good bg-good text-white' : 'border-line bg-white text-transparent hover:border-accent', !isAdmin && 'cursor-default')}
                  aria-label={t.status === 'done' ? 'Mark open' : 'Mark done'}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cls('text-sm font-medium', t.status === 'done' ? 'text-ink-3 line-through' : 'text-ink')}>{t.title}</div>
                  {t.description && <div className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink-2">{t.description}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                    <Badge tone={priorityTone[t.priority]}>{todoPriorityLabel[t.priority]}</Badge>
                    {t.status === 'in_progress' && <Badge tone="accent">In progress</Badge>}
                    {t.assignee && <span>{t.assignee}</span>}
                    {t.dueDate && <span className={cls(overdue && 'font-medium text-critical-text')}>Due {fmtDate(t.dueDate, { year: false })}{overdue ? ' · overdue' : ''}</span>}
                    {t.taskId && taskName(t.taskId) && <span className="truncate">Task: {taskName(t.taskId)}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-plane hover:text-ink" onClick={() => setEditing(t)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-critical-soft hover:text-critical-text" onClick={() => setDeleting(t)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <TodoForm
          initial={editing === 'new' ? null : editing}
          tasks={tasks.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await todos.reload()
          }}
        />
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={busy} title="Delete to-do" message={deleting ? `Delete "${deleting.title}"?` : ''} />
    </div>
  )
}

function TodoForm({ initial, tasks, onClose, onSaved }: { initial: Todo | null; tasks: TaskView[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [assignee, setAssignee] = useState(initial?.assignee ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [priority, setPriority] = useState<TodoPriority>(initial?.priority ?? 'medium')
  const [status, setStatus] = useState<TodoStatus>(initial?.status ?? 'open')
  const [taskId, setTaskId] = useState<number | null>(initial?.taskId ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = { title, description: description || null, assignee: assignee || null, dueDate: dueDate || null, priority, status, taskId }
      if (initial) await api.put(`/api/todos/${initial.id}`, body)
      else await api.post('/api/todos', body)
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
      title={initial ? 'Edit to-do' : 'New to-do'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {initial ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorBanner message={error} />}
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Details">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assignee">
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Name or team" />
          </Field>
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TodoPriority)}>
              {(['low', 'medium', 'high'] as TodoPriority[]).map((p) => (
                <option key={p} value={p}>
                  {todoPriorityLabel[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as TodoStatus)}>
              {(['open', 'in_progress', 'done'] as TodoStatus[]).map((s) => (
                <option key={s} value={s}>
                  {todoStatusLabel[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Related task (optional)">
          <TaskPicker tasks={tasks} value={taskId} onChange={setTaskId} placeholder="None" />
        </Field>
      </div>
    </Modal>
  )
}
