"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import clsx from "clsx";
import { Menu } from "lucide-react";
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

  // ── Mobile sidebar overlay state ──
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      {/* Mobile hamburger menu button (visible only < 768px) */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 w-10 h-10 flex items-center justify-center rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex flex-1 overflow-hidden relative" ref={containerRef}>
        {/* Desktop sidebar (hidden on mobile, 52px collapsed on tablet 768-1024px, full width on desktop) */}
        <aside
          className={clsx(
            "flex-shrink-0 border-r border-border bg-[var(--bg-surface)] hidden md:flex flex-col transition-all duration-200 ease-out overflow-hidden",
            sidebarOpen ? "md:w-[52px] lg:w-[220px]" : "w-[52px]"
          )}
        >
          {sidebar}
        </aside>

        {/* Mobile sidebar overlay (visible only < 768px when mobileMenuOpen) */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Sidebar panel — pass close handler via props injection pattern */}
            <aside className="md:hidden fixed inset-y-0 left-0 w-[280px] z-50 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex flex-col overflow-hidden shadow-2xl">
              {sidebar && typeof sidebar === 'object' && 'type' in sidebar
                ? {
                    ...sidebar,
                    props: { ...sidebar.props, onCloseMobileMenu: () => setMobileMenuOpen(false) }
                  }
                : sidebar}
            </aside>
          </>
        )}

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

        {/* Drag handle between chat and artifacts (desktop only) */}
        {showArtifacts && (
          <div
            onMouseDown={onDragStart}
            className="hidden lg:block w-[6px] flex-shrink-0 cursor-col-resize group flex items-center justify-center relative z-10"
          >
            <div className="w-[3px] h-12 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--accent)] transition-colors" />
          </div>
        )}

        {/* Artifacts Panel — responsive behavior:
            - Mobile (< 768px): hidden (artifacts open in full-screen modal instead)
            - Tablet (768-1024px): overlay mode, slides in from right
            - Desktop (>= 1024px): flex split with drag handle
        */}
        {showArtifacts && (
          <>
            {/* Desktop: flex layout with resizable split */}
            <aside
              className="hidden lg:flex min-w-[320px] flex-col overflow-hidden border-l border-[var(--border-subtle)]"
              style={{ flex: artifactFlex }}
            >
              <ArtifactsPanel />
            </aside>

            {/* Tablet: overlay mode (absolute positioned, slides in from right) */}
            <aside className="hidden md:flex lg:hidden fixed inset-y-0 right-0 w-[420px] z-30 flex-col overflow-hidden border-l border-[var(--border-subtle)] shadow-2xl animate-slide-in-right">
              <ArtifactsPanel />
            </aside>
          </>
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
