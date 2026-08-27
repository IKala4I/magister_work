CREATE TABLE `focus_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`task_id` text NOT NULL,
	`state` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`focused_ms` integer DEFAULT 0 NOT NULL,
	`last_resumed_at` integer,
	`planned_minutes` integer NOT NULL,
	`est_minutes` integer NOT NULL,
	`rated_energy` integer,
	`rated_difficulty` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `focus_sessions_user_state_idx` ON `focus_sessions` (`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `focus_sessions_rec_idx` ON `focus_sessions` (`recommendation_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `skip_streak` integer DEFAULT 0 NOT NULL;