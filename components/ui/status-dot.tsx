type StatusVariant = "track" | "watch" | "ignore" | "open" | "closed" | "resolved" | "active" | "inactive";

interface StatusDotProps {
  variant?: StatusVariant;
  /** Whether the dot should pulse (animated) */
  pulse?: boolean;
  /** Size: sm = 6px, md = 8px, lg = 10px */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const variantColors: Record<StatusVariant, string> = {
  track: "bg-brand-500",
  watch: "bg-amber-500",
  ignore: "bg-surface-500",
  open: "bg-brand-500",
  closed: "bg-surface-400",
  resolved: "bg-blue-400",
  active: "bg-brand-500",
  inactive: "bg-surface-500",
};

const sizeMap = { sm: "h-1.5 w-1.5", md: "h-2 w-2", lg: "h-2.5 w-2.5" };

export function StatusDot({
  variant = "active",
  pulse = false,
  size = "md",
  className = "",
}: StatusDotProps) {
  const color = variantColors[variant];

  return (
    <span className={`relative flex ${sizeMap[size]} ${className}`}>
      {pulse && (
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`}
        />
      )}
      <span
        className={`relative inline-flex rounded-full ${sizeMap[size]} ${color}`}
      />
    </span>
  );
}
