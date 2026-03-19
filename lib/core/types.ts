import OpenAI from 'openai';

export interface AgentContext {
  signalId?: string;
  traceId?: string;
  projectId?: string;
  /** Organization ID — used for org-scoped vault search and asset governance. */
  orgId?: string;
  /** Workspace root path — used by ToolContext for file I/O scoping. */
  workspacePath?: string;
  logger?: (message: string) => Promise<void> | void;
  /** Optional callback to record token usage for this run (agentName/projectId/model + tokens). */
  recordUsage?: (params: {
    agentName: string;
    projectId?: string;
    model?: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }) => void;
  /** Shared blackboard for inter-agent state. Available during pipeline execution. */
  blackboard?: import('../blackboard/blackboard').Blackboard;
  /** Trust level for tiered approval (auto / standard / collaborative).
   *  Used with tool.riskLevel to decide whether approval is needed. */
  trustLevel?: 'auto' | 'standard' | 'collaborative';
  /** Callback for tools that require human approval before execution.
   *  Returns true if approved, false if rejected. Blocks the agent thread. */
  onApprovalRequired?: (params: {
    toolName: string;
    toolArgs: Record<string, any>;
    agentName: string;
  }) => Promise<boolean>;
  /** Checkpoint callback — fired after each tool-call batch in the ReAct loop.
   *  Callers decide whether to persist (fire-and-forget DB write). */
  onCheckpoint?: (data: { messages: any[]; stepsCompleted: number }) => void;
  /** Callback when context hits 75% threshold, offering upgrade to Team mode.
   *  Returns true if user approves upgrade, false if rejected (or timeout).
   *  Blocks the agent thread until resolved. */
  onCompactionUpgradeRequired?: (params: {
    tokenUsage: { estimated: number; max: number; ratio: number };
  }) => Promise<boolean>;
  /** Streaming text token callback — called for each content delta. */
  onToken?: (token: string) => void;
  /** Streaming reasoning token callback — called for each reasoning_content delta (GLM-5 thinking mode). */
  onReasoningToken?: (token: string) => void;
  /** Called when a tool call starts execution. */
  onToolCallStart?: (params: {
    toolName: string;
    toolCallId: string;
    args: string;
  }) => void;
  /** Called when a tool call completes execution. */
  onToolCallEnd?: (params: {
    toolName: string;
    toolCallId: string;
    result: string;
    success: boolean;
  }) => void;
  /** Called when the LLM starts a new ReAct thinking step. */
  onStepStart?: (stepNumber: number) => void;
  /** Called when a ReAct step completes (LLM response received). */
  onStepComplete?: (params: {
    stepNumber: number;
    model: string;
    durationMs: number;
    promptTokens?: number;
    completionTokens?: number;
  }) => void;
  /** Called at each ReAct step with current context window usage. */
  onContextUsage?: (usage: { estimated: number; max: number; ratio: number }) => void;
  /** Called between ReAct steps. Returns a user-injected message, or null. */
  onUserMessageCheck?: () => Promise<string | null>;
}

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  tools?: import('./base-tool').BaseTool[];
  model?: string;
  client?: OpenAI;
  maxLoops?: number;
  exitToolName?: string;
  /** Pre-seeded conversation history for resuming an incomplete run. */
  initialMessages?: OpenAI.Chat.ChatCompletionMessageParam[];
  /** Explicit pool account ID (when client is provided externally). */
  accountId?: string;
  /** Explicit pool account name (when client is provided externally). */
  accountName?: string;
  /** Tags for pool-based account routing (e.g. ['compression']). */
  poolTags?: string[];
  /** Lazy-loaded prompt modules injected on-demand when triggered tools are first called. */
  lazyModules?: LazyPromptModule[];
  /** Tier 1 tool names — always included in LLM API calls. If unset, all tools are sent (backward compat). */
  tier1Tools?: Set<string>;
  /** Tier 2 tool groups — loaded on-demand via keyword or tool-call triggers. */
  tier2Groups?: ToolTierGroup[];
}

