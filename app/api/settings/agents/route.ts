import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { BaseAgent } from '@/lib/core/base-agent';
import { getAgentRegistry, loadAgentConfig, saveAgentConfig, saveOneAgentConfig } from '@/lib/config/agent-config';
import { registerAgent, getAgent } from '@/lib/config/agent-registry';
import { appendToDynamicRegistry, readDynamicRegistry, ensureDynamicAgentsLoaded } from '@/lib/config/dynamic-agents';
import { registerAgentFactory } from '@/lib/tools/spawn-agent';
import { loadSoul, mergeSoulWithPrompt } from '@/agents/utils';
import type { AgentOverride } from '@/lib/config/agent-config';
import type { DynamicAgentEntry } from '@/lib/config/dynamic-agents';

interface CreateAgentPayload {
  displayName?: string;
  role?: string;
  model?: string;
  maxLoops?: number;
  systemPrompt?: string;
  soul?: string;
}

function toAgentId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function buildUniqueId(base: string): string {
  const initial = base || `agent-${Date.now().toString(36)}`;
  if (!getAgent(initial)) return initial;
  for (let i = 2; i <= 999; i += 1) {
    const candidate = `${initial}-${i}`;
    if (!getAgent(candidate)) return candidate;
  }
  return `${initial}-${Date.now().toString(36)}`;
}

function ensureSoulFile(agentId: string, soul: string): void {
  const agentDir = path.join(process.cwd(), 'agents', agentId);
  if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'soul.md'), soul, 'utf-8');
}

export async function GET() {
  try {
    ensureDynamicAgentsLoaded();
    const registry = getAgentRegistry();
    return NextResponse.json({ success: true, data: registry });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body: Record<string, AgentOverride> = await req.json();
    saveAgentConfig(body);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { agentId, override } = await req.json() as { agentId: string; override: AgentOverride };
    if (!agentId) {
      return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 });
    }
    saveOneAgentConfig(agentId, override || {});
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateAgentPayload;
    const displayName = String(body.displayName || '').trim();
    if (!displayName) {
      return NextResponse.json({ success: false, error: 'displayName is required' }, { status: 400 });
    }

    const role = String(body.role || '自定义智能体').trim();
    const model = String(body.model || '').trim();
    const maxLoopsRaw = Number(body.maxLoops);
    const maxLoops = Number.isFinite(maxLoopsRaw)
      ? Math.min(50, Math.max(1, Math.floor(maxLoopsRaw)))
      : 10;
    const systemPrompt = String(body.systemPrompt || '').trim() || `你是 ${displayName}，你的职责是：${role}。请给出准确、可执行、简洁的输出。`;
    const soul =
      String(body.soul || '').trim() ||
      `# ${displayName}\n\n## 角色\n${role}\n\n## 行为准则\n- 保持结果可执行\n- 先校验再输出\n- 发现不确定信息时明确标注`;

    const dynamicIds = new Set(readDynamicRegistry().map((entry) => entry.id));
    const seed = toAgentId(displayName);
    const uniqueSeed = dynamicIds.has(seed) ? `${seed}-${Date.now().toString(36)}` : seed;
    const agentId = buildUniqueId(uniqueSeed);

    const entry: DynamicAgentEntry = {
      id: agentId,
      displayName,
      role,
      runMode: 'react',
      defaultMaxLoops: maxLoops,
      defaultPrompt: systemPrompt,
      tools: [],
      skills: [],
      createdBy: 'settings',
      isAIGenerated: true,
    };

    appendToDynamicRegistry(entry);
    ensureSoulFile(agentId, soul);

    registerAgent({
      id: agentId,
      displayName,
      role,
      runMode: 'react',
      defaultModel: model || undefined,
      defaultMaxLoops: maxLoops,
      defaultPrompt: systemPrompt,
      tools: [],
      skills: [],
      createdBy: 'settings',
      isAIGenerated: true,
    });

    registerAgentFactory(agentId, () => {
      const override = loadAgentConfig(agentId);
      const effectiveSoul = override.soul ?? loadSoul(agentId);
      const effectivePrompt = override.systemPrompt ?? systemPrompt;
      const mergedPrompt = mergeSoulWithPrompt(effectiveSoul, effectivePrompt);
      return new BaseAgent({
        name: agentId,
        systemPrompt: mergedPrompt,
        tools: [],
        maxLoops: override.maxLoops ?? maxLoops,
        model: override.model ?? (model || undefined),
      });
    });

    if (model) {
      saveOneAgentConfig(agentId, { model });
    }

    const created = getAgentRegistry().find((agent) => agent.id === agentId) || null;
    return NextResponse.json({ success: true, data: created });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}
