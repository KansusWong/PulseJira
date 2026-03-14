/**
 * EditTool — edits an existing file using search-and-replace within a workspace.
 *
 * New interface: single old_str/new_str with optional replace_all flag.
 * For multi-edit operations, use the multi_edit tool instead.
 */

import { z } from 'zod';
import type { Stats } from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolRiskLevel } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';
import type { FileOperationResult } from './file-operation-result';
import { formatFileResult } from './file-operation-result';

// Bypass Turbopack TP1004 — dynamic fs usage is inherent to this server-side tool
// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const EDIT_DESC_V1 = `Edit an EXISTING file by replacing a specific string.
The file MUST already exist. Provide old_str (exact match) and new_str (replacement).
Use replace_all=true to replace all occurrences.
For multiple edits in one file, use multi_edit instead.
Use \`write\` to create new files.
Returns structured result with affected line numbers.`;

const EDIT_DESC_V2 = 'Edit an existing file via search-and-replace. Use replace_all=true for multiple occurrences.';

const schema = z.object({
  path: z.string().describe('Relative path within the workspace'),
  old_str: z.string().describe('Exact string to find in the file'),
  new_str: z.string().describe('String to replace it with (must differ from old_str)'),
  replace_all: z.boolean().optional().default(false).describe('Replace all occurrences (default: false, replaces first only)'),
});

type Input = z.infer<typeof schema>;

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertRelativeFilePath(filePath: string): void {
  if (!filePath || path.isAbsolute(filePath)) {
    throw new Error('path must be a relative path inside the workspace.');
  }

  if (filePath.includes('\0')) {
    throw new Error('path contains invalid null bytes.');
  }
}

export class CodeEditTool extends BaseTool<Input, string> {
  name = 'edit';
  description = selectDesc(EDIT_DESC_V1, EDIT_DESC_V2);
  schema = schema;
  requiresApproval = true;
  riskLevel = 'low' as const satisfies ToolRiskLevel;

  private workspaceRoot?: string;

  constructor(cwd?: string) {
    super();
    if (cwd) {
      this.workspaceRoot = this.normalizeWorkspaceRoot(cwd);
    }
    this.description = selectDesc(EDIT_DESC_V1, EDIT_DESC_V2);
  }

  private normalizeWorkspaceRoot(cwd: string): string {
    const normalized = (cwd || '').trim();
    if (!normalized) {
      throw new Error('Workspace root is required.');
    }
    if (normalized.includes('\0')) {
      throw new Error('Workspace root contains invalid null bytes.');
    }
    if (!path.isAbsolute(normalized)) {
      throw new Error('Workspace root must be an absolute path.');
    }
    return path.normalize(normalized);
  }

  private getWorkspaceRoot(ctx?: ToolContext): string {
    const root = this.workspaceRoot || ctx?.workspacePath;
    if (!root) throw new Error('No workspace root: provide cwd in constructor or ToolContext.');
    return root;
  }

  private resolveExistingFile(filePath: string, ctx?: ToolContext): string {
    assertRelativeFilePath(filePath);

    const wsRoot = this.getWorkspaceRoot(ctx);
    const resolved = path.normalize(path.join(wsRoot, filePath));
    if (!isPathInside(wsRoot, resolved)) {
      throw new Error(`Path "${filePath}" is outside the workspace boundary.`);
    }

    let stats: Stats;
    try {
      stats = fs.lstatSync(resolved);
    } catch {
      throw new Error(`File not found: ${filePath}. Use \`write\` to create new files.`);
    }
    if (stats.isDirectory()) {
      throw new Error(`Path "${filePath}" points to a directory, not a file.`);
    }

    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to edit symlink path: ${filePath}`);
    }

    return resolved;
  }

  /** Calculate the line number where old_str starts in the content. */
  private _calcStartLine(content: string, oldStr: string): number {
    const idx = content.indexOf(oldStr);
    if (idx < 0) return -1;
    return content.substring(0, idx).split('\n').length;
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const resolved = this.resolveExistingFile(input.path, ctx);

    let content: string = await fs.promises.readFile(resolved, 'utf-8');

    if (input.old_str === input.new_str) {
      return 'Error: old_str and new_str are identical. No changes needed.';
    }

    if (!content.includes(input.old_str)) {
      // Provide file preview to help LLM correct its match
      const lines = content.split('\n');
      const preview = lines.slice(0, 30).map((l, i) => `${String(i + 1).padStart(4, ' ')}\u2502 ${l}`).join('\n');
      return `Error: old_str not found in ${input.path}.\n\nFile preview (first 30 lines):\n${preview}\n\nCheck your old_str matches the file content exactly (including whitespace and indentation).`;
    }

    // Count occurrences
    const occurrences = content.split(input.old_str).length - 1;

    if (occurrences > 1 && !input.replace_all) {
      return `Error: old_str matches ${occurrences} locations in ${input.path}. Use replace_all=true to replace all, or provide more context in old_str to make it unique.`;
    }

    // Calculate affected lines before replacement
    const linesAffected: number[] = [];
    const startLine = this._calcStartLine(content, input.old_str);
    if (startLine > 0) {
      const oldLines = input.old_str.split('\n').length;
      for (let i = 0; i < oldLines; i++) {
        linesAffected.push(startLine + i);
      }
    }

    if (input.replace_all) {
      content = content.split(input.old_str).join(input.new_str);
    } else {
      content = content.replace(input.old_str, input.new_str);
    }

    await fs.promises.writeFile(resolved, content, 'utf-8');
    const replacedCount = input.replace_all ? occurrences : 1;

    const result: FileOperationResult = {
      success: true,
      message: `Edited ${input.path}: replaced ${replacedCount} occurrence(s).`,
      filePath: input.path,
      linesAffected,
    };

    return formatFileResult(result);
  }
}