/** A tool group that gets activated when trigger conditions are met. */
export interface ToolTierGroup {
  id: string;
  tools: string[];
  /** Regex tested against user message to activate this group. */
  triggerKeywords: RegExp;
  /** When any of these tools are called, activate this group. */
  triggerTools: string[];
}

/** A prompt module that gets injected into the conversation when a trigger tool is first called. */
export interface LazyPromptModule {
  /** Unique module identifier (e.g. 'git', 'memory'). */
  id: string;
  /** Pre-loaded module content (markdown). */
  content: string;
  /** Tool names that trigger this module's injection. */
  triggerTools: string[];
}

export type ToolExecutionResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

// --- Workspace types (OpenClaw-style) ---

export interface AgentWorkspace {
  name: string;
  soul: string;
  systemPrompt: string;
  skills: string[];
  tools: string[];
  connectors: string[];
}

// --- Connector types ---

export interface ConnectorConfig {
  name: string;
  type: 'external' | 'bus';
}

// --- Agent message types for bus ---

export interface AgentMessage {
  id: string;
  from: string;
  to?: string;
  channel: string;
  type: 'agent_start' | 'agent_log' | 'agent_tool' | 'agent_complete' | 'stage_complete' | 'pipeline_complete';
  payload: any;
  timestamp: number;
}

export interface PipelineStage {
  name: string;
  agents: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

// ---------------------------------------------------------------------------
// Meta-agent types (Decision Maker / Architect / Supervisor)
// ---------------------------------------------------------------------------

/** Structured output from the Decision Maker agent.
 *  Fields align with FinishDecisionTool schema (lib/tools/finish-decision.ts). */
export interface DecisionOutput {
  decision: 'PROCEED' | 'HALT' | 'DEFER' | 'ESCALATE';
  confidence: number;
  summary: string;
  rationale: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: string[];
  sources: DecisionSource[];
  recommended_actions: string[];
  /** Signal IDs that were aggregated into this decision (batch mode). */
  aggregated_signals?: string[];
}

/** Fields align with SourceSchema in FinishDecisionTool. */
export interface DecisionSource {
  type: 'rag' | 'agent' | 'user' | 'external';
  name: string;
  summary: string;
  confidence: number;
}

/** A single step in the Architect's dynamic execution trace. */
export interface ArchitectExecutionStep {
  step_id: string;
  action:
    | 'spawn_agent'
    | 'create_agent'
    | 'create_skill'
    | 'invoke_skill'
    | 'use_tool'
    | 'evaluate';
  agent_or_tool: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  output?: any;
  validation?: SupervisorVerdict;
  retry_count: number;
}

/** Checkpoint data persisted during Architect pipeline execution. */
export interface ArchitectCheckpoint {
  messages: any[];
  started_at: string;
  updated_at: string;
  steps_completed: number;
  team_id: string;
  attempt: number;
}

/** Final result returned by the Architect agent. */
export interface ArchitectResult {
  execution_trace: ArchitectExecutionStep[];
  final_output: any;
  summary: string;
  steps_completed: number;
  steps_failed: number;
  steps_retried: number;
  /** Dynamic agents created during this session. */
  created_agents: string[];
  /** Dynamic skills created during this session. */
  created_skills: string[];
}

/** Supervisor's verdict on an agent step output. */
export interface SupervisorVerdict {
  verdict: 'pass' | 'fail' | 'warn';
  confidence: number;
  issues: SupervisorIssue[];
  suggestion?: string;
  should_retry: boolean;
}

export interface SupervisorIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'correctness' | 'completeness' | 'quality' | 'security' | 'consistency';
  message: string;
  evidence?: string;
}

/** Runtime definition for a dynamically-created skill (session-level or persistent). */
export interface DynamicSkillDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string;
  tags: string[];
  persistent: boolean;
  /** Optional resources to persist alongside the skill. */
  resources?: {
    references?: Array<{ path: string; content: string }>;
    scripts?: Array<{ path: string; content: string }>;
    assets?: Array<{ path: string; content: string }>;
  };
  /** Optional resource configuration for the skill. */
  resourceConfig?: {
    inject_references?: boolean;
    max_inject_size?: number;
  };
}

