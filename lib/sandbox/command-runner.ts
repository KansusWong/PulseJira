/**
 * Sandboxed command runner — executes shell commands within a workspace.
 *
 * Security: only whitelisted commands are allowed, working directory
 * is always scoped to the workspace, and a timeout is enforced.
 */

import { execFile } from 'child_process';
import path from 'path';
import type { CommandResult } from './types';
import { createStructuredLogger } from '@/lib/utils/logger';

const logger = createStructuredLogger({ agent: 'command-runner' });

const DEFAULT_TIMEOUT = 60_000; // 60 seconds

const DEFAULT_ALLOWED = ['npm', 'npx', 'node', 'git', 'tsc', 'pnpm', 'yarn'];

export class CommandRunner {
  private cwd: string;
  private allowedCommands: Set<string>;
  private timeoutMs: number;

  constructor(
    cwd: string,
    allowedCommands: string[] = DEFAULT_ALLOWED,
    timeoutMs: number = DEFAULT_TIMEOUT
  ) {
    this.cwd = this.normalizeCwd(cwd);
    this.allowedCommands = new Set(allowedCommands);
    this.timeoutMs = timeoutMs;
  }

  private normalizeCwd(cwd: string): string {
    const normalized = (cwd || '').trim();
    if (!normalized) {
      throw new Error('CommandRunner requires a workspace cwd.');
    }
    if (normalized.includes('\0')) {
      throw new Error('cwd contains invalid null bytes.');
    }
    if (!path.isAbsolute(normalized)) {
      throw new Error('cwd must be an absolute path.');
    }
    return path.normalize(normalized);
  }

  private sanitizeArgs(args: string[]): string[] {
    return args.map((arg) => {
      const value = String(arg ?? '');
      if (value.includes('\0')) {
        throw new Error('Command args contain invalid null bytes.');
      }
      return value;
    });
  }

  /** Dangerous arg patterns per command that could lead to arbitrary code execution. */
  private static readonly BLOCKED_ARGS: Record<string, string[]> = {
    node: ['-e', '--eval', '--input-type', '-p', '--print'],
    npx: ['-c', '--call'],
  };

  private validateArgs(command: string, args: string[]): string | null {
    const blocked = CommandRunner.BLOCKED_ARGS[command];
    if (!blocked) return null;
    for (const arg of args) {
      if (blocked.includes(arg)) {
        return `Argument "${arg}" is blocked for command "${command}" (security policy).`;
      }
    }
    return null;
  }

  private buildSafeEnv(): NodeJS.ProcessEnv {
    const env: Record<string, string | undefined> = {};
    const passthrough = [
      'PATH',
      'HOME',
      'SHELL',
      'TMPDIR',
      'USER',
      'LANG',
      'LC_ALL',
      'TERM',
      'CI',
      'npm_config_user_agent',
    ];

    for (const key of passthrough) {
      const value = process.env[key];
      if (typeof value === 'string' && value.length > 0) {
        env[key] = value;
      }
    }

    return env as NodeJS.ProcessEnv;
  }

  /**
   * Run a command with arguments. Returns structured result.
   * Throws if the command is not in the whitelist.
   */
  run(command: string, args: string[] = []): Promise<CommandResult> {
    const normalizedCommand = (command || '').trim();
    if (!normalizedCommand) {
      return Promise.resolve({
        exitCode: 1,
        stdout: '',
        stderr: 'Command is required.',
        timedOut: false,
      });
    }

    if (!this.allowedCommands.has(normalizedCommand)) {
      return Promise.resolve({
        exitCode: 1,
        stdout: '',
        stderr: `Command "${normalizedCommand}" is not allowed. Allowed: ${Array.from(this.allowedCommands).join(', ')}`,
        timedOut: false,
      });
    }

    let safeArgs: string[];
    try {
      safeArgs = this.sanitizeArgs(args);
    } catch (error: any) {
      return Promise.resolve({
        exitCode: 1,
        stdout: '',
        stderr: error?.message || 'Invalid command arguments.',
        timedOut: false,
      });
    }

    const argError = this.validateArgs(normalizedCommand, safeArgs);
    if (argError) {
      return Promise.resolve({ exitCode: 1, stdout: '', stderr: argError, timedOut: false });
    }

    logger.info('Command execution', { command: normalizedCommand, args: safeArgs, cwd: this.cwd });

    return new Promise((resolve) => {
      const child = execFile(
        normalizedCommand,
        safeArgs,
        {
          cwd: this.cwd,
          timeout: this.timeoutMs,
          maxBuffer: 1024 * 1024, // 1MB
          env: this.buildSafeEnv(),
        },
        (error, stdout, stderr) => {
          const timedOut = error?.killed === true;
          const exitCode = error?.code
            ? (typeof error.code === 'number' ? error.code : 1)
            : 0;

          resolve({
            exitCode,
            stdout: truncate(stdout || '', 8000),
            stderr: truncate(stderr || '', 4000),
            timedOut,
          });
        }
      );

      // Ensure the process is killed if it exceeds timeout
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGTERM');
        }
      }, this.timeoutMs + 1000);
    });
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `\n... (truncated, ${str.length} chars total)`;
}
