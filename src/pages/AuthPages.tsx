import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { User } from '@shared/types'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button, Field, Input } from '@/components/ui'

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-plane px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">OC</span>
          <div>
            <div className="text-base font-semibold text-ink">OneCode AI Farm Cabling</div>
            <div className="text-xs text-ink-3">PM Control</div>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { user, needsSetup, loading, setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && needsSetup) return <Navigate to="/setup" replace />
  if (!loading && user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<{ user: User }>('/api/auth/login', { username, password })
      setUser(r.user)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Use the account the project manager gave you.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Password" error={error}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}

export function SetupPage() {
  const { needsSetup, loading, setUser, refresh } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && !needsSetup) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<{ user: User }>('/api/auth/setup', { username, password, displayName })
      setUser(r.user)
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Create the admin account" subtitle="This runs once. The admin manages the plan, logs progress and creates viewer accounts.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your name">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Project Manager" required autoFocus />
        </Field>
        <Field label="Username" hint="Letters, numbers, dot, dash or underscore. At least 3 characters.">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field label="Confirm password" error={error}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthShell>
  )
}
