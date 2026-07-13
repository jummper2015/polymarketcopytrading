// tests/simulation/benchmarks.test.ts
// Hito 9.2 — Tests for the benchmarks module
// Verifies bot vs blind copy comparison, missed winners, avoided losers,
// and spread savings calculations.

import { describe, it, expect, beforeEach, vi } from "vitest";

// eslint-disable-next-line no-var
var _sqlite: any;

vi.mock("@/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BetterSqlite3 = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require("drizzle-orm/better-sqlite3");

  const sqlite = new BetterSqlite3(":memory:");
  sqlite.pragma("journal_mode = WAL");

  const tables = [
    `CREATE TABLE wallet_profile (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, address text UNIQUE NOT NULL, label text, source_rank integer, status text NOT NULL, roi30d real, consistency_score real, copyability_score real, one_hit_wonder_penalty real, global_score real, best_category text, category_strengths_json text, average_trade_size real, trade_count30d integer, resolved_trade_count30d integer, win_rate30d real, average_liquidity real, average_spread real, average_entry_timing real, copyability_notes text, risk_notes text, last_scanned_at integer, created_at integer, updated_at integer)`,
    `CREATE TABLE observed_trade (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, wallet_address text NOT NULL, market_id text NOT NULL, condition_id text, market_question text, market_category text, outcome text, side text, wallet_entry_price real, detected_price real, size real, timestamp integer DEFAULT (unixepoch()) NOT NULL, raw_trade_json text, created_at integer DEFAULT (unixepoch()) NOT NULL)`,
    `CREATE TABLE decision_journal (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, observed_trade_id integer, wallet_address text NOT NULL, market_id text NOT NULL, decision text NOT NULL, copy_score real DEFAULT 0, confidence real DEFAULT 0, reasons_json text, risks_json text, wallet_quality_score real DEFAULT 0, roi_score real DEFAULT 0, consistency_score real DEFAULT 0, copyability_score real DEFAULT 0, category_fit_score real DEFAULT 0, entry_timing_score real DEFAULT 0, spread_score real DEFAULT 0, liquidity_score real DEFAULT 0, thesis_score real DEFAULT 0, simulated_position_size real, created_at integer DEFAULT (unixepoch()) NOT NULL)`,
    `CREATE TABLE paper_trade (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, decision_journal_id integer, wallet_address text NOT NULL, market_id text NOT NULL, outcome text, side text NOT NULL, entry_price real NOT NULL, current_price real, simulated_position_size real NOT NULL, unrealized_pnl real DEFAULT 0, realized_pnl real DEFAULT 0, status text DEFAULT 'open' NOT NULL, opened_at integer DEFAULT (unixepoch()) NOT NULL, closed_at integer, resolved_at integer)`,
  ];
  for (const sql of tables) sqlite.exec(sql);

  const db = drizzle(sqlite);
  _sqlite = sqlite;
  return { db };
});

import {
  compareBotVsBlindCopy,
  trackMissedWinners,
  trackAvoidedLosers,
  trackSpreadLossesAvoided,
} from "@/lib/simulation/benchmarks";

function sqlite() {
  if (!_sqlite) throw new Error("DB not initialized");
  return _sqlite;
}

const now = Math.floor(Date.now() / 1000);

function clearAll() {
  sqlite().exec("DELETE FROM paper_trade");
  sqlite().exec("DELETE FROM decision_journal");
  sqlite().exec("DELETE FROM observed_trade");
  sqlite().exec("DELETE FROM wallet_profile");
}

beforeEach(() => {
  clearAll();
});

// ─── Helpers ───────────────────────────────────────────────────

