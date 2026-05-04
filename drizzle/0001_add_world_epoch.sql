CREATE TABLE `conversations` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_world_idx` ON `conversations` (`world_id`);--> statement-breakpoint
ALTER TABLE `characters` ADD `active_conversation_ids_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `impression_book_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `short_term_goal_json` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `long_term_goal_json` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `liked` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `characters` ADD `disliked` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `worlds` ADD `epoch` integer DEFAULT (unixepoch('2026-05-01T00:00:00') * 1000) NOT NULL;