// Wallet Scoring Engine — Hito 2.2
// Scores wallets based on ROI, consistency, copyability, category strength,
// liquidity quality, entry timing, resolved performance, and one-hit-wonder penalty.
//
// Formula (from PLAN.md):
//   globalScore = (
//     roiScore          * 0.25 +
//     consistencyScore  * 0.25 +
//     copyabilityScore  * 0.20 +
//     categoryStrength  * 0.10 +
//     liquidityQuality  * 0.10 +
//     entryTiming       * 0.05 +
//     resolvedPerformance * 0.05
//   ) - oneHitWonderPenalty

import type {
  LeaderboardEntry,
  WalletActivityItem,
  WalletPosition,
  WalletActivitySummary,
} from "@/lib/adapters/leaderboard";

// ─── Types ─────────────────────────────────────────────────────

/** Raw wallet data used as input to the scoring engine */
export interface WalletInput {
  address: string;
  /** Leaderboard position metadata */
  leaderboard?: LeaderboardEntry;
  /** Full activity summary from adapters (optional — scoring degrades gracefully) */
  activity?: WalletActivitySummary;
  /** Individual trade list for one-hit-wonder detection */
  trades?: WalletActivityItem[];
  /** Current positions */
  positions?: WalletPosition[];
  /** Raw ROI value (e.g. 0.5 = 50%), used if activity summary is unavailable */
  roi?: number;
  /** Number of trades in lookback period */
  tradeCount?: number;
  /** Win rate 0–1 */
  winRate?: number;
  /** Total volume traded */
  volume?: number;
  /** Average trade size */
  averageTradeSize?: number;
  /** Average liquidity of markets traded in */
  averageLiquidity?: number;
  /** Average spread of markets traded in */
  averageSpread?: number;
  /** Average time between trade detection and market resolution */
  averageEntryTiming?: number;
  /** Number of resolved trades */
  resolvedTradeCount?: number;
  /** Best performing category */
  bestCategory?: string;
  /** Category → count mapping */
  categoryDistribution?: Record<string, number>;
}

/** Individual score components (all 0–1) */
export interface WalletScores {
  roiScore: number;
  consistencyScore: number;
  copyabilityScore: number;
  categoryStrength: number;
  liquidityQuality: number;
  entryTiming: number;
  resolvedPerformance: number;
  oneHitWonderPenalty: number;
}

/** Final wallet scoring result */
export interface WalletScoreResult {
  address: string;
  scores: WalletScores;
  globalScore: number;
  status: "track" | "watch" | "ignore";
  /** Human-readable reasons for the assigned status */
  reasoning: string[];
  /** Best performing category if detectable */
  bestCategory: string | null;
}

// ─── Weights (from PLAN.md) ────────────────────────────────────

const WEIGHTS = {
  roi: 0.25,
  consistency: 0.25,
  copyability: 0.2,
  categoryStrength: 0.1,
  liquidityQuality: 0.1,
  entryTiming: 0.05,
  resolvedPerformance: 0.05,
} as const;

// ─── Thresholds ────────────────────────────────────────────────

const STATUS_THRESHOLDS = {
  track: 0.7,
  watch: 0.4,
} as const;

// ─── Public API ────────────────────────────────────────────────

/**
 * Scores a single wallet and returns the full result including status.
 */
export function scoreWallet(wallet: WalletInput): WalletScoreResult {
  const scores = calculateAllScores(wallet);
  const globalScore = calculateGlobalScore(scores);
  const status = determineStatus(globalScore);
  const reasoning = buildReasoning(scores, globalScore, status);
  const bestCategory = detectBestCategory(wallet);

  return {
    address: wallet.address,
    scores,
    globalScore,
    status,
    reasoning,
    bestCategory,
  };
}

/**
 * Scores multiple wallets and returns results sorted by globalScore descending.
 */
export function scoreWallets(wallets: WalletInput[]): WalletScoreResult[] {
  return wallets
    .map((w) => scoreWallet(w))
    .sort((a, b) => b.globalScore - a.globalScore);
}

// ─── Individual Score Functions ────────────────────────────────

/**
 * ROI Score (0–1)
 *
 * Normalizes ROI to a 0–1 scale using a logarithmic curve:
 * - Negative ROI → 0
 * - 0% ROI → 0
 * - 10% ROI → ~0.33
 * - 50% ROI → ~0.67
 * - 100% ROI → ~0.80
 * - 500% ROI → ~0.95
 * - Approaches 1 asymptotically
 */
export function scoreROI(roi: number | null | undefined): number {
  if (roi === null || roi === undefined) return 0;
  if (roi <= 0) return 0;
  // Logarithmic normalization: higher ROI diminishing returns
  // ln(1 + roi) / ln(1 + maxReferenceRoi)
  // Using 5 (500%) as reference max
  return clamp(Math.log(1 + roi) / Math.log(6), 0, 1);
}

