/**
 * BashTool — executes shell commands within a workspace.
 * BashBackgroundTool — starts a detached background process.
 *
 * Security: dangerous command patterns are blocked, timeout is enforced,
 * kernel/workspace write protection is applied.
 */

import { z } from 'zod';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';

// Bypass Turbopack TP1005 — dynamic child_process usage
// eslint-disable-next-line no-eval
const { exec, spawn }: any = eval('require')('child_process');

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const BASH_DESC_V1 = `Execute a shell command within the workspace.
Supports any command (npm, git, node, etc.) with timeout control.
Dangerous commands (rm -rf /, mkfs, etc.) are blocked.
Kernel paths (core/, skills/builtin/) are write-protected.
Workspace-level destructive commands (rm skills/, rm files/) are blocked.
Environment variables WORKSPACE, SHARED_DIR, SESSION_DIR are injected.`;

const BASH_DESC_V2 = 'Execute a shell command in the workspace with timeout control.';

const BASH_BG_DESC_V1 = `Start a shell command as a detached background process.
Returns immediately with the PID. The process runs independently.
Useful for long-running servers, watchers, or build processes.
The process is fully detached and will not block the agent.`;

const BASH_BG_DESC_V2 = 'Start a detached background process. Returns PID immediately.';

// ---------------------------------------------------------------------------
// Shared security checks
// ---------------------------------------------------------------------------

const schema = z.object({
  command: z.string().describe('The full command to run (e.g., "npm install", "git status", "ls -la")'),
  timeout: z.number().optional().describe('Timeout in seconds (default 120, max 600)'),
  cwd: z.string().optional().describe('Working directory relative to workspace (default: workspace root)'),
});

type Input = z.infer<typeof schema>;

/** Dangerous command patterns that should never be executed. */
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//,           // rm -rf /
  /\bmkfs\b/,                   // mkfs
  /\bdd\s+.*of=\/dev\//,        // dd to device
  /\b:\(\)\s*\{\s*:\|:\s*&\s*\}/, // fork bomb
  /\bchmod\s+-R\s+777\s+\//,    // chmod 777 /
  /\bsudo\s+rm\b/,              // sudo rm
];

/** Kernel/builtin write-protected path patterns. */
const KERNEL_WRITE_PATTERNS = [
  /\b(rm|mv|cp|chmod|chown)\b.*\bcore\//,
  /\b(rm|mv|cp|chmod|chown)\b.*\bskills\/builtin\//,
];

/** Workspace-level destructive patterns. */
const WORKSPACE_PROTECT_PATTERNS = [
  /\brm\s+(-rf?\s+)?skills\//,
  /\brm\s+(-rf?\s+)?files\//,
  /\brm\s+(-rf?\s+)?shared\//,
  /\brm\s+(-rf?\s+)?session\//,
];

function isBlocked(command: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return `Command blocked by security policy: matches dangerous pattern "${pattern.source}".`;
    }
  }
  return null;
}

function _checkKernelWrite(command: string): string | null {
  for (const pattern of KERNEL_WRITE_PATTERNS) {
    if (pattern.test(command)) {
      return `Command blocked: cannot modify kernel/builtin paths.`;
    }
  }
  return null;
}

