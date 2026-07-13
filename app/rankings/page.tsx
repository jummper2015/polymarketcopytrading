import { db } from "@/db";
import { walletProfiles } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { ScoreBar } from "@/components/ui/score-bar";
import { StatusDot } from "@/components/ui/status-dot";

export const dynamic = "force-dynamic";

function fmtPct(v: number | null): string {
  return v != null ? `${(v * 100).toFixed(1)}%` : "—";
}

function fmtScore(v: number | null): string {
  return v != null ? v.toFixed(2) : "—";
}

function statusBadge(status: string) {
  if (status === "track")
    return <Badge variant="success" icon="✅">track</Badge>;
  if (status === "watch")
    return <Badge variant="warning" icon="👁️">watch</Badge>;
  return <Badge variant="neutral">ignore</Badge>;
}

function penaltyBadge(v: number | null) {
  if (!v || v === 0) return null;
  if (v >= 0.3) return <Badge variant="danger">⚠️ {v.toFixed(2)}</Badge>;
  if (v >= 0.1) return <Badge variant="warning">{v.toFixed(2)}</Badge>;
  return <span className="text-xs text-surface-500">{v.toFixed(2)}</span>;
}

export default async function RankingsPage() {
  const wallets = await db
    .select()
    .from(walletProfiles)
    .orderBy(desc(walletProfiles.globalScore))
    .limit(100);

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-surface-50">
          Wallet Rankings
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          Top 100 billeteras por global score. Datos de los últimos 30 días.
        </p>
      </div>

      <div className="overflow-x-auto">
        {wallets.length === 0 ? (
          <div className="text-center py-12 text-surface-500">
            <p className="text-lg mb-1">No wallet profiles yet</p>
            <p className="text-sm">
              Run <code className="text-brand-400">npm run scan:leaderboard</code>{" "}
              and <code className="text-brand-400">npm run scan:wallets</code>{" "}
              to populate data.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="table-header w-10">#</th>
                <th className="table-header">Address</th>
                <th className="table-header">Status</th>
                <th className="table-header text-right">Global</th>
                <th className="table-header text-right">ROI</th>
                <th className="table-header text-right">Consistency</th>
                <th className="table-header text-right">Copyability</th>
                <th className="table-header text-right">Penalty</th>
                <th className="table-header">Category</th>
                <th className="table-header text-right">Trades</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w, i) => (
                <tr
                  key={w.id}
                  className="border-b border-surface-700/20 hover:bg-surface-800/40 transition-colors"
                >
                  <td className="table-cell text-surface-500 font-mono text-xs">
                    {i + 1}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <StatusDot
                        variant={
                          w.status === "track"
                            ? "track"
                            : w.status === "watch"
                            ? "watch"
                            : "ignore"
                        }
                        size="sm"
                      />
                      <div>
                        {w.label && (
                          <p className="font-medium text-surface-200">
                            {w.label}
                          </p>
                        )}
                        <p className="font-mono text-[11px] text-surface-500">
                          {w.address.slice(0, 6)}...{w.address.slice(-4)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">{statusBadge(w.status)}</td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono font-semibold text-surface-100">
                        {fmtScore(w.globalScore)}
                      </span>
                    </div>
                    <ScoreBar
                      value={w.globalScore ?? 0}
                      size="sm"
                      className="mt-1 min-w-[60px]"
                    />
                  </td>
                  <td className="table-cell text-right font-mono tabular-nums text-surface-300">
                    {fmtPct(w.roi30d)}
                  </td>
                  <td className="table-cell text-right">
                    <span className="font-mono text-surface-300">
                      {fmtScore(w.consistencyScore)}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <span className="font-mono text-surface-300">
                      {fmtScore(w.copyabilityScore)}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    {penaltyBadge(w.oneHitWonderPenalty)}
                  </td>
                  <td className="table-cell">
                    {w.bestCategory ? (
                      <Badge variant="info">{w.bestCategory}</Badge>
                    ) : (
                      <span className="text-surface-500">—</span>
                    )}
                  </td>
                  <td className="table-cell text-right font-mono tabular-nums text-surface-300">
                    {w.tradeCount30d ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
