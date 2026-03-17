"use client";

import { useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import clsx from "clsx";
import { MermaidChart } from "./MermaidChart";
import { StreamingMermaidChart } from "./StreamingMermaidChart";
import { ChartBlock } from "./ChartBlock";
import type { Components } from "react-markdown";
import type { Element } from "hast";

/* ── Plugin arrays (stable refs — declared outside component) ── */

const remarkPlugins = [remarkGfm];
const rehypePlugins = [[rehypeHighlight, { ignoreMissing: true }]] as any;

/* ── Mermaid detection ─────────────────────────────────────── */

const MERMAID_KEYWORDS = /^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey|xychart|block-beta)\b/;

function isMermaidCode(lang: string | undefined, content: string): boolean {
  if (lang === "mermaid") return true;
  // Fallback: detect by content when agent uses ```gantt / ```graph / etc.
  if (lang && MERMAID_KEYWORDS.test(lang)) return true;
  // Detect untagged code blocks whose content starts with a mermaid keyword
  if (!lang && MERMAID_KEYWORDS.test(content.trimStart())) return true;
  return false;
}

/* ── Copy button ─────────────────────────────────────────────── */

function CopyButton({ preRef }: { preRef: React.RefObject<HTMLPreElement | null> }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = preRef.current?.innerText ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [preRef]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-2 right-2 z-10 rounded-md px-2 py-1 text-[11px] font-medium
        bg-zinc-700/70 text-zinc-300 opacity-0 group-hover:opacity-100
        hover:bg-zinc-600 transition-all duration-150 cursor-pointer select-none"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/* ── Code block wrapper (holds ref for copy) ─────────────────── */

function CodeBlockWrapper({ children }: { children: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement | null>(null);

  return (
    <div className="relative group">
      <CopyButton preRef={preRef} />
      <pre ref={preRef} className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-sm border border-zinc-800/30">
        {children}
      </pre>
    </div>
  );
}

/* ── Markdown components map factory ──────────────────────────── */

function makeMdComponents(isStreaming: boolean): Components {
  return {
    code({ className, children, node, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const lang = match?.[1];

      const codeText = String(children).replace(/\n$/, "");

      if (lang === "charts") {
        return <ChartBlock code={codeText} className="my-3 not-prose" />;
      }

      if (isMermaidCode(lang, codeText)) {
        if (isStreaming) {
          // Progressive render with debounce & silent error handling
          return <StreamingMermaidChart code={codeText} className="my-3 not-prose" />;
        }
        return <MermaidChart code={codeText} className="my-3 not-prose" />;
      }

      // Determine if this is inline code.
      // rehype-highlight adds className on block code; inline code has no className
      // and its parent is NOT a <pre>.
      const isInline =
        !className && !(node as Element | undefined)?.properties?.className;

      if (isInline) {
        return (
          <code
            className="rounded-sm bg-zinc-800/60 px-1 py-0.5 text-[0.85em] text-zinc-200 font-mono"
            {...props}
          >
            {children}
          </code>
        );
      }

      // Block code (inside <pre>) — rendered with highlight tokens
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },

    pre({ children }) {
      return <CodeBlockWrapper>{children}</CodeBlockWrapper>;
    },
  };
}

const mdComponentsDefault = makeMdComponents(false);
const mdComponentsStreaming = makeMdComponents(true);

/* ── Public component ────────────────────────────────────────── */

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** When true, defers heavy renderers (e.g. Mermaid) until streaming ends. */
  isStreaming?: boolean;
}

export function MarkdownRenderer({ content, className, isStreaming = false }: MarkdownRendererProps) {
  return (
    <div className={clsx(
      "prose prose-invert prose-sm max-w-none break-words",
      "prose-headings:font-medium prose-headings:text-zinc-200",
      "prose-p:text-zinc-300 prose-p:leading-relaxed",
      "prose-strong:font-medium prose-strong:text-zinc-200",
      "prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline",
      className,
    )}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={isStreaming ? mdComponentsStreaming : mdComponentsDefault}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