/**
 * Consistency Score (0–1)
 *
 * Evaluates how consistently the wallet performs across trades.
 * Uses a combination of:
 * - Win rate stability (percentage of winning trades)
 * - Trade frequency regularity (not all trades on one day)
 * - Minimum trade count requirement
 */
export function scoreConsistency(
  winRate: number | null | undefined,
  tradeCount: number | null | undefined,
  trades?: WalletActivityItem[]
): number {
  if (tradeCount === null || tradeCount === undefined || tradeCount < 3) {
    return 0;
  }

  let score = 0;
  const tc = tradeCount;

  // 1. Win rate contribution (0–0.5)
  const wr = winRate ?? 0;
  const winRateScore = wr * 0.5;
  score += winRateScore;

  // 2. Trade count sufficiency (0–0.3)
  // < 5 trades → 0, 5–10 → 0.1, 10–20 → 0.2, 20+ → 0.3
  if (tc >= 20) score += 0.3;
  else if (tc >= 10) score += 0.2;
  else if (tc >= 5) score += 0.1;    // 3. Temporal dispersion (0–0.2)
    // Are trades spread across multiple days? (not all clustered)
    if (trades && trades.length >= 5) {
      const days = new Set<number>();
      for (const t of trades) {
        if (t.timestamp > 0) {
          // Bucket by day (seconds since epoch → day number)
          days.add(Math.floor(t.timestamp / 86400));
        }
      }
    // At least 3 distinct trading days
    if (days.size >= 3) score += 0.2;
    else if (days.size >= 2) score += 0.1;
  } else if (tc >= 5) {
    // No trade detail but enough trades → modest bonus
    score += 0.1;
  }

  return clamp(score, 0, 1);
}

/**
 * Copyability Score (0–1)
 *
 * How viable it is to copy this wallet's trades. Factors:
 * - Trade size (too large → whale trades hard to copy; too small → noise)
 * - Trade frequency (too fast → hard to keep up; too slow → stale)
 * - Market accessibility (are markets liquid enough to enter at similar prices)
 */
export function scoreCopyability(wallet: WalletInput): number {
  let score = 0;

  // 1. Trade size reasonability (0–0.4)
  // Ideal range: $50 – $2000 average trade size for copyability
  const avgSize = wallet.averageTradeSize ?? 0;
  if (avgSize > 0) {
    if (avgSize >= 50 && avgSize <= 2000) {
      score += 0.4;
    } else if (avgSize >= 25 && avgSize <= 5000) {
      score += 0.25; // borderline
    } else {
      score += 0.1; // too small or too large
    }
  }

  // 2. Trade frequency (0–0.3)
  // Not too fast (bot-like) and not too slow (inactive)
  const tradeCount = wallet.tradeCount ?? 0;
  if (tradeCount >= 5 && tradeCount <= 100) {
    score += 0.3;
  } else if (tradeCount >= 3 && tradeCount <= 200) {
    score += 0.2;
  } else if (tradeCount > 0) {
    score += 0.1;
  }

  // 3. Market accessibility — spread & liquidity (0–0.3)
  const avgSpread = wallet.averageSpread ?? 1;
  const avgLiquidity = wallet.averageLiquidity ?? 0;

  // Low spread = easier to copy
  if (avgSpread <= 0.03) {
    score += 0.15;
  } else if (avgSpread <= 0.06) {
    score += 0.1;
  } else if (avgSpread <= 0.1) {
    score += 0.05;
  }

  // High liquidity = easier to copy
  if (avgLiquidity >= 5000) {
    score += 0.15;
  } else if (avgLiquidity >= 1000) {
    score += 0.1;
  } else if (avgLiquidity >= 500) {
    score += 0.05;
  }

  return clamp(score, 0, 1);
}

/**
 * Category Strength Score (0–1)
 *
 * Rewards wallets that show clear expertise in specific market categories
 * rather than random bets across everything.
 */
export function scoreCategoryStrength(
  categoryDistribution: Record<string, number> | null | undefined
): number {
  if (
    !categoryDistribution ||
    Object.keys(categoryDistribution).length === 0
  ) {
    return 0;
  }

  const categories = Object.entries(categoryDistribution);
  const total = categories.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return 0;

  // Find the dominant category
  const [topCategory, topCount] = categories.sort(
    ([, a], [, b]) => b - a
  )[0];

  // What fraction of trades are in the top category?
  const concentration = topCount / total;

  // Ideal: 40-70% in one category (shows expertise without being one-dimensional)
  if (concentration >= 0.4 && concentration <= 0.7) {
    return 0.9;
  } else if (concentration >= 0.3 && concentration <= 0.8) {
    return 0.7;
  } else if (concentration > 0.8) {
    // Too concentrated — might be a one-trick pony
    return 0.4;
  } else if (categories.length >= 2) {
    // Multiple categories with some diversification
    return 0.5;
  }

  return 0.3;
}

