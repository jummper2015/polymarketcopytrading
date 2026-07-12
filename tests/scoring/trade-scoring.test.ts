// tests/scoring/trade-scoring.test.ts
// Unit tests for the trade scoring engine — Hito 3.4

import { describe, it, expect } from "vitest";
import {
  scoreWalletQuality,
  scoreCategoryFit,
  scoreEntryTimingTrade,
  scoreSpread,
  scoreLiquidityTrade,
  scoreROITrade,
  scoreThesis,
  scoreTimeToResolution,
  calculateTradeScores,
  calculateConfidence,
  calculateCopyScore,
  determineDecision,
  calculatePositionSize,
  scoreTrade,
  scoreTrades,
  type TradeScoreInput,
  type TradeScores,
  type TradeScoreResult,
} from "@/lib/scoring/trade-scoring";
import type { WalletScoreResult } from "@/lib/scoring/wallet-scoring";

// ─── Helpers ───────────────────────────────────────────────────

type WalletOverrides = Partial<Omit<WalletScoreResult, "scores">> & {
  scores?: Partial<WalletScoreResult["scores"]>;
};

function makeWallet(overrides: WalletOverrides = {}): WalletScoreResult {
  const defaultScores: WalletScoreResult["scores"] = {
    roiScore: 0.5,
    consistencyScore: 0.6,
    copyabilityScore: 0.5,
    categoryStrength: 0.5,
    liquidityQuality: 0.6,
    entryTiming: 0.5,
    resolvedPerformance: 0.5,
    oneHitWonderPenalty: 0,
  };
  return {
    address: "0xTestWallet",
    scores: { ...defaultScores, ...overrides.scores } as WalletScoreResult["scores"],
    globalScore: overrides.globalScore ?? 0.6,
    status: overrides.status ?? "track",
    reasoning: overrides.reasoning ?? [],
    bestCategory: overrides.bestCategory ?? null,
  };
}

function makeMarket(overrides: Partial<TradeScoreInput["market"]> = {}): TradeScoreInput["market"] {
  return {
    spread: 0.02,
    liquidity: 50000,
    category: "Politics",
    yesPrice: 0.55,
    noPrice: 0.45,
    timeToResolutionHours: 48,
    ...overrides,
  };
}

function makeTrade(overrides: Partial<TradeScoreInput["trade"]> = {}): TradeScoreInput["trade"] {
  return {
    outcome: "Yes",
    side: "yes",
    walletEntryPrice: 0.55,
    detectedPrice: 0.55,
    size: 200,
    ...overrides,
  };
}

function makeInput(overrides: {
  wallet?: WalletOverrides;
  market?: Partial<TradeScoreInput["market"]>;
  trade?: Partial<TradeScoreInput["trade"]>;
} = {}): TradeScoreInput {
  return {
    wallet: makeWallet(overrides.wallet),
    market: makeMarket(overrides.market),
    trade: makeTrade(overrides.trade),
  };
}

function makeScores(overrides: Partial<TradeScores> = {}): TradeScores {
  return {
    walletQualityScore: 0.8,
    categoryFitScore: 0.8,
    entryTimingScore: 0.8,
    spreadScore: 0.8,
    liquidityScore: 0.8,
    roiScore: 0.8,
    thesisScore: 0.8,
    timeToResolutionScore: 0.8,
    ...overrides,
  };
}

// ─── scoreWalletQuality ────────────────────────────────────────

describe("scoreWalletQuality", () => {
  it("returns 1.0 for globalScore >= 0.8", () => {
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.8 }))).toBe(1.0);
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.95 }))).toBe(1.0);
  });

  it("returns 0.8 for globalScore in [0.6, 0.8)", () => {
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.6 }))).toBe(0.8);
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.75 }))).toBe(0.8);
  });

  it("returns 0.5 for globalScore in [0.4, 0.6)", () => {
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.4 }))).toBe(0.5);
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.55 }))).toBe(0.5);
  });

  it("returns 0.3 for globalScore in [0.2, 0.4)", () => {
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.2 }))).toBe(0.3);
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.35 }))).toBe(0.3);
  });

  it("returns 0.1 for globalScore < 0.2", () => {
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.1 }))).toBe(0.1);
    expect(scoreWalletQuality(makeWallet({ globalScore: 0 }))).toBe(0.1);
  });

  it("is monotonic non-decreasing", () => {
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.3 })))
      .toBeLessThanOrEqual(scoreWalletQuality(makeWallet({ globalScore: 0.4 })));
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.4 })))
      .toBeLessThanOrEqual(scoreWalletQuality(makeWallet({ globalScore: 0.6 })));
    expect(scoreWalletQuality(makeWallet({ globalScore: 0.6 })))
      .toBeLessThanOrEqual(scoreWalletQuality(makeWallet({ globalScore: 0.8 })));
  });
});

