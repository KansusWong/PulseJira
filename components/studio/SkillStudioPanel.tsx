"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Wrench,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  ChevronRight,
  Pencil,
  Download,
} from "lucide-react";
import clsx from "clsx";
import { usePulseStore } from "@/store/usePulseStore.new";
import { useTranslation } from "@/lib/i18n";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillResource {
  path: string;
  type: string;
  mimeType?: string;
  sizeBytes: number;
}

interface SkillResources {
  references: SkillResource[];
  scripts: SkillResource[];
  assets: SkillResource[];
}

interface SkillDetail {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  version: string;
  tags: string[];
  source: string;
  instructions: string;
  resources: SkillResources;
}

// ---------------------------------------------------------------------------
// File tree node structure
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string; // full relative path for fetching
  isDir: boolean;
  children?: TreeNode[];
}

function buildFileTree(resources: SkillResources): TreeNode[] {
  const groups: { name: string; items: SkillResource[] }[] = [
    { name: "references", items: resources.references },
    { name: "scripts", items: resources.scripts },
    { name: "assets", items: resources.assets },
  ];

  const nodes: TreeNode[] = [];

  for (const g of groups) {
    if (g.items.length === 0) continue;
    nodes.push({
      name: g.name,
      path: g.name,
      isDir: true,
      children: g.items.map((r) => ({
        name: r.path.split("/").pop() || r.path,
        path: r.path,
        isDir: false,
      })),
    });
  }

  // Always add SKILL.md at the bottom
  nodes.push({ name: "SKILL.md", path: "SKILL.md", isDir: false });

  return nodes;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "md" || ext === "txt") return FileText;
  if (ext === "py" || ext === "ts" || ext === "js" || ext === "sh") return FileCode;
  return FileText;
}

// ---------------------------------------------------------------------------
// FileTreeView
// ---------------------------------------------------------------------------

