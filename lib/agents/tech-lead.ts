// Backward compatibility shim — tech-lead is now merged into planner agent.
import { createPlannerAgent } from '@/agents/planner';

export function createTechLeadAgent(options?: { model?: string }) {
  return createPlannerAgent({ mode: 'task-plan', model: options?.model });
}
