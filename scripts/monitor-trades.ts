// scripts/monitor-trades.ts
// Hito 3.2 — Detecta nuevas operaciones de wallets con status "track",
// obtiene datos de mercado, y guarda observed_trade + market_snapshot.
// Comando: npm run monitor:trades

import { db } from "../db";
import {
  walletProfiles,
  observedTrades,
  marketSnapshots,
} from "../db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  fetchWalletActivity,
  type WalletActivityItem,
} from "../lib/adapters/leaderboard";
import { fetchMarketData, fetchMarketsByCondition } from "../lib/adapters/markets";
import { sleep } from "../lib/adapters/client";

// ─── Config ────────────────────────────────────────────────────

const ACTIVITY_LIMIT = 50; // Trades to fetch per wallet
const BATCH_DELAY_MS = 300; // Delay between wallets (rate limiting)
const LOOKBACK_SECONDS = 24 * 3600; // Only consider trades from last 24h

// ─── Types ─────────────────────────────────────────────────────

interface TrackedWallet {
  address: string;
  label: string | null;
  globalScore: number;
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  👁️  MESIRVE — Trade Monitor");
  console.log("═".repeat(60));
  console.log(`  Lookback:    ${LOOKBACK_SECONDS / 3600}h`);
  console.log(`  Per wallet:  ${ACTIVITY_LIMIT} activities`);
  console.log("─".repeat(60));

  // Phase 1: Get tracked wallets
  console.log("\n  📋 Loading tracked wallets...");
  const wallets = await getTrackedWallets();

  if (wallets.length === 0) {
    console.log(
      "  ⚠️  No tracked wallets found. Run `npm run scan:wallets` first."
    );
    process.exit(0);
  }
  console.log(`  ✅ ${wallets.length} wallets with status "track"`);

  // Phase 2: Scan each wallet for new trades
  console.log(`\n  🔍 Scanning ${wallets.length} wallets for new trades...`);

  let totalNewTrades = 0;
  let totalNewMarkets = 0;
  let skippedDuplicates = 0;
  let walletErrors = 0;

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    const progress = `[${i + 1}/${wallets.length}]`;

    try {
      const result = await scanWallet(wallet);
      totalNewTrades += result.newTrades;
      totalNewMarkets += result.newMarkets;
      skippedDuplicates += result.duplicates;

      if (result.newTrades > 0) {
        console.log(
          `  ${progress} ${wallet.address.slice(0, 10)}... : +${result.newTrades} new trades, ${result.duplicates} dupes`
        );
      }
    } catch (error) {
      walletErrors++;
      console.log(
        `  ${progress} ${wallet.address.slice(0, 10)}... : ❌ ${(error as Error).message}`
      );
    }

    // Rate limiting delay
    if (i < wallets.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Phase 3: Summary
  const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "═".repeat(60));
  console.log("  📊 Monitor Summary");
  console.log("═".repeat(60));
  console.log(`  Tracked wallets:       ${wallets.length}`);
  console.log(`  New trades detected:   ${totalNewTrades}`);
  console.log(`  New market snapshots:  ${totalNewMarkets}`);
  console.log(`  Duplicates skipped:    ${skippedDuplicates}`);
  if (walletErrors > 0) {
    console.log(`  ⚠️  Wallet errors:        ${walletErrors}`);
  }
  console.log(`  Total time:            ${scanTime}s`);
  console.log("\n  ✅ Trade monitoring complete.");
  console.log("═".repeat(60) + "\n");
}

// ─── Wallet List ───────────────────────────────────────────────

async function getTrackedWallets(): Promise<TrackedWallet[]> {
  const rows = await db
    .select({
      address: walletProfiles.address,
      label: walletProfiles.label,
      globalScore: walletProfiles.globalScore,
    })
    .from(walletProfiles)
    .where(eq(walletProfiles.status, "track"))
    .orderBy(sql`${walletProfiles.globalScore} DESC`);

  return rows.map((r) => ({
    address: r.address,
    label: r.label,
    globalScore: r.globalScore ?? 0,
  }));
}

// ─── Scan Single Wallet ────────────────────────────────────────

interface ScanResult {
  newTrades: number;
  newMarkets: number;
  duplicates: number;
}

async function scanWallet(wallet: TrackedWallet): Promise<ScanResult> {
  // Fetch recent activity
  const activity = await fetchWalletActivity(wallet.address, {
    limit: ACTIVITY_LIMIT,
  });

  // Filter: only trades, within lookback window
  const cutoff = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
  const recentTrades = activity.filter(
    (a) => a.type === "trade" && a.timestamp >= cutoff
  );

  let newTrades = 0;
  let newMarkets = 0;
  let duplicates = 0;

  for (const trade of recentTrades) {
    // Check for duplicates
    const isDuplicate = await checkDuplicate(wallet.address, trade);
    if (isDuplicate) {
      duplicates++;
      continue;
    }

    // Save observed trade
    await saveObservedTrade(wallet.address, trade);

    // Fetch and save market snapshot (best-effort, skip if fails)
    if (trade.marketId || trade.conditionId) {
      const saved = await saveMarketSnapshotIfNew(
        trade.marketId ?? "",
        trade.conditionId
      );
      if (saved) newMarkets++;
    }

    newTrades++;
  }

  return { newTrades, newMarkets, duplicates };
}

