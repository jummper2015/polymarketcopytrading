import { db } from "@/db";
import { decisionJournals, observedTrades } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBar } from "@/components/ui/score-bar";

export const dynamic = "force-dynamic";

function decisionBadge(decision: string, score: number | null) {
  if (decision === "paper_copy")
    return (
      <Badge variant="success" icon="📋">
        copy {(score ?? 0).toFixed(2)}
      </Badge>
    );
  if (decision === "watchlist")
    return (
      <Badge variant="warning" icon="👁️">
        watch {(score ?? 0).toFixed(2)}
      </Badge>
    );
  return (
    <Badge variant="danger" icon="⏭️">
      skip {(score ?? 0).toFixed(2)}
    </Badge>
  );
}



export default async function SignalsPage() {
  // Get recent decision journals
  const journals = await db
    .select()
    .from(decisionJournals)
    .orderBy(desc(decisionJournals.createdAt))
    .limit(200);

  // Batch-fetch market questions — single query instead of N+1
  const otIds = [
    ...new Set(
      journals
        .filter((j) => j.observedTradeId != null)
        .map((j) => j.observedTradeId!)
    ),
  ];
  const questionMap = new Map<number, string>();
  if (otIds.length > 0) {
    const trades = await db
      .select({
        id: observedTrades.id,
        question: observedTrades.marketQuestion,
      })
      .from(observedTrades)
      .where(inArray(observedTrades.id, otIds));
    for (const t of trades) {
      if (t.question) questionMap.set(t.id, t.question);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-surface-50">
          Trade Signals
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          Últimas decisiones de copia generadas por el motor de scoring.
        </p>
      </div>

      <Card compact className="overflow-x-auto">
        {journals.length === 0 ? (
          <div className="text-center py-12 text-surface-500">
            <p className="text-lg mb-1">No signals yet</p>
            <p className="text-sm">
              Run{" "}
              <code className="text-brand-400">
                npm run monitor:trades
              </code>{" "}
              and{" "}
              <code className="text-brand-400">npm run score:trades</code>{" "}
              to generate signals.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="table-header">Market</th>
                <th className="table-header">Wallet</th>
                <th className="table-header text-center">Decision</th>
                <th className="table-header text-right">Copy Score</th>
                <th className="table-header text-right">Confidence</th>
                <th className="table-header text-right">Position</th>
                <th className="table-header">Scores</th>
              </tr>
            </thead>
            <tbody>
              {journals.map((dj) => {
                const question =
                  (dj.observedTradeId
                    ? questionMap.get(dj.observedTradeId)
                    : null) ?? dj.marketId.slice(0, 20) + "...";

                return (
                  <tr
                    key={dj.id}
                    className="border-b border-surface-700/20 hover:bg-surface-800/40 transition-colors"
                  >
                    <td className="table-cell">
                      <p className="text-surface-200 text-xs leading-tight max-w-[220px] truncate">
                        {question}
                      </p>
                    </td>
                    <td className="table-cell">
                      <p className="font-mono text-[11px] text-surface-500">
                        {dj.walletAddress.slice(0, 6)}...
                        {dj.walletAddress.slice(-4)}
                      </p>
                    </td>
                    <td className="table-cell text-center">
                      {decisionBadge(dj.decision, dj.copyScore)}
                    </td>
                    <td className="table-cell text-right">
                      <span className="font-mono font-semibold text-surface-100">
                        {(dj.copyScore ?? 0).toFixed(2)}
                      </span>
                      <ScoreBar
                        value={dj.copyScore ?? 0}
                        size="sm"
                        className="mt-1 min-w-[50px]"
                      />
                    </td>
                    <td className="table-cell text-right font-mono text-surface-400">
                      {((dj.confidence ?? 0) * 100).toFixed(0)}%
                    </td>
                    <td className="table-cell text-right font-mono tabular-nums">
                      {dj.decision === "paper_copy" ? (
                        <span className="text-brand-400">
                          ${dj.simulatedPositionSize?.toFixed(0) ?? "—"}
                        </span>
                      ) : dj.decision === "watchlist" ? (
                        <span className="text-amber-400">$3</span>
                      ) : (
                        <span className="text-surface-500">$0</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[10px] text-surface-500">
                          WQ:{(dj.walletQualityScore ?? 0).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-surface-500">
                          ROI:{(dj.roiScore ?? 0).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-surface-500">
                          CF:{(dj.categoryFitScore ?? 0).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-surface-500">
                          ET:{(dj.entryTimingScore ?? 0).toFixed(2)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
