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
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-zinc-400" />
          <h1 className="text-lg font-semibold">{t('graph.title')}</h1>
          {data && (
            <span className="text-xs text-zinc-500">
              {data.nodes.length} nodes · {data.edges.length} edges
            </span>
          )}
        </div>
        <button
          onClick={fetchGraph}
          disabled={loading}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors",
            "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50",
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
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-zinc-400 text-sm">{error}</p>
            <button
              onClick={fetchGraph}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {t('graph.retry')}
            </button>
          </div>
        ) : data && data.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Network className="w-12 h-12 text-zinc-700" />
            <p className="text-zinc-500 text-sm">{t('graph.empty')}</p>
          </div>
        ) : data ? (
          <VaultGraph data={data} />
        ) : null}
      </div>
    </div>
  );
}
