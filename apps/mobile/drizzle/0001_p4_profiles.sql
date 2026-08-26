CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`timezone` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`working_hours` text NOT NULL,
	`sleep_window` text NOT NULL,
	`rmeq_score` integer,
	`chronotype_class` text,
	`survey_skipped` integer DEFAULT false NOT NULL,
	`top_categories` text DEFAULT '[]' NOT NULL,
	`onboarding_completed_at` integer,
	`settings` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	`server_seq` integer
);