// ─── scoreCategoryFit ──────────────────────────────────────────

describe("scoreCategoryFit", () => {
  it("returns 0.5 (neutral) when market category is undefined", () => {
    expect(scoreCategoryFit(makeWallet({ bestCategory: "Politics" }), undefined)).toBe(0.5);
    expect(scoreCategoryFit(makeWallet({ bestCategory: "Politics" }))).toBe(0.5);
  });

  it("returns 0.5 when wallet has no bestCategory", () => {
    expect(scoreCategoryFit(makeWallet({ bestCategory: null }), "Politics")).toBe(0.5);
  });

  it("returns 1.0 for exact category match (case-insensitive)", () => {
    expect(scoreCategoryFit(makeWallet({ bestCategory: "Politics" }), "Politics")).toBe(1.0);
    expect(scoreCategoryFit(makeWallet({ bestCategory: "POLITICS" }), "politics")).toBe(1.0);
    expect(scoreCategoryFit(makeWallet({ bestCategory: "Crypto" }), "Crypto")).toBe(1.0);
  });

  it("returns 0.4 for category mismatch", () => {
    expect(scoreCategoryFit(makeWallet({ bestCategory: "Politics" }), "Crypto")).toBe(0.4);
    expect(scoreCategoryFit(makeWallet({ bestCategory: "Sports" }), "Politics")).toBe(0.4);
  });
});

// ─── scoreEntryTimingTrade ─────────────────────────────────────

describe("scoreEntryTimingTrade", () => {
  it("returns 0 when walletEntryPrice is 0 or negative", () => {
    expect(scoreEntryTimingTrade(0, 0.55)).toBe(0);
    expect(scoreEntryTimingTrade(-0.01, 0.55)).toBe(0);
  });

  it("returns 1.0 when detected price equals entry price (0% drift)", () => {
    expect(scoreEntryTimingTrade(0.55, 0.55)).toBe(1.0);
    expect(scoreEntryTimingTrade(0.50, 0.50)).toBe(1.0);
  });

  it("returns 1.0 for <= 1% drift", () => {
    // 0.9% of 0.55 = 0.00495 → safe from floating-point boundary
    expect(scoreEntryTimingTrade(0.55, 0.55495)).toBe(1.0);
    expect(scoreEntryTimingTrade(0.55, 0.54505)).toBe(1.0); // negative direction
  });

  it("returns 0.8 for 1–3% drift", () => {
    // 2% of 0.55 = 0.011 → detectedPrice = 0.561
    expect(scoreEntryTimingTrade(0.55, 0.561)).toBe(0.8);
    expect(scoreEntryTimingTrade(0.55, 0.539)).toBe(0.8);
  });

  it("returns 0.6 for 3–5% drift", () => {
    // 4% of 0.55 = 0.022 → detectedPrice = 0.572
    expect(scoreEntryTimingTrade(0.55, 0.572)).toBe(0.6);
  });

  it("returns 0.3 for 5–10% drift", () => {
    // 7% of 0.55 = 0.0385 → detectedPrice = 0.5885
    expect(scoreEntryTimingTrade(0.55, 0.5885)).toBe(0.3);
  });

  it("returns 0.1 for > 10% drift", () => {
    // 15% of 0.55 = 0.0825 → detectedPrice = 0.6325
    expect(scoreEntryTimingTrade(0.55, 0.6325)).toBe(0.1);
    expect(scoreEntryTimingTrade(0.55, 0.80)).toBe(0.1);
  });

  it("is symmetric (same score for price increase or decrease)", () => {
    expect(scoreEntryTimingTrade(0.55, 0.572)).toBe(
      scoreEntryTimingTrade(0.55, 0.528)
    );
  });
});

// ─── scoreSpread ───────────────────────────────────────────────

