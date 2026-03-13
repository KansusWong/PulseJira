/**
 * automation — Create and manage automated pipelines.
 *
 * Supports cron-scheduled and webhook-triggered automations.
 * Delegates to AutomationService for all operations.
 * Global tool.
 */

import { z } from 'zod';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getAutomationService } from '../services/automation-service';

const schema = z.object({
  action: z.enum(['create', 'list', 'update', 'configure', 'pause', 'resume', 'delete', 'history'])
    .describe('Pipeline management action'),
  name: z.string().optional().describe('Pipeline name (required for create)'),
  pipeline_id: z.string().optional().describe('Pipeline ID (required for update/delete/pause/resume/history)'),
  config_json: z.string().optional()
    .describe('JSON configuration: { trigger_type, trigger_config: { expression }, task_design, execution_config }'),
  variables: z.string().optional().describe('JSON variables override for the pipeline'),
});

type Input = z.infer<typeof schema>;

export class AutomationTool extends BaseTool<Input, string> {
  name = 'automation';
  description = `Create and manage automated pipelines with cron or webhook triggers.
Actions:
  - create: Create a new pipeline (requires name + config_json)
  - list: List all pipelines
  - update: Update pipeline configuration (requires pipeline_id + config_json)
  - configure: Alias for update
  - pause: Pause a pipeline (requires pipeline_id)
  - resume: Resume a paused pipeline (requires pipeline_id)
  - delete: Delete a pipeline (requires pipeline_id)
  - history: View execution history (requires pipeline_id)

config_json example: {"trigger_type":"cron","trigger_config":{"expression":"0 9 * * 1-5"},"task_design":"Generate daily standup report"}`;
  schema = schema;

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const service = getAutomationService();

    try {
      switch (input.action) {
        case 'create':
          return await this.handleCreate(service, input, ctx);
        case 'list':
          return await this.handleList(service);
        case 'update':
        case 'configure':
          return await this.handleUpdate(service, input);
        case 'pause':
          return await this.handlePause(service, input);
        case 'resume':
          return await this.handleResume(service, input);
        case 'delete':
          return await this.handleDelete(service, input);
        case 'history':
          return await this.handleHistory(service, input);
        default:
          return `Error: Unknown action "${input.action}".`;
      }
    } catch (err: any) {
      return `Automation error: ${err.message}`;
    }
  }

  private async handleCreate(
    service: ReturnType<typeof getAutomationService>,
    input: Input,
    ctx?: ToolContext,
  ): Promise<string> {
    if (!input.name) return 'Error: name is required for create action.';
    if (!input.config_json) return 'Error: config_json is required for create action.';

    let config: any;
    try {
      config = JSON.parse(input.config_json);
    } catch {
      return 'Error: config_json is not valid JSON.';
    }

    const variables = input.variables ? JSON.parse(input.variables) : undefined;

    const pipeline = await service.createPipeline({
      name: input.name,
      agentId: ctx?.agentName || 'rebuild',
      triggerType: config.trigger_type || 'cron',
      triggerConfig: config.trigger_config || {},
      taskDesign: config.task_design || '',
      variables,
      executionConfig: config.execution_config,
    });

    return `Pipeline created:\n  ID: ${pipeline.id}\n  Name: ${pipeline.name}\n  Trigger: ${pipeline.triggerType}\n  Status: ${pipeline.status}`;
  }

  private async handleList(service: ReturnType<typeof getAutomationService>): Promise<string> {
    const pipelines = await service.listPipelines();

    if (pipelines.length === 0) {
      return 'No automation pipelines found.';
    }

    const lines = pipelines.map(p =>
      `  [${p.id.slice(0, 8)}] ${p.name} | ${p.triggerType} | ${p.status}`
    );
    return `Automation pipelines (${pipelines.length}):\n${lines.join('\n')}`;
  }

  private async handleUpdate(
    service: ReturnType<typeof getAutomationService>,
    input: Input,
  ): Promise<string> {
    if (!input.pipeline_id) return 'Error: pipeline_id is required for update action.';

    let config: any = {};
    if (input.config_json) {
      try {
        config = JSON.parse(input.config_json);
      } catch {
        return 'Error: config_json is not valid JSON.';
      }
    }

    const variables = input.variables ? JSON.parse(input.variables) : undefined;

    const pipeline = await service.updatePipeline(input.pipeline_id, {
      ...config,
      variables,
    });

    return `Pipeline updated:\n  ID: ${pipeline.id}\n  Name: ${pipeline.name}\n  Status: ${pipeline.status}`;
  }

  private async handlePause(
    service: ReturnType<typeof getAutomationService>,
    input: Input,
  ): Promise<string> {
    if (!input.pipeline_id) return 'Error: pipeline_id is required for pause action.';
    await service.pausePipeline(input.pipeline_id);
    return `Pipeline ${input.pipeline_id} paused.`;
  }

  private async handleResume(
    service: ReturnType<typeof getAutomationService>,
    input: Input,
  ): Promise<string> {
    if (!input.pipeline_id) return 'Error: pipeline_id is required for resume action.';
    await service.resumePipeline(input.pipeline_id);
    return `Pipeline ${input.pipeline_id} resumed.`;
  }

  private async handleDelete(
    service: ReturnType<typeof getAutomationService>,
    input: Input,
  ): Promise<string> {
    if (!input.pipeline_id) return 'Error: pipeline_id is required for delete action.';
    await service.deletePipeline(input.pipeline_id);
    return `Pipeline ${input.pipeline_id} deleted.`;
  }

  private async handleHistory(
    service: ReturnType<typeof getAutomationService>,
    input: Input,
  ): Promise<string> {
    if (!input.pipeline_id) return 'Error: pipeline_id is required for history action.';
    const runs = await service.getHistory(input.pipeline_id);

    if (runs.length === 0) {
      return 'No execution history for this pipeline.';
    }

    const lines = runs.map(r =>
      `  [${r.id.slice(0, 8)}] ${r.status} | ${r.triggerType} | ${r.createdAt}`
    );
    return `Execution history (${runs.length}):\n${lines.join('\n')}`;
  }
}
