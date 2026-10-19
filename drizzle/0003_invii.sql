CREATE TABLE `invii` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contatto_id` integer NOT NULL,
	`chiave` text NOT NULL,
	`punto_di_ingresso` text NOT NULL,
	`ricevuto_il` text NOT NULL,
	`email` text NOT NULL,
	`nome` text,
	`telefono` text,
	`azienda` text,
	`messaggio` text,
	`risorsa` text,
	`come_mi_hai_conosciuto` text,
	`pagina` text,
	`privacy_versione` text,
	`visto` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`contatto_id`) REFERENCES `contatti`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invii_chiave` ON `invii` (`chiave`);--> statement-breakpoint
CREATE INDEX `invii_contatto` ON `invii` (`contatto_id`);