CREATE TABLE `daily_report` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`paper_pnl` real DEFAULT 0,
	`win_rate` real DEFAULT 0,
	`open_positions` integer DEFAULT 0,
	`new_signals` integer DEFAULT 0,
	`copied_signals` integer DEFAULT 0,
	`watched_signals` integer DEFAULT 0,
	`skipped_signals` integer DEFAULT 0,
	`best_wallets_json` text,
	`worst_wallets_json` text,
	`rule_changes_json` text,
	`summary` text,
	`sent_to_telegram` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_report_date_unique` ON `daily_report` (`date`);--> statement-breakpoint
CREATE TABLE `decision_journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`observed_trade_id` integer,
	`wallet_address` text NOT NULL,
	`market_id` text NOT NULL,
	`decision` text NOT NULL,
	`copy_score` real DEFAULT 0,
	`confidence` real DEFAULT 0,
	`reasons_json` text,
	`risks_json` text,
	`wallet_quality_score` real DEFAULT 0,
	`roi_score` real DEFAULT 0,
	`consistency_score` real DEFAULT 0,
	`copyability_score` real DEFAULT 0,
	`category_fit_score` real DEFAULT 0,
	`entry_timing_score` real DEFAULT 0,
	`spread_score` real DEFAULT 0,
	`liquidity_score` real DEFAULT 0,
	`thesis_score` real DEFAULT 0,
	`simulated_position_size` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`observed_trade_id`) REFERENCES `observed_trade`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leaderboard_scan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text DEFAULT 'polymarket' NOT NULL,
	`scanned_at` integer DEFAULT (unixepoch()) NOT NULL,
	`wallet_count` integer NOT NULL,
	`lookback_days` integer DEFAULT 30 NOT NULL,
	`raw_summary_json` text
);
--> statement-breakpoint
CREATE TABLE `market_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market_id` text NOT NULL,
	`condition_id` text,
	`question` text,
	`category` text,
	`yes_price` real,
	`no_price` real,
	`best_bid` real,
	`best_ask` real,
	`spread` real,
	`liquidity` real,
	`volume` real,
	`time_to_resolution` integer,
	`collected_at` integer DEFAULT (unixepoch()) NOT NULL,
	`raw_market_json` text
);
--> statement-breakpoint
CREATE TABLE `observed_trade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_address` text NOT NULL,
	`market_id` text NOT NULL,
	`condition_id` text,
	`market_question` text,
	`market_category` text,
	`outcome` text,
	`side` text,
	`wallet_entry_price` real,
	`detected_price` real,
	`size` real,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`raw_trade_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outcome_review` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`decision_journal_id` integer,
	`paper_trade_id` integer,
	`review_time` integer DEFAULT (unixepoch()) NOT NULL,
	`price_after_1h` real,
	`price_after_6h` real,
	`price_after_24h` real,
	`final_outcome` text,
	`simulated_pnl` real,
	`was_decision_good` integer,
	`lessons_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`decision_journal_id`) REFERENCES `decision_journal`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paper_trade_id`) REFERENCES `paper_trade`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `paper_trade` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`decision_journal_id` integer,
	`wallet_address` text NOT NULL,
	`market_id` text NOT NULL,
	`outcome` text,
	`side` text NOT NULL,
	`entry_price` real NOT NULL,
	`current_price` real,
	`simulated_position_size` real NOT NULL,
	`unrealized_pnl` real DEFAULT 0,
	`realized_pnl` real DEFAULT 0,
	`status` text DEFAULT 'open' NOT NULL,
	`opened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`closed_at` integer,
	`resolved_at` integer,
	FOREIGN KEY (`decision_journal_id`) REFERENCES `decision_journal`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pnl_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`paper_trade_id` integer NOT NULL,
	`price` real NOT NULL,
	`pnl` real NOT NULL,
	`collected_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`paper_trade_id`) REFERENCES `paper_trade`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_change` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`old_rule_set_id` integer,
	`new_rule_set_id` integer,
	`changed_by` text DEFAULT 'hermes' NOT NULL,
	`reason` text,
	`evidence_summary` text,
	`before_json` text,
	`after_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`old_rule_set_id`) REFERENCES `rule_set`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`new_rule_set_id`) REFERENCES `rule_set`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_set` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`rules_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`label` text,
	`source_rank` integer,
	`status` text DEFAULT 'watch' NOT NULL,
	`roi_30d` real DEFAULT 0,
	`consistency_score` real DEFAULT 0,
	`copyability_score` real DEFAULT 0,
	`one_hit_wonder_penalty` real DEFAULT 0,
	`global_score` real DEFAULT 0,
	`best_category` text,
	`category_strengths_json` text,
	`average_trade_size` real DEFAULT 0,
	`trade_count_30d` integer DEFAULT 0,
	`resolved_trade_count_30d` integer DEFAULT 0,
	`win_rate_30d` real DEFAULT 0,
	`average_liquidity` real DEFAULT 0,
	`average_spread` real DEFAULT 0,
	`average_entry_timing` real DEFAULT 0,
	`copyability_notes` text,
	`risk_notes` text,
	`last_scanned_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_profile_address_unique` ON `wallet_profile` (`address`);