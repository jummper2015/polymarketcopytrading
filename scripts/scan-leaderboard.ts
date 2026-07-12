// scripts/scan-leaderboard.ts
// Hito 2.2 — Escanea el leaderboard de Polymarket (top 500 billeteras)
// y guarda un LeaderboardScan en la base de datos.
// Comando: npm run scan:leaderboard

import { fetchLeaderboard, type LeaderboardEntry } from "../lib/adapters/leaderboard";
import { db } from "../db";
import { leaderboardScans } from "../db/schema";

// ─── Config ────────────────────────────────────────────────────

const SCAN_LIMIT = 500;
const LOOKBACK_DAYS = 30;
const TOP_N_DISPLAY = 10;

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  🔍 Hermes — Polymarket Leaderboard Scanner");
  console.log("═".repeat(60));
  console.log(`  Limit:       ${SCAN_LIMIT} wallets`);
  console.log(`  Lookback:    ${LOOKBACK_DAYS} days`);
  console.log(`  Category:    OVERALL`);
  console.log(`  Time period: ALL`);
  console.log("─".repeat(60));

  // Phase 1: Fetch
  console.log("\n  📡 Fetching leaderboard from Polymarket Data API...");

  // NOTE: The leaderboard API uses timePeriod "ALL" (all-time ranking).
  // The 30-day per-wallet analysis happens in scan:wallets (Hito 2.3).
  let entries: LeaderboardEntry[];
  try {
    entries = await fetchLeaderboard(SCAN_LIMIT, {
      timePeriod: "ALL",
      category: "OVERALL",
    });
  } catch (error) {
    console.error(`\n  ❌ Failed to fetch leaderboard: ${(error as Error).message}`);
    process.exit(1);
  }

  const fetchTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ✅ Fetched ${entries.length} wallets in ${fetchTime}s`);

  if (entries.length === 0) {
    console.log("\n  ⚠️  No wallets returned — nothing to save.");
    process.exit(0);
  }

  // Phase 2: Compute stats
  const stats = computeStats(entries);

  // Top by PnL (for both JSON and display)
  const topByPnl = [...entries]
    .filter((e) => e.pnl !== undefined)
    .sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))
    .slice(0, TOP_N_DISPLAY);

  // Phase 3: Save to DB
  console.log("\n  💾 Saving LeaderboardScan to database...");
  const rawSummary = buildSummaryJson(topByPnl, entries.length, entries.map((e) => e.address), stats);

  try {
    await db.insert(leaderboardScans).values({
      source: "polymarket",
      walletCount: entries.length,
      lookbackDays: LOOKBACK_DAYS,
      rawSummaryJson: rawSummary,
    });
  } catch (error) {
    console.error(`\n  ❌ Failed to save scan: ${(error as Error).message}`);
    process.exit(1);
  }

  console.log("  ✅ Scan saved.");

  // Phase 4: Display summary
  printSummary(entries, stats, topByPnl, startTime);
}

// ─── Stats ─────────────────────────────────────────────────────

interface ScanStats {
  avgRoi: number;
  medianRoi: number;
  avgPnl: number;
  totalVolume: number;
  avgWinRate: number;
  avgTradeCount: number;
  walletsWithPnL: number;
  walletsWithRoi: number;
}

function computeStats(entries: LeaderboardEntry[]): ScanStats {
  const withPnl = entries.filter((e) => e.pnl !== undefined && e.pnl !== null);
  const withRoi = entries.filter((e) => e.roi !== undefined && e.roi !== null);
  const withWinRate = entries.filter((e) => e.winRate !== undefined && e.winRate !== null);
  const withTradeCount = entries.filter((e) => e.tradeCount !== undefined && e.tradeCount !== null);

  const totalVolume = entries.reduce((sum, e) => sum + (e.volume ?? 0), 0);
  const avgPnl =
    withPnl.length > 0
      ? withPnl.reduce((sum, e) => sum + e.pnl!, 0) / withPnl.length
      : 0;
  const avgRoi =
    withRoi.length > 0
      ? withRoi.reduce((sum, e) => sum + e.roi!, 0) / withRoi.length
      : 0;

  const rois = withRoi
    .map((e) => e.roi!)
    .sort((a, b) => a - b);
  const medianRoi =
    rois.length > 0 ? rois[Math.floor(rois.length / 2)] : 0;

  const avgWinRate =
    withWinRate.length > 0
      ? withWinRate.reduce((sum, e) => sum + e.winRate!, 0) /
        withWinRate.length
      : 0;
  const avgTradeCount =
    withTradeCount.length > 0
      ? Math.round(
          withTradeCount.reduce((sum, e) => sum + e.tradeCount!, 0) /
            withTradeCount.length
        )
      : 0;

  return {
    avgRoi,
    medianRoi,
    avgPnl,
    totalVolume,
    avgWinRate,
    avgTradeCount,
    walletsWithPnL: withPnl.length,
    walletsWithRoi: withRoi.length,
  };
}

// ─── Summary ───────────────────────────────────────────────────

function buildSummaryJson(
  topByPnl: LeaderboardEntry[],
  totalFetched: number,
  allAddresses: string[],
  stats: ScanStats
): string {
  const top10 = topByPnl.map((e) => ({
    address: e.address,
    rank: e.rank,
    label: e.label,
    pnl: e.pnl,
    roi: e.roi,
    winRate: e.winRate,
    tradeCount: e.tradeCount,
  }));

  return JSON.stringify({
    fetchedAt: new Date().toISOString(),
    totalFetched,
    lookbackDays: LOOKBACK_DAYS,
    addresses: allAddresses,
    stats: {
      avgRoi: stats.avgRoi,
      medianRoi: stats.medianRoi,
      avgPnl: stats.avgPnl,
      totalVolume: stats.totalVolume,
      avgWinRate: stats.avgWinRate,
      avgTradeCount: stats.avgTradeCount,
    },
    top10,
  });
}

function printSummary(
  entries: LeaderboardEntry[],
  stats: ScanStats,
  topByPnl: LeaderboardEntry[],
  startTime: number
) {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "═".repeat(60));
  console.log("  📊 Scan Summary");
  console.log("═".repeat(60));

  // Stats grid
  console.log(`  Wallets fetched:      ${entries.length}`);
  console.log(`  With PnL data:        ${stats.walletsWithPnL}`);
  console.log(`  With ROI data:        ${stats.walletsWithRoi}`);
  console.log(`  Avg PnL:              ${formatCurrency(stats.avgPnl)}`);
  console.log(`  Avg ROI:              ${formatPercent(stats.avgRoi)}`);
  console.log(`  Median ROI:           ${formatPercent(stats.medianRoi)}`);
  console.log(`  Total volume:         ${formatCurrency(stats.totalVolume)}`);
  console.log(`  Avg win rate:         ${formatPercent(stats.avgWinRate)}`);
  console.log(`  Avg trade count:      ${stats.avgTradeCount}`);
  console.log(`  Total time:           ${totalTime}s`);

  // Top N wallets
  console.log("\n" + "─".repeat(60));
  console.log(`  🏆 Top ${TOP_N_DISPLAY} Wallets by PnL`);
  console.log("─".repeat(60));

  // Use the pre-computed topByPnl (consistent with stored JSON)
  console.log(
    `  ${"Rank".padEnd(5)} ${"Address".padEnd(14)} ${"PnL".padStart(12)} ${"ROI".padStart(8)} ${"Win%".padStart(7)}  ${"Label"}`,
  );
  console.log(
    `  ${"────".padEnd(5)} ${"──────────────".padEnd(14)} ${"────────────".padStart(12)} ${"────────".padStart(8)} ${"──────".padStart(7)}  ${"─────"}`,
  );

  for (const e of topByPnl) {
    const addr = `${e.address.slice(0, 6)}...${e.address.slice(-4)}`;
    console.log(
      `  ${String(e.rank).padStart(4)} ${addr.padEnd(14)} ${formatCurrency(e.pnl ?? 0).padStart(12)} ${formatPercent(e.roi ?? 0).padStart(8)} ${formatPercent(e.winRate ?? 0).padStart(7)}  ${e.label ?? "-"}`,
    );
  }

  console.log("\n  ✅ Scan complete.");
  console.log("═".repeat(60) + "\n");
}

// ─── Formatters ────────────────────────────────────────────────

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
