import { BaseTool } from '@/lib/core/base-tool';
import { z } from 'zod';
import type { CodeSolutionProposal } from '@/lib/core/types';
import type { TrustLevel } from '@/lib/services/preferences-store';
import type { Blackboard } from '@/lib/blackboard/blackboard';

const fileChangeSchema = z.object({
  path: z.string().describe('File path relative to workspace root (e.g., "src/auth/jwt.ts")'),
  action: z.enum(['create', 'edit', 'delete']).describe('Type of file operation'),
  content: z.string().optional().describe('New file content (required for create/edit)'),
  original_content: z.string().optional().describe('Original content before edit (for showing diff)'),
  description: z.string().optional().describe('Brief description of this change'),
});

const solutionSchema = z.object({
  id: z.string().describe('Unique ID for this solution (e.g., "sol-1")'),
  name: z.string().describe('Short descriptive name (e.g., "Solution A: JWT + Redis")'),
  rationale: z.string().describe('Why this solution is viable'),
  trade_offs: z.array(z.string()).describe('List of pros and cons / trade-offs'),
  files: z.array(fileChangeSchema).describe('List of file changes in this solution'),
  estimated_lines: z.number().describe('Estimated total lines of code to be added/modified'),
  risk_level: z.enum(['low', 'medium', 'high']).describe('Implementation risk level'),
});

const schema = z.object({
  context: z.string().describe('Problem context and requirement background'),
  solutions: z.array(solutionSchema).min(2).max(3).describe('2-3 alternative implementation solutions'),
  recommended_index: z.number().min(0).describe('Index of the recommended solution (0-based)'),
});

type Input = z.infer<typeof schema>;

interface SolutionToolResult {
  auto_selected?: boolean;
  selected_solution_id: string;
  proposal: CodeSolutionProposal;
  message: string;
}

/**
 * ProposeSolutionsTool — presents multiple code implementation proposals to the user.
 *
 * Behavior depends on user's trust level preference:
 * - **Auto mode**: Automatically selects the recommended solution without user interaction
 * - **Collaborative mode**: Presents solutions to user for manual selection
 *
 * Used when an agent (Architect/Developer) identifies multiple viable approaches
 * for implementing a feature.
 */
export class ProposeSolutionsTool extends BaseTool<Input, SolutionToolResult> {
  name = 'propose_code_solutions';
  description = `Present multiple code implementation solutions for consideration.

Use this tool when:
- Multiple valid implementation approaches exist (e.g., different libraries, architectures)
- Trade-offs exist between performance, simplicity, maintainability, etc.
- The choice significantly impacts project structure or dependencies

In AUTO mode: The recommended solution will be automatically selected.
In COLLABORATIVE mode: User will review and select their preferred solution.`;

  schema = schema;

  private trustLevel: TrustLevel;
  private blackboard?: Blackboard;

  constructor(trustLevel: TrustLevel = 'collaborative', blackboard?: Blackboard) {
    super();
    this.trustLevel = trustLevel;
    this.blackboard = blackboard;
  }

  protected async _run(input: Input): Promise<SolutionToolResult> {
    // Validate recommended index is in range
    if (input.recommended_index >= input.solutions.length) {
      throw new Error(`recommended_index ${input.recommended_index} is out of range (solutions: ${input.solutions.length})`);
    }

    const proposal = input as CodeSolutionProposal;
    const recommendedSolution = proposal.solutions[input.recommended_index];

    if (this.trustLevel === 'auto') {
      // Auto mode: automatically select the recommended solution
      return {
        auto_selected: true,
        selected_solution_id: recommendedSolution.id,
        proposal,
        message: `Auto-selected recommended solution: ${recommendedSolution.name}\n\nRationale: ${recommendedSolution.rationale}\n\nYou may now proceed to implement this solution.`,
      };
    } else {
      // Collaborative mode: mark for user selection
      // Write proposal to blackboard for chat-engine to detect
      if (this.blackboard) {
        await this.blackboard.write({
          key: 'architect.solution_proposal',
          value: proposal,
          type: 'decision',
          author: 'architect',
          tags: ['solution', 'awaiting_user'],
        });
      }

      return {
        selected_solution_id: '', // Will be set after user selection
        proposal,
        message: `Solutions proposed. Awaiting user selection. Context: ${proposal.context}`,
      };
    }
  }
}
