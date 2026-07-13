// scripts/runner.ts
// Hito 11.3 — Pipeline Daemon Runner
// Automatiza el pipeline completo de MESIRVE en loop:
//   monitor:trades → score:trades → paper:create → paper:update-pnl → review:outcomes
//
// Uso:
//   npm run runner                          # Default (step: 2s, loop: 5min)
//   npm run runner -- --step-delay 5000     # 5s entre pasos
//   npm run runner -- --loop-delay 600000   # 10min entre loops
//   npm run runner -- --skip-review         # Salta review:outcomes
//   npm run runner -- --once                # Una iteración y sale
//
// Parada: Ctrl+C → termina paso actual → sale gracefulmente

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ─── Config ────────────────────────────────────────────────────

interface RunnerConfig {
  /** Delay (ms) between pipeline steps within one iteration */
  stepDelay: number;
  /** Delay (ms) between full pipeline iterations */
  loopDelay: number;
  /** Run only one iteration then exit (useful for cron/testing) */
  once: boolean;
  /** Skip individual steps (useful for debugging/testing) */
  skip: {
    monitor: boolean;
    score: boolean;
    paperCreate: boolean;
    updatePnl: boolean;
    review: boolean;
  };
}

function parseArgs(): RunnerConfig {
  const args = process.argv.slice(2);
  const config: RunnerConfig = {
    stepDelay: 2_000,
    loopDelay: 300_000, // 5 min
    once: false,
    skip: {
      monitor: false,
      score: false,
      paperCreate: false,
      updatePnl: false,
      review: false,
    },
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--step-delay":
        config.stepDelay = parseInt(args[++i] ?? "2000", 10) || 2_000;
        break;
      case "--loop-delay":
        config.loopDelay = parseInt(args[++i] ?? "300000", 10) || 300_000;
        break;
      case "--once":
        config.once = true;
        break;
      case "--skip-monitor":
        config.skip.monitor = true;
        break;
      case "--skip-score":
        config.skip.score = true;
        break;
      case "--skip-paper":
        config.skip.paperCreate = true;
        break;
      case "--skip-update-pnl":
        config.skip.updatePnl = true;
        break;
      case "--skip-review":
        config.skip.review = true;
        break;
      case "--skip-all-scoring":
        config.skip.monitor = true;
        config.skip.score = true;
        config.skip.paperCreate = true;
        break;
      default:
        if (args[i].startsWith("--")) {
          console.warn(`  ⚠️  Unknown flag: ${args[i]}`);
        }
    }
  }

  return config;
}

// ─── Resolve tsx Binary ────────────────────────────────────────

/**
 * Resolve the tsx binary path, falling back to npx if not found locally.
 * Handles both Unix and Windows paths.
 */
function resolveTsxBinary(): string {
  const localPath = path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx"
  );

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // Fallback: use npx (always in PATH after npm install)
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function buildTsxArgs(scriptPath: string): string[] {
  const binary = resolveTsxBinary();
  // If using npx, we need to pass 'tsx' as the first argument
  const isNpx = binary.endsWith("npx") || binary.endsWith("npx.cmd");
  return isNpx ? ["tsx", scriptPath] : [scriptPath];
}

// ─── Step Definition ──────────────────────────────────────────

interface Step {
  name: string;
  script: string;
  skipKey: keyof RunnerConfig["skip"];
}

const STEPS: Step[] = [
  { name: "Monitor Trades",     script: "scripts/monitor-trades.ts", skipKey: "monitor" },
  { name: "Score Trades",       script: "scripts/score-trades.ts",   skipKey: "score" },
  { name: "Create Paper Trades", script: "scripts/paper-create.ts",  skipKey: "paperCreate" },
  { name: "Update PnL",         script: "scripts/update-pnl.ts",    skipKey: "updatePnl" },
  { name: "Review Outcomes",    script: "scripts/review-outcomes.ts", skipKey: "review" },
];

// ─── Runner State ──────────────────────────────────────────────

let isShuttingDown = false;
let iterationCount = 0;

// ─── Execute a Single Step ────────────────────────────────────

async function runStep(
  step: Step
): Promise<{ success: boolean; duration: number; lastLines: string }> {
  const start = Date.now();
  const scriptPath = path.resolve(process.cwd(), step.script);
  const tsxBinary = resolveTsxBinary();
  const tsxArgs = buildTsxArgs(scriptPath);

  try {
    const { stdout, stderr } = await execFileAsync(tsxBinary, tsxArgs, {
      timeout: 300_000, // 5 min timeout per step
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: process.env, // Pass through without forced NODE_ENV override
    });

    const duration = Date.now() - start;
    const output = [stdout, stderr].filter(Boolean).join("\n");
    const lastLines = output.trim().split("\n").slice(-3).join("\n");

    return { success: true, duration, lastLines };
  } catch (error: unknown) {
    const duration = Date.now() - start;
    const err = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const output = err.stdout ?? "";
    const errMsg = err.stderr ?? err.message ?? "Unknown error";
    const combined = [output, errMsg].filter(Boolean).join("\n");
    const lastLines = combined.trim().split("\n").slice(-3).join("\n");

    return { success: false, duration, lastLines };
  }
}

