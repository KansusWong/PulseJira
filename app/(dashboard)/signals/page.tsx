"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Radio,
  RefreshCw,
  Loader2,
  Inbox,
  Satellite,
  Archive,
  ArrowLeft,
} from "lucide-react";
import { SignalCard, type Signal } from "@/components/signals/SignalCard";
import { SignalDetailDrawer } from "@/components/signals/SignalDetailDrawer";
import { usePulseStore } from "@/store/usePulseStore.new";
import type { Project } from "@/projects/types";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

type FilterTab = "all" | string;

type SignalsApiMeta = {
  mode?: "live" | "demo";
  is_demo?: boolean;
  message?: string;
};

export default function SignalsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const addProject = usePulseStore((s) => s.addProject);
  const setProjects = usePulseStore((s) => s.setProjects);
  const addConversation = usePulseStore((s) => s.addConversation);
  const setActiveConversationId = usePulseStore((s) => s.setActiveConversationId);
  const showClarificationForm = usePulseStore((s) => s.showClarificationForm);

  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [tab, setTab] = useState<FilterTab>("all");
  const [liveCount, setLiveCount] = useState(0);
  const [showRejected, setShowRejected] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [signalsMode, setSignalsMode] = useState<"live" | "demo">("live");
  const [signalsMessage, setSignalsMessage] = useState<string | null>(null);
  const [discussingIds, setDiscussingIds] = useState<Set<string>>(new Set());

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Fetch signals
  // -----------------------------------------------------------------------
  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch("/api/signals");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        const meta = (json.meta || {}) as SignalsApiMeta;
        setSignals(json.data || []);
        setSignalsMode(meta.mode === "demo" || meta.is_demo ? "demo" : "live");
        setSignalsMessage(meta.message || null);
      }
    } catch {
      // ignore
    }
  }, []);

  // -----------------------------------------------------------------------
  // Refresh project list in sidebar
  // -----------------------------------------------------------------------
  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const backendProjects: Project[] = json.data;
        const backendIds = new Set(backendProjects.map((p) => p.id));
        const currentProjects = usePulseStore.getState().projects;
        const localOnly = currentProjects.filter(
          (p) => p.id.startsWith("local-") && !backendIds.has(p.id)
        );
        setProjects([...backendProjects, ...localOnly]);
      }
    } catch {
      // ignore
    }
  }, [setProjects]);

  useEffect(() => {
    setLoading(true);
    fetchSignals().finally(() => setLoading(false));
  }, [fetchSignals]);

  // -----------------------------------------------------------------------
  // SSE real-time push
  // -----------------------------------------------------------------------
  useEffect(() => {
    const es = new EventSource("/api/signals/stream");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const signal: Signal = JSON.parse(event.data);
        setSignals((prev) => {
          if (prev.some((s) => s.id === signal.id)) return prev;
          setLiveCount((c) => c + 1);
          return [signal, ...prev];
        });
      } catch {
        // skip non-JSON messages (keepalive pings)
      }
    };

    es.onerror = () => {};

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Manual refresh — fire-and-forget + polling
  // -----------------------------------------------------------------------
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setElapsedSec(0);

    timerRef.current = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);

    pollRef.current = setInterval(() => {
      fetchSignals();
    }, 5000);

    try {
      await fetch("/api/cron/collect-signals", { method: "POST" });
      await fetchSignals();
      await refreshProjects();
    } finally {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRefreshing(false);
    }
  };

  // -----------------------------------------------------------------------
  // Quick Discuss — queue-jump into red/blue team analysis
  // -----------------------------------------------------------------------
  const handleQuickDiscuss = async (signalId: string) => {
    setDiscussingIds((prev) => new Set(prev).add(signalId));
    setSignals((prev) =>
      prev.map((s) =>
        s.id === signalId
          ? {
              ...s,
              status: "PROCESSING",
              metadata: {
                ...(s.metadata || {}),
                quick_discuss: {
                  state: "running",
                  started_at: new Date().toISOString(),
                },
              },
            }
          : s
      )
    );

    try {
      const res = await fetch(`/api/signals/${signalId}/quick-discuss`, {
        method: "POST",
      });
      if (!res.ok) {
        console.error(`[QuickDiscuss] API returned ${res.status}`);
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        const updatedSignal = json.data.signal as Signal;
        if (json.data.project) {
          addProject(json.data.project);
          await refreshProjects();
        }
        setSignals((prev) =>
          prev.map((s) => (s.id === signalId ? updatedSignal : s))
        );
        setSelectedSignal((prev) =>
          prev?.id === signalId ? updatedSignal : prev
        );
      }
    } catch (e) {
      console.error("[QuickDiscuss] Error:", e);
    } finally {
      setDiscussingIds((prev) => {
        const next = new Set(prev);
        next.delete(signalId);
        return next;
      });
    }
  };

  // -----------------------------------------------------------------------
  // Reject signal
  // -----------------------------------------------------------------------
  const handleReject = async (signalId: string) => {
    await fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signalId, action: "reject" }),
    });
    setSignals((prev) =>
      prev.map((s) =>
        s.id === signalId ? { ...s, status: "REJECTED" as const } : s
      )
    );
    setSelectedSignal(null);
  };

  // -----------------------------------------------------------------------
  // Restore rejected signal → DRAFT
  // -----------------------------------------------------------------------
  const handleRestore = async (signalId: string) => {
    const res = await fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signalId, action: "restore" }),
    });
    if (res.ok) {
      setSignals((prev) =>
        prev.map((s) =>
          s.id === signalId ? { ...s, status: "DRAFT" as const } : s
        )
      );
      setSelectedSignal(null);
    }
  };

  // -----------------------------------------------------------------------
  // Execute — launch L3 DM → Architect pipeline from PROCEED signal
  // -----------------------------------------------------------------------
  const handleExecute = async (signalId: string) => {
    try {
      const res = await fetch(`/api/signals/${signalId}/execute`, {
        method: "POST",
      });
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success) return;

      const { conversation_id, project_id, requirements } = json.data;

      // Add conversation to store
      addConversation({
        id: conversation_id,
        title: requirements.suggested_name || 'Signal Execution',
        status: 'active',
        project_id,
        complexity_assessment: {
          complexity_level: 'L3',
          execution_mode: 'agent_team',
          rationale: 'Signal pipeline — auto-routed to L3 agent team',
          suggested_agents: [],
          estimated_steps: 0,
          plan_outline: [],
          requires_project: true,
          requires_clarification: false,
        },
        execution_mode: 'agent_team',
        structured_requirements: requirements,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Activate conversation + show ClarificationForm with pre-filled requirements
      setActiveConversationId(conversation_id);
      showClarificationForm(requirements);

      // Close drawer + navigate to chat
      setSelectedSignal(null);
      router.push('/');
    } catch (e) {
      console.error('[Execute] Error:', e);
    }
  };

  // -----------------------------------------------------------------------
  // Filter
  // -----------------------------------------------------------------------
  const filtered =
    tab === "all" ? signals : signals.filter((s) => s.platform === tab);

  const platformTabs = useMemo<FilterTab[]>(() => {
    const platforms = Array.from(
      new Set(
        signals
          .map((signal) => signal.platform || "")
          .filter((platform) => platform.trim().length > 0)
      )
    );

    const preferredOrder = ["reddit", "twitter", "youtube", "generic-web"];
    const sorted = [
      ...preferredOrder.filter((platform) => platforms.includes(platform)),
      ...platforms
        .filter((platform) => !preferredOrder.includes(platform))
        .sort((a, b) => a.localeCompare(b)),
    ];

    return ["all", ...sorted];
  }, [signals]);

  const actionableSignals = filtered.filter(
    (s) =>
      s.status === "DRAFT" ||
      s.status === "PROCESSING" ||
      s.status === "ANALYZED"
  );

  const rejectedSignals = filtered.filter((s) => s.status === "REJECTED");

  const displayedSignals = showRejected ? rejectedSignals : actionableSignals;

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const fmtTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-bold">Signals</h1>
          {liveCount > 0 && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
              +{liveCount} live
            </span>
          )}
          <span
            className={clsx(
              "text-[10px] px-2 py-0.5 rounded-full font-mono border",
              signalsMode === "demo"
                ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
            )}
          >
            {signalsMode === "demo" ? "DEMO DATA" : "LIVE DATA"}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition-colors disabled:opacity-60"
        >
          {refreshing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {refreshing ? "Collecting..." : "Refresh"}
        </button>
      </div>

      {/* Collecting banner */}
      {refreshing && (
        <div className="px-6 py-3 border-b border-border bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Satellite className="w-4 h-4 text-emerald-400" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-emerald-300 font-medium">
                {t('signals.collecting')}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {t('signals.collectingHint')}
              </p>
            </div>
            <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
              {fmtTime(elapsedSec)}
            </span>
          </div>
          <div className="mt-2 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/50 rounded-full animate-pulse"
              style={{ width: "100%" }}
            />
          </div>
        </div>
      )}

      {(signalsMode === "demo" || signalsMessage) && (
        <div
          className={clsx(
            "px-6 py-2 border-b text-xs",
            signalsMode === "demo"
              ? "bg-amber-500/10 text-amber-200 border-amber-500/20"
              : "bg-zinc-900 text-zinc-400 border-border"
          )}
        >
          {signalsMode === "demo"
            ? t('signals.demoNotice')
            : signalsMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border">
        {showRejected ? (
          <>
            <button
              onClick={() => setShowRejected(false)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-zinc-400 hover:text-zinc-200 rounded-md transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              {t('signals.back')}
            </button>
            <span className="text-xs font-bold text-red-400 ml-2">
              {t('signals.rejectedSignals')}
            </span>
          </>
        ) : (
          <>
            {platformTabs.map(
              (pt) => (
                <button
                  key={pt}
                  onClick={() => setTab(pt)}
                  className={clsx(
                    "px-3 py-1 text-xs font-bold rounded-md transition-colors",
                    tab === pt
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                  )}
                >
                  {pt === "all"
                    ? "All"
                    : pt === "generic-web"
                    ? "Web"
                    : pt.charAt(0).toUpperCase() + pt.slice(1)}
                </button>
              )
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-3">
          {!showRejected && rejectedSignals.length > 0 && (
            <button
              onClick={() => setShowRejected(true)}
              className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 font-mono transition-colors"
            >
              <Archive className="w-3 h-3" />
              {rejectedSignals.length} rejected
            </button>
          )}
          <span className="text-[10px] text-zinc-600 font-mono">
            {displayedSignals.length}{" "}
            {showRejected ? "rejected" : "actionable"}
          </span>
        </div>
      </div>

      {/* Signal list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
          </div>
        ) : displayedSignals.length === 0 && !refreshing ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="w-12 h-12 text-zinc-800 mb-4" />
            <h2 className="text-lg font-bold text-zinc-500 mb-2">
              {showRejected ? t('signals.noRejected') : "No new signals"}
            </h2>
            <p className="text-xs text-zinc-600 max-w-xs">
              {showRejected
                ? t('signals.allPassedOrPending')
                : "Configure signal sources in Settings, or click Refresh to collect now."}
            </p>
          </div>
        ) : displayedSignals.length === 0 && refreshing ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Satellite className="w-12 h-12 text-zinc-700 mb-4 animate-pulse" />
            <h2 className="text-lg font-bold text-zinc-500 mb-2">
              {t('signals.collectingWait')}
            </h2>
            <p className="text-xs text-zinc-600 max-w-xs">
              {t('signals.collectingDesc')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayedSignals.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                isDiscussing={discussingIds.has(signal.id)}
                onQuickDiscuss={handleQuickDiscuss}
                onReject={handleReject}
                onRestore={showRejected ? handleRestore : undefined}
                onClick={() => setSelectedSignal(signal)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedSignal && (
        <SignalDetailDrawer
          signal={selectedSignal}
          isDiscussing={discussingIds.has(selectedSignal.id)}
          onClose={() => setSelectedSignal(null)}
          onQuickDiscuss={handleQuickDiscuss}
          onReject={handleReject}
          onRestore={
            selectedSignal.status === "REJECTED" ? handleRestore : undefined
          }
          onExecute={handleExecute}
        />
      )}
    </div>
  );
}
