import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getAgentRegistry, loadAgentConfig, saveAgentConfig, saveOneAgentConfig } from '@/lib/config/agent-config';
import { registerAgent, deregisterAgent } from '@/lib/config/agent-registry';
import { parseFrontmatter } from '@/lib/tools/subagent-registry';
import type { AgentOverride, AgentRegistryEntry } from '@/lib/config/agent-config';

const SUBAGENTS_DIR = path.join(process.cwd(), 'agents', 'subagents');
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

interface CreateAgentPayload {
  displayName?: string;
  role?: string;
  model?: string;
  maxLoops?: number;
  systemPrompt?: string;
}

function sanitizeId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `agent-${Date.now().toString(36)}`;
}

/**
 * Scan a single directory for {name}/agent.md subagent definitions.
 */
function scanSubagentsInDir(dir: string, seenIds: Set<string>): AgentRegistryEntry[] {
  const results: AgentRegistryEntry[] = [];

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return results; // Directory doesn't exist
  }

  for (const entry of entries) {
    if (seenIds.has(entry)) continue;

    const entryPath = path.join(dir, entry);
    try {
      if (!fs.statSync(entryPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const agentMdPath = path.join(entryPath, 'agent.md');
    let content: string;
    try {
      content = fs.readFileSync(agentMdPath, 'utf-8');
    } catch {
      continue; // No agent.md
    }

    const { meta, body } = parseFrontmatter(content);
    const tools = (meta.tools || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((name) => ({ name, description: '' }));

    const maxLoops = meta.maxLoops ? parseInt(meta.maxLoops, 10) : 10;

    seenIds.add(entry);
    results.push({
      id: entry,
      displayName: meta.name || entry,
      role: meta.description || '',
      runMode: 'react',
      defaults: {
        model: meta.model || '',
        maxLoops: Number.isFinite(maxLoops) ? maxLoops : 10,
        soul: '',
        systemPrompt: body,
      },
      override: loadAgentConfig(entry),
      tools,
      skills: [],
      isAIGenerated: true,
      createdBy: 'subagent',
    });
  }

  return results;
}

/**
 * Scan all subagent directories:
 * 1. agents/subagents/ (central)
 * 2. projects/{name}/subagents/ (project-local, created by agents at runtime)
 */
function scanSubagents(): AgentRegistryEntry[] {
  const seenIds = new Set<string>();

  // Central subagents (higher priority)
  const results = scanSubagentsInDir(SUBAGENTS_DIR, seenIds);

  // Project-local subagents
  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(PROJECTS_DIR);
  } catch {
    return results;
  }

  for (const proj of projectDirs) {
    const projSubagentsDir = path.join(PROJECTS_DIR, proj, 'subagents');
    results.push(...scanSubagentsInDir(projSubagentsDir, seenIds));
  }

  return results;
}

export async function GET() {
  try {
    const builtinAgents = getAgentRegistry();
    const subagents = scanSubagents();

    // Merge: builtin first, then subagents (skip duplicates)
    const builtinIds = new Set(builtinAgents.map((a) => a.id));
    const merged = [...builtinAgents, ...subagents.filter((s) => !builtinIds.has(s.id))];

    return NextResponse.json({ success: true, data: merged });
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
    const { agentId, override } = (await req.json()) as { agentId: string; override: AgentOverride };
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
    const systemPrompt =
      String(body.systemPrompt || '').trim() ||
      `你是 ${displayName}，你的职责是：${role}。请给出准确、可执行、简洁的输出。`;

    // Generate unique directory name
    let agentId = sanitizeId(displayName);
    const agentDir = path.join(SUBAGENTS_DIR, agentId);
    if (fs.existsSync(agentDir)) {
      agentId = `${agentId}-${Date.now().toString(36)}`;
    }
    const finalDir = path.join(SUBAGENTS_DIR, agentId);

    // Build agent.md content
    const frontmatterLines = [
      '---',
      `name: ${displayName}`,
      `description: ${role}`,
    ];
    if (model) frontmatterLines.push(`model: ${model}`);
    frontmatterLines.push(`tools: `);
    frontmatterLines.push('---');

    const agentMdContent = frontmatterLines.join('\n') + '\n\n' + systemPrompt;

    // Write files
    fs.mkdirSync(finalDir, { recursive: true });
    fs.writeFileSync(path.join(finalDir, 'agent.md'), agentMdContent, 'utf-8');
    fs.writeFileSync(
      path.join(finalDir, 'meta.json'),
      JSON.stringify({ createdAt: new Date().toISOString(), createdBy: 'settings' }, null, 2),
      'utf-8',
    );

    // Register in memory so it's immediately visible
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
      createdBy: 'subagent',
      isAIGenerated: true,
    });

    if (model) {
      saveOneAgentConfig(agentId, { model });
    }

    const created: AgentRegistryEntry = {
      id: agentId,
      displayName,
      role,
      runMode: 'react',
      defaults: {
        model: model || '',
        maxLoops,
        soul: '',
        systemPrompt,
      },
      override: loadAgentConfig(agentId),
      tools: [],
      skills: [],
      isAIGenerated: true,
      createdBy: 'subagent',
    };

    return NextResponse.json({ success: true, data: created });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { agentId } = (await req.json()) as { agentId: string };
    if (!agentId) {
      return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 });
    }

    // Guard: only allow deleting subagents (not builtin)
    const agentDir = path.join(SUBAGENTS_DIR, agentId);
    if (!fs.existsSync(agentDir)) {
      return NextResponse.json(
        { success: false, error: `Subagent "${agentId}" not found. Only subagents can be deleted.` },
        { status: 404 },
      );
    }

    // Remove directory recursively
    fs.rmSync(agentDir, { recursive: true, force: true });

    // Remove from in-memory registry
    deregisterAgent(agentId);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 });
  }
}
