/**
 * Dispatcher — lightweight rules engine for Chat → Mission escalation.
 *
 * NOT an agent. Pure functions that decide:
 *   1. shouldEscalate(): should this chat become a Mission?
 *   2. selectLead(): who should be the 包工头?
 *   3. createMissionDraft(): build a MissionDraft from chat context
 *
 * Three escalation triggers:
 *   - Context threshold: token usage approaching limit
 *   - Complexity signals: task analysis suggests multi-agent work
 *   - External channel: task arrives from third-party platform (WeCom, Feishu, etc.)
 */

import type { MateDefinition } from '../core/types';
import { getMateRegistry } from './mate-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscalationContext {
  /** Current token usage ratio (0-1). */
  tokenRatio?: number;
  /** User message content. */
  userMessage: string;
  /** Complexity assessment from the main agent (if available). */
  complexityLevel?: 'L1' | 'L2' | 'L3';
  /** Source channel. */
  channel?: 'web' | 'wecom' | 'feishu' | 'telegram' | 'api';
  /** Number of messages in conversation so far. */
  messageCount?: number;
  /** Explicit user request for team/mission. */
  userRequestedTeam?: boolean;
}

export interface EscalationResult {
  shouldEscalate: boolean;
  trigger: 'context_threshold' | 'complexity' | 'external_channel' | 'user_request' | 'none';
  reason: string;
}

export interface MissionDraft {
  sourceChatId: string;
  sourceChannel: string;
  title: string;
  description: string;
  suggestedLead?: string;
  complexitySignals: string[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Context usage ratio that triggers escalation suggestion. */
const CONTEXT_THRESHOLD = 0.70;

/** Minimum messages before context-based escalation kicks in. */
const MIN_MESSAGES_FOR_CONTEXT_TRIGGER = 5;

/** Keywords that suggest multi-agent complexity. */
const COMPLEXITY_KEYWORDS = [
  // Team/project signals (Chinese)
  '团队', '项目', '多人', '协作', '分工', '并行',
  // Team/project signals (English)
  'team', 'project', 'collaborate', 'parallel', 'multi-agent',
  // Scope signals
  '全栈', 'full-stack', 'fullstack', '前后端', 'frontend.*backend',
  '微服务', 'microservice', '系统设计', 'system design',
  // Complexity signals
  '重构', 'refactor', '迁移', 'migrate', 'migration',
  '架构', 'architecture', '部署', 'deploy',
];

// ---------------------------------------------------------------------------
// shouldEscalate
// ---------------------------------------------------------------------------

/**
 * Determine if a chat should be escalated to a Mission.
 */
export function shouldEscalate(ctx: EscalationContext): EscalationResult {
  // Trigger 1: User explicitly requested team/mission
  if (ctx.userRequestedTeam) {
    return {
      shouldEscalate: true,
      trigger: 'user_request',
      reason: '用户主动要求升级为团队模式',
    };
  }

  // Trigger 2: External channel task (WeCom/Feishu/Telegram)
  if (ctx.channel && ctx.channel !== 'web' && ctx.channel !== 'api') {
    return {
      shouldEscalate: true,
      trigger: 'external_channel',
      reason: `来自 ${ctx.channel} 的外部任务，自动升级为 Mission`,
    };
  }

  // Trigger 3: Context threshold
  if (
    ctx.tokenRatio !== undefined &&
    ctx.tokenRatio >= CONTEXT_THRESHOLD &&
    (ctx.messageCount ?? 0) >= MIN_MESSAGES_FOR_CONTEXT_TRIGGER
  ) {
    return {
      shouldEscalate: true,
      trigger: 'context_threshold',
      reason: `Context 使用率 ${(ctx.tokenRatio * 100).toFixed(0)}% 已达临界值`,
    };
  }

  // Trigger 4: Complexity detection
  if (ctx.complexityLevel === 'L3') {
    return {
      shouldEscalate: true,
      trigger: 'complexity',
      reason: '任务复杂度评估为 L3，需要多 mate 协作',
    };
  }

  // Keyword-based complexity heuristic
  const msgLower = ctx.userMessage.toLowerCase();
  const hits = COMPLEXITY_KEYWORDS.filter(kw => {
    if (kw.includes('.*')) {
      return new RegExp(kw, 'i').test(msgLower);
    }
    return msgLower.includes(kw.toLowerCase());
  });

  if (hits.length >= 2) {
    return {
      shouldEscalate: true,
      trigger: 'complexity',
      reason: `检测到复杂度信号: ${hits.join(', ')}`,
    };
  }

  return {
    shouldEscalate: false,
    trigger: 'none',
    reason: '',
  };
}

// ---------------------------------------------------------------------------
// selectLead
// ---------------------------------------------------------------------------

/**
 * Select a lead mate (包工头) for a mission.
 * Uses MateRegistry.matchForLead() with can_lead=true preference.
 *
 * @param missionDescription - What the mission is about
 * @param explicitName - User-specified lead (@ mention)
 * @param searchDirs - Workspace search directories for MateRegistry
 */
export function selectLead(
  missionDescription: string,
  explicitName?: string,
  searchDirs: string[] = ['.'],
): MateDefinition | null {
  const registry = getMateRegistry(searchDirs);
  return registry.matchForLead(missionDescription, explicitName);
}

// ---------------------------------------------------------------------------
// createMissionDraft
// ---------------------------------------------------------------------------

/**
 * Build a MissionDraft from chat context.
 */
export function createMissionDraft(params: {
  chatId: string;
  channel: string;
  userMessage: string;
  escalation: EscalationResult;
  conversationTitle?: string;
  /** Optional: state summary from context compaction. */
  stateSummary?: string;
}): MissionDraft {
  const { chatId, channel, userMessage, escalation, conversationTitle, stateSummary } = params;

  // Build description from available context
  let description = userMessage;
  if (stateSummary) {
    description = `${stateSummary}\n\n---\n\n最新用户需求：${userMessage}`;
  }

  return {
    sourceChatId: chatId,
    sourceChannel: channel,
    title: conversationTitle || userMessage.slice(0, 60),
    description,
    complexitySignals: [escalation.trigger, escalation.reason].filter(Boolean),
  };
}
