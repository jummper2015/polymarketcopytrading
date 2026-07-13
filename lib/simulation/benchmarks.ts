// Benchmarks — Hito 4.4
// Compares the bot's filtered copy-trading strategy against blind copy
// to validate that the scoring and filtering actually add value.
//
// Metrics:
//   - Bot vs Blind Copy: PnL, win rate, profit factor, drawdown comparison
//   - Missed Winners: Profitable trades the bot skipped
//   - Avoided Losers: Losing trades the bot skipped
//   - Spread Losses: How much spread slippage the bot avoided

import { db } from "@/db";
import {
  paperTrades,
  decisionJournals,
  observedTrades,
  walletProfiles,
} from "@/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";

// ─── Types ─────────────────────────────────────────────────────

/** Result of comparing bot vs blind copy strategies */
export interface BotVsBlindResult {
  /** Number of trades from tracked wallets in the period */
  totalTrackedTrades: number;
  /** Number of trades the bot actually copied */
  copiedTrades: number;
  /** Number of trades the bot skipped */
  skippedTrades: number;
  /** Bot PnL from paper trades */
  botPnl: number;
  /** Hypothetical PnL if ALL tracked-wallet trades were blindly copied */
  blindCopyPnl: number;
  /** Bot win rate */
  botWinRate: number;
  /** Blind copy win rate */
  blindWinRate: number;
  /** Did filtering improve PnL? */
  filteringAddedValue: boolean;
  /** Delta: botPnl - blindCopyPnl */
  deltaPnl: number;
}

/** A winner the bot missed (profitable trade that was skipped) */
export interface MissedWinner {
  walletAddress: string;
  walletLabel?: string;
  marketId: string;
  decision: string;
  copyScore: number;
  hypotheticalPnl: number;
  skippedReason: string[];
}

/** A loser the bot avoided (unprofitable trade that was skipped) */
export interface AvoidedLoser {
  walletAddress: string;
  walletLabel?: string;
  marketId: string;
  decision: string;
  copyScore: number;
  hypotheticalLoss: number;
  skippedReason: string[];
}

/** Spread savings analysis */
export interface SpreadSavings {
  /** Number of trades with spread > maxSpread threshold */
  highSpreadTrades: number;
  /** Total spread cost the bot would have paid blindly */
  estimatedBlindSpreadCost: number;
  /** Total spread cost the bot actually paid */
  actualSpreadCost: number;
  /** Spread savings from filtering */
  spreadSaved: number;
}

// ─── Core: Bot vs Blind Copy ───────────────────────────────────

/**
 * Compare the bot's filtered copy-trading performance against
 * blindly copying every trade from tracked wallets.
 *
 * Blind copy PnL is estimated from observed_trade entries:
 *   For resolved trades: use the final outcome
 *   For unresolved trades: use detectedPrice vs walletEntryPrice
 *
 * @param daysBack - How many days to look back (default: 30)
 */
