/**
 * Webhook Service — fire-and-forget notifications to Feishu / DingTalk / Slack / Custom.
 *
 * Subscribes to messageBus 'agent-log' channel and dispatches webhook
 * notifications for pipeline_complete, deploy_complete, deploy_failed events.
 */

import { supabase, supabaseConfigured } from '@/lib/db/client';
import { messageBus } from '@/connectors/bus/message-bus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookProvider = 'feishu' | 'dingtalk' | 'slack' | 'custom';
export type WebhookEventType = 'pipeline_complete' | 'deploy_complete' | 'deploy_failed' | 'pr_created';

export interface WebhookConfig {
  id: string;
  provider: WebhookProvider;
  label: string;
  webhook_url: string;
  events: WebhookEventType[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Payload formatting per provider
// ---------------------------------------------------------------------------

interface EventPayload {
  event: WebhookEventType;
  title: string;
  detail: string;
  timestamp: string;
}

function formatFeishu(payload: EventPayload): object {
  return {
    msg_type: 'interactive',
    card: {
      header: {
        title: { tag: 'plain_text', content: `[RebuilD] ${payload.title}` },
        template: payload.event.includes('failed') ? 'red' : 'green',
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content: payload.detail },
        },
        {
          tag: 'note',
          elements: [{ tag: 'plain_text', content: payload.timestamp }],
        },
      ],
    },
  };
}

function formatDingtalk(payload: EventPayload): object {
  return {
    msgtype: 'markdown',
    markdown: {
      title: `[RebuilD] ${payload.title}`,
      text: `### ${payload.title}\n\n${payload.detail}\n\n---\n*${payload.timestamp}*`,
    },
  };
}

function formatSlack(payload: EventPayload): object {
  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `[RebuilD] ${payload.title}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: payload.detail },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: payload.timestamp }],
      },
    ],
  };
}

function formatPayload(provider: WebhookProvider, payload: EventPayload): object {
  switch (provider) {
    case 'feishu':
      return formatFeishu(payload);
    case 'dingtalk':
      return formatDingtalk(payload);
    case 'slack':
      return formatSlack(payload);
    case 'custom':
    default:
      return payload;
  }
}

// ---------------------------------------------------------------------------
// WebhookService
// ---------------------------------------------------------------------------

class WebhookService {
  private initialized = false;
  private configCache: WebhookConfig[] | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 60_000; // 1 minute

  /**
   * Initialize — subscribe to messageBus for relevant events.
   * Safe to call multiple times (idempotent).
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    messageBus.subscribe('agent-log', (msg) => {
      const payload = msg.payload as Record<string, any> | undefined;
      if (!payload) return;

      const eventType = payload.webhook_event as WebhookEventType | undefined;
      if (!eventType) return;

      const eventPayload: EventPayload = {
        event: eventType,
        title: payload.webhook_title || eventType,
        detail: payload.webhook_detail || payload.message || '',
        timestamp: new Date().toISOString(),
      };

      // Fire-and-forget
      this.dispatch(eventType, eventPayload).catch((err) =>
        console.error('[WebhookService] dispatch error:', err),
      );
    });
  }

  /**
   * Dispatch a webhook event to all matching active configs.
   */
  async dispatch(eventType: WebhookEventType, payload: EventPayload): Promise<void> {
    const configs = await this.getActiveConfigs();
    const matching = configs.filter((c) => c.events.includes(eventType));

    await Promise.allSettled(
      matching.map((config) => this.send(config, payload)),
    );
  }

  /**
   * Send a single webhook.
   */
  async send(config: WebhookConfig, payload: EventPayload): Promise<void> {
    const body = formatPayload(config.provider, payload);

    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(
        `[WebhookService] ${config.provider}/${config.label} returned ${response.status}`,
      );
    }
  }

  /**
   * Send a test message to a specific webhook config.
   */
  async sendTest(config: Pick<WebhookConfig, 'provider' | 'webhook_url'>): Promise<{ ok: boolean; status?: number; error?: string }> {
    const payload: EventPayload = {
      event: 'pipeline_complete',
      title: 'Test Notification',
      detail: 'This is a test message from RebuilD webhook configuration.',
      timestamp: new Date().toISOString(),
    };

    try {
      const body = formatPayload(config.provider, payload);
      const response = await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      return { ok: response.ok, status: response.status };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Get active webhook configs (cached for 1 minute).
   */
  private async getActiveConfigs(): Promise<WebhookConfig[]> {
    if (this.configCache && Date.now() < this.cacheExpiry) {
      return this.configCache;
    }

    if (!supabaseConfigured) return [];

    const { data } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('active', true);

    this.configCache = (data || []) as WebhookConfig[];
    this.cacheExpiry = Date.now() + this.CACHE_TTL;
    return this.configCache;
  }

  /**
   * Invalidate the config cache (called after CRUD operations).
   */
  invalidateCache(): void {
    this.configCache = null;
    this.cacheExpiry = 0;
  }
}

/** Singleton instance. */
export const webhookService = new WebhookService();