describe("scoreSpread", () => {
  it("returns 0.5 (neutral) when spread is null", () => {
    expect(scoreSpread(null)).toBe(0.5);
  });

  it("returns 1.0 for relative spread <= 1% with midPrice", () => {
    // spread=0.005, midPrice=0.50 → relative = 0.01 (1%)
    expect(scoreSpread(0.005, 0.50)).toBe(1.0);
  });

  it("returns 0.8 for relative spread <= 3%", () => {
    // spread=0.01, midPrice=0.50 → relative = 0.02 (2%)
    expect(scoreSpread(0.01, 0.50)).toBe(0.8);
  });

  it("returns 0.6 for relative spread <= 5%", () => {
    // spread=0.02, midPrice=0.50 → relative = 0.04 (4%)
    expect(scoreSpread(0.02, 0.50)).toBe(0.6);
  });

  it("returns 0.3 for relative spread <= 8%", () => {
    // spread=0.035, midPrice=0.50 → relative = 0.07 (7%)
    expect(scoreSpread(0.035, 0.50)).toBe(0.3);
  });

  it("returns 0.1 for relative spread > 8%", () => {
    // spread=0.05, midPrice=0.50 → relative = 0.10 (10%)
    expect(scoreSpread(0.05, 0.50)).toBe(0.1);
  });

  it("uses absolute spread when midPrice is 0 or not provided", () => {
    // absolute spread 0.005 → <= 0.01 → 1.0
    expect(scoreSpread(0.005, 0)).toBe(1.0);
    expect(scoreSpread(0.005)).toBe(1.0);
  });

  it("uses absolute spread when midPrice is missing", () => {
    // absolute spread 0.02 → <= 0.03 → 0.8
    expect(scoreSpread(0.02)).toBe(0.8);
  });
});

// ─── scoreLiquidityTrade ───────────────────────────────────────

describe("scoreLiquidityTrade", () => {
  it("returns 0 for zero or negative liquidity", () => {
    expect(scoreLiquidityTrade(0)).toBe(0);
    expect(scoreLiquidityTrade(-100)).toBe(0);
  });

  it("increases monotonically with liquidity", () => {
    expect(scoreLiquidityTrade(500)).toBeLessThan(scoreLiquidityTrade(5000));
    expect(scoreLiquidityTrade(5000)).toBeLessThan(scoreLiquidityTrade(50000));
  });

  it("approaches 1 for very high liquidity", () => {
    expect(scoreLiquidityTrade(500_000)).toBeCloseTo(1.0, 1);
  });

  it("returns modest score for moderate liquidity", () => {
    // $10K liquidity should give a reasonable score
    const score = scoreLiquidityTrade(10000);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.8);
  });
});

// ─── scoreROITrade ─────────────────────────────────────────────

describe("scoreROITrade", () => {
  it("passes through wallet.scores.roiScore", () => {
    expect(scoreROITrade(makeWallet({ scores: { roiScore: 0.75 } }))).toBe(0.75);
    expect(scoreROITrade(makeWallet({ scores: { roiScore: 0 } }))).toBe(0);
    expect(scoreROITrade(makeWallet({ scores: { roiScore: 1.0 } }))).toBe(1.0);
  });
});

// ─── scoreThesis ───────────────────────────────────────────────

