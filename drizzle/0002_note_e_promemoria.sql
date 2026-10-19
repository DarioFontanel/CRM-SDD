CREATE TABLE `note` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contatto_id` integer NOT NULL,
	`testo` text NOT NULL,
	`quando` text NOT NULL,
	FOREIGN KEY (`contatto_id`) REFERENCES `contatti`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_contatto` ON `note` (`contatto_id`);--> statement-breakpoint
CREATE TABLE `promemoria` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contatto_id` integer NOT NULL,
	`testo` text NOT NULL,
	`giorno` text NOT NULL,
	`fatto_il` text,
	FOREIGN KEY (`contatto_id`) REFERENCES `contatti`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `promemoria_contatto` ON `promemoria` (`contatto_id`);