CREATE TABLE `cambi_di_prenotazione` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contatto_id` integer NOT NULL,
	`prenotazione_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`quando` text NOT NULL,
	`da` text,
	`a` text,
	`motivo` text,
	FOREIGN KEY (`contatto_id`) REFERENCES `contatti`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prenotazione_id`) REFERENCES `prenotazioni`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cambi_di_prenotazione_contatto` ON `cambi_di_prenotazione` (`contatto_id`);--> statement-breakpoint
CREATE TABLE `prenotazioni` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contatto_id` integer NOT NULL,
	`invio_id` integer NOT NULL,
	`inizio` text NOT NULL,
	`inizio_iniziale` text NOT NULL,
	`prenotata_il` text NOT NULL,
	`stato` text DEFAULT 'confermata' NOT NULL,
	`motivo_annullamento` text,
	`uid_corrente` text NOT NULL,
	FOREIGN KEY (`contatto_id`) REFERENCES `contatti`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invio_id`) REFERENCES `invii`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prenotazioni_contatto` ON `prenotazioni` (`contatto_id`);--> statement-breakpoint
CREATE TABLE `uid_di_prenotazione` (
	`uid` text PRIMARY KEY NOT NULL,
	`prenotazione_id` integer NOT NULL,
	FOREIGN KEY (`prenotazione_id`) REFERENCES `prenotazioni`(`id`) ON UPDATE no action ON DELETE cascade
);
