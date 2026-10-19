import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Activity, ChartGantt, CircleAlert, ClipboardList, Ellipsis, FileText, LayoutDashboard, ListTodo, LogOut, Package, Settings, Users, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cls } from '@/lib/format'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/plan', label: 'Plan', icon: ChartGantt },
  { to: '/log', label: 'Daily log', icon: ClipboardList },
  { to: '/todos', label: 'To-do', icon: ListTodo },
  { to: '/issues', label: 'Issues', icon: CircleAlert },
  { to: '/materials', label: 'Materials', icon: Package },
  { to: '/report', label: 'Weekly report', icon: FileText },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/users', label: 'Users', icon: Users, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const MOBILE_PRIMARY = ['/', '/plan', '/log', '/issues']

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const items = NAV.filter((n) => !n.adminOnly || isAdmin)

  const doLogout = async () => {
    await logout()
    navigate('/login')
  }

  const linkClass = (active: boolean) =>
    cls('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors', active ? 'bg-accent-wash text-accent-2' : 'text-ink-2 hover:bg-plane hover:text-ink')

  return (
    <div className="flex min-h-full">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-60 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-line-2 px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">OC</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink">AI Farm Cabling</div>
            <div className="text-[11px] text-ink-3">PM Control</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => linkClass(isActive)}>
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line-2 p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink">{user?.displayName}</div>
              <div className="text-[11px] uppercase tracking-wide text-ink-3">{user?.role === 'admin' ? 'Admin' : 'Viewer'}</div>
            </div>
            <button type="button" onClick={doLogout} className="rounded-md p-1.5 text-ink-3 hover:bg-plane hover:text-ink" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="no-print sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-white">OC</span>
            <span className="text-sm font-semibold text-ink">AI Farm Cabling</span>
          </div>
          <span className="text-xs text-ink-3">{user?.displayName}</span>
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-8 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {items
            .filter((n) => MOBILE_PRIMARY.includes(n.to))
            .map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cls('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-accent-2' : 'text-ink-3')}>
                <n.icon className="h-5 w-5" />
                {n.label}
              </NavLink>
            ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cls('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', !MOBILE_PRIMARY.includes(location.pathname) ? 'text-accent-2' : 'text-ink-3')}
          >
            <Ellipsis className="h-5 w-5" />
            More
          </button>
        </nav>

        {moreOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-ink/30" onClick={() => setMoreOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">More</span>
                <button type="button" onClick={() => setMoreOpen(false)} className="rounded-md p-1 text-ink-3" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {items
                  .filter((n) => !MOBILE_PRIMARY.includes(n.to))
                  .map((n) => (
                    <NavLink key={n.to} to={n.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => linkClass(isActive)}>
                      <n.icon className="h-4 w-4" />
                      {n.label}
                    </NavLink>
                  ))}
                <button type="button" onClick={doLogout} className={linkClass(false)}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
