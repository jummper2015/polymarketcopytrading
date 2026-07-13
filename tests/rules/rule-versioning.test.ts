// tests/rules/rule-versioning.test.ts
// Hito 5.3 — Tests for rule versioning and change tracking
// Verifies that rule sets are properly versioned, activated/deactivated,
// and that changes are recorded with before/after state.

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
    `CREATE TABLE rule_set (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, version text NOT NULL, active integer DEFAULT 1, rules_json text NOT NULL, created_at integer DEFAULT (unixepoch()) NOT NULL, updated_at integer DEFAULT (unixepoch()) NOT NULL)`,
    `CREATE TABLE rule_change (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, old_rule_set_id integer, new_rule_set_id integer NOT NULL, changed_by text NOT NULL, reason text, evidence_summary text, before_json text, after_json text, created_at integer DEFAULT (unixepoch()) NOT NULL)`,
  ];
  for (const sql of tables) sqlite.exec(sql);

  const db = drizzle(sqlite);
  _sqlite = sqlite;
  return { db };
});

import {
  getDefaultRules,
  loadActiveRules,
  parseRules,
  getRuleHistory,
  proposeRuleChange,
  applyRuleChange,
} from "@/lib/rules/rule-engine";

function sqlite() {
  if (!_sqlite) throw new Error("DB not initialized");
  return _sqlite;
}

function clearAll() {
  sqlite().exec("DELETE FROM rule_change");
  sqlite().exec("DELETE FROM rule_set");
}

beforeEach(() => {
  clearAll();
});

// ─── Default Rules ────────────────────────────────────────────

describe("getDefaultRules", () => {
  it("returns rules with all required thresholds", () => {
    const rules = getDefaultRules();
    expect(rules.version).toBe("1.0.0");
    expect(rules.thresholds.minGlobalScore).toBe(0.65);
    expect(rules.thresholds.minLiquidity).toBe(1000);
    expect(rules.thresholds.maxSpread).toBe(0.05);
    expect(rules.thresholds.maxEntryDelayMinutes).toBe(30);
    expect(rules.thresholds.minTimeToResolutionHours).toBe(2);
    expect(rules.thresholds.minConsistencyScore).toBe(0.4);
    expect(rules.thresholds.maxOneHitWonderRatio).toBe(0.4);
    expect(rules.thresholds.minResolvedTrades).toBe(5);
    expect(rules.thresholds.paperPositionMin).toBe(5);
    expect(rules.thresholds.paperPositionMax).toBe(20);
  });

  it("returns rules with all required weights that sum to 1", () => {
    const rules = getDefaultRules();
    const weights = Object.values(rules.weights);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 10);
    expect(rules.weights.walletQuality).toBe(0.25);
    expect(rules.weights.categoryFit).toBe(0.15);
    expect(rules.weights.entryTiming).toBe(0.15);
    expect(rules.weights.spread).toBe(0.10);
    expect(rules.weights.liquidity).toBe(0.10);
    expect(rules.weights.roi).toBe(0.10);
    expect(rules.weights.thesis).toBe(0.10);
    expect(rules.weights.timeToResolution).toBe(0.05);
  });
});

// ─── Load & Seed ──────────────────────────────────────────────

describe("loadActiveRules", () => {
  it("seeds default rules when no rules exist", async () => {
    const rules = await loadActiveRules();
    expect(rules).not.toBeNull();
    expect(rules.version).toBe("1.0.0");
    expect(rules.active).toBe(true);

    // Verify it was inserted into the DB
    const rows = sqlite().prepare("SELECT * FROM rule_set").all() as unknown[];
    expect(rows.length).toBe(1);
  });

  it("returns existing active rules when they exist", async () => {
    // Seed a rule set manually
    const stmt = sqlite().prepare(
      "INSERT INTO rule_set (version, active, rules_json) VALUES (?, ?, ?)"
    );
    stmt.run("2.0.0", 1, JSON.stringify(getDefaultRules()));

    const rules = await loadActiveRules();
    expect(rules.version).toBe("2.0.0");
    expect(rules.active).toBe(true);
  });

  it("returns only active rules (not inactive)", async () => {
    const stmt = sqlite().prepare(
      "INSERT INTO rule_set (version, active, rules_json) VALUES (?, ?, ?)"
    );
    stmt.run("1.0.0", 0, JSON.stringify(getDefaultRules()));
    stmt.run("2.0.0", 1, JSON.stringify(getDefaultRules()));

    const rules = await loadActiveRules();
    expect(rules.version).toBe("2.0.0");
  });
});

// ─── Parse Rules ──────────────────────────────────────────────

