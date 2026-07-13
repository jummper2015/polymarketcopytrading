// Daily Report Generator — Hito 6.1
// Gathers daily performance metrics, identifies best/worst wallets,
// records rule changes, and formats reports for Telegram delivery.
//
// Daily reports track:
//   - Paper PnL (total unrealized + realized)
//   - Win rate from resolved trades
//   - Signal breakdown: copied, watched, skipped
//   - Best & worst performing wallets
//   - Rule changes made today
//   - Open positions
//
// Usage:
//   const report = await generateDailyReport();
//   const telegramText = formatReportForTelegram(report);

import { db } from "@/db";
import {
  paperTrades,
  decisionJournals,
  walletProfiles,
  ruleChanges,
  dailyReports,
} from "@/db/schema";
import { eq, desc, between } from "drizzle-orm";
import { getPaperPortfolioStats } from "@/lib/simulation/paper-trader";

// ─── Types ─────────────────────────────────────────────────────

/** All metrics gathered for a daily report */
export interface DailyReportData {
  /** ISO date string: YYYY-MM-DD */
  date: string;
  /** Total PnL across all paper trades (unrealized + realized) */
  paperPnl: number;
  /** Win rate from resolved trades (0–1) */
  winRate: number;
  /** Number of currently open paper trades */
  openPositions: number;
  /** Total new decision signals today */
  newSignals: number;
  /** Signals with decision = paper_copy */
  copiedSignals: number;
  /** Signals with decision = watchlist */
  watchedSignals: number;
  /** Signals with decision = skip */
  skippedSignals: number;
  /** Top wallets by paper trade PnL */
  bestWallets: WalletSummary[];
  /** Worst wallets by paper trade PnL */
  worstWallets: WalletSummary[];
  /** Rule changes recorded today */
  ruleChanges: RuleChangeSummary[];
  /** Human-readable summary text */
  summary: string;
  /** Whether the report was sent to Telegram */
  sentToTelegram: boolean;
}

/** Summary of a wallet's performance in paper trades */
export interface WalletSummary {
  address: string;
  label: string | null;
  status: string | null;
  /** Total PnL from this wallet's paper trades */
  simulatedPnl: number;
  /** Number of paper trades from this wallet */
  tradeCount: number;
  /** Number of resolved paper trades from this wallet */
  resolvedCount: number;
  /** Win rate on resolved trades (0–1) */
  winRate: number;
}

/** Summary of a rule change for the daily report */
export interface RuleChangeSummary {
  /** Reason for the change */
  reason: string | null;
  /** Evidence that triggered the change */
  evidenceSummary: string | null;
  /** Version before the change */
  fromVersion: string | null;
  /** Version after the change */
  toVersion: string | null;
}

/** A saved daily report row from the DB */
export type DailyReportRow = typeof dailyReports.$inferSelect;

// ─── Helpers ───────────────────────────────────────────────────

/** Get today's date as YYYY-MM-DD string */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Get Unix timestamps (seconds) for the start and end of a given date.
 *  Stored as integers matching SQLite's unixepoch() default. */