describe("scoreThesis", () => {
  it("gives max size conviction (0.5) for size >= $500", () => {
    // size=500 → 0.5, +0.25 directional, +0.25 (no price movement) = 1.0
    expect(scoreThesis(500, 0, "yes")).toBe(1.0);
  });

  it("gives 0.4 size conviction for $200–$500", () => {
    // size=200 → 0.4, +0.25, +0.25 = 0.9
    expect(scoreThesis(200, 0, "yes")).toBe(0.9);
  });

  it("gives 0.3 size conviction for $100–$200", () => {
    // size=100 → 0.3, +0.25, +0.25 = 0.8
    expect(scoreThesis(100, 0, "yes")).toBe(0.8);
  });

  it("gives 0.2 size conviction for $50–$100", () => {
    // size=50 → 0.2, +0.25, +0.25 = 0.7
    expect(scoreThesis(50, 0, "yes")).toBe(0.7);
  });

  it("gives 0.1 size conviction for < $50", () => {
    // size=10 → 0.1, +0.25, +0.25 = 0.6
    expect(scoreThesis(10, 0, "yes")).toBe(0.6);
  });

  it("adds full price timing bonus (0.25) for <= 2% movement", () => {
    // size=10 → 0.1, +0.25, +0.25 (≤2%) = 0.6
    expect(scoreThesis(10, 0.02, "yes")).toBe(0.6);
  });

  it("adds partial price timing bonus (0.15) for 2–5% movement", () => {
    // size=10 → 0.1, +0.25, +0.15 (≤5%) = 0.5
    expect(scoreThesis(10, 0.04, "yes")).toBe(0.5);
  });

  it("adds no price timing bonus for > 5% movement", () => {
    // size=10 → 0.1, +0.25, +0 (no bonus) = 0.35
    expect(scoreThesis(10, 0.06, "yes")).toBe(0.35);
  });

  it("treats both sides equally for directional score", () => {
    expect(scoreThesis(200, 0.01, "yes")).toBe(scoreThesis(200, 0.01, "no"));
  });

  it("clamps to [0, 1]", () => {
    // size=1000 → 0.5, +0.25, +0.25 = 1.0 (exactly)
    expect(scoreThesis(1000, 0.01, "yes")).toBe(1.0);
  });
});

// ─── scoreTimeToResolution ─────────────────────────────────────

describe("scoreTimeToResolution", () => {
  it("returns 0.5 (neutral) for null", () => {
    expect(scoreTimeToResolution(null)).toBe(0.5);
  });

  it("returns 1.0 for 72+ hours", () => {
    expect(scoreTimeToResolution(72)).toBe(1.0);
    expect(scoreTimeToResolution(100)).toBe(1.0);
  });

  it("returns 0.9 for 48–72 hours", () => {
    expect(scoreTimeToResolution(48)).toBe(0.9);
    expect(scoreTimeToResolution(60)).toBe(0.9);
  });

  it("returns 0.75 for 24–48 hours", () => {
    expect(scoreTimeToResolution(24)).toBe(0.75);
    expect(scoreTimeToResolution(36)).toBe(0.75);
  });

  it("returns 0.6 for 12–24 hours", () => {
    expect(scoreTimeToResolution(12)).toBe(0.6);
    expect(scoreTimeToResolution(18)).toBe(0.6);
  });

  it("returns 0.4 for 6–12 hours", () => {
    expect(scoreTimeToResolution(6)).toBe(0.4);
    expect(scoreTimeToResolution(10)).toBe(0.4);
  });

  it("returns 0.2 for 2–6 hours", () => {
    expect(scoreTimeToResolution(2)).toBe(0.2);
    expect(scoreTimeToResolution(5)).toBe(0.2);
  });

  it("returns 0.1 for < 2 hours", () => {
    expect(scoreTimeToResolution(1.5)).toBe(0.1);
    expect(scoreTimeToResolution(0.5)).toBe(0.1);
    expect(scoreTimeToResolution(0)).toBe(0.1);
  });
});

// ─── calculateTradeScores ──────────────────────────────────────

describe("calculateTradeScores", () => {
  it("returns all 8 score components", () => {
    const input = makeInput();
    const scores = calculateTradeScores(input);

    expect(scores).toHaveProperty("walletQualityScore");
    expect(scores).toHaveProperty("categoryFitScore");
    expect(scores).toHaveProperty("entryTimingScore");
    expect(scores).toHaveProperty("spreadScore");
    expect(scores).toHaveProperty("liquidityScore");
    expect(scores).toHaveProperty("roiScore");
    expect(scores).toHaveProperty("thesisScore");
    expect(scores).toHaveProperty("timeToResolutionScore");

    // All values in [0, 1]
    for (const key of Object.keys(scores) as (keyof TradeScores)[]) {
      expect(scores[key]).toBeGreaterThanOrEqual(0);
      expect(scores[key]).toBeLessThanOrEqual(1);
    }
  });

  it("gives high entryTimingScore when no price drift", () => {
    const input = makeInput({
      trade: { walletEntryPrice: 0.55, detectedPrice: 0.55 },
    });
    expect(calculateTradeScores(input).entryTimingScore).toBe(1.0);
  });

  it("calculates price movement for thesis from trade prices", () => {
    const input = makeInput({
      trade: { walletEntryPrice: 0.50, detectedPrice: 0.50 }, // 0% movement
    });
    // With 0% movement and size 200 → thesis = 0.4 + 0.25 + 0.25 = 0.9
    expect(calculateTradeScores(input).thesisScore).toBe(0.9);
  });

  it("uses midPrice for spread calculation", () => {
    const input = makeInput({
      market: { yesPrice: 0.50, noPrice: 0.50, spread: 0.005 },
    });
    // midPrice = 0.50, relative spread = 0.005/0.50 = 0.01 → 1.0
    expect(calculateTradeScores(input).spreadScore).toBe(1.0);
  });

  it("handles zero walletEntryPrice gracefully (thesis priceMovement is 0)", () => {
    const input = makeInput({
      trade: { walletEntryPrice: 0, detectedPrice: 0.55, size: 200 },
    });
    const scores = calculateTradeScores(input);
    expect(scores.entryTimingScore).toBe(0); // 0 entry price → 0
    expect(scores.thesisScore).toBe(0.9); // 0% movement → full timing bonus
  });
});

