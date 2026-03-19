"use client";

import { useState } from "react";
import { Loader2, X, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

interface SkillRowProps {
  name: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onEdit?: () => void;
}

export function SkillRow({ name, description, enabled, onToggle, onRemove, onEdit }: SkillRowProps) {
  const { t } = useTranslation();
  const [toggling, setToggling] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setToggling(true);
    try {
      await onToggle(!enabled);
    } finally {
      setToggling(false);
    }
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        enabled ? "bg-[var(--bg-surface)]" : "bg-[var(--bg-surface)] opacity-60",
        onEdit && "cursor-pointer hover:bg-[var(--bg-elevated)]"
      )}
      onClick={onEdit}
    >
      <div className="flex-1 min-w-0">
        <code className="text-xs text-green-400 font-mono">{name}</code>
        {description && (
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">{description}</p>
        )}
      </div>

      {/* Toggle switch */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        className="relative shrink-0"
        title={enabled ? t('agent.toggleSkill') : t('agent.toggleSkill')}
      >
        {toggling ? (
          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
        ) : (
          <div className={clsx(
            "w-8 h-[18px] rounded-full transition-colors relative",
            enabled ? "bg-emerald-500/40" : "bg-[var(--bg-elevated)]",
          )}>
            <div className={clsx(
              "absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all",
              enabled ? "left-[15px] bg-emerald-400" : "left-[2px] bg-[var(--bg-elevated)]",
            )} />
          </div>
        )}
      </button>

      {/* Remove button */}
      <button
        onClick={handleRemove}
        disabled={removing}
        className="shrink-0 p-1 rounded hover:bg-red-900/30 text-[var(--text-muted)] hover:text-red-400 transition-colors disabled:opacity-40"
        title={t('agent.removeSkill')}
      >
        {removing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <X className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Edit indicator */}
      {onEdit && (
        <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
      )}
    </div>
  );
}
