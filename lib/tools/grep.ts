/**
 * GrepTool — content search using regex patterns.
 * Uses async ripgrep with --json output, falls back to Node.js implementation.
 */

import { z } from 'zod';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';
import { getSearchDirsWithLabels } from './helpers';

// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');
// eslint-disable-next-line no-eval
const { spawn: spawnProcess }: any = eval('require')('child_process');

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const GREP_DESC_V1 = `Search file contents using regex patterns.
Uses ripgrep (async) for speed with --json structured output, falls back to Node.js.
Output modes: "files" (file paths), "content" (matching lines with context), "count" (match counts per file).
Automatically skips .git, node_modules.
Supports offset parameter for paginated results.
Results are labeled by source directory.`;

const GREP_DESC_V2 = 'Search file contents by regex. Modes: files, content, count. Skips .git/node_modules.';

const schema = z.object({
  pattern: z.string().describe('Regular expression pattern to search for'),
  path: z.string().optional().describe('Directory or file to search in (relative, default: workspace root)'),
  glob_filter: z.string().optional().describe('File name filter (e.g., "*.ts", "*.{ts,tsx}")'),
  ignore_case: z.boolean().optional().default(false).describe('Case-insensitive search'),
  context_before: z.number().optional().describe('Lines of context before each match'),
  context_after: z.number().optional().describe('Lines of context after each match'),
  context: z.number().optional().describe('Lines of context before and after each match'),
  multiline: z.boolean().optional().default(false).describe('Enable multiline matching'),
  output_mode: z.enum(['content', 'files', 'count']).optional().default('files').describe('Output mode: content (matching lines), files (file paths only), count (match counts)'),
  max_results: z.number().optional().default(100).describe('Maximum results (default 100)'),
  offset: z.number().optional().default(0).describe('Skip first N results (for pagination)'),
});

type Input = z.infer<typeof schema>;

