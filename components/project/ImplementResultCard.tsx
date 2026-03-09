"use client";

import { useState } from "react";
import {
  Rocket,
  CheckCircle2,
  XCircle,
  FileCode2,
  GitPullRequest,
  TestTube2,
  ExternalLink,
  Loader2,
  RotateCcw,
  Monitor,
  GitBranch,
  Square,
  Play,
} from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

const MotionDiv = motion.div;

export interface ImplementResultData {
  status: "success" | "partial" | "failed";
  summary: string;
  prUrl: string | null;
  prNumber: number | null;
  tasksCompleted: number;
  tasksTotal: number;
  filesChanged: string[];
  testsPassing: boolean | null;
}

export type PreviewStatus =
  | "installing"
  | "starting"
  | "ready"
  | "failed"
  | "stopped";

export interface PreviewSessionData {
  projectId: string;
  port: number;
  pid: number;
  status: PreviewStatus;
  url: string;
  error?: string;
}

interface ImplementResultCardProps {
  result: ImplementResultData;
  projectId: string;
  repoOwner?: string;
  repoName?: string;
  // Remote mode
  onDeployStart: () => void;
  isDeploying?: boolean;
  deployResult?: {
    state: string;
    deploymentUrl?: string | null;
  } | null;
  // Local mode — preview lifecycle
  previewStatus?: PreviewSessionData | null;
  onPreviewStart?: () => void;
  onPreviewStop?: () => void;
  onPreviewOpen?: () => void;
  // Local mode — push PR
  onPushPR?: () => void;
  isPushingPR?: boolean;
  pushPRResult?: { prUrl: string; prNumber: number } | null;
  // Retry
  onRetry?: () => void;
}

