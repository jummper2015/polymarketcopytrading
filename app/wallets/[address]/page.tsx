import { db } from "@/db";
import {
  walletProfiles,
  observedTrades,
  paperTrades,
  decisionJournals,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBar } from "@/components/ui/score-bar";
import { StatusDot } from "@/components/ui/status-dot";

export const dynamic = "force-dynamic";

// ─── Helpers ───────────────────────────────────────────────────

function fmtPct(v: number | null): string {
  return v != null ? `${(v * 100).toFixed(1)}%` : "—";
}

function fmtScore(v: number | null): string {
  return v != null ? v.toFixed(2) : "—";
}

function statusBadge(status: string) {
  if (status === "track")
    return <Badge variant="success">Track</Badge>;
  if (status === "watch")
    return <Badge variant="warning">Watch</Badge>;
  return <Badge variant="neutral">Ignore</Badge>;
}

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ─── Page ──────────────────────────────────────────────────────

interface WalletProfilePageProps {
  params: Promise<{ address: string }>;
}

export default async function WalletProfilePage({
  params,
}: WalletProfilePageProps) {
  const { address } = await params;

  // Fetch wallet profile
  const [wallet] = await db
    .select()
    .from(walletProfiles)
    .where(eq(walletProfiles.address, address))
    .limit(1);

  if (!wallet) {
    notFound();
  }

  // Fetch recent trades
  const recentTrades = await db
    .select()
    .from(observedTrades)
    .where(eq(observedTrades.walletAddress, address))
    .orderBy(desc(observedTrades.timestamp))
    .limit(20);

  // Fetch simulated performance (paper trades from this wallet)
  const simulatedTrades = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.walletAddress, address))
    .orderBy(desc(paperTrades.openedAt))
    .limit(30);

  // Calculate simulated PnL
  const simulatedPnl = simulatedTrades.reduce((sum, t) => {
    const pnl = t.status === "open" ? (t.unrealizedPnl ?? 0) : (t.realizedPnl ?? 0);
    return sum + pnl;
  }, 0);

  const simulatedResolved = simulatedTrades.filter((t) => t.status === "resolved");
  const simulatedWins = simulatedResolved.filter((t) => (t.realizedPnl ?? 0) > 0);
  const simulatedWinRate = simulatedResolved.length > 0
    ? simulatedWins.length / simulatedResolved.length
    : 0;

  // Score breakdown
  const scores = [
    { label: "ROI", value: wallet.roi30d, isPct: true },
    { label: "Consistency", value: wallet.consistencyScore },
    { label: "Copyability", value: wallet.copyabilityScore },
    { label: "Global", value: wallet.globalScore },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <StatusDot
            variant={
              wallet.status === "track"
                ? "active"
                : wallet.status === "watch"
                ? "watch"
                : "inactive"
            }
          />
          <h2 className="text-2xl font-bold tracking-tight text-surface-50">
            {wallet.label ?? truncAddr(address)}
          </h2>
          {statusBadge(wallet.status)}
        </div>
        <p className="text-sm text-surface-500 font-mono ml-8 mt-0.5">
          {address}
        </p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card compact>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider">Global Score</p>
          <p className="text-xl font-bold text-surface-50 mt-1">{fmtScore(wallet.globalScore)}</p>
          <ScoreBar value={wallet.globalScore ?? 0} size="sm" className="mt-1.5" />
        </Card>
        <Card compact>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider">ROI 30d</p>
          <p className={`text-xl font-bold mt-1 ${(wallet.roi30d ?? 0) >= 0 ? "text-brand-400" : "text-red-400"}`}>
            {fmtPct(wallet.roi30d)}
          </p>
        </Card>
        <Card compact>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider">Win Rate 30d</p>
          <p className="text-xl font-bold text-surface-50 mt-1">{fmtPct(wallet.winRate30d)}</p>
        </Card>
        <Card compact>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider">Trades 30d</p>
          <p className="text-xl font-bold text-surface-50 mt-1">{wallet.tradeCount30d ?? "—"}</p>
        </Card>
        <Card compact>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider">Resolved</p>
          <p className="text-xl font-bold text-surface-50 mt-1">{wallet.resolvedTradeCount30d ?? "—"}</p>
        </Card>
        <Card compact>
          <p className="text-[10px] text-surface-400 uppercase tracking-wider">Avg Trade Size</p>
          <p className="text-xl font-bold text-surface-50 mt-1">
            {wallet.averageTradeSize != null ? `$${wallet.averageTradeSize.toFixed(0)}` : "—"}
          </p>
        </Card>
      </div>

      {/* Score breakdown + Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Score Breakdown" icon="📊">
          <div className="space-y-3">
            {scores.map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-surface-400">{s.label}</span>
                  <span className="font-mono text-surface-200">
                    {s.isPct ? fmtPct(s.value) : fmtScore(s.value)}
                  </span>
                </div>
                <ScoreBar value={s.isPct ? Math.min((s.value ?? 0) / 2, 1) : (s.value ?? 0)} size="sm" />
              </div>
            ))}
            {wallet.oneHitWonderPenalty != null && wallet.oneHitWonderPenalty > 0 && (
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-surface-700/30">
                <Badge variant="danger">⚠️ One-Hit-Wonder</Badge>
                <span className="text-sm text-surface-400">
                  Penalty: {wallet.oneHitWonderPenalty.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </Card>

        <Card title="Profile Details" icon="📋">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-surface-400">Best Category</span>
              <span className="text-surface-200 font-medium">
                {wallet.bestCategory ? (
                  <Badge variant="info">{wallet.bestCategory}</Badge>
                ) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Avg Liquidity</span>
              <span className="text-surface-200 font-mono">
                {wallet.averageLiquidity != null ? `$${wallet.averageLiquidity.toLocaleString()}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Avg Spread</span>
              <span className="text-surface-200 font-mono">
                {wallet.averageSpread != null ? `${(wallet.averageSpread * 100).toFixed(2)}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Avg Entry Timing</span>
              <span className="text-surface-200 font-mono">
                {wallet.averageEntryTiming != null ? `${wallet.averageEntryTiming}h` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Last Scanned</span>
              <span className="text-surface-200 font-mono text-xs">
                {wallet.lastScannedAt
                  ? new Date(wallet.lastScannedAt.getTime()).toLocaleString()
                  : "—"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Copyability & Risk Notes */}
      {(wallet.copyabilityNotes || wallet.riskNotes) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {wallet.copyabilityNotes && (
            <Card title="Copyability Notes" icon="🔍">
              <p className="text-sm text-surface-300 whitespace-pre-wrap leading-relaxed">
                {wallet.copyabilityNotes}
              </p>
            </Card>
          )}
          {wallet.riskNotes && (
            <Card title="Risk Notes" icon="⚠️">
              <p className="text-sm text-surface-300 whitespace-pre-wrap leading-relaxed">
                {wallet.riskNotes}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Simulated Performance */}
      <Card
        title="Simulated Performance"
        subtitle={
          simulatedTrades.length > 0
            ? `${simulatedTrades.length} paper trades · ${simulatedResolved.length} resolved`
            : "No simulated trades yet"
        }
        icon="📈"
      >
        {simulatedTrades.length === 0 ? (
          <p className="text-sm text-surface-500 py-4">
            This wallet has not been copied yet. Run{" "}
            <code className="text-brand-400">npm run monitor:trades</code> and{" "}
            <code className="text-brand-400">npm run score:trades</code> to generate signals.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <p className="text-[10px] text-surface-400 uppercase tracking-wider">Simulated PnL</p>
                <p className={`text-lg font-bold tabular-nums ${simulatedPnl >= 0 ? "text-brand-400" : "text-red-400"}`}>
                  {simulatedPnl >= 0 ? "+" : ""}${simulatedPnl.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-surface-400 uppercase tracking-wider">Win Rate</p>
                <p className="text-lg font-bold text-surface-50">
                  {fmtPct(simulatedWinRate)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-surface-400 uppercase tracking-wider">Resolved</p>
                <p className="text-lg font-bold text-surface-50">
                  {simulatedWins.length}W / {simulatedResolved.length - simulatedWins.length}L
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700/50">
                    <th className="table-header">Market</th>
                    <th className="table-header">Side</th>
                    <th className="table-header text-right">Entry</th>
                    <th className="table-header text-right">Current</th>
                    <th className="table-header text-right">PnL</th>
                    <th className="table-header text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {simulatedTrades.slice(0, 15).map((t) => {
                    const pnl = t.status === "open" ? (t.unrealizedPnl ?? 0) : (t.realizedPnl ?? 0);
                    const pnlSign = pnl >= 0 ? "+" : "";
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-surface-700/20 hover:bg-surface-800/30 transition-colors"
                      >
                        <td className="table-cell font-mono text-[11px] text-surface-400 max-w-[180px] truncate">
                          {t.marketId.slice(0, 24)}...
                        </td>
                        <td className="table-cell">
                          <Badge variant={t.side === "yes" ? "success" : "danger"}>
                            {t.side.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="table-cell text-right font-mono text-surface-300">
                          ${t.entryPrice.toFixed(4)}
                        </td>
                        <td className="table-cell text-right font-mono text-surface-300">
                          ${(t.currentPrice ?? 0).toFixed(4)}
                        </td>
                        <td className={`table-cell text-right font-mono font-semibold tabular-nums ${pnl >= 0 ? "text-brand-400" : "text-red-400"}`}>
                          {pnlSign}${pnl.toFixed(2)}
                        </td>
                        <td className="table-cell text-center">
                          <Badge
                            variant={
                              t.status === "open"
                                ? "warning"
                                : t.status === "resolved"
                                ? pnl > 0
                                  ? "success"
                                  : "danger"
                                : "neutral"
                            }
                          >
                            {t.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {simulatedTrades.length > 15 && (
                <p className="text-xs text-surface-500 mt-2 text-center">
                  ...and {simulatedTrades.length - 15} more trades
                </p>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Recent Observed Trades */}
      <Card
        title="Recent Trades"
        subtitle={`Last ${recentTrades.length} trades observed`}
        icon="🔍"
      >
        {recentTrades.length === 0 ? (
          <p className="text-sm text-surface-500 py-4">
            No trades observed for this wallet yet. Run{" "}
            <code className="text-brand-400">npm run monitor:trades</code> to detect trades.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="table-header">Market</th>
                  <th className="table-header">Side</th>
                  <th className="table-header">Category</th>
                  <th className="table-header text-right">Entry Price</th>
                  <th className="table-header text-right">Size</th>
                  <th className="table-header text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-surface-700/20 hover:bg-surface-800/30 transition-colors"
                  >
                    <td
                      className="table-cell font-mono text-[11px] text-surface-400 max-w-[180px] truncate"
                      title={t.marketQuestion ?? t.marketId}
                    >
                      {t.marketQuestion ?? t.marketId.slice(0, 24) + "..."}
                    </td>
                    <td className="table-cell">
                      <Badge variant={t.side === "yes" ? "success" : "danger"}>
                        {t.side?.toUpperCase() ?? "—"}
                      </Badge>
                    </td>
                    <td className="table-cell">
                      {t.marketCategory ? (
                        <Badge variant="info">{t.marketCategory}</Badge>
                      ) : (
                        <span className="text-surface-500">—</span>
                      )}
                    </td>
                    <td className="table-cell text-right font-mono text-surface-300">
                      ${(t.walletEntryPrice ?? 0).toFixed(4)}
                    </td>
                    <td className="table-cell text-right font-mono text-surface-300">
                      ${(t.size ?? 0).toFixed(0)}
                    </td>
                    <td className="table-cell text-right text-xs text-surface-500">
                      {t.timestamp
                        ? new Date(t.timestamp * 1000).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
