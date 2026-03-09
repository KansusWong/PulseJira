"use client";

import { BrainCircuit, CheckCircle2, Download, Rocket, Loader2, PlayCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { motion } from "framer-motion";
import clsx from "clsx";

const MotionDiv = motion.div;

interface PlanResultCardProps {
  result: {
    featureName: string;
    score: number;
    decision: string;
    rationale: string;
    prd?: {
      title?: string;
      summary?: string;
      goals?: string[];
      user_stories?: string[];
      acceptance_criteria?: string[];
      score?: number;
      decision?: string;
      rationale?: string;
    };
    tasks?: any[];
  };
  onLaunch: () => void;
  isLaunching?: boolean;
  isLaunched?: boolean;
  kanbanProgress?: { todo: number; inProgress: number; done: number; total: number } | null;
}

export function PlanResultCard({ result, onLaunch, isLaunching, isLaunched, kanbanProgress }: PlanResultCardProps) {
  const { t } = useTranslation();

  const handleExportPRD = () => {
    const prd = result.prd;
    const title = prd?.title || result.featureName;
    const lines: string[] = [];

    lines.push(`# ${title}`);
    lines.push("");
    lines.push(`> ${t('planResult.decision', { decision: prd?.decision || result.decision, score: String(prd?.score ?? result.score) })}`);
    lines.push("");

    // 功能概述
    if (prd?.summary) {
      lines.push(`## ${t('planResult.featureOverview')}`);
      lines.push("");
      lines.push(prd.summary);
      lines.push("");
    }

    // 决策理由
    const rationale = prd?.rationale || result.rationale;
    if (rationale) {
      lines.push(`## ${t('planResult.decisionRationale')}`);
      lines.push("");
      lines.push(rationale);
      lines.push("");
    }

    // 目标
    if (prd?.goals && prd.goals.length > 0) {
      lines.push(`## ${t('planResult.goals')}`);
      lines.push("");
      prd.goals.forEach((goal, i) => {
        lines.push(`${i + 1}. ${goal}`);
      });
      lines.push("");
    }

    // 用户故事
    if (prd?.user_stories && prd.user_stories.length > 0) {
      lines.push(`## ${t('planResult.userStories')}`);
      lines.push("");
      prd.user_stories.forEach((story, i) => {
        lines.push(`${i + 1}. ${story}`);
      });
      lines.push("");
    }

    // 验收标准
    if (prd?.acceptance_criteria && prd.acceptance_criteria.length > 0) {
      lines.push(`## ${t('planResult.acceptanceCriteria')}`);
      lines.push("");
      prd.acceptance_criteria.forEach((criteria, i) => {
        lines.push(`- [ ] ${criteria}`);
      });
      lines.push("");
    }

    // 开发任务
    if (result.tasks && result.tasks.length > 0) {
      lines.push(`## ${t('planResult.devTasks')}`);
      lines.push("");
      result.tasks.forEach((task: any, i: number) => {
        const priority = task.priority ? `[${task.priority.toUpperCase()}]` : "";
        const taskType = task.type ? `(${task.type})` : "";
        lines.push(`### ${i + 1}. ${priority} ${task.title} ${taskType}`);
        lines.push("");
        if (task.description) {
          lines.push(task.description);
          lines.push("");
        }
        if (task.affected_files && task.affected_files.length > 0) {
          lines.push(`**${t('planResult.affectedFiles')}**`);
          lines.push("");
          task.affected_files.forEach((f: string) => {
            lines.push(`- \`${f}\``);
          });
          lines.push("");
        }
      });
    }

    const markdown = lines.join("\n");
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")}_PRD.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <MotionDiv
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-full bg-paper border border-border rounded-xl p-6 shadow-2xl relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-purple-600" />

      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">{result.featureName}</h2>
          <div className="flex items-center mt-1 space-x-2">
            <span className={clsx(
              "text-xs px-2 py-0.5 rounded font-mono",
              result.decision === "GO" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
            )}>
              {result.decision}
            </span>
            <span className="text-xs text-zinc-500">Confidence: {result.score}%</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPRD}
            className="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-full border border-zinc-800 transition-colors"
            title={t('planResult.downloadPrd')}
          >
            <Download className="w-5 h-5 text-zinc-400" />
          </button>
          <div className="p-2 bg-zinc-900 rounded-full border border-zinc-800">
            <BrainCircuit className="w-5 h-5 text-purple-500" />
          </div>
        </div>
      </div>

      <p className="text-sm text-zinc-400 leading-relaxed mb-6">{result.rationale}</p>

      <div className="space-y-3">
        {/* Launch project */}
        <button
          onClick={onLaunch}
          disabled={isLaunched || isLaunching}
          className={clsx(
            "w-full flex items-center justify-center py-3 text-sm font-bold rounded-lg transition-all",
            isLaunched
              ? "bg-green-600/20 text-green-500 border border-green-600/50 cursor-default"
              : isLaunching
                ? "bg-zinc-800 text-zinc-400 cursor-wait"
                : "bg-white text-black hover:bg-zinc-200"
          )}
        >
          {isLaunched ? (
            <><CheckCircle2 className="w-4 h-4 mr-2" /> {t('planResult.projectLaunched')}</>
          ) : isLaunching ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('planResult.launchingProject')}</>
          ) : kanbanProgress && kanbanProgress.total > 0 ? (
            <><PlayCircle className="w-4 h-4 mr-2" /> {t('planResult.continueProject')}</>
          ) : (
            <><Rocket className="w-4 h-4 mr-2" /> {t('planResult.launchProject')}</>
          )}
        </button>
      </div>
    </MotionDiv>
  );
}
