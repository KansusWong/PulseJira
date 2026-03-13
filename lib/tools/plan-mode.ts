/**
 * Plan Mode tools — enter_plan_mode, exit_plan_mode, ask_user_question.
 *
 * These tools return structured markers that ChatEngine parses into SSE events.
 * Markers: [[PLAN_MODE_ENTER]], [[PLAN_REVIEW]], [[QUESTION_DATA]], [[TOOL_ERROR]]
 */

import { z } from 'zod';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { getPlanModeState, setPlanModeState } from './plan-mode-state';
import { selectDesc } from './tool-desc-version';
import { extractTaskTitle, sanitizeFolderName, isPlanFileEmpty } from './helpers';

// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');

// =====================================================================
// EnterPlanModeTool
// =====================================================================

const ENTER_PLAN_DESC_V1 = `Enter plan mode to explore the codebase and design an implementation plan.
Use this for non-trivial tasks that need user approval before execution.
Creates a plan file in the workspace's .plans/ directory.
The plan file starts empty — you write the plan from scratch.
A task title is extracted from the reason/task_name for folder naming.
The folder is sanitized (no path traversal, preserves Chinese chars, max 50 chars).
You can explore the codebase freely while in plan mode.
When ready, call exit_plan_mode to submit for review.
Do NOT use this for simple tasks (typo fixes, obvious bugs).`;

const ENTER_PLAN_DESC_V2 = 'Enter plan mode to design an implementation plan. Creates a plan file for you to fill in.';

const enterSchema = z.object({
  reason: z.string().describe('Why plan mode is needed'),
  task_name: z.string().optional().describe('Short name for the task being planned'),
});

type EnterInput = z.infer<typeof enterSchema>;

export class EnterPlanModeTool extends BaseTool<EnterInput, string> {
  name = 'enter_plan_mode';
  description = selectDesc(ENTER_PLAN_DESC_V1, ENTER_PLAN_DESC_V2);
  schema = enterSchema;

  constructor() {
    super();
    this.description = selectDesc(ENTER_PLAN_DESC_V1, ENTER_PLAN_DESC_V2);
  }

  protected async _run(input: EnterInput, ctx?: ToolContext): Promise<string> {
    const conversationId = ctx?.sessionId || 'default';
    const state = getPlanModeState(conversationId);

    if (state.active) {
      return 'Error: Already in plan mode. Use exit_plan_mode to submit your plan first.';
    }

    // Extract task title and folder name
    const taskTitle = extractTaskTitle(input.task_name || input.reason);
    const folder = sanitizeFolderName(taskTitle);

    // Create plan file in workspace
    const wsRoot = ctx?.workspacePath || '.';
    const planDir = path.join(wsRoot, '.plans', folder);
    const planFileName = `${folder}Plan.md`;
    const planFilePath = path.join(planDir, planFileName);
    const relativePath = path.relative(wsRoot, planFilePath);

    try {
      fs.mkdirSync(planDir, { recursive: true });
      // Initial content is empty (agent writes plan from scratch)
      fs.writeFileSync(planFilePath, '', 'utf-8');
    } catch {
      // Non-fatal: plan mode works without file
    }

    setPlanModeState(conversationId, {
      active: true,
      planFilePath,
      taskName: taskTitle,
      enteredAt: new Date(),
      relativePath,
      projectFolder: folder,
      reason: input.reason,
    });

    const markerData = JSON.stringify({
      reason: input.reason,
      task_name: taskTitle,
      plan_file: planFilePath,
      relative_path: relativePath,
      project_folder: folder,
    });

    return `[[PLAN_MODE_ENTER]]${markerData}[[/PLAN_MODE_ENTER]]\n\nPlan mode activated. You can now explore the codebase and write your plan. When ready, call exit_plan_mode with a summary.\n\nPlan file: ${relativePath}`;
  }
}

// =====================================================================
// ExitPlanModeTool
// =====================================================================

const EXIT_PLAN_DESC_V1 = `Submit your plan for user review and exit plan mode.
You must have written a plan (>50 characters, excluding whitespace) before calling this.
If the plan file is too short, you will be warned and plan mode will NOT exit.
The plan content is included in the review marker for the frontend to display.`;

const EXIT_PLAN_DESC_V2 = 'Submit plan for user review. Plan must be >50 chars or exit is rejected.';

const exitSchema = z.object({
  summary: z.string().describe('Summary of the plan for user review'),
});

type ExitInput = z.infer<typeof exitSchema>;

export class ExitPlanModeTool extends BaseTool<ExitInput, string> {
  name = 'exit_plan_mode';
  description = selectDesc(EXIT_PLAN_DESC_V1, EXIT_PLAN_DESC_V2);
  schema = exitSchema;

  constructor() {
    super();
    this.description = selectDesc(EXIT_PLAN_DESC_V1, EXIT_PLAN_DESC_V2);
  }

  protected async _run(input: ExitInput, ctx?: ToolContext): Promise<string> {
    const conversationId = ctx?.sessionId || 'default';
    const state = getPlanModeState(conversationId);

    if (!state.active) {
      return 'Error: Not in plan mode. Call enter_plan_mode first.';
    }

    // Read plan file if it exists
    let planContent = '';
    if (state.planFilePath) {
      try {
        planContent = fs.readFileSync(state.planFilePath, 'utf-8');
      } catch {
        // Plan file may not exist
      }
    }

    // Check plan is not empty using reference-aligned check
    if (isPlanFileEmpty(planContent) && isPlanFileEmpty(input.summary)) {
      return 'Warning: \u8BA1\u5212\u5185\u5BB9\u592A\u77ED\uFF08\u4E0D\u8DB3 50 \u5B57\u7B26\uFF09\u3002\u8BF7\u5148\u7F16\u5199\u66F4\u8BE6\u7EC6\u7684\u8BA1\u5212\u518D\u63D0\u4EA4\u3002Plan mode \u4ECD\u7136\u6D3B\u8DC3\u3002';
    }

    // Deactivate plan mode
    setPlanModeState(conversationId, {
      active: false,
    });

    const markerData = JSON.stringify({
      summary: input.summary,
      task_name: state.taskName,
      plan_file: state.planFilePath,
      plan_content: planContent || input.summary,
      relative_path: state.relativePath,
    });

    return `[[PLAN_REVIEW]]${markerData}[[/PLAN_REVIEW]]`;
  }
}

