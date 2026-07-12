// scripts/review-outcomes.ts
// Hito 4.3 - Revisa paper trades abiertos/cerrados cuyos mercados se
// resolvieron, determina si acertamos, resuelve el trade y crea
// un OutcomeReview con la leccion aprendida.
// Comando: npm run review:outcomes

import { db } from "../db";
import { paperTrades, outcomeReviews } from "../db/schema";
import { eq } from "drizzle-orm";
import { resolvePaperTrade } from "../lib/simulation/paper-trader";
import { checkResolutions } from "../lib/adapters/outcomes";

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  🔍 Hermes — Outcome Reviewer");
  console.log("═".repeat(60));

  // Phase 1: Get unresolved paper trades (open or closed, not yet resolved)
  console.log("\n  📋 Loading unresolved paper trades...");
  const unresolved = await getUnresolvedTrades();

  if (unresolved.length === 0) {
    console.log("  ✅ No unresolved trades. All positions are resolved.");
    process.exit(0);
  }
  console.log(`  ✅ ${unresolved.length} unresolved trades across ${countUnique(unresolved.map((t) => t.marketId))} markets`);

  // Phase 2: Check which markets have resolved
  const uniqueMarketIds = [...new Set(unresolved.map((t) => t.marketId))];
  console.log(`\n  📡 Checking resolution for ${uniqueMarketIds.length} markets...`);

  const resolutions = await checkResolutions(uniqueMarketIds);
  console.log(`  ✅ ${resolutions.length} markets have resolved`);

  if (resolutions.length === 0) {
    console.log("  ℹ️  None of the markets have resolved yet. Nothing to review.");
    process.exit(0);
  }

  // Build a map: marketId → resolution
  const resolutionMap = new Map(
    resolutions.map((r) => [r.marketId, r])
  );

  // Phase 3: Resolve each affected paper trade
  console.log(`\n  🧠 Resolving and reviewing trades...`);

  let resolved = 0;
  let correct = 0;
  let incorrect = 0;
  let alreadyResolved = 0;

  for (const pt of unresolved) {
    const resolution = resolutionMap.get(pt.marketId);
    if (!resolution || !resolution.winningOutcome) continue;

    // Only process if market resolved and has outcome
    if (!resolution.winningOutcome) continue;
    const existingReview = await db
      .select({ id: outcomeReviews.id })
      .from(outcomeReviews)
      .where(eq(outcomeReviews.paperTradeId, pt.id))
      .limit(1);
    if (existingReview.length > 0) {
      alreadyResolved++;
      continue;
    }

    const winningOutcome = resolution.winningOutcome;

    // Resolve the paper trade
    const result = await resolvePaperTrade(
      pt.id,
      winningOutcome,
      1.0
    );

    if (!result || result.status !== "resolved") {
      alreadyResolved++;
      continue;
    }

    const realizedPnl = result.realizedPnl ?? 0;

    // Determine if the decision was good
    const wasCorrect = realizedPnl > 0;
    if (wasCorrect) correct++;
    else incorrect++;

    // Build lessons
    const lessons = buildLessons(pt, winningOutcome, wasCorrect);

    // Create OutcomeReview
    await createOutcomeReview({
      decisionJournalId: pt.decisionJournalId,
      paperTradeId: pt.id,
      finalOutcome: winningOutcome,
      simulatedPnl: realizedPnl,
      wasDecisionGood: wasCorrect,
      lessons,
    });

    const icon = wasCorrect ? "✅" : "❌";
    const pnlStr = realizedPnl >= 0
      ? `+$${realizedPnl.toFixed(2)}`
      : `-$${Math.abs(realizedPnl).toFixed(2)}`;

    console.log(
      `  ${icon} Trade #${pt.id} | ${pt.side.toUpperCase()} on "${truncate(resolution.question)}" | ` +
      `Outcome: ${winningOutcome} | PnL: ${pnlStr}`
    );

    resolved++;
  }

  // Phase 4: Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "═".repeat(60));
  console.log("  📊 Review Summary");
  console.log("═".repeat(60));
  console.log(`  Markets checked:      ${uniqueMarketIds.length}`);
  console.log(`  Markets resolved:     ${resolutions.length}`);
  console.log(`  Trades reviewed:      ${resolved}`);
  console.log(`  ✅ Correct decisions:  ${correct}`);
  console.log(`  ❌ Incorrect decisions: ${incorrect}`);
  if (alreadyResolved > 0) {
    console.log(`  ⏭️  Already resolved:   ${alreadyResolved}`);
  }
  if (correct + incorrect > 0) {
    const winRate = ((correct / (correct + incorrect)) * 100).toFixed(1);
    console.log(`  🎯 Win rate:            ${winRate}%`);
  }
  console.log(`  Time:                 ${elapsed}s`);
  console.log("\n  ✅ Outcome review complete.");
  console.log("═".repeat(60) + "\n");
}

// ─── DB Queries ────────────────────────────────────────────────

/** Paper trades that are open and need resolution checking */
async function getUnresolvedTrades() {
  return db
    .select({
      id: paperTrades.id,
      marketId: paperTrades.marketId,
      side: paperTrades.side,
      entryPrice: paperTrades.entryPrice,
      simulatedPositionSize: paperTrades.simulatedPositionSize,
      status: paperTrades.status,
      decisionJournalId: paperTrades.decisionJournalId,
    })
    .from(paperTrades)
    .where(eq(paperTrades.status, "open"))
    .orderBy(paperTrades.openedAt);
}

// ─── OutcomeReview Creation ────────────────────────────────────

async function createOutcomeReview(params: {
  decisionJournalId: number | null;
  paperTradeId: number;
  finalOutcome: string;
  simulatedPnl: number;
  wasDecisionGood: boolean;
  lessons: string[];
}) {
  await db.insert(outcomeReviews).values({
    decisionJournalId: params.decisionJournalId,
    paperTradeId: params.paperTradeId,
    finalOutcome: params.finalOutcome,
    simulatedPnl: Math.round(params.simulatedPnl * 10_000) / 10_000,
    wasDecisionGood: params.wasDecisionGood,
    lessonsJson: JSON.stringify(params.lessons),
  });
}

// ─── Lessons ───────────────────────────────────────────────────

function buildLessons(
  pt: {
    side: string;
    entryPrice: number;
    simulatedPositionSize: number;
  },
  winningOutcome: string,
  wasCorrect: boolean
): string[] {
  const lessons: string[] = [];

  if (wasCorrect) {
    lessons.push(
      `Correctly predicted "${winningOutcome}"`
    );
    lessons.push(
      `Paper trade on ${pt.side.toUpperCase()} at $${pt.entryPrice.toFixed(2)} ` +
      `with $${pt.simulatedPositionSize.toFixed(0)} position was profitable`
    );
  } else {
    lessons.push(
      `Incorrectly bet on "${pt.side.toUpperCase()}" — market resolved to "${winningOutcome}"`
    );
    lessons.push(
      `Lost $${pt.simulatedPositionSize.toFixed(0)} on this trade`
    );
    lessons.push(
      `Consider: was the signal too weak? Was the wallet quality overestimated?`
    );
  }

  return lessons;
}

// ─── Helpers ───────────────────────────────────────────────────

function countUnique(arr: string[]): number {
  return new Set(arr).size;
}

function truncate(str: string, maxLen: number = 60): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 3) + "...";
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
