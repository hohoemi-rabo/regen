CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_account_user` ON `account` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_account_issuer_accountid` ON `account` (`issuer`,`accountId`);--> statement-breakpoint
CREATE TABLE `agencies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`feed_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `batch_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`feeds` integer,
	`routes` integer,
	`message` text
);
--> statement-breakpoint
CREATE TABLE `bundles` (
	`version` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`route_count` integer NOT NULL,
	`feed_count` integer NOT NULL,
	`params_json` text,
	`source_note` text,
	`is_current` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_url` text NOT NULL,
	`feed_start` text,
	`feed_end` text,
	`fetched_at` integer
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_id` text NOT NULL,
	`name` text NOT NULL,
	`length_m` real NOT NULL,
	`trips_per_day` integer NOT NULL,
	`climb_m` real NOT NULL,
	`max_grade` real NOT NULL,
	`kwh_per_km` real NOT NULL,
	`roundtrip_batt_pct` real NOT NULL,
	`daily_kwh` real NOT NULL,
	`extra_charges` integer NOT NULL,
	`verdict` text NOT NULL,
	`accuracy` text NOT NULL,
	`corrected_m` real DEFAULT 0 NOT NULL,
	`bundle_key` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_routes_verdict` ON `routes` (`verdict`);--> statement-breakpoint
CREATE INDEX `idx_routes_agency` ON `routes` (`agency_id`);--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`params_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `idx_session_user` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`powertrain` text NOT NULL,
	`mass_kg` real NOT NULL,
	`battery_kwh` real,
	`drive_eff` real,
	`regen_eff` real,
	`cda` real NOT NULL,
	`crr` real NOT NULL,
	`fuel_km_per_l` real,
	`price_yen` integer,
	`subsidy_yen` integer,
	`source_url` text,
	`note` text,
	`is_public` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);