import { useMemo } from "react";
import type { StructuredAgentStep, AgentStatus } from "@/lib/core/types";

/**
 * Split a flat steps array into per-agent groups.
 * Initialises keys from the agents list so even idle agents appear in the map.
 */
export function useAgentSteps(
  steps: StructuredAgentStep[],
  agents: AgentStatus[],
): Map<string, StructuredAgentStep[]> {
  return useMemo(() => {
    const map = new Map<string, StructuredAgentStep[]>();

    // Pre-populate all known agents (ensures idle agents show an empty lane)
    for (const a of agents) {
      map.set(a.name, []);
    }

    // Distribute steps by agent name
    for (const step of steps) {
      const key = step.agent;
      const arr = map.get(key);
      if (arr) {
        arr.push(step);
      } else {
        map.set(key, [step]);
      }
    }

    return map;
  }, [steps, agents]);
}