// ─── calculateConfidence ───────────────────────────────────────

describe("calculateConfidence", () => {
  it("starts at 0.5 base confidence", () => {
    const input = makeInput({
      market: { spread: null, liquidity: 0, timeToResolutionHours: null, category: undefined },
      trade: { walletEntryPrice: 0, detectedPrice: 0 },
    });
    // No bonuses: only base 0.5
    expect(calculateConfidence(input)).toBe(0.5);
  });

  it("adds 0.1 for known spread", () => {
    const a = makeInput({ market: { spread: null } });
    const b = makeInput({ market: { spread: 0.02 } });
    expect(calculateConfidence(b)).toBe(calculateConfidence(a) + 0.1);
  });

  it("adds 0.1 for positive liquidity", () => {
    const a = makeInput({ market: { liquidity: 0 } });
    const b = makeInput({ market: { liquidity: 50000 } });
    expect(calculateConfidence(b)).toBe(calculateConfidence(a) + 0.1);
  });

  it("adds 0.1 for known timeToResolutionHours", () => {
    const a = makeInput({ market: { timeToResolutionHours: null } });
    const b = makeInput({ market: { timeToResolutionHours: 48 } });
    expect(calculateConfidence(b)).toBe(calculateConfidence(a) + 0.1);
  });

  it("adds 0.05 for known category", () => {
    const a = makeInput({ market: { category: undefined } });
    const b = makeInput({ market: { category: "Politics" } });
    expect(calculateConfidence(b)).toBeCloseTo(calculateConfidence(a) + 0.05, 5);
  });

  it("adds 0.1 for known walletEntryPrice > 0", () => {
    const a = makeInput({ trade: { walletEntryPrice: 0 } });
    const b = makeInput({ trade: { walletEntryPrice: 0.55 } });
    expect(calculateConfidence(b)).toBe(calculateConfidence(a) + 0.1);
  });

  it("adds 0.05 for known detectedPrice > 0", () => {
    const a = makeInput({ trade: { detectedPrice: 0 } });
    const b = makeInput({ trade: { detectedPrice: 0.55 } });
    expect(calculateConfidence(b)).toBeCloseTo(calculateConfidence(a) + 0.05, 5);
  });

  it("reaches exactly 1.0 confidence with all data known", () => {
    const input = makeInput();
    // 0.5 + 0.1(spread) + 0.1(liquidity) + 0.1(time) + 0.05(cat)
    //    + 0.1(entryPrice) + 0.05(detectedPrice) = 1.0
    expect(calculateConfidence(input)).toBe(1.0);
  });

  it("clamps to max 1.0", () => {
    // Already 1.0 with all data — adding more wouldn't exceed 1
    expect(calculateConfidence(makeInput())).toBeLessThanOrEqual(1.0);
  });
});

// ─── calculateCopyScore ────────────────────────────────────────

