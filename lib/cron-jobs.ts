// lib/cron-jobs.ts — Cron Job Functions
// Lightweight wrappers around lib/ functions that return structured
// JSON results. Called from app/api/cron/route.ts (Vercel Cron Jobs).
//
// Each function: takes minimal args, returns CronResult, never calls process.exit()

import { db } from "@/db";
import {
  walletProfiles, observedTrades, marketSnapshots, decisionJournals,
  paperTrades, leaderboardScans, outcomeReviews,
} from "@/db/schema";
import { eq, and, gte, isNull, desc, sql } from "drizzle-orm";

import { processPendingDecisions, getOpenPaperTrades, updatePaperTradePnL, resolvePaperTrade, getPaperPortfolioStats } from "@/lib/simulation/paper-trader";
import { checkResolutions } from "@/lib/adapters/outcomes";
import { generateDailyReport } from "@/lib/reports/daily-report";
import { sendDailyReport, isTelegramConfigured } from "@/lib/notifications/telegram";
import { loadActiveRules, parseRules, proposeRuleChange, applyRuleChange } from "@/lib/rules/rule-engine";
import { fetchLeaderboard, fetchWalletActivitySummary, type WalletActivityItem } from "@/lib/adapters/leaderboard";
import { scoreWallet, scoreROI, type WalletInput, type WalletScoreResult } from "@/lib/scoring/wallet-scoring";
import { scoreTrade, type TradeScoreInput } from "@/lib/scoring/trade-scoring";
import { fetchMarketData, fetchMarketsByCondition } from "@/lib/adapters/markets";
import { sleep } from "@/lib/adapters/client";

// ─── Result Type ───────────────────────────────────────────────

export interface CronResult {
  ok: boolean;
  task: string;
  duration: number;
  error?: string;
  data?: Record<string, unknown>;
}

// ─── Pipeline Steps ────────────────────────────────────────────

export async function runMonitorTrades(): Promise<CronResult> {
  const start = Date.now();
  try {
    const rows = await db
      .select({ address: walletProfiles.address, label: walletProfiles.label, globalScore: walletProfiles.globalScore })
      .from(walletProfiles).where(eq(walletProfiles.status, "track"))
      .orderBy(sql`${walletProfiles.globalScore} DESC`);

    if (rows.length === 0) return { ok: true, task: "monitor", duration: Date.now() - start, data: { wallets: 0 } };

    let newTrades = 0, newMarkets = 0, duplicates = 0;
    const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600;

    for (const wallet of rows) {
      try {
        const { fetchWalletActivity } = await import("@/lib/adapters/leaderboard");
        const activity = await fetchWalletActivity(wallet.address, { limit: 50 });
        const recent = activity.filter((a: WalletActivityItem) => a.type === "trade" && a.timestamp >= cutoff);

        for (const trade of recent) {
          const dup = await db.select({ id: observedTrades.id }).from(observedTrades).where(
            and(eq(observedTrades.walletAddress, wallet.address), eq(observedTrades.marketId, trade.marketId ?? ""),
              gte(observedTrades.timestamp, new Date((trade.timestamp - 120) * 1000)))).limit(1);
          if (dup.length > 0) { duplicates++; continue; }

          await db.insert(observedTrades).values({
            walletAddress: wallet.address, marketId: trade.marketId ?? "", conditionId: trade.conditionId ?? null,
            marketQuestion: trade.marketQuestion ?? null, outcome: trade.outcome ?? null, side: trade.side ?? null,
            walletEntryPrice: trade.price ?? null, detectedPrice: trade.price ?? null, size: trade.size ?? null,
            timestamp: new Date(trade.timestamp * 1000), rawTradeJson: JSON.stringify(trade),
          });
          newTrades++;

          // Best-effort market snapshot
          if (trade.marketId || trade.conditionId) {
            const oneHourAgo = new Date(Date.now() - 3600 * 1000);
            const existing = await db.select({ id: marketSnapshots.id }).from(marketSnapshots)
              .where(and(eq(marketSnapshots.marketId, trade.marketId ?? ""), gte(marketSnapshots.collectedAt, oneHourAgo))).limit(1);
            if (existing.length === 0) {
              let marketData;
              try { marketData = await fetchMarketData(trade.marketId ?? ""); } catch { marketData = null; }
              if (!marketData && trade.conditionId) {
                try { const results = await fetchMarketsByCondition(trade.conditionId); marketData = results[0] ?? null; } catch { marketData = null; }
              }
              if (marketData) {
                await db.insert(marketSnapshots).values({
                  marketId: marketData.id, conditionId: marketData.conditionId, question: marketData.question,
                  category: marketData.category ?? null, yesPrice: marketData.yesPrice, noPrice: marketData.noPrice,
                  bestBid: marketData.bestBid, bestAsk: marketData.bestAsk, spread: marketData.spread,
                  liquidity: marketData.liquidity, volume: marketData.volume,
                  timeToResolution: marketData.endDate ? Math.max(0, Math.floor((new Date(marketData.endDate).getTime() - Date.now()) / 1000)) : null,
                  rawMarketJson: JSON.stringify(marketData),
                });
                newMarkets++;
              }
            }
          }
        }
        await sleep(300);
      } catch { /* per-wallet errors non-fatal */ }
    }

    return { ok: true, task: "monitor", duration: Date.now() - start, data: { wallets: rows.length, newTrades, newMarkets, duplicates } };
  } catch (err) {
    return { ok: false, task: "monitor", duration: Date.now() - start, error: (err as Error).message };
  }
}

