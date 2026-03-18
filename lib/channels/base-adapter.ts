/**
 * Channel Adapter Framework — normalize inbound/outbound messages across platforms.
 *
 * Each channel (web, WeCom, Feishu, Telegram, etc.) implements BaseChannelAdapter.
 * The adapter translates platform-specific payloads into a unified ChannelMessage,
 * and converts outbound replies into platform-specific format.
 *
 * Design:
 *   - Adapters are registered in ChannelRegistry (singleton)
 *   - Inbound: webhook → adapter.parseInbound() → ChannelMessage → chat-engine
 *   - Outbound: chat-engine → adapter.formatOutbound() → platform API call
 *   - Each adapter is stateless — all state lives in conversations/missions
 */

// ---------------------------------------------------------------------------
// Unified message types
// ---------------------------------------------------------------------------

export interface ChannelMessage {
  /** Unique message ID from the source platform. */
  externalId: string;
  /** Channel identifier (e.g., 'web', 'wecom', 'feishu', 'telegram'). */
  channel: string;
  /** Sender identifier (user ID on the platform). */
  senderId: string;
  /** Display name of the sender. */
  senderName: string;
  /** Group/chat room ID if applicable. */
  groupId?: string;
  /** Message content (text). */
  text: string;
  /** Attached files / images. */
  attachments?: ChannelAttachment[];
  /** Original raw payload for debugging. */
  raw?: unknown;
  /** Timestamp (ms). */
  timestamp: number;
  /** Whether this is a mention / @bot message. */
  isMention?: boolean;
}

export interface ChannelAttachment {
  type: 'image' | 'file' | 'audio' | 'video';
  url: string;
  filename?: string;
  mimeType?: string;
}

export interface OutboundMessage {
  /** Text content to send back. */
  text: string;
  /** Markdown formatted content (if platform supports). */
  markdown?: string;
  /** Reply to a specific message (platform message ID). */
  replyTo?: string;
  /** Attachments to send. */
  attachments?: ChannelAttachment[];
}

export interface OutboundResult {
  success: boolean;
  platformMessageId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Base adapter interface
// ---------------------------------------------------------------------------

export abstract class BaseChannelAdapter {
  /** Channel identifier (e.g., 'web', 'wecom'). */
  abstract readonly channel: string;
  /** Human-readable name. */
  abstract readonly displayName: string;

  /**
   * Parse an inbound webhook payload into a unified ChannelMessage.
   * Returns null if the payload is not a valid message (e.g., verification challenge).
   */
  abstract parseInbound(payload: unknown): ChannelMessage | null;

  /**
   * Format and send an outbound message via the platform's API.
   */
  abstract sendOutbound(target: { groupId?: string; userId?: string }, message: OutboundMessage): Promise<OutboundResult>;

  /**
   * Verify webhook signature (platform-specific). Returns true if valid.
   * Default: always true (for platforms that don't sign webhooks).
   */
  verifySignature(_headers: Record<string, string>, _body: string): boolean {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Channel Registry (singleton)
// ---------------------------------------------------------------------------

class ChannelRegistry {
  private adapters = new Map<string, BaseChannelAdapter>();

  register(adapter: BaseChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  get(channel: string): BaseChannelAdapter | undefined {
    return this.adapters.get(channel);
  }

  list(): BaseChannelAdapter[] {
    return [...this.adapters.values()];
  }

  has(channel: string): boolean {
    return this.adapters.has(channel);
  }
}

export const channelRegistry = new ChannelRegistry();

// ---------------------------------------------------------------------------
// Web adapter (built-in — the default browser-based chat)
// ---------------------------------------------------------------------------

export class WebChannelAdapter extends BaseChannelAdapter {
  readonly channel = 'web';
  readonly displayName = 'Web Chat';

  parseInbound(payload: unknown): ChannelMessage | null {
    // Web messages come directly from the frontend — already structured
    const p = payload as any;
    if (!p?.text) return null;
    return {
      externalId: p.id || crypto.randomUUID(),
      channel: 'web',
      senderId: p.userId || 'anonymous',
      senderName: p.userName || 'User',
      text: p.text,
      attachments: p.attachments,
      timestamp: p.timestamp || Date.now(),
    };
  }

  async sendOutbound(
    _target: { groupId?: string; userId?: string },
    message: OutboundMessage,
  ): Promise<OutboundResult> {
    // Web channel sends via SSE — this is a no-op since the chat-engine
    // already streams to the client. Included for interface completeness.
    return { success: true, platformMessageId: `web-${Date.now()}` };
  }
}

// Register built-in web adapter
channelRegistry.register(new WebChannelAdapter());
