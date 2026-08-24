CREATE TABLE `events` (
	`local_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`op_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`task_id` text,
	`recommendation_id` text,
	`payload` text,
	`context` text,
	`client_ts` integer NOT NULL,
	`server_ts` integer,
	`local_day` text NOT NULL,
	`server_seq` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_op_id_unique` ON `events` (`op_id`);--> statement-breakpoint
CREATE INDEX `events_local_day_idx` ON `events` (`local_day`);--> statement-breakpoint
CREATE TABLE `op_outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`op_id` text NOT NULL,
	`op_type` text NOT NULL,
	`entity_id` text,
	`payload` text NOT NULL,
	`base_version` integer,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`acked_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `op_outbox_op_id_unique` ON `op_outbox` (`op_id`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`task_id` text NOT NULL,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`slot_start` integer NOT NULL,
	`slot_end` integer NOT NULL,
	`context_bucket` text NOT NULL,
	`features` text,
	`q_hat` real,
	`confidence` real,
	`rationale_key` text,
	`rationale_params` text,
	`is_experiment` integer DEFAULT false NOT NULL,
	`engine` text,
	`model_version` text,
	`status` text DEFAULT 'shown' NOT NULL,
	`attributed_at` integer,
	`propensity` real,
	`conflict_flag` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`server_seq` integer
);
--> statement-breakpoint
CREATE INDEX `recommendations_user_slot_start_idx` ON `recommendations` (`user_id`,`slot_start`);--> statement-breakpoint
CREATE INDEX `recommendations_user_status_idx` ON `recommendations` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`est_minutes` integer NOT NULL,
	`deadline` integer,
	`value` integer NOT NULL,
	`splittable` integer DEFAULT false NOT NULL,
	`earliest_start` integer,
	`recurrence` text,
	`status` text DEFAULT 'inbox' NOT NULL,
	`done_at` integer,
	`postpone_count` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`server_seq` integer
);
--> statement-breakpoint
CREATE INDEX `tasks_user_status_idx` ON `tasks` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_user_deadline_idx` ON `tasks` (`user_id`,`deadline`);