describe("calculateCopyScore", () => {
  it("returns weighted sum * confidence for full scores", () => {
    const scores = makeScores({
      walletQualityScore: 1.0,
      categoryFitScore: 1.0,
      entryTimingScore: 1.0,
      spreadScore: 1.0,
      liquidityScore: 1.0,
      roiScore: 1.0,
      thesisScore: 1.0,
      timeToResolutionScore: 1.0,
    });
    // weighted sum = 0.25*1 + 0.15*1 + 0.15*1 + 0.10*1 + 0.10*1 + 0.10*1 + 0.10*1 + 0.05*1 = 1.0
    // * confidence 1.0 = 1.0
    expect(calculateCopyScore(scores, 1.0)).toBe(1.0);
  });

  it("scales score by confidence", () => {
    const scores = makeScores({
      walletQualityScore: 0.8, categoryFitScore: 0.8, entryTimingScore: 0.8,
      spreadScore: 0.8, liquidityScore: 0.8, roiScore: 0.8,
      thesisScore: 0.8, timeToResolutionScore: 0.8,
    });
    // Weighted = 0.8, * 0.5 = 0.4
    const full = calculateCopyScore(scores, 1.0);
    const half = calculateCopyScore(scores, 0.5);
    expect(half).toBeCloseTo(full * 0.5, 5);
  });

  it("returns 0 when all scores are 0", () => {
    const scores = makeScores({
      walletQualityScore: 0, categoryFitScore: 0, entryTimingScore: 0,
      spreadScore: 0, liquidityScore: 0, roiScore: 0,
      thesisScore: 0, timeToResolutionScore: 0,
    });
    expect(calculateCopyScore(scores, 1.0)).toBe(0);
  });

  it("clamps to [0, 1]", () => {
    const scores = makeScores({
      walletQualityScore: 2.0, categoryFitScore: 2.0, entryTimingScore: 2.0,
      spreadScore: 2.0, liquidityScore: 2.0, roiScore: 2.0,
      thesisScore: 2.0, timeToResolutionScore: 2.0,
    });
    expect(calculateCopyScore(scores, 1.0)).toBe(1.0);
  });

  it("verifies exact weight calculation", () => {
    const scores = makeScores({
      walletQualityScore: 1.0,
      categoryFitScore: 2.0, // will be clamped in weighted sum
      entryTimingScore: 0,
      spreadScore: 0,
      liquidityScore: 0,
      roiScore: 0,
      thesisScore: 0,
      timeToResolutionScore: 0,
    });
    // Only walletQuality contributes: 1.0 * 0.25 = 0.25
    // categoryFit 2.0 * 0.15 = 0.30 (not clamped in sum, only final result)
    // entryTiming 0 * 0.15 = 0, rest 0
    // Sum = 0.55, * confidence 1.0 = 0.55, clamped = 0.55
    const result = calculateCopyScore(scores, 1.0);
    expect(result).toBeCloseTo(0.55, 2);
  });
});

// ─── determineDecision ─────────────────────────────────────────

describe("determineDecision", () => {
  it('returns "paper_copy" for score > 0.65', () => {
    expect(determineDecision(0.66)).toBe("paper_copy");
    expect(determineDecision(0.80)).toBe("paper_copy");
    expect(determineDecision(1.0)).toBe("paper_copy");
  });

  it('returns "watchlist" for score 0.35–0.65', () => {
    expect(determineDecision(0.35)).toBe("watchlist");
    expect(determineDecision(0.50)).toBe("watchlist");
    expect(determineDecision(0.65)).toBe("watchlist"); // = threshold, not >
  });

  it('returns "skip" for score < 0.35', () => {
    expect(determineDecision(0.34)).toBe("skip");
    expect(determineDecision(0)).toBe("skip");
  });
});

// ─── calculatePositionSize ─────────────────────────────────────

describe("calculatePositionSize", () => {
  it("returns 0 for skip decision", () => {
    expect(calculatePositionSize(0.5, "skip")).toBe(0);
  });

  it("returns 3 for watchlist decision", () => {
    expect(calculatePositionSize(0.5, "watchlist")).toBe(3);
  });

  it("returns $5 for paper_copy at threshold (0.65)", () => {
    expect(calculatePositionSize(0.65, "paper_copy")).toBe(5);
  });

  it("returns $20 for paper_copy at perfect score (1.0)", () => {
    expect(calculatePositionSize(1.0, "paper_copy")).toBe(20);
  });

  it("linear interpolation for paper_copy between threshold and 1.0", () => {
    // score=0.755 → t = (0.755-0.65)/(1-0.65) = 0.105/0.35 = 0.3
    // position = 5 + 0.3 * 15 = 9.5 → rounded = 10
    // (avoids floating-point edge cases at 0.5 midpoint)
    expect(calculatePositionSize(0.755, "paper_copy")).toBe(10);
  });

  it("higher copyScore gives higher position size", () => {
    expect(calculatePositionSize(0.7, "paper_copy"))
      .toBeLessThan(calculatePositionSize(0.9, "paper_copy"));
  });
});