export function ImplementResultCard({
  result,
  projectId,
  onDeployStart,
  isDeploying = false,
  deployResult,
  previewStatus,
  onPreviewStart,
  onPreviewStop,
  onPreviewOpen,
  onPushPR,
  isPushingPR = false,
  pushPRResult,
  onRetry,
}: ImplementResultCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const isLocalMode = !result.prUrl;
  const previewRunning =
    previewStatus?.status === "installing" ||
    previewStatus?.status === "starting";
  const previewReady = previewStatus?.status === "ready";
  const previewFailed = previewStatus?.status === "failed";

  const canStartPreview =
    isLocalMode &&
    result.status === "success" &&
    !previewRunning &&
    !previewReady;

  const canDeploy =
    !isLocalMode &&
    result.status === "success" &&
    !isDeploying &&
    !deployResult;

  const canPushPR =
    isLocalMode && previewReady && !isPushingPR && !pushPRResult;

  const statusColor =
    result.status === "success"
      ? "text-green-400"
      : result.status === "partial"
        ? "text-yellow-400"
        : "text-red-400";

  const statusIcon =
    result.status === "success" ? (
      <CheckCircle2 className="w-5 h-5 text-green-400" />
    ) : result.status === "partial" ? (
      <CheckCircle2 className="w-5 h-5 text-yellow-400" />
    ) : (
      <XCircle className="w-5 h-5 text-red-400" />
    );

  return (
    <MotionDiv
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-full bg-paper border border-border rounded-xl p-6 shadow-2xl relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-600 to-emerald-600" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {statusIcon}
          <div>
            <h2 className="text-lg font-bold text-white">
              Implementation Complete
            </h2>
            <p className={clsx("text-xs font-mono", statusColor)}>
              {result.tasksCompleted}/{result.tasksTotal} tasks completed
            </p>
          </div>
        </div>
        {isLocalMode && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            LOCAL
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-zinc-400 mb-4">{result.summary}</p>

      {/* Metrics row */}
      <div
        className={clsx(
          "grid gap-3 mb-4",
          isLocalMode ? "grid-cols-2" : "grid-cols-3",
        )}
      >
        {/* PR — only show in remote mode */}
        {!isLocalMode && (
          <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1">
              <GitPullRequest className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-zinc-500">Pull Request</span>
            </div>
            <a
              href={result.prUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              #{result.prNumber} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Tests */}
        <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <TestTube2 className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-zinc-500">Tests</span>
          </div>
          <span
            className={clsx(
              "text-sm font-mono",
              result.testsPassing === true
                ? "text-green-400"
                : result.testsPassing === false
                  ? "text-red-400"
                  : "text-zinc-600",
            )}
          >
            {result.testsPassing === true
              ? "Passing"
              : result.testsPassing === false
                ? "Failing"
                : "N/A"}
          </span>
        </div>

        {/* Files */}
        <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
          <div className="flex items-center gap-2 mb-1">
            <FileCode2 className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-zinc-500">Files Changed</span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-cyan-400 hover:text-cyan-300"
          >
            {result.filesChanged.length} files
          </button>
        </div>
      </div>

      {/* Expanded file list */}
      {expanded && result.filesChanged.length > 0 && (
        <div className="mb-4 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800 max-h-40 overflow-y-auto">
          {result.filesChanged.map((f, i) => (
            <div key={i} className="text-xs text-zinc-400 font-mono py-0.5">
              {f}
            </div>
          ))}
        </div>
      )}

      {/* ── Local mode: Preview status banner ── */}
      {isLocalMode && previewFailed && previewStatus?.error && (
        <div className="mb-4 rounded-lg p-3 border bg-red-500/10 border-red-600/30 text-red-400 text-sm">
          <span className="flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{previewStatus.error}</span>
          </span>
        </div>
      )}

      {isLocalMode && previewReady && (
        <div className="mb-4 rounded-lg p-3 border bg-green-500/10 border-green-600/30 text-green-400 text-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {t('implement.previewReady')}
            <span className="text-xs font-mono text-zinc-400 ml-auto">
              {previewStatus?.url}
            </span>
          </span>
        </div>
      )}

      {/* ── Remote mode: deploy result banner ── */}
      {!isLocalMode && deployResult && (
        <div
          className={clsx(
            "mb-4 rounded-lg p-3 border text-sm",
            deployResult.state === "success"
              ? "bg-green-500/10 border-green-600/30 text-green-400"
              : "bg-red-500/10 border-red-600/30 text-red-400",
          )}
        >
          {deployResult.state === "success" ? (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Deployed successfully
              {deployResult.deploymentUrl && (
                <a
                  href={deployResult.deploymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline ml-1"
                >
                  View <ExternalLink className="w-3 h-3 inline" />
                </a>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Deployment {deployResult.state}
            </span>
          )}
        </div>
      )}

      {/* Push PR result banner */}
      {pushPRResult && (
        <div className="mb-4 rounded-lg p-3 border bg-purple-500/10 border-purple-600/30 text-purple-400 text-sm">
          <span className="flex items-center gap-2">
            <GitPullRequest className="w-4 h-4" />
            {t('implement.prCreated')}
            <a
              href={pushPRResult.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline ml-1 flex items-center gap-1"
            >
              #{pushPRResult.prNumber} <ExternalLink className="w-3 h-3" />
            </a>
          </span>
        </div>
      )}

      {/* Retry button — shown when implementation failed or partially completed */}
      {onRetry && result.status !== "success" && (
        <button
          onClick={onRetry}
          className="w-full flex items-center justify-center py-3 mb-3 text-sm font-bold rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          {t('implement.retryTasks')}
        </button>
      )}

      {/* ═══════ LOCAL MODE: Preview buttons ═══════ */}
      {isLocalMode && (
        <>
          {/* Not started / failed → Start */}
          {canStartPreview && (
            <button
              onClick={onPreviewStart}
              className="w-full flex items-center justify-center py-3 text-sm font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-all"
            >
              <Play className="w-4 h-4 mr-2" />
              {t('implement.startPreview')}
            </button>
          )}

          {/* Installing / Starting → Loading */}
          {previewRunning && (
            <button
              disabled
              className="w-full flex items-center justify-center py-3 text-sm font-bold rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 cursor-wait transition-all"
            >
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {previewStatus?.status === "installing"
                ? t('implement.installingDeps')
                : t('implement.startingService')}
            </button>
          )}

          {/* Ready → Open + Stop */}
          {previewReady && (
            <div className="flex gap-2">
              <button
                onClick={onPreviewOpen}
                className="flex-1 flex items-center justify-center py-3 text-sm font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-all"
              >
                <Monitor className="w-4 h-4 mr-2" />
                {t('implement.viewPreview')}
                <ExternalLink className="w-3 h-3 ml-1.5 opacity-60" />
              </button>
              <button
                onClick={onPreviewStop}
                className="flex items-center justify-center px-4 py-3 text-sm font-bold rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-all"
                title={t('implement.stopPreview')}
              >
                <Square className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Failed → Retry */}
          {previewFailed && (
            <button
              onClick={onPreviewStart}
              className="w-full flex items-center justify-center py-3 text-sm font-bold rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {t('implement.retryPreview')}
            </button>
          )}

          {/* Push PR — available after preview is ready */}
          {previewReady && !pushPRResult && onPushPR && (
            <button
              onClick={onPushPR}
              disabled={!canPushPR}
              className={clsx(
                "w-full flex items-center justify-center py-3 mt-3 text-sm font-bold rounded-lg transition-all",
                isPushingPR
                  ? "bg-purple-600/20 text-purple-400 border border-purple-600/30 cursor-wait"
                  : canPushPR
                    ? "bg-purple-600 text-white hover:bg-purple-500"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
              )}
            >
              {isPushingPR ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('implement.pushing')}
                </>
              ) : (
                <>
                  <GitBranch className="w-4 h-4 mr-2" /> {t('implement.pushPR')}
                </>
              )}
            </button>
          )}
        </>
      )}

      {/* ═══════ REMOTE MODE: Deploy button ═══════ */}
      {!isLocalMode && (
        <button
          onClick={onDeployStart}
          disabled={!canDeploy}
          className={clsx(
            "w-full flex items-center justify-center py-3 text-sm font-bold rounded-lg transition-all",
            isDeploying
              ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 cursor-wait"
              : deployResult?.state === "success"
                ? "bg-green-600/20 text-green-500 border border-green-600/50 cursor-default"
                : canDeploy
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
          )}
        >
          {isDeploying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deploying...
            </>
          ) : deployResult?.state === "success" ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" /> Deployed
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4 mr-2" /> Deploy to Production
            </>
          )}
        </button>
      )}
    </MotionDiv>
  );
}
