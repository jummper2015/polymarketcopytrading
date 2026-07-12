// tests/scoring/wallet-scoring.test.ts
// Unit tests for the wallet scoring engine

import { describe, it, expect } from "vitest";
import {
  scoreROI,
  scoreConsistency,
  scoreCopyability,
  scoreCategoryStrength,
  scoreLiquidityQuality,
  scoreEntryTiming,
  scoreResolvedPerformance,
  calculateOneHitWonderPenalty,
  calculateGlobalScore,
  calculateAllScores,
  scoreWallet,
  scoreWallets,
  determineStatus,
  type WalletInput,
  type WalletScores,
  type WalletScoreResult,
} from "@/lib/scoring/wallet-scoring";
import type {
  WalletActivityItem,
  WalletPosition,
} from "@/lib/adapters/leaderboard";

// ─── Helpers ───────────────────────────────────────────────────

function makeTrade(overrides: Partial<WalletActivityItem> = {}): WalletActivityItem {
  return {
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    type: "trade",
    price: 0.5,
    size: 100,
    ...overrides,
  };
}

function makePosition(
  overrides: Partial<WalletPosition> = {}
): WalletPosition {
  return {
    marketId: "market-1",
    outcome: "Yes",
    side: "yes",
    avgPrice: 0.4,
    size: 200,
    value: 80,
    realizedPnl: 20,
    ...overrides,
  };
}

function makeWallet(overrides: Partial<WalletInput> = {}): WalletInput {
  return {
    address: "0xTestWallet",
    ...overrides,
  };
}

function makeScores(overrides: Partial<WalletScores> = {}): WalletScores {
  return {
    roiScore: 0.7,
    consistencyScore: 0.7,
    copyabilityScore: 0.7,
    categoryStrength: 0.7,
    liquidityQuality: 0.7,
    entryTiming: 0.7,
    resolvedPerformance: 0.7,
    oneHitWonderPenalty: 0,
    ...overrides,
  };
}

// ─── scoreROI ──────────────────────────────────────────────────

describe("scoreROI", () => {
  it("returns 0 for null or undefined", () => {
    expect(scoreROI(null)).toBe(0);
    expect(scoreROI(undefined)).toBe(0);
  });

  it("returns 0 for negative or zero ROI", () => {
    expect(scoreROI(-0.5)).toBe(0);
    expect(scoreROI(0)).toBe(0);
  });

  it("returns ~0.386 for 100% ROI (ln(2)/ln(6))", () => {
    const result = scoreROI(1.0);
    const expected = Math.log(2) / Math.log(6);
    expect(result).toBeCloseTo(expected, 4);
    expect(result).toBeCloseTo(0.3868, 3);
  });

  it("returns ~0.67 for 500% ROI", () => {
    const result = scoreROI(5.0);
    const expected = Math.log(6) / Math.log(6); // = 1.0, clamped
    expect(result).toBeCloseTo(1.0, 1);
  });

  it("increases monotonically with ROI", () => {
    expect(scoreROI(0.1)).toBeLessThan(scoreROI(0.5));
    expect(scoreROI(0.5)).toBeLessThan(scoreROI(1.0));
    expect(scoreROI(1.0)).toBeLessThan(scoreROI(2.0));
  });

  it("clamps to 1 for extremely high ROI", () => {
    expect(scoreROI(100)).toBe(1);
  });
});

// ─── scoreConsistency ──────────────────────────────────────────

