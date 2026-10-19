import type { ActivityEntry } from '@shared/types'
import { useFetch } from '@/lib/hooks'
import { cls, fmtDateTime } from '@/lib/format'
import { Card, ErrorBanner, Loading, PageHeader } from '@/components/ui'

const actionLabel: Record<string, string> = { create: 'Added', update: 'Updated', delete: 'Deleted', setup: 'Setup' }

export default function ActivityPage() {
  const { data, error, loading, reload, refreshing } = useFetch<ActivityEntry[]>('/api/activity?limit=200')
  return (
    <div>
      <PageHeader title="Activity" description="Who changed what, most recent first" />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <Card bodyClassName={cls('py-0', refreshing && 'opacity-60')}>
          {data.length === 0 ? (
            <p className="py-4 text-[13px] text-ink-3">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-line-2">
              {data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm">
                  <span className="w-40 shrink-0 text-xs text-ink-3">{fmtDateTime(a.createdAt)}</span>
                  <span className="w-32 shrink-0 truncate text-ink-2">{a.userName ?? '—'}</span>
                  <span className="min-w-0 flex-1 text-ink">
                    <span className="mr-1 rounded bg-plane px-1 py-0.5 text-[11px] uppercase tracking-wide text-ink-3">{actionLabel[a.action] ?? a.action}</span>
                    {a.summary}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
