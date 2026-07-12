import { db } from "@/db";
import { walletProfiles, pnlSnapshots } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { PnlChart, type PnlDataPoint } from "@/components/charts/pnl-chart";
import { getPaperPortfolioStats } from "@/lib/simulation/paper-trader";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function Home() {
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
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-surface-50">
          Overview
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          Panel de control del bot de copy trading para Polymarket.
          Simulación únicamente — sin operaciones reales.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          title="PnL Simulado"
          icon="💰"
          subtitle="Total unrealized + realized"
        >
          <p className={`stat-value ${pnlClass}`}>
            {pnlSign}${totalPnl.toFixed(2)}
          </p>
        </Card>

        <Card
          title="Win Rate"
          icon="🎯"
          subtitle="Sobre trades resueltos"
        >
          <p className="stat-value text-surface-50">
            {stats.resolvedCount > 0
              ? `${(stats.winRate * 100).toFixed(1)}%`
              : "—"}
          </p>
          <p className="text-xs text-surface-500 mt-1">
            {stats.winCount}W / {stats.lossCount}L
          </p>
        </Card>

        <Card
          title="Posiciones Abiertas"
          icon="📊"
          subtitle="Paper trades activos"
        >
          <p className="stat-value text-amber-400">
            {stats.openCount}
          </p>
          <p className="text-xs text-surface-500 mt-1">
            Unrealized: ${stats.totalUnrealizedPnl.toFixed(2)}
          </p>
        </Card>

        <Card
          title="Billeteras Track"
          icon="👥"
          subtitle="En seguimiento activo"
        >
          <p className="stat-value text-blue-400">{trackCount}</p>
          <p className="text-xs text-surface-500 mt-1">
            {stats.resolvedCount} resolved
          </p>
        </Card>
      </div>

      {/* PnL Chart */}
      <Card title="Cumulative PnL" subtitle="Paper trading performance over time" icon="📈">
        <PnlChart data={pnlData} />
      </Card>

      {/* Second row: Signals + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Señales de Hoy"
          icon="🔔"
          subtitle="Decisiones generadas hoy"
        >
          <div className="flex items-center gap-4">
            <Badge variant="success" icon="📋">
              Copy —
            </Badge>
            <Badge variant="warning" icon="👁️">
              Watch —
            </Badge>
            <Badge variant="danger" icon="⏭️">
              Skip —
            </Badge>
          </div>
        </Card>

        <Card
          title="Estado del Sistema"
          icon="⚙️"
          subtitle="Versión y modo de operación"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusDot variant="active" pulse size="sm" />
              <span className="text-sm text-surface-300">
                Simulation Mode
              </span>
              <Badge variant="warning">Paper Only</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-400">
                Hermes v1.0 — {stats.resolvedCount + stats.openCount} trades
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
