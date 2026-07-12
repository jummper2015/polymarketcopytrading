import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── LeaderboardScan ───────────────────────────────────────────

export const leaderboardScans = sqliteTable("leaderboard_scan", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull().default("polymarket"),
  scannedAt: integer("scanned_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  walletCount: integer("wallet_count").notNull(),
  lookbackDays: integer("lookback_days").notNull().default(30),
  rawSummaryJson: text("raw_summary_json"),
});

// ─── WalletProfile ─────────────────────────────────────────────

export const walletProfiles = sqliteTable("wallet_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  address: text("address").notNull().unique(),
  label: text("label"),
  sourceRank: integer("source_rank"),
  status: text("status", { enum: ["track", "watch", "ignore"] })
    .notNull()
    .default("watch"),
  roi30d: real("roi_30d").default(0),
  consistencyScore: real("consistency_score").default(0),
  copyabilityScore: real("copyability_score").default(0),
  oneHitWonderPenalty: real("one_hit_wonder_penalty").default(0),
  globalScore: real("global_score").default(0),
  bestCategory: text("best_category"),
  categoryStrengthsJson: text("category_strengths_json"),
  averageTradeSize: real("average_trade_size").default(0),
  tradeCount30d: integer("trade_count_30d").default(0),
  resolvedTradeCount30d: integer("resolved_trade_count_30d").default(0),
  winRate30d: real("win_rate_30d").default(0),
  averageLiquidity: real("average_liquidity").default(0),
  averageSpread: real("average_spread").default(0),
  averageEntryTiming: real("average_entry_timing").default(0),
  copyabilityNotes: text("copyability_notes"),
  riskNotes: text("risk_notes"),
  lastScannedAt: integer("last_scanned_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── ObservedTrade ─────────────────────────────────────────────

export const observedTrades = sqliteTable("observed_trade", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  walletAddress: text("wallet_address").notNull(),
  marketId: text("market_id").notNull(),
  conditionId: text("condition_id"),
  marketQuestion: text("market_question"),
  marketCategory: text("market_category"),
  outcome: text("outcome"),
  side: text("side", { enum: ["yes", "no"] }),
  walletEntryPrice: real("wallet_entry_price"),
  detectedPrice: real("detected_price"),
  size: real("size"),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  rawTradeJson: text("raw_trade_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── MarketSnapshot ────────────────────────────────────────────

export const marketSnapshots = sqliteTable("market_snapshot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  marketId: text("market_id").notNull(),
  conditionId: text("condition_id"),
  question: text("question"),
  category: text("category"),
  yesPrice: real("yes_price"),
  noPrice: real("no_price"),
  bestBid: real("best_bid"),
  bestAsk: real("best_ask"),
  spread: real("spread"),
  liquidity: real("liquidity"),
  volume: real("volume"),
  timeToResolution: integer("time_to_resolution"),
  collectedAt: integer("collected_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  rawMarketJson: text("raw_market_json"),
});

// ─── DecisionJournal ───────────────────────────────────────────

export const decisionJournals = sqliteTable("decision_journal", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  observedTradeId: integer("observed_trade_id").references(
    () => observedTrades.id
  ),
  walletAddress: text("wallet_address").notNull(),
  marketId: text("market_id").notNull(),
  decision: text("decision", {
    enum: ["paper_copy", "watchlist", "skip"],
  }).notNull(),
  copyScore: real("copy_score").default(0),
  confidence: real("confidence").default(0),
  reasonsJson: text("reasons_json"),
  risksJson: text("risks_json"),
  // Desglose de scores
  walletQualityScore: real("wallet_quality_score").default(0),
  roiScore: real("roi_score").default(0),
  consistencyScore: real("consistency_score").default(0),
  copyabilityScore: real("copyability_score").default(0),
  categoryFitScore: real("category_fit_score").default(0),
  entryTimingScore: real("entry_timing_score").default(0),
  spreadScore: real("spread_score").default(0),
  liquidityScore: real("liquidity_score").default(0),
  thesisScore: real("thesis_score").default(0),
  simulatedPositionSize: real("simulated_position_size"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── PaperTrade ────────────────────────────────────────────────

export const paperTrades = sqliteTable("paper_trade", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  decisionJournalId: integer("decision_journal_id").references(
    () => decisionJournals.id
  ),
  walletAddress: text("wallet_address").notNull(),
  marketId: text("market_id").notNull(),
  outcome: text("outcome"),
  side: text("side", { enum: ["yes", "no"] }).notNull(),
  entryPrice: real("entry_price").notNull(),
  currentPrice: real("current_price"),
  simulatedPositionSize: real("simulated_position_size").notNull(),
  unrealizedPnl: real("unrealized_pnl").default(0),
  realizedPnl: real("realized_pnl").default(0),
  status: text("status", {
    enum: ["open", "closed", "resolved"],
  })
    .notNull()
    .default("open"),
  openedAt: integer("opened_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  closedAt: integer("closed_at", { mode: "timestamp" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

// ─── PnlSnapshot ───────────────────────────────────────────────

export const pnlSnapshots = sqliteTable("pnl_snapshot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paperTradeId: integer("paper_trade_id")
    .notNull()
    .references(() => paperTrades.id),
  price: real("price").notNull(),
  pnl: real("pnl").notNull(),
  collectedAt: integer("collected_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── OutcomeReview ─────────────────────────────────────────────

export const outcomeReviews = sqliteTable("outcome_review", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  decisionJournalId: integer("decision_journal_id").references(
    () => decisionJournals.id
  ),
  paperTradeId: integer("paper_trade_id").references(
    () => paperTrades.id
  ),
  reviewTime: integer("review_time", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  priceAfter1h: real("price_after_1h"),
  priceAfter6h: real("price_after_6h"),
  priceAfter24h: real("price_after_24h"),
  finalOutcome: text("final_outcome"),
  simulatedPnl: real("simulated_pnl"),
  wasDecisionGood: integer("was_decision_good", { mode: "boolean" }),
  lessonsJson: text("lessons_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── RuleSet ───────────────────────────────────────────────────

export const ruleSets = sqliteTable("rule_set", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: text("version").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  rulesJson: text("rules_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── RuleChange ────────────────────────────────────────────────

export const ruleChanges = sqliteTable("rule_change", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  oldRuleSetId: integer("old_rule_set_id").references(() => ruleSets.id),
  newRuleSetId: integer("new_rule_set_id").references(() => ruleSets.id),
  changedBy: text("changed_by").notNull().default("hermes"),
  reason: text("reason"),
  evidenceSummary: text("evidence_summary"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── DailyReport ───────────────────────────────────────────────

export const dailyReports = sqliteTable("daily_report", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  paperPnl: real("paper_pnl").default(0),
  winRate: real("win_rate").default(0),
  openPositions: integer("open_positions").default(0),
  newSignals: integer("new_signals").default(0),
  copiedSignals: integer("copied_signals").default(0),
  watchedSignals: integer("watched_signals").default(0),
  skippedSignals: integer("skipped_signals").default(0),
  bestWalletsJson: text("best_wallets_json"),
  worstWalletsJson: text("worst_wallets_json"),
  ruleChangesJson: text("rule_changes_json"),
  summary: text("summary"),
  sentToTelegram: integer("sent_to_telegram", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
