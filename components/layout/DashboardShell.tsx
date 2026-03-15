"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { PanelLeft } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

interface DashboardShellProps {
  sidebar?: React.ReactNode;
  main: React.ReactNode;
  rightPanel?: React.ReactNode;
  studioPanel?: React.ReactNode;
  bottomBar?: React.ReactNode;
  sidebarOpen?: boolean;
  rightPanelOpen?: boolean;
  studioPanelOpen?: boolean;
  onToggleSidebar?: () => void;
}

const STUDIO_MIN_W = 360;
const STUDIO_MAX_W = 960;
const STUDIO_DEFAULT_W = 580;

export function DashboardShell({
  sidebar,
  main,
  rightPanel,
  studioPanel,
  bottomBar,
  sidebarOpen = true,
  rightPanelOpen = true,
  studioPanelOpen = false,
  onToggleSidebar,
}: DashboardShellProps) {
  const { t } = useTranslation();

  // rightPanel takes priority over studioPanel (mutually exclusive display)
  const showRightPanel = rightPanel && rightPanelOpen;
  const showStudio = !showRightPanel && studioPanel && studioPanelOpen;

  // ── Resizable studio panel state ──
  const [studioWidth, setStudioWidth] = useState(STUDIO_DEFAULT_W);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = studioWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [studioWidth],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // Dragging the divider left → panel grows, right → shrinks
      const delta = startX.current - e.clientX;
      const next = Math.min(STUDIO_MAX_W, Math.max(STUDIO_MIN_W, startW.current + delta));
      setStudioWidth(next);
    };

    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

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
        <main
          data-workspace-root="true"
          className={clsx(
            "flex-1 min-w-0 flex flex-col overflow-y-auto relative transition-[padding] duration-300",
            !sidebarOpen && onToggleSidebar && "pl-14"
          )}
        >
          {/* Floating sidebar toggle when collapsed */}
          {!sidebarOpen && onToggleSidebar && (
            <div className="absolute top-3 left-3 z-50 flex items-center">
              <button
                onClick={onToggleSidebar}
                className="p-2 text-zinc-300 bg-zinc-900/85 border border-zinc-700/60 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg shadow-sm backdrop-blur-sm transition-colors"
                title={t('shell.openSidebar')}
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            </div>
          )}
          {main}
        </main>

        {/* Right Panel (agent panels — takes priority) */}
        {showRightPanel && (
          <aside className="w-[420px] flex-shrink-0 border-l border-border bg-black hidden lg:flex flex-col">
            {rightPanel}
          </aside>
        )}

        {/* Studio Panel (skill browser — resizable) */}
        {showStudio && (
          <>
            {/* Drag handle */}
            <div
              onMouseDown={onDragStart}
              className="w-1 flex-shrink-0 cursor-col-resize group hidden lg:flex items-center justify-center relative z-10 hover:bg-zinc-600/40 active:bg-zinc-500/50 transition-colors"
            >
              {/* Visual indicator line */}
              <div className="w-[2px] h-12 rounded-full bg-zinc-700 group-hover:bg-zinc-500 group-active:bg-zinc-400 transition-colors" />
            </div>
            <aside
              className="flex-shrink-0 bg-black hidden lg:flex flex-col overflow-hidden"
              style={{ width: studioWidth }}
            >
              {studioPanel}
            </aside>
          </>
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
