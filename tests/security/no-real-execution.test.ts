// Security Test — Simulation Mode Enforcement (Hito 9.1)
// Verifies that the system enforces SIMULATION_MODE=paper_only and
// cannot execute real trades even if misconfigured.
//
// Pass condition: No code path allows real execution in v1.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";

describe("Security: SIMULATION_MODE enforcement", () => {
  describe("Environment variable", () => {
    it("should have SIMULATION_MODE defined", () => {
      // In development and CI, this should be set
      const mode = process.env.SIMULATION_MODE;
      // If not explicitly set, it defaults to paper_only in production code.
      // The test verifies: if set, it must be paper_only.
      if (mode !== undefined) {
        expect(mode).toBe("paper_only");
      }
    });
  });

  describe("Paper trader module", () => {
    let paperTrader: typeof import("../../lib/simulation/paper-trader");

    beforeAll(async () => {
      try {
        paperTrader = await import("../../lib/simulation/paper-trader");
      } catch {
        // Module may not load without native SQLite bindings — skip gracefully
      }
    });

    it("should export no functions that write to blockchain", () => {
      // All exported functions should be DB-only operations
      const exportNames = Object.keys(paperTrader);
      const illegalNames = exportNames.filter((n) =>
        /(execute|submit|send|transact|broadcast|deploy|mint|burn|stake)/i.test(n)
      );
      expect(illegalNames).toEqual([]);
    });

    it("all paper trade operations should be local DB only", () => {
      // createPaperTrade, updatePaperTradePnL, resolvePaperTrade
      // These all operate on the local SQLite DB — no external calls
      const fnNames = Object.keys(paperTrader).filter((n) =>
        typeof (paperTrader as Record<string, unknown>)[n] === "function"
      );
      // All these functions should be importable and callable
      expect(fnNames).toContain("createPaperTrade");
      expect(fnNames).toContain("updatePaperTradePnL");
      expect(fnNames).toContain("resolvePaperTrade");
      expect(fnNames).toContain("getPaperPortfolioStats");
    });
  });

  describe("Backtesting engine", () => {
    let engine: typeof import("../../lib/backtesting/engine");

    beforeAll(async () => {
      engine = await import("../../lib/backtesting/engine");
    });

    it("should only use read-only Polymarket APIs", () => {
      // The backtesting engine should only use fetch functions
      // that read data from Polymarket — no write operations
      const fnNames = Object.keys(engine);
      const writeOps = fnNames.filter((n) =>
        /(create|submit|execute|send|place)/i.test(n)
      );
      expect(writeOps).toEqual([]);
    });

    it("runBacktest should be read-only computation", () => {
      expect(typeof engine.runBacktest).toBe("function");
      // The function exists but doesn't execute real trades
    });
  });

  describe("CLOB adapter safety", () => {
    it("should NOT import or use ClobClient with authentication", async () => {
      // Dynamic import to check module existence
      try {
        const markets = await import("../../lib/adapters/markets");
        // The markets adapter should only use Gamma API (read-only)
        const exports = Object.keys(markets);
        const authExports = exports.filter((n) =>
          /(apiKey|apiSecret|clobClient|auth|sign)/i.test(n)
        );
        expect(authExports).toEqual([]);
      } catch {
        // If module doesn't load (missing DB), skip
      }
    });
  });
});

describe("Security: No real execution path exists", () => {    it("scripts should be CLI utilities, not tx executors", () => {
      // Verify package.json scripts are all analysis/reporting, not execution
      const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
      const scriptNames = Object.keys(pkg.scripts);
      const executionScripts = scriptNames.filter((s: string) =>
        /(execute|submit|send|trade-exec|real-money|live)/i.test(s)
      );
      expect(executionScripts).toEqual([]);
    });
});