export async function runScoreTrades(): Promise<CronResult> {
  const start = Date.now();
  try {
    const trades = await db
      .select({ id: observedTrades.id, walletAddress: observedTrades.walletAddress, marketId: observedTrades.marketId,
        outcome: observedTrades.outcome, side: observedTrades.side, walletEntryPrice: observedTrades.walletEntryPrice,
        detectedPrice: observedTrades.detectedPrice, size: observedTrades.size })
      .from(observedTrades)
      .leftJoin(decisionJournals, eq(observedTrades.id, decisionJournals.observedTradeId))
      .where(isNull(decisionJournals.id)).orderBy(desc(observedTrades.createdAt)).limit(200);

    if (trades.length === 0) return { ok: true, task: "score", duration: Date.now() - start, data: { scored: 0 } };

    let scored = 0, skipped = 0;
    const decisions: Record<string, number> = { paper_copy: 0, watchlist: 0, skip: 0 };

    for (const trade of trades) {
      const wRows = await db.select().from(walletProfiles).where(eq(walletProfiles.address, trade.walletAddress)).limit(1);
      if (wRows.length === 0) { skipped++; continue; }
      const w = wRows[0];
      const wallet: WalletScoreResult = {
        address: w.address,
        scores: { roiScore: scoreROI(w.roi30d), consistencyScore: w.consistencyScore ?? 0, copyabilityScore: w.copyabilityScore ?? 0,
          categoryStrength: 0, liquidityQuality: 0, entryTiming: 0, resolvedPerformance: 0, oneHitWonderPenalty: w.oneHitWonderPenalty ?? 0 },
        globalScore: w.globalScore ?? 0, status: (w.status as "track" | "watch" | "ignore") ?? "watch",
        reasoning: w.copyabilityNotes?.split("; ") ?? [], bestCategory: w.bestCategory ?? null,
      };

      const mRows = await db.select().from(marketSnapshots).where(eq(marketSnapshots.marketId, trade.marketId))
        .orderBy(desc(marketSnapshots.collectedAt)).limit(1);
      if (mRows.length === 0) { skipped++; continue; }
      const m = mRows[0];
      const market = { spread: m.spread ?? null, liquidity: m.liquidity ?? 0, category: m.category as string | undefined,
        yesPrice: m.yesPrice ?? 0, noPrice: m.noPrice ?? 0, timeToResolutionHours: m.timeToResolution ? m.timeToResolution / 3600 : null };

      const input: TradeScoreInput = {
        wallet,
        market: { spread: market.spread, liquidity: market.liquidity, category: market.category as string | undefined,
          yesPrice: market.yesPrice, noPrice: market.noPrice, timeToResolutionHours: market.timeToResolutionHours },
        trade: { outcome: trade.outcome ?? "Unknown", side: (trade.side as "yes" | "no") ?? "yes",
          walletEntryPrice: trade.walletEntryPrice ?? 0, detectedPrice: trade.detectedPrice ?? 0, size: trade.size ?? 0 },
      };

      try {
        const result = scoreTrade(input);
        await db.insert(decisionJournals).values({
          observedTradeId: trade.id, walletAddress: trade.walletAddress, marketId: trade.marketId,
          decision: result.decision, copyScore: result.copyScore, confidence: result.confidence,
          reasonsJson: JSON.stringify(result.reasons), risksJson: JSON.stringify(result.risks),
          walletQualityScore: result.scores.walletQualityScore, roiScore: result.scores.roiScore,
          consistencyScore: 0, copyabilityScore: 0,
          categoryFitScore: result.scores.categoryFitScore, entryTimingScore: result.scores.entryTimingScore,
          spreadScore: result.scores.spreadScore, liquidityScore: result.scores.liquidityScore,
          thesisScore: result.scores.thesisScore, simulatedPositionSize: result.simulatedPositionSize,
        });
        decisions[result.decision]++; scored++;
      } catch { skipped++; }
    }

    return { ok: true, task: "score", duration: Date.now() - start, data: { scored, skipped, decisions } };
  } catch (err) {
    return { ok: false, task: "score", duration: Date.now() - start, error: (err as Error).message };
  }
}

