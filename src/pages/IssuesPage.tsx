import { useMemo, useState } from 'react'
import { CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Issue, IssueCategory, IssueSeverity, IssueStatus, TaskView } from '@shared/types'
import { api, errorMessage, localToday } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { cls, fmtDate, issueCategoryLabel, issueSeverityLabel, issueStatusLabel } from '@/lib/format'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorBanner, Field, Input, Loading, Modal, PageHeader, Select, Textarea, toneIcon, type Tone } from '@/components/ui'
import TaskPicker from '@/components/TaskPicker'

export const severityTone: Record<IssueSeverity, Tone> = { low: 'neutral', medium: 'warn', high: 'serious', critical: 'critical' }
const statusTone: Record<IssueStatus, Tone> = { open: 'critical', in_progress: 'accent', resolved: 'good', closed: 'neutral' }
const severityRank: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'critical']
const CATEGORIES: IssueCategory[] = ['material', 'access', 'design', 'safety', 'quality', 'other']
const STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed']

export default function IssuesPage() {
  const { isAdmin } = useAuth()
  const issues = useFetch<Issue[]>('/api/issues')
  const tasks = useFetch<TaskView[]>('/api/tasks')
  const [show, setShow] = useState<'open' | 'closed' | 'all'>('open')
  const [severity, setSeverity] = useState<'all' | IssueSeverity>('all')
  const [category, setCategory] = useState<'all' | IssueCategory>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Issue | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Issue | null>(null)
  const [busy, setBusy] = useState(false)
  const today = localToday()

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return (issues.data ?? [])
      .filter((i) => (show === 'all' ? true : show === 'open' ? i.status === 'open' || i.status === 'in_progress' : i.status === 'resolved' || i.status === 'closed'))
      .filter((i) => severity === 'all' || i.severity === severity)
      .filter((i) => category === 'all' || i.category === category)
      .filter((i) => !ql || i.title.toLowerCase().includes(ql) || (i.owner ?? '').toLowerCase().includes(ql) || (i.description ?? '').toLowerCase().includes(ql))
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.raisedDate.localeCompare(a.raisedDate))
  }, [issues.data, show, severity, category, q])

  const taskName = (id: number | null) => (id ? (tasks.data ?? []).find((t) => t.id === id)?.name : undefined)

  const doDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await api.del(`/api/issues/${deleting.id}`)
      setDeleting(null)
      await issues.reload()
    } catch (e) {
      alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Issues"
        description="Blockers and risks raised on site, with owner and resolution"
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Raise issue
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className="w-32">
          <option value="open">Open</option>
          <option value="closed">Resolved</option>
          <option value="all">All</option>
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} className="w-36">
          <option value="all">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {issueSeverityLabel[s]}
            </option>
          ))}
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="w-36">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {issueCategoryLabel[c]}
            </option>
          ))}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-48" />
      </div>

      {issues.error && <ErrorBanner message={issues.error} onRetry={issues.reload} />}
      {issues.loading && !issues.data && <Loading />}
      {issues.data && list.length === 0 && <EmptyState icon={<CircleAlert className="h-8 w-8" />} title={show === 'open' ? 'No open issues' : 'No issues match'} description={isAdmin ? 'Raise anything that blocks or risks the work: missing material, access, design queries, safety, quality.' : undefined} />}

      {list.length > 0 && (
        <div className={cls('divide-y divide-line-2 rounded-xl border border-line bg-white', issues.refreshing && 'opacity-60')}>
          {list.map((i) => {
            const overdue = (i.status === 'open' || i.status === 'in_progress') && !!i.dueDate && i.dueDate < today
            return (
              <div key={i.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={severityTone[i.severity]} icon={i.severity === 'critical' || i.severity === 'high' ? toneIcon[severityTone[i.severity]] : undefined}>
                      {issueSeverityLabel[i.severity]}
                    </Badge>
                    <span className="text-sm font-medium text-ink">
                      #{i.id} {i.title}
                    </span>
                  </div>
                  {i.description && <div className="mt-0.5 whitespace-pre-wrap text-[13px] text-ink-2">{i.description}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                    <Badge tone={statusTone[i.status]}>{issueStatusLabel[i.status]}</Badge>
                    <span>{issueCategoryLabel[i.category]}</span>
                    {i.owner && <span>· Owner {i.owner}</span>}
                    <span>· Raised {fmtDate(i.raisedDate, { year: false })}</span>
                    {i.dueDate && <span className={cls(overdue && 'font-medium text-critical-text')}>· Due {fmtDate(i.dueDate, { year: false })}{overdue ? ' (overdue)' : ''}</span>}
                    {i.resolvedDate && <span>· Resolved {fmtDate(i.resolvedDate, { year: false })}</span>}
                    {i.taskId && taskName(i.taskId) && <span className="truncate">· Task: {taskName(i.taskId)}</span>}
                  </div>
                  {i.resolution && (
                    <div className="mt-1 rounded-md bg-good-soft px-2 py-1 text-[13px] text-good-text">
                      <span className="font-medium">Resolution:</span> {i.resolution}
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-plane hover:text-ink" onClick={() => setEditing(i)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-critical-soft hover:text-critical-text" onClick={() => setDeleting(i)} aria-label="Delete">
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
        <IssueForm
          initial={editing === 'new' ? null : editing}
          tasks={tasks.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await issues.reload()
          }}
        />
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={busy} title="Delete issue" message={deleting ? `Delete issue #${deleting.id} "${deleting.title}"?` : ''} />
    </div>
  )
}

function IssueForm({ initial, tasks, onClose, onSaved }: { initial: Issue | null; tasks: TaskView[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [severity, setSeverity] = useState<IssueSeverity>(initial?.severity ?? 'medium')
  const [category, setCategory] = useState<IssueCategory>(initial?.category ?? 'other')
  const [status, setStatus] = useState<IssueStatus>(initial?.status ?? 'open')
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [raisedDate, setRaisedDate] = useState(initial?.raisedDate ?? localToday())
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [resolvedDate, setResolvedDate] = useState(initial?.resolvedDate ?? '')
  const [resolution, setResolution] = useState(initial?.resolution ?? '')
  const [taskId, setTaskId] = useState<number | null>(initial?.taskId ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const closing = status === 'resolved' || status === 'closed'

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = {
        title,
        description: description || null,
        severity,
        category,
        status,
        owner: owner || null,
        raisedDate,
        dueDate: dueDate || null,
        resolvedDate: closing ? resolvedDate || localToday() : null,
        resolution: resolution || null,
        taskId,
      }
      if (initial) await api.put(`/api/issues/${initial.id}`, body)
      else await api.post('/api/issues', body)
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
      title={initial ? `Edit issue #${initial.id}` : 'Raise issue'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {initial ? 'Save' : 'Raise'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorBanner message={error} />}
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Severity">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as IssueSeverity)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {issueSeverityLabel[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value as IssueCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {issueCategoryLabel[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner">
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who resolves it" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as IssueStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {issueStatusLabel[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Raised on">
            <Input type="date" value={raisedDate} onChange={(e) => setRaisedDate(e.target.value)} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Related task (optional)">
          <TaskPicker tasks={tasks} value={taskId} onChange={setTaskId} placeholder="None" />
        </Field>
        {closing && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-plane p-3 sm:grid-cols-[1fr_auto]">
            <Field label="Resolution">
              <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="How it was resolved" />
            </Field>
            <Field label="Resolved on">
              <Input type="date" value={resolvedDate} onChange={(e) => setResolvedDate(e.target.value)} />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  )
}
