import { BaseTool } from '../core/base-tool';
import {
  BlackboardWriteInputSchema,
  type BlackboardWriteInput,
  type BlackboardEntry,
} from '../blackboard/types';
import type { Blackboard } from '../blackboard/blackboard';

/**
 * Write an entry to the shared blackboard.
 * Workspace-scoped — requires a Blackboard instance at creation time.
 */
export class BlackboardWriteTool extends BaseTool<BlackboardWriteInput, BlackboardEntry> {
  name = 'write_blackboard';
  description =
    'Write a decision, artifact, question, status update, constraint, or feedback entry to the shared blackboard. ' +
    'Other agents can read your entries. Use namespaced keys like "pm.prd" or "developer.task-3.summary".';
  schema = BlackboardWriteInputSchema;

  private blackboard: Blackboard;
  private agentName: string;

  constructor(blackboard: Blackboard, agentName: string) {
    super();
    this.blackboard = blackboard;
    this.agentName = agentName;
  }

  protected async _run(input: BlackboardWriteInput): Promise<BlackboardEntry> {
    return this.blackboard.write({
      key: input.key,
      value: input.value,
      type: input.type,
      author: this.agentName,
      tags: input.tags,
    });
  }
}
