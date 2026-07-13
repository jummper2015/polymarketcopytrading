"use client";

import { useState, useCallback, useEffect } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";

export function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // Close sidebar on Escape key press
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, closeSidebar]);

  return (
    <>
      <Navbar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />
      <div className="flex pt-14">
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-14 z-30 bg-black/50 md:hidden"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}
        <Sidebar
          isMobileOpen={sidebarOpen}
          onNavClick={closeSidebar}
        />
        <main className="flex-1 ml-0 md:ml-56 min-h-[calc(100vh-3.5rem)] p-4 md:p-6">
          {children}
        </main>
      </div>
    </>
  );
}
