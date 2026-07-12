interface ScoreBarProps {
  /** Score value between 0 and 1 */
  value: number;
  /** Optional label displayed above the bar */
  label?: string;
  /** Optional value text shown to the right of the bar (e.g. "0.75") */
  valueLabel?: string;
  /** Height variant */
  size?: "sm" | "md";
  className?: string;
}

function scoreColor(value: number): string {
  if (value >= 0.7) return "bg-brand-500";
  if (value >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

function scoreBgColor(value: number): string {
  if (value >= 0.7) return "bg-brand-500/20";
  if (value >= 0.4) return "bg-amber-500/20";
  return "bg-red-500/20";
}

export function ScoreBar({
  value,
  label,
  valueLabel,
  size = "md",
  className = "",
}: ScoreBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const pct = (clamped * 100).toFixed(0);
  const height = size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className={`space-y-1 ${className}`}>
      {(label || valueLabel) && (
        <div className="flex justify-between items-center">
          {label && (
            <span className="text-xs font-medium text-surface-400">
              {label}
            </span>
          )}
          {valueLabel && (
            <span className="text-xs font-mono tabular-nums text-surface-300">
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full rounded-full ${height} ${scoreBgColor(clamped)} overflow-hidden`}
      >
        <div
          className={`${height} rounded-full ${scoreColor(clamped)} transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
