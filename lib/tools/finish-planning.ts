import OpenAI from 'openai';

export const finishPlanningTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "finish_planning",
    description: "Submit the final analysis and list of tasks.",
    parameters: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["GO", "NO_GO"], description: "Whether to proceed with this feature" },
        score: { type: "number", description: "Confidence score (0-100)" },
        rationale: { type: "string", description: "Reasoning behind the decision" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              type: { type: "string", enum: ["feature", "bug", "chore"] },
              priority: { type: "string", enum: ["high", "medium", "low"] },
              affected_files: { type: "array", items: { type: "string" } },
              dependencies: { type: "array", items: { type: "string" } }
            },
            required: ["title", "description", "type", "priority", "affected_files"]
          }
        }
      },
      required: ["decision", "score", "rationale", "tasks"]
    }
  }
};

// No executor needed for finish_planning as it is handled specially in the loop
