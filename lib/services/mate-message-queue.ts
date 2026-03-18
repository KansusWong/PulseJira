/**
 * MateMessageQueue — in-memory message queue for inter-mate and user-to-mate communication.
 *
 * Three message types:
 *   - feedback:  user → mate (existing, user intervention during execution)
 *   - handoff:   mate → mate (new, task completion handoff with artifacts)
 *   - broadcast:  lead → all mates (new, plan changes / urgent notices)
 *
 * During mission execution each mate agent checks this queue between ReAct steps
 * via `onUserMessageCheck`. Messages are injected into the agent's conversation
 * context with appropriate prefixes based on type and sender.
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface MateMessage {
  /** 'user' for user feedback, or mate name for inter-mate messages. */
  from: string;
  content: string;
  type: 'feedback' | 'handoff' | 'broadcast';
  /** Associated artifact IDs (for handoff messages). */
  artifacts?: string[];
  /** Completed task ID that triggered this handoff. */
  taskId?: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Queue service
// ---------------------------------------------------------------------------

class MateMessageQueueService {
  /** Key format: `${missionId}::${agentName}` */
  private queues = new Map<string, MateMessage[]>();

  private key(missionId: string, agentName: string): string {
    return `${missionId}::${agentName}`;
  }

  // -------------------------------------------------------------------------
  // Enqueue methods
  // -------------------------------------------------------------------------

  /** Push a user feedback message for a specific mate. */
  enqueueFromUser(missionId: string, mateName: string, content: string): void {
    this._enqueue(missionId, mateName, {
      from: 'user',
      content,
      type: 'feedback',
      timestamp: Date.now(),
    });
  }

  /** Push a handoff message from one mate to another (task completion). */
  enqueueHandoff(
    missionId: string,
    targetMate: string,
    fromMate: string,
    payload: { content: string; artifacts?: string[]; taskId: string },
  ): void {
    this._enqueue(missionId, targetMate, {
      from: fromMate,
      content: payload.content,
      type: 'handoff',
      artifacts: payload.artifacts,
      taskId: payload.taskId,
      timestamp: Date.now(),
    });
  }

  /** Broadcast a message from lead to all active mates in a mission. */
  broadcast(missionId: string, fromMate: string, content: string): void {
    const prefix = `${missionId}::`;
    for (const key of this.queues.keys()) {
      if (key.startsWith(prefix)) {
        const mateName = key.slice(prefix.length);
        if (mateName !== fromMate) {
          this._enqueue(missionId, mateName, {
            from: fromMate,
            content,
            type: 'broadcast',
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Backward-compatible API
  // -------------------------------------------------------------------------

  /** @deprecated Use enqueueFromUser() instead. Kept for backward compatibility. */
  enqueue(missionId: string, agentName: string, message: string): void {
    this.enqueueFromUser(missionId, agentName, message);
  }

  // -------------------------------------------------------------------------
  // Dequeue
  // -------------------------------------------------------------------------

  /** Non-blocking: return the oldest queued message, or null if none. */
  dequeue(missionId: string, agentName: string): MateMessage | null {
    const k = this.key(missionId, agentName);
    const queue = this.queues.get(k);
    if (!queue || queue.length === 0) return null;
    return queue.shift()!;
  }

  /**
   * Dequeue and format as a string for injection into agent context.
   * Returns null if no messages. This is what onUserMessageCheck should call.
   */
  dequeueFormatted(missionId: string, agentName: string): string | null {
    const msg = this.dequeue(missionId, agentName);
    if (!msg) return null;
    return formatMateMessage(msg);
  }

  // -------------------------------------------------------------------------
  // Queue management
  // -------------------------------------------------------------------------

  /** Ensure a queue exists for a mate (call when mate joins mission). */
  ensureQueue(missionId: string, agentName: string): void {
    const k = this.key(missionId, agentName);
    if (!this.queues.has(k)) {
      this.queues.set(k, []);
    }
  }

  /** Get pending message count for a mate. */
  pendingCount(missionId: string, agentName: string): number {
    const k = this.key(missionId, agentName);
    return this.queues.get(k)?.length ?? 0;
  }

  /** Clean up all queues for a mission (call when mission finishes). */
  clear(missionId: string): void {
    const prefix = `${missionId}::`;
    for (const k of this.queues.keys()) {
      if (k.startsWith(prefix)) {
        this.queues.delete(k);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private _enqueue(missionId: string, mateName: string, message: MateMessage): void {
    const k = this.key(missionId, mateName);
    const queue = this.queues.get(k) ?? [];
    queue.push(message);
    this.queues.set(k, queue);
  }
}

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

/**
 * Format a MateMessage as a human-readable string for injection into agent context.
 */
export function formatMateMessage(msg: MateMessage): string {
  switch (msg.type) {
    case 'feedback':
      return `[用户反馈]: ${msg.content}`;
    case 'handoff':
      return `[来自 ${msg.from} 的交接]: ${msg.content}`;
    case 'broadcast':
      return `[团队广播 from ${msg.from}]: ${msg.content}`;
    default:
      return `[${msg.from}]: ${msg.content}`;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const mateMessageQueue = new MateMessageQueueService();
