"use client";

import { StatusDot } from "@/components/ui/status-dot";

interface NavbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Navbar({ sidebarOpen, onToggleSidebar }: NavbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-surface-700/50 bg-surface-900/90 backdrop-blur-md">
      <div className="flex items-center justify-between h-full px-4 md:px-6">
        {/* Left: Hamburger + Logo + Title */}
        <div className="flex items-center gap-3">
          {/* Hamburger button — visible only on mobile */}
          <button
            onClick={onToggleSidebar}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800/60 transition-colors"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {sidebarOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xl" role="img" aria-label="Hermes">
              🧠
            </span>
            <h1 className="text-base font-bold tracking-tight text-surface-50">
              Hermes
            </h1>
          </div>

          {/* Simulation mode badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
            <StatusDot variant="watch" size="sm" pulse />
            <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">
              Simulation
            </span>
          </div>
        </div>

        {/* Right: Status info */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-surface-500 hidden md:block">
            Polymarket Copy Trading Bot
          </span>
        </div>
      </div>
    </header>
  );
}
