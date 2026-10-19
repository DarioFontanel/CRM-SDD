CREATE TABLE `contatti` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`email_chiave` text NOT NULL,
	`nome` text,
	`telefono` text,
	`azienda` text,
	`stato` text DEFAULT 'Nuovo' NOT NULL,
	`creato_il` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contatti_email_chiave` ON `contatti` (`email_chiave`);