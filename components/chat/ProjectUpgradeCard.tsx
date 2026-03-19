"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { usePulseStore } from "@/store/usePulseStore.new";
import type { Project } from "@/projects/types";

interface ProjectUpgradeCardProps {
  conversationId: string;
  onResolved: (converted: boolean) => void;
}

export function ProjectUpgradeCard({
  conversationId,
  onResolved,
}: ProjectUpgradeCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const resolvedRef = useRef(false);
  const [loading, setLoading] = useState(false);

  const addProject = usePulseStore((s) => s.addProject);
  const updateConversation = usePulseStore((s) => s.updateConversation);
  const addMessage = usePulseStore((s) => s.addMessage);

  const handleConvert = useCallback(async () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setLoading(true);

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/convert-to-project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[ProjectUpgradeCard] Convert failed:", err);
        resolvedRef.current = false;
        setLoading(false);
        return;
      }

      const data = await res.json();
      const { project_id, project_name, summary } = data;

      // Add project to store
      addProject({
        id: project_id,
        name: project_name,
        description: summary || "",
        status: "active",
        execution_mode: "foreman",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Project);

      // Update conversation in store
      updateConversation(conversationId, {
        status: "converted",
        project_id,
      });

      // Add system message with project link
      addMessage(conversationId, {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        role: "system",
        content: t("projectUpgrade.converted", {
          name: project_name,
          id: project_id,
        }),
        metadata: { type: "project_conversion", project_id },
        created_at: new Date().toISOString(),
      });

      onResolved(true);

      // Navigate to the new project
      router.push(`/projects/${project_id}`);
    } catch (err) {
      console.error("[ProjectUpgradeCard] Error:", err);
      resolvedRef.current = false;
      setLoading(false);
    }
  }, [conversationId, addProject, updateConversation, addMessage, onResolved, router, t]);

  const handleDismiss = useCallback(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolved(false);
  }, [onResolved]);

  return (
    <div className="mr-auto max-w-lg w-full">
      <div className="rounded-2xl bg-[var(--bg-glass)] border border-[var(--border-subtle)] overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FolderKanban className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t("projectUpgrade.title")}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {t("projectUpgrade.description")}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 pb-4 pt-2">
          <button
            onClick={handleConvert}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FolderKanban className="w-3.5 h-3.5" />
            )}
            {t("projectUpgrade.approve")}
          </button>
          <button
            onClick={handleDismiss}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-xl text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
          >
            {t("projectUpgrade.reject")}
          </button>
        </div>
      </div>
    </div>
  );
}
