// scripts/scan-wallets.ts
// Hito 2.3 — Para cada wallet del último scan del leaderboard,
// obtiene su actividad (30d), calcula scores con wallet-scoring.ts,
// y guarda/actualiza el perfil en wallet_profile.
// Comando: npm run scan:wallets

import { db } from "../db";
import { leaderboardScans, walletProfiles } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import {
  fetchWalletActivitySummary,
  fetchLeaderboard,
  type LeaderboardEntry,
  type WalletActivitySummary,
} from "../lib/adapters/leaderboard";
import {
  scoreWallet,
  type WalletInput,
  type WalletScoreResult,
} from "../lib/scoring/wallet-scoring";
import { sleep } from "../lib/adapters/client";

// ─── Config ────────────────────────────────────────────────────

const BATCH_SIZE = 10; // Wallets processed concurrently (increased from 5)
const BATCH_DELAY_MS = 200; // Delay between batches in ms (reduced from 500)
const LOOKBACK_DAYS = 30;
const DEFAULT_LIMIT = 100; // Default: profile top 100 wallets (reduced from 500)

/**
 * How recent a profile must be (in ms) to skip re-profiling.
 * Wallets profiled within this window are skipped when --skip-recent is set.
 */
const RECENT_PROFILE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ─── CLI Arguments ─────────────────────────────────────────────

interface CliArgs {
  /** Max wallets to profile (default: 100) */
  limit: number;
  /** Skip wallets profiled within the last hour */
  skipRecent: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const cli: CliArgs = { limit: DEFAULT_LIMIT, skipRecent: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && i + 1 < args.length) {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed) && parsed > 0) {
        cli.limit = parsed;
      }
    }
    if (args[i] === "--skip-recent") {
      cli.skipRecent = true;
    }
  }

  return cli;
}

// ─── Types ─────────────────────────────────────────────────────

interface ScanWalletPair {
  address: string;
  entry: LeaderboardEntry | undefined;
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const cli = parseArgs();
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  🧬 MESIRVE — Wallet Profiler & Scorer");
  console.log("═".repeat(60));
  console.log(`  Lookback:    ${LOOKBACK_DAYS} days`);
  console.log(`  Batch size:  ${BATCH_SIZE} wallets`);
  console.log(`  Batch delay: ${BATCH_DELAY_MS}ms`);
  console.log(`  Wallet cap:  ${cli.limit}`);
  if (cli.skipRecent) {
    console.log(`  Skip recent: yes (< ${RECENT_PROFILE_WINDOW_MS / 60_000} min old)`);
  }
  console.log("─".repeat(60));

  // Phase 1: Get the latest scan and wallet list
  console.log("\n  📋 Loading latest leaderboard scan...");
  const wallets = await getWalletsFromLatestScan(cli.limit);

  if (wallets.length === 0) {
    console.log(
      "  ⚠️  No scan found. Run `npm run scan:leaderboard` first."
    );
    process.exit(0);
  }

  // Phase 1b: If --skip-recent, filter out wallets profiled within the last hour
  let walletsToProfile = wallets;
  if (cli.skipRecent && wallets.length > 0) {
    const recentAddrs = await getRecentlyProfiledAddresses();
    if (recentAddrs.size > 0) {
      walletsToProfile = wallets.filter((w) => !recentAddrs.has(w.address));
      console.log(
        `  ⏭️  Skipping ${recentAddrs.size} wallets profiled recently (${wallets.length - walletsToProfile.length} skipped, ${walletsToProfile.length} remaining)`
      );
    }
  }

  console.log(`  ✅ ${walletsToProfile.length} wallets to profile`);

  if (walletsToProfile.length === 0) {
    console.log("  ℹ️  All wallets already profiled recently. Nothing to do.");
    process.exit(0);
  }

  // Phase 2: Profile each wallet in batches
  console.log(`\n  🔬 Profiling ${walletsToProfile.length} wallets...`);
  console.log(`  (Fetching activity data + computing scores)`);

  const results: ProfileResult[] = [];
  let profiled = 0;
  let errors = 0;

  for (let i = 0; i < walletsToProfile.length; i += BATCH_SIZE) {
    const batch = walletsToProfile.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(walletsToProfile.length / BATCH_SIZE);

    process.stdout.write(
      `\r  Batch ${batchNum}/${totalBatches} — processing wallets ${i + 1}-${Math.min(i + BATCH_SIZE, walletsToProfile.length)}...`
    );

    const batchResults = await Promise.allSettled(
      batch.map((w) => profileWallet(w.address, w.entry))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
        profiled++;
      } else {
        errors++;
      }
    }

