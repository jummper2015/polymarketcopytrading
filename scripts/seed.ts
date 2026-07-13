// Seed Script — Hito 9.3
// Populates the database with demo data for development and testing.
// All demo data is clearly labeled as [DEMO] and uses fictional addresses.
// Idempotent: safe to run multiple times — skips existing records.
// Comando: npm run seed

import { db } from "../db";
import {
  walletProfiles,
  observedTrades,
  marketSnapshots,
  decisionJournals,
  paperTrades,
  ruleSets,
  dailyReports,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getDefaultRules } from "../lib/rules/rule-engine";

// ─── Demo Data ─────────────────────────────────────────────────

const DEMO_WALLETS = [
  { address: "0xDEM0AAA11112222333344445555666677778888", label: "[DEMO] Alpha Whale", sourceRank: 1, status: "track" as const, roi30d: 1.25, consistencyScore: 0.82, copyabilityScore: 0.75, globalScore: 0.88, bestCategory: "Crypto", tradeCount30d: 45, resolvedTradeCount30d: 20, winRate30d: 0.68 },
  { address: "0xDEM0BBB22223333444455556666777788889999", label: "[DEMO] Beta Hunter", sourceRank: 3, status: "track" as const, roi30d: 0.85, consistencyScore: 0.78, copyabilityScore: 0.82, globalScore: 0.82, bestCategory: "Sports", tradeCount30d: 32, resolvedTradeCount30d: 15, winRate30d: 0.73 },
  { address: "0xDEM0CCC33334444555566667777888899990000", label: "[DEMO] Gamma Scout", sourceRank: 7, status: "watch" as const, roi30d: 0.42, consistencyScore: 0.55, copyabilityScore: 0.60, globalScore: 0.58, bestCategory: "Politics", tradeCount30d: 18, resolvedTradeCount30d: 8, winRate30d: 0.5 },
  { address: "0xDEM0DDD44445555666677778888999900001111", label: "[DEMO] Delta Sniper", sourceRank: 12, status: "watch" as const, roi30d: 0.65, consistencyScore: 0.48, copyabilityScore: 0.40, globalScore: 0.52, bestCategory: "Crypto", tradeCount30d: 22, resolvedTradeCount30d: 12, winRate30d: 0.42 },
  { address: "0xDEM0EEE55556666777788889999000011112222", label: "[DEMO] Omega Lucky", sourceRank: 50, status: "ignore" as const, roi30d: 2.5, consistencyScore: 0.15, copyabilityScore: 0.05, oneHitWonderPenalty: 0.4, globalScore: 0.25, bestCategory: "Crypto", tradeCount30d: 3, resolvedTradeCount30d: 2, winRate30d: 0.67 },
];

const DEMO_MARKETS = [
  { marketId: "0xMARKET001", question: "[DEMO] Will Bitcoin exceed $100K by July 2026?", category: "Crypto", yesPrice: 0.62, noPrice: 0.38, spread: 0.015, liquidity: 25000 },
  { marketId: "0xMARKET002", question: "[DEMO] Will the Fed cut rates in July 2026?", category: "Politics", yesPrice: 0.45, noPrice: 0.55, spread: 0.02, liquidity: 18000 },
  { marketId: "0xMARKET003", question: "[DEMO] Will Argentina win Copa America 2026?", category: "Sports", yesPrice: 0.35, noPrice: 0.65, spread: 0.03, liquidity: 12000 },
  { marketId: "0xMARKET004", question: "[DEMO] Will Ethereum ETF net inflows exceed $5B?", category: "Crypto", yesPrice: 0.55, noPrice: 0.45, spread: 0.01, liquidity: 35000 },
  { marketId: "0xMARKET005", question: "[DEMO] Will the S&P 500 close above 6000 in 2026?", category: "Finance", yesPrice: 0.52, noPrice: 0.48, spread: 0.025, liquidity: 8000 },
  { marketId: "0xMARKET006", question: "[DEMO] Will NFLX subscribers exceed 300M?", category: "Business", yesPrice: 0.68, noPrice: 0.32, spread: 0.018, liquidity: 15000 },
];

