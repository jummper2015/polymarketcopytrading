import { db } from "@/db";
import {
  decisionJournals,
  outcomeReviews,
  paperTrades,
} from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const revalidate = 60;

function decisionBadge(decision: string) {
  if (decision === "paper_copy")
    return <Badge variant="success" icon="📋">copy</Badge>;
  if (decision === "watchlist")
    return <Badge variant="warning" icon="👁️">watch</Badge>;
  return <Badge variant="danger" icon="⏭️">skip</Badge>;
}

export default async function JournalPage() {
  // Get recent decisions with their paper trades and outcome reviews
  const decisions = await db
    .select()
    .from(decisionJournals)
    .orderBy(desc(decisionJournals.createdAt))
    .limit(100);

  // Batch-fetch linked paper trades (filter at DB level, not in-memory)
  const djIds = decisions.map((d) => d.id);
  let ptMap = new Map<number, typeof paperTrades.$inferSelect>();
  if (djIds.length > 0) {
    const pts = await db
      .select()
      .from(paperTrades)
      .where(inArray(paperTrades.decisionJournalId, djIds))
      .limit(500);
    for (const pt of pts) {
      if (pt.decisionJournalId != null) {
        ptMap.set(pt.decisionJournalId, pt);
      }
    }
  }

  // Batch-fetch outcome reviews
  const reviews = await db
    .select()
    .from(outcomeReviews)
    .orderBy(desc(outcomeReviews.createdAt))
    .limit(200);

  const reviewMap = new Map<
    number,
    typeof outcomeReviews.$inferSelect
  >();
  for (const r of reviews) {
    if (r.paperTradeId != null) {
      reviewMap.set(r.paperTradeId, r);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-surface-50">
          Decision Journal
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          Timeline de decisiones y lecciones aprendidas del sistema de copy
          trading.
        </p>
      </div>

      <div className="space-y-3">
        {decisions.length === 0 ? (
          <Card>
            <div className="text-center py-12 text-surface-500">
              <p className="text-lg mb-1">No decisions yet</p>
              <p className="text-sm">
                Run{" "}
                <code className="text-brand-400">
                  npm run score:trades
                </code>{" "}
                to generate decision journals.
              </p>
            </div>
          </Card>
        ) : (
          decisions.map((dj) => {
            const pt = ptMap.get(dj.id);
            const review = pt?.id ? reviewMap.get(pt.id) : null;
            const pnl =
              pt?.status === "open"
                ? (pt.unrealizedPnl ?? 0)
                : (pt?.realizedPnl ?? 0);

            return (
              <Card key={dj.id} compact>
                <div className="flex items-start justify-between gap-4">
                  {/* Left: decision info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {decisionBadge(dj.decision)}
                      {pt && (
                        <Badge
                          variant={
                            pt.side === "yes" ? "success" : "danger"
                          }
                        >
                          {pt.side.toUpperCase()}
                        </Badge>
                      )}
                      {review && (
                        <Badge
                          variant={
                            review.wasDecisionGood
                              ? "success"
                              : "danger"
                          }
                        >
                          {review.wasDecisionGood
                            ? "✅ Good call"
                            : "❌ Bad call"}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-mono text-surface-500">
                        #{dj.id} · Wallet: {dj.walletAddress.slice(0, 6)}...
                        {dj.walletAddress.slice(-4)} · Market:{" "}
                        {dj.marketId.slice(0, 30)}...
                      </p>

                      {/* Scores row */}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-surface-500">
                        <span>Copy: {(dj.copyScore ?? 0).toFixed(2)}</span>
                        <span>Conf: {((dj.confidence ?? 0) * 100).toFixed(0)}%</span>
                        <span>WQ: {(dj.walletQualityScore ?? 0).toFixed(2)}</span>
                        <span>CF: {(dj.categoryFitScore ?? 0).toFixed(2)}</span>
                        <span>SP: {(dj.spreadScore ?? 0).toFixed(2)}</span>
                      </div>

                      {/* Outcome */}
                      {review && (
                        <div className="mt-2 p-2 rounded-lg bg-surface-800/50 border border-surface-700/30">
                          <p className="text-xs text-surface-400">
                            <span className="font-medium">Outcome:</span>{" "}
                            {review.finalOutcome ?? "—"} · PnL:{" "}
                            <span
                              className={
                                (review.simulatedPnl ?? 0) >= 0
                                  ? "text-brand-400"
                                  : "text-red-400"
                              }
                            >
                              {(review.simulatedPnl ?? 0) >= 0 ? "+" : ""}$
                              {(review.simulatedPnl ?? 0).toFixed(2)}
                            </span>
                          </p>
                          {review.lessonsJson && (
                            <p className="text-xs text-surface-500 mt-1 leading-relaxed">
                              {(() => {
                                try {
                                  const lessons = JSON.parse(
                                    review.lessonsJson
                                  );
                                  if (Array.isArray(lessons))
                                    return lessons.join(" · ");
                                  return JSON.stringify(lessons);
                                } catch {
                                  return review.lessonsJson;
                                }
                              })()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: PnL */}
                  {pt && (
                    <div className="text-right flex-shrink-0">
                      <p
                        className={`text-sm font-mono font-semibold tabular-nums ${
                          pnl > 0
                            ? "text-brand-400"
                            : pnl < 0
                            ? "text-red-400"
                            : "text-surface-400"
                        }`}
                      >
                        {pnl > 0 ? "+" : ""}${pnl.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-surface-500 mt-0.5">
                        ${pt.simulatedPositionSize.toFixed(0)} position
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
