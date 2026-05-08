CREATE TABLE `agent_thoughts` (
	`world_id` text NOT NULL,
	`character_id` text NOT NULL,
	`tick` integer NOT NULL,
	`action_json` text NOT NULL,
	`success` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`world_id`, `character_id`, `tick`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `thoughts_actor_tick_idx` ON `agent_thoughts` (`world_id`,`character_id`,`tick`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`age` integer DEFAULT 30 NOT NULL,
	`gender` text DEFAULT 'male' NOT NULL,
	`profession` text DEFAULT 'farmer' NOT NULL,
	`money` integer DEFAULT 0 NOT NULL,
	`income_level` integer DEFAULT 0 NOT NULL,
	`expense_exempt` integer DEFAULT false NOT NULL,
	`income_multiplier` real DEFAULT 1 NOT NULL,
	`appearance` integer DEFAULT 2 NOT NULL,
	`intelligence` integer DEFAULT 2 NOT NULL,
	`health` integer DEFAULT 2 NOT NULL,
	`sickness_json` text,
	`speaking_style` text,
	`biography` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT 'local' NOT NULL,
	`location_id` text NOT NULL,
	`personality_json` text NOT NULL,
	`vitals_json` text DEFAULT '{"hunger":0,"fatigue":0,"hygiene":0}' NOT NULL,
	`emotion_json` text DEFAULT '{"mood":0,"stress":0,"social_satiety":0}' NOT NULL,
	`abilities_json` text DEFAULT '[]' NOT NULL,
	`short_memory_json` text DEFAULT '[]' NOT NULL,
	`daily_memory_json` text DEFAULT '[]' NOT NULL,
	`long_memory_json` text DEFAULT '[]' NOT NULL,
	`relations_json` text DEFAULT '{}' NOT NULL,
	`current_action_json` text,
	`last_sleep_tick` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `characters_world_idx` ON `characters` (`world_id`);--> statement-breakpoint
CREATE TABLE `events_log` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`tick` integer NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_world_tick_idx` ON `events_log` (`world_id`,`tick`);--> statement-breakpoint
CREATE TABLE `llm_entry_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text,
	`thinking_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `llm_providers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `llm_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`model` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text NOT NULL,
	`world_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`capacity` integer,
	`privacy` text DEFAULT 'public' NOT NULL,
	`visible_from_parent` integer DEFAULT true NOT NULL,
	`shortcuts_json` text DEFAULT '[]' NOT NULL,
	`is_entry` integer DEFAULT false NOT NULL,
	`travel_cost` integer,
	`x` integer,
	`y` integer,
	`w` integer,
	`h` integer,
	`sprite_key` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`world_id`, `id`),
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nodes_world_idx` ON `nodes` (`world_id`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`tick` integer NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshots_world_tick_idx` ON `snapshots` (`world_id`,`tick`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`world_id` text NOT NULL,
	`tick` integer NOT NULL,
	`character_id` text NOT NULL,
	`amount` integer NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`counterparty_id` text,
	FOREIGN KEY (`world_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transactions_world_char_tick_idx` ON `transactions` (`world_id`,`character_id`,`tick`);--> statement-breakpoint
CREATE TABLE `worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`map_id` text DEFAULT '' NOT NULL,
	`current_tick` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
