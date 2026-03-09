"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Database,
  Copy,
  Download,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

interface SqlExportSectionProps {
  embedded?: boolean;
  onStatusChange?: (ready: boolean) => void;
}

export function SqlExportSection({ embedded = false, onStatusChange }: SqlExportSectionProps) {
  const { t } = useTranslation();
  const [sql, setSql] = useState("");
  const [fileCount, setFileCount] = useState(0);
  const [totalLines, setTotalLines] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    onStatusChange?.(false);
    fetch("/api/settings/sql-export")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setSql(json.data.sql);
          setFileCount(json.data.fileCount);
          setTotalLines(json.data.totalLines);
          onStatusChange?.(true);
        } else {
          setError(json.error || t('sql.loadFailed'));
          onStatusChange?.(false);
        }
      })
      .catch(() => {
        setError(t('sql.networkError'));
        onStatusChange?.(false);
      })
      .finally(() => setLoading(false));
  }, [onStatusChange]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS
      const ta = document.createElement("textarea");
      ta.value = sql;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [sql]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([sql], { type: "text/sql;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rebuild-schema-full.sql";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sql]);

  return (
    <>
      {embedded ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={clsx(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  !loading && !error ? "bg-emerald-500" : "bg-zinc-600"
                )}
              />
              <label className="text-xs text-zinc-400 font-medium">
                {t('sql.title')}
              </label>
            </div>
            {!loading && !error && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCopy}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                    copied
                      ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                  )}
                >
                  {copied ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? t('sql.copied') : t('sql.copyToClipboard')}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t('sql.downloadSql')}
                </button>
              </div>
            )}
          </div>
          {loading ? (
            <div className="flex items-center gap-2 pl-3.5 py-2 text-zinc-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('sql.loadingSql')}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 pl-3.5 py-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          ) : (
            <div className="pl-3.5 space-y-2">
              <div className="max-h-72 overflow-y-auto p-3 bg-zinc-900 border border-zinc-700 rounded-lg">
                <pre className="text-[11px] leading-relaxed font-mono text-zinc-500 whitespace-pre-wrap break-all">
                  {sql}
                </pre>
              </div>

              <div className="text-[11px] text-zinc-600">
                {t('sql.filesMerged', { count: fileCount })} | {t('sql.lines', { count: totalLines.toLocaleString() })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-paper border border-border rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Database className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-100">
                    {t('sql.title')}
                  </h2>
                </div>
              </div>

              {/* Action buttons */}
              {!loading && !error && (
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                      copied
                        ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                        : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                    )}
                  >
                    {copied ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? t('sql.copied') : t('sql.copyToClipboard')}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('sql.downloadSql')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center gap-2 py-16 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          ) : (
            <>
              {/* SQL preview */}
              <div className="max-h-96 overflow-y-auto p-4 bg-zinc-950/50">
                <pre className="text-[11px] leading-relaxed font-mono text-zinc-500 whitespace-pre-wrap break-all">
                  {sql}
                </pre>
              </div>

              {/* Footer stats */}
              <div className="px-6 py-3 border-t border-border flex items-center justify-between">
                <span className="text-[11px] text-zinc-600">
                  {t('sql.filesMerged', { count: fileCount })} | {t('sql.lines', { count: totalLines.toLocaleString() })}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
