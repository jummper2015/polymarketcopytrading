// scripts/update-rules.ts
// Hito 5.2 — Analiza rendimiento reciente del portafolio simulado,
// propone cambios a las reglas basados en evidencia, y los aplica
// automaticamente via el rule engine.
// Comando: npm run update:rules

import { db } from "../db";
import { paperTrades, decisionJournals } from "../db/schema";
import { eq, gte, and } from "drizzle-orm";
import {
  loadActiveRules,
  parseRules,
  proposeRuleChange,
  applyRuleChange,
  type RuleChangeEvidence,
} from "../lib/rules/rule-engine";
import { getPaperPortfolioStats } from "../lib/simulation/paper-trader";

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  🧠 Hermes — Rule Updater (Auto-improvement)");
  console.log("═".repeat(60));

  // Phase 1: Load current rules
  console.log("\n  📋 Loading current active rules...");
  const currentRules = await loadActiveRules();
  const currentData = parseRules(currentRules);
  console.log(`  ✅ Version: ${currentData.version}`);
  console.log(`  Thresholds: minGlobalScore=${currentData.thresholds.minGlobalScore}, ` +
    `maxSpread=${currentData.thresholds.maxSpread}, ` +
    `minLiquidity=${currentData.thresholds.minLiquidity}`);

  // Phase 2: Gather evidence
  console.log("\n  📊 Gathering performance evidence...");
  const evidence = await gatherEvidence();

  if (evidence.resolvedCount === 0) {
    console.log("  ℹ️  No resolved trades yet. Nothing to analyze.");
    process.exit(0);
  }

  console.log(`  ✅ Resolved trades: ${evidence.resolvedCount}`);
  console.log(`  Win rate: ${(evidence.winRate * 100).toFixed(1)}%`);
  console.log(`  Profit factor: ${evidence.profitFactor.toFixed(2)}`);
  console.log(`  Copied losers: ${evidence.copiedLosers}`);
  console.log(`  Missed winners: ${evidence.missedWinners}`);
  console.log(`  Avg loss: $${Math.abs(evidence.avgLoss).toFixed(2)}`);
  console.log(`  Avg gain: $${evidence.avgGain.toFixed(2)}`);

  // Phase 3: Propose changes
  console.log("\n  🧠 Analyzing evidence...");
  const proposal = proposeRuleChange(evidence);

  if (!proposal) {
    console.log("  ✅ No rule changes needed. Current rules are performing adequately.");
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  ⏱️  Time: ${elapsed}s`);
    console.log("═".repeat(60) + "\n");
    process.exit(0);
  }

  // Phase 4: Display and apply changes
  console.log("\n  📝 Proposed Changes:");
  console.log(`  Reason: ${proposal.reason}`);
  console.log(`  Evidence: ${proposal.evidenceSummary}`);

  if (proposal.changes.thresholds) {
    const t = proposal.changes.thresholds;
    console.log("  Threshold changes:");
    for (const [key, value] of Object.entries(t)) {
      const oldVal = currentData.thresholds[key as keyof typeof currentData.thresholds];
      console.log(`    ${key}: ${oldVal} → ${value}`);
    }
  }

  console.log("\n  ⚡ Applying changes...");
  const result = await applyRuleChange(proposal);

  // Phase 5: Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "═".repeat(60));
  console.log("  📊 Rule Update Summary");
  console.log("═".repeat(60));
  console.log(`  Previous version: ${currentData.version}`);
  console.log(`  New version:      ${result.newRuleSet.version}`);
  console.log(`  Change reason:    ${proposal.reason}`);
  console.log(`  Evidence:         ${proposal.evidenceSummary}`);
  console.log(`  Time:             ${elapsed}s`);
  console.log("\n  ✅ Rules updated successfully.");
  console.log("═".repeat(60) + "\n");
}

// ─── Evidence Gathering ────────────────────────────────────────

async function gatherEvidence(): Promise<RuleChangeEvidence> {
  // ---- Portfolio stats (win rate, PnL) ----
  const stats = await getPaperPortfolioStats();

  // ---- Resolved trade details (avg loss, avg gain) ----
  const resolved = await db
    .select({
      realizedPnl: paperTrades.realizedPnl,
    })
    .from(paperTrades)
    .where(eq(paperTrades.status, "resolved"));

  const gains = resolved.filter((t) => (t.realizedPnl ?? 0) > 0);
  const losses = resolved.filter((t) => (t.realizedPnl ?? 0) < 0);

  const totalGains = gains.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const totalLosses = Math.abs(losses.reduce((s, t) => s + (t.realizedPnl ?? 0), 0));

  const avgGain = gains.length > 0 ? totalGains / gains.length : 0;
  const avgLoss = losses.length > 0 ? -totalLosses / losses.length : 0;
  const profitFactor = totalLosses > 0 ? totalGains / totalLosses : (totalGains > 0 ? Infinity : 0);
  const clippedProfitFactor = profitFactor === Infinity ? 999 : profitFactor;

  // ---- Copied losers (paper trades with negative realized PnL) ----
  const copiedLosers = losses.length;

  // ---- Missed winners (watchlist/skip decisions with high copyScore) ----
  // These are trades we decided NOT to copy, but that had strong signals.
  // We can't know if they'd actually win, but high copyScore indicates potential.
  const highScoreMissed = await db
    .select({ id: decisionJournals.id })
    .from(decisionJournals)
    .where(
      and(
        eq(decisionJournals.decision, "watchlist"),
        gte(decisionJournals.copyScore, 0.5)
      )
    );

  const missedWinners = highScoreMissed.length;

  return {
    winRate: stats.winRate,
    totalPnl: stats.totalPnl,
    resolvedCount: stats.resolvedCount,
    avgLoss: Math.round(avgLoss * 100) / 100,
    avgGain: Math.round(avgGain * 100) / 100,
    profitFactor: Math.round(clippedProfitFactor * 100) / 100,
    missedWinners,
    copiedLosers,
  };
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