export async function runPaperCreate(limit = 50): Promise<CronResult> {
  const start = Date.now();
  try {
    const result = await processPendingDecisions(limit);
    return { ok: true, task: "paper:create", duration: Date.now() - start, data: { created: result.created, skipped: result.skipped, errors: result.errors } };
  } catch (err) {
    return { ok: false, task: "paper:create", duration: Date.now() - start, error: (err as Error).message };
  }
}

export async function runUpdatePnl(): Promise<CronResult> {
  const start = Date.now();
  try {
    const openTrades = await getOpenPaperTrades();
    let updated = 0, failed = 0;
    for (const pt of openTrades) {
      try {
        const market = await fetchMarketData(pt.marketId);
        const price = pt.side.toLowerCase() === "yes" ? market.yesPrice : market.noPrice;
        if (price > 0) { await updatePaperTradePnL(pt.id, price); updated++; } else { failed++; }
      } catch { failed++; }
      await sleep(150);
    }
    return { ok: true, task: "update-pnl", duration: Date.now() - start, data: { openTrades: openTrades.length, updated, failed } };
  } catch (err) {
    return { ok: false, task: "update-pnl", duration: Date.now() - start, error: (err as Error).message };
  }
}

export async function runReviewOutcomes(): Promise<CronResult> {
  const start = Date.now();
  try {
    const openPTs = await db.select().from(paperTrades).where(eq(paperTrades.status, "open")).limit(200);
    if (openPTs.length === 0) return { ok: true, task: "review", duration: Date.now() - start, data: { resolved: 0 } };

    const marketIds = [...new Set(openPTs.map(t => t.marketId))];
    const resolutions = await checkResolutions(marketIds);
    const resolutionMap = new Map(resolutions.map(r => [r.marketId, r]));

    let resolved = 0, correct = 0, incorrect = 0;
    for (const trade of openPTs) {
      const resolution = resolutionMap.get(trade.marketId);
      if (!resolution?.winningOutcome) continue;
      try {
        const r = await resolvePaperTrade(trade.id, resolution.winningOutcome, 1.0);
        if (r?.status === "resolved") {
          resolved++;
          if ((r.realizedPnl ?? 0) > 0) correct++; else incorrect++;

          // Create outcome review
          const existing = await db.select({ id: outcomeReviews.id }).from(outcomeReviews)
            .where(eq(outcomeReviews.paperTradeId, trade.id)).limit(1);
          if (existing.length === 0) {
            await db.insert(outcomeReviews).values({
              paperTradeId: trade.id, finalOutcome: resolution.winningOutcome,
              simulatedPnl: r.realizedPnl ?? 0, wasDecisionGood: (r.realizedPnl ?? 0) > 0,
              lessonsJson: JSON.stringify([`Resolved to "${resolution.winningOutcome}"`]),
            });
          }
        }
      } catch { /* skip */ }
    }

    return { ok: true, task: "review", duration: Date.now() - start, data: { marketsChecked: marketIds.length, marketsResolved: resolutions.length, resolved, correct, incorrect } };
  } catch (err) {
    return { ok: false, task: "review", duration: Date.now() - start, error: (err as Error).message };
  }
}

