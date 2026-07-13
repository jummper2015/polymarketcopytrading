import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBar } from "@/components/ui/score-bar";
import {
  loadActiveRules,
  parseRules,
  getRuleHistory,
} from "@/lib/rules/rule-engine";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const activeRules = await loadActiveRules();
  const rulesData = parseRules(activeRules);
  const history = await getRuleHistory();

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-surface-50">
          Rules
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          Reglas activas y timeline de cambios. El sistema se auto-mejora
          basado en evidencia de rendimiento.
        </p>
      </div>

      {/* Active rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Thresholds */}
        <Card
          title="Active Thresholds"
          subtitle={`Version ${rulesData.version}`}
          icon="⚙️"
          variant="highlight"
        >
          <div className="space-y-3">
            {Object.entries(rulesData.thresholds).map(([key, value]) => (
              <div key={key}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-surface-400">
                    {key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (s) => s.toUpperCase())}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-surface-300">
                    {typeof value === "number" && key.includes("Position")
                      ? `$${value}`
                      : typeof value === "number"
                      ? value.toFixed(2)
                      : String(value)}
                  </span>
                </div>
                {/* Visual indicator for key thresholds */}
                <div className="h-1 rounded-full bg-surface-700/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      key === "minGlobalScore"
                        ? value >= 0.7
                          ? "bg-red-500/60"
                          : value >= 0.5
                          ? "bg-amber-500/60"
                          : "bg-brand-500/60"
                        : key === "maxSpread"
                        ? value <= 0.03
                          ? "bg-brand-500/60"
                          : value <= 0.05
                          ? "bg-amber-500/60"
                          : "bg-red-500/60"
                        : "bg-surface-600"
                    }`}
                    style={{
                      width:
                        key === "minGlobalScore" ||
                        key === "minConsistencyScore"
                          ? `${Math.min(value * 100, 100)}%`
                          : key === "maxSpread"
                          ? `${Math.min(value * 1000, 100)}%`
                          : key === "paperPositionMax"
                          ? `${Math.min((value / 30) * 100, 100)}%`
                          : "50%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Weights */}
        <Card title="Score Weights" subtitle="Copy score formula" icon="⚖️">
          <div className="space-y-2">
            {Object.entries(rulesData.weights).map(([key, value]) => (
              <div key={key}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-surface-400">
                    {key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (s) => s.toUpperCase())}
                  </span>
                  <span className="text-xs font-mono text-surface-300">
                    {(value * 100).toFixed(0)}%
                  </span>
                </div>
                <ScoreBar
                  value={value}
                  size="sm"
                  valueLabel={value.toFixed(2)}
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Change history */}
      <Card
        title="Change History"
        subtitle={`${history.length} changes recorded`}
        icon="📜"
      >
        {history.length === 0 ? (
          <p className="text-sm text-surface-500 py-4">
            No rule changes yet — the system starts with default v1.0.0 and
            auto-updates as performance evidence accumulates.
          </p>
        ) : (
          <div className="space-y-3">
            {history.map((change) => (
              <div
                key={change.id}
                className="p-4 rounded-lg bg-surface-800/50 border border-surface-700/30"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="info" icon="🔄">
                        {change.before?.version ?? "?"} →{" "}
                        {change.after?.version ?? "?"}
                      </Badge>
                      <span className="text-xs text-surface-500">
                        by {change.changedBy}
                      </span>
                    </div>
                    <p className="text-sm text-surface-300 mt-1">
                      {change.reason ?? "Auto-adjustment"}
                    </p>
                    {change.evidenceSummary && (
                      <p className="text-xs text-surface-500 mt-1">
                        Evidence: {change.evidenceSummary}
                      </p>
                    )}

                    {/* Before/after diff */}
                    {change.before?.thresholds &&
                      change.after?.thresholds && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(
                            change.after.thresholds
                          )
                            .filter(
                              ([key, val]) =>
                                change.before!.thresholds[
                                  key as keyof typeof change.before.thresholds
                                ] !== val
                            )
                            .map(([key, val]) => (
                              <span
                                key={key}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-300 font-mono"
                              >
                                {key}:{" "}
                                {
                                  change.before!.thresholds[
                                    key as keyof typeof change.before.thresholds
                                  ]
                                }{" "}
                                → {val}
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
