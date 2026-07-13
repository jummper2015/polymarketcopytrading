import { db } from "@/db";
import { walletProfiles } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import {
  Trophy,
  CheckCircle2,
  Eye,
  AlertTriangle,
  Info,
} from "lucide-react";
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

function statusBadge(status: string, t: (key: string) => string) {
  if (status === "track")
    return <Badge variant="success" icon={<CheckCircle2 className="size-3" />}>{t("track")}</Badge>;
  if (status === "watch")
    return <Badge variant="warning" icon={<Eye className="size-3" />}>{t("watch")}</Badge>;
  return <Badge variant="neutral">{t("ignore")}</Badge>;
}

function penaltyBadge(v: number | null) {
  if (!v || v === 0) return null;
  if (v >= 0.3) return <Badge variant="danger" icon={<AlertTriangle className="size-3" />}>{v.toFixed(2)}</Badge>;
  if (v >= 0.1) return <Badge variant="warning">{v.toFixed(2)}</Badge>;
  return <span className="text-xs text-surface-500">{v.toFixed(2)}</span>;
}

export default async function RankingsPage() {
  const t = await getTranslations("rankings");
  const st = await getTranslations("status");

  const wallets = await db
    .select()
    .from(walletProfiles)
    .orderBy(desc(walletProfiles.globalScore))
    .limit(100);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Trophy className="size-6 text-amber-400" />
          {t("title")}
        </h2>
        <p>{t("description")}</p>
      </div>

      <div className="overflow-x-auto">
        {wallets.length === 0 ? (
          <div className="text-center py-12 text-surface-500">
            <p className="text-lg mb-1">{t("noWallets")}</p>
            <p className="text-sm">
              {t.rich("runScan", {
                cmd1: (chunks) => <code className="text-brand-400">{chunks}</code>,
                cmd2: (chunks) => <code className="text-brand-400">{chunks}</code>
              })}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="table-header w-10">{t("rank")}</th>
                <th className="table-header">{t("address")}</th>
                <th className="table-header">{t("status")}</th>
                <th className="table-header text-right">{t("global")}</th>
                <th className="table-header text-right">{t("roi")}</th>
                <th className="table-header text-right">{t("consistency")}</th>
                <th className="table-header text-right">{t("copyability")}</th>
                <th className="table-header text-right">{t("penalty")}</th>
                <th className="table-header">{t("category")}</th>
                <th className="table-header text-right">{t("trades")}</th>
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
                  <td className="table-cell">{statusBadge(w.status, st)}</td>
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
                      <Badge variant="info" icon={<Info className="size-3" />}>{w.bestCategory}</Badge>
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
