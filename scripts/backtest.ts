// scripts/backtest.ts
// Hito 8.2 — CLI para ejecutar backtesting de copy trading histórico.
// Simula qué habría pasado si hubiéramos copiado todas las operaciones
// de una wallet en un período dado.
//
// Uso:
//   npm run backtest -- --wallet 0x1234... --days 30
//   npm run backtest -- --wallet 0x1234... --days 30 --position-size 15
//   npm run backtest -- --compare 0xAAA,0xBBB --days 30
//
// Opciones:
//   --wallet         Wallet address to analyze (required unless --compare)
//   --days           Lookback period in days (default: 30)
//   --position-size  Position size per trade in $ (default: 10)
//   --compare        Comma-separated wallet addresses to compare
//   --no-outcomes    Skip resolution checks (faster, but less accurate)

import {
  runBacktest,
  compareStrategies,
  type BacktestResult,
  type BacktestTrade,
} from "../lib/backtesting/engine";

// ─── Argument Parsing ──────────────────────────────────────────

interface CliArgs {
  wallet: string | null;
  days: number;
  positionSize: number;
  compare: string[];
  checkOutcomes: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  const getValue = (flag: string): string | null => {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return null;
    const val = args[idx + 1];
    if (val.startsWith("--")) return null; // next arg is another flag
    return val;
  };

  const hasFlag = (flag: string): boolean => args.includes(flag);

  const wallet = getValue("--wallet");
  const daysStr = getValue("--days");
  const posStr = getValue("--position-size");
  const compareStr = getValue("--compare");

  const days = daysStr ? parseInt(daysStr, 10) : 30;
  const positionSize = posStr ? parseFloat(posStr) : 10;

  const compare = compareStr
    ? compareStr.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const checkOutcomes = !hasFlag("--no-outcomes");

  return {
    wallet,
    days: isNaN(days) || days <= 0 ? 30 : days,
    positionSize:
      isNaN(positionSize) || positionSize <= 0 ? 10 : positionSize,
    compare,
    checkOutcomes,
  };
}

function printUsage(): void {
  console.log(`
  ═══════════════════════════════════════════════════════════════
    📊 Hermes — Backtesting CLI
  ═══════════════════════════════════════════════════════════════

  Usage:
    npm run backtest -- --wallet <address> [options]
    npm run backtest -- --compare <addr1,addr2,...> [options]

  Options:
    --wallet <address>       Wallet to backtest
    --days <n>               Lookback period in days (default: 30)
    --position-size <$>      Position size per trade (default: $10)
    --compare <addr1,addr2>  Compare multiple wallets (comma-separated)
    --no-outcomes            Skip resolution checks (faster, less accurate)

  Examples:
    npm run backtest -- --wallet 0x1234... --days 30
    npm run backtest -- --wallet 0x1234... --days 60 --position-size 20
    npm run backtest -- --compare 0xAAA,0xBBB --days 30
    npm run backtest -- --wallet 0x1234... --days 7 --no-outcomes
`);
}

// ─── Display Helpers ───────────────────────────────────────────

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function fmtDrawdown(value: number): string {
  // maxDrawdown is stored as negative (e.g. -0.15)
  return `${Math.abs(value * 100).toFixed(1)}%`;
}

function printResult(result: BacktestResult): void {
  const pnlSign = result.totalPnl >= 0 ? "+" : "";

  console.log("\n" + "═".repeat(60));
  console.log("  📊 Backtest Result");
  console.log("═".repeat(60));
  console.log(`  Wallet:      ${result.walletAddress}`);
  console.log(`  Period:      ${result.startDate} → ${result.endDate}`);
  console.log(`  Trades:      ${result.totalTrades} total, ${result.resolvedTrades} resolved`);
  console.log(`  Win/Loss:    ${result.winningTrades}W / ${result.losingTrades}L`);
  console.log("─".repeat(60));
  console.log(`  Total PnL:   ${pnlSign}$${result.totalPnl.toFixed(2)}`);
  console.log(`  ROI:         ${fmtPct(result.roi)}`);
  console.log(`  Win Rate:    ${fmtPct(result.winRate)}`);
  console.log(`  Profit Factor:  ${result.profitFactor.toFixed(2)}`);
  console.log(`  Max Drawdown:   ${fmtDrawdown(result.maxDrawdown)}`);
  console.log(`  Sharpe Ratio:   ${result.sharpeRatio.toFixed(2)}`);
  console.log(`  Total Invested: $${result.totalInvested.toFixed(0)}`);
  console.log("═".repeat(60));
}

