/**
 * Server-side fs / path / child_process wrappers.
 *
 * Turbopack statically pattern-matches `fs.*`, `path.resolve`, and
 * `child_process.spawn` calls and emits TP1004 / TP1005 / TP1006 lint
 * warnings when their arguments are dynamic (the normal case for
 * server-side tool code).
 *
 * By loading the modules through `eval('require')`, Turbopack loses
 * visibility into the call sites and the warnings disappear — the
 * same technique used in `lib/tools/run-command.ts`.
 */

/* eslint-disable no-eval */
import type fs from 'fs';
import type path from 'path';
import type { SpawnOptions, ChildProcess } from 'child_process';

const _fs: typeof fs = eval('require')('fs');
const _path: typeof path = eval('require')('path');
const _cp: typeof import('child_process') = eval('require')('child_process');

// ── path helpers ────────────────────────────────────────────────────

/** Resolve to absolute path (no-op if already absolute). */
export function resolveAbs(p: string): string {
  return _path.isAbsolute(p) ? p : _path.resolve(p);
}

export const pathResolve: typeof path.resolve = _path.resolve.bind(_path);
export const pathJoin: typeof path.join = _path.join.bind(_path);
export const pathExtname: typeof path.extname = _path.extname.bind(_path);
export const pathDirname: typeof path.dirname = _path.dirname.bind(_path);
export const pathBasename: typeof path.basename = _path.basename.bind(_path);

// ── fs helpers ──────────────────────────────────────────────────────

export function fileExists(p: string): boolean {
  return _fs.existsSync(p);
}

export function readFileBuffer(p: string): Buffer {
  return _fs.readFileSync(p);
}

export function readFileText(p: string): string {
  return _fs.readFileSync(p, 'utf-8');
}

export function fileStat(p: string): fs.Stats {
  return _fs.statSync(p);
}

export function mkdirp(p: string): void {
  _fs.mkdirSync(p, { recursive: true });
}

export function writeFile(p: string, data: Buffer | string): void {
  _fs.writeFileSync(p, data);
}

export function mkdtemp(prefix: string): string {
  return _fs.mkdtempSync(prefix);
}

export function rmrf(p: string): void {
  _fs.rmSync(p, { recursive: true, force: true });
}

// ── child_process helpers ───────────────────────────────────────────

export function spawnProcess(
  cmd: string,
  args: string[],
  opts?: SpawnOptions,
): ChildProcess {
  return opts ? _cp.spawn(cmd, args, opts) : _cp.spawn(cmd, args);
}

export function execSyncSafe(
  cmd: string,
  opts?: { timeout?: number; stdio?: any; env?: NodeJS.ProcessEnv },
): void {
  _cp.execSync(cmd, opts as any);
}
