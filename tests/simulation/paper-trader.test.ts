// tests/simulation/paper-trader.test.ts
// Unit tests for the paper trading engine using in-memory SQLite

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Module-level DB references ────────────────────────────────

// eslint-disable-next-line no-var
var _sqlite: any;

// vi.mock is hoisted; we create the DB inside the factory.
// Use require() with project-root-relative paths since vitest runs
// from the project root (where vitest.config.ts lives).
vi.mock("@/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BetterSqlite3 = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require("drizzle-orm/better-sqlite3");

  const sqlite = new BetterSqlite3(":memory:");
  sqlite.pragma("journal_mode = WAL");

  const tables = [
    `CREATE TABLE paper_trade (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, decision_journal_id integer, wallet_address text NOT NULL, market_id text NOT NULL, outcome text, side text NOT NULL, entry_price real NOT NULL, current_price real, simulated_position_size real NOT NULL, unrealized_pnl real DEFAULT 0, realized_pnl real DEFAULT 0, status text DEFAULT 'open' NOT NULL, opened_at integer DEFAULT (unixepoch()) NOT NULL, closed_at integer, resolved_at integer)`,
    `CREATE TABLE decision_journal (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, observed_trade_id integer, wallet_address text NOT NULL, market_id text NOT NULL, decision text NOT NULL, copy_score real DEFAULT 0, confidence real DEFAULT 0, reasons_json text, risks_json text, wallet_quality_score real DEFAULT 0, roi_score real DEFAULT 0, consistency_score real DEFAULT 0, copyability_score real DEFAULT 0, category_fit_score real DEFAULT 0, entry_timing_score real DEFAULT 0, spread_score real DEFAULT 0, liquidity_score real DEFAULT 0, thesis_score real DEFAULT 0, simulated_position_size real, created_at integer DEFAULT (unixepoch()) NOT NULL)`,
    `CREATE TABLE observed_trade (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, wallet_address text NOT NULL, market_id text NOT NULL, condition_id text, market_question text, market_category text, outcome text, side text, wallet_entry_price real, detected_price real, size real, timestamp integer DEFAULT (unixepoch()) NOT NULL, raw_trade_json text, created_at integer DEFAULT (unixepoch()) NOT NULL)`,
    `CREATE TABLE pnl_snapshot (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, paper_trade_id integer NOT NULL, price real NOT NULL, pnl real NOT NULL, collected_at integer DEFAULT (unixepoch()) NOT NULL, FOREIGN KEY (paper_trade_id) REFERENCES paper_trade(id))`,
    `CREATE TABLE outcome_review (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, decision_journal_id integer, paper_trade_id integer, review_time integer DEFAULT (unixepoch()) NOT NULL, price_after_1h real, price_after_6h real, price_after_24h real, final_outcome text, simulated_pnl real, was_decision_good integer, lessons_json text, created_at integer DEFAULT (unixepoch()) NOT NULL)`,
  ];
  for (const sql of tables) sqlite.exec(sql);

  // Create Drizzle with the in-memory DB (no schema needed at runtime
  // for query building — Drizzle discovers columns at query time from the
  // actual SQLite tables)
  const db = drizzle(sqlite);

  // Store for test seed helpers
  _sqlite = sqlite;

  return { db };
});

// Import after vi.mock — resolved modules use the mocked db
import {
  createPaperTrade,
  updatePaperTradePnL,
  closePaperTrade,
  resolvePaperTrade,
  processPendingDecisions,
  getOpenPaperTrades,
  getPaperTradesByWallet,
  getPaperTradesByStatus,
  getPaperTradeSnapshot,
  getPaperPortfolioStats,
  hasPaperTrade,
} from "@/lib/simulation/paper-trader";

// ─── Test Helpers ──────────────────────────────────────────────

function sqlite() {
  if (!_sqlite) throw new Error("DB not initialized");
  return _sqlite;
}

const now = Math.floor(Date.now() / 1000);