// ---------------------------------------------------------------------------
// Chat-First Architecture types
// ---------------------------------------------------------------------------

/** Complexity levels for user requests (3-tier). */
export type ComplexityLevel = 'L1' | 'L2' | 'L3';

/** Execution modes mapped from complexity. */
export type ExecutionMode = 'direct' | 'single_agent' | 'agent_team';

/** Output from the Complexity Assessor agent. */
export interface ComplexityAssessment {
  complexity_level: ComplexityLevel;
  execution_mode: ExecutionMode;
  rationale: string;
  suggested_agents: string[];
  estimated_steps: number;
  plan_outline: string[];
  requires_project: boolean;
  /** L3 only: whether the request needs clarification before execution. */
  requires_clarification: boolean;
}

/** Structured requirements produced after L3 clarification rounds. */
export interface StructuredRequirements {
  summary: string;
  goals: string[];
  scope: string;
  constraints: string[];
  suggested_name: string;
}

/** Conversation record. */
/** Tool approval request stored in conversation for persistence. */
export interface ToolApprovalRequest {
  approval_id: string;
  tool_name: string;
  tool_args: Record<string, any>;
  agent_name: string;
  requested_at: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  status: 'active' | 'archived' | 'converted';
  project_id: string | null;
  org_id?: string;
  created_by?: string;
  complexity_assessment: ComplexityAssessment | null;
  execution_mode: ExecutionMode | null;
  clarification_round?: number;
  clarification_context?: { questions: string[]; answers: string[] };
  dm_decision?: DecisionOutput | null;
  dm_approval_status?: 'pending' | 'approved' | 'rejected' | null;
  structured_requirements?: StructuredRequirements | null;
  pending_tool_approval?: ToolApprovalRequest | null;
  architect_phase_status?: 'running' | 'completed' | 'failed' | 'timed_out' | null;
  architect_checkpoint?: ArchitectCheckpoint | null;
  architect_result?: ArchitectResult | null;
  created_at: string;
  updated_at: string;
  highlighted: boolean;
}

/** Chat message roles. */
export type MessageRole = 'user' | 'assistant' | 'system' | 'agent' | 'plan';

/** Message record. */
export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  metadata: Record<string, any> | null;
  created_at: string;
}

/** Attachment metadata for chat messages. Stored in message.metadata.attachments. */
export interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  type: 'image' | 'document';
  mimeType: string;
  relativePath: string;
  absolutePath: string;
}

/** Agent team record. */
export interface AgentTeam {
  id: string;
  conversation_id: string | null;
  project_id: string | null;
  team_name: string;
  lead_agent: string;
  status: 'forming' | 'active' | 'idle' | 'disbanded';
  config: Record<string, any> | null;
  created_at: string;
}

/** Agent mailbox message types. */
export type MailboxMessageType =
  | 'task_assignment'
  | 'message'
  | 'broadcast'
  | 'plan_approval_request'
  | 'plan_approval_response'
  | 'idle_notification'
  | 'shutdown_request'
  | 'shutdown_response';

/** Agent mailbox message record. */
export interface AgentMailMessage {
  id: string;
  team_id: string;
  from_agent: string;
  to_agent: string;
  message_type: MailboxMessageType;
  payload: Record<string, any>;
  read: boolean;
  created_at: string;
}

