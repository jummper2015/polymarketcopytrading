// scripts/score-trades.ts
// Hito 3.3 — Toma observed_trades sin decisión, carga wallet_profile y
// market_snapshot, calcula scores con trade-scoring.ts, y crea
// DecisionJournal records con paper_copy | watchlist | skip.
// Comando: npm run score:trades

import { db } from "../db";
import {
  observedTrades,
  marketSnapshots,
  walletProfiles,
  decisionJournals,
} from "../db/schema";
import { eq, isNull, desc, and } from "drizzle-orm";
import { scoreTrade, type TradeScoreInput } from "../lib/scoring/trade-scoring";
import { scoreROI, type WalletScoreResult } from "../lib/scoring/wallet-scoring";

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  🎯 Hermes — Trade Scorer");
  console.log("═".repeat(60));

  // Phase 1: Get unscored trades
  console.log("\n  📋 Loading unscored trades...");
  const trades = await getUnscoredTrades();

  if (trades.length === 0) {
    console.log("  ✅ No trades pending scoring.");
    process.exit(0);
  }
  console.log(`  ✅ ${trades.length} trades pending scoring`);

  // Phase 2: Score each trade
  console.log(`\n  🧠 Scoring ${trades.length} trades...`);

  let scored = 0;
  let skipped = 0;
  const decisions = { paper_copy: 0, watchlist: 0, skip: 0 };

  for (const trade of trades) {
    // Load wallet profile
    const wallet = await loadWalletProfile(trade.walletAddress);
    if (!wallet) {
      skipped++;
      continue; // No wallet profile — can't score
    }

    // Load market snapshot (most recent for this market)
    const market = await loadMarketSnapshot(trade.marketId);
    if (!market) {
      skipped++;
      continue; // No market data — can't score
    }

    // Build scoring input
    const input = buildTradeScoreInput(trade, wallet, market);

    // Score it (wrapped to avoid one crash losing all scores)
    try {
      const result = scoreTrade(input);
      await saveDecisionJournal(trade.id, trade.walletAddress, trade.marketId, result);
      decisions[result.decision]++;
      scored++;
    } catch (error) {
      console.error(
        `  ⚠️  Failed to score trade #${trade.id}: ${(error as Error).message}`
      );
      skipped++;
    }
  }

  // Phase 3: Summary
  const scoreTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "═".repeat(60));
  console.log("  📊 Scoring Summary");
  console.log("═".repeat(60));
  console.log(`  Trades scored:         ${scored}`);
  console.log(`  🟢 paper_copy (>0.65):   ${decisions.paper_copy}`);
  console.log(`  🟡 watchlist (0.35-0.65): ${decisions.watchlist}`);
  console.log(`  🔴 skip (<0.35):         ${decisions.skip}`);
  if (skipped > 0) {
    console.log(`  ⚠️  Skipped (no data):     ${skipped}`);
  }
  console.log(`  Total time:            ${scoreTime}s`);
  console.log("\n  ✅ Trade scoring complete.");
  console.log("═".repeat(60) + "\n");
}

// ─── DB Queries ────────────────────────────────────────────────

/** Get observed trades that don't have a decision journal entry yet */
async function getUnscoredTrades() {
  // LEFT JOIN approach: find observed_trades with no matching decision_journal
  const rows = await db
    .select({
      id: observedTrades.id,
      walletAddress: observedTrades.walletAddress,
      marketId: observedTrades.marketId,
      outcome: observedTrades.outcome,
      side: observedTrades.side,
      walletEntryPrice: observedTrades.walletEntryPrice,
      detectedPrice: observedTrades.detectedPrice,
      size: observedTrades.size,
    })
    .from(observedTrades)
    .leftJoin(
      decisionJournals,
      eq(observedTrades.id, decisionJournals.observedTradeId)
    )
    .where(isNull(decisionJournals.id))
    .orderBy(desc(observedTrades.createdAt))
    .limit(200); // reasonable batch size

  return rows;
}

