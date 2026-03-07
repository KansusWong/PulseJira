"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useTranslation } from '@/lib/i18n';
import { ArrowRight, Trash2, Upload, X } from "lucide-react";
import type { Project } from "@/projects/types";

interface ProjectHeaderProps {
  project: Project;
  onExecute: () => void;
  onDelete: () => void;
  isRunning: boolean;
  hasPrepareResult?: boolean;
  onPromote?: (data: { feature_name: string; feature_type: 'skill' | 'agent'; feature_description: string }) => void;
}

export function ProjectHeader({ project, onExecute, onDelete, isRunning, hasPrepareResult, onPromote }: ProjectHeaderProps) {
  const { t } = useTranslation();
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [featureName, setFeatureName] = useState("");
  const [featureType, setFeatureType] = useState<'skill' | 'agent'>('skill');
  const [featureDescription, setFeatureDescription] = useState("");
  const [promoting, setPromoting] = useState(false);

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
  const canExecute = ['draft', 'analyzing', 'planned'].includes(project.status) && !hasPrepareResult;
  const canPromote = ['implemented', 'deployed'].includes(project.status);

  const handlePromoteSubmit = async () => {
    if (!featureName.trim() || !featureDescription.trim() || !onPromote) return;
    setPromoting(true);
    try {
      await onPromote({ feature_name: featureName.trim(), feature_type: featureType, feature_description: featureDescription.trim() });
      setPromoteOpen(false);
      setFeatureName("");
      setFeatureType("skill");
      setFeatureDescription("");
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between p-4">
        <div>
          <h1 className="text-lg font-bold text-white">{project.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={project.status === 'analyzing' ? 'warning' : project.status === 'active' ? 'success' : 'default'}>
              {statusLabels[project.status] || project.status}
            </Badge>
            <span className="text-[10px] text-zinc-600 font-mono">
              {t('project.header.updated')} {new Date(project.updated_at).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canPromote && onPromote && (
            <Button variant="ghost" size="sm" onClick={() => setPromoteOpen(!promoteOpen)}>
              <Upload className="w-3 h-3 mr-1" />
              {t('project.header.promote')}
            </Button>
          )}
          {canExecute && (
            <Button onClick={onExecute} disabled={isRunning} size="sm">
              {isRunning ? t('project.header.running') : t('project.header.runAgents')}
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Promote inline panel */}
      {promoteOpen && (
        <div className="px-4 pb-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-200">{t('project.promote.title')}</h3>
              <button onClick={() => setPromoteOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('project.promote.name')}</label>
                <input
                  value={featureName}
                  onChange={(e) => setFeatureName(e.target.value)}
                  placeholder={t('project.promote.namePlaceholder')}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('project.promote.type')}</label>
                <select
                  value={featureType}
                  onChange={(e) => setFeatureType(e.target.value as 'skill' | 'agent')}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                >
                  <option value="skill">Skill</option>
                  <option value="agent">Agent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('project.promote.description')}</label>
                <textarea
                  value={featureDescription}
                  onChange={(e) => setFeatureDescription(e.target.value)}
                  placeholder={t('project.promote.descriptionPlaceholder')}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
              <Button
                size="sm"
                onClick={handlePromoteSubmit}
                disabled={promoting || !featureName.trim() || !featureDescription.trim()}
              >
                {promoting ? t('common.loading') : t('project.promote.submit')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
