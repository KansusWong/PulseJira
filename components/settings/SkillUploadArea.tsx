"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "@/lib/i18n";

type UploadStatus = "idle" | "uploading" | "success" | "error";
type TabMode = "file" | "paste";

interface SkillUploadAreaProps {
  onUploaded: (skillId: string) => void;
}

export function SkillUploadArea({ onUploaded }: SkillUploadAreaProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabMode>("file");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste mode state
  const [pasteSkillId, setPasteSkillId] = useState("");
  const [pasteContent, setPasteContent] = useState("");

  const resetStatus = useCallback(() => {
    setTimeout(() => {
      setStatus("idle");
      setMessage("");
    }, 3000);
  }, []);

  const uploadFile = async (file: File) => {
    setStatus("uploading");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/settings/skills/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        setStatus("success");
        setMessage(t('agent.skillUploadSuccess'));
        onUploaded(json.data.skillId);
      } else {
        setStatus("error");
        setMessage(json.error || t('agent.skillUploadFailed'));
      }
    } catch {
      setStatus("error");
      setMessage(t('agent.skillUploadFailed'));
    }
    resetStatus();
  };

  const handlePasteSubmit = async () => {
    const skillId = pasteSkillId.trim();
    const content = pasteContent.trim();
    if (!skillId || !content) {
      setStatus("error");
      setMessage("Skill ID and content are required");
      resetStatus();
      return;
    }

    setStatus("uploading");
    setMessage("");
    try {
      const res = await fetch("/api/settings/skills/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId, content }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus("success");
        setMessage(t('agent.skillUploadSuccess'));
        setPasteSkillId("");
        setPasteContent("");
        onUploaded(json.data.skillId);
      } else {
        setStatus("error");
        setMessage(json.error || t('agent.skillUploadFailed'));
      }
    } catch {
      setStatus("error");
      setMessage(t('agent.skillUploadFailed'));
    }
    resetStatus();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-black/20 p-3 space-y-3">
      {/* Tab toggle */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setTab("file")}
          className={clsx(
            "px-2.5 py-1 rounded text-[11px] font-semibold transition-colors",
            tab === "file"
              ? "bg-zinc-700 text-zinc-200"
              : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          {t('agent.uploadFile')}
        </button>
        <button
          onClick={() => setTab("paste")}
          className={clsx(
            "px-2.5 py-1 rounded text-[11px] font-semibold transition-colors",
            tab === "paste"
              ? "bg-zinc-700 text-zinc-200"
              : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          {t('agent.pasteContent')}
        </button>
      </div>

      {tab === "file" ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={clsx(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 cursor-pointer transition-colors",
            dragging
              ? "border-cyan-500/60 bg-cyan-500/5"
              : "border-zinc-700/60 hover:border-zinc-600",
          )}
        >
          {status === "uploading" ? (
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          ) : (
            <Upload className="w-6 h-6 text-zinc-600" />
          )}
          <p className="text-xs text-zinc-500">.md / .zip</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.zip"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={pasteSkillId}
            onChange={(e) => setPasteSkillId(e.target.value)}
            placeholder="skill-id"
            className="w-full bg-black/50 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
          />
          <textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="Paste SKILL.md content..."
            className="w-full h-32 bg-black/50 border border-zinc-700/60 rounded-lg px-2.5 py-2 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono resize-y leading-relaxed"
          />
          <button
            onClick={handlePasteSubmit}
            disabled={status === "uploading"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
          >
            {status === "uploading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('agent.uploadSkill')}
          </button>
        </div>
      )}

      {/* Status message */}
      {message && (
        <div className={clsx(
          "flex items-center gap-1.5 text-xs",
          status === "error" ? "text-red-400" : "text-emerald-400",
        )}>
          {status === "success" && <CheckCircle2 className="w-3.5 h-3.5" />}
          {status === "error" && <AlertCircle className="w-3.5 h-3.5" />}
          {message}
        </div>
      )}
    </div>
  );
}
