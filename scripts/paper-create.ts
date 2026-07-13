// scripts/paper-create.ts
// Hito 11.2 — Crea PaperTrades a partir de DecisionJournal records con
// decisión "paper_copy" que aún no tienen un paper trade asociado.
// Comando: npm run paper:create
//
// Este script cierra el pipeline faltante:
//   monitor:trades → score:trades → paper:create → paper:update-pnl → review:outcomes

import { processPendingDecisions, type ProcessPendingResult } from "../lib/simulation/paper-trader";

// ─── Config ────────────────────────────────────────────────────

const DEFAULT_LIMIT = 50;

// ─── CLI Arguments ─────────────────────────────────────────────

interface CliArgs {
  /** Max paper trades to create (default: 50) */
  limit: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const cli: CliArgs = { limit: DEFAULT_LIMIT };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && i + 1 < args.length) {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed) && parsed > 0) {
        cli.limit = parsed;
      }
    }
  }

  return cli;
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const cli = parseArgs();
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  📋 MESIRVE — Paper Trade Creator");
  console.log("═".repeat(60));
  console.log(`  Max trades to create: ${cli.limit}`);
  console.log("─".repeat(60));

  // Phase 1: Process pending decisions
  console.log("\n  🔍 Scanning decision journal for pending paper_copy decisions...");
  const result: ProcessPendingResult = await processPendingDecisions(cli.limit);

  // Phase 2: Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "═".repeat(60));
  console.log("  📊 Paper Trade Creation Summary");
  console.log("═".repeat(60));
  console.log(`  ✅ Paper trades created:  ${result.created}`);
  console.log(`  ⏭️  Skipped:              ${result.skipped}`);

  if (result.created === 0 && result.skipped === 0) {
    console.log("  ℹ️  No pending paper_copy decisions found.");
    console.log("  → Run `npm run score:trades` first to generate decisions.");
  }

  if (result.errors.length > 0) {
    console.log(`  ❌ Errors:               ${result.errors.length}`);
    for (const err of result.errors) {
      console.log(`       • ${err}`);
    }
  }

  console.log(`  Time:                   ${elapsed}s`);
  console.log("\n  ✅ Paper trade creation complete.");
  console.log("═".repeat(60) + "\n");
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n  ❌ Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
