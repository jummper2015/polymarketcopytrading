// Trade Scoring Engine — Hito 3.1
// Scores individual trades to decide whether to copy them (paper_copy),
// watch them (watchlist), or skip them (skip).
//
// Formula (from PLAN.md):
//   copyScore = (
//     walletQualityScore   * 0.25 +
//     categoryFitScore     * 0.15 +
//     entryTimingScore     * 0.15 +
//     spreadScore          * 0.10 +
//     liquidityScore       * 0.10 +
//     roiScore             * 0.10 +
//     thesisScore          * 0.10 +
//     timeToResolutionScore * 0.05
//   ) * confidence
//
// Decisions: paper_copy (> 0.65), watchlist (0.35–0.65), skip (< 0.35)

import type { WalletScoreResult } from "./wallet-scoring";

// ─── Types ─────────────────────────────────────────────────────

/** Input data for scoring a single trade */
export interface TradeScoreInput {
  /** The wallet's profile/scoring data */
  wallet: WalletScoreResult;
  /** Market snapshot at the time of detection */
  market: {
    spread: number | null;
    liquidity: number;
    category?: string;
    yesPrice: number;
    noPrice: number;
    /** Hours until resolution (converted from seconds by caller) */
    timeToResolutionHours: number | null;
  };
  /** The observed trade details */
  trade: {
    outcome: string;
    side: "yes" | "no";
    /** Price at which the wallet entered */
    walletEntryPrice: number;
    /** Price at which we detected the trade */
    detectedPrice: number;
    /** Trade size (notional) */
    size: number;
  };
}

/** Individual trade score components (all 0–1) */
export interface TradeScores {
  walletQualityScore: number;
  categoryFitScore: number;
  entryTimingScore: number;
  spreadScore: number;
  liquidityScore: number;
  roiScore: number;
  thesisScore: number;
  timeToResolutionScore: number;
}

/** Result of scoring a single trade */
export interface TradeScoreResult {
  scores: TradeScores;
  copyScore: number;
  confidence: number;
  decision: "paper_copy" | "watchlist" | "skip";
  reasons: string[];
  risks: string[];
  /** Suggested position size in $ (5–20 for paper trading) */
  simulatedPositionSize: number;
}

// ─── Weights (from PLAN.md) ────────────────────────────────────

const WEIGHTS = {
  walletQuality: 0.25,
  categoryFit: 0.15,
  entryTiming: 0.15,
  spread: 0.10,
  liquidity: 0.10,
  roi: 0.10,
  thesis: 0.10,
  timeToResolution: 0.05,
} as const;

// ─── Decision Thresholds ───────────────────────────────────────

const DECISION_THRESHOLDS = {
  copy: 0.65,
  watch: 0.35,
} as const;

// ─── Position Sizing ───────────────────────────────────────────

const POSITION_MIN = 5;
const POSITION_MAX = 20;

// ─── Public API ────────────────────────────────────────────────

/** Score a single trade and return the full decision result. */
export function scoreTrade(input: TradeScoreInput): TradeScoreResult {
  const scores = calculateTradeScores(input);
  const confidence = calculateConfidence(input);
  const copyScore = calculateCopyScore(scores, confidence);
  const decision = determineDecision(copyScore);
  const reasons = buildTradeReasons(scores, copyScore, decision);
  const risks = buildTradeRisks(input, scores);
  const simulatedPositionSize = calculatePositionSize(copyScore, decision);

  return {
    scores,
    copyScore,
    confidence,
    decision,
    reasons,
    risks,
    simulatedPositionSize,
  };
}

/** Score multiple trades and return sorted by copyScore descending. */
export function scoreTrades(inputs: TradeScoreInput[]): TradeScoreResult[] {
  return inputs
    .map((input) => scoreTrade(input))
    .sort((a, b) => b.copyScore - a.copyScore);
}

// ─── Individual Score Functions ────────────────────────────────

/**
 * Wallet Quality Score (0–1)
 *
 * Uses the wallet's globalScore as a proxy for overall quality.
 * A wallet with globalScore 0.8+ maps to 1.0, 0.4 maps to ~0.5.
 */
