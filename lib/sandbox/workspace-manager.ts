/**
 * Workspace Manager — creates and manages isolated sandboxed directories
 * for agent code generation.
 *
 * Each workspace is a git clone of the target repo on its own branch.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GitWorkspace } from './git-workspace';
import type { Workspace, WorkspaceConfig } from './types';

const WORKSPACES_BASE = process.env.WORKSPACE_BASE_DIR
  || path.join(process.cwd(), '.workspaces');

export class WorkspaceManager {
  /**
   * Create a new workspace: clone the repo, create a branch, return workspace info.
   */
  async create(config: WorkspaceConfig): Promise<Workspace> {
    if (config.localDir) {
      return this.createLocal(config);
    }

    if (!config.repoUrl) {
      throw new Error('repoUrl is required when not using localDir mode');
    }

    const id = crypto.randomUUID();
    const localPath = path.join(WORKSPACES_BASE, id);
    const baseBranch = config.baseBranch || 'main';
    const branchName = config.branchName || `pulse/project-${config.projectId}-${id.slice(0, 8)}`;

    // Create workspace directory
    fs.mkdirSync(localPath, { recursive: true });

    const workspace: Workspace = {
      id,
      projectId: config.projectId,
      repoUrl: config.repoUrl,
      branchName,
      baseBranch,
      localPath,
      status: 'initializing',
      createdAt: new Date().toISOString(),
    };

    try {
      const git = new GitWorkspace(localPath);
      await git.clone(config.repoUrl, baseBranch);
      await git.createBranch(branchName);
      workspace.status = 'ready';
    } catch (error: any) {
      workspace.status = 'failed';
      console.error(`[workspace-manager] Failed to create workspace ${id}:`, error.message);
    }

    return workspace;
  }

  /**
   * Create a local-only workspace: plain folder with git init (no remote clone).
   * Used for "项目启动" where code is generated directly in a project subfolder.
   */
  async createLocal(config: WorkspaceConfig): Promise<Workspace> {
    const dirName = config.localDir!;
    const localPath = path.join(process.cwd(), 'projects', dirName);
    const id = crypto.randomUUID();

    fs.mkdirSync(localPath, { recursive: true });

    const workspace: Workspace = {
      id,
      projectId: config.projectId,
      repoUrl: '',
      branchName: 'main',
      baseBranch: 'main',
      localPath,
      status: 'initializing',
      createdAt: new Date().toISOString(),
      isLocal: true,
    };

    try {
      const git = new GitWorkspace(localPath);
      const initResult = await (git as any).runner.run('git', ['init']);
      if (initResult.exitCode !== 0) {
        throw new Error(`git init failed: ${initResult.stderr}`);
      }
      workspace.status = 'ready';
    } catch (error: any) {
      workspace.status = 'failed';
      console.error(`[workspace-manager] Failed to create local workspace:`, error.message);
    }

    return workspace;
  }

  /**
   * Get the absolute local path for a workspace.
   */
  getPath(workspaceId: string): string {
    return path.join(WORKSPACES_BASE, workspaceId);
  }

  /**
   * Check if a workspace exists on disk.
   */
  exists(workspaceId: string): boolean {
    const wsPath = path.join(WORKSPACES_BASE, workspaceId);
    return fs.existsSync(wsPath);
  }

  /**
   * Clean up a workspace — remove the local directory.
   */
  async cleanup(workspaceId: string): Promise<void> {
    const wsPath = path.join(WORKSPACES_BASE, workspaceId);
    if (fs.existsSync(wsPath)) {
      fs.rmSync(wsPath, { recursive: true, force: true });
    }
  }

  /**
   * List all workspace directories on disk.
   */
  list(): string[] {
    const base: string = WORKSPACES_BASE;
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(WORKSPACES_BASE, { encoding: 'utf-8' });
  }
}

export const workspaceManager = new WorkspaceManager();