// ─── Execute Full Pipeline ─────────────────────────────────────

async function runPipeline(config: RunnerConfig): Promise<void> {
  iterationCount++;
  const loopStart = Date.now();

  console.log("\n" + "█".repeat(60));
  console.log(`  🚀 MESIRVE Pipeline — Iteration #${iterationCount}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log("█".repeat(60) + "\n");

  for (const step of STEPS) {
    if (isShuttingDown) break;

    if (config.skip[step.skipKey]) {
      console.log(`  ⏭️  [SKIPPED] ${step.name}`);
      continue;
    }

    console.log(`  ▶️  Running: ${step.name}...`);
    const result = await runStep(step);

    const status = result.success ? "✅" : "❌";
    const durationStr = (result.duration / 1000).toFixed(1);
    console.log(`  ${status} ${step.name} — ${durationStr}s`);

    // Print last output lines for context
    if (result.lastLines) {
      for (const line of result.lastLines.split("\n")) {
        console.log(`     ${line}`);
      }
    }

    // Stop pipeline if shutting down
    if (isShuttingDown) break;

    // Delay between steps (skip after last step)
    if (step !== STEPS[STEPS.length - 1]) {
      await sleep(config.stepDelay);
    }
  }

  const loopDuration = ((Date.now() - loopStart) / 1000).toFixed(1);
  console.log("\n" + "─".repeat(60));
  console.log(`  📊 Iteration #${iterationCount} complete — ${loopDuration}s`);
  console.log("─".repeat(60) + "\n");
}

// ─── Main Loop ─────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  console.log("█".repeat(60));
  console.log("  🤖 MESIRVE — Pipeline Daemon Runner");
  console.log("█".repeat(60));
  console.log("");
  console.log("  Pipeline order:");
  console.log("    1. Monitor Trades   (npm run monitor:trades)");
  console.log("    2. Score Trades     (npm run score:trades)");
  console.log("    3. Create Paper     (npm run paper:create)");
  console.log("    4. Update PnL       (npm run paper:update-pnl)");
  console.log("    5. Review Outcomes  (npm run review:outcomes)");
  console.log("");
  console.log(`  Step delay:  ${(config.stepDelay / 1000).toFixed(0)}s`);
  console.log(`  Loop delay:  ${(config.loopDelay / 60_000).toFixed(0)}min`);
  console.log(`  Mode:        ${config.once ? "⚡ Single run (--once)" : "🔄 Continuous loop"}`);
  console.log(`  Skipped:     ${getSkippedSummary(config.skip)}`);
  console.log("");
  console.log("  Press Ctrl+C to stop gracefully.");
  console.log("─".repeat(60) + "\n");

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    if (isShuttingDown) {
      console.log("\n  ⚡ Force exit...");
      process.exit(0);
    }
    console.log("\n  🛑 Graceful shutdown requested. Finishing current step...");
    console.log("  (Press Ctrl+C again to force exit)");
    isShuttingDown = true;
  });
  process.on("SIGTERM", () => {
    console.log("\n  🛑 SIGTERM received. Shutting down...");
    isShuttingDown = true;
    process.exit(0);
  });

  // Run pipeline (once or in loop)
  do {
    await runPipeline(config);

    if (isShuttingDown || config.once) break;

    console.log(
      `  ⏳ Waiting ${(config.loopDelay / 60_000).toFixed(0)}min before next iteration...`
    );
    console.log("  (Press Ctrl+C to stop)\n");

    // Wait for loop delay, checking for shutdown every second
    const iterations = Math.floor(config.loopDelay / 1000);
    for (let i = 0; i < iterations; i++) {
      if (isShuttingDown) break;
      await sleep(1000);
    }
  } while (!isShuttingDown);

  console.log("\n  👋 Pipeline daemon stopped.");
  process.exit(0);
}

// ─── Helpers ───────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSkippedSummary(skip: RunnerConfig["skip"]): string {
  const skipped: string[] = [];
  if (skip.monitor) skipped.push("monitor");
  if (skip.score) skipped.push("score");
  if (skip.paperCreate) skipped.push("paper:create");
  if (skip.updatePnl) skipped.push("update-pnl");
  if (skip.review) skipped.push("review");
  return skipped.length > 0 ? skipped.join(", ") : "none";
}

// ─── Entrypoint ────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error(
    `\n  ❌ Fatal error: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
});
