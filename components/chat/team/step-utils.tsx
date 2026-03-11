/**
 * Shared step display utilities extracted from StreamingStepIndicator.
 * Used by both StreamingStepIndicator (normal mode) and AgentLane (team mode).
 */

import type { StructuredAgentStep } from "@/lib/core/types";

// ---------------------------------------------------------------------------
// Display item types
// ---------------------------------------------------------------------------

export type DisplayItem =
  | { type: "text"; step: StructuredAgentStep }
  | { type: "tool"; callStep: StructuredAgentStep; resultStep?: StructuredAgentStep }
  | { type: "thinking"; step: StructuredAgentStep }
  | { type: "completion"; step: StructuredAgentStep };

export function getItemAgent(item: DisplayItem): string {
  return item.type === "tool" ? item.callStep.agent : item.step.agent;
}

/** Group consecutive display items by agent. */
export function groupByAgent(items: DisplayItem[]): { agent: string; items: DisplayItem[] }[] {
  const groups: { agent: string; items: DisplayItem[] }[] = [];
  for (const item of items) {
    const agent = getItemAgent(item);
    const last = groups[groups.length - 1];
    if (last && last.agent === agent) {
      last.items.push(item);
    } else {
      groups.push({ agent, items: [item] });
    }
  }
  return groups;
}

/**
 * Build structured display items from the flat steps array.
 * Pairs consecutive tool_call + tool_result into a single "tool" item.
 */
export function buildDisplayItems(steps: StructuredAgentStep[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    if (step.kind === "tool_call") {
      const next = steps[i + 1];
      if (next?.kind === "tool_result") {
        items.push({ type: "tool", callStep: step, resultStep: next });
        i += 2;
      } else {
        items.push({ type: "tool", callStep: step });
        i++;
      }
    } else if (step.kind === "tool_result") {
      items.push({ type: "tool", callStep: step, resultStep: step });
      i++;
    } else if (step.kind === "text") {
      items.push({ type: "text", step });
      i++;
    } else if (step.kind === "completion") {
      items.push({ type: "completion", step });
      i++;
    } else {
      items.push({ type: "thinking", step });
      i++;
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 1) return "<1s";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function getItemDuration(
  item: DisplayItem,
  nextItem: DisplayItem | undefined,
  isLast: boolean,
  now: number,
): number | null {
  if (item.type === "tool") {
    if (item.resultStep) {
      return item.resultStep.timestamp - item.callStep.timestamp;
    }
    return now - item.callStep.timestamp;
  }
  if (item.type === "thinking") {
    return now - item.step.timestamp;
  }
  if (item.type === "text") {
    if (isLast) return now - item.step.timestamp;
    if (nextItem) {
      const nextTs = nextItem.type === "tool" ? nextItem.callStep.timestamp : nextItem.step.timestamp;
      return nextTs - item.step.timestamp;
    }
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bullet indicator component
// ---------------------------------------------------------------------------

export function Bullet({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      className={`mt-[5px] w-[7px] h-[7px] rounded-full shrink-0 ${color} ${pulse ? "animate-pulse" : ""}`}
    />
  );
}
