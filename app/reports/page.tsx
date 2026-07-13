import { getTranslations } from "next-intl/server";
import { FileText, DollarSign, Trophy, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAllDailyReports,
  type DailyReportRow,
} from "@/lib/reports/daily-report";

export const revalidate = 60;

/** Safely parse <cmd> tags from translated strings without triggering
 *  next-intl serialization issues with Client Components. */
function formatCmd(text: string) {
  const parts = text.split(/(<cmd>.*?<\/cmd>)/g);
  return parts.map((part, i) => {
    if (part.startsWith("<cmd>") && part.endsWith("</cmd>")) {
      return (
        <code key={i} className="text-brand-400">
          {part.slice(5, -6)}
        </code>
      );
    }
    return part;
  });
}

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
  const t = await getTranslations("reports");
  const reports = await getAllDailyReports();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <FileText className="size-6 text-blue-400" />
          {t("title")}
        </h2>
        <p>{formatCmd(t("description"))}</p>
      </div>

      <div className="space-y-4">
        {reports.length === 0 ? (
          <Card>
            <div className="text-center py-12 text-surface-500">
              <p className="text-lg mb-1">{t("noReports")}</p>
              <p className="text-sm">
                {formatCmd(t("runReport"))}
              </p>
            </div>
          </Card>
        ) : (
          reports.map((r) => (
            <ReportCard key={r.id} report={r} t={t} />
          ))
        )}
      </div>
    </div>
  );
}

function ReportCard({ report, t }: { report: DailyReportRow; t: any }) {
  const bestWallets = parseBestWallets(report.bestWalletsJson);
  const pnlSign = (report.paperPnl ?? 0) >= 0 ? "+" : "";
  const hasTelegram = report.sentToTelegram;

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
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-surface-50">{report.date}</h3>
            <Badge variant={(report.paperPnl ?? 0) >= 0 ? "success" : "danger"} icon={<DollarSign className="size-3" />}>
              {pnlSign}${(report.paperPnl ?? 0).toFixed(2)}
            </Badge>
            {hasTelegram && (
              <Badge variant="info" icon={<Send className="size-3" />}>Telegram</Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="text-surface-400">{t("winRate")}: <span className="text-surface-200 font-mono">{((report.winRate ?? 0) * 100).toFixed(1)}%</span></span>
            <span className="text-surface-400">{t("open")}: <span className="text-surface-200 font-mono">{report.openPositions ?? 0}</span></span>
            <span className="text-surface-400">{t("signals")}: <span className="text-surface-200 font-mono">{report.newSignals ?? 0}</span></span>
            <span className="text-surface-400">{t("copy")}: <span className="text-brand-400 font-mono">{report.copiedSignals ?? 0}</span></span>
            <span className="text-surface-400">{t("watch")}: <span className="text-amber-400 font-mono">{report.watchedSignals ?? 0}</span></span>
            <span className="text-surface-400">{t("skip")}: <span className="text-red-400 font-mono">{report.skippedSignals ?? 0}</span></span>
            {ruleChangeCount > 0 && (
              <span className="text-surface-400">{t("rules")}: <span className="text-blue-400 font-mono">{ruleChangeCount} {t("changes")}</span></span>
            )}
          </div>

          {bestWallets.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Trophy className="size-3.5 text-amber-400" />
              <span className="text-surface-500">{t("best")}</span>
              {bestWallets.map((w, i) => (
                <span key={i} className="text-surface-400 font-mono">
                  {w.label ?? w.address.slice(0, 6) + "..."}
                  <span className={w.simulatedPnl >= 0 ? "text-brand-400 ml-0.5" : "text-red-400 ml-0.5"}>
                    {w.simulatedPnl >= 0 ? "+" : ""}${w.simulatedPnl.toFixed(2)}
                  </span>
                </span>
              ))}
            </div>
          )}

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
