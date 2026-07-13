// Weekly Report — Hito 6.4
// Aggregates daily report data into a weekly summary with trends,
// week-over-week comparisons, and formatted Telegram output.
//
// Designed to run every Sunday generating a report for Mon-Sun.

import { db } from "@/db";
import { dailyReports } from "@/db/schema";
import { gte, lte, and } from "drizzle-orm";
import { compareBotVsBlindCopy } from "@/lib/simulation/benchmarks";

// ─── Helpers ───────────────────────────────────────────────────

/** Simple MarkdownV2 escape for dynamic content like wallet labels */
function escapeMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

// ─── Types ─────────────────────────────────────────────────────

export interface WeeklyReportData {
  /** ISO date range: "YYYY-MM-DD → YYYY-MM-DD" */
  weekRange: string;
  /** Start date of the week */
  startDate: string;
  /** End date of the week */
  endDate: string;
  /** Total PnL for the week */
  totalPaperPnl: number;
  /** Average daily PnL */
  avgDailyPnl: number;
  /** Overall win rate for the week */
  avgWinRate: number;
  /** Total new signals during the week */
  totalSignals: number;
  /** Total copied signals */
  totalCopied: number;
  /** Total watched signals */
  totalWatched: number;
  /** Total skipped signals */
  totalSkipped: number;
  /** Week-over-week PnL change */
  wowPnlChange: number;
  /** Week-over-week win rate change */
  wowWinRateChange: number;
  /** Bot vs blind copy comparison */
  vsBlindCopy: {
    botPnl: number;
    blindPnl: number;
    improved: boolean;
    delta: number;
  };
  /** Best day of the week */
  bestDay: { date: string; pnl: number } | null;
  /** Worst day of the week */
  worstDay: { date: string; pnl: number } | null;
  /** Top performing wallet of the week */
  topWallet: { address: string; label?: string; pnl: number } | null;
  /** Daily breakdown */
  dailyBreakdown: {
    date: string;
    pnl: number;
    winRate: number;
    signals: number;
    copied: number;
  }[];
  /** Weekly summary text */
  summary: string;
}

// ─── Generate Weekly Report ────────────────────────────────────

/**
 * Generate a weekly report aggregating the last 7 days of daily reports.
 *
 * If no daily reports exist for some days, metrics are calculated from
 * the paper portfolio stats directly.
 *
 * @param endDate - End date in "YYYY-MM-DD" format. Defaults to today.
 * @returns WeeklyReportData with full analysis
 */
