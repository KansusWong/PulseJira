/**
 * Non-blocking, in-memory message queue for per-mate chat.
 *
 * During team execution each mate agent checks this queue between ReAct steps
 * via `onUserMessageCheck`. If a user sent feedback, the agent picks it up and
 * injects it into its own conversation context — no blocking, no waiting.
 */

class MateMessageQueueService {
  /** Key format: `${teamId}::${agentName}` */
  private queues = new Map<string, string[]>();

  private key(teamId: string, agentName: string): string {
    return `${teamId}::${agentName}`;
  }

  /** Push a user message for a specific mate agent. */
  enqueue(teamId: string, agentName: string, message: string): void {
    const k = this.key(teamId, agentName);
    const queue = this.queues.get(k) ?? [];
    queue.push(message);
    this.queues.set(k, queue);
  }

  /** Non-blocking: return the oldest queued message, or null if none. */
  dequeue(teamId: string, agentName: string): string | null {
    const k = this.key(teamId, agentName);
    const queue = this.queues.get(k);
    if (!queue || queue.length === 0) return null;
    return queue.shift()!;
  }

  /** Clean up all queues for a team (call when team execution finishes). */
  clear(teamId: string): void {
    const prefix = `${teamId}::`;
    for (const k of this.queues.keys()) {
      if (k.startsWith(prefix)) {
        this.queues.delete(k);
      }
    }
  }
}

export const mateMessageQueue = new MateMessageQueueService();