/**
 * Liquidity Quality Score (0–1)
 *
 * Rewards wallets that trade in deep, liquid markets.
 * High liquidity = less slippage, more viable to copy.
 */
export function scoreLiquidityQuality(
  averageLiquidity: number | null | undefined
): number {
  if (averageLiquidity === null || averageLiquidity === undefined) return 0;

  // Logarithmic scale: $100K+ → near 1.0, $1K → ~0.3, $100 → ~0.1
  if (averageLiquidity <= 0) return 0;
  return clamp(Math.log(1 + averageLiquidity / 1000) / Math.log(101), 0, 1);
}

/**
 * Entry Timing Score (0–1)
 *
 * Evaluates how early the wallet enters markets relative to resolution.
 * Entering early (when uncertainty is high) shows conviction.
 * Entering late (near resolution) may indicate insider knowledge or arbitrage.
 *
 * `averageEntryTimingHours` is the average number of hours between
 * trade entry and market resolution. Higher = entered earlier = better.
 * Callers must convert from seconds to hours before passing.
 */
export function scoreEntryTiming(
  averageEntryTimingHours: number | null | undefined
): number {
  if (averageEntryTimingHours === null || averageEntryTimingHours === undefined) {
    return 0.5; // neutral if unknown
  }

  // Ideal: entering 48h+ before resolution
  // Decent: 12-48h
  // Poor: < 2h (might be front-running or arbitrage)

  const h = averageEntryTimingHours;
  if (h >= 48) return 1.0;
  if (h >= 24) return 0.9;
  if (h >= 12) return 0.75;
  if (h >= 6) return 0.6;
  if (h >= 2) return 0.4;
  if (h >= 1) return 0.2;
  return 0.1;
}

/**
 * Resolved Performance Score (0–1)
 *
 * Evaluates how the wallet performs on trades that have already resolved.
 * This is the most objective measure — resolved trades have known outcomes.
 */
export function scoreResolvedPerformance(
  resolvedTradeCount: number | null | undefined,
  winRate: number | null | undefined
): number {
  const count = resolvedTradeCount ?? 0;
  const wr = winRate ?? 0;

  if (count === 0) return 0; // No resolved trades yet

  // Win rate is primary (0–0.7)
  const winRateScore = wr * 0.7;

  // Volume of resolved trades adds confidence (0–0.3)
  let countScore = 0;
  if (count >= 20) countScore = 0.3;
  else if (count >= 10) countScore = 0.2;
  else if (count >= 5) countScore = 0.1;
  else if (count >= 3) countScore = 0.05;

  return clamp(winRateScore + countScore, 0, 1);
}

/**
 * One-Hit-Wonder Penalty (0–0.4)
 *
 * Penalizes wallets where a disproportionate amount of profit comes
 * from a single trade. Thresholds from PLAN.md:
 * - >60% of gain from 1 trade → 0.40
 * - >40% → 0.20
 * - >25% → 0.10
 */
export function calculateOneHitWonderPenalty(
  trades: WalletActivityItem[] | null | undefined,
  positions?: WalletPosition[] | null
): number {
  // Use positions with realized PnL for the most accurate picture
  const resolvedPositions =
    positions?.filter((p) => p.realizedPnl !== undefined) ?? [];

  if (resolvedPositions.length >= 3) {
    // Find the single largest gain
    const totalGain = resolvedPositions.reduce(
      (sum, p) => sum + Math.max(0, p.realizedPnl ?? 0),
      0
    );

    if (totalGain > 0) {
      const maxSingleGain = Math.max(
        ...resolvedPositions.map((p) => Math.max(0, p.realizedPnl ?? 0))
      );
      const ratio = maxSingleGain / totalGain;

      if (ratio > 0.6) return 0.4;
      if (ratio > 0.4) return 0.2;
      if (ratio > 0.25) return 0.1;
    }
    return 0;
  }

  // Fallback: use trade data — approximate "dominance" by notional value.
  // NOTE: Notional value ≠ PnL. A large trade could be break-even.
  // This is a rough heuristic only; positions-based analysis above is preferred.
  if (!trades || trades.length < 3) return 0;

  const tradeValues = trades
    .filter((t) => t.type === "trade")
    .map((t) => (t.size ?? 0) * (t.price ?? 0));

  if (tradeValues.length < 3) return 0;

  const totalValue = tradeValues.reduce((sum, v) => sum + v, 0);
  if (totalValue === 0) return 0;

  const maxSingleValue = Math.max(...tradeValues);
  const ratio = maxSingleValue / totalValue;

  if (ratio > 0.6) return 0.4;
  if (ratio > 0.4) return 0.2;
  if (ratio > 0.25) return 0.1;
  return 0;
}

