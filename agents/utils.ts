import fs from 'fs';
import path from 'path';

const FEEDBACK_PROTOCOL_MARKER = '## Runtime Feedback Protocol';

const RUNTIME_FEEDBACK_PROTOCOL = `${FEEDBACK_PROTOCOL_MARKER}
你在执行多步任务（尤其是 ReAct + 工具调用）时，必须保持过程可见：

1. 进入新步骤前，用一句话说明当前目标和下一步动作。
2. 每次调用工具前，简述调用意图（为什么调用这个工具）。
3. 每次工具返回后，简述结果（成功/失败）和下一步决策。
4. 遇到错误时，明确错误原因与修复动作；禁止无分析的盲目重复重试。
5. 最终收尾必须清晰列出：已完成项、未完成项/风险、建议下一步。

约束：
- 中间反馈要简洁、具体、可执行，避免空泛描述。
- 严禁捏造工具结果，只能基于真实返回值。
- 若任务定义了严格输出格式（如 JSON schema、工具参数结构），必须优先遵守该格式，不能额外添加破坏结构的字段。`;

function ensureFeedbackProtocol(prompt: string): string {
  if (prompt.includes(FEEDBACK_PROTOCOL_MARKER)) return prompt;
  return prompt ? `${prompt}\n\n---\n\n${RUNTIME_FEEDBACK_PROTOCOL}` : RUNTIME_FEEDBACK_PROTOCOL;
}

// ---------------------------------------------------------------------------
// Soul cache — 30 second TTL per agent
// ---------------------------------------------------------------------------
const _soulCache = new Map<string, { content: string; loadedAt: number }>();
const SOUL_TTL_MS = 30_000;

/**
 * Load the soul.md file from an agent's workspace directory.
 * Uses process.cwd() as the base since __dirname is unreliable in bundled environments.
 * Results are cached with a 30-second TTL to avoid repeated disk reads.
 *
 * @param agentName — e.g. 'pm', 'tech-lead', 'critic'
 */
export function loadSoul(agentName: string): string {
  const cached = _soulCache.get(agentName);
  if (cached && Date.now() - cached.loadedAt < SOUL_TTL_MS) {
    return cached.content;
  }

  const soulPath = path.join(process.cwd(), 'agents', agentName, 'soul.md');
  let content = '';
  try {
    content = fs.readFileSync(soulPath, 'utf-8');
  } catch {
    // soul.md is optional — silently return empty string
  }
  _soulCache.set(agentName, { content, loadedAt: Date.now() });
  return content;
}

/**
 * Merge soul.md content with a system prompt.
 * Soul content is prepended as personality/philosophy context.
 */
export function mergeSoulWithPrompt(soul: string, systemPrompt: string): string {
  const withSoul = soul ? `${soul}\n\n---\n\n${systemPrompt}` : systemPrompt;
  return ensureFeedbackProtocol(withSoul);
}