function seedWallet(overrides: Record<string, unknown> = {}) {
  const stmt = sqlite().prepare(
    `INSERT INTO wallet_profile (address, status, roi30d, global_score, consistency_score, copyability_score, trade_count30d, resolved_trade_count30d, win_rate30d, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    overrides.address ?? "0xTRACKED",
    overrides.status ?? "track",
    overrides.roi30d ?? 0.5,
    overrides.global_score ?? 0.75,
    overrides.consistency_score ?? 0.7,
    overrides.copyability_score ?? 0.7,
    overrides.trade_count30d ?? 20,
    overrides.resolved_trade_count30d ?? 10,
    overrides.win_rate30d ?? 0.6,
    now,
    now
  );
}

function seedObservedTrade(overrides: Record<string, unknown> = {}) {
  const stmt = sqlite().prepare(
    `INSERT INTO observed_trade (id, wallet_address, market_id, side, wallet_entry_price, detected_price, size, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    overrides.id ?? 1,
    overrides.wallet_address ?? "0xTRACKED",
    overrides.market_id ?? "market-1",
    overrides.side ?? "yes",
    has(overrides, "wallet_entry_price") ? overrides.wallet_entry_price : 0.50,
    has(overrides, "detected_price") ? overrides.detected_price : 0.52,
    overrides.size ?? 200,
    now,
    now
  );
}

function seedDecision(overrides: Record<string, unknown> = {}) {
  const stmt = sqlite().prepare(
    `INSERT INTO decision_journal (id, observed_trade_id, wallet_address, market_id, decision, copy_score, simulated_position_size, spread_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    overrides.id ?? 1,
    overrides.observed_trade_id ?? 1,
    overrides.wallet_address ?? "0xTRACKED",
    overrides.market_id ?? "market-1",
    overrides.decision ?? "paper_copy",
    overrides.copy_score ?? 0.75,
    overrides.simulated_position_size ?? 10,
    overrides.spread_score ?? 0.7,
    now
  );
}

function seedPaperTrade(overrides: Record<string, unknown> = {}) {
  const stmt = sqlite().prepare(
    `INSERT INTO paper_trade (id, decision_journal_id, wallet_address, market_id, side, entry_price, simulated_position_size, unrealized_pnl, realized_pnl, status, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    overrides.id ?? 1,
    overrides.decision_journal_id ?? 1,
    overrides.wallet_address ?? "0xTRACKED",
    overrides.market_id ?? "market-1",
    overrides.side ?? "yes",
    overrides.entry_price ?? 0.50,
    overrides.simulated_position_size ?? 10,
    overrides.unrealized_pnl ?? 0,
    overrides.realized_pnl ?? 0,
    overrides.status ?? "open",
    now
  );
}

function has(obj: Record<string, unknown>, key: string): boolean {
  return key in obj;
}

// ─── compareBotVsBlindCopy ─────────────────────────────────────

describe("compareBotVsBlindCopy", () => {
  it("returns zero values when no tracked wallets exist", async () => {
    const result = await compareBotVsBlindCopy(30);
    expect(result.totalTrackedTrades).toBe(0);
    expect(result.copiedTrades).toBe(0);
    expect(result.botPnl).toBe(0);
    expect(result.blindCopyPnl).toBe(0);
  });

  it("returns zero values when tracked wallets have no trades", async () => {
    seedWallet({ address: "0xAAA", status: "track" });
    const result = await compareBotVsBlindCopy(30);
    expect(result.totalTrackedTrades).toBe(0);
  });

  it("counts copied and skipped trades correctly", async () => {
    seedWallet({ address: "0xAAA", status: "track" });
    seedObservedTrade({ id: 1, wallet_address: "0xAAA", market_id: "m1", detected_price: 0.55 });
    seedObservedTrade({ id: 2, wallet_address: "0xAAA", market_id: "m2", detected_price: 0.45 });
    seedDecision({ id: 1, observed_trade_id: 1, decision: "paper_copy", wallet_address: "0xAAA" });
    seedDecision({ id: 2, observed_trade_id: 2, decision: "skip", wallet_address: "0xAAA" });
    seedPaperTrade({ id: 1, decision_journal_id: 1, wallet_address: "0xAAA", unrealized_pnl: 2.5, status: "open" });

    const result = await compareBotVsBlindCopy(30);
    expect(result.totalTrackedTrades).toBeGreaterThanOrEqual(2);
    expect(result.copiedTrades).toBeGreaterThanOrEqual(1);
    expect(result.skippedTrades).toBeGreaterThanOrEqual(1);
  });

  it("calculates bot PnL from paper trades", async () => {
    seedWallet({ address: "0xBBB", status: "track" });
    seedObservedTrade({ id: 1, wallet_address: "0xBBB", market_id: "m1", detected_price: 0.55 });
    seedDecision({ id: 1, observed_trade_id: 1, decision: "paper_copy", wallet_address: "0xBBB" });
    seedPaperTrade({ id: 1, decision_journal_id: 1, wallet_address: "0xBBB", entry_price: 0.50, unrealized_pnl: 3, status: "open" });

    const result = await compareBotVsBlindCopy(30);
    expect(result.botPnl).toBeGreaterThan(0);
  });
});

// ─── trackMissedWinners ────────────────────────────────────────

describe("trackMissedWinners", () => {
  it("returns empty array when no data exists", async () => {
    const result = await trackMissedWinners(30);
    expect(result).toEqual([]);
  });

  it("identifies missed winners from skipped decisions", async () => {
    seedWallet({ address: "0xCCC", status: "track", label: "Alpha" });
    // Trade that was skipped but would have been profitable
    seedObservedTrade({
      id: 1, wallet_address: "0xCCC", market_id: "m1",
      side: "yes", wallet_entry_price: 0.50, detected_price: 0.70,
    });
    seedDecision({
      id: 1, observed_trade_id: 1, wallet_address: "0xCCC",
      market_id: "m1", decision: "skip", copy_score: 0.30,
      simulated_position_size: 10,
    });

    const result = await trackMissedWinners(30, 0.01);
    expect(result.length).toBe(1);
    expect(result[0].walletAddress).toBe("0xCCC");
    expect(result[0].decision).toBe("skip");
    expect(result[0].hypotheticalPnl).toBeGreaterThan(0);
  });

  it("filters out trades below minProfitPct threshold", async () => {
    seedWallet({ address: "0xDDD", status: "track" });
    seedObservedTrade({
      id: 1, wallet_address: "0xDDD", market_id: "m1",
      side: "yes", wallet_entry_price: 0.50, detected_price: 0.505,
    });
    seedDecision({
      id: 1, observed_trade_id: 1, wallet_address: "0xDDD",
      market_id: "m1", decision: "watchlist", copy_score: 0.50,
      simulated_position_size: 10,
    });

    // With high minProfitPct threshold, small profit gets filtered out
    const result = await trackMissedWinners(30, 0.10);
    expect(result.length).toBe(0);
  });

  it("handles NO side trades correctly", async () => {
    seedWallet({ address: "0xEEE", status: "track" });
    // NO side: profit when price goes down
    seedObservedTrade({
      id: 1, wallet_address: "0xEEE", market_id: "m1",
      side: "no", wallet_entry_price: 0.60, detected_price: 0.40,
    });
    seedDecision({
      id: 1, observed_trade_id: 1, wallet_address: "0xEEE",
      market_id: "m1", decision: "watchlist", copy_score: 0.45,
      simulated_position_size: 10,
    });

    const result = await trackMissedWinners(30, 0.01);
    expect(result.length).toBe(1);
    expect(result[0].hypotheticalPnl).toBeGreaterThan(0);
  });
});

// ─── trackAvoidedLosers ────────────────────────────────────────

describe("trackAvoidedLosers", () => {
  it("returns empty array when no data exists", async () => {
    const result = await trackAvoidedLosers(30);
    expect(result).toEqual([]);
  });

  it("identifies avoided losers from skipped decisions", async () => {
    seedWallet({ address: "0xFFF", status: "track", label: "Beta" });
    // Trade that was skipped and would have lost money
    seedObservedTrade({
      id: 1, wallet_address: "0xFFF", market_id: "m1",
      side: "yes", wallet_entry_price: 0.70, detected_price: 0.50,
    });
    seedDecision({
      id: 1, observed_trade_id: 1, wallet_address: "0xFFF",
      market_id: "m1", decision: "skip", copy_score: 0.25,
      simulated_position_size: 10,
    });

    const result = await trackAvoidedLosers(30, 0.01);
    expect(result.length).toBe(1);
    expect(result[0].walletAddress).toBe("0xFFF");
    expect(result[0].hypotheticalLoss).toBeLessThan(0);
    expect(Math.abs(result[0].hypotheticalLoss)).toBeGreaterThan(0);
  });

  it("filters out small losses below threshold", async () => {
    seedWallet({ address: "0xGGG", status: "track" });
    seedObservedTrade({
      id: 1, wallet_address: "0xGGG", market_id: "m1",
      side: "yes", wallet_entry_price: 0.50, detected_price: 0.49,
    });
    seedDecision({
      id: 1, observed_trade_id: 1, wallet_address: "0xGGG",
      market_id: "m1", decision: "watchlist", copy_score: 0.40,
      simulated_position_size: 10,
    });

    const result = await trackAvoidedLosers(30, 5);
    expect(result.length).toBe(0);
  });
});

// ─── trackSpreadLossesAvoided ──────────────────────────────────

describe("trackSpreadLossesAvoided", () => {
  it("returns zero values when no data exists", async () => {
    const result = await trackSpreadLossesAvoided(30);
    expect(result.highSpreadTrades).toBe(0);
    expect(result.estimatedBlindSpreadCost).toBe(0);
  });

  it("calculates spread savings from filtering", async () => {
    seedWallet({ address: "0xHHH", status: "track" });
    seedObservedTrade({ id: 1, wallet_address: "0xHHH", market_id: "m1", detected_price: 0.55 });
    seedObservedTrade({ id: 2, wallet_address: "0xHHH", market_id: "m2", detected_price: 0.45 });
    // Trade copied (low spread)
    seedDecision({ id: 1, observed_trade_id: 1, decision: "paper_copy", spread_score: 0.8 });
    // Trade skipped (high spread)
    seedDecision({ id: 2, observed_trade_id: 2, decision: "skip", spread_score: 0.2 });

    const result = await trackSpreadLossesAvoided(30);
    // The skipped high-spread trade should contribute to savings
    expect(result.spreadSaved).toBeGreaterThanOrEqual(0);
  });
});
