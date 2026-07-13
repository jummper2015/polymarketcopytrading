// tests/simulation/update-pnl.test.ts
// Hito 4.6 — Tests for the PnL update mechanism
// Verifies that updatePaperTradePnL correctly calculates unrealized PnL
// for both YES and NO sides, creates snapshots, and handles edge cases.

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
    `CREATE TABLE paper_trade (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, decision_journal_id integer, wallet_address text NOT NULL, market_id text NOT NULL, outcome text, side text NOT NULL, entry_price real NOT NULL, current_price real, simulated_position_size real NOT NULL, unrealized_pnl real DEFAULT 0, realized_pnl real DEFAULT 0, status text DEFAULT 'open' NOT NULL, opened_at integer DEFAULT (unixepoch()) NOT NULL, closed_at integer, resolved_at integer)`,
    `CREATE TABLE pnl_snapshot (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, paper_trade_id integer NOT NULL, price real NOT NULL, pnl real NOT NULL, collected_at integer DEFAULT (unixepoch()) NOT NULL, FOREIGN KEY (paper_trade_id) REFERENCES paper_trade(id))`,
    `CREATE TABLE decision_journal (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, observed_trade_id integer, wallet_address text NOT NULL, market_id text NOT NULL, decision text NOT NULL, copy_score real DEFAULT 0, confidence real DEFAULT 0, reasons_json text, risks_json text, wallet_quality_score real DEFAULT 0, roi_score real DEFAULT 0, consistency_score real DEFAULT 0, copyability_score real DEFAULT 0, category_fit_score real DEFAULT 0, entry_timing_score real DEFAULT 0, spread_score real DEFAULT 0, liquidity_score real DEFAULT 0, thesis_score real DEFAULT 0, simulated_position_size real, created_at integer DEFAULT (unixepoch()) NOT NULL)`,
    `CREATE TABLE observed_trade (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, wallet_address text NOT NULL, market_id text NOT NULL, condition_id text, market_question text, market_category text, outcome text, side text, wallet_entry_price real, detected_price real, size real, timestamp integer DEFAULT (unixepoch()) NOT NULL, raw_trade_json text, created_at integer DEFAULT (unixepoch()) NOT NULL)`,
  ];
  for (const sql of tables) sqlite.exec(sql);

  const db = drizzle(sqlite);
  _sqlite = sqlite;
  return { db };
});

import {
  updatePaperTradePnL,
  updateBatchPnL,
} from "@/lib/simulation/paper-trader";

function sqlite() {
  if (!_sqlite) throw new Error("DB not initialized");
  return _sqlite;
}

const now = Math.floor(Date.now() / 1000);