export function scoreWalletQuality(wallet: WalletScoreResult): number {
  // map globalScore [0, 1] → [0, 1] with some compression at high end
  const gs = wallet.globalScore;
  if (gs >= 0.8) return 1.0;
  if (gs >= 0.6) return 0.8;
  if (gs >= 0.4) return 0.5;
  if (gs >= 0.2) return 0.3;
  return 0.1;
}

/**
 * Category Fit Score (0–1)
 *
 * How well does this trade's market category match the wallet's expertise?
 */
export function scoreCategoryFit(
  wallet: WalletScoreResult,
  marketCategory?: string
): number {
  if (!marketCategory) return 0.5; // neutral if unknown

  const walletCategory = wallet.bestCategory;

  if (walletCategory) {
    // Exact match: wallet's best category = market category
    if (
      walletCategory.toLowerCase() === marketCategory.toLowerCase()
    ) {
      return 1.0;
    }
    // Partial/related match heuristic
    return 0.4;
  }

  // No wallet category data — neutral
  return 0.5;
}

/**
 * Entry Timing Score (0–1)
 *
 * Penalizes trades where the price has moved significantly since
 * the wallet entered. A large price movement means we're "late."
 */
export function scoreEntryTimingTrade(
  walletEntryPrice: number,
  detectedPrice: number
): number {
  if (walletEntryPrice <= 0) return 0;

  const priceDelta = Math.abs(detectedPrice - walletEntryPrice);
  const pctMove = priceDelta / walletEntryPrice;

  // < 1% move → near-perfect timing
  if (pctMove <= 0.01) return 1.0;
  // 1-3% → good
  if (pctMove <= 0.03) return 0.8;
  // 3-5% → acceptable
  if (pctMove <= 0.05) return 0.6;
  // 5-10% → poor
  if (pctMove <= 0.10) return 0.3;
  // >10% → too late
  return 0.1;
}

/**
 * Spread Score (0–1)
 *
 * Lower spreads = easier to enter at favorable prices.
 */
export function scoreSpread(spread: number | null, midPrice?: number): number {
  if (spread === null) return 0.5; // unknown → neutral

  // Use relative spread when mid-price is available
  const relative =
    midPrice && midPrice > 0 ? spread / midPrice : spread;

  if (relative <= 0.01) return 1.0;
  if (relative <= 0.03) return 0.8;
  if (relative <= 0.05) return 0.6;
  if (relative <= 0.08) return 0.3;
  return 0.1;
}

/**
 * Liquidity Score (0–1)
 *
 * Higher liquidity = easier to enter/exit without slippage.
 * Uses a logarithmic scale.
 */
export function scoreLiquidityTrade(liquidity: number): number {
  if (liquidity <= 0) return 0;
  return clamp(Math.log(1 + liquidity / 500) / Math.log(201), 0, 1);
}

/**
 * ROI Score for trades (0–1)
 *
 * Uses the wallet's ROI score as a proxy.
 */
export function scoreROITrade(wallet: WalletScoreResult): number {
  return wallet.scores.roiScore;
}

/**
 * Thesis Score (0–1)
 *
 * Evaluates whether there's a clear thesis for entering this trade.
 * Based on: conviction = bigger position size relative to average,
 * and entry timing quality.
 */
export function scoreThesis(
  size: number,
  priceMovement: number, // detected - wallet price (abs)
  side: "yes" | "no"
): number {
  let score = 0;

  // 1. Size conviction (0–0.5): larger-than-average trade = conviction
  // Benchmark: $200+ trade = high conviction
  if (size >= 500) score += 0.5;
  else if (size >= 200) score += 0.4;
  else if (size >= 100) score += 0.3;
  else if (size >= 50) score += 0.2;
  else score += 0.1;

  // 2. Directional conviction (0–0.25): both sides equally rewarded
  score += 0.25;

  // 3. Price movement quality (0–0.25): less movement = better entry = stronger thesis
  if (priceMovement <= 0.02) score += 0.25;
  else if (priceMovement <= 0.05) score += 0.15;
  // > 0.05 → no bonus

  return clamp(score, 0, 1);
}

