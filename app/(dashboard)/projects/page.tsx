"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, FolderOpen, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { ProjectCard } from "@/components/project/ProjectCard";
import type { Project } from "@/projects/types";

export default function ProjectsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        setProjects(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  // Sort by updated_at DESC (Activity)
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [filtered]
  );

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="max-w-[900px] w-full mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">{t("projects.title")}</h1>
          <button
            onClick={() => router.push("/new")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("projects.newProject")}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("projects.searchPlaceholder")}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Sort */}
        <div className="flex justify-end mb-4">
          <span className="text-xs text-[var(--text-muted)]">
            {t("projects.sortBy")}{" "}
            <span className="text-[var(--text-secondary)]">{t("projects.sortByActivity")}</span>
          </span>
        </div>

        {/* Project list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FolderOpen className="w-12 h-12 text-[var(--text-disabled)]" />
            <p className="text-sm text-[var(--text-muted)]">{t("projects.empty")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isActive={false}
                onClick={() => router.push(`/projects/${project.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
