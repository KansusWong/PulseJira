"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NewIdeaForm } from "@/components/project/NewIdeaForm";
import { usePulseStore } from "@/store/usePulseStore.new";
import type { Project } from "@/projects/types";

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const addProject = usePulseStore((s) => s.addProject);
  const setActiveProject = usePulseStore((s) => s.setActiveProject);

  const handleSubmit = async (data: { name: string; description: string; urls: string[] }) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (json.success && json.data) {
        addProject(json.data as Project);
        setActiveProject(json.data.id);
        router.push(`/projects/${json.data.id}`);
      } else {
        // Fallback: create local-only project
        const localProject: Project = {
          id: `local-${Date.now()}`,
          name: data.name || data.description.slice(0, 30),
          description: data.description,
          status: "draft",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        addProject(localProject);
        setActiveProject(localProject.id);
        router.push(`/projects/${localProject.id}`);
      }
    } catch {
      // Local-only fallback
      const localProject: Project = {
        id: `local-${Date.now()}`,
        name: data.name || data.description.slice(0, 30),
        description: data.description,
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      addProject(localProject);
      setActiveProject(localProject.id);
      router.push(`/projects/${localProject.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col justify-center min-h-full p-8 w-full max-w-3xl mx-auto">
      <NewIdeaForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </div>
  );
}
