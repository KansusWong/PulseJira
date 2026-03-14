/**
 * CreateWorkspaceTool — Agent calls this to create a project + workspace on demand.
 *
 * Only provided to the agent when no workspace exists yet. After invocation,
 * chat-engine detects the populated workspaceRef and spawns a full agent
 * with file-operation tools for phase 2.
 */

import { z } from 'zod';
import { BaseTool } from '@/lib/core/base-tool';
import { createProject } from '@/projects/project-service';
import { workspaceManager } from '@/lib/sandbox/workspace-manager';

export class CreateWorkspaceTool extends BaseTool {
  name = 'create_workspace';
  description =
    '创建项目工作空间。需要写代码、创建文件、执行命令时调用。简单问答、搜索、讨论不需要调用。';

  schema = z.object({
    project_name: z.string().describe('项目短名（30 字以内）'),
  });

  constructor(
    private conversationId: string,
    private workspaceRef: { path?: string; projectId?: string },
    private onProjectCreated?: (projectId: string, name: string) => void,
  ) {
    super();
  }

  protected async _run(input: { project_name: string }): Promise<string> {
    const project = await createProject({
      name: input.project_name,
      description: '',
      is_light: false,
      conversation_id: this.conversationId,
    });

    const dirName = input.project_name.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '-');
    const workspace = await workspaceManager.createLocal({
      projectId: project.id,
      localDir: dirName,
    });

    // Write into shared reference so chat-engine can detect workspace creation
    this.workspaceRef.path = workspace.localPath;
    this.workspaceRef.projectId = project.id;

    // Notify frontend via callback
    this.onProjectCreated?.(project.id, project.name);

    return `Workspace created at ${workspace.localPath}. Project ID: ${project.id}`;
  }
}
