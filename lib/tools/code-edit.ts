/**
 * CodeEditTool — edits an existing file using search-and-replace within a workspace.
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';

const editSchema = z.object({
  search: z.string().describe('Exact string to find in the file'),
  replace: z.string().describe('String to replace it with'),
});

const schema = z.object({
  file_path: z.string().describe('Relative path within the workspace'),
  edits: z.array(editSchema).describe('List of search-and-replace operations to apply sequentially'),
});

type Input = z.infer<typeof schema>;

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertRelativeFilePath(filePath: string): void {
  if (!filePath || path.isAbsolute(filePath)) {
    throw new Error('file_path must be a relative path inside the workspace.');
  }

  if (filePath.includes('\0')) {
    throw new Error('file_path contains invalid null bytes.');
  }
}

export class CodeEditTool extends BaseTool<Input, string> {
  name = 'code_edit';
  description = 'Edit an EXISTING file by applying search-and-replace operations. The file MUST already exist — if it does not, this tool will fail. Use code_write to create new files. Before calling this tool, verify the file exists using read_file or list_files.';
  schema = schema;
  requiresApproval = true;

  private workspaceRoot: string;

  constructor(cwd: string) {
    super();
    this.workspaceRoot = this.normalizeWorkspaceRoot(cwd);
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

  private resolveExistingFile(filePath: string): string {
    assertRelativeFilePath(filePath);

    const resolved = path.normalize(path.join(this.workspaceRoot, filePath));
    if (!isPathInside(this.workspaceRoot, resolved)) {
      throw new Error(`Path "${filePath}" is outside the workspace boundary.`);
    }

    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(resolved);
    } catch {
      throw new Error(`File not found: ${filePath}. Use code_write to create new files.`);
    }
    if (stats.isDirectory()) {
      throw new Error(`Path "${filePath}" points to a directory, not a file.`);
    }

    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to edit symlink path: ${filePath}`);
    }

    return resolved;
  }

  protected async _run(input: Input): Promise<string> {
    const resolved = this.resolveExistingFile(input.file_path);

    let content = await fs.promises.readFile(resolved, 'utf-8');
    const results: string[] = [];

    for (const edit of input.edits) {
      if (content.includes(edit.search)) {
        content = content.replace(edit.search, edit.replace);
        results.push(`Replaced: "${edit.search.slice(0, 50)}..." → "${edit.replace.slice(0, 50)}..."`);
      } else {
        results.push(`Not found: "${edit.search.slice(0, 80)}..."`);
      }
    }

    await fs.promises.writeFile(resolved, content, 'utf-8');
    return `Edited ${input.file_path}:\n${results.join('\n')}`;
  }
}
