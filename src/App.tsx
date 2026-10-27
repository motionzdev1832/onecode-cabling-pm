import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/lib/auth'
import { Loading } from '@/components/ui'
import Layout from '@/components/Layout'
import { LoginPage, SetupPage } from '@/pages/AuthPages'
import DashboardPage from '@/pages/DashboardPage'
import PlanPage from '@/pages/PlanPage'
import PlanPrintPage from '@/pages/PlanPrintPage'
import AllocationPage from '@/pages/AllocationPage'
import DailyLogPage from '@/pages/DailyLogPage'
import TodosPage from '@/pages/TodosPage'
import IssuesPage from '@/pages/IssuesPage'
import MaterialsPage from '@/pages/MaterialsPage'
import ReportPage from '@/pages/ReportPage'
import UsersPage from '@/pages/UsersPage'
import SettingsPage from '@/pages/SettingsPage'
import ActivityPage from '@/pages/ActivityPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, needsSetup, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (needsSetup) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/plan/print"
        element={
          <RequireAuth>
            <PlanPrintPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="plan" element={<PlanPage />} />
        <Route path="plan/quantities" element={<AllocationPage />} />
        <Route path="log" element={<DailyLogPage />} />
        <Route path="todos" element={<TodosPage />} />
        <Route path="issues" element={<IssuesPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="users"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