function seedPaperTrade(overrides: Record<string, unknown> = {}) {
  const stmt = sqlite().prepare(
    `INSERT INTO paper_trade (id, decision_journal_id, wallet_address, market_id, side, entry_price, current_price, simulated_position_size, unrealized_pnl, realized_pnl, status, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
    overrides.id ?? 1,
    has(overrides, "decision_journal_id") ? overrides.decision_journal_id : null,
    overrides.wallet_address ?? "0xTest",
    overrides.market_id ?? "market-1",
    overrides.side ?? "yes",
    overrides.entry_price ?? 0.50,
    overrides.current_price ?? 0.50,
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

function clearAll() {
  sqlite().exec("DELETE FROM pnl_snapshot");
  sqlite().exec("DELETE FROM paper_trade");
}

beforeEach(() => {
  clearAll();
});

// ─── updatePaperTradePnL ───────────────────────────────────────

describe("updatePaperTradePnL", () => {
  // ── Basic Calculations ──────────────────────────────────────

  it("calculates correct PnL for YES side when price increases", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.65);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    // shares = 10 / 0.50 = 20, pnl = 20 * (0.65 - 0.50) = 3.0
    expect(row.unrealized_pnl).toBeCloseTo(3.0, 4);
  });

  it("calculates correct PnL for YES side when price decreases", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.35);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    expect(row.unrealized_pnl).toBeCloseTo(-3.0, 4);
  });

  it("calculates correct PnL for NO side when price decreases (favorable)", async () => {
    seedPaperTrade({ id: 1, side: "no", entry_price: 0.40, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.25);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    // shares = 10 / 0.40 = 25, pnl = 25 * (0.25 - 0.40) = -3.75
    expect(row.unrealized_pnl).toBeCloseTo(-3.75, 4);
  });

  it("calculates correct PnL for NO side when price increases (unfavorable)", async () => {
    seedPaperTrade({ id: 1, side: "no", entry_price: 0.40, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.55);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    expect(row.unrealized_pnl).toBeCloseTo(3.75, 4);
  });

  // ── Edge Cases ──────────────────────────────────────────────

  it("does nothing when paper trade does not exist", async () => {
    await expect(updatePaperTradePnL(999, 0.60)).resolves.toBeUndefined();
  });

  it("does not update closed trades", async () => {
    seedPaperTrade({ id: 1, status: "closed", unrealized_pnl: 5, realized_pnl: 5 });
    await updatePaperTradePnL(1, 0.80);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    expect(row.unrealized_pnl).toBe(5);
    expect(row.realized_pnl).toBe(5);
    expect(row.current_price).toBe(0.50);
  });

  it("does not update resolved trades", async () => {
    seedPaperTrade({ id: 1, status: "resolved", unrealized_pnl: 0, realized_pnl: 10 });
    await updatePaperTradePnL(1, 0.80);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    expect(row.unrealized_pnl).toBe(0);
    expect(row.realized_pnl).toBe(10);
  });

  it("handles very small position sizes", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 1 });
    await updatePaperTradePnL(1, 0.70);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    expect(row.unrealized_pnl).toBeCloseTo(0.4, 4);
  });

  it("handles very large position sizes", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.10, simulated_position_size: 100 });
    await updatePaperTradePnL(1, 0.20);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    // shares = 100 / 0.10 = 1000, pnl = 1000 * (0.20 - 0.10) = 100
    expect(row.unrealized_pnl).toBeCloseTo(100, 4);
  });

  it("handles extreme price at 0.01", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.01, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.02);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    // shares = 10 / 0.01 = 1000, pnl = 1000 * (0.02 - 0.01) = 10
    expect(row.unrealized_pnl).toBeCloseTo(10, 4);
  });

  it("handles extreme price at 0.99", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.99, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.50);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    // shares = 10 / 0.99 ≈ 10.10, pnl = 10.10 * (0.50 - 0.99) ≈ -4.95
    expect(row.unrealized_pnl).toBeLessThan(0);
  });

  // ── Snapshots ───────────────────────────────────────────────

  it("creates a PnL snapshot on each update", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.60);

    const snapshots = sqlite().prepare("SELECT * FROM pnl_snapshot WHERE paper_trade_id = 1").all() as unknown[];
    expect(snapshots.length).toBe(1);
    const snap = snapshots[0] as Record<string, unknown>;
    expect(snap.price).toBe(0.60);
    expect(snap.pnl).toBeCloseTo(2.0, 4);
    expect(snap.paper_trade_id).toBe(1);
  });

  it("creates multiple snapshots for multiple updates", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.55);
    await updatePaperTradePnL(1, 0.60);
    await updatePaperTradePnL(1, 0.45);

    const snapshots = sqlite().prepare("SELECT * FROM pnl_snapshot WHERE paper_trade_id = 1").all() as unknown[];
    expect(snapshots.length).toBe(3);
  });

  it("updates the currentPrice in the paper trade", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.72);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    expect(row.current_price).toBe(0.72);
  });

  // ── PnL Rounding ────────────────────────────────────────────

  it("rounds PnL to 4 decimal places", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    await updatePaperTradePnL(1, 0.50001);

    const row = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    // shares = 20, pnl = 20 * 0.00001 = 0.0002
    expect(row.unrealized_pnl).toBeCloseTo(0.0002, 4);
  });
});

// ─── updateBatchPnL ────────────────────────────────────────────

describe("updateBatchPnL", () => {
  it("updates multiple trades in batch", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    seedPaperTrade({ id: 2, side: "no", entry_price: 0.40, simulated_position_size: 15 });

    const priceMap = new Map<number, number>();
    priceMap.set(1, 0.60);
    priceMap.set(2, 0.30);

    await updateBatchPnL(priceMap);

    const row1 = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 1").get() as Record<string, unknown>;
    const row2 = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 2").get() as Record<string, unknown>;

    expect(row1.unrealized_pnl).toBeCloseTo(2.0, 4);
    expect(row2.unrealized_pnl).toBeCloseTo(-3.75, 4);
  });

  it("handles empty price map gracefully", async () => {
    await expect(updateBatchPnL(new Map())).resolves.toBeUndefined();
  });

  it("skips trades that do not exist in the map", async () => {
    seedPaperTrade({ id: 1, side: "yes", entry_price: 0.50, simulated_position_size: 10 });
    seedPaperTrade({ id: 2, side: "no", entry_price: 0.40, simulated_position_size: 15 });

    const priceMap = new Map<number, number>();
    priceMap.set(1, 0.60);

    await updateBatchPnL(priceMap);

    const row2 = sqlite().prepare("SELECT * FROM paper_trade WHERE id = 2").get() as Record<string, unknown>;
    // Trade 2 should not have been updated
    expect(row2.unrealized_pnl).toBe(0);
  });
});
