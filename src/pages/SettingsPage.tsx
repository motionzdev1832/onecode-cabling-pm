import { useEffect, useState } from 'react'
import type { Project } from '@shared/types'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { fmtDateTime } from '@/lib/format'
import { Badge, Button, Card, ErrorBanner, Field, Input, Loading, PageHeader, Textarea } from '@/components/ui'

export default function SettingsPage() {
  const { isAdmin, user } = useAuth()
  const project = useFetch<Project>('/api/project')
  const [form, setForm] = useState<Project | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null)

  useEffect(() => {
    if (project.data) setForm(project.data)
  }, [project.data])

  const save = async () => {
    if (!form) return
    setSaving(true)
    setMsg(null)
    try {
      const updated = await api.put<Project>('/api/project', {
        name: form.name,
        client: form.client || null,
        location: form.location || null,
        plannedStart: form.plannedStart,
        plannedFinish: form.plannedFinish,
        notes: form.notes || null,
      })
      project.setData(updated)
      setMsg({ tone: 'good', text: 'Saved' })
    } catch (e) {
      setMsg({ tone: 'critical', text: errorMessage(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Project details, your account, and how progress is calculated" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Project"
            description={isAdmin ? 'Baseline dates frame the progress curve and the day counter.' : 'Only an admin can change these.'}
            actions={
              isAdmin && (
                <Button variant="primary" onClick={save} loading={saving} disabled={!form}>
                  Save
                </Button>
              )
            }
          >
            {project.error && <ErrorBanner message={project.error} onRetry={project.reload} />}
            {!form && !project.error && <Loading />}
            {form && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {msg && (
                  <div className="sm:col-span-2">
                    <Badge tone={msg.tone}>{msg.text}</Badge>
                  </div>
                )}
                <Field label="Project name" className="sm:col-span-2">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!isAdmin} />
                </Field>
                <Field label="Client">
                  <Input value={form.client ?? ''} onChange={(e) => setForm({ ...form, client: e.target.value })} disabled={!isAdmin} />
                </Field>
                <Field label="Location">
                  <Input value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={!isAdmin} />
                </Field>
                <Field label="Planned start">
                  <Input type="date" value={form.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.target.value })} disabled={!isAdmin} />
                </Field>
                <Field label="Planned finish">
                  <Input type="date" value={form.plannedFinish} onChange={(e) => setForm({ ...form, plannedFinish: e.target.value })} disabled={!isAdmin} />
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  <Textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={!isAdmin} />
                </Field>
              </div>
            )}
          </Card>

          <Card title="How progress is calculated">
            <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-ink-2">
              <li>
                <span className="font-medium text-ink">Leaf tasks with quantity targets</span> are measured as installed ÷ target, using the daily log. Targets are set in Plan › Quantities.
              </li>
              <li>
                <span className="font-medium text-ink">Leaf tasks without targets</span> (for example testing) use the manual percentage on the task, and become 100% when an actual finish date is set.
              </li>
              <li>
                <span className="font-medium text-ink">Summary rows, floors and the project</span> are the duration-weighted average of their leaf tasks (a 4-day task counts twice as much as a 2-day task).
              </li>
              <li>
                <span className="font-medium text-ink">Planned %</span> on any day assumes each task progresses evenly from its planned start to planned finish, seven days a week.
              </li>
              <li>
                A task is <span className="font-medium text-ink">behind</span> when it is more than 5 points under its planned %, and <span className="font-medium text-ink">late</span> when its planned finish has passed and it is not done.
              </li>
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <AccountCard username={user?.username ?? ''} role={user?.role ?? 'viewer'} />
          <BuildInfo />
        </div>
      </div>
    </div>
  )
}

function AccountCard({ username, role }: { username: string; role: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null)

  const submit = async () => {
    if (next !== confirm) {
      setMsg({ tone: 'critical', text: 'New passwords do not match' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next })
      setCurrent('')
      setNext('')
      setConfirm('')
      setMsg({ tone: 'good', text: 'Password changed' })
    } catch (e) {
      setMsg({ tone: 'critical', text: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="My account" description={`${username} · ${role === 'admin' ? 'Admin' : 'Viewer'}`}>
      <div className="space-y-3">
        {msg && <Badge tone={msg.tone}>{msg.text}</Badge>}
        <Field label="Current password">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button variant="primary" onClick={submit} loading={busy} disabled={!current || !next}>
          Change password
        </Button>
      </div>
    </Card>
  )
}

interface BuildStamp {
  sha: string
  branch: string | null
  builtAt: string
  source: 'workers-builds' | 'local'
}

/** Which build is live (from dist/version.json, written by scripts/stamp.mjs at build time). */
function BuildInfo() {
  const [info, setInfo] = useState<BuildStamp | null | undefined>(undefined)
  useEffect(() => {
    fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<BuildStamp>) : null))
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])
  if (info === undefined) return null
  return (
    <p className="px-1 text-xs text-ink-3">
      {info ? `Build ${info.sha}${info.branch ? ' (' + info.branch + ')' : ''} · ${fmtDateTime(info.builtAt)} · ${info.source === 'workers-builds' ? 'deployed by Cloudflare Workers Builds' : 'deployed from a local machine'}` : 'Build info unavailable'}
    </p>
  )
}
