import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'events';
import type { AgentMessage, MessageHandler, MessageScope } from './types';

let messageCounter = 0;

type LogScopeFilter = Pick<MessageScope, 'projectId' | 'sessionId'>;

/**
 * In-process pub/sub message bus for Agent communication.
 * Agents don't import each other directly — they communicate through typed channels.
 * All messages are also broadcast to 'agent-log' for SSE streaming.
 */
class MessageBus {
  private emitter: EventEmitter;
  private scopeStorage: AsyncLocalStorage<MessageScope>;

  constructor() {
    this.emitter = new EventEmitter();
    this.scopeStorage = new AsyncLocalStorage<MessageScope>();
    this.emitter.setMaxListeners(50);
  }

  /**
   * Run a function within a scoped message context.
   * Every message published in this async call chain inherits this scope.
   */
  withScope<T>(scope: MessageScope, run: () => T): T {
    const inheritedScope = this.scopeStorage.getStore() ?? {};
    return this.scopeStorage.run({ ...inheritedScope, ...scope }, run);
  }

  /**
   * Publish a message to a channel.
   */
  publish(
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'scope'> & { scope?: MessageScope }
  ): AgentMessage {
    const inheritedScope = this.scopeStorage.getStore();
    const mergedScope =
      inheritedScope || message.scope
        ? { ...(inheritedScope ?? {}), ...(message.scope ?? {}) }
        : undefined;

    const fullMessage: AgentMessage = {
      ...message,
      id: `msg-${++messageCounter}-${Date.now()}`,
      timestamp: Date.now(),
      scope: mergedScope,
    };

    // Emit to specific channel
    this.emitter.emit(message.channel, fullMessage);

    // Always broadcast to agent-log for SSE
    if (message.channel !== 'agent-log') {
      this.emitter.emit('agent-log', fullMessage);
    }

    return fullMessage;
  }

  /**
   * Subscribe to a channel.
   */
  subscribe(channel: string, handler: MessageHandler): () => void {
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }

  private matchesLogScope(message: AgentMessage, scope?: LogScopeFilter): boolean {
    if (!scope) return true;
    if (scope.projectId && message.scope?.projectId !== scope.projectId) return false;
    if (scope.sessionId && message.scope?.sessionId !== scope.sessionId) return false;
    return true;
  }

  /**
   * Subscribe to agent-log messages (for SSE streaming).
   * Optional scope filter prevents cross-project/session message leakage.
   */
  onLog(handler: MessageHandler, scope?: LogScopeFilter): () => void {
    if (!scope?.projectId && !scope?.sessionId) {
      return this.subscribe('agent-log', handler);
    }

    const scopedHandler: MessageHandler = (message) => {
      if (!this.matchesLogScope(message, scope)) return;
      return handler(message);
    };

    return this.subscribe('agent-log', scopedHandler);
  }

  /**
   * Create a logger function that publishes to the bus.
   * Drop-in replacement for the existing logger pattern.
   */
  createLogger(
    agentName: string,
    taskContext?: { taskId: string; taskTitle: string },
  ): (message: string) => Promise<void> {
    return async (message: string) => {
      this.publish({
        from: agentName,
        channel: 'agent-log',
        type: 'agent_log',
        payload: { message, taskId: taskContext?.taskId, taskTitle: taskContext?.taskTitle },
      });
    };
  }

  /**
   * Emit agent lifecycle events.
   */
  agentStart(agent: string, step: number, totalSteps: number) {
    this.publish({
      from: agent,
      channel: 'agent-log',
      type: 'agent_start',
      payload: { agent, step, total_steps: totalSteps },
    });
  }

  agentComplete(agent: string, output: any) {
    this.publish({
      from: agent,
      channel: 'agent-log',
      type: 'agent_complete',
      payload: { agent, output },
    });
  }

  taskUpdate(taskId: string, title: string, status: 'pending' | 'running' | 'completed' | 'failed', index?: number, total?: number) {
    this.publish({
      from: 'orchestrator',
      channel: 'agent-log',
      type: 'task_update',
      payload: { taskId, title, status, index, total },
    });
  }

  stageComplete(stage: string, data: any, from: string = 'system') {
    this.publish({
      from,
      channel: 'agent-log',
      type: 'stage_complete',
      payload: { stage, data },
    });
  }

  pipelineComplete(data: any, from: string = 'system') {
    this.publish({
      from,
      channel: 'agent-log',
      type: 'pipeline_complete',
      payload: data,
    });
  }

  /**
   * Remove all listeners — call between pipeline runs.
   */
  reset() {
    this.emitter.removeAllListeners();
  }
}

// Singleton instance
export const messageBus = new MessageBus();
