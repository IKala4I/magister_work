CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_date` text NOT NULL,
	`horizon` text DEFAULT 'day' NOT NULL,
	`engine` text NOT NULL,
	`model_version` text,
	`arm` text,
	`solver_status` text,
	`telemetry` text NOT NULL,
	`generated_at` integer NOT NULL,
	`server_seq` integer
);
--> statement-breakpoint
CREATE INDEX `plans_user_date_idx` ON `plans` (`user_id`,`plan_date`,`generated_at`);