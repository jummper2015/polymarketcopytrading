// scripts/update-pnl.ts
// Hito 4.2 - Actualiza el PnL de paper trades abiertos consultando
// precios actuales del mercado desde la API de Polymarket.
// Comando: npm run paper:update-pnl

import { updatePaperTradePnL, getOpenPaperTrades } from "../lib/simulation/paper-trader";
import { fetchMarketData } from "../lib/adapters/markets";

// ─── Config ────────────────────────────────────────────────────

const API_DELAY_MS = 150; // delay between market API calls

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  💰 Hermes — PnL Updater");
  console.log("═".repeat(60));

  // Phase 1: Get open trades
  console.log("\n  📋 Loading open paper trades...");
  const openTrades = await getOpenPaperTrades();

  if (openTrades.length === 0) {
    console.log("  ✅ No open paper trades. Nothing to update.");
    process.exit(0);
  }
  console.log(`  ✅ ${openTrades.length} open trades found`);

  // Phase 2: Update PnL for each trade
  console.log(`\n  📡 Fetching current prices for ${openTrades.length} trades...`);

  let updated = 0;
  let failed = 0;
  let totalPnl = 0;

  for (let i = 0; i < openTrades.length; i++) {
    const pt = openTrades[i];
    const progress = `[${i + 1}/${openTrades.length}]`;

    try {
      // Fetch current market data
      const market = await fetchMarketData(pt.marketId);

      // Pick the right price based on side
      const side = pt.side.toLowerCase();
      const currentPrice = side === "yes" ? market.yesPrice : market.noPrice;

      if (currentPrice <= 0) {
        console.log(
          `  ⚠️  ${progress} Trade #${pt.id} (${pt.side}) — zero price, skipping`
        );
        failed++;
        continue;
      }

      // Update PnL using the paper trader engine
      await updatePaperTradePnL(pt.id, currentPrice);

      // Calculate PnL for display
      const shares = pt.simulatedPositionSize / pt.entryPrice;
      const pnl = shares * (currentPrice - pt.entryPrice);
      totalPnl += pnl;

      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
      const pnlPct = ((currentPrice - pt.entryPrice) / pt.entryPrice * 100).toFixed(1);
      const pnlPctStr = pnl >= 0 ? `+${pnlPct}%` : `${pnlPct}%`;

      console.log(
        `  ✅ ${progress} Trade #${pt.id} | ${pt.side.toUpperCase()} | ` +
        `$${pt.entryPrice.toFixed(4)} → $${currentPrice.toFixed(4)} | ` +
        `${pnlStr} (${pnlPctStr})`
      );

      updated++;
    } catch (error) {
      console.log(
        `  ❌ ${progress} Trade #${pt.id}: ${(error as Error).message}`
      );
      failed++;
    }

    // Rate limiting delay between API calls
    if (i < openTrades.length - 1) {
      await sleep(API_DELAY_MS);
    }
  }

  // Phase 3: Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalPnlStr = totalPnl >= 0
    ? `+$${totalPnl.toFixed(2)}`
    : `-$${Math.abs(totalPnl).toFixed(2)}`;

  console.log("\n" + "═".repeat(60));
  console.log("  📊 PnL Update Summary");
  console.log("═".repeat(60));
  console.log(`  Open trades:          ${openTrades.length}`);
  console.log(`  Successfully updated: ${updated}`);
  if (failed > 0) {
    console.log(`  Failed:               ${failed}`);
  }
  console.log(`  Total unrealized PnL: ${totalPnlStr}`);
  console.log(`  Time:                 ${elapsed}s`);
  console.log("\n  ✅ PnL update complete.");
  console.log("═".repeat(60) + "\n");
}

// ─── Helpers ───────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