// ─── Daily Jobs ────────────────────────────────────────────────

export async function runScanLeaderboard(limit = 500): Promise<CronResult> {
  const start = Date.now();
  try {
    const entries = await fetchLeaderboard(limit, { timePeriod: "ALL", category: "OVERALL" });
    if (entries.length === 0) return { ok: true, task: "scan:leaderboard", duration: Date.now() - start, data: { wallets: 0 } };

    const top10 = entries.filter(e => e.pnl !== undefined).sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0)).slice(0, 10)
      .map(e => ({ address: e.address, rank: e.rank, label: e.label, pnl: e.pnl, roi: e.roi }));

    await db.insert(leaderboardScans).values({
      source: "polymarket", walletCount: entries.length, lookbackDays: 30,
      rawSummaryJson: JSON.stringify({ fetchedAt: new Date().toISOString(), totalFetched: entries.length, addresses: entries.map(e => e.address), top10 }),
    });
    return { ok: true, task: "scan:leaderboard", duration: Date.now() - start, data: { wallets: entries.length, topPnL: top10[0]?.pnl } };
  } catch (err) {
    return { ok: false, task: "scan:leaderboard", duration: Date.now() - start, error: (err as Error).message };
  }
}

export async function runScanWallets(limit = 100): Promise<CronResult> {
  const start = Date.now();
  try {
    const scans = await db.select().from(leaderboardScans).orderBy(desc(leaderboardScans.scannedAt)).limit(1);
    if (scans.length === 0) return { ok: true, task: "scan:wallets", duration: Date.now() - start, data: { profiled: 0 } };

    const scan = scans[0];
    let addresses: string[] = [];
    if (scan.rawSummaryJson) {
      try { const s = JSON.parse(scan.rawSummaryJson); if (Array.isArray(s.addresses)) addresses = s.addresses.slice(0, limit); } catch { /* fallback */ }
    }
    if (addresses.length === 0) {
      const entries = await fetchLeaderboard(limit, { timePeriod: "ALL", category: "OVERALL" });
      addresses = entries.map(e => e.address);
    }

    let profiled = 0;
    for (let i = 0; i < addresses.length; i += 10) {
      const batch = addresses.slice(i, i + 10);
      const batchResults = await Promise.allSettled(batch.map(async (addr) => {
        let summary;
        try { summary = await fetchWalletActivitySummary(addr, 30); } catch { summary = undefined; }
        const input: WalletInput = { address: addr, activity: summary, trades: summary?.recentTrades, positions: summary?.positions,
          roi: summary?.roiEstimate ?? undefined, tradeCount: summary?.tradeCount, winRate: summary?.winRate,
          averageTradeSize: summary?.averageTradeSize, resolvedTradeCount: summary?.resolvedTradeCount };
        return { score: scoreWallet(input), summary };
      }));

      for (const r of batchResults) {
        if (r.status !== "fulfilled") continue;
        const { score, summary } = r.value;
        const existing = await db.select({ id: walletProfiles.id }).from(walletProfiles).where(eq(walletProfiles.address, score.address)).limit(1);
        const data = { address: score.address, status: score.status, roi30d: 0,
          consistencyScore: score.scores.consistencyScore, copyabilityScore: score.scores.copyabilityScore,
          oneHitWonderPenalty: score.scores.oneHitWonderPenalty, globalScore: score.globalScore,
          bestCategory: score.bestCategory, lastScannedAt: new Date(), updatedAt: new Date(),
          tradeCount30d: summary?.tradeCount ?? 0, resolvedTradeCount30d: summary?.resolvedTradeCount ?? 0,
          winRate30d: summary?.winRate ?? 0, averageTradeSize: summary?.averageTradeSize ?? 0,
          copyabilityNotes: score.reasoning.filter((r: string) => r.includes("copy") || r.includes("liquidity")).join("; ") || null,
          riskNotes: score.scores.oneHitWonderPenalty > 0 ? `One-hit-wonder penalty: ${score.scores.oneHitWonderPenalty}` : null,
          categoryStrengthsJson: summary ? JSON.stringify({}) : null,
          label: null, sourceRank: null };
        if (existing.length > 0) {
          await db.update(walletProfiles).set(data).where(eq(walletProfiles.address, score.address));
        } else {
          await db.insert(walletProfiles).values({ ...data, createdAt: new Date() });
        }
        profiled++;
      }
      await sleep(200);
    }

    return { ok: true, task: "scan:wallets", duration: Date.now() - start, data: { profiled } };
  } catch (err) {
    return { ok: false, task: "scan:wallets", duration: Date.now() - start, error: (err as Error).message };
  }
}