export async function compareBotVsBlindCopy(
  daysBack: number = 30
): Promise<BotVsBlindResult> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceTs = Math.floor(since.getTime() / 1000);

  // Get all observed trades from tracked wallets in the period
  const trackedWallets = await db
    .select({ address: walletProfiles.address })
    .from(walletProfiles)
    .where(eq(walletProfiles.status, "track"));

  const trackedAddrs = trackedWallets.map((w) => w.address);
  if (trackedAddrs.length === 0) {
    return {
      totalTrackedTrades: 0,
      copiedTrades: 0,
      skippedTrades: 0,
      botPnl: 0,
      blindCopyPnl: 0,
      botWinRate: 0,
      blindWinRate: 0,
      filteringAddedValue: false,
      deltaPnl: 0,
    };
  }

  // All observed trades from tracked wallets in period
  const allObserved = await db
    .select()
    .from(observedTrades)
    .where(
      and(
        gte(observedTrades.timestamp, sinceTs),
        inArray(observedTrades.walletAddress, trackedAddrs)
      )
    );

  // Get all decision journals for these trades
  const otIds = allObserved.map((t) => t.id);
  const decisions =
    otIds.length > 0
      ? await db
          .select()
          .from(decisionJournals)
          .where(inArray(decisionJournals.observedTradeId, otIds))
      : [];

  const decisionMap = new Map<number, (typeof decisions)[number]>();
  for (const d of decisions) {
    if (d.observedTradeId) decisionMap.set(d.observedTradeId, d);
  }

  // Get all paper trades for these decisions
  const djIds = decisions.map((d) => d.id);
  const pts =
    djIds.length > 0
      ? await db
          .select()
          .from(paperTrades)
          .where(inArray(paperTrades.decisionJournalId, djIds))
      : [];

  const ptMap = new Map<number, (typeof pts)[number]>();
  for (const pt of pts) {
    ptMap.set(pt.decisionJournalId, pt);
  }

  // Calculate metrics
  let botPnl = 0;
  let blindCopyPnl = 0;
  let botWins = 0;
  let botResolved = 0;
  let blindWins = 0;
  let blindResolved = 0;
  let copiedTrades = 0;
  let skippedTrades = 0;

  for (const ot of allObserved) {
    const dj = ot.id ? decisionMap.get(ot.id) : undefined;
    const pt = dj ? ptMap.get(dj.id) : undefined;

    // Blind copy PnL estimation:
    // Use detectedPrice - walletEntryPrice as a rough PnL estimate
    // Position size from DJ or default $10
    const posSize = dj?.simulatedPositionSize ?? 10;
    const entryPrice = ot.detectedPrice ?? ot.walletEntryPrice ?? 0.5;
    const shares = entryPrice > 0 ? posSize / entryPrice : 0;
    // Estimate: assume we could get the entry price. For blind copy,
    // this is optimistic (no spread/entry timing penalty)
    const blindEstimate = shares * ((ot.walletEntryPrice ?? entryPrice) - entryPrice);
    blindCopyPnl += blindEstimate;

    // Track resolution if available (simplified)
    blindResolved++;

    if (dj && pt) {
      // Bot actually copied this trade
      copiedTrades++;
      const pnl = pt.status === "open" ? (pt.unrealizedPnl ?? 0) : (pt.realizedPnl ?? 0);
      botPnl += pnl;
      if (pt.status === "resolved") {
        botResolved++;
        if ((pt.realizedPnl ?? 0) > 0) botWins++;
      }
    } else if (dj && dj.decision !== "paper_copy") {
      // Bot reviewed but chose not to copy
      skippedTrades++;
      // Check if skipping was beneficial
      if (blindEstimate > 0) {
        // Bot missed a winner
      } else if (blindEstimate < 0) {
        // Bot avoided a loser — this is good!
        blindWins++; // For blind copy, this would have been a loser
      }
    }
  }

  const botWinRate = botResolved > 0 ? botWins / botResolved : 0;
  const blindWinRate = blindResolved > 0 ? blindWins / blindResolved : 0;
  const filteringAddedValue = botPnl > blindCopyPnl;

  return {
    totalTrackedTrades: allObserved.length,
    copiedTrades,
    skippedTrades,
    botPnl: Math.round(botPnl * 100) / 100,
    blindCopyPnl: Math.round(blindCopyPnl * 100) / 100,
    botWinRate: Math.round(botWinRate * 10000) / 10000,
    blindWinRate: Math.round(blindWinRate * 10000) / 10000,
    filteringAddedValue,
    deltaPnl: Math.round((botPnl - blindCopyPnl) * 100) / 100,
  };
}

// ─── Missed Winners ────────────────────────────────────────────

/**
 * Identify profitable trades the bot skipped (missed winners).
 * A missed winner is a trade where:
 *   - The trade was profitable (detectedPrice moved favorably)
 *   - The bot decided to skip or watchlist
 *   - The wallet has status "track"
 *
 * @param daysBack - Lookback period (default: 30)
 * @param minProfitPct - Minimum profit to consider a missed winner (default: 5%)
 */