/** Insert a decision_journal record */
function seedDecision(overrides: Record<string, unknown> = {}) {
  const stmt = sqlite().prepare(
    `INSERT INTO decision_journal (id, observed_trade_id, wallet_address, market_id, decision, simulated_position_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    overrides.id ?? 1,
    has(overrides, "observed_trade_id") ? overrides.observed_trade_id : null,
    overrides.wallet_address ?? "0xTestWallet",
    overrides.market_id ?? "market-1",
    overrides.decision ?? "paper_copy",
    overrides.simulated_position_size ?? 10,
    now
  );
  return { id: Number(info.lastInsertRowid), ...overrides };
}

/** Insert an observed_trade record */
function seedObservedTrade(overrides: Record<string, unknown> = {}) {
  const stmt = sqlite().prepare(
    `INSERT INTO observed_trade (id, wallet_address, market_id, outcome, side, wallet_entry_price, detected_price, size, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    overrides.id ?? 1,
    overrides.wallet_address ?? "0xTestWallet",
    overrides.market_id ?? "market-1",
    overrides.outcome ?? "Yes",
    overrides.side ?? "yes",
    has(overrides, "wallet_entry_price") ? overrides.wallet_entry_price : 0.55,
    has(overrides, "detected_price") ? overrides.detected_price : 0.55,
    overrides.size ?? 200,
    now,
    now
  );
  return { id: Number(info.lastInsertRowid), ...overrides };
}

/** Insert a paper_trade record */
function seedPaperTrade(overrides: Record<string, unknown> = {}) {
  const stmt = sqlite().prepare(
    `INSERT INTO paper_trade (id, decision_journal_id, wallet_address, market_id, outcome, side, entry_price, current_price, simulated_position_size, unrealized_pnl, realized_pnl, status, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    overrides.id ?? 1,
    has(overrides, "decision_journal_id") ? overrides.decision_journal_id : null,
    overrides.wallet_address ?? "0xTestWallet",
    overrides.market_id ?? "market-1",
    has(overrides, "outcome") ? overrides.outcome : "Yes",
    overrides.side ?? "yes",
    overrides.entry_price ?? 0.55,
    overrides.current_price ?? 0.55,
    overrides.simulated_position_size ?? 10,
    overrides.unrealized_pnl ?? 0,
    overrides.realized_pnl ?? 0,
    overrides.status ?? "open",
    now
  );
  return { id: Number(info.lastInsertRowid), ...overrides };
}

function getRow(table: string, id: number): Record<string, unknown> | undefined {
  return sqlite().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
}

function has(obj: Record<string, unknown>, key: string): boolean {
  return key in obj;
}

function clearAll() {
  sqlite().exec("DELETE FROM pnl_snapshot");
  sqlite().exec("DELETE FROM outcome_review");
  sqlite().exec("DELETE FROM paper_trade");
  sqlite().exec("DELETE FROM observed_trade");
  sqlite().exec("DELETE FROM decision_journal");
}

beforeEach(() => {
  clearAll();
});

// ─── createPaperTrade ──────────────────────────────────────────

describe("createPaperTrade", () => {
  it("returns null when decision journal does not exist", async () => {
    const result = await createPaperTrade(999);
    expect(result).toBeNull();
  });

  it("returns null when decision is not paper_copy", async () => {
    seedDecision({ id: 1, decision: "watchlist" });
    const result = await createPaperTrade(1);
    expect(result).toBeNull();
  });

  it("returns null when decision is skip", async () => {
    seedDecision({ id: 1, decision: "skip" });
    const result = await createPaperTrade(1);
    expect(result).toBeNull();
  });

  it("creates a paper trade with default values when no observed trade", async () => {
    seedDecision({
      id: 1, decision: "paper_copy", wallet_address: "0xABC",
      market_id: "market-5", simulated_position_size: 15, observed_trade_id: null,
    });

    const result = await createPaperTrade(1);

    expect(result).not.toBeNull();
    expect(result!.walletAddress).toBe("0xABC");
    expect(result!.marketId).toBe("market-5");
    expect(result!.side).toBe("yes");
    expect(result!.entryPrice).toBe(0.5);
    expect(result!.currentPrice).toBe(0.5);
    expect(result!.simulatedPositionSize).toBe(15);
    expect(result!.status).toBe("open");
    expect(result!.unrealizedPnl).toBe(0);
    expect(result!.realizedPnl).toBe(0);
  });

  it("uses observed trade data for side and entry price", async () => {
    seedObservedTrade({
      id: 10, side: "no", wallet_entry_price: 0.42,
      detected_price: 0.43, outcome: "No", market_id: "market-5",
    });
    seedDecision({
      id: 1, decision: "paper_copy", observed_trade_id: 10,
      wallet_address: "0xABC", market_id: "market-5", simulated_position_size: 10,
    });

    const result = await createPaperTrade(1);

    expect(result).not.toBeNull();
    expect(result!.side).toBe("no");
    expect(result!.entryPrice).toBe(0.43);
    expect(result!.outcome).toBe("No");
  });

  it("falls back to walletEntryPrice when detectedPrice is null", async () => {
    seedObservedTrade({
      id: 10, side: "yes", wallet_entry_price: 0.60, detected_price: null,
    });
    seedDecision({
      id: 1, decision: "paper_copy", observed_trade_id: 10,
      wallet_address: "0xABC", market_id: "market-5", simulated_position_size: 10,
    });

    const result = await createPaperTrade(1);
    expect(result!.entryPrice).toBe(0.60);
  });

  it("prevents duplicate paper trades for same decision", async () => {
    seedDecision({ id: 1, decision: "paper_copy", wallet_address: "0xABC", market_id: "m1" });
    seedObservedTrade({ id: 10 });

    const first = await createPaperTrade(1);
    expect(first).not.toBeNull();

    const second = await createPaperTrade(1);
    expect(second).toBeNull();
  });
});

// ─── updatePaperTradePnL ───────────────────────────────────────

describe("updatePaperTradePnL", () => {
  it("does nothing when paper trade does not exist", async () => {
    await expect(updatePaperTradePnL(999, 0.60)).resolves.toBeUndefined();
  });

  it("does nothing when trade is not open", async () => {
    seedPaperTrade({ id: 1, status: "closed", entry_price: 0.50, unrealized_pnl: 999 });
    await updatePaperTradePnL(1, 0.60);
    const row = getRow("paper_trade", 1);
    expect(row!.unrealized_pnl).toBe(999);
  });

  it("calculates positive unrealized PnL for YES side going up", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10, status: "open" });
    await updatePaperTradePnL(1, 0.60);
    const row = getRow("paper_trade", 1);
    expect(row!.current_price).toBe(0.60);
    expect(row!.unrealized_pnl).toBeCloseTo(2.0, 4);
  });

  it("calculates negative unrealized PnL for YES side going down", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10, status: "open" });
    await updatePaperTradePnL(1, 0.40);
    const row = getRow("paper_trade", 1);
    expect(row!.unrealized_pnl).toBeCloseTo(-2.0, 4);
  });

  it("calculates PnL correctly for NO side", async () => {
    seedPaperTrade({ id: 1, side: "no", entry_price: 0.40, simulated_position_size: 10, status: "open" });
    await updatePaperTradePnL(1, 0.30);
    const row = getRow("paper_trade", 1);
    expect(row!.unrealized_pnl).toBeCloseTo(-2.5, 4);
  });

  it("creates a PnL snapshot record", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10, status: "open" });
    await updatePaperTradePnL(1, 0.55);
    const snapshots = sqlite().prepare("SELECT * FROM pnl_snapshot WHERE paper_trade_id = ?").all(1) as unknown[];
    expect(snapshots.length).toBe(1);
    const snap = snapshots[0] as Record<string, unknown>;
    expect(snap.price).toBe(0.55);
    expect(snap.pnl).toBeCloseTo(1.0, 4);
  });
});

// ─── closePaperTrade ───────────────────────────────────────────

describe("closePaperTrade", () => {
  it("returns null when trade does not exist", async () => {
    const result = await closePaperTrade(999);
    expect(result).toBeNull();
  });

  it("returns existing row without changes when already closed", async () => {
    seedPaperTrade({ id: 1, status: "closed", unrealized_pnl: 5, realized_pnl: 5 });
    const result = await closePaperTrade(1);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("closed");
  });

  it("moves unrealized PnL to realized PnL and sets status closed", async () => {
    seedPaperTrade({ id: 1, status: "open", entry_price: 0.50, current_price: 0.55, unrealized_pnl: 2.5, simulated_position_size: 10 });

    const result = await closePaperTrade(1);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("closed");
    expect(result!.realizedPnl).toBeCloseTo(2.5, 4);
    expect(result!.unrealizedPnl).toBe(0);
    expect(result!.closedAt).not.toBeNull();
  });
});

// ─── resolvePaperTrade ─────────────────────────────────────────

describe("resolvePaperTrade", () => {
  it("returns null when trade does not exist", async () => {
    const result = await resolvePaperTrade(999, "Yes");
    expect(result).toBeNull();
  });

  it("returns existing row unchanged when not open", async () => {
    seedPaperTrade({ id: 1, status: "closed" });
    const result = await resolvePaperTrade(1, "Yes");
    expect(result!.status).toBe("closed");
  });

  it("resolves YES trade as win when outcome matches", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10, status: "open" });
    const result = await resolvePaperTrade(1, "Yes", 1.0);
    expect(result!.status).toBe("resolved");
    expect(result!.realizedPnl).toBeCloseTo(10.0, 4);
    expect(result!.unrealizedPnl).toBe(0);
  });

  it("resolves YES trade as loss when outcome does not match", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10, status: "open" });
    const result = await resolvePaperTrade(1, "No", 1.0);
    expect(result!.status).toBe("resolved");
    expect(result!.realizedPnl).toBeCloseTo(-10.0, 4);
  });

  it("resolves NO trade as win when outcome matches", async () => {
    seedPaperTrade({ id: 1, side: "no", entry_price: 0.40, simulated_position_size: 10, status: "open" });
    const result = await resolvePaperTrade(1, "No", 1.0);
    expect(result!.status).toBe("resolved");
    expect(result!.realizedPnl).toBeCloseTo(15.0, 4);
  });

  it("resolves NO trade as loss when outcome does not match", async () => {
    seedPaperTrade({ id: 1, side: "no", entry_price: 0.40, simulated_position_size: 10, status: "open" });
    const result = await resolvePaperTrade(1, "Yes", 1.0);
    expect(result!.status).toBe("resolved");
    expect(result!.realizedPnl).toBeCloseTo(-10.0, 4);
  });

  it("handles case-insensitive and trimmed outcome matching", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10, status: "open" });
    const result = await resolvePaperTrade(1, "  YES  ", 1.0);
    expect(result!.realizedPnl).toBeCloseTo(10.0, 4);
  });

  it("creates a PnL snapshot on resolution", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10, status: "open" });
    await resolvePaperTrade(1, "Yes", 1.0);
    const snapshots = sqlite().prepare("SELECT * FROM pnl_snapshot WHERE paper_trade_id = ?").all(1) as unknown[];
    expect(snapshots.length).toBe(1);
    const snap = snapshots[0] as Record<string, unknown>;
    expect(snap.price).toBe(1.0);
    expect(snap.pnl).toBeCloseTo(10.0, 4);
  });
});

// ─── processPendingDecisions ───────────────────────────────────

describe("processPendingDecisions", () => {
  it("returns zero created when no pending decisions", async () => {
    const result = await processPendingDecisions();
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("creates paper trades for paper_copy decisions without existing trades", async () => {
    seedObservedTrade({ id: 10, side: "yes", detected_price: 0.60 });
    seedObservedTrade({ id: 20, side: "no", detected_price: 0.40 });
    seedDecision({ id: 1, decision: "paper_copy", observed_trade_id: 10, wallet_address: "0xA", market_id: "m1", simulated_position_size: 10 });
    seedDecision({ id: 2, decision: "paper_copy", observed_trade_id: 20, wallet_address: "0xB", market_id: "m2", simulated_position_size: 15 });

    const result = await processPendingDecisions();
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("excludes non-paper_copy decisions at the query level", async () => {
    seedDecision({ id: 1, decision: "watchlist", wallet_address: "0xA", market_id: "m1" });
    seedDecision({ id: 2, decision: "skip", wallet_address: "0xB", market_id: "m2" });

    // The WHERE clause filters to only paper_copy, so these are never seen
    const result = await processPendingDecisions();
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("skips decisions that already have a paper trade", async () => {
    seedObservedTrade({ id: 10 });
    seedDecision({ id: 1, decision: "paper_copy", observed_trade_id: 10, wallet_address: "0xA", market_id: "m1" });
    seedPaperTrade({ id: 100, decision_journal_id: 1, wallet_address: "0xA", market_id: "m1", side: "yes", entry_price: 0.50, simulated_position_size: 10, status: "open" });

    const result = await processPendingDecisions();
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("respects the limit parameter", async () => {
    for (let i = 1; i <= 5; i++) {
      seedObservedTrade({ id: i + 100, side: "yes", detected_price: 0.50 + i * 0.02 });
      seedDecision({ id: i, decision: "paper_copy", observed_trade_id: i + 100, wallet_address: "0xW", market_id: `m${i}`, simulated_position_size: 10 });
    }

    const result = await processPendingDecisions(3);
    expect(result.created).toBe(3);
  });
});

// ─── Query Functions ───────────────────────────────────────────

describe("getOpenPaperTrades", () => {
  it("returns only open trades", async () => {
    seedPaperTrade({ id: 1, status: "open", wallet_address: "0xA", market_id: "m1", side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    seedPaperTrade({ id: 2, status: "closed", wallet_address: "0xB", market_id: "m2", side: "no", entry_price: 0.40, simulated_position_size: 10 });
    seedPaperTrade({ id: 3, status: "resolved", wallet_address: "0xC", market_id: "m3", side: "yes", entry_price: 0.60, simulated_position_size: 10 });

    const trades = await getOpenPaperTrades();
    expect(trades.length).toBe(1);
    expect(trades[0].id).toBe(1);
  });
});

describe("getPaperTradesByWallet", () => {
  it("returns trades for a specific wallet", async () => {
    seedPaperTrade({ id: 1, status: "open", wallet_address: "0xA", market_id: "m1", side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    seedPaperTrade({ id: 2, status: "open", wallet_address: "0xB", market_id: "m2", side: "no", entry_price: 0.40, simulated_position_size: 10 });
    seedPaperTrade({ id: 3, status: "open", wallet_address: "0xA", market_id: "m3", side: "yes", entry_price: 0.60, simulated_position_size: 10 });

    const trades = await getPaperTradesByWallet("0xA");
    expect(trades.length).toBe(2);
  });
});

describe("getPaperTradesByStatus", () => {
  it("returns trades with given status", async () => {
    seedPaperTrade({ id: 1, status: "open", wallet_address: "0xA", market_id: "m1", side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    seedPaperTrade({ id: 2, status: "resolved", wallet_address: "0xB", market_id: "m2", side: "no", entry_price: 0.40, simulated_position_size: 10 });

    const resolved = await getPaperTradesByStatus("resolved");
    expect(resolved.length).toBe(1);
    expect(resolved[0].id).toBe(2);
  });
});

describe("getPaperTradeSnapshot", () => {
  it("returns null when trade does not exist", async () => {
    const snap = await getPaperTradeSnapshot(999);
    expect(snap).toBeNull();
  });

  it("returns pnl based on unrealized for open trades", async () => {
    seedPaperTrade({ id: 1, status: "open", entry_price: 0.50, current_price: 0.55, unrealized_pnl: 2.5, simulated_position_size: 10, side: "yes" });

    const snap = await getPaperTradeSnapshot(1);
    expect(snap).not.toBeNull();
    expect(snap!.pnl).toBe(2.5);
    expect(snap!.pnlPercent).toBe(25);
    expect(snap!.inProfit).toBe(true);
  });

  it("returns pnl based on realized for resolved trades", async () => {
    seedPaperTrade({ id: 1, status: "resolved", entry_price: 0.50, realized_pnl: -5, simulated_position_size: 10, side: "yes" });

    const snap = await getPaperTradeSnapshot(1);
    expect(snap!.pnl).toBe(-5);
    expect(snap!.pnlPercent).toBe(-50);
    expect(snap!.inProfit).toBe(false);
  });
});

describe("getPaperPortfolioStats", () => {
  it("returns zero stats when no trades exist", async () => {
    const stats = await getPaperPortfolioStats();
    expect(stats.openCount).toBe(0);
    expect(stats.resolvedCount).toBe(0);
    expect(stats.totalPnl).toBe(0);
    expect(stats.winRate).toBe(0);
  });

  it("calculates aggregate stats correctly", async () => {
    seedPaperTrade({ id: 1, status: "open", unrealized_pnl: 5, simulated_position_size: 10, side: "yes", entry_price: 0.50 });
    seedPaperTrade({ id: 2, status: "open", unrealized_pnl: -2, simulated_position_size: 10, side: "no", entry_price: 0.40 });
    seedPaperTrade({ id: 3, status: "resolved", realized_pnl: 10, simulated_position_size: 10, side: "yes", entry_price: 0.50 });
    seedPaperTrade({ id: 4, status: "resolved", realized_pnl: -5, simulated_position_size: 10, side: "no", entry_price: 0.40 });

    const stats = await getPaperPortfolioStats();
    expect(stats.openCount).toBe(2);
    expect(stats.resolvedCount).toBe(2);
    expect(stats.totalUnrealizedPnl).toBeCloseTo(3, 4);
    expect(stats.totalRealizedPnl).toBeCloseTo(5, 4);
    expect(stats.totalPnl).toBeCloseTo(8, 4);
    expect(stats.winCount).toBe(1);
    expect(stats.lossCount).toBe(1);
    expect(stats.winRate).toBe(0.5);
  });
});

describe("hasPaperTrade", () => {
  it("returns false when no trade exists for decision", async () => {
    const exists = await hasPaperTrade(999);
    expect(exists).toBe(false);
  });

  it("returns true when trade exists for decision", async () => {
    seedPaperTrade({ id: 1, decision_journal_id: 42, wallet_address: "0xA", market_id: "m1", side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    const exists = await hasPaperTrade(42);
    expect(exists).toBe(true);
  });
});
