import { db } from "@/db";
import { walletProfiles, pnlSnapshots } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import {
  DollarSign,
  Target,
  BarChart3,
  Users,
  TrendingUp,
  Bell,
  Settings,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { PnlChart, type PnlDataPoint } from "@/components/charts/pnl-chart";
import { getPaperPortfolioStats } from "@/lib/simulation/paper-trader";

export const dynamic = "force-dynamic";

export default async function Home() {
  const t = await getTranslations("overview");
  const stats = await getPaperPortfolioStats();

  // Active tracking wallets
  const trackWallets = await db
    .select({ id: walletProfiles.id })
    .from(walletProfiles)
    .where(eq(walletProfiles.status, "track"))
    .limit(500);
  const trackCount = trackWallets.length;

  // ── PnL chart data ────────────────────────────────────────
  const snapshots = await db
    .select({
      pnl: pnlSnapshots.pnl,
      collectedAt: pnlSnapshots.collectedAt,
    })
    .from(pnlSnapshots)
    .orderBy(asc(pnlSnapshots.collectedAt))
    .limit(300);

  const pnlByDay = new Map<string, number>();
  for (const s of snapshots) {
    const day =
      s.collectedAt instanceof Date
        ? s.collectedAt.toISOString().slice(0, 10)
        : new Date(
            (s.collectedAt as unknown as number) * 1000
          ).toISOString().slice(0, 10);
    pnlByDay.set(day, (pnlByDay.get(day) ?? 0) + (s.pnl ?? 0));
  }
  let cumulative = 0;
  const pnlData: PnlDataPoint[] = [];
  for (const [day, dailyPnl] of [...pnlByDay.entries()].sort()) {
    cumulative += dailyPnl;
    pnlData.push({
      date: day.slice(5),
      pnl: Math.round(cumulative * 100) / 100,
    });
  }

  const totalPnl = stats.totalPnl;
  const pnlSign = totalPnl >= 0 ? "+" : "";
  const pnlClass = totalPnl >= 0 ? "text-brand-400" : "text-red-400";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <h2>{t("title")}</h2>
        <p>{t("description")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title={t("simulatedPnl")} icon={<DollarSign className="size-5 text-brand-400" />} subtitle={t("simulatedPnlDesc")}>
          <p className={`stat-value ${pnlClass}`}>
            {pnlSign}${totalPnl.toFixed(2)}
          </p>
        </Card>

        <Card title={t("winRate")} icon={<Target className="size-5 text-brand-400" />} subtitle={t("winRateDesc")}>
          <p className="stat-value">
            {stats.resolvedCount > 0
              ? `${(stats.winRate * 100).toFixed(1)}%`
              : "—"}
          </p>
          <p className="text-xs text-surface-500 mt-1">
            {stats.winCount}W / {stats.lossCount}L
          </p>
        </Card>

        <Card title={t("openPositions")} icon={<BarChart3 className="size-5 text-amber-400" />} subtitle={t("openPositionsDesc")}>
          <p className="stat-value text-amber-400">
            {stats.openCount}
          </p>
          <p className="text-xs text-surface-500 mt-1">
            Unrealized: ${stats.totalUnrealizedPnl.toFixed(2)}
          </p>
        </Card>

        <Card title={t("trackedWallets")} icon={<Users className="size-5 text-blue-400" />} subtitle={t("trackedWalletsDesc")}>
          <p className="stat-value text-blue-400">{trackCount}</p>
          <p className="text-xs text-surface-500 mt-1">
            {stats.resolvedCount} {t("resolved")}
          </p>
        </Card>
      </div>

      <Card title={t("cumulativePnl")} subtitle={t("cumulativePnlDesc")} icon={<TrendingUp className="size-5 text-brand-400" />}>
        <PnlChart data={pnlData} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t("todaySignals")} icon={<Bell className="size-5 text-amber-400" />} subtitle={t("todaySignalsDesc")}>
          <div className="flex items-center gap-4">
            <Badge variant="success" icon={<DollarSign className="size-3" />}>Copy —</Badge>
            <Badge variant="warning" icon={<Target className="size-3" />}>Watch —</Badge>
            <Badge variant="danger" icon={<BarChart3 className="size-3" />}>Skip —</Badge>
          </div>
        </Card>

        <Card title={t("systemStatus")} icon={<Settings className="size-5 text-surface-400" />} subtitle={t("systemStatusDesc")}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusDot variant="active" pulse size="sm" />
              <span className="text-sm text-surface-300">
                {t("simulationMode")}
              </span>
              <Badge variant="warning">{t("paperOnly")}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-400">
                MESIRVE v1.0 — {stats.resolvedCount + stats.openCount} trades
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