function _checkWorkspaceProtect(command: string): string | null {
  for (const pattern of WORKSPACE_PROTECT_PATTERNS) {
    if (pattern.test(command)) {
      return `Command blocked: cannot delete workspace-level directories (skills/, files/, shared/, session/).`;
    }
  }
  return null;
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// ---------------------------------------------------------------------------
// RunCommandTool (bash)
// ---------------------------------------------------------------------------

export class RunCommandTool extends BaseTool<Input, string> {
  name = 'bash';
  description = selectDesc(BASH_DESC_V1, BASH_DESC_V2);
  schema = schema;

  private workspaceCwd?: string;

  constructor(cwd?: string) {
    super();
    if (cwd) {
      this.workspaceCwd = path.normalize(cwd);
    }
    this.description = selectDesc(BASH_DESC_V1, BASH_DESC_V2);
  }

  private getWorkspaceCwd(ctx?: ToolContext): string {
    const cwd = this.workspaceCwd || ctx?.workspacePath;
    if (!cwd) throw new Error('No workspace: provide cwd in constructor or ToolContext.');
    return cwd;
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const command = (input.command || '').trim();
    if (!command) {
      return 'Error: command is required.';
    }

    // Security checks
    const blocked = isBlocked(command);
    if (blocked) return `Error: ${blocked}`;

    const kernelBlocked = _checkKernelWrite(command);
    if (kernelBlocked) return `Error: ${kernelBlocked}`;

    const wsProtected = _checkWorkspaceProtect(command);
    if (wsProtected) return `Error: ${wsProtected}`;

    const wsRoot = this.getWorkspaceCwd(ctx);

    // Resolve cwd (relative to workspace)
    let effectiveCwd = wsRoot;
    if (input.cwd) {
      const resolved = path.resolve(wsRoot, input.cwd);
      if (!isPathInside(wsRoot, resolved)) {
        return 'Error: cwd must be within the workspace boundary.';
      }
      effectiveCwd = resolved;
    }

    // Clamp timeout
    const timeoutSec = Math.min(Math.max(input.timeout || 120, 1), 600);
    const timeoutMs = timeoutSec * 1000;

    // Build environment with injected workspace vars
    const env = {
      ...process.env,
      WORKSPACE: wsRoot,
      SHARED_DIR: path.join(wsRoot, 'shared'),
      SESSION_DIR: path.join(wsRoot, 'session'),
    };

    return new Promise((resolve) => {
      const child = exec(
        command,
        {
          cwd: effectiveCwd,
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024, // 2MB
          env,
          shell: true,
        },
        (error: any, stdout: string, stderr: string) => {
          const timedOut = error?.killed === true;
          const exitCode = error
            ? (typeof error.code === 'number' ? error.code : 1)
            : 0;

          // Merge stderr into output
          const parts: string[] = [];
          const combined = [stdout, stderr].filter(Boolean).join('\n');
          if (combined.trim()) {
            parts.push(combined.trim());
          }

          if (exitCode !== 0) {
            parts.push(`\n[exit code: ${exitCode}]`);
          }
          if (timedOut) {
            parts.push(`[timed out after ${timeoutSec}s]`);
          }

          const output = parts.join('\n') || '(no output)';

          // Truncate
          const MAX = 50000;
          if (output.length > MAX) {
            resolve(output.slice(0, MAX) + `\n...[truncated, ${output.length} chars total]`);
          } else {
            resolve(output);
          }
        }
      );

      // Force kill if over timeout
      setTimeout(() => {
        if (child && !child.killed) {
          child.kill('SIGTERM');
        }
      }, timeoutMs + 2000);
    });
  }
}

// ---------------------------------------------------------------------------
// BashBackgroundTool (bash_background)
// ---------------------------------------------------------------------------

const bgSchema = z.object({
  command: z.string().describe('The command to run in the background'),
  cwd: z.string().optional().describe('Working directory relative to workspace (default: workspace root)'),
});

type BgInput = z.infer<typeof bgSchema>;

export class BashBackgroundTool extends BaseTool<BgInput, string> {
  name = 'bash_background';
  description = selectDesc(BASH_BG_DESC_V1, BASH_BG_DESC_V2);
  schema = bgSchema;

  private workspaceCwd?: string;

  constructor(cwd?: string) {
    super();
    if (cwd) {
      this.workspaceCwd = path.normalize(cwd);
    }
    this.description = selectDesc(BASH_BG_DESC_V1, BASH_BG_DESC_V2);
  }

  private getWorkspaceCwd(ctx?: ToolContext): string {
    const cwd = this.workspaceCwd || ctx?.workspacePath;
    if (!cwd) throw new Error('No workspace: provide cwd in constructor or ToolContext.');
    return cwd;
  }

  protected async _run(input: BgInput, ctx?: ToolContext): Promise<string> {
    const command = (input.command || '').trim();
    if (!command) {
      return 'Error: command is required.';
    }

    // Security checks
    const blocked = isBlocked(command);
    if (blocked) return `Error: ${blocked}`;

    const kernelBlocked = _checkKernelWrite(command);
    if (kernelBlocked) return `Error: ${kernelBlocked}`;

    const wsProtected = _checkWorkspaceProtect(command);
    if (wsProtected) return `Error: ${wsProtected}`;

    const wsRoot = this.getWorkspaceCwd(ctx);

    let effectiveCwd = wsRoot;
    if (input.cwd) {
      const resolved = path.resolve(wsRoot, input.cwd);
      if (!isPathInside(wsRoot, resolved)) {
        return 'Error: cwd must be within the workspace boundary.';
      }
      effectiveCwd = resolved;
    }

    const env = {
      ...process.env,
      WORKSPACE: wsRoot,
      SHARED_DIR: path.join(wsRoot, 'shared'),
      SESSION_DIR: path.join(wsRoot, 'session'),
    };

    try {
      const child = spawn(command, [], {
        cwd: effectiveCwd,
        env,
        shell: true,
        detached: true,
        stdio: 'ignore',
      });

      child.unref();

      const pid = child.pid;
      return `\u5DF2\u542F\u52A8\u540E\u53F0\u8FDB\u7A0B (PID: ${pid}): ${command}`;
    } catch (e: any) {
      return `Error starting background process: ${e.message}`;
    }
  }
}