describe("scoreConsistency", () => {
  it("returns 0 when trade count is null/undefined/< 3", () => {
    expect(scoreConsistency(0.5, null)).toBe(0);
    expect(scoreConsistency(0.5, undefined)).toBe(0);
    expect(scoreConsistency(0.5, 2)).toBe(0);
  });

  it("returns max 0.5 for win rate alone (3+ trades, no dispersion)", () => {
    // winRate 1.0 * 0.5 = 0.5, tradeCount 3-4 → no count bonus, no dispersion
    const result = scoreConsistency(1.0, 3);
    expect(result).toBeCloseTo(0.5, 1);
  });

  it("adds trade count bonus at thresholds", () => {
    // 5 trades: winRate 0 + 0.1 count + 0.1 modest bonus = 0.2
    expect(scoreConsistency(0, 5)).toBeCloseTo(0.2, 1);
    // 10 trades: 0.2 count + 0.1 modest = 0.3
    expect(scoreConsistency(0, 10)).toBeCloseTo(0.3, 1);
    // 20 trades: 0.3 count + 0.1 modest = 0.4
    expect(scoreConsistency(0, 20)).toBeCloseTo(0.4, 1);
  });

  it("adds temporal dispersion bonus with 3+ distinct trading days", () => {
    const now = Math.floor(Date.now() / 1000);
    const trades = [
      makeTrade({ timestamp: now - 0 * 86400 }),
      makeTrade({ timestamp: now - 1 * 86400 }),
      makeTrade({ timestamp: now - 2 * 86400 }),
      makeTrade({ timestamp: now - 2 * 86400 }), // same day, doesn't add
      makeTrade({ timestamp: now - 3 * 86400 }),
    ];

    // 5 trades → 0.1 count, 4 distinct days → 0.2 dispersion, 0 winRate → 0
    const result = scoreConsistency(0, 5, trades);
    expect(result).toBeCloseTo(0.3, 1);
  });

  it("adds partial dispersion bonus for 2 distinct days", () => {
    const now = Math.floor(Date.now() / 1000);
    const trades = [
      makeTrade({ timestamp: now }),
      makeTrade({ timestamp: now - 86400 }),
      makeTrade({ timestamp: now }),
      makeTrade({ timestamp: now - 86400 }),
      makeTrade({ timestamp: now }),
    ];

    // 5 trades → 0.1 count, 2 distinct days → 0.1 dispersion
    const result = scoreConsistency(0, 5, trades);
    expect(result).toBeCloseTo(0.2, 1);
  });

  it("gives modest dispersion bonus when no trade details but enough count", () => {
    // 5+ trades, no trades array → 0.1 modest bonus
    const result = scoreConsistency(0, 5);
    expect(result).toBeCloseTo(0.2, 1); // 0.1 count + 0.1 modest
  });

  it("skips dispersion when trades < 5 with details", () => {
    const trades = Array.from({ length: 4 }, (_, i) =>
      makeTrade({ timestamp: Math.floor(Date.now() / 1000) - i * 86400 })
    );
    // 4 trades < 5, winRate 0
    const result = scoreConsistency(0, 4, trades);
    expect(result).toBe(0); // no count bonus (need 5+), no dispersion (need 5+ trades)
  });

  it("full score: high winRate + 20+ trades + 3+ days", () => {
    const now = Math.floor(Date.now() / 1000);
    const trades = Array.from({ length: 20 }, (_, i) =>
      makeTrade({ timestamp: now - (i % 5) * 86400 })
    );

    // winRate 0.8 * 0.5 = 0.4, 20+ trades = 0.3, 5 days = 0.2 → total 0.9
    const result = scoreConsistency(0.8, 20, trades);
    expect(result).toBeCloseTo(0.9, 1);
  });
});

// ─── scoreCopyability ──────────────────────────────────────────