/**
 * Time to Resolution Score (0–1)
 *
 * Trades with more time until resolution have more room to play out.
 * Very short timeframes may indicate insider knowledge or last-minute bets.
 */
export function scoreTimeToResolution(
  timeToResolutionHours: number | null
): number {
  if (timeToResolutionHours === null) return 0.5; // neutral

  const h = timeToResolutionHours;
  if (h >= 72) return 1.0;
  if (h >= 48) return 0.9;
  if (h >= 24) return 0.75;
  if (h >= 12) return 0.6;
  if (h >= 6) return 0.4;
  if (h >= 2) return 0.2;
  return 0.1;
}

// ─── Composite Functions ───────────────────────────────────────

/** Calculate all trade sub-scores from input. */
export function calculateTradeScores(input: TradeScoreInput): TradeScores {
  const walletQualityScore = scoreWalletQuality(input.wallet);
  const categoryFitScore = scoreCategoryFit(
    input.wallet,
    input.market.category
  );
  const entryTimingScore = scoreEntryTimingTrade(
    input.trade.walletEntryPrice,
    input.trade.detectedPrice
  );
  const spreadScore = scoreSpread(
    input.market.spread,
    (input.market.yesPrice + input.market.noPrice) / 2
  );
  const liquidityScore = scoreLiquidityTrade(input.market.liquidity);
  const roiScore = scoreROITrade(input.wallet);

  const priceMovement = input.trade.walletEntryPrice > 0
    ? Math.abs(input.trade.detectedPrice - input.trade.walletEntryPrice) /
      input.trade.walletEntryPrice
    : 0;
  const thesisScore = scoreThesis(
    input.trade.size,
    priceMovement,
    input.trade.side
  );

  const timeToResolutionScore = scoreTimeToResolution(
    input.market.timeToResolutionHours
  );

  return {
    walletQualityScore,
    categoryFitScore,
    entryTimingScore,
    spreadScore,
    liquidityScore,
    roiScore,
    thesisScore,
    timeToResolutionScore,
  };
}

/**
 * Calculate confidence multiplier (0–1).
 *
 * Lower when key data is missing or uncertain.
 * At minimum it's 0.5; each known field adds confidence.
 */
export function calculateConfidence(input: TradeScoreInput): number {
  let confidence = 0.5;

  // Known market data boosts confidence
  if (input.market.spread !== null) confidence += 0.1;
  if (input.market.liquidity > 0) confidence += 0.1;
  if (input.market.timeToResolutionHours !== null) confidence += 0.1;
  if (input.market.category) confidence += 0.05;
  if (input.trade.walletEntryPrice > 0) confidence += 0.1;
  if (input.trade.detectedPrice > 0) confidence += 0.05;

  return clamp(confidence, 0, 1);
}

/**
 * Combine trade sub-scores with weights and confidence
 * to produce the final copyScore.
 */
export function calculateCopyScore(
  scores: TradeScores,
  confidence: number
): number {
  const weighted =
    scores.walletQualityScore * WEIGHTS.walletQuality +
    scores.categoryFitScore * WEIGHTS.categoryFit +
    scores.entryTimingScore * WEIGHTS.entryTiming +
    scores.spreadScore * WEIGHTS.spread +
    scores.liquidityScore * WEIGHTS.liquidity +
    scores.roiScore * WEIGHTS.roi +
    scores.thesisScore * WEIGHTS.thesis +
    scores.timeToResolutionScore * WEIGHTS.timeToResolution;

  return clamp(weighted * confidence, 0, 1);
}

/**
 * Map copyScore to a trade decision.
 *
 * Thresholds from PLAN.md:
 * - paper_copy (> 0.65)
 * - watchlist  (0.35 – 0.65)
 * - skip       (< 0.35)
 */
export function determineDecision(
  copyScore: number
): "paper_copy" | "watchlist" | "skip" {
  if (copyScore > DECISION_THRESHOLDS.copy) return "paper_copy";
  if (copyScore >= DECISION_THRESHOLDS.watch) return "watchlist";
  return "skip";
}

