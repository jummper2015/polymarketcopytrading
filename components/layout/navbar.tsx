"use client";

import { StatusDot } from "@/components/ui/status-dot";

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-surface-700/50 bg-surface-900/90 backdrop-blur-md">
      <div className="flex items-center justify-between h-full px-6">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-3">
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
          {/* Current date/time would go here in future */}
          <span className="text-xs text-surface-500 hidden md:block">
            Polymarket Copy Trading Bot
          </span>
        </div>
      </div>
    </header>
  );
}
