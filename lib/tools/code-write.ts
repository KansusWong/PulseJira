/**
 * WriteTool — creates or overwrites a file within a sandboxed workspace.
 *
 * Security model:
 * - `path` must be relative.
 * - Resolved/canonical paths must stay inside workspace root.
 * - Symlink targets outside workspace are rejected.
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolRiskLevel } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';
import { getPathContext } from './helpers';

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const WRITE_DESC_V1 = `Create a new file or overwrite an existing file within the workspace.
Automatically creates parent directories if they don't exist.
The path must be relative to the workspace root.
Symlink targets are rejected for safety.
Output includes a location hint (e.g., "(session file)") and line count.`;

const WRITE_DESC_V2 = 'Create or overwrite a file in the workspace. Auto-creates parent dirs.';

const schema = z.object({
  path: z.string().describe('Relative path within the workspace (e.g., "src/utils/helper.ts")'),
  content: z.string().describe('Full file content to write'),
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

export class CodeWriteTool extends BaseTool<Input, string> {
  name = 'write';
  description = selectDesc(WRITE_DESC_V1, WRITE_DESC_V2);
  schema = schema;
  requiresApproval = true;
  riskLevel = 'low' as const satisfies ToolRiskLevel;

  private workspaceRoot?: string;

  constructor(cwd?: string) {
    super();
    if (cwd) {
      this.workspaceRoot = this.normalizeWorkspaceRoot(cwd);
    }
    this.description = selectDesc(WRITE_DESC_V1, WRITE_DESC_V2);
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

  private resolveTargetPath(filePath: string, ctx?: ToolContext): string {
    assertRelativeFilePath(filePath);

    const wsRoot = this.getWorkspaceRoot(ctx);
    const resolved = path.normalize(path.join(wsRoot, filePath));
    if (!isPathInside(wsRoot, resolved)) {
      throw new Error(`Path "${filePath}" is outside the workspace boundary.`);
    }

    return resolved;
  }

  private assertWritableBoundary(resolved: string): 'created' | 'overwritten' {
    let targetStats: fs.Stats;
    try {
      targetStats = fs.lstatSync(resolved);
    } catch {
      return 'created';
    }

    if (targetStats.isDirectory()) {
      throw new Error('path points to a directory, not a file.');
    }

    if (targetStats.isSymbolicLink()) {
      throw new Error('Refusing to write through a symlink target.');
    }

    return 'overwritten';
  }

  /** Return a location hint string like "(session file)" for the output. */
  private _getLocationHint(filePath: string, wsRoot: string): string {
    return getPathContext(filePath, wsRoot);
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const wsRoot = this.getWorkspaceRoot(ctx);
    const resolved = this.resolveTargetPath(input.path, ctx);
    const action = this.assertWritableBoundary(resolved);

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
    const lineCount = input.content.split('\n').length;
    const verb = action === 'created' ? '\u5DF2\u521B\u5EFA\u6587\u4EF6' : '\u5DF2\u8986\u5199\u6587\u4EF6';
    const hint = this._getLocationHint(input.path, wsRoot);
    const hintStr = hint ? `${hint}` : '';

    // Auto-create meta.json when writing agent.md inside subagents/
    let metaNote = '';
    const normalized = input.path.replace(/\\/g, '/');
    if (
      action === 'created' &&
      path.basename(resolved) === 'agent.md' &&
      normalized.startsWith('subagents/')
    ) {
      const agentDir = path.dirname(resolved);
      const agentName = path.basename(agentDir);
      const metaPath = path.join(agentDir, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        const meta = {
          type: 'subagent',
          name: agentName,
          entry: 'agent.md',
          created_at: new Date().toISOString(),
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        metaNote = `\n\u2713 \u5DF2\u81EA\u52A8\u521B\u5EFA meta.json (子Agent: ${agentName})`;
      }
    }

    return `\u2713 ${verb}${hintStr}: ${input.path} (${lineCount} \u884C)${metaNote}`;
  }
}