/** Team task record. */
export interface TeamTask {
  id: string;
  team_id: string;
  subject: string;
  description: string | null;
  owner: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  blocks: string[];
  blocked_by: string[];
  result: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

/** SSE event types for the chat stream. */
export type ChatEventType =
  | 'message'
  | 'plan_assessment'
  | 'plan_update'
  | 'plan_step_progress'
  | 'agent_log'
  | 'team_update'
  | 'team_comms'
  | 'clarification_form'
  | 'project_created'
  | 'dm_decision'
  | 'tool_approval_required'
  | 'tool_approval_resolved'
  | 'solution_proposal'
  | 'architect_failed'
  | 'architect_resuming'
  | 'sub_agent_start'
  | 'sub_agent_complete'
  | 'questionnaire'
  | 'compaction_upgrade_required'
  | 'compaction_upgrade_resolved'
  | 'project_upgrade_suggested'
  | 'team_upgrade'
  | 'token'
  | 'reasoning_token'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'step_start'
  | 'step_complete'
  | 'context_usage'
  | 'mate_token'
  | 'error'
  | 'done';

export interface QuestionnaireQuestion {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'text';
  question: string;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

export interface QuestionnaireData {
  questions: QuestionnaireQuestion[];
  context: string | null;
}

/** SSE chat event. */
export interface ChatEvent {
  type: ChatEventType;
  data: any;
}

/** Structured progress step for streaming execution display. */
export interface StructuredAgentStep {
  id: string;
  agent: string;
  kind: 'thinking' | 'tool_call' | 'tool_result' | 'completion' | 'text';
  stepNumber?: number;
  toolName?: string;
  toolLabel?: string;
  argSummary?: string;
  success?: boolean;
  resultPreview?: string;
  message: string;
  timestamp: number;
  /** Model used for this step (populated on step_complete). */
  model?: string;
  /** LLM call duration in ms (populated on step_complete). */
  durationMs?: number;
}

/** Agent status in a team. */
export interface AgentStatus {
  name: string;
  status: 'active' | 'idle' | 'working' | 'completed' | 'failed';
  current_task?: string;
}

/** Team status summary. */
export interface TeamStatus {
  team_id: string;
  team_name: string;
  status: 'forming' | 'active' | 'idle' | 'disbanded';
  agents: AgentStatus[];
  tasks_completed: number;
  tasks_total: number;
}

/** User intervention in a team. */
export interface UserIntervention {
  type: 'pause_agent' | 'resume_agent' | 'send_instruction' | 'adjust_priority' | 'cancel_task';
  target_agent?: string;
  target_task?: string;
  instruction?: string;
  priority?: 'high' | 'medium' | 'low';
}

/** Code file change in a solution proposal. */
export interface CodeFileChange {
  path: string;              // File path relative to workspace
  action: 'create' | 'edit' | 'delete';
  content?: string;          // New content (for create/edit)
  original_content?: string; // Original content (for edit, to show diff)
  description?: string;      // Description of the change
}

/** Single code implementation solution. */
export interface CodeSolution {
  id: string;                // Unique solution ID
  name: string;              // Solution name (e.g., "Solution A: Use Redux")
  rationale: string;         // Why this solution
  trade_offs: string[];      // Pros and cons
  files: CodeFileChange[];   // File changes
  estimated_lines: number;   // Estimated total lines of code
  risk_level: 'low' | 'medium' | 'high';
}

/** Code solution proposal with multiple options for user selection. */
export interface CodeSolutionProposal {
  context: string;           // Problem context / requirement background
  solutions: CodeSolution[]; // List of solutions (typically 2-3)
  recommended_index: number; // Index of recommended solution
}

// ---------------------------------------------------------------------------
// Mate / Mission types (P0 — MateRegistry unification)
// ---------------------------------------------------------------------------

/** Persistent mate (agent persona) definition. */
export interface MateDefinition {
  id: string;
  name: string;
  display_name?: string;
  description: string;
  domains: string[];
  tools_allow: string[];
  tools_deny: string[];
  model: string;
  system_prompt: string;
  can_lead: boolean;
  status: MateStatus;
  source: 'file' | 'db' | 'dynamic';
  file_path?: string;
  metadata: Record<string, any>;
}

export type MateStatus = 'idle' | 'active' | 'hibernated' | 'retired';

/** Mission lifecycle phases. */
export type MissionStatus =
  | 'inception'
  | 'formation'
  | 'planning'
  | 'execution'
  | 'review'
  | 'delivery'
  | 'archival'
  | 'cancelled';

/** Mission record. */
export interface Mission {
  id: string;
  conversation_id: string | null;
  project_id: string | null;
  source_chat: string | null;
  mission_name: string;
  lead_mate: string | null;
  team_mates: string[];
  status: MissionStatus;
  token_budget: number | null;
  tokens_used: number;
  config: Record<string, any>;
  blackboard: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Re-export ToolContext for convenience
// ---------------------------------------------------------------------------

export type { ToolContext } from './tool-context';
