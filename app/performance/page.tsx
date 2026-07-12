import { db } from "@/db";
import { paperTrades } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { ScoreBar } from "@/components/ui/score-bar";
import { getPaperPortfolioStats } from "@/lib/simulation/paper-trader";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function PerformancePage() {
  const stats = await getPaperPortfolioStats();

  // Get all resolved trades for per-wallet breakdown
  const allTrades = await db.select().from(paperTrades).limit(500);
  const resolved = allTrades.filter((t) => t.status === "resolved");
  const wins = resolved.filter((t) => (t.realizedPnl ?? 0) > 0);

  // Per-wallet aggregation
  const walletMap = new Map<
    string,
    { trades: number; wins: number; pnl: number }
  >();
  for (const t of resolved) {
    const entry = walletMap.get(t.walletAddress) ?? {
      trades: 0,
      wins: 0,
      pnl: 0,
    };
    entry.trades++;
    entry.pnl += t.realizedPnl ?? 0;
    if ((t.realizedPnl ?? 0) > 0) entry.wins++;
    walletMap.set(t.walletAddress, entry);
  }
  const walletBreakdown = [...walletMap.entries()]
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 10);

  const totalPnl = stats.totalPnl;
  const winRate = stats.winRate;
  const totalTrades = stats.openCount + stats.closedCount + stats.resolvedCount;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-surface-50">
          Performance
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          Rendimiento del portafolio simulado.
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">
            Total PnL
          </p>
          <p
            className={`stat-value ${
              totalPnl >= 0 ? "text-brand-400" : "text-red-400"
            }`}
          >
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">
            Win Rate
          </p>
          <p className="stat-value text-surface-50">
            {(winRate * 100).toFixed(1)}%
          </p>
          <ScoreBar value={winRate} size="sm" className="mt-2" />
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">
            Total Trades
          </p>
          <p className="stat-value text-surface-50">{totalTrades}</p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">
            Resolved
          </p>
          <p className="stat-value text-blue-400">
            {stats.resolvedCount}
          </p>
        </Card>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">
            Open
          </p>
          <p className="stat-value text-brand-400 mt-1">
            {stats.openCount}
          </p>
          <p className="text-xs text-surface-500 mt-1">
            PnL: ${stats.totalUnrealizedPnl.toFixed(2)}
          </p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">
            Wins / Losses
          </p>
          <p className="stat-value text-surface-50 mt-1">
            {stats.winCount}{" "}
            <span className="text-lg text-surface-500">/</span>{" "}
            {stats.lossCount}
          </p>
          <p className="text-xs text-surface-500 mt-1">
            {stats.resolvedCount > 0
              ? `${(
                  (stats.winCount / stats.resolvedCount) *
                  100
                ).toFixed(0)}% win rate`
              : "No resolved trades"}
          </p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">
            Realized PnL
          </p>
          <p
            className={`stat-value mt-1 ${
              stats.totalRealizedPnl >= 0
                ? "text-brand-400"
                : "text-red-400"
            }`}
          >
            {stats.totalRealizedPnl >= 0 ? "+" : ""}$
            {stats.totalRealizedPnl.toFixed(2)}
          </p>
          <p className="text-xs text-surface-500 mt-1">
            from {stats.resolvedCount} resolved
          </p>
        </Card>
      </div>

      {/* Per-wallet performance */}
      <Card title="Wallet Performance" subtitle="Top 10 wallets by realized PnL">
        {walletBreakdown.length === 0 ? (
          <p className="text-sm text-surface-500 py-4">
            No resolved trades yet — performance data will appear as markets
            resolve.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="table-header">#</th>
                <th className="table-header">Wallet</th>
                <th className="table-header text-right">Trades</th>
                <th className="table-header text-right">Win Rate</th>
                <th className="table-header text-right">PnL</th>
              </tr>
            </thead>
            <tbody>
              {walletBreakdown.map(([addr, data], i) => (
                <tr
                  key={addr}
                  className="border-b border-surface-700/20"
                >
                  <td className="table-cell text-surface-500 font-mono text-xs">
                    {i + 1}
                  </td>
                  <td className="table-cell">
                    <p className="font-mono text-[11px] text-surface-500">
                      {addr.slice(0, 6)}...{addr.slice(-4)}
                    </p>
                  </td>
                  <td className="table-cell text-right font-mono text-surface-300">
                    {data.trades}
                  </td>
                  <td className="table-cell text-right">
                    <span className="font-mono text-surface-300">
                      {data.trades > 0
                        ? `${((data.wins / data.trades) * 100).toFixed(0)}%`
                        : "—"}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        data.pnl >= 0
                          ? "text-brand-400"
                          : "text-red-400"
                      }`}
                    >
                      {data.pnl >= 0 ? "+" : ""}${data.pnl.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
