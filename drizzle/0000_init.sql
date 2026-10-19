CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`user_name` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`summary` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_log_items` (
	`log_id` integer NOT NULL,
	`scope_item_id` integer NOT NULL,
	`qty` real NOT NULL,
	PRIMARY KEY(`log_id`, `scope_item_id`),
	FOREIGN KEY (`log_id`) REFERENCES `daily_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scope_item_id`) REFERENCES `scope_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `daily_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`log_date` text NOT NULL,
	`task_id` integer NOT NULL,
	`manpower` integer,
	`note` text,
	`created_by` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `daily_logs_date_idx` ON `daily_logs` (`log_date`);--> statement-breakpoint
CREATE INDEX `daily_logs_task_idx` ON `daily_logs` (`task_id`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope_item_id` integer NOT NULL,
	`delivery_date` text NOT NULL,
	`qty` real NOT NULL,
	`reference` text,
	`note` text,
	`created_by` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scope_item_id`) REFERENCES `scope_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`severity` text DEFAULT 'medium' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`task_id` integer,
	`owner` text,
	`raised_date` text NOT NULL,
	`due_date` text,
	`resolved_date` text,
	`resolution` text,
	`created_by` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `project` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`client` text,
	`location` text,
	`planned_start` text NOT NULL,
	`planned_finish` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `scope_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text DEFAULT 'Ea' NOT NULL,
	`total_qty` real NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scope_items_code_unique` ON `scope_items` (`code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_targets` (
	`task_id` integer NOT NULL,
	`scope_item_id` integer NOT NULL,
	`target_qty` real NOT NULL,
	PRIMARY KEY(`task_id`, `scope_item_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scope_item_id`) REFERENCES `scope_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`level` integer NOT NULL,
	`is_summary` integer DEFAULT false NOT NULL,
	`floor` text,
	`duration_days` real NOT NULL,
	`planned_start` text NOT NULL,
	`planned_finish` text NOT NULL,
	`actual_start` text,
	`actual_finish` text,
	`manual_percent` real,
	`notes` text,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_parent_idx` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`assignee` text,
	`due_date` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`task_id` integer,
	`created_by` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);