import { useState } from 'react'
import { KeyRound, Pencil, Trash2, UserPlus } from 'lucide-react'
import type { Role, User } from '@shared/types'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useFetch } from '@/lib/hooks'
import { cls, fmtDate } from '@/lib/format'
import { Badge, Button, Card, ConfirmDialog, ErrorBanner, Field, Input, Loading, Modal, PageHeader, Select, Table, td, th } from '@/components/ui'

export default function UsersPage() {
  const { user: me } = useAuth()
  const users = useFetch<User[]>('/api/users')
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)

  const doDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await api.del(`/api/users/${deleting.id}`)
      setDeleting(null)
      await users.reload()
    } catch (e) {
      alert(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Admins can edit everything. Viewers can see every page but change nothing."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <UserPlus className="h-4 w-4" /> Add user
          </Button>
        }
      />
      {users.error && <ErrorBanner message={users.error} onRetry={users.reload} />}
      {users.loading && !users.data && <Loading />}
      {users.data && (
        <Card bodyClassName="py-0">
          <Table>
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Username</th>
                <th className={th}>Role</th>
                <th className={th}>Created</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td className={cls(td, 'font-medium text-ink')}>
                    {u.displayName}
                    {u.id === me?.id && <span className="ml-1 text-xs text-ink-3">(you)</span>}
                  </td>
                  <td className={cls(td, 'text-ink-2')}>{u.username}</td>
                  <td className={td}>
                    <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>{u.role === 'admin' ? 'Admin' : 'Viewer'}</Badge>
                  </td>
                  <td className={cls(td, 'text-ink-2')}>{fmtDate(u.createdAt.slice(0, 10))}</td>
                  <td className={cls(td, 'whitespace-nowrap text-right')}>
                    <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-plane hover:text-ink" onClick={() => setEditing(u)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    {u.id !== me?.id && (
                      <button type="button" className="rounded-md p-1.5 text-ink-3 hover:bg-critical-soft hover:text-critical-text" onClick={() => setDeleting(u)} aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {editing && (
        <UserForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await users.reload()
          }}
        />
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={busy} title="Delete user" message={deleting ? `Delete the account "${deleting.username}"? They will be signed out immediately.` : ''} />
    </div>
  )
}

function UserForm({ initial, onClose, onSaved }: { initial: User | null; onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState(initial?.username ?? '')
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [role, setRole] = useState<Role>(initial?.role ?? 'viewer')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (initial) await api.put(`/api/users/${initial.id}`, { displayName, role, ...(password ? { password } : {}) })
      else await api.post('/api/users', { username, displayName, role, password })
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
      title={initial ? `Edit ${initial.username}` : 'Add user'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            {initial ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorBanner message={error} />}
        <Field label="Display name">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </Field>
        {!initial && (
          <Field label="Username" hint="Letters, numbers, dot, dash or underscore. At least 3 characters.">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </Field>
        )}
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="viewer">Viewer (read-only)</option>
            <option value="admin">Admin (full access)</option>
          </Select>
        </Field>
        <Field label={initial ? 'New password (leave blank to keep)' : 'Password'} hint="At least 8 characters. Share it with the user directly.">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="pl-8" />
          </div>
        </Field>
      </div>
    </Modal>
  )
}