function dateRange(
  dateStr: string
): { start: number; end: number } {
  const start = new Date(dateStr + "T00:00:00.000Z");
  const end = new Date(dateStr + "T23:59:59.999Z");
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

// ─── Core: Generate Daily Report ───────────────────────────────

/**
 * Generate a comprehensive daily report for the given date (defaults to today).
 *
 * Gathers metrics from paper trades, decision journals, wallet profiles,
 * and rule changes, then persists the report to the daily_reports table.
 *
 * If a report already exists for this date, it is replaced (upsert behavior).
 *
 * @param dateStr - ISO date string YYYY-MM-DD, defaults to today
 * @returns The complete DailyReportData
 */
export async function generateDailyReport(
  dateStr?: string
): Promise<DailyReportData> {
  const date = dateStr ?? todayStr();
  const { start, end } = dateRange(date);

  // ── Portfolio stats ──────────────────────────────────────
  const stats = await getPaperPortfolioStats();

  // ── Signal counts for today ──────────────────────────────
  const todayDecisions = await db
    .select({
      decision: decisionJournals.decision,
    })
    .from(decisionJournals)
    .where(
      between(decisionJournals.createdAt, new Date(start * 1000), new Date(end * 1000))
    );

  const newSignals = todayDecisions.length;
  const copiedSignals = todayDecisions.filter(
    (d) => d.decision === "paper_copy"
  ).length;
  const watchedSignals = todayDecisions.filter(
    (d) => d.decision === "watchlist"
  ).length;
  const skippedSignals = todayDecisions.filter(
    (d) => d.decision === "skip"
  ).length;

  // ── Wallet performance from paper trades ─────────────────
  const walletPerformance = await getWalletPaperPerformance();

  // Sort by simulatedPnl descending for best, ascending for worst
  const sorted = [...walletPerformance].sort(
    (a, b) => b.simulatedPnl - a.simulatedPnl
  );
  const bestWallets = sorted.slice(0, 5);
  const worstWallets = [...sorted]
    .sort((a, b) => a.simulatedPnl - b.simulatedPnl)
    .slice(0, 5);

  // ── Rule changes today ───────────────────────────────────
  const todayRuleChanges = await getRuleChangeSummaries(start, end);

  // ── Active rule version ──────────────────────────────────
  const summary = generateSummary({
    paperPnl: stats.totalPnl,
    winRate: stats.winRate,
    openPositions: stats.openCount,
    newSignals,
    copiedSignals,
    watchedSignals,
    skippedSignals,
    bestWallets,
    worstWallets,
    ruleChanges: todayRuleChanges,
  });

  // ── Persist to DB (upsert: delete existing, then insert) ─
  await db
    .delete(dailyReports)
    .where(eq(dailyReports.date, date));

  await db.insert(dailyReports).values({
    date,
    paperPnl: Math.round(stats.totalPnl * 100) / 100,
    winRate: Math.round(stats.winRate * 10000) / 10000,
    openPositions: stats.openCount,
    newSignals,
    copiedSignals,
    watchedSignals,
    skippedSignals,
    bestWalletsJson: JSON.stringify(bestWallets),
    worstWalletsJson: JSON.stringify(worstWallets),
    ruleChangesJson: JSON.stringify(todayRuleChanges),
    summary,
    sentToTelegram: false,
  });

  return {
    date,
    paperPnl: Math.round(stats.totalPnl * 100) / 100,
    winRate: stats.winRate,
    openPositions: stats.openCount,
    newSignals,
    copiedSignals,
    watchedSignals,
    skippedSignals,
    bestWallets,
    worstWallets,
    ruleChanges: todayRuleChanges,
    summary,
    sentToTelegram: false,
  };
}

// ─── Wallet Performance Aggregation ────────────────────────────

/**
 * Aggregate paper trade performance by wallet address.
 * Computes total PnL, trade count, resolved count, and win rate per wallet.
 */
async function getWalletPaperPerformance(): Promise<WalletSummary[]> {
  // Get all paper trades grouped by wallet
  const allTrades = await db
    .select()
    .from(paperTrades);

  // Group by wallet address
  const walletMap = new Map<string, {
    trades: number;
    resolved: number;
    wins: number;
    totalPnl: number;
    totalRealizedPnl: number;
  }>();

  for (const trade of allTrades) {
    const entry = walletMap.get(trade.walletAddress) ?? {
      trades: 0,
      resolved: 0,
      wins: 0,
      totalPnl: 0,
      totalRealizedPnl: 0,
    };

    entry.trades++;

    if (trade.status === "open") {
      entry.totalPnl += trade.unrealizedPnl ?? 0;
    } else {
      entry.totalPnl += trade.realizedPnl ?? 0;
    }

    if (trade.status === "resolved") {
      entry.resolved++;
      entry.totalRealizedPnl += trade.realizedPnl ?? 0;
      if ((trade.realizedPnl ?? 0) > 0) {
        entry.wins++;
      }
    }

    walletMap.set(trade.walletAddress, entry);
  }

  // Fetch wallet labels/statuses in one query
  const addresses = [...walletMap.keys()];
  let profileMap = new Map<string, { label: string | null; status: string | null }>();

  if (addresses.length > 0) {
    // SQLite has limits on IN clause size, but for top wallets this is fine
    // We fetch all wallet profiles and match in memory
    const profiles = await db
      .select({
        address: walletProfiles.address,
        label: walletProfiles.label,
        status: walletProfiles.status,
      })
      .from(walletProfiles);

    for (const p of profiles) {
      profileMap.set(p.address, {
        label: p.label,
        status: p.status,
      });
    }
  }

  // Build result
  const result: WalletSummary[] = [];
  for (const [address, data] of walletMap) {
    const profile = profileMap.get(address);
    result.push({
      address,
      label: profile?.label ?? null,
      status: profile?.status ?? null,
      simulatedPnl: Math.round(data.totalPnl * 100) / 100,
      tradeCount: data.trades,
      resolvedCount: data.resolved,
      winRate:
        data.resolved > 0
          ? Math.round((data.wins / data.resolved) * 10000) / 10000
          : 0,
    });
  }

  return result;
}

// ─── Rule Change Summaries ─────────────────────────────────────

/**
 * Get rule change summaries for a given date range.
 */
async function getRuleChangeSummaries(
  start: number,
  end: number
): Promise<RuleChangeSummary[]> {
  const changes = await db
    .select()
    .from(ruleChanges)
    .where(
      between(ruleChanges.createdAt, new Date(start * 1000), new Date(end * 1000))
    )
    .orderBy(desc(ruleChanges.createdAt));

  return changes.map((c) => {
    let fromVersion: string | null = null;
    let toVersion: string | null = null;

    try {
      if (c.beforeJson) {
        fromVersion = (JSON.parse(c.beforeJson) as { version?: string }).version ?? null;
      }
      if (c.afterJson) {
        toVersion = (JSON.parse(c.afterJson) as { version?: string }).version ?? null;
      }
    } catch {
      // Ignore parse errors
    }

    return {
      reason: c.reason,
      evidenceSummary: c.evidenceSummary,
      fromVersion,
      toVersion,
    };
  });
}

// ─── Summary Generator ─────────────────────────────────────────

interface SummaryInput {
  paperPnl: number;
  winRate: number;
  openPositions: number;
  newSignals: number;
  copiedSignals: number;
  watchedSignals: number;
  skippedSignals: number;
  bestWallets: WalletSummary[];
  worstWallets: WalletSummary[];
  ruleChanges: RuleChangeSummary[];
}

function generateSummary(input: SummaryInput): string {
  const lines: string[] = [];

  // Overall performance
  const pnlEmoji = input.paperPnl >= 0 ? "📈" : "📉";
  const pnlSign = input.paperPnl >= 0 ? "+" : "";
  lines.push(
    `${pnlEmoji} PnL simulado total: ${pnlSign}$${input.paperPnl.toFixed(2)}`
  );

  const winRatePct = (input.winRate * 100).toFixed(1);
  lines.push(`🎯 Win rate: ${winRatePct}%`);

  lines.push(`📊 Posiciones abiertas: ${input.openPositions}`);

  // Signal breakdown
  lines.push(
    `🔔 Señales hoy: ${input.newSignals} | 📋 Copy: ${input.copiedSignals} | 👁️ Watch: ${input.watchedSignals} | ⏭️ Skip: ${input.skippedSignals}`
  );

  // Best wallet
  if (input.bestWallets.length > 0) {
    const best = input.bestWallets[0];
    const bestLabel = best.label
      ? `${best.label} (${best.address.slice(0, 6)}...)`
      : best.address.slice(0, 10) + "...";
    lines.push(
      `🏆 Mejor wallet: ${bestLabel} | PnL: $${best.simulatedPnl.toFixed(2)}`
    );
  }

  // Worst wallet
  if (input.worstWallets.length > 0) {
    const worst = input.worstWallets[0];
    const worstLabel = worst.label
      ? `${worst.label} (${worst.address.slice(0, 6)}...)`
      : worst.address.slice(0, 10) + "...";
    lines.push(
      `⚠️ Peor wallet: ${worstLabel} | PnL: $${worst.simulatedPnl.toFixed(2)}`
    );
  }

  // Rule changes
  if (input.ruleChanges.length > 0) {
    lines.push(
      `🧠 Cambios de reglas hoy: ${input.ruleChanges.length}`
    );
    for (const rc of input.ruleChanges) {
      const versionInfo =
        rc.fromVersion && rc.toVersion
          ? ` (${rc.fromVersion} → ${rc.toVersion})`
          : "";
      lines.push(
        `   • ${rc.reason ?? "Sin razón registrada"}${versionInfo}`
      );
    }
  } else {
    lines.push("🧠 Sin cambios de reglas hoy");
  }

  return lines.join("\n");
}

// ─── Telegram Formatter ────────────────────────────────────────

/**
 * Format a DailyReportData into a clean, emoji-rich Telegram message.
 *
 * Designed to be sent via a Telegram bot. Uses monospace where helpful.
 * Respects Telegram's 4096 character limit by keeping sections concise.
 */
export function formatReportForTelegram(
  report: DailyReportData
): string {
  const lines: string[] = [];

  // Header
  lines.push(`📊 *MESIRVE Daily Report* — ${report.date}`);
  lines.push("");

  // Performance section
  lines.push("*📈 Performance*");
  const pnlEmoji = report.paperPnl >= 0 ? "🟢" : "🔴";
  const pnlSign = report.paperPnl >= 0 ? "+" : "";
  lines.push(
    `${pnlEmoji} PnL: \`${pnlSign}$${report.paperPnl.toFixed(2)}\``
  );
  lines.push(
    `🎯 Win Rate: \`${(report.winRate * 100).toFixed(1)}%\``
  );
  lines.push(
    `📊 Open Positions: \`${report.openPositions}\``
  );
  lines.push("");

  // Signals section
  lines.push("*🔔 Today's Signals*");
  lines.push(
    `Total: \`${report.newSignals}\` | 📋 Copy: \`${report.copiedSignals}\` | 👁️ Watch: \`${report.watchedSignals}\` | ⏭️ Skip: \`${report.skippedSignals}\``
  );
  lines.push("");

  // Top wallets
  if (report.bestWallets.length > 0) {
    lines.push("*🏆 Top Wallets*");
    for (let i = 0; i < Math.min(report.bestWallets.length, 3); i++) {
      const w = report.bestWallets[i];
      const name = w.label ?? w.address.slice(0, 10) + "...";
      const pnlSign = w.simulatedPnl >= 0 ? "+" : "";
      lines.push(
        `  ${i + 1}. ${name}: \`${pnlSign}$${w.simulatedPnl.toFixed(2)}\` (${w.tradeCount} trades, ${(w.winRate * 100).toFixed(0)}% WR)`
      );
    }
    lines.push("");
  }

  // Worst wallets
  if (report.worstWallets.length > 0) {
    lines.push("*⚠️ Worst Wallets*");
    for (let i = 0; i < Math.min(report.worstWallets.length, 3); i++) {
      const w = report.worstWallets[i];
      const name = w.label ?? w.address.slice(0, 10) + "...";
      lines.push(
        `  ${i + 1}. ${name}: \`$${w.simulatedPnl.toFixed(2)}\` (${w.tradeCount} trades)`
      );
    }
    lines.push("");
  }

  // Rule changes
  if (report.ruleChanges.length > 0) {
    lines.push("*🧠 Rule Changes*");
    for (const rc of report.ruleChanges) {
      const versionInfo =
        rc.fromVersion && rc.toVersion
          ? ` (${rc.fromVersion} → ${rc.toVersion})`
          : "";
      lines.push(`  • ${rc.reason ?? "Auto-adjustment"}${versionInfo}`);
    }
    lines.push("");
  }

  // Footer
  lines.push("_🤖 Generated by MESIRVE Copy Trading Bot_");

  return lines.join("\n");
}

// ─── Retrieve Saved Reports ────────────────────────────────────

/**
 * Load a previously saved daily report by date.
 */
export async function getDailyReport(
  dateStr: string
): Promise<DailyReportData | null> {
  const rows = await db
    .select()
    .from(dailyReports)
    .where(eq(dailyReports.date, dateStr))
    .limit(1);

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    date: r.date,
    paperPnl: r.paperPnl ?? 0,
    winRate: r.winRate ?? 0,
    openPositions: r.openPositions ?? 0,
    newSignals: r.newSignals ?? 0,
    copiedSignals: r.copiedSignals ?? 0,
    watchedSignals: r.watchedSignals ?? 0,
    skippedSignals: r.skippedSignals ?? 0,
    bestWallets: parseWalletJson(r.bestWalletsJson),
    worstWallets: parseWalletJson(r.worstWalletsJson),
    ruleChanges: parseRuleChangesJson(r.ruleChangesJson),
    summary: r.summary ?? "",
    sentToTelegram: r.sentToTelegram ?? false,
  };
}

/**
 * Get all saved daily reports, newest first.
 */
export async function getAllDailyReports(): Promise<DailyReportRow[]> {
  return db
    .select()
    .from(dailyReports)
    .orderBy(desc(dailyReports.date));
}

/**
 * Mark a daily report as sent to Telegram.
 */
export async function markReportSent(
  dateStr: string
): Promise<void> {
  await db
    .update(dailyReports)
    .set({ sentToTelegram: true })
    .where(eq(dailyReports.date, dateStr));
}

// ─── JSON Parsing Helpers ──────────────────────────────────────

function parseWalletJson(json: string | null): WalletSummary[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as WalletSummary[];
  } catch {
    return [];
  }
}

function parseRuleChangesJson(
  json: string | null
): RuleChangeSummary[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as RuleChangeSummary[];
  } catch {
    return [];
  }
}