export async function generateWeeklyReport(
  endDate?: string
): Promise<WeeklyReportData> {
  const end = endDate ? new Date(endDate + "T00:00:00Z") : new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  // Fetch daily reports for this week
  const reports = await db
    .select()
    .from(dailyReports)
    .where(
      and(
        gte(dailyReports.date, startStr),
        lte(dailyReports.date, endStr)
      )
    )
    .orderBy(dailyReports.date);

  // Calculate aggregate metrics
  let totalPnl = 0;
  let totalSignals = 0;
  let totalCopied = 0;
  let totalWatched = 0;
  let totalSkipped = 0;
  let sumWinRate = 0;
  let bestDay: { date: string; pnl: number } | null = null;
  let worstDay: { date: string; pnl: number } | null = null;
  const dailyBreakdown: WeeklyReportData["dailyBreakdown"] = [];

  for (const r of reports) {
    totalPnl += r.paperPnl ?? 0;
    totalSignals += r.newSignals ?? 0;
    totalCopied += r.copiedSignals ?? 0;
    totalWatched += r.watchedSignals ?? 0;
    totalSkipped += r.skippedSignals ?? 0;
    sumWinRate += r.winRate ?? 0;

    const dayPnl = r.paperPnl ?? 0;
    if (!bestDay || dayPnl > bestDay.pnl) {
      bestDay = { date: r.date, pnl: dayPnl };
    }
    if (!worstDay || dayPnl < worstDay.pnl) {
      worstDay = { date: r.date, pnl: dayPnl };
    }

    dailyBreakdown.push({
      date: r.date,
      pnl: dayPnl,
      winRate: r.winRate ?? 0,
      signals: r.newSignals ?? 0,
      copied: r.copiedSignals ?? 0,
    });
  }

  const dayCount = reports.length || 1;
  const avgPnl = totalPnl / dayCount;
  const avgWinRate = dayCount > 0 ? sumWinRate / dayCount : 0;

  // Week-over-week comparison: fetch previous week's reports
  const prevStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevStartStr = prevStart.toISOString().slice(0, 10);
  const prevReports = await db
    .select()
    .from(dailyReports)
    .where(
      and(
        gte(dailyReports.date, prevStartStr),
        lte(dailyReports.date, startStr)
      )
    );

  const prevTotalPnl = prevReports.reduce((s, r) => s + (r.paperPnl ?? 0), 0);
  const prevWinRate =
    prevReports.length > 0
      ? prevReports.reduce((s, r) => s + (r.winRate ?? 0), 0) / prevReports.length
      : avgWinRate;

  const wowPnlChange = totalPnl - prevTotalPnl;
  const wowWinRateChange = avgWinRate - prevWinRate;

  // Bot vs blind copy comparison
  let vsBlindCopy = { botPnl: 0, blindPnl: 0, improved: false, delta: 0 };
  try {
    const comparison = await compareBotVsBlindCopy(7);
    vsBlindCopy = {
      botPnl: comparison.botPnl,
      blindPnl: comparison.blindCopyPnl,
      improved: comparison.filteringAddedValue,
      delta: comparison.deltaPnl,
    };
  } catch {
    // Gracefully degrade if no data
  }

  // Best wallet of the week
  let topWallet: { address: string; label?: string; pnl: number } | null = null;
  for (const r of reports) {
    try {
      const best = JSON.parse(r.bestWalletsJson ?? "[]") as {
        address: string;
        label?: string;
        simulatedPnl: number;
      }[];
      if (best.length > 0 && (!topWallet || best[0].simulatedPnl > topWallet.pnl)) {
        topWallet = {
          address: best[0].address,
          label: best[0].label,
          pnl: best[0].simulatedPnl,
        };
      }
    } catch { /* ignore parse errors */ }
  }

  // Generate summary text
  const pnlEmoji = totalPnl >= 0 ? "🟢" : "🔴";
  const wowEmoji = wowPnlChange >= 0 ? "📈" : "📉";
  const vsBlindMsg = vsBlindCopy.improved
    ? `Bot outperformed blind copy by $${vsBlindCopy.delta.toFixed(2)} ✅`
    : `Blind copy would have been $${Math.abs(vsBlindCopy.delta).toFixed(2)} better ⚠️`;

  const summary =
    `${pnlEmoji} *Weekly Report: ${startStr} → ${endStr}*\n\n` +
    `PnL: $${totalPnl.toFixed(2)} (avg $${avgPnl.toFixed(2)}/day)\n` +
    `Win Rate: ${(avgWinRate * 100).toFixed(1)}%\n` +
    `Signals: ${totalSignals} (${totalCopied} copied, ${totalSkipped} skipped)\n\n` +
    `${wowEmoji} Week-over-week: ${wowPnlChange >= 0 ? "+" : ""}$${wowPnlChange.toFixed(2)}\n` +
    `${vsBlindMsg}\n` +
    (topWallet ? `🏆 Top wallet: ${topWallet.label ?? topWallet.address.slice(0, 10) + "..."} +$${topWallet.pnl.toFixed(2)}\n` : "") +
    (bestDay ? `📅 Best day: ${bestDay.date} (+$${bestDay.pnl.toFixed(2)})\n` : "") +
    (worstDay && worstDay.pnl < 0 ? `⚠️ Worst day: ${worstDay.date} ($${worstDay.pnl.toFixed(2)})\n` : "");

  return {
    weekRange: `${startStr} → ${endStr}`,
    startDate: startStr,
    endDate: endStr,
    totalPaperPnl: Math.round(totalPnl * 100) / 100,
    avgDailyPnl: Math.round(avgPnl * 100) / 100,
    avgWinRate: Math.round(avgWinRate * 10000) / 10000,
    totalSignals,
    totalCopied,
    totalWatched,
    totalSkipped,
    wowPnlChange: Math.round(wowPnlChange * 100) / 100,
    wowWinRateChange: Math.round(wowWinRateChange * 10000) / 10000,
    vsBlindCopy,
    bestDay,
    worstDay,
    topWallet,
    dailyBreakdown,
    summary,
  };
}