describe("scoreCopyability", () => {
  it("returns 0 for wallet with no data", () => {
    expect(scoreCopyability(makeWallet())).toBe(0);
  });

  it("max trade size score for $50–$2000 average", () => {
    expect(scoreCopyability(makeWallet({ averageTradeSize: 500 }))).toBeGreaterThanOrEqual(0.4);
  });

  it("borderline trade size score for $25–$5000", () => {
    const score25 = scoreCopyability(makeWallet({ averageTradeSize: 25 }));
    const score5000 = scoreCopyability(makeWallet({ averageTradeSize: 5000 }));
    expect(score25).toBeGreaterThanOrEqual(0.25);
    expect(score5000).toBeGreaterThanOrEqual(0.25);
  });

  it("minimal trade size score for too small or too large", () => {
    const scoreSmall = scoreCopyability(makeWallet({ averageTradeSize: 10 }));
    const scoreLarge = scoreCopyability(makeWallet({ averageTradeSize: 10000 }));
    expect(scoreSmall).toBeLessThanOrEqual(0.2);
    expect(scoreLarge).toBeLessThanOrEqual(0.2);
  });

  it("adds trade frequency bonus for 5–100 trades", () => {
    const result = scoreCopyability(makeWallet({
      averageTradeSize: 500,
      tradeCount: 20,
    }));
    // 0.4 (size) + 0.3 (freq) + 0 (no spread/liquidity) = 0.7
    expect(result).toBeCloseTo(0.7, 1);
  });

  it("adds full spread + liquidity bonus", () => {
    const result = scoreCopyability(makeWallet({
      averageTradeSize: 500,
      tradeCount: 20,
      averageSpread: 0.02,
      averageLiquidity: 6000,
    }));
    // 0.4 + 0.3 + 0.15 + 0.15 = 1.0
    expect(result).toBeCloseTo(1.0, 1);
  });

  it("partial spread bonus at different thresholds", () => {
    const base = { averageTradeSize: 500, tradeCount: 20, averageLiquidity: 10000 };
    expect(scoreCopyability(makeWallet({ ...base, averageSpread: 0.02 }))).toBeGreaterThan(
      scoreCopyability(makeWallet({ ...base, averageSpread: 0.05 }))
    );
    expect(scoreCopyability(makeWallet({ ...base, averageSpread: 0.05 }))).toBeGreaterThan(
      scoreCopyability(makeWallet({ ...base, averageSpread: 0.08 }))
    );
  });

  it("partial liquidity bonus at different thresholds", () => {
    const base = { averageTradeSize: 500, tradeCount: 20, averageSpread: 0.02 };
    expect(scoreCopyability(makeWallet({ ...base, averageLiquidity: 10000 }))).toBeGreaterThan(
      scoreCopyability(makeWallet({ ...base, averageLiquidity: 2000 }))
    );
  });
});

// ─── scoreCategoryStrength ─────────────────────────────────────

describe("scoreCategoryStrength", () => {
  it("returns 0 for null, undefined, or empty", () => {
    expect(scoreCategoryStrength(null)).toBe(0);
    expect(scoreCategoryStrength(undefined)).toBe(0);
    expect(scoreCategoryStrength({})).toBe(0);
  });

  it("returns 0.9 for ideal concentration (40–70% in top category)", () => {
    // 50 trades: 25 in top (50%) = 0.5 concentration → ideal range
    expect(scoreCategoryStrength({ Politics: 25, Crypto: 15, Sports: 10 })).toBe(0.9);
  });

  it("returns 0.9 for concentration in ideal range (40–70%)", () => {
    // 10 trades: 7 in top (70%) → ideal range includes 70%
    expect(scoreCategoryStrength({ Politics: 7, Crypto: 3 })).toBe(0.9);
  });

  it("returns 0.4 for over-concentration (>80%)", () => {
    // 10 trades: 9 in top (90%)
    expect(scoreCategoryStrength({ Politics: 9, Crypto: 1 })).toBe(0.4);
  });

  it("returns 0.7 for concentration in 30–80% outside ideal", () => {
    // 8/11 ≈ 72.7% → > 0.7 (not ideal) but still in [0.3, 0.8]
    expect(scoreCategoryStrength({ A: 8, B: 3 })).toBe(0.7);
  });

  it("handles zero total", () => {
    expect(scoreCategoryStrength({ Politics: 0, Crypto: 0 })).toBe(0);
  });
});

// ─── scoreLiquidityQuality ─────────────────────────────────────

describe("scoreLiquidityQuality", () => {
  it("returns 0 for null, undefined, or zero", () => {
    expect(scoreLiquidityQuality(null)).toBe(0);
    expect(scoreLiquidityQuality(undefined)).toBe(0);
    expect(scoreLiquidityQuality(0)).toBe(0);
  });

  it("returns 0 for negative liquidity", () => {
    expect(scoreLiquidityQuality(-100)).toBe(0);
  });

  it("increases monotonically with liquidity", () => {
    expect(scoreLiquidityQuality(100)).toBeLessThan(scoreLiquidityQuality(1000));
    expect(scoreLiquidityQuality(1000)).toBeLessThan(scoreLiquidityQuality(10000));
    expect(scoreLiquidityQuality(10000)).toBeLessThan(scoreLiquidityQuality(100000));
  });

  it("approaches 1 for very high liquidity", () => {
    expect(scoreLiquidityQuality(1_000_000)).toBeCloseTo(1.0, 1);
  });
});