describe("parseRules", () => {
  it("parses rules JSON from a RuleSetRecord", () => {
    const record = {
      id: 1,
      version: "1.0.0",
      active: true,
      rulesJson: JSON.stringify(getDefaultRules()),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parsed = parseRules(record);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.thresholds.minGlobalScore).toBe(0.65);
  });

  it("fills in missing fields with defaults", () => {
    const record = {
      id: 1,
      version: "1.0.0",
      active: true,
      rulesJson: JSON.stringify({ version: "1.1.0", thresholds: { minLiquidity: 500 } }),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parsed = parseRules(record);
    expect(parsed.version).toBe("1.1.0");
    expect(parsed.thresholds.minLiquidity).toBe(500); // overridden
    expect(parsed.thresholds.minGlobalScore).toBe(0.65); // default
  });
});

// ─── Rule History ─────────────────────────────────────────────

describe("getRuleHistory", () => {
  it("returns empty array when no changes exist", async () => {
    const history = await getRuleHistory();
    expect(history).toEqual([]);
  });

  it("returns changes with parsed before/after JSON", async () => {
    const stmt = sqlite().prepare("INSERT INTO rule_set (version, active, rules_json) VALUES (?, ?, ?)");
    stmt.run("1.0.0", 0, JSON.stringify({ version: "1.0.0", thresholds: { minLiquidity: 1000 } }));
    stmt.run("2.0.0", 1, JSON.stringify({ version: "2.0.0", thresholds: { minLiquidity: 800 } }));

    const before = JSON.stringify({ version: "1.0.0", thresholds: { minLiquidity: 1000 } });
    const after = JSON.stringify({ version: "2.0.0", thresholds: { minLiquidity: 800 } });

    const changeStmt = sqlite().prepare(
      "INSERT INTO rule_change (old_rule_set_id, new_rule_set_id, changed_by, reason, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    changeStmt.run(1, 2, "hermes", "Tightened liquidity", before, after, Math.floor(Date.now() / 1000));

    const history = await getRuleHistory();
    expect(history.length).toBe(1);
    expect(history[0].changedBy).toBe("hermes");
    expect(history[0].before).toEqual({ version: "1.0.0", thresholds: { minLiquidity: 1000 } });
    expect(history[0].after).toEqual({ version: "2.0.0", thresholds: { minLiquidity: 800 } });
  });
});

// ─── Apply Changes ────────────────────────────────────────────

describe("applyRuleChange", () => {
  it("creates a new rule set and deactivates the old one", async () => {
    // Seed default rules first
    await loadActiveRules();

    const proposal = {
      reason: "Test tightening",
      evidenceSummary: "Test evidence",
      changes: {
        thresholds: { minGlobalScore: 0.70 },
      },
    };

    const result = await applyRuleChange(proposal);
    // oldRuleSet is the snapshot BEFORE deactivation (active=true)
    expect(result.oldRuleSet.version).toBe("1.0.0");
    expect(result.oldRuleSet.active).toBe(true);
    expect(result.newRuleSet.version).toBe("1.0.1");
    expect(result.newRuleSet.active).toBe(true);
    expect(result.change.changedBy).toBe("hermes");
    expect(result.change.reason).toBe("Test tightening");

    // Verify the new rules have the updated threshold
    const newData = parseRules(result.newRuleSet);
    expect(newData.thresholds.minGlobalScore).toBe(0.70);
  });

  it("preserves thresholds not being changed", async () => {
    await loadActiveRules();

    const proposal = {
      reason: "Only change spread",
      evidenceSummary: "Evidence",
      changes: {
        thresholds: { maxSpread: 0.03 },
      },
    };

    const result = await applyRuleChange(proposal);
    const newData = parseRules(result.newRuleSet);
    expect(newData.thresholds.maxSpread).toBe(0.03);
    // All other thresholds should remain at defaults
    expect(newData.thresholds.minLiquidity).toBe(1000);
    expect(newData.thresholds.minGlobalScore).toBe(0.65);
  });

  it("can update weights", async () => {
    await loadActiveRules();

    const proposal = {
      reason: "Weight adjustment",
      evidenceSummary: "Evidence",
      changes: {
        weights: { walletQuality: 0.30 },
      },
    };

    const result = await applyRuleChange(proposal);
    const newData = parseRules(result.newRuleSet);
    expect(newData.weights.walletQuality).toBe(0.30);
  });

  it("bumps version correctly", async () => {
    await loadActiveRules();

    // Apply 3 changes, versions should go 1.0.0 → 1.0.1 → 1.0.2 → 1.0.3
    for (let i = 1; i <= 3; i++) {
      const result = await applyRuleChange({
        reason: `Change ${i}`,
        evidenceSummary: `Evidence ${i}`,
        changes: { thresholds: { minGlobalScore: 0.6 + i * 0.05 } },
      });
      expect(result.newRuleSet.version).toBe(`1.0.${i}`);
    }
  });
});