/** Reconstruct WalletScoreResult from wallet_profile DB row */
async function loadWalletProfile(
  address: string
): Promise<WalletScoreResult | null> {
  const rows = await db
    .select()
    .from(walletProfiles)
    .where(eq(walletProfiles.address, address))
    .limit(1);

  if (rows.length === 0) return null;

  const w = rows[0];
  return {
    address: w.address,
    scores: {
      roiScore: scoreROI(w.roi30d),
      consistencyScore: w.consistencyScore ?? 0,
      copyabilityScore: w.copyabilityScore ?? 0,
      categoryStrength: 0, // not stored separately in DB
      liquidityQuality: 0,
      entryTiming: 0,
      resolvedPerformance: 0,
      oneHitWonderPenalty: w.oneHitWonderPenalty ?? 0,
    },
    globalScore: w.globalScore ?? 0,
    status: (w.status as "track" | "watch" | "ignore") ?? "watch",
    reasoning: w.copyabilityNotes?.split("; ") ?? [],
    bestCategory: w.bestCategory ?? null,
  };
}

/** Load most recent market snapshot for a market */
async function loadMarketSnapshot(marketId: string) {
  const rows = await db
    .select()
    .from(marketSnapshots)
    .where(eq(marketSnapshots.marketId, marketId))
    .orderBy(desc(marketSnapshots.collectedAt))
    .limit(1);

  if (rows.length === 0) return null;

  const m = rows[0];
  return {
    spread: m.spread ?? null,
    liquidity: m.liquidity ?? 0,
    category: m.category ?? undefined,
    yesPrice: m.yesPrice ?? 0,
    noPrice: m.noPrice ?? 0,
    timeToResolutionHours: m.timeToResolution
      ? m.timeToResolution / 3600
      : null,
  };
}

// ─── Build TradeScoreInput ─────────────────────────────────────

function buildTradeScoreInput(
  trade: {
    walletAddress: string;
    marketId: string;
    outcome: string | null;
    side: string | null;
    walletEntryPrice: number | null;
    detectedPrice: number | null;
    size: number | null;
  },
  wallet: WalletScoreResult,
  market: NonNullable<Awaited<ReturnType<typeof loadMarketSnapshot>>>
): TradeScoreInput {
  return {
    wallet,
    market: {
      spread: market.spread,
      liquidity: market.liquidity,
      category: market.category,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      timeToResolutionHours: market.timeToResolutionHours,
    },
    trade: {
      outcome: trade.outcome ?? "Unknown",
      side: (trade.side as "yes" | "no") ?? "yes",
      walletEntryPrice: trade.walletEntryPrice ?? 0,
      detectedPrice: trade.detectedPrice ?? 0,
      size: trade.size ?? 0,
    },
  };
}

// ─── Save Decision ─────────────────────────────────────────────

async function saveDecisionJournal(
  observedTradeId: number,
  walletAddress: string,
  marketId: string,
  result: ReturnType<typeof scoreTrade>
) {
  await db.insert(decisionJournals).values({
    observedTradeId,
    walletAddress,
    marketId,
    decision: result.decision,
    copyScore: result.copyScore,
    confidence: result.confidence,
    reasonsJson: JSON.stringify(result.reasons),
    risksJson: JSON.stringify(result.risks),
    walletQualityScore: result.scores.walletQualityScore,
    roiScore: result.scores.roiScore,
    consistencyScore: 0, // wallet-level, not trade-level
    copyabilityScore: 0,
    categoryFitScore: result.scores.categoryFitScore,
    entryTimingScore: result.scores.entryTimingScore,
    spreadScore: result.scores.spreadScore,
    liquidityScore: result.scores.liquidityScore,
    thesisScore: result.scores.thesisScore,
    simulatedPositionSize: result.simulatedPositionSize,
  });
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
