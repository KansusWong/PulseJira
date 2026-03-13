/**
 * MultiEditTool — atomic batch editing of a single file.
 * All edits succeed or none are applied.
 */

import { z } from 'zod';
import type { Stats } from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';
import type { FileOperationResult } from './file-operation-result';
import { formatFileResult } from './file-operation-result';

// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const MULTI_EDIT_DESC_V1 = `Apply multiple search-and-replace edits to a single file atomically.
All edits succeed or none are applied (rollback on failure).
Edits are executed sequentially — later edits operate on the result of earlier ones.
Returns structured result with affected line numbers.`;

const MULTI_EDIT_DESC_V2 = 'Atomic batch search-and-replace on a single file. All-or-nothing.';

const editItemSchema = z.object({
  old_str: z.string().describe('Exact string to find'),
  new_str: z.string().describe('Replacement string'),
  replace_all: z.boolean().optional().default(false).describe('Replace all occurrences'),
});

const schema = z.object({
  path: z.string().describe('Relative path within the workspace'),
  edits: z.array(editItemSchema).min(1).describe('List of edits to apply atomically in order'),
});

type Input = z.infer<typeof schema>;

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export class MultiEditTool extends BaseTool<Input, string> {
  name = 'multi_edit';
  description = selectDesc(MULTI_EDIT_DESC_V1, MULTI_EDIT_DESC_V2);
  schema = schema;
  requiresApproval = true;

  private workspaceRoot?: string;

  constructor(cwd?: string) {
    super();
    if (cwd) {
      this.workspaceRoot = path.normalize(cwd);
    }
    this.description = selectDesc(MULTI_EDIT_DESC_V1, MULTI_EDIT_DESC_V2);
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const wsRoot = this.workspaceRoot || ctx?.workspacePath;
    if (!wsRoot) throw new Error('No workspace root available.');

    if (!input.path || path.isAbsolute(input.path)) {
      return 'Error: path must be a relative path inside the workspace.';
    }

    const resolved = path.normalize(path.join(wsRoot, input.path));
    if (!isPathInside(wsRoot, resolved)) {
      return `Error: Path "${input.path}" is outside the workspace boundary.`;
    }

    let stats: Stats;
    try {
      stats = fs.lstatSync(resolved);
    } catch {
      return `Error: File not found: ${input.path}. Use \`write\` to create new files.`;
    }
    if (stats.isDirectory()) {
      return `Error: Path "${input.path}" points to a directory, not a file.`;
    }
    if (stats.isSymbolicLink()) {
      return `Error: Refusing to edit symlink path: ${input.path}`;
    }

    const originalContent: string = await fs.promises.readFile(resolved, 'utf-8');

    // Dry run: apply all edits to a copy to verify they all succeed
    let content = originalContent;
    const results: string[] = [];
    const allLinesAffected: number[] = [];

    for (let i = 0; i < input.edits.length; i++) {
      const edit = input.edits[i];

      if (edit.old_str === edit.new_str) {
        return `Error: Edit #${i + 1}: old_str and new_str are identical.`;
      }

      if (!content.includes(edit.old_str)) {
        return `Error: Edit #${i + 1} failed: old_str not found in file after previous edits.\nSearched for: "${edit.old_str.slice(0, 80)}..."`;
      }

      const occurrences = content.split(edit.old_str).length - 1;

      if (occurrences > 1 && !edit.replace_all) {
        return `Error: Edit #${i + 1}: old_str matches ${occurrences} locations. Use replace_all=true or provide more context.`;
      }

      // Calculate affected line number
      const idx = content.indexOf(edit.old_str);
      if (idx >= 0) {
        const startLine = content.substring(0, idx).split('\n').length;
        const editLines = edit.old_str.split('\n').length;
        for (let l = 0; l < editLines; l++) {
          allLinesAffected.push(startLine + l);
        }
      }

      if (edit.replace_all) {
        content = content.split(edit.old_str).join(edit.new_str);
        results.push(`#${i + 1}: replaced ${occurrences} occurrence(s)`);
      } else {
        content = content.replace(edit.old_str, edit.new_str);
        results.push(`#${i + 1}: replaced 1 occurrence`);
      }
    }

    // All edits succeeded — write atomically
    await fs.promises.writeFile(resolved, content, 'utf-8');

    const result: FileOperationResult = {
      success: true,
      message: `Applied ${input.edits.length} edits to ${input.path}:\n${results.join('\n')}`,
      filePath: input.path,
      linesAffected: allLinesAffected,
    };

    return formatFileResult(result);
  }
}
