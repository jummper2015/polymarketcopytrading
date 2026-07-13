import { getTranslations } from "next-intl/server";
import { Brain, Settings, Scale, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBar } from "@/components/ui/score-bar";
import {
  loadActiveRules,
  parseRules,
  getRuleHistory,
} from "@/lib/rules/rule-engine";

export const revalidate = 60;

export default async function RulesPage() {
  const t = await getTranslations("rules");
  const activeRules = await loadActiveRules();
  const rulesData = parseRules(activeRules);
  const history = await getRuleHistory();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Brain className="size-6 text-purple-400" />
          {t("title")}
        </h2>
        <p>{t("description")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title={t("thresholds")}
          subtitle={t("thresholdsDesc", { version: rulesData.version })}
          icon={<Settings className="size-5 text-surface-400" />}
          variant="highlight"
        >
          <div className="space-y-3">
            {Object.entries(rulesData.thresholds).map(([key, value]) => (
              <div key={key}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-surface-400">
                    {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-surface-300">
                    {typeof value === "number" && key.includes("Position") ? `$${value}` : typeof value === "number" ? value.toFixed(2) : String(value)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-surface-700/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      key === "minGlobalScore" ? value >= 0.7 ? "bg-red-500/60" : value >= 0.5 ? "bg-amber-500/60" : "bg-brand-500/60"
                      : key === "maxSpread" ? value <= 0.03 ? "bg-brand-500/60" : value <= 0.05 ? "bg-amber-500/60" : "bg-red-500/60"
                      : "bg-surface-600"
                    }`}
                    style={{ width: key === "minGlobalScore" || key === "minConsistencyScore" ? `${Math.min(value * 100, 100)}%` : key === "maxSpread" ? `${Math.min(value * 1000, 100)}%` : key === "paperPositionMax" ? `${Math.min((value / 30) * 100, 100)}%` : "50%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t("weights")} subtitle={t("weightsDesc")} icon={<Scale className="size-5 text-brand-400" />}>
          <div className="space-y-2">
            {Object.entries(rulesData.weights).map(([key, value]) => (
              <div key={key}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-surface-400">{key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</span>
                  <span className="text-xs font-mono text-surface-300">{(value * 100).toFixed(0)}%</span>
                </div>
                <ScoreBar value={value} size="sm" valueLabel={value.toFixed(2)} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title={t("changeHistory")} subtitle={t("changeHistoryDesc", { count: history.length })} icon={<RefreshCw className="size-5 text-blue-400" />}>
        {history.length === 0 ? (
          <p className="text-sm text-surface-500 py-4">{t("noChanges")}</p>
        ) : (
          <div className="space-y-3">
            {history.map((change) => (
              <div key={change.id} className="p-4 rounded-lg bg-surface-800/50 border border-surface-700/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="info" icon={<RefreshCw className="size-3" />}>
                        {change.before?.version ?? "?"} → {change.after?.version ?? "?"}
                      </Badge>
                      <span className="text-xs text-surface-500">{t("changedBy")} {change.changedBy}</span>
                    </div>
                    <p className="text-sm text-surface-300 mt-1">{change.reason ?? t("reason")}</p>
                    {change.evidenceSummary && (
                      <p className="text-xs text-surface-500 mt-1">{t("evidence")}: {change.evidenceSummary}</p>
                    )}
                    {change.before?.thresholds && change.after?.thresholds && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(change.after.thresholds)
                          .filter(([key, val]) => change.before!.thresholds[key as keyof typeof change.before.thresholds] !== val)
                          .map(([key, val]) => (
                            <span key={key} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-300 font-mono">
                              {key}: {change.before!.thresholds[key as keyof typeof change.before.thresholds]} → {val}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