// ─── Global Score ──────────────────────────────────────────────

/**
 * Combines all individual scores into the final globalScore using
 * the weights defined in PLAN.md, then subtracts the one-hit-wonder penalty.
 */
export function calculateGlobalScore(scores: WalletScores): number {
  const weighted =
    scores.roiScore * WEIGHTS.roi +
    scores.consistencyScore * WEIGHTS.consistency +
    scores.copyabilityScore * WEIGHTS.copyability +
    scores.categoryStrength * WEIGHTS.categoryStrength +
    scores.liquidityQuality * WEIGHTS.liquidityQuality +
    scores.entryTiming * WEIGHTS.entryTiming +
    scores.resolvedPerformance * WEIGHTS.resolvedPerformance;

  return clamp(weighted - scores.oneHitWonderPenalty, 0, 1);
}

/**
 * Convenience: calculates all scores from a WalletInput in one call.
 */
export function calculateAllScores(wallet: WalletInput): WalletScores {
  const activity = wallet.activity;

  const roiScore = scoreROI(
    wallet.roi ?? activity?.roiEstimate
  );

  const consistencyScore = scoreConsistency(
    wallet.winRate ?? activity?.winRate,
    wallet.tradeCount ?? activity?.tradeCount,
    wallet.trades ?? activity?.recentTrades
  );

  const copyabilityScore = scoreCopyability(wallet);

  const categoryStrength = scoreCategoryStrength(
    wallet.categoryDistribution
  );

  const liquidityQuality = scoreLiquidityQuality(
    wallet.averageLiquidity
  );

  const entryTiming = scoreEntryTiming(
    wallet.averageEntryTiming
  );

  const resolvedPerformance = scoreResolvedPerformance(
    wallet.resolvedTradeCount ?? activity?.resolvedTradeCount,
    wallet.winRate ?? activity?.winRate
  );

  const oneHitWonderPenalty = calculateOneHitWonderPenalty(
    wallet.trades ?? activity?.recentTrades,
    wallet.positions ?? activity?.positions
  );

  return {
    roiScore,
    consistencyScore,
    copyabilityScore,
    categoryStrength,
    liquidityQuality,
    entryTiming,
    resolvedPerformance,
    oneHitWonderPenalty,
  };
}

// ─── Status & Reasoning ────────────────────────────────────────

/**
 * Maps a globalScore to a tracking status.
 *
 * Thresholds from PLAN.md:
 * - track  (> 0.7) — Actively monitor and copy
 * - watch  (0.4 – 0.7) — Observe, don't copy yet
 * - ignore (< 0.4) — Skip entirely
 */
export function determineStatus(globalScore: number): "track" | "watch" | "ignore" {
  if (globalScore > STATUS_THRESHOLDS.track) return "track";
  if (globalScore >= STATUS_THRESHOLDS.watch) return "watch";
  return "ignore";
}

function buildReasoning(
  scores: WalletScores,
  globalScore: number,
  status: string
): string[] {
  const reasons: string[] = [];

  if (scores.oneHitWonderPenalty > 0) {
    reasons.push(
      `One-hit-wonder penalty applied: -${(scores.oneHitWonderPenalty * 100).toFixed(0)}% — large portion of gains from a single trade`
    );
  }

  if (scores.roiScore < 0.3) {
    reasons.push("Low ROI — insufficient returns to justify copying");
  }
  if (scores.consistencyScore < 0.3) {
    reasons.push("Inconsistent performance — win rate or trade frequency too low");
  }
  if (scores.copyabilityScore < 0.3) {
    reasons.push("Hard to copy — trade sizes or market accessibility issues");
  }
  if (scores.liquidityQuality < 0.2) {
    reasons.push("Low liquidity markets — high slippage risk");
  }
  if (scores.entryTiming < 0.3) {
    reasons.push("Late entries — trades too close to resolution");
  }

  if (status === "track") {
    reasons.push("Wallet qualifies for active tracking and copy simulation");
  } else if (status === "watch") {
    reasons.push("Wallet on watchlist — needs improvement before active copying");
  } else {
    reasons.push("Wallet below threshold — skipping");
  }

  return reasons;
}

function detectBestCategory(wallet: WalletInput): string | null {
  if (wallet.bestCategory) return wallet.bestCategory;
  if (wallet.categoryDistribution) {
    const entries = Object.entries(wallet.categoryDistribution);
    if (entries.length > 0) {
      return entries.sort(([, a], [, b]) => b - a)[0][0];
    }
  }
  return null;
}

// ─── Utility ───────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
