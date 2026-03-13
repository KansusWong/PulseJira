import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const LS_DESC_V1 = `List files and directories at a given path with sizes.
Hidden files, node_modules, and symlinks are filtered out.
Use \`ignore\` parameter to add custom exclusions.
Special shortcuts: "~" or "workspace" resolves to the workspace root.
When listing the root directory, a workspace overview summary is appended.`;

const LS_DESC_V2 = 'List directory contents with sizes. Filters hidden files and node_modules.';

const LsInputSchema = z.object({
  dir: z.string().optional().default('.').describe('Relative path to directory (e.g., "lib/agents"). Defaults to project root. Use "~" or "workspace" for workspace root.'),
  ignore: z.array(z.string()).optional().describe('Glob patterns to ignore (e.g., ["*.log", "dist"])'),
});

type LsInput = z.infer<typeof LsInputSchema>;

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertRelativeDir(inputDir: string): string {
  const normalized = (inputDir || '.').trim() || '.';

  if (path.isAbsolute(normalized)) {
    throw new Error('Directory path must be relative to the project root.');
  }

  if (normalized.includes('\0')) {
    throw new Error('Directory path contains invalid null bytes.');
  }

  return normalized;
}

/** Simple glob pattern matching (supports * and ? only). */
function matchesGlob(name: string, pattern: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regex}$`).test(name);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Build a brief workspace overview (key directories, config files, etc.).
 */
function _buildWorkspaceOverview(wsRoot: string): string {
  const parts: string[] = [];

  // Check for common config files
  const configFiles = ['package.json', 'tsconfig.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'];
  const foundConfigs: string[] = [];
  for (const f of configFiles) {
    try {
      if (fs.existsSync(path.join(wsRoot, f))) {
        foundConfigs.push(f);
      }
    } catch {
      // Ignore
    }
  }
  if (foundConfigs.length > 0) {
    parts.push(`\u914D\u7F6E\u6587\u4EF6: ${foundConfigs.join(', ')}`);
  }

  // Check for key directories
  const keyDirs = ['src', 'lib', 'app', 'components', 'skills', 'tests', 'scripts'];
  const foundDirs: string[] = [];
  for (const d of keyDirs) {
    try {
      const stat = fs.statSync(path.join(wsRoot, d));
      if (stat.isDirectory()) {
        foundDirs.push(d + '/');
      }
    } catch {
      // Ignore
    }
  }
  if (foundDirs.length > 0) {
    parts.push(`\u4E3B\u8981\u76EE\u5F55: ${foundDirs.join(', ')}`);
  }

  if (parts.length === 0) return '';
  return `\n\n--- \u5DE5\u4F5C\u533A\u6982\u89C8 ---\n${parts.join('\n')}`;
}

/**
 * Lists files and directories at a given path.
 * Filters out hidden files, symlinks, and node_modules.
 * Shows file sizes and directory markers.
 */
export class FileListTool extends BaseTool<LsInput, string> {
  name = 'ls';
  description = selectDesc(LS_DESC_V1, LS_DESC_V2);
  schema = LsInputSchema;
  private workspaceRoot: string;

  constructor(cwd: string = '.') {
    super();
    this.workspaceRoot = this.normalizeWorkspaceRoot(cwd);
    this.description = selectDesc(LS_DESC_V1, LS_DESC_V2);
  }

  private normalizeWorkspaceRoot(cwd: string): string {
    const normalized = (cwd || '').trim();
    if (!normalized) {
      throw new Error('Workspace root is required.');
    }
    if (normalized.includes('\0')) {
      throw new Error('Workspace root contains invalid null bytes.');
    }
    return path.normalize(normalized);
  }

  protected async _run(input: LsInput, ctx?: ToolContext): Promise<string> {
    try {
      const wsRoot = this.workspaceRoot || ctx?.workspacePath || '.';

      // Handle ~ and workspace shortcuts
      let dirInput = input.dir || '.';
      if (dirInput === '~' || dirInput === 'workspace') {
        dirInput = '.';
      }

      const requestedDir = assertRelativeDir(dirInput);
      const targetPath = path.normalize(path.join(wsRoot, requestedDir));

      if (!isPathInside(wsRoot, targetPath)) {
        return 'Error: Access denied. Cannot access files outside the project directory.';
      }

      let stats: fs.Stats;
      try {
        stats = fs.lstatSync(targetPath);
      } catch {
        return `Error: Directory "${input.dir}" does not exist.`;
      }
      if (!stats.isDirectory()) {
        return `Error: Path "${input.dir}" is not a directory.`;
      }

      if (stats.isSymbolicLink()) {
        return `Error: Refusing to list symlink directory "${input.dir}".`;
      }

      const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
      const ignorePatterns = input.ignore || [];

      const results: string[] = [];

      for (const entry of entries) {
        // Skip hidden files
        if (entry.name.startsWith('.')) continue;
        // Skip node_modules
        if (entry.name === 'node_modules') continue;
        // Skip symlinks
        if (entry.isSymbolicLink()) continue;
        // Skip custom ignore patterns
        if (ignorePatterns.some((p: string) => matchesGlob(entry.name, p))) continue;

        const entryPath = path.join(targetPath, entry.name);

        if (entry.isDirectory()) {
          results.push(`\uD83D\uDCC1 ${entry.name}/`);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(entryPath);
            results.push(`\uD83D\uDCC4 ${entry.name}  ${formatSize(stat.size)}`);
          } catch {
            results.push(`\uD83D\uDCC4 ${entry.name}`);
          }
        }
      }

      const LIMIT = 100;
      const shown = results.slice(0, LIMIT);
      let output = shown.join('\n');
      if (results.length > LIMIT) {
        output += `\n\n(and ${results.length - LIMIT} more entries)`;
      }

      // Append workspace overview when listing root
      const isRoot = requestedDir === '.' || requestedDir === '';
      if (isRoot) {
        output += _buildWorkspaceOverview(wsRoot);
      }

      return output || '(empty directory)';
    } catch (e: any) {
      return `Error listing files: ${e.message}`;
    }
  }
}