// ─── Duplicate Detection ───────────────────────────────────────

async function checkDuplicate(
  walletAddress: string,
  trade: WalletActivityItem
): Promise<boolean> {
  // Dedup: wallet + marketId + timestamp (within 120s window)
  // This is sufficient for detecting repeat trades from the same wallet
  if (trade.marketId) {
    const rows = await db
      .select({ id: observedTrades.id })
      .from(observedTrades)
      .where(
        and(
          eq(observedTrades.walletAddress, walletAddress),
          eq(observedTrades.marketId, trade.marketId),
          gte(
            observedTrades.timestamp,
            new Date((trade.timestamp - 120) * 1000)
          )
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  // Fallback: check rawTradeJson for txHash if marketId is unavailable
  if (trade.txHash) {
    const rows = await db
      .select({ id: observedTrades.id })
      .from(observedTrades)
      .where(
        and(
          eq(observedTrades.walletAddress, walletAddress),
          sql`${observedTrades.rawTradeJson} LIKE ${'%' + trade.txHash + '%'}`
        )
      )
      .limit(1);
    return rows.length > 0;
  }

  return false;
}

// ─── Save Observed Trade ──────────────────────────────────────

async function saveObservedTrade(
  walletAddress: string,
  trade: WalletActivityItem
) {
  // NOTE: detectedPrice starts equal to walletEntryPrice.
  // The score:trades script (Hito 3.3) will fetch current market prices
  // and update detectedPrice to reflect any drift since detection.
  await db.insert(observedTrades).values({
    walletAddress,
    marketId: trade.marketId ?? "",
    conditionId: trade.conditionId ?? null,
    marketQuestion: trade.marketQuestion ?? null,
    marketCategory: null, // populated by score:trades from market data
    outcome: trade.outcome ?? null,
    side: trade.side ?? null,
    walletEntryPrice: trade.price ?? null,
    detectedPrice: trade.price ?? null,
    size: trade.size ?? null,
    timestamp: new Date(trade.timestamp * 1000),
    rawTradeJson: JSON.stringify(trade),
  });
}

// ─── Market Snapshot ───────────────────────────────────────────

/**
 * Fetch and save a market snapshot.
 *
 * Handles two lookup strategies because Polymarket's APIs use different
 * identifier formats:
 *   1. Gamma API path param:  GET /markets/{slug}        — works with market slugs
 *   2. Gamma API query param: GET /markets?condition_id=  — works with condition IDs
 *
 * The function tries strategy 1 first. If that fails with an API error,
 * and a conditionId is available, it falls back to strategy 2.
 */
async function saveMarketSnapshotIfNew(
  marketId: string,
  conditionId?: string | null
): Promise<boolean> {
  // Skip if we already have a recent snapshot (< 1h old)
  const oneHourAgo = new Date(Date.now() - 3600 * 1000);
  const existing = await db
    .select({ id: marketSnapshots.id })
    .from(marketSnapshots)
    .where(
      and(
        eq(marketSnapshots.marketId, marketId),
        gte(marketSnapshots.collectedAt, oneHourAgo)
      )
    )
    .limit(1);

  if (existing.length > 0) return false;

  // Strategy 1: try fetching by market slug (path param)
  // Gamma API: GET /markets/{slug}
  let marketData;
  try {
    marketData = await fetchMarketData(marketId);
  } catch {
    marketData = null;
  }

  // Strategy 2 (fallback): if marketId is actually a conditionId,
  // try fetching via query param: GET /markets?condition_id=
  if (!marketData && conditionId) {
    try {
      const results = await fetchMarketsByCondition(conditionId);
      marketData = results.length > 0 ? results[0] : null;
    } catch {
      marketData = null;
    }
  }

  if (!marketData) return false; // Both strategies failed

  // Calculate time to resolution in seconds
  let timeToResolution: number | null = null;
  if (marketData.endDate) {
    const endTime = new Date(marketData.endDate).getTime();
    timeToResolution = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
  }

  await db.insert(marketSnapshots).values({
    marketId: marketData.id,
    conditionId: marketData.conditionId,
    question: marketData.question,
    category: marketData.category ?? null,
    yesPrice: marketData.yesPrice,
    noPrice: marketData.noPrice,
    bestBid: marketData.bestBid,
    bestAsk: marketData.bestAsk,
    spread: marketData.spread,
    liquidity: marketData.liquidity,
    volume: marketData.volume,
    timeToResolution,
    rawMarketJson: JSON.stringify(marketData),
  });

  return true;
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