const DECISIONS = ["paper_copy", "watchlist", "skip"] as const;

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(60));
  console.log("  🌱 MESIRVE — Database Seeder [DEMO]");
  console.log("═".repeat(60));
  console.log("  ⚠️  All data will be tagged [DEMO] — fictional only.\n");

  const now = new Date();
  let inserts = 0;

  // 1. Seed Wallet Profiles
  console.log("  👥 Seeding wallet profiles...");
  for (const w of DEMO_WALLETS) {
    const existing = await db
      .select({ id: walletProfiles.id })
      .from(walletProfiles)
      .where(eq(walletProfiles.address, w.address))
      .limit(1);
    if (existing.length > 0) {
      console.log(`    ⏭  ${w.label} (already exists)`);
      continue;
    }
    await db.insert(walletProfiles).values({
      ...w,
      oneHitWonderPenalty: w.oneHitWonderPenalty ?? 0,
      averageTradeSize: 150,
      averageLiquidity: 8000,
      averageSpread: 0.025,
      averageEntryTiming: 24,
      lastScannedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`    ✅ ${w.label} — Score: ${w.globalScore} | Status: ${w.status}`);
    inserts++;
  }
  console.log(`  📊 ${inserts} wallet profiles seeded\n`);

  // 2. Seed Observed Trades + Market Snapshots (idempotent)
  console.log("  🔍 Seeding observed trades...");
  let otCount = 0;
  let msCount = 0;
  for (let i = 0; i < DEMO_WALLETS.length; i++) {
    const wallet = DEMO_WALLETS[i];
    for (let j = 0; j < DEMO_MARKETS.length; j++) {
      const market = DEMO_MARKETS[j];
      const side = j % 2 === 0 ? "yes" as const : "no" as const;
      const walletEntryPrice = j % 2 === 0 ? market.yesPrice - 0.02 : market.noPrice - 0.01;
      const detectedPrice = j % 2 === 0 ? market.yesPrice : market.noPrice;
      const timestamp = new Date(now.getTime() - (i * 2 + j) * 3600_000);

      // Check for existing trade with same wallet+marketId+timestamp combo
      const existingOt = await db
        .select({ id: observedTrades.id })
        .from(observedTrades)
        .where(
          and(
            eq(observedTrades.walletAddress, wallet.address),
            eq(observedTrades.marketId, market.marketId)
          )
        )
        .limit(1);

      if (existingOt.length === 0) {
        await db.insert(observedTrades).values({
          walletAddress: wallet.address,
          marketId: market.marketId,
          conditionId: market.marketId,
          marketQuestion: market.question,
          marketCategory: market.category,
          outcome: side === "yes" ? "Yes" : "No",
          side,
          walletEntryPrice,
          detectedPrice,
          size: 100 + j * 50,
          timestamp,
          createdAt: timestamp,
        });
        otCount++;
      }

      // Market snapshot — check for existing
      const existingMs = await db
        .select({ id: marketSnapshots.id })
        .from(marketSnapshots)
        .where(eq(marketSnapshots.marketId, market.marketId))
        .limit(1);

      if (existingMs.length === 0) {
        await db.insert(marketSnapshots).values({
          marketId: market.marketId,
          conditionId: market.marketId,
          question: market.question,
          category: market.category,
          yesPrice: market.yesPrice,
          noPrice: market.noPrice,
          spread: market.spread,
          liquidity: market.liquidity,
          volume: market.liquidity * 2,
          timeToResolution: 6 * 3600,
          collectedAt: timestamp,
        });
        msCount++;
      }
    }
    console.log(`    ✅ ${wallet.label}: processed`);
  }
  console.log(`  📊 ${otCount} new trades, ${msCount} new market snapshots\n`);

  // 3. Seed Decision Journals (idempotent — skip if OT already has a DJ)
  console.log("  🧠 Seeding decision journals...");
  let djCount = 0;
  const createdDjIds: number[] = [];

  // Fetch only observed trades that don't have a decision journal yet
  const allObserved = await db
    .select({
      ot: { id: observedTrades.id, walletAddress: observedTrades.walletAddress },
      dj: { id: decisionJournals.id },
    })
    .from(observedTrades)
    .leftJoin(decisionJournals, eq(observedTrades.id, decisionJournals.observedTradeId))
    .limit(200);

  // Filter to only those without an existing DJ
  const unscored = allObserved.filter((r) => !r.dj);

  for (let i = 0; i < unscored.length; i++) {
    const row = unscored[i];
    const decision = DECISIONS[i % DECISIONS.length];
    const walletIdx =
      DEMO_WALLETS.findIndex((w) => w.address === row.ot.walletAddress) % DEMO_WALLETS.length;
    const wallet = DEMO_WALLETS[walletIdx >= 0 ? walletIdx : 0];

    await db.insert(decisionJournals).values({
      observedTradeId: row.ot.id,
      walletAddress: wallet.address,
      marketId: DEMO_MARKETS[i % DEMO_MARKETS.length].marketId,
      decision,
      copyScore: decision === "paper_copy" ? 0.78 : decision === "watchlist" ? 0.55 : 0.25,
      confidence: 0.75,
      walletQualityScore: wallet.globalScore,
      roiScore: wallet.roi30d > 1 ? 0.8 : 0.5,
      consistencyScore: wallet.consistencyScore,
      categoryFitScore: 0.7,
      entryTimingScore: 0.65,
      spreadScore: 0.8,
      liquidityScore: 0.75,
      thesisScore: 0.6,
      simulatedPositionSize: decision === "paper_copy" ? 10 : decision === "watchlist" ? 3 : 0,
      reasonsJson: JSON.stringify(["[DEMO] Trade matches wallet expertise", "[DEMO] Good entry timing detected"]),
      risksJson: JSON.stringify(["[DEMO] Moderate spread — slippage possible"]),
    });
    createdDjIds.push(row.ot.id);
    djCount++;
  }

  console.log(`    ✅ ${djCount} decision journals seeded\n`);

  // 4. Seed Paper Trades (idempotent — only for DJs without existing paper trades)
  console.log("  📋 Seeding paper trades...");
  let ptCount = 0;

  // Fetch DJs that have no paper trade yet
  const djWithoutPt = await db
    .select({
      dj: { id: decisionJournals.id, decision: decisionJournals.decision, walletAddress: decisionJournals.walletAddress, marketId: decisionJournals.marketId },
      pt: { id: paperTrades.id },
    })
    .from(decisionJournals)
    .leftJoin(paperTrades, eq(decisionJournals.id, paperTrades.decisionJournalId))
    .limit(200);

  const eligibleDj = djWithoutPt.filter((r) => r.dj.decision === "paper_copy" && !r.pt);

  for (const row of eligibleDj) {
    const dj = row.dj;
    const market = DEMO_MARKETS.find((m) => m.marketId === dj.marketId);
    if (!market) continue;

    const side = (Math.random() > 0.5 ? "yes" : "no") as "yes" | "no";
    const entryPrice = side === "yes" ? market.yesPrice : market.noPrice;
    const positionSize = 5 + Math.floor(Math.random() * 16);
    const isResolved = Math.random() > 0.6;
    const won = Math.random() > 0.4;
    const currentPrice = isResolved
      ? (won ? 1.0 : 0.0)
      : entryPrice * (1 + (Math.random() - 0.5) * 0.2);

    const shares = positionSize / entryPrice;
    let unrealizedPnl = 0;
    let realizedPnl = 0;

    if (isResolved) {
      realizedPnl = won ? shares * (1 - entryPrice) : -positionSize;
    } else {
      unrealizedPnl = shares * (currentPrice - entryPrice);
    }

    const openedAt = new Date(now.getTime() - Math.floor(Math.random() * 7 * 86400_000));
    const resolvedDate = isResolved
      ? new Date(openedAt.getTime() + Math.floor(Math.random() * 5 * 86400_000))
      : null;

    await db.insert(paperTrades).values({
      decisionJournalId: dj.id,
      walletAddress: dj.walletAddress,
      marketId: dj.marketId,
      outcome: side === "yes" ? "Yes" : "No",
      side,
      entryPrice,
      currentPrice: isResolved ? (won ? 1.0 : 0.0) : currentPrice,
      simulatedPositionSize: positionSize,
      unrealizedPnl: Math.round(unrealizedPnl * 10000) / 10000,
      realizedPnl: Math.round(realizedPnl * 10000) / 10000,
      status: isResolved ? "resolved" : "open",
      openedAt,
      resolvedAt: resolvedDate,
      closedAt: resolvedDate,
    });
    ptCount++;
  }
  console.log(`    ✅ ${ptCount} paper trades seeded\n`);

  // 5. Seed Rule Sets (v1.0.0 default)
  console.log("  🧠 Seeding default rules...");
  const existingRules = await db.select({ id: ruleSets.id }).from(ruleSets).limit(1);
  if (existingRules.length === 0) {
    const defaults = getDefaultRules();
    await db.insert(ruleSets).values({
      version: defaults.version,
      active: true,
      rulesJson: JSON.stringify(defaults),
    });
    console.log("    ✅ Default rules v1.0.0 seeded\n");
  } else {
    console.log("    ⏭  Rules already exist\n");
  }

  // 6. Seed Daily Reports (last 3 days) — idempotent
  console.log("  📄 Seeding daily reports...");
  for (let d = 0; d < 3; d++) {
    const date = new Date(now.getTime() - d * 86400_000).toISOString().slice(0, 10);
    const existing = await db
      .select({ id: dailyReports.id })
      .from(dailyReports)
      .where(eq(dailyReports.date, date))
      .limit(1);
    if (existing.length > 0) {
      console.log(`    ⏭  Report for ${date} already exists`);
      continue;
    }

    const mockPnl = (Math.random() - 0.3) * 50;
    const mockWinRate = 0.5 + Math.random() * 0.3;

    await db.insert(dailyReports).values({
      date,
      paperPnl: Math.round(mockPnl * 100) / 100,
      winRate: Math.round(mockWinRate * 10000) / 10000,
      openPositions: Math.floor(Math.random() * 5) + 1,
      newSignals: Math.floor(Math.random() * 15) + 5,
      copiedSignals: Math.floor(Math.random() * 5) + 1,
      watchedSignals: Math.floor(Math.random() * 5) + 1,
      skippedSignals: Math.floor(Math.random() * 5) + 1,
      bestWalletsJson: JSON.stringify([{ address: DEMO_WALLETS[0].address, label: DEMO_WALLETS[0].label, simulatedPnl: 25, tradeCount: 8, resolvedCount: 4, winRate: 0.75 }]),
      worstWalletsJson: JSON.stringify([{ address: DEMO_WALLETS[4].address, label: DEMO_WALLETS[4].label, simulatedPnl: -18, tradeCount: 3, resolvedCount: 2, winRate: 0 }]),
      ruleChangesJson: JSON.stringify([]),
      summary: `[DEMO] Daily report for ${date}. Paper PnL: ${mockPnl >= 0 ? "+" : ""}$${mockPnl.toFixed(2)}. Win rate: ${(mockWinRate * 100).toFixed(0)}%.`,
      sentToTelegram: false,
    });
    console.log(`    ✅ Report seeded for ${date}: PnL ${mockPnl >= 0 ? "+" : ""}$${mockPnl.toFixed(2)} | WR ${(mockWinRate * 100).toFixed(0)}%`);
  }
  console.log("");

  // ── Summary ──────────────────────────────────────────────────
  console.log("═".repeat(60));
  console.log("  ✅ Seed complete!");
  console.log("═".repeat(60));
  console.log("  Dashboard ready at: http://localhost:3000");
  console.log("");
  console.log("  Demo data includes:");
  console.log(`    • ${DEMO_WALLETS.length} wallets (track/watch/ignore)`);
  console.log(`    • ${DEMO_MARKETS.length} markets across categories`);
  console.log(`    • Observed trades + market snapshots`);
  console.log(`    • ${djCount} decision journals (paper_copy/watchlist/skip)`);
  console.log(`    • ${ptCount} paper trades (open + resolved)`);
  console.log("    • Default rules v1.0.0");
  console.log("    • 3 daily reports");
  console.log("");
  console.log("  ⚠️  ALL DATA IS FICTIONAL [DEMO] — No real money involved.");
  console.log("═".repeat(60));

  process.exit(0);
}

main().catch((err) => {
  console.error(`\n  ❌ Seed failed: ${(err as Error).message}`);
  process.exit(1);
});
