// app/api/cron/route.ts — Cron Job API Endpoint
// Protected by CRON_SECRET. Dispatch via ?task=<name> query param.
//
// Available tasks:
//   pipeline steps: monitor, score, paper:create, update-pnl, review
//   daily jobs:     scan:leaderboard, scan:wallets, update:rules, report:daily
//   runner:         full pipeline (all 5 steps sequentially)
//
// Usage:
//   GET /api/cron?task=monitor          — run monitor:trades
//   GET /api/cron?task=runner           — run full pipeline
//
// Vercel Cron Jobs config is in vercel.json (crons section).
//
// ⚠️ Timeout warning: Some tasks (update-pnl ~85s, runner ~120s)
//    exceed Vercel Hobby (10s) / Pro (60s) limits.
//    Use Vercel Pro with 300s maxDuration or GitHub Actions for
//    long-running tasks. Fast tasks (monitor, score, paper:create,
//    review, report:daily) work on all plans.

import { NextRequest, NextResponse } from "next/server";
import {
  runMonitorTrades, runScoreTrades, runPaperCreate, runUpdatePnl,
  runReviewOutcomes, runScanLeaderboard, runScanWallets,
  runUpdateRules, runReportDaily,
  type CronResult,
} from "@/lib/cron-jobs";

// ─── Auth ──────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // CRON_SECRET must be set

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

// ─── Task Dispatch ─────────────────────────────────────────────

type TaskName =
  | "monitor" | "score" | "paper:create" | "update-pnl" | "review"
  | "scan:leaderboard" | "scan:wallets" | "update:rules" | "report:daily"
  | "runner";

const TASK_MAP: Record<TaskName, () => Promise<CronResult>> = {
  monitor:          runMonitorTrades,
  score:            runScoreTrades,
  "paper:create":   () => runPaperCreate(50),
  "update-pnl":     runUpdatePnl,
  review:           runReviewOutcomes,
  "scan:leaderboard": () => runScanLeaderboard(500),
  "scan:wallets":   () => runScanWallets(100),
  "update:rules":   runUpdateRules,
  "report:daily":   runReportDaily,
  runner:           runFullPipeline,
};

async function runFullPipeline(): Promise<CronResult> {
  const start = Date.now();
  const steps: { task: string; result: CronResult }[] = [];

  const pipelineTasks: TaskName[] = ["monitor", "score", "paper:create", "update-pnl", "review"];
  let allOk = true;

  for (const task of pipelineTasks) {
    const fn = TASK_MAP[task];
    const result = await fn();
    steps.push({ task, result });
    if (!result.ok) allOk = false;
  }

  return {
    ok: allOk,
    task: "runner",
    duration: Date.now() - start,
    data: { steps: steps.map(s => ({ task: s.task, ok: s.result.ok, duration: s.result.duration, data: s.result.data })) },
  };
}

// ─── Route Handler ─────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth check
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Parse task
  const task = request.nextUrl.searchParams.get("task") as TaskName | null;
  if (!task || !TASK_MAP[task]) {
    return NextResponse.json(
      { ok: false, error: `Invalid task. Available: ${Object.keys(TASK_MAP).join(", ")}` },
      { status: 400 }
    );
  }

  // Execute
  const fn = TASK_MAP[task];
  const result = await fn();

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

// Vercel Cron Jobs also support POST for some configurations
export const POST = GET;
