CREATE TABLE `scartati` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`riga_id` text NOT NULL,
	`riga` text NOT NULL,
	`quando` text NOT NULL,
	`motivo` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scartati_riga_id` ON `scartati` (`riga_id`);