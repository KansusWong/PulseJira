export interface MessageScope {
  projectId?: string;
  sessionId?: string;
  stage?: string;
  traceId?: string;
}

export interface AgentMessage {
  id: string;
  from: string;
  to?: string;
  channel: string;
  type:
    | 'agent_start'
    | 'agent_log'
    | 'agent_tool'
    | 'agent_complete'
    | 'task_update'
    | 'stage_complete'
    | 'pipeline_complete'
    | 'meta_decision'
    | 'meta_spawn'
    | 'meta_validate'
    | 'meta_retry'
    | 'meta_create_agent'
    | 'meta_create_skill'
    | 'blackboard_change'
    // Chat-First architecture event types
    | 'chat_response'
    | 'plan_update'
    | 'team_comms'
    | 'team_task_update'
    | 'intervention_ack'
    // Sub-agent events (L2 single_agent mode)
    | 'sub_agent_start'
    | 'sub_agent_complete'
    // Plan step progress (Architect → PlanPanel)
    | 'plan_step_progress';
  payload: any;
  timestamp: number;
  scope?: MessageScope;
}

export type MessageHandler = (message: AgentMessage) => void | Promise<void>;