// =====================================================================
// AskUserQuestionTool — redesigned schema
// =====================================================================

const ASK_DESC_V1 = `Ask the user questions to clarify requirements, validate assumptions, or get decisions.
Supports 1-4 questions.
Each question has: id (unique), type (single_choice/multiple_choice/text), question text, and options (for choice types).
Questions are validated defensively — malformed input returns [[TOOL_ERROR]] instead of crashing.
Users can always provide custom text answers.`;

const ASK_DESC_V2 = 'Ask user questions with single/multiple choice or text input. Max 4 questions.';

// Loose schema — we validate manually for defensive error handling
const askSchema = z.object({
  questions: z.any().describe('Questions to ask the user (array of question objects)'),
  context: z.string().optional().describe('Additional context for the questions'),
});

type AskInput = z.infer<typeof askSchema>;

interface QuestionItem {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'text';
  question: string;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

export class AskUserQuestionTool extends BaseTool<AskInput, string> {
  name = 'ask_user_question';
  description = selectDesc(ASK_DESC_V1, ASK_DESC_V2);
  schema = askSchema;

  constructor() {
    super();
    this.description = selectDesc(ASK_DESC_V1, ASK_DESC_V2);
  }

  protected async _run(input: AskInput): Promise<string> {
    // Defensive parsing — return [[TOOL_ERROR]] instead of crashing
    let questions: any = input.questions;

    // Handle string input (LLM may send JSON string)
    if (typeof questions === 'string') {
      try {
        questions = JSON.parse(questions);
      } catch {
        return '[[TOOL_ERROR]]questions \u53C2\u6570\u65E0\u6CD5\u89E3\u6790\u4E3A JSON\u3002\u8BF7\u4F20\u5165\u95EE\u9898\u5BF9\u8C61\u6570\u7EC4\u3002[[/TOOL_ERROR]]';
      }
    }

    // Handle single question object → wrap in array
    if (questions && typeof questions === 'object' && !Array.isArray(questions)) {
      questions = [questions];
    }

    if (!Array.isArray(questions)) {
      return '[[TOOL_ERROR]]questions \u5E94\u4E3A\u6570\u7EC4\uFF08\u5305\u542B 1-4 \u4E2A\u95EE\u9898\u5BF9\u8C61\uFF09\u3002[[/TOOL_ERROR]]';
    }

    if (questions.length === 0) {
      return '[[TOOL_ERROR]]questions \u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u81F3\u5C11\u63D0\u4F9B 1 \u4E2A\u95EE\u9898\u3002[[/TOOL_ERROR]]';
    }

    if (questions.length > 4) {
      return '[[TOOL_ERROR]]questions \u6700\u591A 4 \u4E2A\u95EE\u9898\u3002[[/TOOL_ERROR]]';
    }

    // Validate each question
    const validated: QuestionItem[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      if (!q || typeof q !== 'object') {
        return `[[TOOL_ERROR]]\u7B2C ${i + 1} \u4E2A\u95EE\u9898\u5FC5\u987B\u662F\u5BF9\u8C61\u3002[[/TOOL_ERROR]]`;
      }

      if (!q.question || typeof q.question !== 'string') {
        return `[[TOOL_ERROR]]\u7B2C ${i + 1} \u4E2A\u95EE\u9898\u7F3A\u5C11 question \u5B57\u6BB5\u3002[[/TOOL_ERROR]]`;
      }

      // Normalize type
      let type: QuestionItem['type'] = 'single_choice';
      if (q.type === 'multiple_choice' || q.multi_select === true || q.multiSelect === true) {
        type = 'multiple_choice';
      } else if (q.type === 'text') {
        type = 'text';
      }

      // Normalize options — accept various formats
      let options: string[] | undefined;
      if (q.options) {
        if (Array.isArray(q.options)) {
          options = q.options.map((opt: any) => {
            if (typeof opt === 'string') return opt;
            if (opt && typeof opt === 'object') {
              // Handle {label, description} format from old schema
              return opt.label || opt.description || String(opt);
            }
            return String(opt);
          });
        }
      }

      // Choice questions need options
      if (type !== 'text' && (!options || options.length < 2)) {
        return `[[TOOL_ERROR]]\u7B2C ${i + 1} \u4E2A\u95EE\u9898\u7C7B\u578B\u4E3A ${type}\uFF0C\u4F46\u7F3A\u5C11\u9009\u9879\uFF08\u81F3\u5C11 2 \u4E2A\uFF09\u3002[[/TOOL_ERROR]]`;
      }

      validated.push({
        id: q.id || `q${i + 1}`,
        type,
        question: q.question,
        options,
        required: q.required !== false,
        placeholder: q.placeholder,
      });
    }

    const markerData = JSON.stringify({
      questions: validated,
      context: input.context || null,
    });

    return `[[QUESTION_DATA]]${markerData}[[/QUESTION_DATA]]`;
  }
}
