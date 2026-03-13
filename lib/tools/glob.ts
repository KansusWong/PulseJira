/**
 * GlobTool — fast file pattern matching.
 * Finds files matching glob patterns, sorted by modification time.
 */

import { z } from 'zod';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';
import { getSearchDirsWithLabels } from './helpers';

// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const GLOB_DESC_V1 = `Find files matching a glob pattern.
Automatically skips .git, node_modules, __pycache__.
Returns up to 100 results sorted by modification time (newest first).
If pattern has no path separator, it searches recursively.
Results are labeled by source directory (e.g., [skills] path).`;

const GLOB_DESC_V2 = 'Find files by glob pattern. Skips .git/node_modules. Newest first, max 100.';

const schema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g., "**/*.ts", "src/**/*.tsx", "*.json")'),
  directory: z.string().optional().describe('Directory to search in (relative to workspace, default: workspace root)'),
});

type Input = z.infer<typeof schema>;

/** Default directories to skip. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', '.turbo', 'coverage']);

/** Simple glob to regex converter supporting **, *, and ?. */
function globToRegex(pattern: string): RegExp {
  // Normalize
  let p = pattern.replace(/\\/g, '/');

  // If pattern has no path separator, add **/ prefix to search recursively
  if (!p.includes('/')) {
    p = `**/${p}`;
  }

  // Escape regex special chars except * and ?
  let regex = '';
  let i = 0;
  while (i < p.length) {
    if (p[i] === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') {
        regex += '(?:.+/)?';
        i += 3;
      } else {
        regex += '.*';
        i += 2;
      }
    } else if (p[i] === '*') {
      regex += '[^/]*';
      i++;
    } else if (p[i] === '?') {
      regex += '[^/]';
      i++;
    } else if ('.+^${}()|[]\\'.includes(p[i])) {
      regex += '\\' + p[i];
      i++;
    } else {
      regex += p[i];
      i++;
    }
  }

  return new RegExp(`^${regex}$`);
}

interface FileEntry {
  relativePath: string;
  mtimeMs: number;
  label: string;
}

function walkDirectory(dir: string, wsRoot: string, results: FileEntry[], maxResults: number, label: string): void {
  if (results.length >= maxResults) return;

  let entries: any[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) return;
    if (entry.name.startsWith('.') && SKIP_DIRS.has(entry.name)) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      walkDirectory(fullPath, wsRoot, results, maxResults, label);
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        results.push({
          relativePath: path.relative(wsRoot, fullPath).replace(/\\/g, '/'),
          mtimeMs: stat.mtimeMs,
          label,
        });
      } catch {
        // Skip inaccessible files
      }
    }
  }
}

export class GlobTool extends BaseTool<Input, string> {
  name = 'glob';
  description = selectDesc(GLOB_DESC_V1, GLOB_DESC_V2);
  schema = schema;

  private workspaceRoot?: string;

  constructor(cwd?: string) {
    super();
    if (cwd) {
      this.workspaceRoot = path.normalize(cwd);
    }
    this.description = selectDesc(GLOB_DESC_V1, GLOB_DESC_V2);
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const wsRoot = this.workspaceRoot || ctx?.workspacePath || '.';

    // Build search directories with labels
    let searchDirs: Array<{ dir: string; label: string }>;

    if (input.directory) {
      if (path.isAbsolute(input.directory)) {
        return 'Error: directory must be a relative path.';
      }
      searchDirs = [{ dir: path.resolve(wsRoot, input.directory), label: '' }];
    } else {
      searchDirs = getSearchDirsWithLabels(wsRoot);
    }

    const regex = globToRegex(input.pattern);

    // Collect all files (up to a generous internal limit) from all search dirs
    const allFiles: FileEntry[] = [];
    for (const { dir, label } of searchDirs) {
      walkDirectory(dir, wsRoot, allFiles, 10000, label);
    }

    // Filter by pattern
    const matched = allFiles.filter(f => regex.test(f.relativePath));

    // Sort by modification time (newest first)
    matched.sort((a, b) => b.mtimeMs - a.mtimeMs);

    // Limit to 100 results
    const MAX = 100;
    const shown = matched.slice(0, MAX);

    if (shown.length === 0) {
      return `No files matched pattern "${input.pattern}".`;
    }

    let output = shown.map(f => {
      if (f.label) {
        return `[${f.label}] ${f.relativePath}`;
      }
      return f.relativePath;
    }).join('\n');

    if (matched.length > MAX) {
      output += `\n\n(${matched.length - MAX} more results not shown)`;
    }

    return output;
  }
}
