import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';

const FileListInputSchema = z.object({
  dir: z.string().describe('Relative path to directory (e.g., "lib/agents")'),
});

type FileListInput = z.infer<typeof FileListInputSchema>;

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

/**
 * Lists files and directories at a given path.
 * Filters out hidden files and node_modules.
 */
export class FileListTool extends BaseTool<FileListInput, string> {
  name = 'list_files';
  description = 'List files and directories at a given path to understand project structure. Use this as a first step to orient yourself in the codebase before reading specific files. Hidden files and node_modules are filtered out.';
  schema = FileListInputSchema;
  private workspaceRoot: string;

  constructor(cwd: string = '.') {
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
    return path.normalize(normalized);
  }

  protected async _run(input: FileListInput): Promise<string> {
    try {
      const requestedDir = assertRelativeDir(input.dir);
      const targetPath = path.normalize(path.join(this.workspaceRoot, requestedDir));

      if (!isPathInside(this.workspaceRoot, targetPath)) {
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

      const files = await fs.promises.readdir(targetPath);
      const filtered = files.filter((f) => !f.startsWith('.') && f !== 'node_modules');

      const LIMIT = 50;
      const result = filtered.slice(0, LIMIT);
      const hasMore = filtered.length > LIMIT;

      let output = JSON.stringify(result);
      if (hasMore) {
        output += `\n(and ${filtered.length - LIMIT} more files)`;
      }
      return output;
    } catch (e: any) {
      return `Error listing files: ${e.message}`;
    }
  }
}