// ─── scoreTrade (full integration) ─────────────────────────────

describe("scoreTrade", () => {
  it("returns complete TradeScoreResult with all fields", () => {
    const input = makeInput();
    const result = scoreTrade(input);

    expect(result).toHaveProperty("scores");
    expect(result).toHaveProperty("copyScore");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("decision");
    expect(result).toHaveProperty("reasons");
    expect(result).toHaveProperty("risks");
    expect(result).toHaveProperty("simulatedPositionSize");

    expect(result.scores).toHaveProperty("walletQualityScore");
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.simulatedPositionSize).toBeGreaterThanOrEqual(0);
    expect(result.simulatedPositionSize).toBeLessThanOrEqual(20);
  });

  it('gives "paper_copy" for high-quality input', () => {
    const input = makeInput({
      wallet: { globalScore: 0.9, bestCategory: "Politics" },
      market: { spread: 0.005, liquidity: 100000, timeToResolutionHours: 100, category: "Politics" },
      trade: { walletEntryPrice: 0.55, detectedPrice: 0.55, size: 500 },
    });
    const result = scoreTrade(input);
    expect(result.decision).toBe("paper_copy");
    expect(result.copyScore).toBeGreaterThan(0.65);
    expect(result.simulatedPositionSize).toBeGreaterThanOrEqual(5);
  });

  it('gives "skip" for low-quality input', () => {
    const input = makeInput({
      wallet: { globalScore: 0.1 },
      market: { spread: 0.1, liquidity: 100, timeToResolutionHours: 1 },
      trade: { walletEntryPrice: 0.55, detectedPrice: 0.70, size: 10 },
    });
    const result = scoreTrade(input);
    expect(result.decision).toBe("skip");
    expect(result.copyScore).toBeLessThan(0.35);
  });

  it("includes reasons describing positive flags", () => {
    const input = makeInput({
      wallet: { globalScore: 0.9, bestCategory: "Politics" },
      market: { spread: 0.005, liquidity: 100000, category: "Politics" },
    });
    const result = scoreTrade(input);
    expect(result.reasons.some((r) => r.includes("High-quality source wallet"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("category expertise"))).toBe(true);
  });

  it("includes risks for low-entry-quality fields", () => {
    const input = makeInput({
      market: { spread: 0.08, liquidity: 500, timeToResolutionHours: 3 },
      trade: { walletEntryPrice: 0.55, detectedPrice: 0.70 },
    });
    const result = scoreTrade(input);
    // Should have at least some risk warnings
    expect(result.risks.length).toBeGreaterThan(0);
  });

  it("mentions one-hit-wonder risk when penalty > 0", () => {
    const input = makeInput({
      wallet: { scores: { oneHitWonderPenalty: 0.4 } },
    });
    const result = scoreTrade(input);
    expect(result.risks.some((r) => r.includes("one-hit-wonder"))).toBe(true);
  });
});

// ─── scoreTrades (batch) ───────────────────────────────────────

describe("scoreTrades", () => {
  it("returns results sorted by copyScore descending", () => {
    const high = makeInput({
      wallet: { globalScore: 0.95, bestCategory: "Politics" },
      market: { spread: 0.002, liquidity: 200000, category: "Politics", timeToResolutionHours: 120 },
      trade: { walletEntryPrice: 0.55, detectedPrice: 0.55, size: 1000 },
    });
    const mid = makeInput({
      wallet: { globalScore: 0.5 },
      market: { spread: 0.03, liquidity: 10000 },
    });
    const low = makeInput({
      wallet: { globalScore: 0.1 },
      market: { spread: 0.1, liquidity: 100, timeToResolutionHours: 1 },
    });

    const results = scoreTrades([mid, low, high]);

    expect(results[0].copyScore).toBeGreaterThanOrEqual(results[1].copyScore);
    expect(results[1].copyScore).toBeGreaterThanOrEqual(results[2].copyScore);
  });

  it("handles empty input", () => {
    expect(scoreTrades([])).toEqual([]);
  });
});
