import { db } from "@/db";
import { paperTrades, pnlSnapshots } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import {
  TrendingUp,
  Target,
  BarChart3,
  DollarSign,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScoreBar } from "@/components/ui/score-bar";
import { PnlChart, type PnlDataPoint } from "@/components/charts/pnl-chart";
import {
  WinRateChart,
  type WinRateDataPoint,
} from "@/components/charts/win-rate-chart";
import { getPaperPortfolioStats } from "@/lib/simulation/paper-trader";

export const revalidate = 60;

export default async function PerformancePage() {
  const t = await getTranslations("performance");
  const stats = await getPaperPortfolioStats();

  const allTrades = await db.select().from(paperTrades).limit(500);
  const resolved = allTrades.filter((t) => t.status === "resolved");

  const walletMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const t of resolved) {
    const entry = walletMap.get(t.walletAddress) ?? { trades: 0, wins: 0, pnl: 0 };
    entry.trades++;
    entry.pnl += t.realizedPnl ?? 0;
    if ((t.realizedPnl ?? 0) > 0) entry.wins++;
    walletMap.set(t.walletAddress, entry);
  }
  const walletBreakdown = [...walletMap.entries()]
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 10);

  const snapshots = await db
    .select({ pnl: pnlSnapshots.pnl, collectedAt: pnlSnapshots.collectedAt })
    .from(pnlSnapshots)
    .orderBy(asc(pnlSnapshots.collectedAt))
    .limit(500);

  const pnlByDay = new Map<string, number>();
  for (const s of snapshots) {
    const day = s.collectedAt instanceof Date
      ? s.collectedAt.toISOString().slice(0, 10)
      : new Date((s.collectedAt as unknown as number) * 1000).toISOString().slice(0, 10);
    pnlByDay.set(day, (pnlByDay.get(day) ?? 0) + (s.pnl ?? 0));
  }
  let cumulative = 0;
  const pnlData: PnlDataPoint[] = [];
  for (const [day, dailyPnl] of [...pnlByDay.entries()].sort()) {
    cumulative += dailyPnl;
    pnlData.push({ date: day.slice(5), pnl: Math.round(cumulative * 100) / 100 });
  }

  const resolvedByDay = new Map<string, { wins: number; total: number }>();
  for (const t of resolved) {
    if (!t.resolvedAt) continue;
    const day = t.resolvedAt instanceof Date
      ? t.resolvedAt.toISOString().slice(0, 10)
      : new Date((t.resolvedAt as unknown as number) * 1000).toISOString().slice(0, 10);
    const entry = resolvedByDay.get(day) ?? { wins: 0, total: 0 };
    entry.total++;
    if ((t.realizedPnl ?? 0) > 0) entry.wins++;
    resolvedByDay.set(day, entry);
  }
  const winRateData: WinRateDataPoint[] = [...resolvedByDay.entries()]
    .sort()
    .map(([day, d]) => ({ date: day.slice(5), winRate: d.total > 0 ? d.wins / d.total : 0, total: d.total }));

  const totalPnl = stats.totalPnl;
  const winRate = stats.winRate;
  const totalTrades = stats.openCount + stats.closedCount + stats.resolvedCount;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <TrendingUp className="size-6 text-brand-400" />
          {t("title")}
        </h2>
        <p>{t("description")}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider flex items-center gap-1"><DollarSign className="size-3" /> {t("totalPnl")}</p>
          <p className={`stat-value ${totalPnl >= 0 ? "text-brand-400" : "text-red-400"}`}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}</p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider flex items-center gap-1"><Target className="size-3" /> {t("winRate")}</p>
          <p className="stat-value text-surface-50">{(winRate * 100).toFixed(1)}%</p>
          <ScoreBar value={winRate} size="sm" className="mt-2" />
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider flex items-center gap-1"><BarChart3 className="size-3" /> {t("totalTrades")}</p>
          <p className="stat-value text-surface-50">{totalTrades}</p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="size-3" /> {t("resolved")}</p>
          <p className="stat-value text-blue-400">{stats.resolvedCount}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t("cumulativePnl")} subtitle={t("cumulativePnlDesc")} icon={<TrendingUp className="size-5 text-brand-400" />}>
          <PnlChart data={pnlData} />
        </Card>
        <Card title={t("dailyWinRate")} subtitle={t("dailyWinRateDesc")} icon={<Target className="size-5 text-brand-400" />}>
          <WinRateChart data={winRateData} />
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider flex items-center gap-1"><Activity className="size-3" /> {t("open")}</p>
          <p className="stat-value text-brand-400 mt-1">{stats.openCount}</p>
          <p className="text-xs text-surface-500 mt-1">PnL: ${stats.totalUnrealizedPnl.toFixed(2)}</p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider flex items-center gap-1"><Target className="size-3" /> {t("winsLosses")}</p>
          <p className="stat-value text-surface-50 mt-1">{stats.winCount} <span className="text-lg text-surface-500">/</span> {stats.lossCount}</p>
          <p className="text-xs text-surface-500 mt-1">{stats.resolvedCount > 0 ? `${((stats.winCount / stats.resolvedCount) * 100).toFixed(0)}% win rate` : t("noResolved")}</p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider flex items-center gap-1"><DollarSign className="size-3" /> {t("realizedPnl")}</p>
          <p className={`stat-value mt-1 ${stats.totalRealizedPnl >= 0 ? "text-brand-400" : "text-red-400"}`}>{stats.totalRealizedPnl >= 0 ? "+" : ""}${stats.totalRealizedPnl.toFixed(2)}</p>
          <p className="text-xs text-surface-500 mt-1">{t("fromResolved", { count: stats.resolvedCount })}</p>
        </Card>
      </div>

      <Card title={t("walletPerformance")} subtitle={t("walletPerformanceDesc")} icon={<BarChart3 className="size-5 text-blue-400" />}>
        {walletBreakdown.length === 0 ? (
          <p className="text-sm text-surface-500 py-4">{t("noData")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="table-header">{t("rank")}</th>
                <th className="table-header">{t("wallet")}</th>
                <th className="table-header text-right">{t("trades")}</th>
                <th className="table-header text-right">{t("winRateShort")}</th>
                <th className="table-header text-right">{t("pnl")}</th>
              </tr>
            </thead>
            <tbody>
              {walletBreakdown.map(([addr, data], i) => (
                <tr key={addr} className="border-b border-surface-700/20">
                  <td className="table-cell text-surface-500 font-mono text-xs">{i + 1}</td>
                  <td className="table-cell"><p className="font-mono text-[11px] text-surface-500">{addr.slice(0, 6)}...{addr.slice(-4)}</p></td>
                  <td className="table-cell text-right font-mono text-surface-300">{data.trades}</td>
                  <td className="table-cell text-right"><span className="font-mono text-surface-300">{data.trades > 0 ? `${((data.wins / data.trades) * 100).toFixed(0)}%` : "—"}</span></td>
                  <td className="table-cell text-right"><span className={`font-mono font-semibold tabular-nums ${data.pnl >= 0 ? "text-brand-400" : "text-red-400"}`}>{data.pnl >= 0 ? "+" : ""}${data.pnl.toFixed(2)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
