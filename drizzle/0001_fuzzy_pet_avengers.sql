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
ALTER TABLE `characters` ADD `active_conversation_ids_json` text DEFAULT '[]' NOT NULL;