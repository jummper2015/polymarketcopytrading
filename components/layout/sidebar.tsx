"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: "Overview", href: "/", icon: "📊" },
  { label: "Rankings", href: "/rankings", icon: "🏆" },
  { label: "Signals", href: "/signals", icon: "🔔" },
  { label: "Paper Trades", href: "/paper-trades", icon: "📋" },
  { label: "Backtesting", href: "/backtesting", icon: "🧪" },
  { label: "Journal", href: "/journal", icon: "📓" },
  { label: "Performance", href: "/performance", icon: "📈" },
  { label: "Rules", href: "/rules", icon: "🧠" },
  { label: "Reports", href: "/reports", icon: "📄" },
];

interface SidebarProps {
  /** Whether the sidebar is toggled open on mobile */
  isMobileOpen: boolean;
  /** Called when a nav link is clicked — closes sidebar on mobile */
  onNavClick: () => void;
}

export function Sidebar({ isMobileOpen, onNavClick }: SidebarProps) {
  const pathname = usePathname();

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
        {/* Navigation header */}
        <div className="px-3 py-2 mb-2">
          <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-widest">
            Navigation
          </p>
        </div>

        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(item.href) ?? false;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 group ${
                isActive
                  ? "bg-brand-500/10 text-brand-400 border border-brand-500/20"
                  : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 border border-transparent"
              }`}
            >
              <span className="text-base flex-shrink-0" aria-hidden="true">{item.icon}</span>
              <span className="truncate">{item.label}</span>

              {/* Active indicator */}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
              )}
            </Link>
          );
        })}

        {/* Footer section */}
        <div className="mt-auto pt-6 px-3">
          <div className="border-t border-surface-700/50 pt-4">
            <p className="text-[10px] text-surface-600 uppercase tracking-widest">
              Hermes v1.0
            </p>
            <p className="text-[10px] text-surface-600 mt-1">
              Paper Trading Mode
            </p>
          </div>
        </div>
      </nav>
    </aside>
  );
}
