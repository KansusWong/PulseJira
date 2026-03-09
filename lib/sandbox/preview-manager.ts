/**
 * Preview Manager — manages local dev server processes for project previews.
 *
 * Responsibilities:
 * - Port allocation (4000–4999 range)
 * - Spawn long-running dev server (npm run dev)
 * - Detect server readiness (stdout matching + HTTP polling)
 * - Track and clean up child processes
 */

import { spawn, type ChildProcess } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';
import http from 'http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PreviewStatus = 'installing' | 'starting' | 'ready' | 'failed' | 'stopped';

export interface PreviewSession {
  projectId: string;
  port: number;
  pid: number;
  status: PreviewStatus;
  url: string;
  error?: string;
  startedAt: string;
}

interface InternalSession extends PreviewSession {
  process: ChildProcess;
  workspacePath: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT_MIN = 4000;
const PORT_MAX = 4999;
const INSTALL_TIMEOUT = 180_000;  // 3 min for npm install
const READY_TIMEOUT = 60_000;     // 1 min for dev server startup
const READY_POLL_INTERVAL = 1500;

const READY_PATTERNS = [
  /Ready on (https?:\/\/localhost:\d+)/i,
  /ready.*started.*on.*:(\d+)/i,
  /Local:\s+(https?:\/\/localhost:\d+)/i,
  /listening on.*(https?:\/\/localhost:\d+)/i,
  /started server on.*:(\d+)/i,
];

// Base dependencies every Next.js preview needs
const BASE_DEPS: Record<string, string> = {
  next: '14.2.29',
  react: '^18',
  'react-dom': '^18',
};

const BASE_DEV_DEPS: Record<string, string> = {
  typescript: '^5',
  '@types/react': '^18',
  '@types/react-dom': '^18',
  autoprefixer: '^10',
  postcss: '^8',
  tailwindcss: '^3.3.0',
};

// Map of import specifiers → { pkg, version } for auto-detection
const KNOWN_DEPS: Record<string, string> = {
  'framer-motion': '^10.18.0',
  'lucide-react': '^0.309.0',
  clsx: '^2.1.0',
  'tailwind-merge': '^2.2.0',
  zustand: '^4.5.0',
  zod: '^3.22.0',
  recharts: '^2.10.0',
  '@supabase/supabase-js': '^2.93.2',
  axios: '^1.6.0',
  'date-fns': '^3.0.0',
  'class-variance-authority': '^0.7.0',
  '@radix-ui/react-dialog': '^1.0.0',
  '@radix-ui/react-slot': '^1.0.0',
};

const SCAFFOLD_NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
`;

const SCAFFOLD_TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
`;

const SCAFFOLD_POSTCSS_CONFIG = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

const SCAFFOLD_GLOBALS_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 255, 255, 255;
  --background-start-rgb: 9, 9, 11;
  --background-end-rgb: 9, 9, 11;
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-start-rgb));
}
`;

const SCAFFOLD_ROOT_LAYOUT = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preview",
  description: "Project preview",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(usedPorts: Set<number>): Promise<number> {
  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    if (usedPorts.has(port)) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error('No available ports in range 4000-4999');
}

function httpCheck(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, { timeout: 3000 }, (res) => {
      resolve((res.statusCode ?? 0) < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ---------------------------------------------------------------------------
// Preview Manager
// ---------------------------------------------------------------------------

class PreviewManager {
  private sessions = new Map<string, InternalSession>();

  /**
   * Start a preview dev server for a project.
   * Calls `onStatus` with progress updates.
   */
  async start(
    projectId: string,
    workspacePath: string,
    onStatus?: (session: PreviewSession) => void,
  ): Promise<PreviewSession> {
    // If already running, return existing session
    const existing = this.sessions.get(projectId);
    if (existing && existing.status === 'ready') {
      return this.toPublic(existing);
    }
    // Kill stale session if exists
    if (existing) {
      await this.stop(projectId);
    }

    const absPath = path.isAbsolute(workspacePath)
      ? workspacePath
      : path.join(process.cwd(), workspacePath);

    // Scaffold missing project files (layout, styles, deps, etc.)
    const depsChanged = this.ensureProjectScaffold(absPath);

    const usedPorts = new Set(
      Array.from(this.sessions.values()).map((s) => s.port),
    );
    const port = await findAvailablePort(usedPorts);
    const url = `http://localhost:${port}`;

    const session: InternalSession = {
      projectId,
      port,
      pid: 0,
      status: 'installing',
      url,
      startedAt: new Date().toISOString(),
      process: null as any,
      workspacePath: absPath,
    };
    this.sessions.set(projectId, session);
    onStatus?.(this.toPublic(session));

    // Step 1: npm install (force if scaffold added new deps)
    try {
      await this.runInstall(absPath, depsChanged, (msg) => {
        onStatus?.({ ...this.toPublic(session), status: 'installing' });
      });
    } catch (e: any) {
      session.status = 'failed';
      session.error = `npm install failed: ${e.message}`;
      onStatus?.(this.toPublic(session));
      return this.toPublic(session);
    }

    // Step 2: Start dev server
    session.status = 'starting';
    onStatus?.(this.toPublic(session));

    try {
      await this.startDevServer(session, port, onStatus);
    } catch (e: any) {
      session.status = 'failed';
      session.error = e.message;
      onStatus?.(this.toPublic(session));
    }

    return this.toPublic(session);
  }

  async stop(projectId: string): Promise<void> {
    const session = this.sessions.get(projectId);
    if (!session) return;

    try {
      if (session.process && !session.process.killed) {
        session.process.kill('SIGTERM');
        // Force kill after 3s if still alive
        setTimeout(() => {
          try { session.process?.kill('SIGKILL'); } catch { /* ignore */ }
        }, 3000);
      }
    } catch { /* process may have already exited */ }

    session.status = 'stopped';
    this.sessions.delete(projectId);
  }

  getStatus(projectId: string): PreviewSession | null {
    const session = this.sessions.get(projectId);
    return session ? this.toPublic(session) : null;
  }

  stopAll(): void {
    for (const [id] of this.sessions) {
      this.stop(id);
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /**
   * Scan project source files, scaffold missing Next.js essentials,
   * and return true if package.json dependencies were changed (needs reinstall).
   */
  private ensureProjectScaffold(absPath: string): boolean {
    let depsChanged = false;

    // --- package.json ---
    const pkgPath = path.join(absPath, 'package.json');
    let pkg: any;
    if (fs.existsSync(pkgPath)) {
      try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); } catch { pkg = {}; }
    } else {
      pkg = {};
    }
    pkg.name = pkg.name || 'pulse-preview';
    pkg.version = pkg.version || '0.1.0';
    pkg.private = true;
    pkg.scripts = { dev: 'next dev', build: 'next build', start: 'next start', ...pkg.scripts };
    pkg.dependencies = pkg.dependencies || {};
    pkg.devDependencies = pkg.devDependencies || {};

    // Ensure base deps
    for (const [k, v] of Object.entries(BASE_DEPS)) {
      if (!pkg.dependencies[k]) { pkg.dependencies[k] = v; depsChanged = true; }
    }
    for (const [k, v] of Object.entries(BASE_DEV_DEPS)) {
      if (!pkg.devDependencies[k]) { pkg.devDependencies[k] = v; depsChanged = true; }
    }

    // Scan source files for known third-party imports
    const detectedPkgs = this.scanImports(absPath);
    for (const name of detectedPkgs) {
      if (!pkg.dependencies[name] && KNOWN_DEPS[name]) {
        pkg.dependencies[name] = KNOWN_DEPS[name];
        depsChanged = true;
      }
    }

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    // --- next.config ---
    const nextConfigPath = path.join(absPath, 'next.config.js');
    const nextConfigMjsPath = path.join(absPath, 'next.config.mjs');
    if (!fs.existsSync(nextConfigPath) && !fs.existsSync(nextConfigMjsPath)) {
      fs.writeFileSync(nextConfigPath, SCAFFOLD_NEXT_CONFIG);
    }

    // --- tailwind.config.js ---
    const twPath = path.join(absPath, 'tailwind.config.js');
    const twTsPath = path.join(absPath, 'tailwind.config.ts');
    if (!fs.existsSync(twPath) && !fs.existsSync(twTsPath)) {
      fs.writeFileSync(twPath, SCAFFOLD_TAILWIND_CONFIG);
    }

    // --- postcss.config ---
    const pcPath = path.join(absPath, 'postcss.config.js');
    const pcMjsPath = path.join(absPath, 'postcss.config.mjs');
    if (!fs.existsSync(pcPath) && !fs.existsSync(pcMjsPath)) {
      fs.writeFileSync(pcPath, SCAFFOLD_POSTCSS_CONFIG);
    }

    // --- tsconfig.json — ensure @/ path alias ---
    const tscPath = path.join(absPath, 'tsconfig.json');
    if (fs.existsSync(tscPath)) {
      try {
        const raw = fs.readFileSync(tscPath, 'utf-8');
        const tsc = JSON.parse(raw);
        const co = tsc.compilerOptions = tsc.compilerOptions || {};
        if (!co.paths || !co.paths['@/*']) {
          co.paths = { '@/*': ['./*'], ...co.paths };
          fs.writeFileSync(tscPath, JSON.stringify(tsc, null, 2));
        }
      } catch { /* corrupt tsconfig — skip */ }
    }

    // --- app/globals.css ---
    const appDir = path.join(absPath, 'app');
    if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });

    const cssPath = path.join(appDir, 'globals.css');
    if (!fs.existsSync(cssPath)) {
      fs.writeFileSync(cssPath, SCAFFOLD_GLOBALS_CSS);
    }

    // --- app/layout.tsx ---
    const layoutPath = path.join(appDir, 'layout.tsx');
    if (!fs.existsSync(layoutPath)) {
      fs.writeFileSync(layoutPath, SCAFFOLD_ROOT_LAYOUT);
    }

    // --- app/page.tsx — create redirect to first dashboard route if missing ---
    const pagePath = path.join(appDir, 'page.tsx');
    if (!fs.existsSync(pagePath)) {
      const firstRoute = this.findFirstPageRoute(appDir);
      if (firstRoute && firstRoute !== '/') {
        fs.writeFileSync(pagePath,
          `import { redirect } from "next/navigation";\nexport default function Home() { redirect("${firstRoute}"); }\n`);
      } else {
        fs.writeFileSync(pagePath,
          `export default function Home() {\n  return (\n    <main className="flex min-h-screen items-center justify-center">\n      <h1 className="text-2xl font-bold">Preview</h1>\n    </main>\n  );\n}\n`);
      }
    }

    // --- Fix dynamic route slug conflicts (e.g. [id] vs [leadId] at same level) ---
    this.fixRouteSlugConflicts(appDir);

    return depsChanged;
  }

  /** Recursively scan .ts/.tsx files for third-party import specifiers. */
  private scanImports(absPath: string): Set<string> {
    const found = new Set<string>();
    const importRe = /from\s+['"]([^'"./][^'"]*)['"]/g;

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.(tsx?|jsx?)$/.test(e.name)) continue;
        try {
          const src = fs.readFileSync(full, 'utf-8');
          let m: RegExpExecArray | null;
          while ((m = importRe.exec(src)) !== null) {
            // Normalise scoped packages: @scope/pkg/sub → @scope/pkg
            const raw = m[1];
            if (raw.startsWith('@')) {
              const parts = raw.split('/');
              if (parts.length >= 2) found.add(parts.slice(0, 2).join('/'));
            } else {
              found.add(raw.split('/')[0]);
            }
          }
        } catch { /* skip unreadable */ }
      }
    };
    walk(absPath);

    // Remove built-in / Next.js modules
    for (const builtin of ['react', 'react-dom', 'next', 'fs', 'path', 'http', 'https', 'crypto', 'stream', 'url', 'util', 'os', 'child_process', 'events', 'net', 'tls', 'dns', 'cluster', 'worker_threads']) {
      found.delete(builtin);
    }
    return found;
  }

  // Walk app/ looking for the first (dashboard)/[any]/page.tsx to determine a redirect target.
  private findFirstPageRoute(appDir: string): string | null {
    const walk = (dir: string, routePrefix: string): string | null => {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name === 'api' || e.name === 'node_modules') continue;
        const segment = e.name.startsWith('(') && e.name.endsWith(')') ? '' : `/${e.name}`;
        const childDir = path.join(dir, e.name);
        // Check if this dir has a page.tsx
        if (fs.existsSync(path.join(childDir, 'page.tsx')) || fs.existsSync(path.join(childDir, 'page.jsx'))) {
          return routePrefix + segment;
        }
        const deeper = walk(childDir, routePrefix + segment);
        if (deeper) return deeper;
      }
      return null;
    };
    return walk(appDir, '');
  }

  // Next.js forbids different dynamic slug names at the same path level (e.g. [id] vs [leadId]).
  // When code generation produces duplicates, keep the first alphabetically and merge children.
  private fixRouteSlugConflicts(dir: string): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    // Group dynamic dirs at this level: "leads" may contain [id] AND [leadId]
    const dynamicDirs: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (e.name.startsWith('[') && e.name.endsWith(']')) {
        dynamicDirs.push(full);
      } else {
        // Recurse into non-dynamic dirs (and route groups)
        this.fixRouteSlugConflicts(full);
      }
    }

    if (dynamicDirs.length > 1) {
      // Keep the first one (alphabetical), merge contents of others into it
      dynamicDirs.sort();
      const keep = dynamicDirs[0];
      for (let i = 1; i < dynamicDirs.length; i++) {
        this.mergeDirInto(dynamicDirs[i], keep);
        fs.rmSync(dynamicDirs[i], { recursive: true, force: true });
      }
    }

    // Recurse into the surviving dynamic dir
    if (dynamicDirs.length >= 1) {
      const surviving = dynamicDirs[0];
      if (fs.existsSync(surviving)) this.fixRouteSlugConflicts(surviving);
    }
  }

  private mergeDirInto(src: string, dest: string): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(src, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const srcPath = path.join(src, e.name);
      const destPath = path.join(dest, e.name);
      if (e.isDirectory()) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
        this.mergeDirInto(srcPath, destPath);
      } else {
        // Only copy if destination doesn't already have this file
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }

  private runInstall(cwd: string, forceInstall: boolean, onProgress?: (msg: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const hasNodeModules = fs.existsSync(path.join(cwd, 'node_modules'));
      if (hasNodeModules && !forceInstall) {
        onProgress?.('node_modules exists, skipping install');
        resolve();
        return;
      }

      const child = spawn('npm', ['install', '--prefer-offline'], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'development' },
      });

      let stderr = '';
      child.stdout?.on('data', (chunk) => {
        onProgress?.(chunk.toString().trim());
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('npm install timed out'));
      }, INSTALL_TIMEOUT);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-500) || `exit code ${code}`));
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private startDevServer(
    session: InternalSession,
    port: number,
    onStatus?: (s: PreviewSession) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('npx', ['next', 'dev', '-p', String(port)], {
        cwd: session.workspacePath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'development',
          PORT: String(port),
        },
        detached: false,
      });

      session.process = child;
      session.pid = child.pid || 0;

      let resolved = false;
      let outputBuffer = '';

      const markReady = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        session.status = 'ready';
        onStatus?.(this.toPublic(session));
        resolve();
      };

      const checkOutput = (data: string) => {
        outputBuffer += data;
        for (const pattern of READY_PATTERNS) {
          if (pattern.test(outputBuffer)) {
            markReady();
            return;
          }
        }
      };

      child.stdout?.on('data', (chunk) => checkOutput(chunk.toString()));
      child.stderr?.on('data', (chunk) => checkOutput(chunk.toString()));

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          clearInterval(pollTimer);
          session.status = 'failed';
          session.error = `Dev server exited with code ${code}`;
          this.sessions.delete(session.projectId);
          reject(new Error(session.error));
        } else {
          session.status = 'stopped';
          this.sessions.delete(session.projectId);
        }
      });

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          clearInterval(pollTimer);
          session.status = 'failed';
          session.error = err.message;
          reject(err);
        }
      });

      // Fallback: poll HTTP in case stdout pattern isn't matched
      const pollTimer = setInterval(async () => {
        if (resolved) { clearInterval(pollTimer); return; }
        if (await httpCheck(port)) {
          clearInterval(pollTimer);
          markReady();
        }
      }, READY_POLL_INTERVAL);

      const timer = setTimeout(() => {
        clearInterval(pollTimer);
        if (!resolved) {
          resolved = true;
          session.status = 'failed';
          session.error = 'Dev server did not become ready within timeout';
          child.kill('SIGTERM');
          reject(new Error(session.error));
        }
      }, READY_TIMEOUT);
    });
  }

  private toPublic(session: InternalSession): PreviewSession {
    return {
      projectId: session.projectId,
      port: session.port,
      pid: session.pid,
      status: session.status,
      url: session.url,
      error: session.error,
      startedAt: session.startedAt,
    };
  }
}

export const previewManager = new PreviewManager();
