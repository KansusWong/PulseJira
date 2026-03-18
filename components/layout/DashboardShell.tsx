"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import clsx from "clsx";
import { usePulseStore } from "@/store/usePulseStore.new";
import { TopBar } from "./TopBar";
import { ArtifactsPanel } from "./ArtifactsPanel";

interface DashboardShellProps {
  sidebar?: React.ReactNode;
  main: React.ReactNode;
  rightPanel?: React.ReactNode;
  studioPanel?: React.ReactNode;       // kept for backward compat — not rendered (Task 15 will remove)
  bottomBar?: React.ReactNode;
  sidebarOpen?: boolean;
  rightPanelOpen?: boolean;
  studioPanelOpen?: boolean;            // kept for backward compat — ignored
  onToggleSidebar?: () => void;
}

export function DashboardShell({
  sidebar,
  main,
  rightPanel,
  // studioPanel accepted but not rendered (stub — Task 15 removes prop entirely)
  studioPanel: _studioPanel,
  bottomBar,
  sidebarOpen = true,
  rightPanelOpen = true,
  // studioPanelOpen accepted but ignored
  studioPanelOpen: _studioPanelOpen,
  onToggleSidebar,
}: DashboardShellProps) {
  // ── Store selectors ──
  const artifactPanelOpen = usePulseStore((s) => s.artifactPanelOpen);
  const closeAllArtifacts = usePulseStore((s) => s.closeAllArtifacts);
  const autoCollapseSidebar = usePulseStore((s) => s.autoCollapseSidebar);
  const autoExpandSidebar = usePulseStore((s) => s.autoExpandSidebar);

  // ── SSE right panel takes priority over artifacts ──
  const showRightPanel = rightPanel && rightPanelOpen;
  const showArtifacts = !showRightPanel && artifactPanelOpen;

  // ── Sidebar auto-collapse on artifact panel open/close ──
  const prevArtifactOpen = useRef(artifactPanelOpen);
  useEffect(() => {
    if (artifactPanelOpen && !prevArtifactOpen.current) {
      autoCollapseSidebar();
    } else if (!artifactPanelOpen && prevArtifactOpen.current) {
      autoExpandSidebar();
    }
    prevArtifactOpen.current = artifactPanelOpen;
  }, [artifactPanelOpen, autoCollapseSidebar, autoExpandSidebar]);

  // ── Esc key handler: close artifacts panel ──
  useEffect(() => {
    if (!artifactPanelOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeAllArtifacts();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [artifactPanelOpen, closeAllArtifacts]);

  // ── Resizable drag handle between chat and artifacts ──
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startChatFlex = useRef(1);
  const startArtifactFlex = useRef(1);
  const [chatFlex, setChatFlex] = useState(1);
  const [artifactFlex, setArtifactFlex] = useState(1);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startChatFlex.current = chatFlex;
      startArtifactFlex.current = artifactFlex;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [chatFlex, artifactFlex],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      if (containerWidth <= 0) return;

      const delta = e.clientX - startX.current;
      const deltaRatio = delta / (containerWidth / 2); // ratio relative to half-width

      const totalFlex = startChatFlex.current + startArtifactFlex.current;
      let nextChat = startChatFlex.current + deltaRatio;
      let nextArtifact = startArtifactFlex.current - deltaRatio;

      // Enforce min-width of 320px: approximate using proportions
      const minFlex = (320 / (containerWidth / totalFlex));
      nextChat = Math.max(minFlex, nextChat);
      nextArtifact = Math.max(minFlex, nextArtifact);

      setChatFlex(nextChat);
      setArtifactFlex(nextArtifact);
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

  // Reset flex when artifacts panel closes / opens
  useEffect(() => {
    if (artifactPanelOpen) {
      setChatFlex(1);
      setArtifactFlex(1);
    }
  }, [artifactPanelOpen]);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden">
      <div className="flex flex-1 overflow-hidden relative" ref={containerRef}>
        {/* Sidebar — always visible: 220px expanded / 52px collapsed */}
        <aside
          className={clsx(
            "flex-shrink-0 border-r border-border bg-[var(--bg-surface)] hidden md:flex flex-col transition-all duration-200 ease-out overflow-hidden",
            sidebarOpen ? "w-[220px]" : "w-[52px]"
          )}
        >
          {sidebar}
        </aside>

        {/* Main Content (Chat area) */}
        <main
          data-workspace-root="true"
          className="min-w-[320px] flex flex-col overflow-hidden relative"
          style={{ flex: showArtifacts ? chatFlex : 1 }}
        >
          <TopBar />
          <div className="flex-1 overflow-y-auto">
            {main}
          </div>
        </main>

        {/* Drag handle between chat and artifacts */}
        {showArtifacts && (
          <div
            onMouseDown={onDragStart}
            className="w-[6px] flex-shrink-0 cursor-col-resize group flex items-center justify-center relative z-10"
          >
            <div className="w-[3px] h-12 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--accent)] transition-colors" />
          </div>
        )}

        {/* Artifacts Panel */}
        {showArtifacts && (
          <aside
            className="min-w-[320px] flex flex-col overflow-hidden border-l border-[var(--border-subtle)]"
            style={{ flex: artifactFlex }}
          >
            <ArtifactsPanel />
          </aside>
        )}

        {/* Right Panel (SSE agent panels -- takes priority over artifacts) */}
        {showRightPanel && (
          <aside className="w-[420px] flex-shrink-0 border-l border-border bg-black hidden lg:flex flex-col">
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