function printTradeTable(trades: BacktestTrade[], limit: number = 20): void {
  const display = trades.slice(0, limit);

  console.log(`\n  📋 Trade Details (showing ${display.length} of ${trades.length})`);
  console.log("─".repeat(70));

  // Header
  console.log(
    `  ${"Market".padEnd(22)} ${"Side".padEnd(5)} ${"Entry".padStart(8)} ${"Pos".padStart(6)} ${"PnL".padStart(10)} ${"Result".padStart(8)}`
  );
  console.log("  " + "─".repeat(65));

  for (const t of display) {
    const marketId = (t.original.marketId ?? "").slice(0, 20);
    const side = t.side.toUpperCase().padEnd(3);
    const entry = `$${t.entryPrice.toFixed(4)}`;
    const pos = `$${t.positionSize.toFixed(0)}`;
    const pnlSign = t.pnl >= 0 ? "+" : "";
    const pnl = `${pnlSign}$${t.pnl.toFixed(2)}`.padStart(8);
    const result =
      t.won === true
        ? "✅ Win"
        : t.won === false
        ? "❌ Loss"
        : "⏳ Open";

    console.log(
      `  ${marketId.padEnd(22)} ${side} ${entry.padStart(8)} ${pos.padStart(6)} ${pnl} ${result}`
    );
  }

  if (trades.length > limit) {
    console.log(`  ... and ${trades.length - limit} more trades`);
  }
}

function printComparison(results: BacktestResult[]): void {
  console.log("\n" + "═".repeat(70));
  console.log("  📊 Strategy Comparison");
  console.log("═".repeat(70));
  console.log(
    `  ${"Wallet".padEnd(14)} ${"Trades".padEnd(8)} ${"W/L".padEnd(8)} ${"PnL".padStart(10)} ${"ROI".padStart(10)} ${"WR".padStart(8)} ${"DD".padStart(8)}`
  );
  console.log("  " + "─".repeat(65));

  for (const r of results) {
    const addr = r.walletAddress.slice(0, 6) + "..." + r.walletAddress.slice(-4);
    const trades = String(r.totalTrades);
    const wl = `${r.winningTrades}/${r.losingTrades}`;
    const pnlSign = r.totalPnl >= 0 ? "+" : "";
    const pnl = `${pnlSign}$${r.totalPnl.toFixed(2)}`;
    const roi = fmtPct(r.roi);
    const wr = fmtPct(r.winRate);
    const dd = fmtDrawdown(r.maxDrawdown);

    console.log(
      `  ${addr.padEnd(14)} ${trades.padEnd(8)} ${wl.padEnd(8)} ${pnl.padStart(10)} ${roi.padStart(10)} ${wr.padStart(8)} ${dd.padStart(8)}`
    );
  }

  console.log("═".repeat(70));
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const cli = parseArgs();
  const startTime = Date.now();

  // Show usage if no args
  if (!cli.wallet && cli.compare.length === 0) {
    printUsage();
    process.exit(0);
  }

  console.log("═".repeat(60));
  console.log("  📊 Hermes — Backtesting Engine");
  console.log("═".repeat(60));
  console.log(`  Period:        ${cli.days} days`);
  console.log(`  Position size: $${cli.positionSize.toFixed(0)}/trade`);
  console.log(`  Check outcomes: ${cli.checkOutcomes ? "Yes" : "No (faster, less accurate)"}`);

  // ── Comparison mode ──────────────────────────────────────
  if (cli.compare.length > 0) {
    console.log(`\n  🔄 Comparing ${cli.compare.length} wallets...`);
    const comparison = await compareStrategies(
      cli.compare,
      cli.days,
      cli.positionSize
    );

    printComparison(comparison.results);

    if (comparison.best) {
      console.log(`\n  🏆 Best:  ${comparison.best.walletAddress.slice(0, 10)}... — $${comparison.best.totalPnl.toFixed(2)}`);
    }
    if (comparison.worst && comparison.worst !== comparison.best) {
      console.log(`  ⚠️  Worst: ${comparison.worst.walletAddress.slice(0, 10)}... — $${comparison.worst.totalPnl.toFixed(2)}`);

    }
    console.log(`  📊 Avg ROI: ${fmtPct(comparison.averageRoi)} | Avg Win Rate: ${fmtPct(comparison.averageWinRate)}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  ⏱️  Time: ${elapsed}s`);
    console.log("═".repeat(60) + "\n");
    process.exit(0);
  }

  // ── Single wallet mode ───────────────────────────────────
  if (!cli.wallet) {
    console.error("\n  ❌ Error: --wallet is required for single-wallet mode.");
    printUsage();
    process.exit(1);
  }

  console.log(`  Wallet:        ${cli.wallet}`);
  console.log(`\n  📡 Fetching trade history and market data...`);

  const result = await runBacktest({
    walletAddress: cli.wallet,
    startDate: new Date(Date.now() - cli.days * 24 * 60 * 60 * 1000),
    endDate: new Date(),
    positionSize: cli.positionSize,
    checkOutcomes: cli.checkOutcomes,
  });

  if (result.totalTrades === 0) {
    console.log(`\n  ℹ️  No trades found for this wallet in the last ${cli.days} days.`);
    process.exit(0);
  }

  // Display results
  printResult(result);
  printTradeTable(result.trades, 20);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  ⏱️  Time: ${elapsed}s`);
  console.log("═".repeat(60) + "\n");
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Backtest failed: ${(err as Error).message}`);
  process.exit(1);
});
