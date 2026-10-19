import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  salt: text('salt').notNull(),
  role: text('role', { enum: ['admin', 'viewer'] }).notNull(),
  createdAt: text('created_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
})

export const project = sqliteTable('project', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  client: text('client'),
  location: text('location'),
  plannedStart: text('planned_start').notNull(),
  plannedFinish: text('planned_finish').notNull(),
  notes: text('notes'),
})

export const scopeItems = sqliteTable('scope_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category', { enum: ['network', 'cable'] }).notNull(),
  unit: text('unit').notNull().default('Ea'),
  totalQty: real('total_qty').notNull(),
  sortOrder: integer('sort_order').notNull(),
})

export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    parentId: integer('parent_id'),
    name: text('name').notNull(),
    level: integer('level').notNull(),
    isSummary: integer('is_summary', { mode: 'boolean' }).notNull().default(false),
    floor: text('floor', { enum: ['FL2', 'FL3'] }),
    durationDays: real('duration_days').notNull(),
    plannedStart: text('planned_start').notNull(),
    plannedFinish: text('planned_finish').notNull(),
    actualStart: text('actual_start'),
    actualFinish: text('actual_finish'),
    manualPercent: real('manual_percent'),
    notes: text('notes'),
    pic: text('pic'),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [index('tasks_parent_idx').on(t.parentId)],
)

export const taskTargets = sqliteTable(
  'task_targets',
  {
    taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    scopeItemId: integer('scope_item_id').notNull().references(() => scopeItems.id, { onDelete: 'cascade' }),
    targetQty: real('target_qty').notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.scopeItemId] })],
)

export const dailyLogs = sqliteTable(
  'daily_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    logDate: text('log_date').notNull(),
    taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    manpower: integer('manpower'),
    note: text('note'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('daily_logs_date_idx').on(t.logDate), index('daily_logs_task_idx').on(t.taskId)],
)

export const dailyLogItems = sqliteTable(
  'daily_log_items',
  {
    logId: integer('log_id').notNull().references(() => dailyLogs.id, { onDelete: 'cascade' }),
    scopeItemId: integer('scope_item_id').notNull().references(() => scopeItems.id, { onDelete: 'cascade' }),
    qty: real('qty').notNull(),
  },
  (t) => [primaryKey({ columns: [t.logId, t.scopeItemId] })],
)

export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  assignee: text('assignee'),
  dueDate: text('due_date'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  status: text('status', { enum: ['open', 'in_progress', 'done'] }).notNull().default('open'),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  createdBy: integer('created_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
})

export const issues = sqliteTable('issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  severity: text('severity', { enum: ['low', 'medium', 'high', 'critical'] }).notNull().default('medium'),
  category: text('category', { enum: ['material', 'access', 'design', 'safety', 'quality', 'other'] }).notNull().default('other'),
  status: text('status', { enum: ['open', 'in_progress', 'resolved', 'closed'] }).notNull().default('open'),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  owner: text('owner'),
  raisedDate: text('raised_date').notNull(),
  dueDate: text('due_date'),
  resolvedDate: text('resolved_date'),
  resolution: text('resolution'),
  createdBy: integer('created_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const deliveries = sqliteTable('deliveries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scopeItemId: integer('scope_item_id').notNull().references(() => scopeItems.id, { onDelete: 'cascade' }),
  deliveryDate: text('delivery_date').notNull(),
  qty: real('qty').notNull(),
  reference: text('reference'),
  note: text('note'),
  createdBy: integer('created_by'),
  createdAt: text('created_at').notNull(),
})

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'),
  userName: text('user_name'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  summary: text('summary'),
  createdAt: text('created_at').notNull(),
})