/** Default directories to skip. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', '.turbo', 'coverage']);

// ---------------------------------------------------------------------------
// Async ripgrep with --json output
// ---------------------------------------------------------------------------

interface RgJsonMatch {
  file: string;
  line: number;
  content: string;
}

function tryRipgrepAsync(args: string[], cwd: string): Promise<{ matches: RgJsonMatch[]; raw: string } | null> {
  return new Promise((resolve) => {
    try {
      const child = spawnProcess('rg', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      });

      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk));

      child.on('close', (code: number) => {
        if (code === 1) {
          // No matches
          resolve({ matches: [], raw: '' });
          return;
        }

        const output = Buffer.concat(chunks).toString('utf-8');

        // Check if --json mode was used
        if (args.includes('--json')) {
          const matches: RgJsonMatch[] = [];
          const lines = output.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'match' && parsed.data) {
                const matchData = parsed.data;
                matches.push({
                  file: matchData.path?.text || '',
                  line: matchData.line_number || 0,
                  content: matchData.lines?.text?.replace(/\n$/, '') || '',
                });
              }
            } catch {
              // Skip unparseable lines
            }
          }
          resolve({ matches, raw: output });
        } else {
          resolve({ matches: [], raw: output });
        }
      });

      child.on('error', () => {
        resolve(null); // ripgrep not found
      });
    } catch {
      resolve(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Node.js fallback
// ---------------------------------------------------------------------------

function matchesGlob(filename: string, pattern: string): boolean {
  // Handle {a,b} patterns
  if (pattern.includes('{') && pattern.includes('}')) {
    const match = pattern.match(/^(.*)\{([^}]+)\}(.*)$/);
    if (match) {
      const [, prefix, options, suffix] = match;
      return options.split(',').some(opt => matchesGlob(filename, `${prefix}${opt}${suffix}`));
    }
  }
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(filename);
}

interface SearchResult {
  file: string;
  line: number;
  content: string;
  contextBefore?: string[];
  contextAfter?: string[];
  label?: string;
}

function searchNodeFallback(
  wsRoot: string,
  searchDir: string,
  pattern: RegExp,
  globFilter: string | undefined,
  maxResults: number,
  contextBefore: number,
  contextAfter: number,
  label: string,
): SearchResult[] {
  const results: SearchResult[] = [];

  function walk(dir: string): void {
    if (results.length >= maxResults) return;

    let entries: any[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (globFilter && !matchesGlob(entry.name, globFilter)) continue;

        let content: string;
        try {
          content = fs.readFileSync(fullPath, 'utf-8');
        } catch {
          continue;
        }

        const lines = content.split('\n');
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          if (pattern.test(lines[i])) {
            const before = contextBefore > 0 ? lines.slice(Math.max(0, i - contextBefore), i) : undefined;
            const after = contextAfter > 0 ? lines.slice(i + 1, Math.min(lines.length, i + 1 + contextAfter)) : undefined;
            results.push({
              file: path.relative(wsRoot, fullPath).replace(/\\/g, '/'),
              line: i + 1,
              content: lines[i],
              contextBefore: before,
              contextAfter: after,
              label,
            });
          }
        }
      }
    }
  }

  walk(searchDir);
  return results;
}

// ---------------------------------------------------------------------------
// GrepTool
// ---------------------------------------------------------------------------

export class GrepTool extends BaseTool<Input, string> {
  name = 'grep';
  description = selectDesc(GREP_DESC_V1, GREP_DESC_V2);
  schema = schema;

  private workspaceRoot?: string;

  constructor(cwd?: string) {
    super();
    if (cwd) {
      this.workspaceRoot = path.normalize(cwd);
    }
    this.description = selectDesc(GREP_DESC_V1, GREP_DESC_V2);
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const wsRoot = this.workspaceRoot || ctx?.workspacePath || '.';
    const offset = input.offset || 0;
    const maxResults = Math.min(input.max_results || 100, 500);
    const ctxBefore = input.context_before ?? input.context ?? 0;
    const ctxAfter = input.context_after ?? input.context ?? 0;

    // Determine search path
    let searchPath = wsRoot;
    if (input.path) {
      if (path.isAbsolute(input.path)) {
        return 'Error: path must be relative.';
      }
      searchPath = path.resolve(wsRoot, input.path);
    }

    // Try async ripgrep with --json first
    const rgArgs: string[] = ['--json'];
    if (input.ignore_case) rgArgs.push('-i');
    if (input.multiline) rgArgs.push('-U', '--multiline-dotall');

    // For non-json modes we still use --json and post-process
    if (ctxBefore > 0) rgArgs.push(`-B${ctxBefore}`);
    if (ctxAfter > 0) rgArgs.push(`-A${ctxAfter}`);

    rgArgs.push(`-m${maxResults + offset}`);

    if (input.glob_filter) {
      rgArgs.push('--glob', input.glob_filter);
    }

    rgArgs.push('--', input.pattern, searchPath);

    const rgResult = await tryRipgrepAsync(rgArgs, wsRoot);

    if (rgResult !== null) {
      let matches = rgResult.matches;

      if (matches.length === 0) {
        return `No matches found for pattern "${input.pattern}".`;
      }

      // Make paths relative
      matches = matches.map(m => ({
        ...m,
        file: m.file.startsWith(wsRoot) ? m.file.slice(wsRoot.length + 1) : m.file,
      }));

      // Apply offset
      if (offset > 0) {
        matches = matches.slice(offset);
      }

      // Limit
      matches = matches.slice(0, maxResults);

      if (matches.length === 0) {
        return `No matches found after offset ${offset}.`;
      }

      // Format output based on mode
      if (input.output_mode === 'files') {
        const files = [...new Set(matches.map(m => m.file))];
        return files.join('\n');
      }

      if (input.output_mode === 'count') {
        const counts = new Map<string, number>();
        for (const m of matches) {
          counts.set(m.file, (counts.get(m.file) || 0) + 1);
        }
        return Array.from(counts.entries())
          .map(([file, count]) => `${file}:${count}`)
          .join('\n');
      }

      // content mode
      return matches.map(m => `${m.file}:${m.line}:${m.content}`).join('\n');
    }

    // Fallback to Node.js implementation
    let regex: RegExp;
    try {
      const flags = [input.ignore_case ? 'i' : '', input.multiline ? 'ms' : ''].join('');
      regex = new RegExp(input.pattern, flags);
    } catch (e: any) {
      return `Error: Invalid regex pattern: ${e.message}`;
    }

    // Use labeled search dirs if searching workspace root
    let allResults: SearchResult[] = [];
    if (!input.path) {
      const searchDirs = getSearchDirsWithLabels(wsRoot);
      for (const { dir, label } of searchDirs) {
        const results = searchNodeFallback(wsRoot, dir, regex, input.glob_filter, maxResults + offset, ctxBefore, ctxAfter, label);
        allResults.push(...results);
      }
    } else {
      allResults = searchNodeFallback(wsRoot, searchPath, regex, input.glob_filter, maxResults + offset, ctxBefore, ctxAfter, '');
    }

    if (allResults.length === 0) {
      return `No matches found for pattern "${input.pattern}".`;
    }

    // Apply offset
    if (offset > 0) {
      allResults = allResults.slice(offset);
    }
    allResults = allResults.slice(0, maxResults);

    if (allResults.length === 0) {
      return `No matches found after offset ${offset}.`;
    }

    if (input.output_mode === 'files') {
      const files = [...new Set(allResults.map(r => r.file))];
      return files.join('\n');
    }

    if (input.output_mode === 'count') {
      const counts = new Map<string, number>();
      for (const r of allResults) {
        counts.set(r.file, (counts.get(r.file) || 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([file, count]) => `${file}:${count}`)
        .join('\n');
    }

    // content mode
    return allResults.map(r => {
      const parts: string[] = [];
      const labelPrefix = r.label ? `[${r.label}] ` : '';
      if (r.contextBefore?.length) {
        r.contextBefore.forEach((l, idx) => {
          parts.push(`${labelPrefix}${r.file}:${r.line - r.contextBefore!.length + idx}-${l}`);
        });
      }
      parts.push(`${labelPrefix}${r.file}:${r.line}:${r.content}`);
      if (r.contextAfter?.length) {
        r.contextAfter.forEach((l, idx) => {
          parts.push(`${labelPrefix}${r.file}:${r.line + 1 + idx}-${l}`);
        });
      }
      return parts.join('\n');
    }).join('\n--\n');
  }
}