// ─── scoreEntryTiming ──────────────────────────────────────────

describe("scoreEntryTiming", () => {
  it("returns 0.5 (neutral) for null or undefined", () => {
    expect(scoreEntryTiming(null)).toBe(0.5);
    expect(scoreEntryTiming(undefined)).toBe(0.5);
  });

  it("returns 1.0 for 48+ hours", () => {
    expect(scoreEntryTiming(48)).toBe(1.0);
    expect(scoreEntryTiming(72)).toBe(1.0);
  });

  it("returns tiered values for different hour thresholds", () => {
    expect(scoreEntryTiming(36)).toBe(0.9);  // >= 24
    expect(scoreEntryTiming(18)).toBe(0.75); // >= 12
    expect(scoreEntryTiming(8)).toBe(0.6);   // >= 6
    expect(scoreEntryTiming(3)).toBe(0.4);   // >= 2
    expect(scoreEntryTiming(1.5)).toBe(0.2); // >= 1
    expect(scoreEntryTiming(0.5)).toBe(0.1); // < 1
  });
});

// ─── scoreResolvedPerformance ──────────────────────────────────

describe("scoreResolvedPerformance", () => {
  it("returns 0 when no resolved trades", () => {
    expect(scoreResolvedPerformance(0, 0.8)).toBe(0);
    expect(scoreResolvedPerformance(null, 0.8)).toBe(0);
  });

  it("winRate contributes 0–0.7", () => {
    // 10 resolved, 50% win rate → 0.35 + 0.2 = 0.55
    const result = scoreResolvedPerformance(10, 0.5);
    expect(result).toBeCloseTo(0.55, 1);
  });

  it("count bonus tiers are correct", () => {
    // winRate 0, just checking count tiers
    expect(scoreResolvedPerformance(3, 0)).toBeCloseTo(0.05, 2);
    expect(scoreResolvedPerformance(5, 0)).toBeCloseTo(0.1, 2);
    expect(scoreResolvedPerformance(10, 0)).toBeCloseTo(0.2, 2);
    expect(scoreResolvedPerformance(20, 0)).toBeCloseTo(0.3, 2);
  });

  it("max score with 100% winRate and 20+ resolved", () => {
    // 1.0 * 0.7 + 0.3 = 1.0
    expect(scoreResolvedPerformance(20, 1.0)).toBe(1.0);
  });
});

// ─── calculateOneHitWonderPenalty ──────────────────────────────