/**
 * Calculate suggested simulated position size.
 *
 * paper_copy trades: $5–$20 based on score
 * watchlist: small observation position ($3)
 * skip: no position ($0)
 */
export function calculatePositionSize(
  copyScore: number,
  decision: "paper_copy" | "watchlist" | "skip"
): number {
  if (decision === "skip") return 0;
  if (decision === "watchlist") return 3; // tiny watch position

  // paper_copy: linear interpolation between POSITION_MIN ($5) and POSITION_MAX ($20)
  const t = (copyScore - DECISION_THRESHOLDS.copy) / (1 - DECISION_THRESHOLDS.copy);
  return Math.round(POSITION_MIN + t * (POSITION_MAX - POSITION_MIN));
}

// ─── Reasoning ─────────────────────────────────────────────────

function buildTradeReasons(
  scores: TradeScores,
  copyScore: number,
  decision: string
): string[] {
  const reasons: string[] = [];

  // Positive flags
  if (scores.walletQualityScore >= 0.8) {
    reasons.push("High-quality source wallet");
  }
  if (scores.categoryFitScore >= 0.8) {
    reasons.push("Trade matches wallet's category expertise");
  }
  if (scores.entryTimingScore >= 0.8) {
    reasons.push("Minimal price drift since wallet entry");
  }
  if (scores.spreadScore >= 0.8) {
    reasons.push("Tight bid-ask spread");
  }
  if (scores.liquidityScore >= 0.8) {
    reasons.push("Deep market liquidity");
  }

  // Negative flags
  if (scores.entryTimingScore < 0.3) {
    reasons.push("Significant price movement since detection — may be too late");
  }
  if (scores.spreadScore < 0.3) {
    reasons.push("Wide spread — entry cost may erode profits");
  }
  if (scores.liquidityScore < 0.3) {
    reasons.push("Low liquidity — high slippage risk");
  }
  if (scores.timeToResolutionScore < 0.3) {
    reasons.push("Little time until resolution — limited upside window");
  }
  if (scores.walletQualityScore < 0.3) {
    reasons.push("Source wallet quality is below threshold");
  }

  // Decision rationale
  if (decision === "paper_copy") {
    reasons.push(
      `Trade qualifies for simulated copy (score: ${(copyScore * 100).toFixed(0)}%)`
    );
  } else if (decision === "watchlist") {
    reasons.push(
      `Trade added to watchlist (score: ${(copyScore * 100).toFixed(0)}%)`
    );
  } else {
    reasons.push(
      `Trade skipped (score: ${(copyScore * 100).toFixed(0)}%)`
    );
  }

  return reasons;
}

function buildTradeRisks(
  input: TradeScoreInput,
  scores: TradeScores
): string[] {
  const risks: string[] = [];

  // Price drift risk
  if (scores.entryTimingScore < 0.5) {
    const drift = Math.abs(
      input.trade.detectedPrice - input.trade.walletEntryPrice
    );
    risks.push(
      `Price drift: ${drift.toFixed(3)} from wallet entry — risk of stale data`
    );
  }

  // Liquidity risk
  if (input.market.liquidity < 1000) {
    risks.push(
      `Low liquidity ($${input.market.liquidity.toFixed(0)}) — may be hard to exit`
    );
  }

  // Spread risk
  if (input.market.spread !== null && input.market.spread > 0.05) {
    risks.push(
      `Wide spread (${(input.market.spread * 100).toFixed(1)}%) — significant entry cost`
    );
  }

  // Time pressure
  if (
    input.market.timeToResolutionHours !== null &&
    input.market.timeToResolutionHours < 6
  ) {
    risks.push(
      `Market resolves in ${input.market.timeToResolutionHours.toFixed(1)}h — limited window`
    );
  }

  // Source wallet risk
  if (input.wallet.scores.oneHitWonderPenalty > 0) {
    risks.push("Source wallet flagged as potential one-hit-wonder");
  }

  return risks;
}

// ─── Utility ───────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
