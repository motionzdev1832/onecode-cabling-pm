import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { ActivityEntry } from '@shared/types'
import { addDays } from '@shared/dates'
import { localToday } from '@/lib/api'
import { useFetch } from '@/lib/hooks'
import { cls, fmtDateTime } from '@/lib/format'
import { Badge, Button, Card, ErrorBanner, Input, Loading, PageHeader, Select, type Tone } from '@/components/ui'

const actionLabel: Record<string, string> = {
  create: 'Added',
  update: 'Updated',
  delete: 'Deleted',
  setup: 'Setup',
  login: 'Signed in',
  logout: 'Signed out',
  login_failed: 'Failed sign-in',
  password_change: 'Password',
}
const actionTone: Record<string, Tone> = {
  create: 'good',
  update: 'accent',
  delete: 'critical',
  setup: 'neutral',
  login: 'neutral',
  logout: 'neutral',
  login_failed: 'serious',
  password_change: 'warn',
}
const entityLabel: Record<string, string> = {
  task: 'Task',
  task_targets: 'Quantity targets',
  daily_log: 'Daily log',
  todo: 'To-do',
  issue: 'Issue',
  delivery: 'Delivery',
  scope_item: 'Scope item',
  project: 'Project',
  user: 'User',
  session: 'Session',
}

type Range = '7' | '30' | '90' | 'all'

export default function ActivityPage() {
  const today = localToday()
  const [user, setUser] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [range, setRange] = useState<Range>('30')
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (user) p.set('user', user)
    if (entity) p.set('entity', entity)
    if (action) p.set('action', action)
    if (applied) p.set('q', applied)
    if (range !== 'all') p.set('from', addDays(today, -(Number(range) - 1)))
    p.set('limit', '500')
    return `/api/activity?${p.toString()}`
  }, [user, entity, action, applied, range, today])

  const rows = useFetch<ActivityEntry[]>(query)
  const facets = useFetch<{ users: string[]; entities: string[]; actions: string[] }>('/api/activity/facets')

  const grouped = useMemo(() => {
    const m = new Map<string, ActivityEntry[]>()
    for (const a of rows.data ?? []) {
      const day = a.createdAt.slice(0, 10)
      const arr = m.get(day) ?? []
      arr.push(a)
      m.set(day, arr)
    }
    return [...m.entries()]
  }, [rows.data])

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['time', 'user', 'action', 'entity', 'entity_id', 'summary'].join(',')]
    for (const a of rows.data ?? []) lines.push([a.createdAt, a.userName, a.action, a.entity, a.entityId, a.summary].map(esc).join(','))
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url
    el.download = `audit-log-${today}.csv`
    el.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change and sign-in, who made it and when. Updates list the fields that changed."
        actions={
          <Button onClick={exportCsv} disabled={!rows.data?.length}>
            Export CSV
          </Button>
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Select value={user} onChange={(e) => setUser(e.target.value)} className="w-44">
          <option value="">All users</option>
          {(facets.data?.users ?? []).map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-40">
          <option value="">All actions</option>
          {(facets.data?.actions ?? []).map((a) => (
            <option key={a} value={a}>
              {actionLabel[a] ?? a}
            </option>
          ))}
        </Select>
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="w-44">
          <option value="">All record types</option>
          {(facets.data?.entities ?? []).map((en) => (
            <option key={en} value={en}>
              {entityLabel[en] ?? en}
            </option>
          ))}
        </Select>
        <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="w-36">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault()
            setApplied(q.trim())
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search summary, press Enter" className="w-64 pl-8" />
        </form>
      </div>

      {rows.error && <ErrorBanner message={rows.error} onRetry={rows.reload} />}
      {rows.loading && !rows.data && <Loading />}
      {rows.data && rows.data.length === 0 && (
        <Card>
          <p className="text-[13px] text-ink-3">No activity matches these filters.</p>
        </Card>
      )}

      <div className={cls('space-y-5', rows.refreshing && 'opacity-60')}>
        {grouped.map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-1.5 text-sm font-semibold text-ink">{fmtDateTime(day + 'T00:00:00').replace(/, .*$/, '')}</h2>
            <div className="divide-y divide-line-2 rounded-xl border border-line bg-white">
              {list.map((a) => (
                <div key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:flex-nowrap">
                  <span className="tabular w-14 shrink-0 text-xs text-ink-3">{a.createdAt.slice(11, 16)}</span>
                  <span className="w-36 shrink-0 truncate font-medium text-ink" title={a.userName ?? ''}>
                    {a.userName ?? '—'}
                  </span>
                  <span className="shrink-0">
                    <Badge tone={actionTone[a.action] ?? 'neutral'}>{actionLabel[a.action] ?? a.action}</Badge>
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">{entityLabel[a.entity] ?? a.entity}</span>
                  <span className="w-full min-w-0 break-words text-ink-2 sm:w-auto sm:flex-1">{a.summary}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
        {rows.data && rows.data.length >= 500 && <p className="text-xs text-ink-3">Showing the latest 500 entries. Narrow the filters or export to see more.</p>}
      </div>
    </div>
  )
}
