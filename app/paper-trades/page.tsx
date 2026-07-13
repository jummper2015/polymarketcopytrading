import { db } from "@/db";
import { paperTrades } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  switch (status) {
    case "open":
      return (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot variant="open" size="sm" pulse />
          <span className="text-xs font-medium text-brand-400">open</span>
        </span>
      );
    case "closed":
      return (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot variant="closed" size="sm" />
          <span className="text-xs font-medium text-surface-400">closed</span>
        </span>
      );
    case "resolved":
      return (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot variant="resolved" size="sm" />
          <span className="text-xs font-medium text-blue-400">resolved</span>
        </span>
      );
    default:
      return <span className="text-xs text-surface-500">{status}</span>;
  }
}

function pnlDisplay(unrealizedPnl: number | null, realizedPnl: number | null, status: string) {
  const pnl = status === "open" ? (unrealizedPnl ?? 0) : (realizedPnl ?? 0);
  const pnlClass =
    pnl > 0
      ? "text-brand-400"
      : pnl < 0
      ? "text-red-400"
      : "text-surface-400";
  const sign = pnl > 0 ? "+" : "";
  return (
    <span className={`font-mono font-semibold tabular-nums ${pnlClass}`}>
      {sign}${pnl.toFixed(2)}
    </span>
  );
}

function pnlPercent(unrealizedPnl: number | null, realizedPnl: number | null, positionSize: number, status: string) {
  const pnl = status === "open" ? (unrealizedPnl ?? 0) : (realizedPnl ?? 0);
  if (positionSize === 0) return "—";
  const pct = (pnl / positionSize) * 100;
  const pctClass = pct > 0 ? "text-brand-400" : pct < 0 ? "text-red-400" : "text-surface-400";
  const sign = pct > 0 ? "+" : "";
  return (
    <span className={`text-xs font-mono tabular-nums ${pctClass}`}>
      ({sign}{pct.toFixed(1)}%)
    </span>
  );
}

export default async function PaperTradesPage() {
  const trades = await db
    .select()
    .from(paperTrades)
    .orderBy(desc(paperTrades.openedAt))
    .limit(200);

  // Aggregate stats
  const openCount = trades.filter((t) => t.status === "open").length;
  const resolved = trades.filter((t) => t.status === "resolved");
  const wins = resolved.filter((t) => (t.realizedPnl ?? 0) > 0).length;
  const totalRealizedPnl = resolved.reduce(
    (s, t) => s + (t.realizedPnl ?? 0),
    0
  );
  const totalUnrealizedPnl = trades
    .filter((t) => t.status === "open")
    .reduce((s, t) => s + (t.unrealizedPnl ?? 0), 0);

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-surface-50">
          Paper Trades
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          Operaciones simuladas generadas a partir de decisiones de copia.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">Open</p>
          <p className="stat-value text-brand-400 mt-1">{openCount}</p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">Resolved</p>
          <p className="stat-value text-blue-400 mt-1">{resolved.length}</p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">Win Rate</p>
          <p className="stat-value text-surface-50 mt-1">
            {resolved.length > 0
              ? `${((wins / resolved.length) * 100).toFixed(0)}%`
              : "—"}
          </p>
        </Card>
        <Card compact>
          <p className="text-xs text-surface-400 uppercase tracking-wider">Total PnL</p>
          <p
            className={`stat-value mt-1 ${
              totalRealizedPnl + totalUnrealizedPnl >= 0
                ? "text-brand-400"
                : "text-red-400"
            }`}
          >
            {totalRealizedPnl + totalUnrealizedPnl >= 0 ? "+" : ""}$
            {(totalRealizedPnl + totalUnrealizedPnl).toFixed(2)}
          </p>
        </Card>
      </div>

      {/* Trades table */}
      <Card compact className="overflow-x-auto">
        {trades.length === 0 ? (
          <div className="text-center py-12 text-surface-500">
            <p className="text-lg mb-1">No paper trades yet</p>
            <p className="text-sm">
              Run{" "}
              <code className="text-brand-400">
                npm run score:trades
              </code>{" "}
              to generate decisions, then paper trades are created
              automatically.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="table-header">Status</th>
                <th className="table-header">Side</th>
                <th className="table-header text-right">Entry</th>
                <th className="table-header text-right">Current</th>
                <th className="table-header text-right">Position</th>
                <th className="table-header text-right">PnL</th>
                <th className="table-header">Wallet</th>
                <th className="table-header">Market</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-surface-700/20 hover:bg-surface-800/40 transition-colors"
                >
                  <td className="table-cell">{statusBadge(t.status)}</td>
                  <td className="table-cell">
                    <Badge
                      variant={t.side === "yes" ? "success" : "danger"}
                    >
                      {t.side.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="table-cell text-right font-mono text-surface-300">
                    ${t.entryPrice.toFixed(4)}
                  </td>
                  <td className="table-cell text-right font-mono text-surface-300">
                    {t.currentPrice != null
                      ? `$${t.currentPrice.toFixed(4)}`
                      : "—"}
                  </td>
                  <td className="table-cell text-right font-mono tabular-nums text-surface-200">
                    ${t.simulatedPositionSize.toFixed(0)}
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {pnlDisplay(
                        t.unrealizedPnl,
                        t.realizedPnl,
                        t.status
                      )}
                      {pnlPercent(
                        t.unrealizedPnl,
                        t.realizedPnl,
                        t.simulatedPositionSize,
                        t.status
                      )}
                    </div>
                  </td>
                  <td className="table-cell">
                    <p className="font-mono text-[11px] text-surface-500">
                      {t.walletAddress.slice(0, 6)}...
                      {t.walletAddress.slice(-4)}
                    </p>
                  </td>
                  <td className="table-cell">
                    <p className="text-xs text-surface-400 max-w-[180px] truncate">
                      {t.marketId}
                    </p>
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