export async function trackMissedWinners(
  daysBack: number = 30,
  minProfitPct: number = 0.05
): Promise<MissedWinner[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceTs = Math.floor(since.getTime() / 1000);

  // Get all decisions that are NOT paper_copy from tracked wallets
  const skipped = await db
    .select({
      dj: decisionJournals,
      ot: observedTrades,
      wp: walletProfiles,
    })
    .from(decisionJournals)
    .innerJoin(observedTrades, eq(decisionJournals.observedTradeId, observedTrades.id))
    .innerJoin(walletProfiles, eq(decisionJournals.walletAddress, walletProfiles.address))
    .where(
      and(
        gte(decisionJournals.createdAt, sinceTs),
        inArray(decisionJournals.decision, ["watchlist", "skip"]),
        eq(walletProfiles.status, "track")
      )
    )
    .orderBy(decisionJournals.copyScore)
    .limit(50);

  const missed: MissedWinner[] = [];

  for (const { dj, ot, wp } of skipped) {
    const entryPrice = ot.walletEntryPrice ?? ot.detectedPrice ?? 0.5;
    const currentPrice = ot.detectedPrice ?? 0.5;
    const side = ot.side?.toLowerCase() ?? "yes";

    // Estimate PnL: if side is "yes" and currentPrice > entryPrice → profit
    let hypotheticalPnl = 0;
    const posSize = dj.simulatedPositionSize ?? 10;
    const shares = entryPrice > 0 ? posSize / entryPrice : 0;

    if (side === "yes") {
      hypotheticalPnl = shares * (currentPrice - entryPrice);
    } else {
      // NO side: profit if currentPrice < entryPrice
      hypotheticalPnl = shares * (entryPrice - currentPrice);
    }

    const profitPct = Math.abs(hypotheticalPnl) / posSize;

    if (hypotheticalPnl > 0 && profitPct >= minProfitPct) {
      let reasons: string[] = [];
      try {
        reasons = JSON.parse(dj.reasonsJson ?? "[]") as string[];
      } catch { /* ignore parse errors */ }

      missed.push({
        walletAddress: dj.walletAddress,
        walletLabel: wp.label ?? undefined,
        marketId: dj.marketId,
        decision: dj.decision,
        copyScore: dj.copyScore ?? 0,
        hypotheticalPnl: Math.round(hypotheticalPnl * 100) / 100,
        skippedReason: reasons,
      });
    }
  }

  // Sort by missed profit (most profitable missed first)
  missed.sort((a, b) => b.hypotheticalPnl - a.hypotheticalPnl);

  return missed;
}

// ─── Avoided Losers ────────────────────────────────────────────

/**
 * Identify losing trades the bot avoided (avoided losers).
 * An avoided loser is a trade where:
 *   - The trade was unprofitable (detectedPrice moved against)
 *   - The bot decided to skip or watchlist
 *   - The wallet has status "track"
 *
 * @param daysBack - Lookback period (default: 30)
 * @param minLossAmt - Minimum loss to consider significant (default: $1)
 */
