ALTER TABLE `worlds` ADD `epoch` integer DEFAULT (unixepoch('2026-05-01T00:00:00') * 1000) NOT NULL;