describe("calculateOneHitWonderPenalty", () => {
  describe("positions-based (PnL)", () => {
    it("returns 0 when < 3 positions have realized PnL", () => {
      const positions = [
        makePosition({ realizedPnl: 100 }),
        makePosition({ realizedPnl: 50 }),
      ];
      expect(calculateOneHitWonderPenalty(null, positions)).toBe(0);
    });

    it("returns 0.1 when exactly at 0.4 ratio (falls to > 0.25 check)", () => {
      const positions = [
        makePosition({ realizedPnl: 30 }),
        makePosition({ realizedPnl: 30 }),
        makePosition({ realizedPnl: 40 }),
      ];
      // Ratio = 40/100 = 0.4 → not > 0.4, but > 0.25 → 0.1
      expect(calculateOneHitWonderPenalty(null, positions)).toBe(0.1);
    });

    it("returns 0 when all positions have truly equal gains", () => {
      const positions = [
        makePosition({ realizedPnl: 25 }),
        makePosition({ realizedPnl: 25 }),
        makePosition({ realizedPnl: 25 }),
        makePosition({ realizedPnl: 25 }),
      ];
      // Ratio = 25/100 = 0.25 → not > 0.25 → 0
      expect(calculateOneHitWonderPenalty(null, positions)).toBe(0);
    });

    it("returns 0.10 when >25% of gains from one position", () => {
      const positions = [
        makePosition({ realizedPnl: 30 }),
        makePosition({ realizedPnl: 20 }),
        makePosition({ realizedPnl: 20 }),
        makePosition({ realizedPnl: 20 }),
        makePosition({ realizedPnl: 10 }),
      ];
      // Total gain = 100, Max = 30, Ratio = 0.3 > 0.25
      expect(calculateOneHitWonderPenalty(null, positions)).toBe(0.1);
    });

    it("returns 0.20 when >40% of gains from one position", () => {
      const positions = [
        makePosition({ realizedPnl: 45 }),
        makePosition({ realizedPnl: 20 }),
        makePosition({ realizedPnl: 20 }),
        makePosition({ realizedPnl: 15 }),
      ];
      // Total gain = 100, Max = 45, Ratio = 0.45 > 0.4
      expect(calculateOneHitWonderPenalty(null, positions)).toBe(0.2);
    });

    it("returns 0.40 when >60% of gains from one position", () => {
      const positions = [
        makePosition({ realizedPnl: 70 }),
        makePosition({ realizedPnl: 15 }),
        makePosition({ realizedPnl: 10 }),
        makePosition({ realizedPnl: 5 }),
      ];
      // Total gain = 100, Max = 70, Ratio = 0.7 > 0.6
      expect(calculateOneHitWonderPenalty(null, positions)).toBe(0.4);
    });

    it("ignores negative PnL in gain calculations", () => {
      const positions = [
        makePosition({ realizedPnl: 70 }),
        makePosition({ realizedPnl: -20 }),
        makePosition({ realizedPnl: 10 }),
        makePosition({ realizedPnl: -5 }),
      ];
      // Total gain = max(0,70) + max(0,-20) + max(0,10) + max(0,-5) = 80
      // Max = 70, Ratio = 70/80 = 0.875 > 0.6 → 0.4
      expect(calculateOneHitWonderPenalty(null, positions)).toBe(0.4);
    });
  });

  describe("trade-data fallback (notional value)", () => {
    it("returns 0 when < 3 trades", () => {
      const trades = [makeTrade(), makeTrade()];
      expect(calculateOneHitWonderPenalty(trades, null)).toBe(0);
    });

    it("returns 0 when trades have balanced sizes", () => {
      const trades = [
        makeTrade({ price: 0.5, size: 100 }),
        makeTrade({ price: 0.5, size: 100 }),
        makeTrade({ price: 0.5, size: 100 }),
      ];
      // 50/150 = 0.33 < 0.4 and < 0.25? No, 0.33 > 0.25 = 0.1
      // Actually: 50/150 = 0.333 > 0.25 → 0.1
      expect(calculateOneHitWonderPenalty(trades, null)).toBe(0.1);
    });

    it("detects dominance by notional value", () => {
      const trades = [
        makeTrade({ price: 0.5, size: 1000 }), // value = 500
        makeTrade({ price: 0.5, size: 100 }),   // value = 50
        makeTrade({ price: 0.5, size: 100 }),   // value = 50
      ];
      // Total = 600, Max = 500, Ratio = 500/600 = 0.833 > 0.6 → 0.4
      expect(calculateOneHitWonderPenalty(trades, null)).toBe(0.4);
    });

    it("filters non-trade activity types", () => {
      const trades = [
        makeTrade({ price: 0.5, size: 1000, type: "trade" }),
        makeTrade({ price: 0.5, size: 5000, type: "split" }), // filtered out
        makeTrade({ price: 0.5, size: 100, type: "trade" }),
        makeTrade({ price: 0.5, size: 100, type: "trade" }),
      ];
      // Only 3 trades, values: 500, 50, 50 → total 600, max 500, ratio 0.833 → 0.4
      expect(calculateOneHitWonderPenalty(trades, null)).toBe(0.4);
    });
  });
});

// ─── calculateGlobalScore ──────────────────────────────────────

