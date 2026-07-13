// scripts/report-daily.ts
// Hito 6.3 — Genera el reporte diario, lo persiste en la DB,
// lo muestra en consola, y lo envía por Telegram si está configurado.
// Comando: npm run report:daily

import { generateDailyReport } from "../lib/reports/daily-report";
import {
  sendDailyReport,
  isTelegramConfigured,
} from "../lib/notifications/telegram";

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  📊 MESIRVE — Daily Report Generator");
  console.log("═".repeat(60));

  // ── Phase 1: Generate report ─────────────────────────────
  console.log("\n  📋 Generating daily report...");
  let report;
  try {
    report = await generateDailyReport();
  } catch (err) {
    console.error(`  ❌ Failed to generate report: ${(err as Error).message}`);
    process.exit(1);
  }

  const genTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ✅ Report generated for ${report.date} (${genTime}s)`);

  // ── Phase 2: Display summary in console ──────────────────
  console.log("\n" + "─".repeat(60));
  console.log(report.summary);
  console.log("─".repeat(60));

  // Detailed breakdown
  console.log(`\n  📋 Best wallets:`);
  if (report.bestWallets.length > 0) {
    for (let i = 0; i < Math.min(report.bestWallets.length, 5); i++) {
      const w = report.bestWallets[i];
      const name = w.label ?? w.address.slice(0, 12) + "...";
      const pnlSign = w.simulatedPnl >= 0 ? "+" : "";
      console.log(
        `    ${i + 1}. ${name.padEnd(20)} ${pnlSign}$${w.simulatedPnl.toFixed(2).padStart(8)}  ${w.tradeCount} trades  ${(w.winRate * 100).toFixed(0)}% WR`
      );
    }
  } else {
    console.log("    (no paper trades yet)");
  }

  console.log(`\n  ⚠️  Worst wallets:`);
  if (report.worstWallets.length > 0) {
    for (let i = 0; i < Math.min(report.worstWallets.length, 5); i++) {
      const w = report.worstWallets[i];
      const name = w.label ?? w.address.slice(0, 12) + "...";
      console.log(
        `    ${i + 1}. ${name.padEnd(20)} $${w.simulatedPnl.toFixed(2).padStart(8)}  ${w.tradeCount} trades`
      );
    }
  } else {
    console.log("    (no paper trades yet)");
  }

  // ── Phase 3: Send via Telegram ───────────────────────────
  let telegramSent = false;
  console.log("\n  📡 Sending report to Telegram...");
  if (!isTelegramConfigured()) {
    console.log("  ℹ️  Telegram not configured — skipping send.");
    console.log("     Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local");
  } else {
    try {
      const result = await sendDailyReport(report);
      if (result.ok) {
        telegramSent = true;
        console.log(`  ✅ Report sent to Telegram (message ID: ${result.messageId})`);
      } else {
        console.log(`  ⚠️  Telegram send failed: ${result.error}`);
      }
    } catch (err) {
      console.error(`  ❌ Telegram error: ${(err as Error).message}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "═".repeat(60));
  console.log("  📊 Report Summary");
  console.log("═".repeat(60));
  console.log(`  Date:              ${report.date}`);
  console.log(
    `  Paper PnL:         ${report.paperPnl >= 0 ? "+" : ""}$${report.paperPnl.toFixed(2)}`
  );
  console.log(`  Win Rate:          ${(report.winRate * 100).toFixed(1)}%`);
  console.log(`  Open Positions:    ${report.openPositions}`);
  console.log(`  Today's Signals:   ${report.newSignals} (copy: ${report.copiedSignals}, watch: ${report.watchedSignals}, skip: ${report.skippedSignals})`);
  console.log(`  Rule Changes:      ${report.ruleChanges.length}`);
  console.log(`  Telegram Sent:     ${telegramSent ? "✅ Yes" : "❌ No"}`);
  console.log(`  Time:              ${totalTime}s`);
  console.log("═".repeat(60) + "\n");
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
