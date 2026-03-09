"use client";

import { useState } from "react";
import {
  ExternalLink,
  ThumbsDown,
  Loader2,
  MessageSquarePlus,
  TrendingUp,
  CheckCircle2,
  XCircle,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

export interface Signal {
  id: string;
  content: string;
  source_url: string;
  status: "DRAFT" | "PROCESSING" | "ANALYZED" | "APPROVED" | "REJECTED";
  platform: string | null;
  metadata: Record<string, any> | null;
  received_at: string;
}

const platformIcons: Record<string, string> = {
  reddit: "\u{1F4AC}",
  twitter: "\u{1F426}",
  youtube: "\u{1F4F9}",
  "generic-web": "\u{1F310}",
};

const platformColors: Record<string, string> = {
  reddit: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  twitter: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  youtube: "bg-red-500/10 text-red-400 border-red-500/20",
  "generic-web": "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

interface SignalCardProps {
  signal: Signal;
  isDiscussing?: boolean;
  onQuickDiscuss: (signalId: string) => Promise<void>;
  onReject: (signalId: string) => Promise<void>;
  onRestore?: (signalId: string) => Promise<void>;
  onClick?: () => void;
}

export function SignalCard({ signal, isDiscussing: parentDiscussing, onQuickDiscuss, onReject, onRestore, onClick }: SignalCardProps) {
  const { t } = useTranslation();
  const [discussing, setDiscussing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [done, setDone] = useState(false);

  const platform = signal.platform || "unknown";
  const screening = signal.metadata?.screening;
  const score = screening?.score;
  const title = screening?.title;
  const prepareResult = signal.metadata?.prepare_result;
  const decision = prepareResult?.decision;
  const isProceed = decision === "PROCEED";
  const hasRichAnalysis = !!prepareResult;
  const isRejected = signal.status === "REJECTED";
  const activeDiscussing =
    discussing ||
    !!parentDiscussing ||
    signal.status === "PROCESSING" ||
    signal.metadata?.quick_discuss?.state === "running";

  const handleQuickDiscuss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDiscussing(true);
    try {
      await onQuickDiscuss(signal.id);
    } finally {
      setDiscussing(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRejecting(true);
    try {
      await onReject(signal.id);
      setDone(true);
    } finally {
      setRejecting(false);
    }
  };

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRestore) return;
    setRestoring(true);
    try {
      await onRestore(signal.id);
      setDone(true);
    } finally {
      setRestoring(false);
    }
  };

  if (done) return null;

  const summary =
    prepareResult?.blue_case?.mrd?.executive_pitch ||
    prepareResult?.business_verdict ||
    screening?.summary ||
    signal.content;

  return (
    <div
      onClick={onClick}
      className={clsx(
        "bg-paper border rounded-lg p-4 transition-all group",
        onClick && "cursor-pointer",
        isRejected
          ? "border-zinc-800/50 opacity-70 hover:opacity-100"
          : activeDiscussing
            ? "border-violet-500/30 hover:border-violet-500/50"
            : hasRichAnalysis && isProceed
              ? "border-emerald-500/20 hover:border-emerald-500/40"
              : "border-border hover:border-zinc-600"
      )}
    >
      {/* Header: badges + date */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={clsx(
              "text-[10px] font-mono px-2 py-0.5 rounded-full border",
              platformColors[platform] || "bg-zinc-800 text-zinc-400 border-zinc-700"
            )}
          >
            {platformIcons[platform] || ""} {platform}
          </span>
          {score !== undefined && (
            <span
              className={clsx(
                "text-[10px] font-mono px-2 py-0.5 rounded-full",
                score >= 70
                  ? "bg-green-500/10 text-green-400"
                  : score >= 50
                    ? "bg-yellow-500/10 text-yellow-400"
                    : "bg-zinc-800 text-zinc-500"
              )}
            >
              {score}/100
            </span>
          )}
          {activeDiscussing && (
            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> {t('signal.discussing')}
            </span>
          )}
          {!activeDiscussing && decision && (
            <span className="flex items-center gap-0.5">
              {isProceed ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ) : (
                <XCircle className="w-3 h-3 text-red-400" />
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <span className="text-[10px] text-zinc-600 font-mono">
            {new Date(signal.received_at).toLocaleDateString()}
          </span>
          {onClick && (
            <ChevronRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
          )}
        </div>
      </div>

      {/* Title */}
      {title && (
        <h3 className="text-sm font-bold text-zinc-200 mb-1 line-clamp-1">{title}</h3>
      )}

      {/* Summary (compact) */}
      <p className="text-xs text-zinc-400 line-clamp-2 mb-3 leading-relaxed">
        {summary}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isRejected ? (
          onRestore && (
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-60"
            >
              {restoring ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              {t('signal.restore')}
            </button>
          )
        ) : activeDiscussing ? (
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg bg-violet-600/20 text-violet-400 cursor-wait">
            <Loader2 className="w-3 h-3 animate-spin" /> {t('signal.redBlueDiscussing')}
          </div>
        ) : hasRichAnalysis ? (
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg bg-zinc-800/60 text-zinc-400">
            {isProceed ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : (
              <XCircle className="w-3 h-3 text-red-400" />
            )}
            {t('signal.discussed')} · {isProceed ? t('signal.suggestProceed') : t('signal.suggestPause')}
          </div>
        ) : (
          <>
            <button
              onClick={handleQuickDiscuss}
              disabled={discussing || rejecting}
              className={clsx(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all",
                discussing
                  ? "bg-violet-600/20 text-violet-400 cursor-wait"
                  : "bg-violet-600 text-white hover:bg-violet-500"
              )}
            >
              {discussing ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> {t('signal.discussing')}...</>
              ) : (
                <><MessageSquarePlus className="w-3 h-3" /> {t('signal.quickDiscuss')}</>
              )}
            </button>
            <button
              onClick={handleReject}
              disabled={discussing || rejecting}
              className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title={t('signal.dismiss')}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
