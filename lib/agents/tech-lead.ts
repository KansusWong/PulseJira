import OpenAI from 'openai';
import { getCodeContext } from '../context-provider';
import { retrieveContext, storeDecision } from '../rag';
import { getRecentRejections } from '../feedback';
import { TECH_LEAD_REACT_SYSTEM_PROMPT } from '../prompts';

// Tools Imports
import { listFilesTool, listFilesExecutor, readFileTool, readFileExecutor } from '../tools/file-system';
import { finishPlanningTool } from '../tools/finish-planning';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

// --- Tools Registration ---
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  listFilesTool,
  readFileTool,
  finishPlanningTool
];

// --- Tool Executor Registry ---
const toolExecutors: Record<string, (args: any) => Promise<string>> = {
  'list_files': listFilesExecutor,
  'read_file': readFileExecutor,
  // 'finish_planning' is handled specially
};

export async function planTechnicalTasks(signalId: string, signalContent: string) {
  // 1. Initial Context
  const ragContext = await retrieveContext(signalContent);
  const negativeExamples = await getRecentRejections();
  const basicContext = getCodeContext();

  const systemPrompt = TECH_LEAD_REACT_SYSTEM_PROMPT;
  
  const userMessageContent = `
Signal:
${signalContent}

Vision Context:
${ragContext.visionContext}

Past Decisions:
${ragContext.pastDecisions}

Negative Patterns:
${negativeExamples}

Initial File Context:
${basicContext}

Please analyze and generate tasks.
`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessageContent }
  ];

  const MAX_LOOPS = 12;
  let loopCount = 0;

  console.log("--- Starting ReAct Planning Loop ---");

  while (loopCount < MAX_LOOPS) {
    loopCount++;
    console.log(`Loop ${loopCount}/${MAX_LOOPS}`);

    // 2. LLM Call
    const completion = await openai.chat.completions.create({
      model: process.env.LLM_MODEL_NAME || "glm-4",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    const choice = completion.choices[0];
    if (!choice) {
      console.warn("No choices returned from OpenAI");
      messages.push({ role: "user", content: "No response received. Please try again." });
      continue;
    }
    const message = choice.message;
    messages.push(message);

    // 3. Handle Tool Calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const fnName = toolCall.function.name;
        let args;
        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch (e) {
            console.error(`Failed to parse arguments for tool ${fnName}:`, e);
            messages.push({ 
                role: "tool", 
                tool_call_id: toolCall.id, 
                content: "Error: Invalid JSON arguments provided." 
            });
            continue;
        }

        console.log(`Executing Tool: ${fnName}`, args);

        // Special handling for finish_planning
        if (fnName === 'finish_planning') {
          await storeDecision(signalId, signalContent, args.rationale || "ReAct Planned Tasks", args);
          return args;
        }

        // Generic execution for other tools
        const executor = toolExecutors[fnName];
        let result = "Error: Unknown tool";
        
        if (executor) {
          try {
            result = await executor(args);
          } catch (e: any) {
            result = `Error executing ${fnName}: ${e.message}`;
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result
        });
      }
    } else {
      // 4. Critical: Edge Case - Model didn't call tool.
      if (!message.content) {
          console.warn("Empty response from LLM, retrying...");
          messages.push({ role: "user", content: "Please continue. Call a tool or 'finish_planning'." });
      } else {
          // Model provided text content but no tool calls. 
          // It might be thinking out loud. We should encourage it to proceed to action.
          console.log("Model provided text content:", message.content);
          messages.push({ role: "user", content: "Please proceed with the next step. Call a tool or 'finish_planning' if you are done." });
      }
    }
  }

  console.warn("Max loops reached without finish_planning");
  return null;
}
