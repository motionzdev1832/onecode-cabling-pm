// Types shared between the Pages Functions API and the React client.

export type Role = 'admin' | 'viewer'
export type Floor = 'FL2' | 'FL3'
export type TaskStatus = 'not_started' | 'in_progress' | 'done'

export interface User {
  id: number
  username: string
  displayName: string
  role: Role
  createdAt: string
}

export interface Project {
  id: number
  name: string
  client: string | null
  location: string | null
  plannedStart: string
  plannedFinish: string
  notes: string | null
}

export interface ScopeItem {
  id: number
  code: string
  name: string
  category: 'network' | 'cable'
  unit: string
  totalQty: number
  sortOrder: number
}

export interface TaskRow {
  id: number
  parentId: number | null
  name: string
  level: number
  isSummary: boolean
  floor: Floor | null
  durationDays: number
  plannedStart: string
  plannedFinish: string
  actualStart: string | null
  actualFinish: string | null
  manualPercent: number | null
  notes: string | null
  /** Person in charge (name or team). */
  pic: string | null
  sortOrder: number
}

export interface TaskTarget {
  taskId: number
  scopeItemId: number
  targetQty: number
}

/** A task row decorated with computed progress figures. */
export interface TaskView extends TaskRow {
  /** Full path, e.g. "Cabling work FL.2 › Fiber MPO › Row A to Row B…" */
  path: string
  percent: number
  plannedPercent: number
  status: TaskStatus
  /** Not done and today is past the planned finish. */
  late: boolean
  /** Not done and actual % is more than 5 points under planned %. */
  behind: boolean
  /** Progress method for leaf tasks. */
  method: 'quantity' | 'manual' | 'rollup'
  targets: { scopeItemId: number; targetQty: number; doneQty: number }[]
  hasChildren: boolean
}

export interface DailyLogItem {
  scopeItemId: number
  qty: number
}

export interface DailyLog {
  id: number
  logDate: string
  taskId: number
  manpower: number | null
  note: string | null
  createdBy: number | null
  createdByName?: string | null
  createdAt: string
  updatedAt: string
  items: DailyLogItem[]
}

export type TodoPriority = 'low' | 'medium' | 'high'
export type TodoStatus = 'open' | 'in_progress' | 'done'

export interface Todo {
  id: number
  title: string
  description: string | null
  assignee: string | null
  dueDate: string | null
  priority: TodoPriority
  status: TodoStatus
  taskId: number | null
  createdBy: number | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IssueCategory = 'material' | 'access' | 'design' | 'safety' | 'quality' | 'other'
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface Issue {
  id: number
  title: string
  description: string | null
  severity: IssueSeverity
  category: IssueCategory
  status: IssueStatus
  taskId: number | null
  owner: string | null
  raisedDate: string
  dueDate: string | null
  resolvedDate: string | null
  resolution: string | null
  createdBy: number | null
  createdAt: string
  updatedAt: string
}

export interface Delivery {
  id: number
  scopeItemId: number
  deliveryDate: string
  qty: number
  reference: string | null
  note: string | null
  createdBy: number | null
  createdAt: string
}

export interface ActivityEntry {
  id: number
  userId: number | null
  userName: string | null
  action: string
  entity: string
  entityId: string | null
  summary: string | null
  createdAt: string
}

export interface ScopeItemProgress extends ScopeItem {
  allocatedQty: number
  installedQty: number
  deliveredQty: number
}

export interface SCurvePoint {
  date: string
  planned: number
  actual: number | null
}

export interface DashboardData {
  today: string
  project: Project
  overall: { actual: number; planned: number }
  floors: { floor: Floor; label: string; actual: number; planned: number }[]
  items: ScopeItemProgress[]
  scurve: SCurvePoint[]
  counts: {
    leafTasks: number
    done: number
    inProgress: number
    notStarted: number
    late: number
    behind: number
    openIssues: number
    criticalIssues: number
    openTodos: number
    overdueTodos: number
    daysElapsed: number
    daysTotal: number
    daysRemaining: number
  }
  activeTasks: TaskView[]
  upcomingTasks: TaskView[]
  lateTasks: TaskView[]
  recentLogs: (DailyLog & { taskName: string })[]
  manpower7d: { date: string; manpower: number }[]
}

export interface WeeklyReportData {
  project: Project
  from: string
  to: string
  generatedAt: string
  overall: { startActual: number; endActual: number; endPlanned: number }
  floors: { floor: Floor; label: string; startActual: number; endActual: number; endPlanned: number }[]
  items: (ScopeItemProgress & { weekQty: number })[]
  weekLogs: { task: TaskView; logs: DailyLog[]; qtyByItem: Record<number, number>; manpower: number }[]
  manpowerTotal: number
  tasksCompleted: TaskView[]
  tasksInProgress: TaskView[]
  tasksNextWeek: TaskView[]
  lateTasks: TaskView[]
  issuesRaised: Issue[]
  issuesResolved: Issue[]
  issuesOpen: Issue[]
  todosDone: Todo[]
  todosOpen: Todo[]
}
