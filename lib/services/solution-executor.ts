/**
 * Solution Executor Service
 *
 * Executes a selected code solution by applying file changes in the workspace.
 */

import fs from 'fs/promises';
import path from 'path';
import type { CodeSolution, CodeFileChange } from '@/lib/core/types';

export interface ExecutionResult {
  success: boolean;
  filesChanged: number;
  errors: string[];
}

/**
 * Execute a code solution by applying all file changes.
 */
export async function executeSolution(
  solution: CodeSolution,
  workspacePath: string
): Promise<ExecutionResult> {
  const errors: string[] = [];
  let filesChanged = 0;

  for (const fileChange of solution.files) {
    try {
      await applyFileChange(fileChange, workspacePath);
      filesChanged++;
    } catch (error: any) {
      const errorMsg = `Failed to ${fileChange.action} ${fileChange.path}: ${error.message}`;
      console.error('[SolutionExecutor]', errorMsg);
      errors.push(errorMsg);
    }
  }

  return {
    success: errors.length === 0,
    filesChanged,
    errors,
  };
}

/**
 * Apply a single file change (create, edit, or delete).
 */
async function applyFileChange(
  change: CodeFileChange,
  workspacePath: string
): Promise<void> {
  const fullPath = path.join(workspacePath, change.path);

  // Ensure the file path is within workspace (security check)
  const normalizedPath = path.normalize(fullPath);
  const normalizedWorkspace = path.normalize(workspacePath);
  if (!normalizedPath.startsWith(normalizedWorkspace)) {
    throw new Error(`Path ${change.path} is outside workspace`);
  }

  switch (change.action) {
    case 'create':
      if (!change.content) {
        throw new Error('Content is required for create action');
      }
      // Ensure parent directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, change.content, 'utf-8');
      break;

    case 'edit':
      if (!change.content) {
        throw new Error('Content is required for edit action');
      }
      // Verify file exists before editing
      try {
        await fs.access(fullPath);
      } catch {
        throw new Error(`File ${change.path} does not exist (cannot edit)`);
      }
      await fs.writeFile(fullPath, change.content, 'utf-8');
      break;

    case 'delete':
      try {
        await fs.unlink(fullPath);
      } catch (error: any) {
        // Ignore if file doesn't exist
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
      break;

    default:
      throw new Error(`Unknown action: ${(change as any).action}`);
  }
}
