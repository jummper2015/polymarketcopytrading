"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Trophy,
  Bell,
  ClipboardList,
  FlaskConical,
  BookOpen,
  TrendingUp,
  Brain,
  FileText,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

const navKeys = [
  { key: "overview", href: "/", icon: LayoutDashboard },
  { key: "rankings", href: "/rankings", icon: Trophy },
  { key: "signals", href: "/signals", icon: Bell },
  { key: "paperTrades", href: "/paper-trades", icon: ClipboardList },
  { key: "backtesting", href: "/backtesting", icon: FlaskConical },
  { key: "journal", href: "/journal", icon: BookOpen },
  { key: "performance", href: "/performance", icon: TrendingUp },
  { key: "rules", href: "/rules", icon: Brain },
  { key: "reports", href: "/reports", icon: FileText },
];

interface SidebarProps {
  isMobileOpen: boolean;
  onNavClick: () => void;
}

export function Sidebar({ isMobileOpen, onNavClick }: SidebarProps) {
  const pathname = usePathname();
  const tn = useTranslations("nav");
  const tc = useTranslations("common");

  return (
    <aside
      className={`fixed top-14 left-0 bottom-0 w-56 border-r border-surface-700/50 bg-surface-900/95 overflow-y-auto z-40 transition-transform duration-200 md:translate-x-0 md:block md:pointer-events-auto ${
        isMobileOpen
          ? "translate-x-0 pointer-events-auto"
          : "-translate-x-full pointer-events-none"
      }`}
      aria-hidden={!isMobileOpen ? true : undefined}
    >
      <nav className="flex flex-col gap-0.5 p-3 h-full">
        <div className="px-3 py-2 mb-2">
          <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-widest">
            {tc("navigation")}
          </p>
        </div>

        {navKeys.map((item) => {
          const Icon = item.icon;
          const label = tn(item.key);
          const desc = tn(item.key + "Desc");
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(item.href) ?? false;

          return (
            <Tooltip key={item.href} content={desc} side="right">
              <Link
                href={item.href}
                onClick={onNavClick}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group ${
                  isActive
                    ? "bg-brand-500/10 text-brand-400 border border-brand-500/20"
                    : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 border border-transparent"
                }`}
              >
                <Icon className="size-4 flex-shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                <span className="truncate">{label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                )}
              </Link>
            </Tooltip>
          );
        })}

        <div className="mt-auto pt-6 px-3">
          <div className="border-t border-surface-700/50 pt-4">
            <p className="text-[10px] text-surface-600 uppercase tracking-widest">
              {tc("version")}
            </p>
            <p className="text-[10px] text-surface-600 mt-1">
              {tc("paperMode")}
            </p>
          </div>
        </div>
      </nav>
    </aside>
  );
}
