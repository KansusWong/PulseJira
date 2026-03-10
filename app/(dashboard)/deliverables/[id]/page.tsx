"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, Copy, Check, Download, ExternalLink } from "lucide-react";
import clsx from "clsx";
import { usePulseStore } from "@/store/usePulseStore.new";
import { useTranslation } from "@/lib/i18n";

interface DeliverableData {
  project: {
    id: string;
    name: string;
    created_at: string;
    conversation_id?: string;
  };
  content: string | null;
  content_created_at: string | null;
}

export default function DeliverablePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const setActiveDeliverable = usePulseStore((s) => s.setActiveDeliverable);
  const setActiveConversationId = usePulseStore((s) => s.setActiveConversationId);

  const [data, setData] = useState<DeliverableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActiveDeliverable(id);
    return () => setActiveDeliverable(null);
  }, [id, setActiveDeliverable]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/deliverables/${id}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.success) {
          setError(json.error || t("deliverable.notFound"));
        } else {
          setData(json.data);
        }
      })
      .catch(() => {
        if (!cancelled) setError(t("deliverable.notFound"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCopy = useCallback(async () => {
    if (!data?.content) return;
    await navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const handleExport = useCallback(
    (format: "md" | "txt") => {
      if (!data?.content) return;
      const ext = format;
      const mime = format === "md" ? "text/markdown" : "text/plain";
      const blob = new Blob([data.content], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.project.name || "deliverable"}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [data]
  );

  const handleOpenConversation = useCallback(() => {
    if (!data?.project.conversation_id) return;
    setActiveConversationId(data.project.conversation_id);
    router.push("/");
  }, [data, setActiveConversationId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-zinc-500">{t("deliverable.loading")}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-zinc-500">{error || t("deliverable.notFound")}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="mt-1 p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-zinc-400 flex-shrink-0" />
            <h1 className="text-lg font-semibold text-zinc-100 truncate">
              {data.project.name}
            </h1>
          </div>
          <div className="mt-1.5 flex items-center gap-4 text-xs text-zinc-500">
            <span>
              {t("deliverable.createdAt")}{" "}
              {new Date(data.project.created_at).toLocaleDateString()}
            </span>
            {data.project.conversation_id && (
              <button
                onClick={handleOpenConversation}
                className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {t("deliverable.openConversation")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto mb-6">
        {data.content ? (
          <div className="prose prose-invert max-w-none whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
            {data.content}
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-zinc-600">
            {t("deliverable.noContent")}
          </div>
        )}
      </div>

      {/* Action Bar */}
      {data.content && (
        <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
          <button
            onClick={handleCopy}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors",
              copied
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
            )}
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? t("deliverable.copySuccess") : t("deliverable.copy")}
          </button>
          <button
            onClick={() => handleExport("md")}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            {t("deliverable.exportMarkdown")}
          </button>
          <button
            onClick={() => handleExport("txt")}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            {t("deliverable.exportText")}
          </button>
        </div>
      )}
    </div>
  );
}
