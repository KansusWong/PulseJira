/**
 * CodeWriteTool — creates or overwrites a file within a sandboxed workspace.
 *
 * Security model:
 * - `file_path` must be relative.
 * - Resolved/canonical paths must stay inside workspace root.
 * - Symlink targets outside workspace are rejected.
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';

const schema = z.object({
  file_path: z.string().describe('Relative path within the workspace (e.g., "src/utils/helper.ts")'),
  content: z.string().describe('Full file content to write'),
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

export class CodeWriteTool extends BaseTool<Input, string> {
  name = 'code_write';
  description = 'Create a new file or overwrite an existing file within the workspace.';
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

  private resolveTargetPath(filePath: string): string {
    assertRelativeFilePath(filePath);

    const resolved = path.normalize(path.join(this.workspaceRoot, filePath));
    if (!isPathInside(this.workspaceRoot, resolved)) {
      throw new Error(`Path "${filePath}" is outside the workspace boundary.`);
    }

    return resolved;
  }

  private assertWritableBoundary(resolved: string): void {
    let targetStats: fs.Stats;
    try {
      targetStats = fs.lstatSync(resolved);
    } catch {
      return;
    }

    if (targetStats.isDirectory()) {
      throw new Error('file_path points to a directory, not a file.');
    }

    if (targetStats.isSymbolicLink()) {
      throw new Error('Refusing to write through a symlink target.');
    }
  }

  protected async _run(input: Input): Promise<string> {
    const resolved = this.resolveTargetPath(input.file_path);
    this.assertWritableBoundary(resolved);

    // Create parent directories if needed.
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });

    const parentStats = fs.lstatSync(dir);
    if (!parentStats.isDirectory()) {
      throw new Error('Parent path is not a directory.');
    }
    if (parentStats.isSymbolicLink()) {
      throw new Error('Refusing to write into a symlink directory.');
    }

    fs.writeFileSync(resolved, input.content, 'utf-8');
    return `File created: ${input.file_path} (${input.content.length} chars)`;
  }
}
