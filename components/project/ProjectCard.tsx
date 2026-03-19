"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useTranslation } from '@/lib/i18n';
import clsx from "clsx";
import type { Project } from "@/projects/types";

interface ProjectCardProps {
  project: Project;
  isActive: boolean;
  onClick: () => void;
}

const statusVariants: Record<string, 'default' | 'success' | 'error' | 'warning' | 'info'> = {
  draft: "default",
  analyzing: "warning",
  planned: "info",
  implementing: "warning",
  implemented: "info",
  deploying: "warning",
  deployed: "success",
  active: "success",
  archived: "default",
};

export function ProjectCard({ project, isActive, onClick }: ProjectCardProps) {
  const router = useRouter();
  const { t, locale } = useTranslation();

  const statusLabels: Record<string, string> = {
    draft: t('project.status.draft'),
    analyzing: t('project.status.analyzing'),
    planned: t('project.status.planned'),
    implementing: t('project.status.implementing'),
    implemented: t('project.status.implemented'),
    deploying: t('project.status.deploying'),
    deployed: t('project.status.deployed'),
    active: t('project.status.active'),
    archived: t('project.status.archived'),
  };

  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left p-4 border border-border rounded-lg hover:border-zinc-600 transition-all group",
        isActive && "border-accent/50 bg-zinc-900/50"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">
          {project.name}
        </h3>
        <Badge variant={statusVariants[project.status]}>{statusLabels[project.status]}</Badge>
      </div>
      <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{project.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-600 font-mono">
          {new Date(project.updated_at).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')}
        </span>
        <ArrowRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      </div>
    </button>
  );
}