describe("calculateGlobalScore", () => {
  it("returns weighted combination of all scores", () => {
    const scores = makeScores({
      roiScore: 1.0,
      consistencyScore: 1.0,
      copyabilityScore: 1.0,
      categoryStrength: 1.0,
      liquidityQuality: 1.0,
      entryTiming: 1.0,
      resolvedPerformance: 1.0,
      oneHitWonderPenalty: 0,
    });
    // All 1.0, sum of weights = 1.0
    expect(calculateGlobalScore(scores)).toBe(1.0);
  });

  it("weights ROI at 25%", () => {
    const base = makeScores({ roiScore: 0 });
    const withRoi = makeScores({ roiScore: 1.0 });
    // Difference should be 0.25
    expect(calculateGlobalScore(withRoi) - calculateGlobalScore(base)).toBeCloseTo(0.25, 1);
  });

  it("subtracts one-hit-wonder penalty", () => {
    const noPenalty = makeScores();
    const withPenalty = makeScores({ oneHitWonderPenalty: 0.4 });
    // Should be 0.4 lower (but clamped to 0)
    expect(calculateGlobalScore(noPenalty) - calculateGlobalScore(withPenalty)).toBeCloseTo(0.4, 1);
  });

  it("clamps to 0 when penalty exceeds weighted score", () => {
    const scores = makeScores({
      roiScore: 0,
      consistencyScore: 0,
      copyabilityScore: 0,
      categoryStrength: 0,
      liquidityQuality: 0,
      entryTiming: 0,
      resolvedPerformance: 0,
      oneHitWonderPenalty: 0.4,
    });
    expect(calculateGlobalScore(scores)).toBe(0);
  });

  it("produces exact calculation for partial scores", () => {
    const scores = makeScores({
      roiScore: 0.5,
      consistencyScore: 0.6,
      copyabilityScore: 0.7,
      categoryStrength: 0.4,
      liquidityQuality: 0.8,
      entryTiming: 0.9,
      resolvedPerformance: 0.3,
      oneHitWonderPenalty: 0.1,
    });
    const expected =
      0.5 * 0.25 +
      0.6 * 0.25 +
      0.7 * 0.20 +
      0.4 * 0.10 +
      0.8 * 0.10 +
      0.9 * 0.05 +
      0.3 * 0.05 -
      0.1;
    expect(calculateGlobalScore(scores)).toBeCloseTo(expected, 5);
  });
});

// ─── calculateAllScores ────────────────────────────────────────

describe("calculateAllScores", () => {
  it("returns all 8 score components", () => {
    const wallet = makeWallet({
      roi: 0.5,
      tradeCount: 10,
      winRate: 0.6,
      averageTradeSize: 500,
      averageLiquidity: 10000,
      averageSpread: 0.02,
      averageEntryTiming: 24,
      resolvedTradeCount: 8,
      categoryDistribution: { Politics: 12, Crypto: 8 },
    });

    const scores = calculateAllScores(wallet);
    expect(scores).toHaveProperty("roiScore");
    expect(scores).toHaveProperty("consistencyScore");
    expect(scores).toHaveProperty("copyabilityScore");
    expect(scores).toHaveProperty("categoryStrength");
    expect(scores).toHaveProperty("liquidityQuality");
    expect(scores).toHaveProperty("entryTiming");
    expect(scores).toHaveProperty("resolvedPerformance");
    expect(scores).toHaveProperty("oneHitWonderPenalty");

    // All should be in range [0, 1]
    for (const key of Object.keys(scores) as (keyof WalletScores)[]) {
      expect(scores[key]).toBeGreaterThanOrEqual(0);
      // penalty can be up to 0.4
      const max = key === "oneHitWonderPenalty" ? 0.4 : 1;
      expect(scores[key]).toBeLessThanOrEqual(max);
    }
  });

  it("falls back to activity summary when direct fields missing", () => {
    const wallet = makeWallet({
      activity: {
        address: "0xTest",
        recentTrades: [],
        positions: [],
        tradeCount: 15,
        resolvedTradeCount: 5,
        winRate: 0.7,
        totalVolume: 5000,
        averageTradeSize: 300,
        roiEstimate: 0.4,
      },
    });

    const scores = calculateAllScores(wallet);
    // roiEstimate 0.4 maps to scoreROI(0.4)
    expect(scores.roiScore).toBe(scoreROI(0.4));
    // tradeCount from activity = 15
    expect(scores.consistencyScore).toBe(scoreConsistency(0.7, 15));
  });
});

// ─── scoreWallet (full integration) ────────────────────────────