    // Delay between batches for rate limiting
    if (i + BATCH_SIZE < walletsToProfile.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const profileTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  ✅ Profiled ${profiled} wallets in ${profileTime}s`);
  if (errors > 0) {
    console.log(`  ⚠️  ${errors} wallets failed (API errors or no data)`);
  }

  // Phase 3: Save to DB
  console.log("\n  💾 Saving wallet profiles to database...");
  let saved = 0;
  for (const result of results) {
    try {
      await upsertWalletProfile(
        result.score,
        wallets.find((w) => w.address === result.score.address)?.entry,
        result.summary
      );
      saved++;
    } catch (error) {
      console.error(
        `\n  ⚠️  Failed to save ${result.score.address.slice(0, 10)}...: ${(error as Error).message}`
      );
    }
  }
  console.log(`  ✅ Saved ${saved} profiles`);

  // Phase 4: Display summary
  printSummary(results.map((r) => r.score), startTime);
}

/** Get wallet addresses that were profiled within the recent window */
async function getRecentlyProfiledAddresses(): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - RECENT_PROFILE_WINDOW_MS);
  // Fetch all wallet addresses with their last scan time, filter in JS
  const rows = await db
    .select({
      address: walletProfiles.address,
      lastScannedAt: walletProfiles.lastScannedAt,
    })
    .from(walletProfiles);

  return new Set(
    rows
      .filter((r) => r.lastScannedAt !== null && r.lastScannedAt >= cutoff)
      .map((r) => r.address)
  );
}

// ─── Wallet List ───────────────────────────────────────────────

async function getWalletsFromLatestScan(limit: number = DEFAULT_LIMIT): Promise<ScanWalletPair[]> {
  // Get the most recent scan
  const scans = await db
    .select()
    .from(leaderboardScans)
    .orderBy(desc(leaderboardScans.scannedAt))
    .limit(1);

  if (scans.length === 0) {
    return [];
  }

  const scan = scans[0];
  console.log(
    `  Scan ID: ${scan.id} | Date: ${scan.scannedAt?.toISOString() ?? "unknown"} | Wallets: ${scan.walletCount}`
  );

  // Try to get addresses from rawSummaryJson first
  if (scan.rawSummaryJson) {
    try {
      const summary = JSON.parse(scan.rawSummaryJson);
      if (summary.addresses && Array.isArray(summary.addresses)) {
        // Build pairs with any leaderboard metadata available
        const pairs: ScanWalletPair[] = [];
        const top10 = summary.top10 as
          | Array<{ address: string; rank: number; pnl?: number; roi?: number }>
          | undefined;

        const limitedAddrs = (summary.addresses as string[]).slice(0, limit);

        for (const addr of limitedAddrs) {
          const entry = top10?.find((t) => t.address === addr);
          pairs.push({
            address: addr,
            entry: entry
              ? {
                  address: entry.address,
                  rank: entry.rank,
                  pnl: entry.pnl,
                  roi: entry.roi,
                }
              : undefined,
          });
        }
        return pairs;
      }
    } catch {
      // JSON parse failed — fall through to re-fetch
    }
  }

  // Fallback: re-fetch leaderboard
  console.log("  (No addresses in scan — re-fetching leaderboard...)");
  const entries = await fetchLeaderboard(limit, {
    timePeriod: "ALL",
    category: "OVERALL",
  });

  return entries.map((e) => ({ address: e.address, entry: e }));
}

// ─── Profile Single Wallet ─────────────────────────────────────

interface ProfileResult {
  score: WalletScoreResult;
  summary: WalletActivitySummary | undefined;
}

async function profileWallet(
  address: string,
  entry?: LeaderboardEntry
): Promise<ProfileResult | null> {
  // Fetch activity data from Polymarket API
  let summary;
  try {
    summary = await fetchWalletActivitySummary(address, LOOKBACK_DAYS);
  } catch {
    // If activity fetch fails, score with leaderboard data only
    summary = undefined;
  }

  // Build WalletInput for the scoring engine
  const input: WalletInput = {
    address,
    leaderboard: entry,
    activity: summary,
    trades: summary?.recentTrades,
    positions: summary?.positions,
    roi: entry?.roi ?? summary?.roiEstimate ?? undefined,
    tradeCount: summary?.tradeCount ?? entry?.tradeCount,
    winRate: summary?.winRate ?? entry?.winRate,
    volume: entry?.volume,
    averageTradeSize: summary?.averageTradeSize,
    resolvedTradeCount: summary?.resolvedTradeCount,
    categoryDistribution: summary
      ? buildCategoryDistribution(summary.recentTrades)
      : undefined,
  };

  return { score: scoreWallet(input), summary };
}

// ─── DB Upsert ─────────────────────────────────────────────────

async function upsertWalletProfile(
  result: WalletScoreResult,
  entry: LeaderboardEntry | undefined,
  summary: WalletActivitySummary | undefined
) {
  const now = new Date();

  // Check if profile already exists
  const existing = await db
    .select({ id: walletProfiles.id })
    .from(walletProfiles)
    .where(eq(walletProfiles.address, result.address))
    .limit(1);

  const data = {
    address: result.address,
    label: entry?.label ?? null,
    sourceRank: entry?.rank ?? null,
    status: result.status,
    roi30d: summary?.roiEstimate ?? entry?.roi ?? 0,
    consistencyScore: result.scores.consistencyScore,
    copyabilityScore: result.scores.copyabilityScore,
    oneHitWonderPenalty: result.scores.oneHitWonderPenalty,
    globalScore: result.globalScore,
    bestCategory: result.bestCategory,
    categoryStrengthsJson: summary
      ? JSON.stringify(buildCategoryDistribution(summary.recentTrades))
      : null,
    averageTradeSize: summary?.averageTradeSize ?? 0,
    tradeCount30d: summary?.tradeCount ?? entry?.tradeCount ?? 0,
    resolvedTradeCount30d: summary?.resolvedTradeCount ?? 0,
    winRate30d: summary?.winRate ?? entry?.winRate ?? 0,
    averageLiquidity: 0,
    averageSpread: 0,
    averageEntryTiming: 0,
    copyabilityNotes: buildCopyabilityNotes(result),
    riskNotes: result.scores.oneHitWonderPenalty > 0
      ? `One-hit-wonder penalty: ${result.scores.oneHitWonderPenalty}`
      : null,
    lastScannedAt: now,
    updatedAt: now,
  };

  if (existing.length > 0) {
    // Update existing profile
    await db
      .update(walletProfiles)
      .set(data)
      .where(eq(walletProfiles.address, result.address));
  } else {
    // Insert new profile
    await db.insert(walletProfiles).values({
      ...data,
      createdAt: now,
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function buildCopyabilityNotes(result: WalletScoreResult): string | null {
  // Filter reasoning to only copyability-related notes
  const copyReasons = result.reasoning.filter(
    (r) =>
      r.includes("copy") ||
      r.includes("liquidity") ||
      r.includes("spread") ||
      r.includes("trade size") ||
      r.includes("slippage")
  );
  return copyReasons.length > 0 ? copyReasons.join("; ") : null;
}

function buildCategoryDistribution(
  trades: { marketId?: string }[]
): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const trade of trades) {
    // Use marketId prefix as a rough category proxy
    // Real categories would come from market data (Hito 3+)
    const prefix = trade.marketId?.split("-")[0] ?? "unknown";
    dist[prefix] = (dist[prefix] ?? 0) + 1;
  }
  return dist;
}

// ─── Summary Display ───────────────────────────────────────────

function printSummary(results: WalletScoreResult[], startTime: number) {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  const track = results.filter((r) => r.status === "track");
  const watch = results.filter((r) => r.status === "watch");
  const ignore = results.filter((r) => r.status === "ignore");

  const avgScore =
    results.length > 0
      ? results.reduce((s, r) => s + r.globalScore, 0) / results.length
      : 0;

  console.log("\n" + "═".repeat(60));
  console.log("  📊 Profiling Summary");
  console.log("═".repeat(60));

  console.log(`  Total profiled:        ${results.length}`);
  console.log(
    `  🟢 Track (>0.70):       ${track.length} (${percent(track.length, results.length)})`
  );
  console.log(
    `  🟡 Watch (0.40-0.70):   ${watch.length} (${percent(watch.length, results.length)})`
  );
  console.log(
    `  🔴 Ignore (<0.40):      ${ignore.length} (${percent(ignore.length, results.length)})`
  );
  console.log(`  Average global score:  ${(avgScore * 100).toFixed(1)}%`);
  console.log(`  Total time:            ${totalTime}s`);

  // Top track wallets
  const topTrack = track.slice(0, 10);
  if (topTrack.length > 0) {
    console.log("\n" + "─".repeat(60));
    console.log("  🏆 Top Track Wallets");
    console.log("─".repeat(60));
    console.log(
      `  ${"Address".padEnd(14)} ${"Score".padStart(7)} ${"ROI".padStart(8)} ${"Cons".padStart(6)} ${"Copy".padStart(6)}  ${"Best Category"}`,
    );
    console.log(
      `  ${"──────────────".padEnd(14)} ${"─────".padStart(7)} ${"────────".padStart(8)} ${"──────".padStart(6)} ${"──────".padStart(6)}  ${"─────────────"}`,
    );

    for (const r of topTrack) {
      const addr = `${r.address.slice(0, 6)}...${r.address.slice(-4)}`;
      console.log(
        `  ${addr.padEnd(14)} ${(r.globalScore * 100).toFixed(1).padStart(6)}% ${"...".padStart(8)} ${(r.scores.consistencyScore * 100).toFixed(0).padStart(5)}% ${(r.scores.copyabilityScore * 100).toFixed(0).padStart(5)}%  ${r.bestCategory ?? "-"}`,
      );
    }
  }

  // Penalized wallets
  const penalized = results.filter((r) => r.scores.oneHitWonderPenalty > 0);
  if (penalized.length > 0) {
    console.log(
      `\n  ⚠️  ${penalized.length} wallets received one-hit-wonder penalties`
    );
  }

  console.log("\n  ✅ Wallet profiling complete.");
  console.log("═".repeat(60) + "\n");
}

function percent(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
