import { type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  /** Card title displayed in the header */
  title?: string;
  /** Optional subtitle below the title */
  subtitle?: string;
  /** Optional icon/emoji displayed before the title */
  icon?: ReactNode;
  /** Optional action element (button, link) in the header right side */
  action?: ReactNode;
  /** Visual variant */
  variant?: "default" | "highlight";
  /** Makes the card padding tighter */
  compact?: boolean;
  /** Additional classes */
  className?: string;
}

export function Card({
  children,
  title,
  subtitle,
  icon,
  action,
  variant = "default",
  compact = false,
  className = "",
}: CardProps) {
  const padding = compact ? "p-4" : "p-6";
  const borderColor =
    variant === "highlight"
      ? "border-brand-500/30 bg-brand-500/5"
      : "border-surface-700/50 bg-surface-800/80";

  return (
    <div
      className={`rounded-xl border backdrop-blur-sm ${padding} ${borderColor} ${className}`}
    >
      {(title || action) && (
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span className="flex-shrink-0 text-lg">{icon}</span>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="text-sm font-semibold text-surface-50 truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-surface-400 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="flex-shrink-0 ml-3">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
