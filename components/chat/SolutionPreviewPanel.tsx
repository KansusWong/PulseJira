"use client";

import { useState } from "react";
import { usePulseStore } from "@/store/usePulseStore.new";
import {
  X,
  CheckCircle2,
  XCircle,
  FileCode,
  FileText,
  Trash2,
  Eye,
  Loader2,
  AlertTriangle,
  Star,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

const riskColors: Record<string, string> = {
  low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

const actionIcons: Record<string, React.ReactNode> = {
  create: <FileCode className="w-3.5 h-3.5 text-emerald-400" />,
  edit: <FileText className="w-3.5 h-3.5 text-blue-400" />,
  delete: <Trash2 className="w-3.5 h-3.5 text-red-400" />,
};

export function SolutionPreviewPanel() {
  const proposal = usePulseStore((s) => s.solutionPanel.proposal);
  const selectedId = usePulseStore((s) => s.solutionPanel.selectedSolutionId);
  const status = usePulseStore((s) => s.solutionPanel.status);
  const selectSolution = usePulseStore((s) => s.selectSolution);
  const approveSolution = usePulseStore((s) => s.approveSolution);
  const rejectSolution = usePulseStore((s) => s.rejectSolution);
  const hideSolutionPanel = usePulseStore((s) => s.hideSolutionPanel);
  const activeConversationId = usePulseStore((s) => s.activeConversationId);

  const { t } = useTranslation();
  const [previewFile, setPreviewFile] = useState<{ solution: any; file: any } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!proposal) return null;

  const handleApprove = async () => {
    if (!selectedId || !activeConversationId || isSubmitting) return;
    setIsSubmitting(true);
    approveSolution();

    try {
      await fetch(`/api/conversations/${activeConversationId}/solution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", solution_id: selectedId }),
      });
    } catch (error) {
      console.error("[SolutionPreviewPanel] Approve failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = () => {
    rejectSolution();
  };

  const selectedSolution = proposal.solutions.find((s) => s.id === selectedId);

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">
            {t('solution.title') || '方案选择'}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">{proposal.context}</p>
        </div>
        <button
          onClick={hideSolutionPanel}
          className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Solutions List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {proposal.solutions.map((solution, idx) => {
          const isSelected = solution.id === selectedId;
          const isRecommended = idx === proposal.recommended_index;

          return (
            <div
              key={solution.id}
              onClick={() => selectSolution(solution.id)}
              className={clsx(
                "rounded-xl border p-4 cursor-pointer transition-all",
                isSelected
                  ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/20"
                  : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                  {solution.name}
                  {isRecommended && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      <Star className="w-3 h-3" />
                      {t('solution.recommended') || '推荐'}
                    </span>
                  )}
                </h4>
                {isSelected && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                )}
              </div>

              {/* Rationale */}
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">{solution.rationale}</p>

              {/* Risk Level */}
              <div className={clsx("inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs mb-3", riskColors[solution.risk_level])}>
                <AlertTriangle className="w-3 h-3" />
                {t(`solution.risk.${solution.risk_level}`) || solution.risk_level.toUpperCase()}
              </div>

              {/* Trade-offs */}
              {solution.trade_offs.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">
                    {t('solution.tradeOffs') || '权衡'}
                  </div>
                  <ul className="space-y-1">
                    {solution.trade_offs.map((trade, i) => (
                      <li key={i} className="text-xs text-zinc-500 flex items-start gap-1.5">
                        <span className="text-zinc-700 mt-0.5">•</span>
                        <span>{trade}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Files */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">
                  {t('solution.fileChanges') || '文件变更'} ({solution.files.length})
                  <span className="text-zinc-700 ml-2">
                    ~{solution.estimated_lines} {t('solution.lines') || 'lines'}
                  </span>
                </div>
                {solution.files.slice(0, 3).map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-zinc-500 p-2 rounded bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                  >
                    {actionIcons[file.action]}
                    <span className="flex-1 font-mono truncate text-zinc-400">{file.path}</span>
                    {file.description && (
                      <span className="text-[10px] text-zinc-600 hidden sm:inline">
                        {file.description}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewFile({ solution, file });
                      }}
                      className="p-1 hover:bg-zinc-700 rounded transition-colors"
                      title={t('solution.preview') || 'Preview'}
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {solution.files.length > 3 && (
                  <p className="text-[10px] text-zinc-600 ml-2">
                    +{solution.files.length - 3} {t('solution.moreFiles') || 'more files'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      {status === "pending" && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800/50">
          <button
            onClick={handleApprove}
            disabled={!selectedId || isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {t('solution.approve') || '批准方案'}
          </button>
          <button
            onClick={handleReject}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <XCircle className="w-4 h-4" />
            {t('solution.reject') || '拒绝'}
          </button>
        </div>
      )}

      {status === "approved" && (
        <div className="px-4 py-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('solution.approved') || '方案已批准，执行中...'}
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile.file}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

interface FilePreviewModalProps {
  file: {
    path: string;
    action: 'create' | 'edit' | 'delete';
    content?: string;
    original_content?: string;
    description?: string;
  };
  onClose: () => void;
}

function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 max-w-4xl w-full max-h-[80vh] flex flex-col shadow-2xl pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              {actionIcons[file.action]}
              <h3 className="text-sm font-medium text-zinc-200 font-mono">{file.path}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Description */}
          {file.description && (
            <div className="px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/50">
              <p className="text-xs text-zinc-400">{file.description}</p>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 bg-zinc-950">
            {file.action === 'delete' ? (
              <div className="flex items-center justify-center h-full text-zinc-600">
                <div className="text-center">
                  <Trash2 className="w-8 h-8 mx-auto mb-2 text-red-400/50" />
                  <p className="text-sm">{t('solution.fileWillBeDeleted') || 'This file will be deleted'}</p>
                </div>
              </div>
            ) : file.action === 'edit' && file.original_content ? (
              <div className="grid grid-cols-2 gap-2 h-full">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">
                    {t('solution.original') || 'Original'}
                  </div>
                  <pre className="text-xs text-zinc-300 font-mono bg-zinc-900/50 p-3 rounded border border-zinc-800 overflow-auto max-h-full">
                    {file.original_content}
                  </pre>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2">
                    {t('solution.new') || 'New'}
                  </div>
                  <pre className="text-xs text-zinc-300 font-mono bg-zinc-900/50 p-3 rounded border border-zinc-800 overflow-auto max-h-full">
                    {file.content || ''}
                  </pre>
                </div>
              </div>
            ) : (
              <pre className="text-xs text-zinc-300 font-mono bg-zinc-900/50 p-3 rounded border border-zinc-800 overflow-auto">
                {file.content || t('solution.noContent') || '(No content)'}
              </pre>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
