import { z } from 'zod';
import type { Stats } from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';

// Bypass Turbopack TP1004 — dynamic fs usage is inherent to this server-side tool
// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');

const FileReadInputSchema = z.object({
  path: z.string().describe('Relative path to the file (e.g., "lib/utils.ts")'),
});

type FileReadInput = z.infer<typeof FileReadInputSchema>;

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

/**
 * Reads the content of a single file.
 * Truncates output at 8000 characters for large files.
 */
export class FileReadTool extends BaseTool<FileReadInput, string> {
  name = 'read_file';
  description = 'Read the contents of a file to understand existing code logic and structure. Use this before planning changes to a file. Provide a relative path from the project root.';
  schema = FileReadInputSchema;
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

  protected async _run(input: FileReadInput): Promise<string> {
    try {
      const requested = assertRelativePath(input.path);
      const targetPath = path.normalize(path.join(this.workspaceRoot, requested));

      if (!isPathInside(this.workspaceRoot, targetPath)) {
        return 'Error: Access denied. Cannot read files outside the project directory.';
      }

      let stats: Stats;
      try {
        stats = fs.lstatSync(targetPath);
      } catch {
        return `Error: File "${input.path}" does not exist.`;
      }
      if (stats.isDirectory()) {
        return `Error: Path "${input.path}" is a directory, not a file. Use the list_files tool to view directory contents.`;
      }

      if (stats.isSymbolicLink()) {
        return `Error: Refusing to read symlink path "${input.path}".`;
      }

      const content = await fs.promises.readFile(targetPath, 'utf-8');
      const LIMIT = 8000;
      if (content.length > LIMIT) {
        return (
          content.slice(0, LIMIT) +
          `\n\n...[Truncated: ${content.length} chars total, showing first ${LIMIT}]...`
        );
      }
      return content;
    } catch (e: any) {
      return `Error reading file: ${e.message}`;
    }
  }
}