// ─── Telegram Format ───────────────────────────────────────────

/**
 * Format a weekly report for Telegram MarkdownV2.
 * Days with no data are skipped.
 */
export function formatWeeklyReportForTelegram(
  report: WeeklyReportData
): string {
  const pnlEmoji = report.totalPaperPnl >= 0 ? "🟢" : "🔴";
  const wowSign = report.wowPnlChange >= 0 ? "+" : "";
  const vsBlindIcon = report.vsBlindCopy.improved ? "✅" : "⚠️";

  const lines: string[] = [
    `${pnlEmoji} *Weekly Report* \\| ${report.weekRange}`,
    "",
    "*Performance*",
    `• PnL: $${report.totalPaperPnl.toFixed(2)} \\(avg $${report.avgDailyPnl.toFixed(2)}/day\\)`,
    `• Win Rate: ${(report.avgWinRate * 100).toFixed(1)}%`,
    `• Signals: ${report.totalSignals} \\(${report.totalCopied} copied, ${report.totalSkipped} skipped\\)`,
    "",
    "*Week-over-Week*",
    `• PnL change: ${wowSign}$${report.wowPnlChange.toFixed(2)}`,
    `• Win rate change: ${report.wowWinRateChange >= 0 ? "+" : ""}${(report.wowWinRateChange * 100).toFixed(1)}pp`,
    "",
    `*Bot vs Blind Copy* ${vsBlindIcon}`,
    `• Bot: $${report.vsBlindCopy.botPnl.toFixed(2)}`,
    `• Blind: $${report.vsBlindCopy.blindPnl.toFixed(2)}`,
    `• Delta: $${report.vsBlindCopy.delta >= 0 ? "+" : ""}${report.vsBlindCopy.delta.toFixed(2)}`,
    "",
  ];

  if (report.topWallet) {
    const name = escapeMd(report.topWallet.label ?? report.topWallet.address.slice(0, 12) + "...");
    lines.push(`*🏆 Top Wallet*`);
    lines.push(`• ${name}: +$${report.topWallet.pnl.toFixed(2)}`);
    lines.push("");
  }

  if (report.bestDay) {
    lines.push(`*📅 Best Day*`);
    lines.push(`• ${report.bestDay.date}: +$${report.bestDay.pnl.toFixed(2)}`);
    lines.push("");
  }

  if (report.worstDay && report.worstDay.pnl < 0) {
    lines.push(`*⚠️ Worst Day*`);
    lines.push(`• ${report.worstDay.date}: $${report.worstDay.pnl.toFixed(2)}`);
    lines.push("");
  }

  // Daily breakdown (abbreviated)
  lines.push("*Daily Breakdown*");
  for (const day of report.dailyBreakdown) {
    const sign = day.pnl >= 0 ? "+" : "";
    lines.push(`• ${day.date.slice(5)}: ${sign}$${day.pnl.toFixed(2)} \\| ${(day.winRate * 100).toFixed(0)}% WR \\| ${day.signals} signals`);
  }

  lines.push("");
  lines.push("_🤖 MESIRVE Weekly Report_");

  return lines.join("\n");
}
