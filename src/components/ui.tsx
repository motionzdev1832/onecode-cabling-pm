import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { CircleAlert, CircleCheck, Clock, Info, TriangleAlert, X } from 'lucide-react'
import { cls } from '@/lib/format'

// ---------- Buttons ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm'
  const variants: Record<Variant, string> = {
    primary: 'bg-accent text-white hover:bg-accent-2',
    secondary: 'bg-white text-ink border border-line hover:bg-plane',
    ghost: 'bg-transparent text-ink-2 hover:bg-plane hover:text-ink',
    danger: 'bg-white text-critical-text border border-line hover:bg-critical-soft',
  }
  return (
    <button type="button" className={cls(base, sizes, variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cls('animate-spin text-current', className ?? 'h-5 w-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}

// ---------- Form controls ----------

const hasWidth = (c?: string) => !!c && /(^|\s)w-/.test(c)

const control =
  'h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-plane disabled:text-ink-2'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cls(control, !hasWidth(className) && 'w-full', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cls(control, 'pr-8', !hasWidth(className) && 'w-full', className)} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cls(control, 'h-auto min-h-[84px] py-2 leading-relaxed', !hasWidth(className) && 'w-full', className)} {...rest} />
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cls('block', className)}>
      <span className="mb-1 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-critical-text">{error}</span>}
    </label>
  )
}

// ---------- Surfaces ----------

export function Card({ title, description, actions, children, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cls('rounded-xl border border-line bg-white', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line-2 px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cls('px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical-text">
      <span className="flex items-center gap-2">
        <CircleAlert className="h-4 w-4 shrink-0" />
        {message}
      </span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-3">
      <Spinner className="h-4 w-4" /> {label}
    </div>
  )
}

// ---------- Badges & status ----------

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'serious' | 'critical'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-plane text-ink-2 border-line',
  accent: 'bg-accent-wash text-accent-2 border-accent-soft',
  good: 'bg-good-soft text-good-text border-good/30',
  warn: 'bg-warn-soft text-warn-text border-warn/40',
  serious: 'bg-serious-soft text-serious-text border-serious/40',
  critical: 'bg-critical-soft text-critical-text border-critical/30',
}

export function Badge({ tone = 'neutral', children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cls('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium leading-4 whitespace-nowrap', toneClasses[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

export const toneIcon: Record<Tone, ReactNode> = {
  neutral: <Clock className="h-3 w-3" />,
  accent: <Info className="h-3 w-3" />,
  good: <CircleCheck className="h-3 w-3" />,
  warn: <TriangleAlert className="h-3 w-3" />,
  serious: <TriangleAlert className="h-3 w-3" />,
  critical: <CircleAlert className="h-3 w-3" />,
}

/** Task status pill: Done / In progress / Not started, with late or behind flags. */
export function TaskStatusBadge({ status, late, behind }: { status: 'not_started' | 'in_progress' | 'done'; late?: boolean; behind?: boolean }) {
  if (status === 'done') return <Badge tone="good" icon={toneIcon.good}>Done</Badge>
  if (late) return <Badge tone="critical" icon={toneIcon.critical}>Late</Badge>
  if (behind) return <Badge tone="serious" icon={toneIcon.serious}>Behind</Badge>
  if (status === 'in_progress') return <Badge tone="accent" icon={<span className="h-1.5 w-1.5 rounded-full bg-accent" />}>In progress</Badge>
  return <Badge tone="neutral">Not started</Badge>
}

/** Meter: fill carries state; the track is a lighter step of the same ramp. */
export function Meter({ value, tone = 'accent', className, thin = false, marker }: { value: number; tone?: Tone; className?: string; thin?: boolean; marker?: number | null }) {
  const v = Math.max(0, Math.min(100, value))
  const fill: Record<Tone, string> = {
    neutral: 'bg-ink-3',
    accent: 'bg-accent',
    good: 'bg-good',
    warn: 'bg-warn',
    serious: 'bg-serious',
    critical: 'bg-critical',
  }
  const track: Record<Tone, string> = {
    neutral: 'bg-line-2',
    accent: 'bg-accent-soft',
    good: 'bg-good-soft',
    warn: 'bg-warn-soft',
    serious: 'bg-serious-soft',
    critical: 'bg-critical-soft',
  }
  return (
    <div className={cls('relative w-full overflow-hidden rounded-full', thin ? 'h-1.5' : 'h-2', track[tone], className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cls('h-full rounded-full transition-[width]', fill[tone])} style={{ width: `${v}%` }} />
      {marker !== null && marker !== undefined && (
        <div className="absolute top-0 h-full w-0.5 bg-ink/50" style={{ left: `calc(${Math.max(0, Math.min(100, marker))}% - 1px)` }} title={`Planned ${Math.round(marker)}%`} />
      )}
    </div>
  )
}

// ---------- Stat tile ----------

export function StatTile({ label, value, sub, delta, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; delta?: { value: number; good: boolean; label?: string } | null; tone?: Tone; className?: string }) {
  return (
    <div className={cls('rounded-xl border border-line bg-white px-4 py-3', className)}>
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className={cls('text-2xl font-semibold leading-tight', tone === 'critical' ? 'text-critical-text' : tone === 'serious' ? 'text-serious-text' : tone === 'good' ? 'text-good-text' : 'text-ink')}>{value}</div>
        {delta && (
          <span className={cls('text-xs font-medium', Math.abs(delta.value) < 0.05 ? 'text-ink-3' : delta.good ? 'text-good-text' : 'text-critical-text')}>
            {delta.value > 0 ? '+' : delta.value < 0 ? '−' : '±'}
            {Math.abs(delta.value).toLocaleString('en-US', { maximumFractionDigits: 1 })}
            {delta.label ? ` ${delta.label}` : ''}
          </span>
        )}
      </div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  )
}

// ---------- Segmented control ----------

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cls('inline-flex rounded-lg border border-line bg-white p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cls('rounded-md px-3 py-1 text-[13px] font-medium transition-colors', o.value === value ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, children, footer, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className={cls('relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:m-4 sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <header className="flex items-center justify-between border-b border-line-2 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-plane hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line-2 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; loading?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{message}</p>
    </Modal>
  )
}

// ---------- Table helpers ----------

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cls('-mx-4 overflow-x-auto sm:-mx-5', className)}>
      <table className="w-full min-w-[560px] border-collapse text-sm">{children}</table>
    </div>
  )
}

export const th = 'px-4 sm:px-5 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-3 border-b border-line bg-white whitespace-nowrap'
export const td = 'px-4 sm:px-5 py-2.5 align-middle border-b border-line-2'
