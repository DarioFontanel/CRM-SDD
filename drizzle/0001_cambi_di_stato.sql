CREATE TABLE `cambi_di_stato` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contatto_id` integer NOT NULL,
	`da` text NOT NULL,
	`a` text NOT NULL,
	`quando` text NOT NULL,
	FOREIGN KEY (`contatto_id`) REFERENCES `contatti`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cambi_di_stato_contatto` ON `cambi_di_stato` (`contatto_id`);