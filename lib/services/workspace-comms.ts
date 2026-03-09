/**
 * Workspace Communications — file-system based inter-agent artifact exchange.
 *
 * Structure:
 *   projects/{projectId}/workspace/
 *   ├── .team/
 *   │   ├── config.json          -- team configuration
 *   │   └── shared/              -- shared artifacts
 *   ├── agents/
 *   │   ├── developer-1/         -- agent work space
 *   │   ├── developer-2/
 *   │   └── qa-engineer/
 *   └── artifacts/               -- final deliverables
 */

import fs from 'fs';
import path from 'path';

const WORKSPACE_BASE = path.join(process.cwd(), 'projects');

/**
 * Ensure a workspace directory structure exists for a project.
 */
export function ensureWorkspace(projectId: string): string {
  const wsPath = path.join(WORKSPACE_BASE, projectId, 'workspace');
  const dirs = [
    wsPath,
    path.join(wsPath, '.team'),
    path.join(wsPath, '.team', 'shared'),
    path.join(wsPath, 'agents'),
    path.join(wsPath, 'artifacts'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return wsPath;
}

/**
 * Create a work directory for a specific agent.
 */
export function createAgentWorkDir(projectId: string, agentName: string): string {
  const agentDir = path.join(WORKSPACE_BASE, projectId, 'workspace', 'agents', agentName);
  fs.mkdirSync(agentDir, { recursive: true });
  return agentDir;
}

/**
 * Write team configuration to the workspace.
 */
export function writeTeamConfig(
  projectId: string,
  config: { members: string[]; leadAgent: string; executionMode: string },
): void {
  const wsPath = ensureWorkspace(projectId);
  const configPath = path.join(wsPath, '.team', 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Read team configuration from the workspace.
 */
export function readTeamConfig(projectId: string): any | null {
  const configPath = path.join(WORKSPACE_BASE, projectId, 'workspace', '.team', 'config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Share an artifact to the team's shared directory.
 */
export function shareArtifact(
  projectId: string,
  filename: string,
  content: string,
): string {
  const wsPath = ensureWorkspace(projectId);
  const artifactPath = path.join(wsPath, '.team', 'shared', filename);
  fs.writeFileSync(artifactPath, content, 'utf-8');
  return artifactPath;
}

/**
 * Read a shared artifact.
 */
export function readSharedArtifact(projectId: string, filename: string): string | null {
  const artifactPath = path.join(WORKSPACE_BASE, projectId, 'workspace', '.team', 'shared', filename);
  try {
    return fs.readFileSync(artifactPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * List all shared artifacts.
 */
export function listSharedArtifacts(projectId: string): string[] {
  const sharedDir = path.join(WORKSPACE_BASE, projectId, 'workspace', '.team', 'shared');
  try {
    return fs.readdirSync(sharedDir);
  } catch {
    return [];
  }
}

/**
 * Write an agent's working file.
 */
export function writeAgentFile(
  projectId: string,
  agentName: string,
  filename: string,
  content: string,
): string {
  const agentDir = createAgentWorkDir(projectId, agentName);
  const filePath = path.join(agentDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Read an agent's working file.
 */
export function readAgentFile(
  projectId: string,
  agentName: string,
  filename: string,
): string | null {
  const filePath = path.join(WORKSPACE_BASE, projectId, 'workspace', 'agents', agentName, filename);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Publish a final artifact to the artifacts directory.
 */
export function publishArtifact(
  projectId: string,
  filename: string,
  content: string,
): string {
  const wsPath = ensureWorkspace(projectId);
  const artifactPath = path.join(wsPath, 'artifacts', filename);
  fs.writeFileSync(artifactPath, content, 'utf-8');
  return artifactPath;
}

/**
 * List final artifacts.
 */
export function listArtifacts(projectId: string): string[] {
  const artifactsDir = path.join(WORKSPACE_BASE, projectId, 'workspace', 'artifacts');
  try {
    return fs.readdirSync(artifactsDir);
  } catch {
    return [];
  }
}