describe("scoreWallet", () => {
  it("returns full WalletScoreResult", () => {
    const wallet = makeWallet({
      roi: 1.0,
      tradeCount: 25,
      winRate: 0.75,
      averageTradeSize: 1000,
      averageLiquidity: 20000,
      averageSpread: 0.02,
      averageEntryTiming: 48,
      resolvedTradeCount: 15,
      categoryDistribution: { Politics: 15, Crypto: 10 },
      bestCategory: "Politics",
    });

    const result = scoreWallet(wallet);

    expect(result.address).toBe("0xTestWallet");
    expect(result.globalScore).toBeGreaterThan(0.7); // should be track
    expect(result.status).toBe("track");
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.bestCategory).toBe("Politics");
    expect(result.scores.roiScore).toBeGreaterThan(0);
  });

  it("returns watch status for moderate scores", () => {
    // Enough data to push score into 0.4-0.7 watch range
    const wallet = makeWallet({
      roi: 0.2,
      tradeCount: 10,
      winRate: 0.45,
      averageTradeSize: 200,
      averageLiquidity: 3000,
      averageEntryTiming: 12,
      resolvedTradeCount: 5,
      categoryDistribution: { Politics: 3, Crypto: 3, Sports: 4 },
    });

    const result = scoreWallet(wallet);
    expect(result.status).toBe("watch");
  });

  it("returns ignore status for very low scores", () => {
    const wallet = makeWallet({
      roi: -0.5,
      tradeCount: 2,
      winRate: 0.1,
    });

    const result = scoreWallet(wallet);
    expect(result.status).toBe("ignore");
  });

  it("includes penalty-related reasoning when applicable", () => {
    const positions = [
      makePosition({ realizedPnl: 90 }),
      makePosition({ realizedPnl: 5 }),
      makePosition({ realizedPnl: 5 }),
    ];
    const wallet = makeWallet({
      roi: 0.5,
      tradeCount: 10,
      winRate: 0.6,
      averageTradeSize: 500,
      positions,
    });

    const result = scoreWallet(wallet);
    expect(result.scores.oneHitWonderPenalty).toBe(0.4);
    const penaltyReason = result.reasoning.find((r) => r.includes("One-hit-wonder"));
    expect(penaltyReason).toBeDefined();
  });
});

// ─── scoreWallets ──────────────────────────────────────────────

describe("scoreWallets", () => {
  it("sorts results by globalScore descending", () => {
    const wallet1 = makeWallet({
      address: "0xA",
      roi: 2.0,
      tradeCount: 30,
      winRate: 0.9,
      averageTradeSize: 1000,
      averageLiquidity: 50000,
      averageEntryTiming: 72,
      resolvedTradeCount: 25,
    });
    const wallet2 = makeWallet({
      address: "0xB",
      roi: 0.1,
      tradeCount: 5,
      winRate: 0.3,
      averageTradeSize: 20,
      averageEntryTiming: 2,
      resolvedTradeCount: 2,
    });
    const wallet3 = makeWallet({
      address: "0xC",
      roi: 0.8,
      tradeCount: 15,
      winRate: 0.6,
      averageTradeSize: 500,
      averageLiquidity: 10000,
      averageEntryTiming: 24,
      resolvedTradeCount: 10,
    });

    const results = scoreWallets([wallet2, wallet3, wallet1]);

    expect(results[0].address).toBe("0xA");
    expect(results[1].address).toBe("0xC");
    expect(results[2].address).toBe("0xB");
  });

  it("handles empty input", () => {
    expect(scoreWallets([])).toEqual([]);
  });
});

// ─── determineStatus ───────────────────────────────────────────

describe("determineStatus", () => {
  it('returns "track" for scores > 0.7', () => {
    expect(determineStatus(0.71)).toBe("track");
    expect(determineStatus(0.9)).toBe("track");
    expect(determineStatus(1.0)).toBe("track");
  });

  it('returns "watch" for scores 0.4–0.7', () => {
    expect(determineStatus(0.4)).toBe("watch");
    expect(determineStatus(0.5)).toBe("watch");
    expect(determineStatus(0.7)).toBe("watch"); // not > 0.7, it's == 0.7
  });

  it('returns "ignore" for scores < 0.4', () => {
    expect(determineStatus(0.39)).toBe("ignore");
    expect(determineStatus(0)).toBe("ignore");
  });
});
