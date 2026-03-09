import { BaseTool } from '../core/base-tool';
import {
  BlackboardReadInputSchema,
  type BlackboardReadInput,
  type BlackboardEntry,
} from '../blackboard/types';
import type { Blackboard } from '../blackboard/blackboard';

/**
 * Read entries from the shared blackboard.
 * Workspace-scoped — requires a Blackboard instance at creation time.
 */
export class BlackboardReadTool extends BaseTool<BlackboardReadInput, BlackboardEntry[]> {
  name = 'read_blackboard';
  description =
    'Read entries from the shared blackboard. Query by exact key, key prefix, type, tags, or author. ' +
    'Returns the latest version of matching entries. Use this to check what other agents have decided or produced.';
  schema = BlackboardReadInputSchema;

  private blackboard: Blackboard;

  constructor(blackboard: Blackboard) {
    super();
    this.blackboard = blackboard;
  }

  protected async _run(input: BlackboardReadInput): Promise<BlackboardEntry[]> {
    return this.blackboard.query({
      key: input.key,
      keyPrefix: input.keyPrefix,
      type: input.type,
      tags: input.tags,
      author: input.author,
      limit: input.limit,
    });
  }
}
