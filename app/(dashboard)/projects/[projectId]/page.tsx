"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { usePulseStore } from "@/store/usePulseStore.new";
import { ChatView } from "@/components/chat/ChatView";
import { ProjectFilesPanel } from "@/components/project/ProjectFilesPanel";
import type { Project } from "@/projects/types";
import { useTranslation } from "@/lib/i18n";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { t } = useTranslation();

  const [hasMounted, setHasMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setHasMounted(true); }, []);

  const projects = usePulseStore((s) => s.projects);
  const addProject = usePulseStore((s) => s.addProject);
  const updateProjectInStore = usePulseStore((s) => s.updateProjectInStore);
  const removeProject = usePulseStore((s) => s.removeProject);

  const [fetchStatus, setFetchStatus] = useState<"idle" | "fetching" | "done">("idle");
  const fetchedRef = useRef<string | null>(null);

  // Fetch project data from API
  useEffect(() => {
    if (!hasMounted) return;
    if (projectId.startsWith("local-")) return;
    if (fetchedRef.current === projectId) return;

    fetchedRef.current = projectId;
    const inStore = usePulseStore.getState().projects.some((p) => p.id === projectId);
    if (!inStore) setFetchStatus("fetching");

    fetch(`/api/projects/${projectId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data) {
          const alreadyInStore = usePulseStore.getState().projects.some((p) => p.id === projectId);
          if (alreadyInStore) {
            updateProjectInStore(projectId, json.data);
          } else {
            addProject(json.data as Project);
          }
        }
      })
      .catch((err) => console.error('[project-page] fetch error:', err))
      .finally(() => setFetchStatus("done"));
  }, [hasMounted, projectId, addProject, updateProjectInStore]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const project = hasMounted ? projects.find((p) => p.id === projectId) : undefined;

  const handleDelete = async () => {
    if (!project) return;
    if (!project.id.startsWith("local-")) {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    }
    removeProject(project.id);
    router.push("/");
  };

  const openEdit = () => {
    if (!project) return;
    setEditName(project.name);
    setEditDesc(project.description || "");
    setMenuOpen(false);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!project || !editName.trim()) return;
    const updates = { name: editName.trim(), description: editDesc.trim() };
    updateProjectInStore(projectId, updates);
    setEditOpen(false);
    if (!projectId.startsWith("local-")) {
      fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }).catch((err) => console.error('[project-page] update failed:', err));
    }
  };

  if (!hasMounted) return null;

  if (!project) {
    if (fetchStatus === "fetching" || (fetchStatus === "idle" && !projectId.startsWith("local-"))) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
        {t('project.detail.notFound')}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── Left: Main content — project header + embedded ChatView ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Project header bar */}
        <div className="flex-shrink-0 border-b border-[rgba(255,255,255,0.04)] px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.push("/")}
                className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <h1 className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {project.name}
                </h1>
                {project.description && (
                  <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                    {project.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-4">
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden w-48">
                    <button
                      onClick={openEdit}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                      {t('project.detail.editDetails')}
                    </button>
                    <div className="mx-3 border-t border-[var(--border-subtle)]" />
                    <button
                      onClick={() => { setMenuOpen(false); handleDelete(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('common.delete')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Embedded ChatView in project mode */}
        <div className="flex-1 min-h-0">
          <ChatView projectId={projectId} />
        </div>
      </div>

      {/* ── Right: Files sidebar ── */}
      <div className="hidden lg:block w-[340px] flex-shrink-0 border-l border-[rgba(255,255,255,0.04)] overflow-y-auto">
        <div className="pt-4 px-4">
          <ProjectFilesPanel projectId={projectId} />
        </div>
      </div>

      {/* ── Edit details modal ── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditOpen(false)}>
          <div
            className="w-full max-w-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-5">
              {t('project.detail.editDetails')}
            </h2>

            <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
              {t('project.detail.editName')}
            </label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors mb-4"
            />

            <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
              {t('project.detail.editDescription')}
            </label>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={5}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none mb-5"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleEditSave}
                disabled={!editName.trim()}
                className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
