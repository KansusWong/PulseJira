/**
 * CodeExecutorService — Docker sandbox / local fallback code execution engine.
 *
 * Provides isolated code execution for Python, JavaScript, and Bash.
 * Supports persistent Python REPL sessions with variable tracking.
 *
 * Architecture:
 *   Tool (execute_code / execute_python / python_repl)
 *     -> CodeExecutorService
 *       -> Docker HTTP API (preferred)
 *       -> child_process fallback (dev mode)
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  files?: { name: string; path: string }[];
}

interface PythonSession {
  process: ChildProcess;
  sessionId: string;
  createdAt: Date;
  lastUsedAt: Date;
}

interface ExecutionOptions {
  timeout?: number;
  memoryLimit?: string;
  workDir?: string;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: CodeExecutorService | null = null;

export function getCodeExecutor(): CodeExecutorService {
  if (!_instance) {
    _instance = new CodeExecutorService();
  }
  return _instance;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CodeExecutorService {
  private mode: 'docker' | 'local';
  private dockerSocket: string;
  private dockerImage: string;
  private sessions = new Map<string, PythonSession>();
  private defaultTimeout = 30_000; // 30s

  constructor() {
    this.mode = (process.env.CODE_EXECUTOR_MODE as 'docker' | 'local') || 'local';
    this.dockerSocket = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
    this.dockerImage = process.env.CODE_EXECUTOR_IMAGE || 'python:3.11-slim';

    // Auto-detect Docker availability
    if (this.mode === 'docker' && !this.isDockerAvailable()) {
      console.warn('[CodeExecutor] Docker not available, falling back to local mode');
      this.mode = 'local';
    }
  }

  private isDockerAvailable(): boolean {
    try {
      if (!fs.existsSync(this.dockerSocket)) return false;
      execSync('docker info', { timeout: 5000, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async executeCode(
    code: string,
    language: 'python' | 'javascript' | 'bash',
    opts?: ExecutionOptions,
  ): Promise<ExecutionResult> {
    const timeout = Math.min((opts?.timeout || 30) * 1000, 300_000);

    if (this.mode === 'docker') {
      return this.executeInDocker(code, language, timeout);
    }
    return this.executeLocal(code, language, timeout);
  }

  async executePython(
    code: string,
    sessionId: string,
    persistent: boolean = true,
    timeout: number = 30,
  ): Promise<ExecutionResult> {
    const timeoutMs = Math.min(timeout * 1000, 300_000);

    if (!persistent) {
      return this.executeCode(code, 'python', { timeout });
    }

    // Persistent session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createPythonSession(sessionId);
      this.sessions.set(sessionId, session);
    }
    session.lastUsedAt = new Date();

    return this.sendToSession(session, code, timeoutMs);
  }

  async evalExpression(expression: string, sessionId: string): Promise<string> {
    // Wrap in print() for REPL evaluation
    const code = `__result__ = ${expression}\nprint(repr(__result__))`;
    const result = await this.executePython(code, sessionId, true, 10);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Expression evaluation failed');
    }
    return result.stdout.trim();
  }

  async resetSession(sessionId: string, keepImports: boolean = true): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.process.kill('SIGTERM');
      } catch { /* ignore */ }
      this.sessions.delete(sessionId);
    }

    if (keepImports) {
      // Create new session — imports will need to be re-run by the caller
      // (we can't automatically preserve them without parsing)
    }
  }

  async getSessionVars(sessionId: string): Promise<Record<string, string>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {};
    }

    const code = `
import json as __json__
__vars__ = {k: str(type(v).__name__) + ': ' + repr(v)[:100] for k, v in globals().items() if not k.startswith('_')}
print(__json__.dumps(__vars__))
del __json__, __vars__
`;
    const result = await this.sendToSession(session, code, 10_000);
    if (result.exitCode !== 0) return {};

    try {
      return JSON.parse(result.stdout.trim());
    } catch {
      return {};
    }
  }

  async checkStatus(): Promise<{ mode: string; healthy: boolean; sessions: number }> {
    const healthy = this.mode === 'docker' ? this.isDockerAvailable() : true;
    return {
      mode: this.mode,
      healthy,
      sessions: this.sessions.size,
    };
  }

  // -------------------------------------------------------------------------
  // Docker execution
  // -------------------------------------------------------------------------

  private async executeInDocker(
    code: string,
    language: string,
    timeoutMs: number,
  ): Promise<ExecutionResult> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-'));
    const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'sh';
    const scriptFile = path.join(tmpDir, `script.${ext}`);
    fs.writeFileSync(scriptFile, code, 'utf-8');

    const cmd = language === 'python' ? 'python3' : language === 'javascript' ? 'node' : 'bash';

    try {
      const args = [
        'run', '--rm',
        '--network=none',
        '--memory=512m',
        '--cpus=1',
        `-v`, `${tmpDir}:/workspace:rw`,
        '-w', '/workspace',
        this.dockerImage,
        cmd, `/workspace/script.${ext}`,
      ];

      return await this.spawnWithTimeout('docker', args, timeoutMs);
    } finally {
      // Cleanup
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }

  // -------------------------------------------------------------------------
  // Local execution (fallback)
  // -------------------------------------------------------------------------

  private async executeLocal(
    code: string,
    language: string,
    timeoutMs: number,
  ): Promise<ExecutionResult> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-'));
    const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'sh';
    const scriptFile = path.join(tmpDir, `script.${ext}`);
    fs.writeFileSync(scriptFile, code, 'utf-8');

    const cmd = language === 'python' ? 'python3' : language === 'javascript' ? 'node' : 'bash';

    try {
      return await this.spawnWithTimeout(cmd, [scriptFile], timeoutMs, tmpDir);
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }

  // -------------------------------------------------------------------------
  // Persistent Python sessions
  // -------------------------------------------------------------------------

  private createPythonSession(sessionId: string): PythonSession {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonCmd, ['-u', '-i'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    proc.on('error', (err) => {
      console.error(`[CodeExecutor] Session ${sessionId} error:`, err.message);
      this.sessions.delete(sessionId);
    });

    proc.on('exit', () => {
      this.sessions.delete(sessionId);
    });

    return {
      process: proc,
      sessionId,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };
  }

  private sendToSession(
    session: PythonSession,
    code: string,
    timeoutMs: number,
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let resolved = false;

      const SENTINEL = `__EXEC_DONE_${Date.now()}__`;
      const wrappedCode = `${code}\nprint("${SENTINEL}")`;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            stdout: Buffer.concat(stdout).toString('utf-8'),
            stderr: Buffer.concat(stderr).toString('utf-8') + '\nExecution timed out.',
            exitCode: 124,
          });
        }
      }, timeoutMs);

      const onStdout = (chunk: Buffer) => {
        stdout.push(chunk);
        const text = Buffer.concat(stdout).toString('utf-8');
        if (text.includes(SENTINEL)) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            cleanup();
            const output = text.replace(SENTINEL, '').replace(/\n$/, '');
            resolve({
              stdout: output.trim(),
              stderr: Buffer.concat(stderr).toString('utf-8').trim(),
              exitCode: 0,
            });
          }
        }
      };

      const onStderr = (chunk: Buffer) => {
        stderr.push(chunk);
      };

      const cleanup = () => {
        session.process.stdout?.removeListener('data', onStdout);
        session.process.stderr?.removeListener('data', onStderr);
      };

      session.process.stdout?.on('data', onStdout);
      session.process.stderr?.on('data', onStderr);

      // Send code
      session.process.stdin?.write(wrappedCode + '\n');
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private spawnWithTimeout(
    cmd: string,
    args: string[],
    timeoutMs: number,
    cwd?: string,
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      proc.stdout?.on('data', (chunk) => stdout.push(chunk));
      proc.stderr?.on('data', (chunk) => stderr.push(chunk));

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(stdout).toString('utf-8').trim(),
          stderr: Buffer.concat(stderr).toString('utf-8').trim(),
          exitCode: code ?? 1,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: 1,
        });
      });
    });
  }
}
