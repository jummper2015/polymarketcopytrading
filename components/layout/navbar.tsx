"use client";

import { Menu, X, Brain } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusDot } from "@/components/ui/status-dot";
import { ThemeToggle } from "@/components/theme-toggle";

interface NavbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Navbar({ sidebarOpen, onToggleSidebar }: NavbarProps) {
  const t = useTranslations("common");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-surface-700/50 bg-surface-900/90 backdrop-blur-md">
      <div className="flex items-center justify-between h-full px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 transition-colors"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          <div className="flex items-center gap-2">
            <Brain className="size-5 text-brand-400" strokeWidth={2.5} />
            <h1 className="text-base font-bold tracking-tight text-surface-50">
              MESIRVE
            </h1>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
            <StatusDot variant="watch" size="sm" pulse />
            <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
              {t("simulation")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <span className="text-xs text-surface-500 hidden md:block">
            {t("polymarketBot")}
          </span>
        </div>
      </div>
    </header>
  );
}
