"use client";

import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import type { StructuredAgentStep } from "@/lib/core/types";

/** Maximum number of recent steps to display. */
const MAX_VISIBLE_STEPS = 5;

interface Props {
  steps: StructuredAgentStep[];
}

/** Group consecutive steps by agent name. */
function groupByAgent(steps: StructuredAgentStep[]): { agent: string; steps: StructuredAgentStep[] }[] {
  const groups: { agent: string; steps: StructuredAgentStep[] }[] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    if (last && last.agent === step.agent) {
      last.steps.push(step);
    } else {
      groups.push({ agent: step.agent, steps: [step] });
    }
  }
  return groups;
}

function StepBadge({ index, step, isLast }: { index: number; step: StructuredAgentStep; isLast: boolean }) {
  // Completed results: show success/fail icon instead of number
  if (step.kind === "tool_result") {
    return step.success ? (
      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
    ) : (
      <XCircle className="w-4 h-4 shrink-0 text-red-400" />
    );
  }
  if (step.kind === "completion") {
    return <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />;
  }

  // Thinking / tool_call: numbered badge
  const num = step.stepNumber ?? index + 1;
  return (
    <span
      className={`shrink-0 w-4 h-4 rounded-md text-[9px] font-semibold flex items-center justify-center leading-none ${
        isLast
          ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30"
          : "bg-zinc-800 text-zinc-500"
      }`}
    >
      {num}
    </span>
  );
}

export function StreamingStepIndicator({ steps }: Props) {
  if (steps.length === 0) return null;

  // Only show the most recent steps to keep the indicator compact
  const hiddenCount = Math.max(0, steps.length - MAX_VISIBLE_STEPS);
  const visibleSteps = hiddenCount > 0 ? steps.slice(-MAX_VISIBLE_STEPS) : steps;
  const groups = groupByAgent(visibleSteps);
  const lastStepId = steps[steps.length - 1]?.id;

  return (
    <div className="mr-auto max-w-[85%]">
      <div className="rounded-2xl px-4 py-3 bg-zinc-900/60 border border-zinc-800/50">
        {hiddenCount > 0 && (
          <div className="text-[10px] text-zinc-600 mb-2">
            +{hiddenCount} earlier steps
          </div>
        )}
        <div className="space-y-3">
          {groups.map((group, gi) => {
            const ui = getAgentUI(group.agent);
            const badgeClass = ui?.badgeClass || "bg-zinc-500/20 text-zinc-400";
            const label = ui?.label || group.agent;
            const borderColor = ui?.borderColor || "border-zinc-500";

            return (
              <div key={gi} className={`border-l-2 ${borderColor} pl-3`}>
                {/* Agent badge */}
                <div className="mb-1.5">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${badgeClass}`}
                  >
                    {label}
                  </span>
                </div>

                {/* Steps within this agent group */}
                <div className="space-y-1">
                  {group.steps.map((step, si) => {
                    const isLast = step.id === lastStepId;
                    return (
                      <div
                        key={step.id}
                        className={`text-xs flex items-start gap-2 ${
                          isLast ? "text-zinc-300" : "text-zinc-500"
                        }`}
                      >
                        <span className="mt-0.5">
                          <StepBadge index={si} step={step} isLast={isLast} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span>{step.message}</span>
                          {step.kind === "tool_result" && step.resultPreview && (
                            <span
                              className={`block truncate text-[10px] mt-0.5 ${
                                step.success ? "text-zinc-600" : "text-red-400/70"
                              }`}
                              title={step.resultPreview}
                            >
                              {step.resultPreview}
                            </span>
                          )}
                        </span>
                        {isLast && (
                          <Loader2 className="w-3 h-3 shrink-0 mt-0.5 text-zinc-500 animate-spin" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
