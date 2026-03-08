"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { useTranslation } from '@/lib/i18n';
import { usePulseStore } from "@/store/usePulseStore.new";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface UsageData {
  last7Days: { totalTokens: number; costUsd?: number; avgPerDay: number; byDay: { date: string; totalTokens: number; totalDurationMs?: number }[] };
  last7DaysTime?: { totalDurationMs: number; avgDurationMs: number; calls: number; byDay: { date: string; totalDurationMs: number }[] };
  last30Days: { totalTokens: number; costUsd?: number };
  last30DaysTime?: { totalDurationMs: number; avgDurationMs: number; calls: number };
  peakDay: { date: string; totalTokens: number } | null;
  byAgent: { agentName: string; totalTokens: number; costUsd?: number; percentage: number; totalDurationMs?: number; avgDurationMs?: number; calls?: number }[];
  byAccount?: { accountId: string; accountName: string; totalTokens: number; costUsd?: number; percentage: number; totalDurationMs?: number; avgDurationMs?: number; calls?: number }[];
  signalUsage?: {
    totalTokens7d: number;
    totalTokens30d: number;
    costUsd7d?: number;
    costUsd30d?: number;
    totalDurationMs7d?: number;
    totalDurationMs30d?: number;
    avgDurationMs7d?: number;
    avgDurationMs30d?: number;
    calls7d?: number;
    calls30d?: number;
    byAgent: { agentName: string; totalTokens: number }[];
  };
  projectUsage?: {
    totalTokens7d: number;
    totalTokens30d: number;
    costUsd7d?: number;
    costUsd30d?: number;
    totalDurationMs7d?: number;
    totalDurationMs30d?: number;
    avgDurationMs7d?: number;
    avgDurationMs30d?: number;
    calls7d?: number;
    calls30d?: number;
  };
  cacheHitRate: number | null;
}

const AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;

function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}b`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function formatDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCost(usd: number): string {
  if (usd <= 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms || 0));
  if (safe < 1000) return `${safe}ms`;
  if (safe < 60_000) return `${(safe / 1000).toFixed(safe < 10_000 ? 1 : 0)}s`;
  const min = Math.floor(safe / 60_000);
  const sec = Math.floor((safe % 60_000) / 1000);
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hour = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hour}h ${remMin}m` : `${hour}h`;
}

