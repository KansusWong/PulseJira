"use client";

import { PanelLeft, SquarePen } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

interface DashboardShellProps {
  sidebar?: React.ReactNode;
  main: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomBar?: React.ReactNode;
  sidebarOpen?: boolean;
  rightPanelOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function DashboardShell({
  sidebar,
  main,
  rightPanel,
  bottomBar,
  sidebarOpen = true,
  rightPanelOpen = true,
  onToggleSidebar,
}: DashboardShellProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside
          className={clsx(
            "flex-shrink-0 border-r border-border bg-zinc-950 hidden md:flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
            sidebarOpen ? "w-[260px]" : "w-0 border-r-0"
          )}
        >
          {sidebar}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 flex flex-col overflow-y-auto relative">
          {/* Floating sidebar toggle when collapsed */}
          {!sidebarOpen && onToggleSidebar && (
            <div className="absolute top-3 left-3 z-50 flex items-center gap-1">
              <button
                onClick={onToggleSidebar}
                className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                title={t('shell.openSidebar')}
              >
                <PanelLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                title={t('shell.newChat')}
              >
                <SquarePen className="w-5 h-5" />
              </button>
            </div>
          )}
          {main}
        </main>

        {/* Right Panel */}
        {rightPanel && rightPanelOpen && (
          <aside className="w-[350px] flex-shrink-0 border-l border-border bg-black hidden lg:flex flex-col">
            {rightPanel}
          </aside>
        )}
      </div>

      {/* Bottom Bar */}
      {bottomBar && (
        <div className="border-t border-border bg-paper/50 backdrop-blur-sm">
          {bottomBar}
        </div>
      )}
    </div>
  );
}
