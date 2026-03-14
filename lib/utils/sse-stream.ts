import { usePulseStore } from '@/store/usePulseStore.new';
import type { ChatEvent } from '@/lib/core/types';

/**
 * Process an SSE response from the plan/chat API.
 *
 * This function reads the SSE stream and dispatches events directly to the
 * zustand store. Because it uses `getState()` (not React hooks), it keeps
 * working even if the calling component unmounts (e.g. after a route change).
 */
export async function processSSEResponse(
  response: Response,
  conversationId: string,
  callbacks?: {
    onProjectCreated?: (data: { project_id: string; name: string; is_light: boolean }) => void;
  },
) {
  if (!response.ok || !response.body) {
    console.warn('[SSE] response not ok or no body', { ok: response.ok, status: response.status });
    return;
  }

  const getStore = usePulseStore.getState;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  // Track whether a panel is waiting for user action (DM decision, tool approval,
  // architect failure).  When true, we keep isRunning=true so the project page
  // shows the running indicator while the user interacts with the panel.
  let hasPendingUserAction = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event: ChatEvent = JSON.parse(line.slice(6));
          const s = getStore();

          switch (event.type) {
            case 'message': {
              s.addMessage(conversationId, {
                id: event.data.id || crypto.randomUUID(),
                conversation_id: conversationId,
                role: event.data.role || 'assistant',
                content: event.data.content,
                metadata: event.data.metadata || null,
                created_at: event.data.created_at || new Date().toISOString(),
              });
              break;
            }

            case 'agent_log': {
              if (event.data.message) {
                s.addAgentLog({
                  agent: event.data.agent || 'system',
                  type: 'log',
                  message: event.data.message,
                });
              }
              break;
            }

            case 'plan_step_progress': {
              s.updatePlanStepProgress(
                event.data.step_index,
                event.data.status,
                event.data.summary,
              );
              break;
            }

            case 'project_created': {
              s.addMessage(conversationId, {
                id: crypto.randomUUID(),
                conversation_id: conversationId,
                role: 'system',
                content: event.data.is_light
                  ? `Light project created: **${event.data.name}**`
                  : `Project created: **${event.data.name}**`,
                metadata: event.data,
                created_at: new Date().toISOString(),
              });
              // Always add the project to the store so the sidebar reflects it
              if (event.data.project_id) {
                s.addProject({
                  id: event.data.project_id,
                  name: event.data.name,
                  description: '',
                  status: 'analyzing' as const,
                  is_light: !!event.data.is_light,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
              }
              callbacks?.onProjectCreated?.(event.data);
              break;
            }

            case 'dm_decision': {
              if (event.data.decision === 'PROCEED') {
                // Hide plan panel first so the DM panel can take priority
                // in the layout's right-panel ternary chain.
                s.hidePlanPanel();
                s.showDmPanel(event.data);
                hasPendingUserAction = true;
              }
              break;
            }

            case 'team_update': {
              // Incremental update if panel already showing for this team (preserves communications)
              if (s.teamPanel.visible && s.teamPanel.teamId === event.data.team_id) {
                s.updateTeamStatus({ agents: event.data.agents || [] } as any);
              } else {
                s.showTeamPanel(event.data.team_id, event.data.agents || []);
              }
              break;
            }

            case 'tool_approval_required': {
              s.showToolApproval({
                approvalId: event.data.approval_id,
                toolName: event.data.tool_name,
                toolArgs: event.data.tool_args,
                agentName: event.data.agent_name,
              });
              hasPendingUserAction = true;
              break;
            }

            case 'tool_approval_resolved': {
              s.hideToolApproval();
              hasPendingUserAction = false;
              break;
            }

            case 'architect_failed': {
              s.showArchitectFailed({
                errorMessage: event.data.message,
                stepsCompleted: event.data.steps_completed ?? 0,
                attempt: event.data.attempt ?? 1,
              });
              hasPendingUserAction = true;
              break;
            }

            case 'questionnaire': {
              s.setQuestionnaireData(event.data);
              break;
            }

            case 'error': {
              s.addMessage(conversationId, {
                id: crypto.randomUUID(),
                conversation_id: conversationId,
                role: 'system',
                content: `Error: ${event.data.message}`,
                metadata: null,
                created_at: new Date().toISOString(),
              });
              break;
            }

            case 'done': {
              // Mark all active steps as completed on stream end
              const currentStepStates = s.planPanel.stepStates;
              currentStepStates.forEach((step, i) => {
                if (step.status === 'active') {
                  s.updatePlanStepProgress(i, 'completed');
                }
              });
              break;
            }
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  } finally {
    // Stream ended (normal completion or error).  Clean up running state
    // unless a panel is waiting for user interaction — in that case the
    // next phase (DM approve, architect resume, etc.) will take over.
    const s = getStore();
    if (!hasPendingUserAction) {
      if (s.isRunning) {
        s.setRunning(false);
      }
    }
    // Always hide the plan panel when the stream ends — either the plan
    // execution completed, or a subsequent panel (DM) already replaced it.
    if (s.planPanel.visible && s.planPanel.status === 'approved') {
      s.hidePlanPanel();
    }
  }
}
