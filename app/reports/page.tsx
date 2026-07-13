import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAllDailyReports,
  type DailyReportRow,
} from "@/lib/reports/daily-report";

export const dynamic = "force-dynamic";

function parseBestWallets(json: string | null) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as {
      label?: string | null;
      address: string;
      simulatedPnl: number;
    }[];
    return arr.slice(0, 3);
  } catch {
    return [];
  }
}

export default async function ReportsPage() {
  const reports = await getAllDailyReports();

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-surface-50">
          Daily Reports
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          Reportes diarios generados por Hermes.{" "}
          <code className="text-brand-400">npm run report:daily</code>{" "}
        </p>
      </div>

      <div className="space-y-4">
        {reports.length === 0 ? (
          <Card>
            <div className="text-center py-12 text-surface-500">
              <p className="text-lg mb-1">No reports yet</p>
              <p className="text-sm">
                Run{" "}
                <code className="text-brand-400">
                  npm run report:daily
                </code>{" "}
                to generate the first daily report.
              </p>
            </div>
          </Card>
        ) : (
          reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))
        )}
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: DailyReportRow }) {
  const bestWallets = parseBestWallets(report.bestWalletsJson);
  const pnlSign = (report.paperPnl ?? 0) >= 0 ? "+" : "";
  const hasTelegram = report.sentToTelegram;

  // Parse rule changes from JSON
  let ruleChangeCount = 0;
  try {
    if (report.ruleChangesJson) {
      const rc = JSON.parse(report.ruleChangesJson);
      ruleChangeCount = Array.isArray(rc) ? rc.length : 0;
    }
  } catch {
    // ignore
  }

  return (
    <Card compact>
      <div className="flex items-start justify-between gap-4">
        {/* Left: metrics */}
        <div className="flex-1 space-y-3">
          {/* Header row */}
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-surface-50">
              {report.date}
            </h3>
            <Badge
              variant={
                (report.paperPnl ?? 0) >= 0 ? "success" : "danger"
              }
            >
              {pnlSign}${(report.paperPnl ?? 0).toFixed(2)}
            </Badge>
            {hasTelegram && (
              <Badge variant="info" icon="📡">
                Telegram
              </Badge>
            )}
          </div>

          {/* Metrics row */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="text-surface-400">
              Win Rate:{" "}
              <span className="text-surface-200 font-mono">
                {((report.winRate ?? 0) * 100).toFixed(1)}%
              </span>
            </span>
            <span className="text-surface-400">
              Open:{" "}
              <span className="text-surface-200 font-mono">
                {report.openPositions ?? 0}
              </span>
            </span>
            <span className="text-surface-400">
              Signals:{" "}
              <span className="text-surface-200 font-mono">
                {report.newSignals ?? 0}
              </span>
            </span>
            <span className="text-surface-400">
              Copy:{" "}
              <span className="text-brand-400 font-mono">
                {report.copiedSignals ?? 0}
              </span>
            </span>
            <span className="text-surface-400">
              Watch:{" "}
              <span className="text-amber-400 font-mono">
                {report.watchedSignals ?? 0}
              </span>
            </span>
            <span className="text-surface-400">
              Skip:{" "}
              <span className="text-red-400 font-mono">
                {report.skippedSignals ?? 0}
              </span>
            </span>
            {ruleChangeCount > 0 && (
              <span className="text-surface-400">
                Rules:{" "}
                <span className="text-blue-400 font-mono">
                  {ruleChangeCount} changes
                </span>
              </span>
            )}
          </div>

          {/* Best wallets */}
          {bestWallets.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-surface-500">🏆 Best:</span>
              {bestWallets.map((w, i) => (
                <span
                  key={i}
                  className="text-surface-400 font-mono"
                >
                  {w.label ?? w.address.slice(0, 6) + "..."}
                  <span
                    className={
                      w.simulatedPnl >= 0
                        ? "text-brand-400 ml-0.5"
                        : "text-red-400 ml-0.5"
                    }
                  >
                    {w.simulatedPnl >= 0 ? "+" : ""}$
                    {w.simulatedPnl.toFixed(2)}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Summary */}
          {report.summary && (
            <p className="text-xs text-surface-500 leading-relaxed bg-surface-800/30 rounded-lg p-2 border border-surface-700/20">
              {report.summary.split("\n").slice(0, 4).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
