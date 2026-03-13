import { z } from 'zod';
import type { Stats } from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';
import { getPathContext } from './helpers';

// Bypass Turbopack TP1004 — dynamic fs usage is inherent to this server-side tool
// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const READ_DESC_V1 = `Read the contents of a file with line numbers.
Provide a relative path from the project root.
Supports offset (start line, 1-based) and limit (number of lines) for partial reads.
If the path is a directory, use the \`ls\` tool instead.
Output format: "[File: path (context) | Lines: start-end of total | Size: N chars]" followed by numbered lines.
For SKILL.md files inside skills/, a skill directory hint is injected.`;

const READ_DESC_V2 = 'Read file contents with line numbers. Supports offset/limit for partial reads.';

const ReadInputSchema = z.object({
  path: z.string().describe('Relative path to the file (e.g., "lib/utils.ts")'),
  offset: z.union([z.number(), z.string()]).optional().describe('Starting line number (1-based). Defaults to 1.'),
  limit: z.union([z.number(), z.string()]).optional().describe('Number of lines to read. Defaults to all.'),
});

type ReadInput = z.infer<typeof ReadInputSchema>;

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertRelativePath(inputPath: string): string {
  const normalized = (inputPath || '').trim();

  if (!normalized || path.isAbsolute(normalized)) {
    throw new Error('Path must be a relative path inside the project directory.');
  }

  if (normalized.includes('\0')) {
    throw new Error('Path contains invalid null bytes.');
  }

  return normalized;
}

/** Coerce string numbers to int (defensive against LLM type errors). */
function toInt(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Math.floor(value);
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

/**
 * Reads the content of a single file with line numbers.
 * Supports offset/limit for partial reads.
 * Truncates output at 50K characters.
 */
export class FileReadTool extends BaseTool<ReadInput, string> {
  name = 'read';
  description = selectDesc(READ_DESC_V1, READ_DESC_V2);
  schema = ReadInputSchema;
  private workspaceRoot: string;

  constructor(cwd: string = '.') {
    super();
    this.workspaceRoot = this.normalizeWorkspaceRoot(cwd);
    // Re-compute description on each instantiation (version may have changed)
    this.description = selectDesc(READ_DESC_V1, READ_DESC_V2);
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

  protected async _run(input: ReadInput, ctx?: ToolContext): Promise<string> {
    try {
      const wsRoot = this.workspaceRoot || ctx?.workspacePath || '.';
      const requested = assertRelativePath(input.path);
      const targetPath = path.normalize(path.join(wsRoot, requested));

      if (!isPathInside(wsRoot, targetPath)) {
        return 'Error: Access denied. Cannot read files outside the project directory.';
      }

      let stats: Stats;
      try {
        stats = fs.lstatSync(targetPath);
      } catch {
        return `Error: File "${input.path}" does not exist.`;
      }
      if (stats.isDirectory()) {
        return `Error: Path "${input.path}" is a directory, not a file. Use the \`ls\` tool to view directory contents.`;
      }

      if (stats.isSymbolicLink()) {
        return `Error: Refusing to read symlink path "${input.path}".`;
      }

      const content: string = await fs.promises.readFile(targetPath, 'utf-8');
      const lines = content.split('\n');

      // Parse offset/limit with type coercion
      const offset = toInt(input.offset);
      const limit = toInt(input.limit);

      const startLine = offset && offset > 0 ? offset : 1;
      const endLine = limit && limit > 0 ? Math.min(startLine + limit - 1, lines.length) : lines.length;

      // Format with line numbers
      const numberedLines: string[] = [];
      for (let i = startLine - 1; i < endLine; i++) {
        const lineNum = String(i + 1).padStart(4, ' ');
        numberedLines.push(`${lineNum}\u2502 ${lines[i]}`);
      }

      let output = numberedLines.join('\n');

      // 50K char truncation
      const LIMIT = 50000;
      if (output.length > LIMIT) {
        const linesShown = output.slice(0, LIMIT).split('\n').length;
        output =
          output.slice(0, LIMIT) +
          `\n\n...[Truncated: ${lines.length} total lines, showing ${linesShown} lines. Use offset/limit to read more.]`;
      }

      // Build metadata header with path context
      const pathCtx = getPathContext(targetPath, wsRoot);
      const ctxLabel = pathCtx ? ` ${pathCtx}` : '';
      const totalInfo = `[File: ${input.path}${ctxLabel} | Lines: ${startLine}-${endLine} of ${lines.length} | Size: ${content.length} chars]`;

      // SKILL.md hint
      let skillHint = '';
      const basename = path.basename(input.path);
      if (basename === 'SKILL.md' && input.path.includes('skills/')) {
        const skillDir = path.dirname(input.path);
        skillHint = `\n> \uD83D\uDCCD \u6280\u80FD\u76EE\u5F55: ${skillDir}/\n`;
      }

      return `${totalInfo}${skillHint}\n${output}`;
    } catch (e: any) {
      return `Error reading file: ${e.message}`;
    }
  }
}