export function UsageSnapshotCard() {
  const projects = usePulseStore((s) => s.projects);
  const [projectId, setProjectId] = useState<string>("");
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<"tokens" | "time" | "cost">("tokens");

  const { t } = useTranslation();

  const AGENT_LABELS: Record<string, string> = {
    'signal-screener': t('usage.agent.signalScreener'),
    'signal_screener': t('usage.agent.signalScreener'),
    'researcher': t('usage.agent.researcher'),
    'knowledge_curator': t('usage.agent.knowledgeCurator'),
    'knowledge-curator': t('usage.agent.knowledgeCurator'),
    'blue_team': t('usage.agent.blueTeam'),
    'blue-team': t('usage.agent.blueTeam'),
    'critic': t('usage.agent.critic'),
    'arbitrator': t('usage.agent.arbitrator'),
    'decision_maker': t('usage.agent.decisionMaker'),
    'decision-maker': t('usage.agent.decisionMaker'),
  };

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const url = projectId
        ? `/api/usage?projectId=${encodeURIComponent(projectId)}`
        : "/api/usage";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setLastFetched(new Date());
      }
    } catch (e) {
      console.error("Failed to fetch usage:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchUsage();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchUsage]);

  const ago =
    lastFetched != null
      ? Math.max(0, Math.floor((Date.now() - lastFetched.getTime()) / 1000))
      : null;

  const isTimeView = viewMode === "time";
  const chartData =
    isTimeView
      ? data?.last7DaysTime?.byDay?.map((d) => ({
          date: formatDate(d.date),
          fullDate: d.date,
          value: d.totalDurationMs,
        })) ?? []
      : data?.last7Days?.byDay?.map((d) => ({
          date: formatDate(d.date),
          fullDate: d.date,
          value: d.totalTokens,
        })) ?? [];

  const topAgentsByTime = [...(data?.byAgent || [])]
    .sort((a, b) => (b.totalDurationMs || 0) - (a.totalDurationMs || 0))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-cyan-400" />
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{t('usage.title')}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {viewMode === 'cost' ? t('usage.descCost') : viewMode === 'time' ? t('usage.descTime') : t('usage.descTokens')}{t('usage.descSuffix')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {ago !== null && (
            <span className="text-xs text-zinc-500">
              Updated {ago}s ago
            </span>
          )}
          <button
            onClick={() => fetchUsage()}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
            title={t('usage.refresh')}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
            PROJECT
          </span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
          >
            <option value="">{t('usage.allProjects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
            VIEW
          </span>
          <div className="flex rounded-lg overflow-hidden border border-zinc-700">
            <button
              onClick={() => setViewMode("tokens")}
              className={viewMode === "tokens" ? "bg-zinc-700 text-zinc-100 px-3 py-1.5 text-xs font-medium" : "bg-zinc-800/50 text-zinc-500 px-3 py-1.5 text-xs font-medium hover:text-zinc-300"}
            >
              TOKENS
            </button>
            <button
              onClick={() => setViewMode("time")}
              className={viewMode === "time" ? "bg-zinc-700 text-zinc-100 px-3 py-1.5 text-xs font-medium" : "bg-zinc-800/50 text-zinc-500 px-3 py-1.5 text-xs font-medium hover:text-zinc-300"}
              title={t('usage.switchToTime')}
            >
              TIME
            </button>
            <button
              onClick={() => setViewMode("cost")}
              className={viewMode === "cost" ? "bg-zinc-700 text-zinc-100 px-3 py-1.5 text-xs font-medium" : "bg-zinc-800/50 text-zinc-500 px-3 py-1.5 text-xs font-medium hover:text-zinc-300"}
              title={t('usage.switchToCost')}
            >
              COST
            </button>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        </div>
      ) : data ? (
        <>
          {viewMode === "cost" ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                    {t('usage.cost7d')}
                  </div>
                  <div className="text-xl font-bold text-emerald-400">
                    {formatCost(data.last7Days.costUsd ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {formatTokens(data.last7Days.totalTokens)} tokens
                  </div>
                </div>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                    {t('usage.cost30d')}
                  </div>
                  <div className="text-xl font-bold text-emerald-400">
                    {formatCost(data.last30Days.costUsd ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {formatTokens(data.last30Days.totalTokens)} tokens
                  </div>
                </div>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                    {t('usage.costSignal')}
                  </div>
                  <div className="text-xl font-bold text-emerald-400">
                    {formatCost(data.signalUsage?.costUsd30d ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    7d: {formatCost(data.signalUsage?.costUsd7d ?? 0)}
                  </div>
                </div>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                    {t('usage.costProject')}
                  </div>
                  <div className="text-xl font-bold text-emerald-400">
                    {formatCost(data.projectUsage?.costUsd30d ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    7d: {formatCost(data.projectUsage?.costUsd7d ?? 0)}
                  </div>
                </div>
              </div>

              {/* Per-Agent Cost Breakdown */}
              <div className="bg-zinc-900/80 border border-emerald-900/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                    {t('usage.costByAgent')}
                  </div>
                </div>
                {data.byAgent.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t('usage.noAgentData')}</p>
                ) : (
                  <div className="space-y-2">
                    {data.byAgent.filter((a) => (a.costUsd ?? 0) > 0).slice(0, 10).map((a) => (
                      <div key={a.agentName} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-zinc-300 font-mono truncate max-w-[140px]">
                            {a.agentName}
                          </span>
                          {AGENT_LABELS[a.agentName] && (
                            <span className="text-[10px] text-zinc-600 shrink-0">
                              {AGENT_LABELS[a.agentName]}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-emerald-400 font-medium">
                            {formatCost(a.costUsd ?? 0)}
                          </span>
                          <span className="text-zinc-500 text-xs w-10 text-right">
                            {a.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-Account Cost Breakdown */}
              {data.byAccount && data.byAccount.length > 0 && (
                <div className="bg-zinc-900/80 border border-violet-900/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-violet-400" />
                    <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                      {t('usage.costByAccount')}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {data.byAccount.map((a) => (
                      <div key={a.accountId} className="flex items-center justify-between text-sm">
                        <span className="text-violet-300/80 font-mono truncate max-w-[180px]">
                          {a.accountName}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-emerald-400 font-medium">
                            {formatCost(a.costUsd ?? 0)}
                          </span>
                          <span className="text-zinc-500 text-xs w-10 text-right">
                            {a.percentage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : viewMode === "time" ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                    LAST 7 DAYS
                  </div>
                  <div className="text-xl font-bold text-zinc-100">
                    {formatDuration(data.last7DaysTime?.totalDurationMs ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Avg {formatDuration(data.last7DaysTime?.avgDurationMs ?? 0)} / call · {data.last7DaysTime?.calls ?? 0} calls
                  </div>
                </div>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                    LAST 30 DAYS
                  </div>
                  <div className="text-xl font-bold text-zinc-100">
                    {formatDuration(data.last30DaysTime?.totalDurationMs ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Avg {formatDuration(data.last30DaysTime?.avgDurationMs ?? 0)} / call · {data.last30DaysTime?.calls ?? 0} calls
                  </div>
                </div>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                    {t('usage.signalUsageTime')}
                  </div>
                  <div className="text-xl font-bold text-zinc-100">
                    {formatDuration(data.signalUsage?.totalDurationMs30d ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    7d: {formatDuration(data.signalUsage?.totalDurationMs7d ?? 0)} · Avg {formatDuration(data.signalUsage?.avgDurationMs30d ?? 0)}
                  </div>
                </div>
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                  <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                    {t('usage.projectUsageTime')}
                  </div>
                  <div className="text-xl font-bold text-zinc-100">
                    {formatDuration(data.projectUsage?.totalDurationMs30d ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    7d: {formatDuration(data.projectUsage?.totalDurationMs7d ?? 0)} · Avg {formatDuration(data.projectUsage?.avgDurationMs30d ?? 0)}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-4">
                  {t('usage.dailyTime7d')}
                </div>
                {chartData.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
                    {t('common.noData')}
                  </div>
                ) : (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "#71717a" }}
                          axisLine={{ stroke: "#3f3f46" }}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={(v) => formatDuration(v)}
                          tick={{ fontSize: 11, fill: "#71717a" }}
                          axisLine={false}
                          tickLine={false}
                          width={56}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0]?.payload;
                            if (!item) return null;
                            return (
                              <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-lg">
                                <p className="text-xs text-zinc-400 mb-0.5">{item.fullDate}</p>
                                <p className="text-sm font-semibold text-zinc-100">{formatDuration(item.value)}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                          {chartData.map((entry) => (
                            <Cell
                              key={entry.fullDate}
                              fill={entry.value > 0 ? "#22d3ee" : "#3f3f46"}
                              opacity={entry.value > 0 ? 0.9 : 0.5}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-4">
                  {t('usage.topAgentsTime')}
                </div>
                {topAgentsByTime.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t('usage.noAgentTimeData')}</p>
                ) : (
                  <div className="space-y-2">
                    {topAgentsByTime.map((a) => (
                      <div key={a.agentName} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-zinc-300 font-mono truncate max-w-[140px]">
                            {a.agentName}
                          </span>
                          {AGENT_LABELS[a.agentName] && (
                            <span className="text-[10px] text-zinc-600 shrink-0">
                              {AGENT_LABELS[a.agentName]}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-zinc-400">
                            {formatDuration(a.totalDurationMs ?? 0)}
                          </span>
                          <span className="text-zinc-500 text-xs">
                            {formatDuration(a.avgDurationMs ?? 0)}/call
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {data.byAccount && data.byAccount.length > 0 && (
                <div className="bg-zinc-900/80 border border-violet-900/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-violet-400" />
                    <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                      {t('usage.byAccountTime')}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {data.byAccount.map((a) => (
                      <div key={a.accountId} className="flex items-center justify-between text-sm">
                        <span className="text-violet-300/80 font-mono truncate max-w-[180px]">
                          {a.accountName}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-zinc-400">
                            {formatDuration(a.totalDurationMs ?? 0)}
                          </span>
                          <span className="text-zinc-500 text-xs">
                            {formatDuration(a.avgDurationMs ?? 0)}/call
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                LAST 7 DAYS
              </div>
              <div className="text-xl font-bold text-zinc-100">
                {formatTokens(data.last7Days.totalTokens)} TOKENS
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Avg {formatTokens(data.last7Days.avgPerDay)} / day
              </div>
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                LAST 30 DAYS
              </div>
              <div className="text-xl font-bold text-zinc-100">
                {formatTokens(data.last30Days.totalTokens)} TOKENS
              </div>
              <div className="text-xs text-zinc-500 mt-0.5 font-mono">
                Total {data.last30Days.totalTokens.toLocaleString()}
              </div>
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                {t('usage.signalUsage')}
              </div>
              <div className="text-xl font-bold text-zinc-100">
                {formatTokens(data.signalUsage?.totalTokens30d ?? 0)} TOKENS
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                7d: {formatTokens(data.signalUsage?.totalTokens7d ?? 0)} · {t('usage.share')} {data.last30Days.totalTokens > 0 ? Math.round(((data.signalUsage?.totalTokens30d ?? 0) / data.last30Days.totalTokens) * 100) : 0}%
              </div>
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">
                {t('usage.projectUsage')}
              </div>
              <div className="text-xl font-bold text-zinc-100">
                {formatTokens(data.projectUsage?.totalTokens30d ?? 0)} TOKENS
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                7d: {formatTokens(data.projectUsage?.totalTokens7d ?? 0)} · {t('usage.share')} {data.last30Days.totalTokens > 0 ? Math.round(((data.projectUsage?.totalTokens30d ?? 0) / data.last30Days.totalTokens) * 100) : 0}%
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-4">
              {t('usage.dailyUsage7d')}
            </div>
            {chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
                {t('common.noData')}
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      axisLine={{ stroke: "#3f3f46" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => formatTokens(v)}
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const item = payload[0]?.payload;
                        if (!item || item.value === 0) return null;
                        return (
                          <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-lg">
                            <p className="text-xs text-zinc-400 mb-0.5">{item.fullDate}</p>
                            <p className="text-sm font-semibold text-zinc-100">{formatTokens(item.value)} <span className="text-zinc-400 font-normal">Tokens</span></p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.fullDate}
                          fill={entry.value > 0 ? "#22d3ee" : "#3f3f46"}
                          opacity={entry.value > 0 ? 0.9 : 0.5}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Signal Intelligence Usage Detail */}
          <div className="bg-zinc-900/80 border border-amber-900/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                {t('usage.signalTokenDetail')}
              </div>
              <span className="text-[10px] text-zinc-600 ml-auto">
                {t('usage.signalStages')}
              </span>
            </div>
            {(data.signalUsage?.byAgent?.length ?? 0) === 0 ? (
              <p className="text-sm text-zinc-500">
                {t('usage.noSignalData')}
              </p>
            ) : (
              <div className="space-y-2">
                {data.signalUsage!.byAgent.map((a) => (
                  <div
                    key={a.agentName}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-amber-300/80 font-mono truncate max-w-[140px]">
                        {a.agentName}
                      </span>
                      {AGENT_LABELS[a.agentName] && (
                        <span className="text-[10px] text-zinc-600 shrink-0">
                          {AGENT_LABELS[a.agentName]}
                        </span>
                      )}
                    </div>
                    <span className="text-zinc-400 shrink-0">
                      {formatTokens(a.totalTokens)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-between text-xs">
              <span className="text-zinc-500">{t('usage.signalTotal30d')}</span>
              <span className="text-amber-400 font-semibold">
                {formatTokens(data.signalUsage?.totalTokens30d ?? 0)}
              </span>
            </div>
          </div>

          {/* Per-Account Breakdown */}
          {data.byAccount && data.byAccount.length > 0 && (
            <div className="bg-zinc-900/80 border border-violet-900/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-violet-400" />
                <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                  {t('usage.byAccount')}
                </div>
              </div>
              <div className="space-y-2">
                {data.byAccount.map((a) => (
                  <div
                    key={a.accountId}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-violet-300/80 font-mono truncate max-w-[180px]">
                        {a.accountName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-zinc-400">
                        {formatTokens(a.totalTokens)}
                      </span>
                      <span className="text-zinc-500 text-xs w-10 text-right">
                        {a.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Agents */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
            <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-4">
              {t('usage.topAgentsAll')}
            </div>
            {data.byAgent.length === 0 ? (
              <p className="text-sm text-zinc-500">{t('usage.noAgentData')}</p>
            ) : (
              <div className="space-y-2">
                {data.byAgent.slice(0, 8).map((a) => (
                  <div
                    key={a.agentName}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-300 font-mono truncate max-w-[140px]">
                        {a.agentName}
                      </span>
                      {AGENT_LABELS[a.agentName] && (
                        <span className="text-[10px] text-zinc-600 shrink-0">
                          {AGENT_LABELS[a.agentName]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-zinc-400">
                        {formatTokens(a.totalTokens)}
                      </span>
                      <span className="text-zinc-500 text-xs w-10 text-right">
                        {a.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
            </>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-zinc-500 text-sm">
          {t('usage.loadFailed')}
        </div>
      )}
    </div>
  );
}
