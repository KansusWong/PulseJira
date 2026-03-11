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
  if (!response.ok || !response.body) return;

  const getStore = usePulseStore.getState;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
            callbacks?.onProjectCreated?.(event.data);
            break;
          }

          case 'dm_decision': {
            if (event.data.decision === 'PROCEED') {
              s.showDmPanel(event.data);
            }
            break;
          }

          case 'team_update': {
            s.showTeamPanel(event.data.team_id, event.data.agents || []);
            break;
          }

          case 'tool_approval_required': {
            s.showToolApproval({
              approvalId: event.data.approval_id,
              toolName: event.data.tool_name,
              toolArgs: event.data.tool_args,
              agentName: event.data.agent_name,
            });
            break;
          }

          case 'tool_approval_resolved': {
            s.hideToolApproval();
            break;
          }

          case 'architect_failed': {
            s.showArchitectFailed({
              errorMessage: event.data.message,
              stepsCompleted: event.data.steps_completed ?? 0,
              attempt: event.data.attempt ?? 1,
            });
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

          case 'done':
            break;
        }
      } catch {
        // Skip malformed SSE lines
      }
    }
  }
}
