CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text DEFAULT 'google' NOT NULL,
	`external_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`title` text,
	`busy` integer DEFAULT true NOT NULL,
	`deleted_at` integer,
	`updated_at` integer NOT NULL,
	`server_seq` integer
);
--> statement-breakpoint
CREATE INDEX `calendar_events_user_start_idx` ON `calendar_events` (`user_id`,`start_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_source_external_unique` ON `calendar_events` (`user_id`,`source`,`external_id`);