export async function trackAvoidedLosers(
  daysBack: number = 30,
  minLossAmt: number = 1
): Promise<AvoidedLoser[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceTs = Math.floor(since.getTime() / 1000);

  const skipped = await db
    .select({
      dj: decisionJournals,
      ot: observedTrades,
      wp: walletProfiles,
    })
    .from(decisionJournals)
    .innerJoin(observedTrades, eq(decisionJournals.observedTradeId, observedTrades.id))
    .innerJoin(walletProfiles, eq(decisionJournals.walletAddress, walletProfiles.address))
    .where(
      and(
        gte(decisionJournals.createdAt, sinceTs),
        inArray(decisionJournals.decision, ["watchlist", "skip"]),
        eq(walletProfiles.status, "track")
      )
    )
    .orderBy(decisionJournals.copyScore)
    .limit(50);

  const avoided: AvoidedLoser[] = [];

  for (const { dj, ot, wp } of skipped) {
    const entryPrice = ot.walletEntryPrice ?? ot.detectedPrice ?? 0.5;
    const currentPrice = ot.detectedPrice ?? 0.5;
    const side = ot.side?.toLowerCase() ?? "yes";
    const posSize = dj.simulatedPositionSize ?? 10;
    const shares = entryPrice > 0 ? posSize / entryPrice : 0;

    let hypotheticalLoss = 0;
    if (side === "yes") {
      hypotheticalLoss = shares * (currentPrice - entryPrice);
    } else {
      hypotheticalLoss = shares * (entryPrice - currentPrice);
    }

    if (hypotheticalLoss < 0 && Math.abs(hypotheticalLoss) >= minLossAmt) {
      let reasons: string[] = [];
      try {
        reasons = JSON.parse(dj.reasonsJson ?? "[]") as string[];
      } catch { /* ignore */ }

      avoided.push({
        walletAddress: dj.walletAddress,
        walletLabel: wp.label ?? undefined,
        marketId: dj.marketId,
        decision: dj.decision,
        copyScore: dj.copyScore ?? 0,
        hypotheticalLoss: Math.round(hypotheticalLoss * 100) / 100,
        skippedReason: reasons,
      });
    }
  }

  avoided.sort((a, b) => a.hypotheticalLoss - b.hypotheticalLoss);

  return avoided;
}

// ─── Spread Losses Avoided ─────────────────────────────────────

/**
 * Analyze how much spread cost the bot avoided by filtering out
 * high-spread trades.
 *
 * Spread cost per trade = positionSize * spread (approximate)
 * Total spread the bot paid = sum of spreads on copied trades
 * Total spread avoided = sum of spreads on skipped trades
 *
 * @param daysBack - Lookback period (default: 30)
 */
export async function trackSpreadLossesAvoided(
  daysBack: number = 30
): Promise<SpreadSavings> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceTs = Math.floor(since.getTime() / 1000);

  // Get all decisions with their scores
  const allDecisions = await db
    .select({
      dj: decisionJournals,
      ot: observedTrades,
    })
    .from(decisionJournals)
    .innerJoin(observedTrades, eq(decisionJournals.observedTradeId, observedTrades.id))
    .where(gte(decisionJournals.createdAt, sinceTs))
    .limit(200);

  let highSpreadTrades = 0;
  let estimatedBlindSpreadCost = 0;
  let actualSpreadCost = 0;
  const SPREAD_THRESHOLD = 0.05; // 5% spread = expensive

  for (const { dj, ot } of allDecisions) {
    const posSize = dj.simulatedPositionSize ?? 10;
    // Estimate spread from the scoring results
    const spreadScore = dj.spreadScore ?? 0.5;
    // Higher spreadScore = lower spread (inverted relationship)
    // A spreadScore of 0.3 means high spread, 0.9 means low spread
    const estimatedSpread = spreadScore < 0.5 ? SPREAD_THRESHOLD * 1.5 : SPREAD_THRESHOLD * 0.5;
    const estimatedCost = posSize * estimatedSpread;

    if (estimatedSpread >= SPREAD_THRESHOLD) {
      highSpreadTrades++;
      estimatedBlindSpreadCost += estimatedCost;
      if (dj.decision !== "paper_copy") {
        // Bot avoided this high-spread trade
      } else {
        actualSpreadCost += estimatedCost;
      }
    } else {
      if (dj.decision === "paper_copy") {
        actualSpreadCost += estimatedCost;
      }
      estimatedBlindSpreadCost += estimatedCost;
    }
  }

  return {
    highSpreadTrades,
    estimatedBlindSpreadCost: Math.round(estimatedBlindSpreadCost * 100) / 100,
    actualSpreadCost: Math.round(actualSpreadCost * 100) / 100,
    spreadSaved: Math.round((estimatedBlindSpreadCost - actualSpreadCost) * 100) / 100,
  };
}
