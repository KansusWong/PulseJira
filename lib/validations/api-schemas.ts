import { z } from 'zod';

// signals
export const signalActionSchema = z.object({
  signalId: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'restore']),
  refinedContent: z.string().max(10000).optional(),
});

// conversations
export const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
});

// teams
export const createTeamSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  team_name: z.string().min(1).max(100),
  lead_agent: z.string().min(1).max(100),
  config: z.record(z.unknown()).optional(),
});

// team tasks
export const createTeamTaskSchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  owner: z.string().max(100).optional(),
});

export const updateTeamTaskSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['pending', 'in_progress', 'completed', 'deleted']),
  result: z.unknown().optional(),
});

// team mailbox
export const markReadSchema = z.object({
  toAgent: z.string().min(1).max(100),
});

// system config
export const systemConfigPatchSchema = z.record(
  z.string().regex(/^[a-z_]+$/),
  z.union([z.string(), z.number(), z.boolean()])
);

// signal sources
export const createSignalSourceSchema = z.object({
  platform: z.string().min(1).max(50),
  identifier: z.string().min(1).max(500),
  label: z.string().min(1).max(200),
  keywords: z.array(z.string().max(100)).default([]),
  interval_minutes: z.number().int().min(1).max(1440).default(60),
  active: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
});

// webhooks
export const createWebhookSchema = z.object({
  provider: z.enum(['feishu', 'dingtalk', 'slack', 'wecom', 'custom']),
  label: z.string().max(200).default(''),
  webhook_url: z.string().url(),
  events: z.array(z.string()).default(['pipeline_complete', 'deploy_complete', 'deploy_failed']),
  message_template: z.string().max(2000).nullable().default(null),
  display_name: z.string().max(100).nullable().default(null),
});
