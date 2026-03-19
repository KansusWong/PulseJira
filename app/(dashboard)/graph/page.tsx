"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Network, RefreshCw } from "lucide-react";
import { VaultGraph, type GraphData } from "@/components/vault/VaultGraph";
import { useTranslation } from "@/lib/i18n";
import clsx from "clsx";

export default function GraphPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/vault-graph");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setData({ nodes: [], edges: [] });
      }
    } catch (err: any) {
      setError(err.message || "Failed to load graph");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-[var(--text-secondary)]" />
          <h1 className="text-lg font-semibold">{t('graph.title')}</h1>
          {data && (
            <span className="text-xs text-[var(--text-muted)]">
              {data.nodes.length} nodes · {data.edges.length} edges
            </span>
          )}
        </div>
        <button
          onClick={fetchGraph}
          disabled={loading}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors",
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
            loading && "opacity-50 cursor-not-allowed"
          )}
        >
          <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
          {t('graph.refresh')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && !data ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-[var(--text-secondary)] text-sm">{error}</p>
            <button
              onClick={fetchGraph}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {t('graph.retry')}
            </button>
          </div>
        ) : data && data.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Network className="w-12 h-12 text-[var(--text-disabled)]" />
            <p className="text-[var(--text-muted)] text-sm">{t('graph.empty')}</p>
          </div>
        ) : data ? (
          <VaultGraph data={data} />
        ) : null}
      </div>
    </div>
  );
}
