import { type ReactNode } from "react";

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "info";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  /** Optional icon to display before the text */
  icon?: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success:
    "bg-brand-500/15 text-brand-400 border border-brand-500/25",
  warning:
    "bg-amber-500/15 text-amber-400 border border-amber-500/25",
  danger:
    "bg-red-500/15 text-red-400 border border-red-500/25",
  neutral:
    "bg-surface-600/50 text-surface-300 border border-surface-600/50",
  info:
    "bg-blue-500/15 text-blue-400 border border-blue-500/25",
};

export function Badge({
  children,
  variant = "neutral",
  icon,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
