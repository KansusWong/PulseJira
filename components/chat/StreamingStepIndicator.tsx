"use client";

import { Brain, Wrench, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { getAgentUI } from "@/lib/config/agent-ui-meta";
import type { StructuredAgentStep } from "@/lib/core/types";

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

function StepIcon({ step, isLast }: { step: StructuredAgentStep; isLast: boolean }) {
  if (step.kind === "thinking") {
    return (
      <Brain
        className={`w-3.5 h-3.5 shrink-0 text-zinc-400 ${isLast ? "animate-pulse" : ""}`}
      />
    );
  }
  if (step.kind === "tool_call") {
    return (
      <Wrench
        className={`w-3.5 h-3.5 shrink-0 text-zinc-400 ${isLast ? "animate-pulse" : ""}`}
      />
    );
  }
  if (step.kind === "tool_result") {
    return step.success ? (
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
    ) : (
      <XCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
    );
  }
  if (step.kind === "completion") {
    return <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />;
  }
  return <span className="w-3.5 h-3.5 shrink-0" />;
}

export function StreamingStepIndicator({ steps }: Props) {
  if (steps.length === 0) return null;

  const groups = groupByAgent(steps);
  const lastStepId = steps[steps.length - 1]?.id;

  return (
    <div className="mr-auto max-w-[85%]">
      <div className="rounded-2xl px-4 py-3 bg-zinc-900/60 border border-zinc-800/50">
        <div className="space-y-3 max-h-48 overflow-y-auto">
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
                  {group.steps.map((step) => {
                    const isLast = step.id === lastStepId;
                    return (
                      <div
                        key={step.id}
                        className={`text-xs flex items-start gap-1.5 ${
                          isLast ? "text-zinc-300" : "text-zinc-500"
                        }`}
                      >
                        <span className="mt-0.5">
                          <StepIcon step={step} isLast={isLast} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span>{step.message}</span>
                          {/* Show result preview for tool_result on hover */}
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