function FileTreeView({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const Icon = node.isDir
    ? open
      ? FolderOpen
      : Folder
    : getFileIcon(node.name);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 rounded transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <ChevronRight
            className={clsx(
              "w-3 h-3 transition-transform duration-150 flex-shrink-0",
              open && "rotate-90"
            )}
          />
          <Icon className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={clsx(
        "w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors",
        selectedPath === node.path
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// File content preview — markdown rendered, code highlighted, others as text
// ---------------------------------------------------------------------------

const MD_EXTENSIONS = new Set(["md", "mdx", "markdown"]);
const CODE_EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  css: "css",
  html: "html",
  xml: "xml",
  sql: "sql",
};

function FileContentPreview({ content, fileName }: { content: string; fileName: string }) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  // Markdown files → rich render
  if (MD_EXTENSIONS.has(ext)) {
    return (
      <div className="p-4">
        <MarkdownRenderer content={content} className="text-sm" />
      </div>
    );
  }

  // Code files → syntax-highlighted block
  const lang = CODE_EXTENSIONS[ext];
  if (lang) {
    return (
      <div className="p-4">
        <MarkdownRenderer
          content={`\`\`\`${lang}\n${content}\n\`\`\``}
          className="text-xs [&_pre]:!m-0 [&_pre]:!bg-transparent"
        />
      </div>
    );
  }

  // Fallback — plain preformatted text
  return (
    <div className="p-4">
      <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
        {content}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillStudioPanel
// ---------------------------------------------------------------------------

export function SkillStudioPanel() {
  const { t } = useTranslation();
  const tabs = usePulseStore((s) => s.studioPanel.tabs);
  const activeTabId = usePulseStore((s) => s.studioPanel.activeTabId);
  const closeTab = usePulseStore((s) => s.closeStudioTab);
  const setActiveTab = usePulseStore((s) => s.setActiveStudioTab);
  const hidePanel = usePulseStore((s) => s.hideStudioPanel);
  const renameTab = usePulseStore((s) => s.renameStudioTab);

  // Local component state
  const [skillDetail, setSkillDetail] = useState<SkillDetail | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>("SKILL.md");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Fetch skill detail when active tab changes
  const fetchDetail = useCallback(async (skillId: string) => {
    setLoading(true);
    setError(null);
    setSkillDetail(null);
    setFileContent(null);
    setSelectedFile("SKILL.md");

    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillId)}`);
      if (!res.ok) throw new Error("Failed to fetch skill");
      const json = await res.json();
      if (json.success && json.data) {
        setSkillDetail(json.data);
        // Auto-load SKILL.md content
        loadFileContent(skillId, "SKILL.md");
      } else {
        setError(json.error || t("studio.loadFailed"));
      }
    } catch {
      setError(t("studio.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadFileContent = async (skillId: string, filePath: string) => {
    try {
      const res = await fetch(
        `/api/skills/${encodeURIComponent(skillId)}?file=${encodeURIComponent(filePath)}`
      );
      if (!res.ok) {
        setFileContent(null);
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setFileContent(json.data.content);
      }
    } catch {
      setFileContent(null);
    }
  };

  useEffect(() => {
    if (activeTabId) {
      fetchDetail(activeTabId);
    }
  }, [activeTabId, fetchDetail]);

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath);
    if (activeTabId) {
      loadFileContent(activeTabId, filePath);
    }
  };

  const handleRenameStart = () => {
    const tab = tabs.find((t) => t.skillId === activeTabId);
    if (!tab) return;
    setRenameValue(tab.displayName);
    setRenaming(true);
  };

  const handleRenameSubmit = async () => {
    if (!activeTabId || !renameValue.trim()) {
      setRenaming(false);
      return;
    }
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(activeTabId)}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: renameValue.trim() }),
      });
      if (res.ok) {
        renameTab(activeTabId, renameValue.trim());
      }
    } catch {
      // silent fail
    }
    setRenaming(false);
  };

  const handleDownload = () => {
    if (!fileContent || !selectedFile) return;
    const blob = new Blob([fileContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile.split("/").pop() || "file";
    a.click();
    URL.revokeObjectURL(url);
  };

  // No tabs → empty state
  if (tabs.length === 0) {
    return (
      <div className="flex flex-col h-full bg-black">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Wrench className="w-4 h-4" />
            <span>{t("studio.title")}</span>
          </div>
          <button
            onClick={hidePanel}
            className="p-1 text-zinc-500 hover:text-zinc-200 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-zinc-600">{t("studio.noTabs")}</p>
        </div>
      </div>
    );
  }

  const fileTree = skillDetail
    ? buildFileTree(skillDetail.resources)
    : [];

  return (
    <div className="flex flex-col h-full bg-black">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Wrench className="w-4 h-4" />
          <span>{t("studio.title")}</span>
          <span className="text-[10px] text-zinc-600 font-mono">{tabs.length}</span>
        </div>
        <button
          onClick={hidePanel}
          className="p-1 text-zinc-500 hover:text-zinc-200 rounded transition-colors"
          title={t("studio.close")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-0 px-2 py-1 border-b border-zinc-800/60 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.skillId}
            className={clsx(
              "group/tab flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t cursor-pointer transition-colors max-w-[160px]",
              activeTabId === tab.skillId
                ? "bg-zinc-900 text-zinc-100 border-b-2 border-zinc-500"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
            )}
            onClick={() => setActiveTab(tab.skillId)}
          >
            {renaming && activeTabId === tab.skillId ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="bg-transparent border border-zinc-600 rounded px-1 py-0 text-xs text-zinc-100 outline-none w-full"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate">{tab.displayName}</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.skillId);
              }}
              className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover/tab:opacity-100 text-zinc-500 hover:text-zinc-200 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* ── Content area ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-zinc-600 animate-pulse">{t("common.loading")}</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      ) : skillDetail ? (
        <div className="flex-1 flex min-h-0">
          {/* Left: File tree */}
          <div className="w-[160px] flex-shrink-0 border-r border-zinc-800/60 overflow-y-auto py-2">
            <FileTreeView
              nodes={fileTree}
              selectedPath={selectedFile}
              onSelect={handleFileSelect}
            />
          </div>

          {/* Right: Content preview */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* File name bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/40">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 min-w-0">
                {(() => {
                  const Icon = selectedFile ? getFileIcon(selectedFile) : FileText;
                  return <Icon className="w-3.5 h-3.5 flex-shrink-0" />;
                })()}
                <span className="truncate">{selectedFile || "—"}</span>
              </div>
              {fileContent !== null && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors flex-shrink-0"
                  title={t("studio.download")}
                >
                  <Download className="w-3 h-3" />
                  <span>{t("studio.download")}</span>
                </button>
              )}
            </div>

            {/* File content */}
            <div className="flex-1 overflow-auto">
              {fileContent !== null ? (
                <FileContentPreview
                  content={fileContent}
                  fileName={selectedFile || ""}
                />
              ) : (
                <div className="p-4">
                  <p className="text-xs text-zinc-600">
                    {t("studio.loadFailed")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Bottom action bar ── */}
      {skillDetail && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800">
          <button
            onClick={handleRenameStart}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
          >
            <Pencil className="w-3 h-3" />
            <span>{t("studio.rename")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