export async function runUpdateRules(): Promise<CronResult> {
  const start = Date.now();
  try {
    const currentRules = await loadActiveRules();
    const currentData = parseRules(currentRules);
    const stats = await getPaperPortfolioStats();
    if (stats.resolvedCount === 0) return { ok: true, task: "update:rules", duration: Date.now() - start, data: { changed: false } };

    const resolved = await db.select({ realizedPnl: paperTrades.realizedPnl }).from(paperTrades).where(eq(paperTrades.status, "resolved"));
    const gains = resolved.filter(t => (t.realizedPnl ?? 0) > 0);
    const losses = resolved.filter(t => (t.realizedPnl ?? 0) < 0);
    const totalGains = gains.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
    const totalLosses = Math.abs(losses.reduce((s, t) => s + (t.realizedPnl ?? 0), 0));
    const missedWinners = (await db.select({ id: decisionJournals.id }).from(decisionJournals)
      .where(and(eq(decisionJournals.decision, "watchlist"), gte(decisionJournals.copyScore, 0.5)))).length;

    const evidence = {
      winRate: stats.winRate, totalPnl: stats.totalPnl, resolvedCount: stats.resolvedCount,
      avgLoss: losses.length > 0 ? Math.round(-(totalLosses / losses.length) * 100) / 100 : 0,
      avgGain: gains.length > 0 ? Math.round((totalGains / gains.length) * 100) / 100 : 0,
      profitFactor: totalLosses > 0 ? Math.round((totalGains / totalLosses) * 100) / 100 : (totalGains > 0 ? 999 : 0),
      missedWinners, copiedLosers: losses.length,
    };

    const proposal = proposeRuleChange(evidence);
    if (!proposal) return { ok: true, task: "update:rules", duration: Date.now() - start, data: { changed: false, version: currentData.version } };

    const result = await applyRuleChange(proposal);
    return { ok: true, task: "update:rules", duration: Date.now() - start, data: { changed: true, fromVersion: currentData.version, toVersion: result.newRuleSet.version } };
  } catch (err) {
    return { ok: false, task: "update:rules", duration: Date.now() - start, error: (err as Error).message };
  }
}

export async function runReportDaily(): Promise<CronResult> {
  const start = Date.now();
  try {
    const report = await generateDailyReport();
    let telegramSent = false;
    if (isTelegramConfigured()) { const r = await sendDailyReport(report); telegramSent = r.ok; }
    return { ok: true, task: "report:daily", duration: Date.now() - start,
      data: { date: report.date, paperPnl: report.paperPnl, winRate: report.winRate, openPositions: report.openPositions, telegramSent } };
  } catch (err) {
    return { ok: false, task: "report:daily", duration: Date.now() - start, error: (err as Error).message };
  }
}
