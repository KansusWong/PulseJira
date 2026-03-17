/**
 * VaultTool — asset governance system for tracking and reusing Epic artifacts.
 *
 * Supports 10 operations:
 *   init, summary, search, graph, list, status,
 *   supersede, visualize, export, import
 *
 * Persists to {workspace}/vault/ directory as JSON files.
 * Supabase backup: fire-and-forget when configured.
 * Search: keyword_match * 0.4 + semantic_similarity * 0.3 + reuse_popularity * 0.3
 *         (falls back to keyword 0.7 + reuse 0.3 when embeddings unavailable)
 */

import { z } from 'zod';
import path from 'path';
import { BaseTool } from '../core/base-tool';
import type { ToolContext } from '../core/tool-context';
import { selectDesc } from './tool-desc-version';
import { vaultStore } from '../services/vault-store';
import type { VaultArtifactEntry } from '../services/vault-store';

// eslint-disable-next-line no-eval
const fs: any = eval('require')('fs');
// eslint-disable-next-line no-eval
const crypto: any = eval('require')('crypto');

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

type ArtifactEntry = VaultArtifactEntry;

interface VaultManifest {
  vault_id: string;
  industry_tags: string[];
  knowledge_base: ArtifactEntry[];
  updated_at: string;
}

interface GraphNode {
  id: string;
  type: 'skill' | 'tool' | 'doc' | 'pptx' | 'code' | 'epic' | 'task';
  label: string;
  metadata?: Record<string, any>;
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'produced' | 'depends_on' | 'reuses' | 'part_of' | 'supersedes';
  metadata?: Record<string, any>;
}

interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface EpicSummary {
  epic_id: string;
  title: string;
  completed_at: string;
  tasks: TaskSummary[];
  knowledge_delta: KnowledgeDelta;
}

interface TaskSummary {
  task_id: string;
  title: string;
  assigned_agent: string;
  status: string;
  artifacts: string[];
}

interface KnowledgeDelta {
  new_artifacts: ArtifactEntry[];
  reused_artifacts: string[];
  new_edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// V1 / V2 descriptions
// ---------------------------------------------------------------------------

const VAULT_DESC_V1 = `Asset governance system for tracking and reusing Epic artifacts.
Ten commands:
  - init: Initialize vault directory with manifest and graph files
  - summary: Write Epic completion summary (updates manifest + graph + embeddings, Supabase backup)
  - search: Search knowledge base (keyword + semantic + popularity scoring)
  - graph: Query relationship graph (neighbors or by_type)
  - list: List knowledge base entries (filterable by type/tags)
  - status: Vault statistics overview (artifact counts, top reused)
  - supersede: Create new version of an artifact (adds supersedes edge)
  - visualize: Generate Mermaid diagram of the knowledge graph
  - export: Export vault data as portable JSON bundle
  - import: Import vault data from another workspace (merge, dedup)
Artifacts are tracked across Epics for cross-project reuse.`;

const VAULT_DESC_V2 = 'Track/search/graph Epic artifacts. 10 commands: init/summary/search/graph/list/status/supersede/visualize/export/import.';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const schema = z.object({
  command: z.enum([
    'init', 'summary', 'search', 'graph', 'list', 'status',
    'supersede', 'visualize', 'export', 'import',
  ]).describe('Operation to perform'),
  // init
  industry_tags: z.array(z.string()).optional().describe('Industry tags for vault initialization'),
  // summary
  epic_id: z.string().optional().describe('Epic ID (for summary)'),
  title: z.string().optional().describe('Epic title (for summary)'),
  tasks: z.array(z.object({
    task_id: z.string(),
    title: z.string(),
    assigned_agent: z.string(),
    status: z.string(),
    artifacts: z.array(z.string()).optional(),
  })).optional().describe('Task list (for summary)'),
  knowledge_delta: z.object({
    new_artifacts: z.array(z.object({
      artifact_id: z.string().optional(),
      type: z.enum(['skill', 'tool', 'doc', 'pptx', 'code']),
      path: z.string(),
      name: z.string(),
      description: z.string(),
      created_by_epic: z.string().optional(),
      created_by_agent: z.string().optional(),
      created_at: z.string().optional(),
      reuse_count: z.number().optional(),
      tags: z.array(z.string()).optional(),
      depends_on: z.array(z.string()).optional(),
      version: z.number().optional(),
    })).optional(),
    reused_artifacts: z.array(z.string()).optional(),
    new_edges: z.array(z.object({
      source: z.string(),
      target: z.string(),
      type: z.enum(['produced', 'depends_on', 'reuses', 'part_of', 'supersedes']),
      metadata: z.record(z.any()).optional(),
    })).optional(),
  }).optional().describe('Knowledge delta (for summary)'),
  // search
  query: z.string().optional().describe('Search query (for search)'),
  type_filter: z.enum(['skill', 'tool', 'doc', 'pptx', 'code']).optional().describe('Filter by artifact type'),
  tags: z.array(z.string()).optional().describe('Filter by tags'),
  // graph
  query_type: z.enum(['neighbors', 'by_type']).optional().describe('Graph query type'),
  node_id: z.string().optional().describe('Node ID (for graph neighbors)'),
  node_type: z.string().optional().describe('Node type filter (for graph by_type)'),
  // list / search
  limit: z.number().optional().default(20).describe('Max results (default: 20)'),
  // supersede
  artifact_id: z.string().optional().describe('Artifact ID to supersede'),
  new_artifact_name: z.string().optional().describe('New name (for supersede, defaults to original)'),
  new_artifact_description: z.string().optional().describe('New description (for supersede, defaults to original)'),
  new_artifact_path: z.string().optional().describe('New path (for supersede, defaults to original)'),
  new_artifact_tags: z.array(z.string()).optional().describe('New tags (for supersede, defaults to original)'),
  // visualize
  focus_node: z.string().optional().describe('Center node ID for focused visualization'),
  depth: z.number().optional().default(2).describe('Graph traversal depth for visualization (default: 2)'),
  // import
  source_workspace: z.string().optional().describe('Source workspace path (for import)'),
});

type Input = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function getVaultDir(wsRoot: string): string {
  return path.join(wsRoot, 'vault');
}

function getManifestPath(wsRoot: string): string {
  return path.join(getVaultDir(wsRoot), 'manifest.json');
}

function getGraphPath(wsRoot: string): string {
  return path.join(getVaultDir(wsRoot), 'graph.json');
}

function getSummariesDir(wsRoot: string): string {
  return path.join(getVaultDir(wsRoot), 'summaries');
}

function getSummaryPath(wsRoot: string, epicId: string): string {
  return path.join(getSummariesDir(wsRoot), `${epicId}.json`);
}

function getEmbeddingsPath(wsRoot: string): string {
  return path.join(getVaultDir(wsRoot), 'embeddings.json');
}

function getExportPath(wsRoot: string): string {
  return path.join(getVaultDir(wsRoot), 'export.json');
}

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function saveJson(filePath: string, data: any): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function isVaultInitialized(wsRoot: string): boolean {
  return fs.existsSync(getManifestPath(wsRoot));
}

function loadEmbeddings(wsRoot: string): Record<string, number[]> {
  return loadJson(getEmbeddingsPath(wsRoot), {});
}

function saveEmbeddings(wsRoot: string, embeddings: Record<string, number[]>): void {
  saveJson(getEmbeddingsPath(wsRoot), embeddings);
}

function emptyManifest(): VaultManifest {
  return { vault_id: '', industry_tags: [], knowledge_base: [], updated_at: '' };
}

function emptyGraph(): VaultGraph {
  return { nodes: [], edges: [] };
}

// ---------------------------------------------------------------------------
// Search scoring
// ---------------------------------------------------------------------------

function keywordScore(entry: ArtifactEntry, queryWords: string[]): number {
  const text = `${entry.name} ${entry.description} ${entry.tags.join(' ')}`.toLowerCase();
  let matchCount = 0;
  for (const word of queryWords) {
    if (text.includes(word)) matchCount += 1;
  }
  return queryWords.length > 0 ? matchCount / queryWords.length : 0;
}

function reuseScore(entry: ArtifactEntry): number {
  return Math.min(entry.reuse_count, 20) / 20;
}

/** keyword 70% + reuse 30% (no embeddings available) */
function scoreArtifactKeywordOnly(entry: ArtifactEntry, queryWords: string[]): number {
  return keywordScore(entry, queryWords) * 0.7 + reuseScore(entry) * 0.3;
}

/** keyword 40% + semantic 30% + reuse 30% */
function scoreArtifactWithSemantic(entry: ArtifactEntry, queryWords: string[], semantic: number): number {
  return keywordScore(entry, queryWords) * 0.4 + semantic * 0.3 + reuseScore(entry) * 0.3;
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

// ---------------------------------------------------------------------------
// Mermaid helpers
// ---------------------------------------------------------------------------

function sanitizeMermaidId(id: string): string {
  return 'n_' + id.replace(/[^a-zA-Z0-9]/g, '_');
}

const SHAPE_OPEN: Record<string, string> = {
  epic: '([', task: '(', skill: '{{', tool: '[[', doc: '>', pptx: '[(', code: '((',
};
const SHAPE_CLOSE: Record<string, string> = {
  epic: '])', task: ')', skill: '}}', tool: ']]', doc: ']', pptx: ')]', code: '))',
};

const MERMAID_STYLES = [
  'classDef epic fill:#4A90D9,stroke:#2C5F8A,color:#fff',
  'classDef task fill:#95A5A6,stroke:#7F8C8D,color:#fff',
  'classDef skill fill:#27AE60,stroke:#1E8449,color:#fff',
  'classDef tool fill:#E67E22,stroke:#D35400,color:#fff',
  'classDef doc fill:#F1C40F,stroke:#D4AC0D,color:#333',
  'classDef pptx fill:#E91E63,stroke:#C2185B,color:#fff',
  'classDef code fill:#9B59B6,stroke:#8E44AD,color:#fff',
];

// ---------------------------------------------------------------------------
// Embedding helper (dynamic import to avoid hard dependency on OpenAI)
// ---------------------------------------------------------------------------

async function tryGenerateEmbedding(text: string): Promise<number[]> {
  try {
    const { generateEmbedding } = await import('../services/rag');
    return await generateEmbedding(text);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// VaultTool
// ---------------------------------------------------------------------------

export class VaultTool extends BaseTool<Input, string> {
  name = 'vault';
  description = selectDesc(VAULT_DESC_V1, VAULT_DESC_V2);
  schema = schema;

  private workspaceRoot?: string;
  private projectId?: string;

  constructor(cwd?: string, projectId?: string) {
    super();
    if (cwd) {
      this.workspaceRoot = path.normalize(cwd);
    }
    this.projectId = projectId;
    this.description = selectDesc(VAULT_DESC_V1, VAULT_DESC_V2);
  }

  private getProjectId(ctx?: ToolContext): string | undefined {
    return this.projectId || ctx?.projectId;
  }

  protected async _run(input: Input, ctx?: ToolContext): Promise<string> {
    const wsRoot = this.workspaceRoot || ctx?.workspacePath || '.';

    switch (input.command) {
      case 'init':
        return this._init(wsRoot, input);
      case 'summary':
        return this._summary(wsRoot, input, ctx);
      case 'search':
        return this._search(wsRoot, input);
      case 'graph':
        return this._graph(wsRoot, input);
      case 'list':
        return this._list(wsRoot, input);
      case 'status':
        return this._status(wsRoot);
      case 'supersede':
        return this._supersede(wsRoot, input, ctx);
      case 'visualize':
        return this._visualize(wsRoot, input);
      case 'export':
        return this._export(wsRoot);
      case 'import':
        return this._import(wsRoot, input);
      default:
        return `Error: Unknown command "${input.command}".`;
    }
  }

  // =========================================================================
  // init
  // =========================================================================
  private _init(wsRoot: string, input: Input): string {
    const vaultDir = getVaultDir(wsRoot);

    if (isVaultInitialized(wsRoot)) {
      return `Vault already initialized at ${vaultDir}`;
    }

    const manifest: VaultManifest = {
      vault_id: generateId(),
      industry_tags: input.industry_tags || [],
      knowledge_base: [],
      updated_at: new Date().toISOString(),
    };

    const graph: VaultGraph = { nodes: [], edges: [] };

    fs.mkdirSync(getSummariesDir(wsRoot), { recursive: true });
    saveJson(getManifestPath(wsRoot), manifest);
    saveJson(getGraphPath(wsRoot), graph);

    return `✓ Vault 已初始化\n  目录: ${vaultDir}\n  vault_id: ${manifest.vault_id}\n  industry_tags: ${manifest.industry_tags.join(', ') || '(none)'}`;
  }

  // =========================================================================
  // summary
  // =========================================================================
  private _summary(wsRoot: string, input: Input, ctx?: ToolContext): string {
    if (!input.epic_id) return 'Error: epic_id is required for summary command.';
    if (!input.title) return 'Error: title is required for summary command.';

    // Auto-init if not initialized
    if (!isVaultInitialized(wsRoot)) {
      this._init(wsRoot, { command: 'init' } as Input);
    }

    const now = new Date().toISOString();

    // Build summary
    const tasks: TaskSummary[] = (input.tasks || []).map(t => ({
      task_id: t.task_id,
      title: t.title,
      assigned_agent: t.assigned_agent,
      status: t.status,
      artifacts: t.artifacts || [],
    }));

    const knowledgeDelta = input.knowledge_delta || { new_artifacts: [], reused_artifacts: [], new_edges: [] };
    const newArtifacts = knowledgeDelta.new_artifacts || [];
    const reusedArtifactIds = knowledgeDelta.reused_artifacts || [];
    const newEdges = knowledgeDelta.new_edges || [];

    const summary: EpicSummary = {
      epic_id: input.epic_id,
      title: input.title,
      completed_at: now,
      tasks,
      knowledge_delta: {
        new_artifacts: [],
        reused_artifacts: reusedArtifactIds,
        new_edges: newEdges,
      },
    };

    // --- Update manifest ---
    const manifest = loadJson<VaultManifest>(getManifestPath(wsRoot), {
      vault_id: generateId(),
      industry_tags: [],
      knowledge_base: [],
      updated_at: now,
    });

    // Process new artifacts
    const addedArtifacts: ArtifactEntry[] = [];
    for (const raw of newArtifacts) {
      const entry: ArtifactEntry = {
        artifact_id: raw.artifact_id || generateId(),
        type: raw.type,
        path: raw.path,
        name: raw.name,
        description: raw.description,
        created_by_epic: raw.created_by_epic || input.epic_id,
        created_by_agent: raw.created_by_agent || 'rebuild',
        created_at: raw.created_at || now,
        reuse_count: raw.reuse_count ?? 0,
        tags: raw.tags || [],
        depends_on: raw.depends_on || [],
        version: raw.version ?? 1,
      };

      // Deduplicate: skip if same artifact_id already exists
      const existing = manifest.knowledge_base.find(e => e.artifact_id === entry.artifact_id);
      if (!existing) {
        manifest.knowledge_base.push(entry);
        addedArtifacts.push(entry);
      }
    }

    // Increment reuse_count for reused artifacts
    for (const reusedId of reusedArtifactIds) {
      const entry = manifest.knowledge_base.find(e => e.artifact_id === reusedId);
      if (entry) {
        entry.reuse_count += 1;
      }
    }

    manifest.updated_at = now;
    saveJson(getManifestPath(wsRoot), manifest);

    // --- Update graph ---
    const graph = loadJson<VaultGraph>(getGraphPath(wsRoot), emptyGraph());
    const existingNodeIds = new Set(graph.nodes.map(n => n.id));
    const existingEdgeKeys = new Set(graph.edges.map(e => `${e.source}|${e.target}|${e.type}`));

    // Add epic node
    if (!existingNodeIds.has(input.epic_id)) {
      graph.nodes.push({
        id: input.epic_id,
        type: 'epic',
        label: input.title,
        metadata: { completed_at: now },
      });
      existingNodeIds.add(input.epic_id);
    }

    // Add task nodes
    for (const task of tasks) {
      if (!existingNodeIds.has(task.task_id)) {
        graph.nodes.push({
          id: task.task_id,
          type: 'task',
          label: task.title,
          metadata: { assigned_agent: task.assigned_agent, status: task.status },
        });
        existingNodeIds.add(task.task_id);
      }
      const taskEpicKey = `${task.task_id}|${input.epic_id}|part_of`;
      if (!existingEdgeKeys.has(taskEpicKey)) {
        graph.edges.push({ source: task.task_id, target: input.epic_id, type: 'part_of' });
        existingEdgeKeys.add(taskEpicKey);
      }
    }

    // Add artifact nodes
    for (const artifact of addedArtifacts) {
      if (!existingNodeIds.has(artifact.artifact_id)) {
        graph.nodes.push({
          id: artifact.artifact_id,
          type: artifact.type,
          label: artifact.name,
          metadata: { path: artifact.path },
        });
        existingNodeIds.add(artifact.artifact_id);
      }
      const prodKey = `${input.epic_id}|${artifact.artifact_id}|produced`;
      if (!existingEdgeKeys.has(prodKey)) {
        graph.edges.push({ source: input.epic_id, target: artifact.artifact_id, type: 'produced' });
        existingEdgeKeys.add(prodKey);
      }
    }

    // Add custom edges (deduped)
    for (const edge of newEdges) {
      const edgeKey = `${edge.source}|${edge.target}|${edge.type}`;
      if (!existingEdgeKeys.has(edgeKey)) {
        graph.edges.push(edge);
        existingEdgeKeys.add(edgeKey);
      }
    }

    saveJson(getGraphPath(wsRoot), graph);

    // --- Save summary ---
    summary.knowledge_delta.new_artifacts = addedArtifacts;
    saveJson(getSummaryPath(wsRoot, input.epic_id), summary);

    // --- Fire-and-forget: Supabase backup ---
    const pid = this.getProjectId(ctx);
    if (pid) {
      for (const artifact of addedArtifacts) {
        vaultStore.persist(pid, artifact);
      }
      // Also persist reuse_count updates
      for (const reusedId of reusedArtifactIds) {
        const updated = manifest.knowledge_base.find(e => e.artifact_id === reusedId);
        if (updated) vaultStore.persist(pid, updated);
      }
    }

    // --- Fire-and-forget: generate embeddings for new artifacts ---
    this._updateEmbeddings(wsRoot, addedArtifacts).catch(() => {});

    return [
      `✓ Epic Summary 已写入`,
      `  epic_id: ${input.epic_id}`,
      `  title: ${input.title}`,
      `  tasks: ${tasks.length}`,
      `  new_artifacts: ${addedArtifacts.length}`,
      `  reused_artifacts: ${reusedArtifactIds.length}`,
      `  new_edges: ${newEdges.length}`,
      `  graph_nodes: ${graph.nodes.length}, graph_edges: ${graph.edges.length}`,
    ].join('\n');
  }

  // =========================================================================
  // search (semantic-enhanced)
  // =========================================================================
  private async _search(wsRoot: string, input: Input): Promise<string> {
    if (!input.query) return 'Error: query is required for search command.';
    if (!isVaultInitialized(wsRoot)) return 'Vault 未初始化。请先执行 vault(command="init")。';

    const manifest = loadJson<VaultManifest>(getManifestPath(wsRoot), emptyManifest());

    let entries = manifest.knowledge_base;

    // Apply type filter
    if (input.type_filter) {
      entries = entries.filter(e => e.type === input.type_filter);
    }

    // Apply tags filter
    if (input.tags && input.tags.length > 0) {
      entries = entries.filter(e => input.tags!.some(t => e.tags.includes(t)));
    }

    if (entries.length === 0) return '知识库为空或无匹配条目。';

    const queryWords = input.query.toLowerCase().split(/\s+/).filter(Boolean);

    // --- Try semantic search enhancement ---
    let semanticScores: Record<string, number> = {};
    let hasSemantic = false;

    try {
      const queryEmbedding = await tryGenerateEmbedding(input.query);
      if (queryEmbedding.length > 0) {
        const storedEmbeddings = loadEmbeddings(wsRoot);
        for (const entry of entries) {
          const artEmbedding = storedEmbeddings[entry.artifact_id];
          if (artEmbedding && artEmbedding.length > 0) {
            semanticScores[entry.artifact_id] = cosineSimilarity(queryEmbedding, artEmbedding);
            hasSemantic = true;
          }
        }
      }
    } catch {
      // Fall back to keyword-only
    }

    const scored = entries.map(e => ({
      entry: e,
      score: hasSemantic
        ? scoreArtifactWithSemantic(e, queryWords, semanticScores[e.artifact_id] || 0)
        : scoreArtifactKeywordOnly(e, queryWords),
    }));

    scored.sort((a, b) => b.score - a.score);

    const limit = input.limit || 20;
    const results = scored.filter(s => s.score > 0).slice(0, limit);

    if (results.length === 0) return `未找到与 "${input.query}" 相关的制品。`;

    const searchMode = hasSemantic ? 'keyword+semantic+reuse' : 'keyword+reuse';
    const lines = results.map(({ entry, score }) => {
      const tags = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
      return `[${entry.artifact_id}] ${entry.type} | ${entry.name} (score: ${score.toFixed(2)}, reuse: ${entry.reuse_count})${tags}\n  ${entry.description}\n  path: ${entry.path}`;
    });

    return `找到 ${results.length} 个相关制品 (${searchMode}):\n\n${lines.join('\n\n')}`;
  }

  // =========================================================================
  // graph
  // =========================================================================
  private _graph(wsRoot: string, input: Input): string {
    if (!isVaultInitialized(wsRoot)) return 'Vault 未初始化。请先执行 vault(command="init")。';

    const queryType = input.query_type || 'neighbors';
    const graph = loadJson<VaultGraph>(getGraphPath(wsRoot), emptyGraph());

    if (queryType === 'neighbors') {
      if (!input.node_id) return 'Error: node_id is required for graph neighbors query.';

      const node = graph.nodes.find(n => n.id === input.node_id);
      if (!node) return `未找到节点 "${input.node_id}"。`;

      const relatedEdges = graph.edges.filter(e => e.source === input.node_id || e.target === input.node_id);
      const neighborIds = new Set<string>();
      for (const edge of relatedEdges) {
        neighborIds.add(edge.source === input.node_id ? edge.target : edge.source);
      }

      const neighbors = graph.nodes.filter(n => neighborIds.has(n.id));

      const nodeInfo = `节点: [${node.id}] ${node.type} | ${node.label}`;
      const edgeLines = relatedEdges.map(e => `  ${e.source} --(${e.type})--> ${e.target}`);
      const neighborLines = neighbors.map(n => `  [${n.id}] ${n.type} | ${n.label}`);

      return [
        nodeInfo,
        `\n关联边 (${relatedEdges.length}):`,
        ...edgeLines,
        `\n邻接节点 (${neighbors.length}):`,
        ...neighborLines,
      ].join('\n');
    }

    if (queryType === 'by_type') {
      if (!input.node_type) return 'Error: node_type is required for graph by_type query.';

      const filtered = graph.nodes.filter(n => n.type === input.node_type);
      if (filtered.length === 0) return `没有类型为 "${input.node_type}" 的节点。`;

      const lines = filtered.map(n => `[${n.id}] ${n.type} | ${n.label}`);
      return `类型为 "${input.node_type}" 的节点 (${filtered.length}):\n\n${lines.join('\n')}`;
    }

    return `Error: Unknown query_type "${queryType}". Use: neighbors, by_type.`;
  }

  // =========================================================================
  // list
  // =========================================================================
  private _list(wsRoot: string, input: Input): string {
    if (!isVaultInitialized(wsRoot)) return 'Vault 未初始化。请先执行 vault(command="init")。';

    const manifest = loadJson<VaultManifest>(getManifestPath(wsRoot), emptyManifest());

    let entries = manifest.knowledge_base;

    if (input.type_filter) {
      entries = entries.filter(e => e.type === input.type_filter);
    }

    if (input.tags && input.tags.length > 0) {
      entries = entries.filter(e => input.tags!.some(t => e.tags.includes(t)));
    }

    if (entries.length === 0) return '知识库为空或无匹配条目。';

    const limit = input.limit || 20;
    const shown = entries.slice(0, limit);

    const lines = shown.map(e => {
      const tags = e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : '';
      return `[${e.artifact_id}] ${e.type} | ${e.name} (reuse: ${e.reuse_count}, v${e.version})${tags}\n  ${e.description}`;
    });

    let output = `知识库列表 (${shown.length}/${entries.length}):\n\n${lines.join('\n\n')}`;
    if (entries.length > limit) {
      output += `\n\n(还有 ${entries.length - limit} 条未显示)`;
    }

    return output;
  }

  // =========================================================================
  // status
  // =========================================================================
  private _status(wsRoot: string): string {
    if (!isVaultInitialized(wsRoot)) return 'Vault 未初始化。请先执行 vault(command="init")。';

    const manifest = loadJson<VaultManifest>(getManifestPath(wsRoot), emptyManifest());
    const graph = loadJson<VaultGraph>(getGraphPath(wsRoot), emptyGraph());

    // Count artifacts by type
    const typeCounts: Record<string, number> = {};
    for (const entry of manifest.knowledge_base) {
      typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1;
    }

    // Count epics from graph
    const epicCount = graph.nodes.filter(n => n.type === 'epic').length;

    // Top 5 most reused
    const sorted = [...manifest.knowledge_base].sort((a, b) => b.reuse_count - a.reuse_count);
    const top5 = sorted.slice(0, 5).filter(e => e.reuse_count > 0);

    // Count summaries
    let summaryCount = 0;
    try {
      const summaryDir = getSummariesDir(wsRoot);
      if (fs.existsSync(summaryDir)) {
        summaryCount = fs.readdirSync(summaryDir).filter((f: string) => f.endsWith('.json')).length;
      }
    } catch {
      // ignore
    }

    // Embeddings status
    const embeddings = loadEmbeddings(wsRoot);
    const embeddingCount = Object.keys(embeddings).length;

    const typeLines = Object.entries(typeCounts).map(([t, c]) => `  ${t}: ${c}`);
    const topLines = top5.map((e, i) => `  ${i + 1}. ${e.name} (${e.type}, reuse: ${e.reuse_count})`);

    return [
      `Vault 统计概览`,
      `  vault_id: ${manifest.vault_id}`,
      `  industry_tags: ${manifest.industry_tags.join(', ') || '(none)'}`,
      `  updated_at: ${manifest.updated_at}`,
      ``,
      `制品总数: ${manifest.knowledge_base.length}`,
      ...typeLines,
      ``,
      `图谱: ${graph.nodes.length} 节点, ${graph.edges.length} 边`,
      `Epic 数: ${epicCount}`,
      `Summary 文件: ${summaryCount}`,
      `语义索引: ${embeddingCount} 条`,
      ``,
      top5.length > 0 ? `最常复用 Top ${top5.length}:` : '暂无复用记录',
      ...topLines,
    ].join('\n');
  }

  // =========================================================================
  // supersede — create new version of an artifact
  // =========================================================================
  private _supersede(wsRoot: string, input: Input, ctx?: ToolContext): string {
    if (!input.artifact_id) return 'Error: artifact_id is required for supersede command.';
    if (!isVaultInitialized(wsRoot)) return 'Vault 未初始化。请先执行 vault(command="init")。';

    const manifest = loadJson<VaultManifest>(getManifestPath(wsRoot), emptyManifest());
    const oldArtifact = manifest.knowledge_base.find(e => e.artifact_id === input.artifact_id);
    if (!oldArtifact) return `Error: 未找到 artifact_id="${input.artifact_id}" 的制品。`;

    const now = new Date().toISOString();

    // Create new version
    const newArtifact: ArtifactEntry = {
      artifact_id: generateId(),
      type: oldArtifact.type,
      path: input.new_artifact_path || oldArtifact.path,
      name: input.new_artifact_name || oldArtifact.name,
      description: input.new_artifact_description || oldArtifact.description,
      created_by_epic: input.epic_id || oldArtifact.created_by_epic,
      created_by_agent: 'rebuild',
      created_at: now,
      reuse_count: 0,
      tags: input.new_artifact_tags || oldArtifact.tags,
      depends_on: oldArtifact.depends_on,
      version: oldArtifact.version + 1,
    };

    manifest.knowledge_base.push(newArtifact);
    manifest.updated_at = now;
    saveJson(getManifestPath(wsRoot), manifest);

    // Update graph
    const graph = loadJson<VaultGraph>(getGraphPath(wsRoot), emptyGraph());
    const existingNodeIds = new Set(graph.nodes.map(n => n.id));
    const existingEdgeKeys = new Set(graph.edges.map(e => `${e.source}|${e.target}|${e.type}`));

    // Add new artifact node
    if (!existingNodeIds.has(newArtifact.artifact_id)) {
      graph.nodes.push({
        id: newArtifact.artifact_id,
        type: newArtifact.type,
        label: newArtifact.name,
        metadata: { path: newArtifact.path, version: newArtifact.version },
      });
    }

    // Add supersedes edge (new → old)
    const supersedesKey = `${newArtifact.artifact_id}|${oldArtifact.artifact_id}|supersedes`;
    if (!existingEdgeKeys.has(supersedesKey)) {
      graph.edges.push({
        source: newArtifact.artifact_id,
        target: oldArtifact.artifact_id,
        type: 'supersedes',
      });
    }

    saveJson(getGraphPath(wsRoot), graph);

    // Fire-and-forget: Supabase backup
    const pid = this.getProjectId(ctx);
    if (pid) vaultStore.persist(pid, newArtifact);

    // Fire-and-forget: generate embedding for new version
    this._updateEmbeddings(wsRoot, [newArtifact]).catch(() => {});

    return [
      `✓ 制品已迭代`,
      `  旧版本: [${oldArtifact.artifact_id}] ${oldArtifact.name} v${oldArtifact.version}`,
      `  新版本: [${newArtifact.artifact_id}] ${newArtifact.name} v${newArtifact.version}`,
      `  edge: ${newArtifact.artifact_id} --supersedes--> ${oldArtifact.artifact_id}`,
    ].join('\n');
  }

  // =========================================================================
  // visualize — generate Mermaid diagram
  // =========================================================================
  private _visualize(wsRoot: string, input: Input): string {
    if (!isVaultInitialized(wsRoot)) return 'Vault 未初始化。请先执行 vault(command="init")。';

    const graph = loadJson<VaultGraph>(getGraphPath(wsRoot), emptyGraph());
    if (graph.nodes.length === 0) return '图谱为空，无法生成可视化。';

    let nodes = graph.nodes;
    let edges = graph.edges;

    // If focus_node specified, BFS to depth
    if (input.focus_node) {
      const maxDepth = input.depth ?? 2;
      const visited = new Set<string>();
      const queue: Array<{ id: string; d: number }> = [{ id: input.focus_node, d: 0 }];

      while (queue.length > 0) {
        const { id, d } = queue.shift()!;
        if (visited.has(id) || d > maxDepth) continue;
        visited.add(id);

        for (const edge of graph.edges) {
          if (edge.source === id && !visited.has(edge.target)) {
            queue.push({ id: edge.target, d: d + 1 });
          }
          if (edge.target === id && !visited.has(edge.source)) {
            queue.push({ id: edge.source, d: d + 1 });
          }
        }
      }

      nodes = graph.nodes.filter(n => visited.has(n.id));
      edges = graph.edges.filter(e => visited.has(e.source) && visited.has(e.target));
    }

    // Generate Mermaid
    const lines = ['graph TD'];

    // Node declarations with shapes
    for (const node of nodes) {
      const safeId = sanitizeMermaidId(node.id);
      const safeLabel = node.label.replace(/"/g, "'").replace(/\n/g, ' ');
      const open = SHAPE_OPEN[node.type] || '[';
      const close = SHAPE_CLOSE[node.type] || ']';
      lines.push(`  ${safeId}${open}"${node.type}: ${safeLabel}"${close}`);
    }

    // Edges
    for (const edge of edges) {
      const src = sanitizeMermaidId(edge.source);
      const tgt = sanitizeMermaidId(edge.target);
      lines.push(`  ${src} -->|${edge.type}| ${tgt}`);
    }

    // Style classes
    for (const style of MERMAID_STYLES) {
      lines.push(`  ${style}`);
    }

    // Assign classes
    for (const node of nodes) {
      lines.push(`  class ${sanitizeMermaidId(node.id)} ${node.type}`);
    }

    const focusInfo = input.focus_node ? ` (focus: ${input.focus_node}, depth: ${input.depth ?? 2})` : '';
    return `\`\`\`mermaid\n${lines.join('\n')}\n\`\`\`\n\n节点: ${nodes.length}, 边: ${edges.length}${focusInfo}`;
  }

  // =========================================================================
  // export — export vault as portable JSON bundle
  // =========================================================================
  private _export(wsRoot: string): string {
    if (!isVaultInitialized(wsRoot)) return 'Vault 未初始化。请先执行 vault(command="init")。';

    const manifest = loadJson<VaultManifest>(getManifestPath(wsRoot), emptyManifest());
    const graph = loadJson<VaultGraph>(getGraphPath(wsRoot), emptyGraph());
    const embeddings = loadEmbeddings(wsRoot);

    // Collect summaries
    const summaries: EpicSummary[] = [];
    try {
      const summaryDir = getSummariesDir(wsRoot);
      if (fs.existsSync(summaryDir)) {
        const files = fs.readdirSync(summaryDir).filter((f: string) => f.endsWith('.json'));
        for (const file of files) {
          const content = loadJson<EpicSummary | null>(path.join(summaryDir, file), null);
          if (content) summaries.push(content);
        }
      }
    } catch {
      // ignore
    }

    const exportData = {
      version: 1,
      manifest,
      graph,
      embeddings,
      summaries,
      exported_at: new Date().toISOString(),
    };

    const exportPath = getExportPath(wsRoot);
    saveJson(exportPath, exportData);

    return [
      `✓ Vault 已导出`,
      `  路径: ${exportPath}`,
      `  制品: ${manifest.knowledge_base.length}`,
      `  节点: ${graph.nodes.length}, 边: ${graph.edges.length}`,
      `  Summaries: ${summaries.length}`,
      `  Embeddings: ${Object.keys(embeddings).length}`,
    ].join('\n');
  }

  // =========================================================================
  // import — import vault data from another workspace
  // =========================================================================
  private _import(wsRoot: string, input: Input): string {
    if (!input.source_workspace) return 'Error: source_workspace is required for import command.';

    const srcWs = input.source_workspace;

    // Try export bundle first, fall back to individual files
    const exportBundlePath = path.join(srcWs, 'vault', 'export.json');
    const srcManifestPath = path.join(srcWs, 'vault', 'manifest.json');
    const srcGraphPath = path.join(srcWs, 'vault', 'graph.json');

    let srcManifest: VaultManifest | null = null;
    let srcGraph: VaultGraph | null = null;
    let srcEmbeddings: Record<string, number[]> = {};
    let srcSummaries: EpicSummary[] = [];

    // Try export bundle
    const bundle = loadJson<any>(exportBundlePath, null);
    if (bundle && bundle.manifest && bundle.graph) {
      srcManifest = bundle.manifest;
      srcGraph = bundle.graph;
      srcEmbeddings = bundle.embeddings || {};
      srcSummaries = bundle.summaries || [];
    } else {
      // Fall back to individual files
      srcManifest = loadJson<VaultManifest | null>(srcManifestPath, null);
      srcGraph = loadJson<VaultGraph | null>(srcGraphPath, null);
      if (srcManifest) {
        srcEmbeddings = loadJson(path.join(srcWs, 'vault', 'embeddings.json'), {});
      }
    }

    if (!srcManifest || !srcGraph) {
      return `Error: 在 ${srcWs} 未找到有效的 vault 数据。`;
    }

    // Auto-init if needed
    if (!isVaultInitialized(wsRoot)) {
      this._init(wsRoot, { command: 'init' } as Input);
    }

    // --- Merge manifest ---
    const manifest = loadJson<VaultManifest>(getManifestPath(wsRoot), emptyManifest());
    const existingArtifactIds = new Set(manifest.knowledge_base.map(e => e.artifact_id));
    let artifactsImported = 0;

    for (const entry of srcManifest.knowledge_base) {
      if (!existingArtifactIds.has(entry.artifact_id)) {
        manifest.knowledge_base.push(entry);
        existingArtifactIds.add(entry.artifact_id);
        artifactsImported++;
      }
    }

    manifest.updated_at = new Date().toISOString();
    saveJson(getManifestPath(wsRoot), manifest);

    // --- Merge graph ---
    const graph = loadJson<VaultGraph>(getGraphPath(wsRoot), emptyGraph());
    const existingNodeIds = new Set(graph.nodes.map(n => n.id));
    const existingEdgeKeys = new Set(graph.edges.map(e => `${e.source}|${e.target}|${e.type}`));
    let nodesImported = 0;
    let edgesImported = 0;

    for (const node of srcGraph.nodes) {
      if (!existingNodeIds.has(node.id)) {
        graph.nodes.push(node);
        existingNodeIds.add(node.id);
        nodesImported++;
      }
    }

    for (const edge of srcGraph.edges) {
      const key = `${edge.source}|${edge.target}|${edge.type}`;
      if (!existingEdgeKeys.has(key)) {
        graph.edges.push(edge);
        existingEdgeKeys.add(key);
        edgesImported++;
      }
    }

    saveJson(getGraphPath(wsRoot), graph);

    // --- Merge embeddings ---
    let embeddingsImported = 0;
    if (Object.keys(srcEmbeddings).length > 0) {
      const localEmbeddings = loadEmbeddings(wsRoot);
      for (const [id, embedding] of Object.entries(srcEmbeddings)) {
        if (!localEmbeddings[id]) {
          localEmbeddings[id] = embedding;
          embeddingsImported++;
        }
      }
      saveEmbeddings(wsRoot, localEmbeddings);
    }

    // --- Import summaries ---
    let summariesImported = 0;
    for (const summary of srcSummaries) {
      const targetPath = getSummaryPath(wsRoot, summary.epic_id);
      if (!fs.existsSync(targetPath)) {
        saveJson(targetPath, summary);
        summariesImported++;
      }
    }

    // Also try reading individual summary files from source
    if (srcSummaries.length === 0) {
      try {
        const srcSummaryDir = path.join(srcWs, 'vault', 'summaries');
        if (fs.existsSync(srcSummaryDir)) {
          const files = fs.readdirSync(srcSummaryDir).filter((f: string) => f.endsWith('.json'));
          for (const file of files) {
            const targetPath = path.join(getSummariesDir(wsRoot), file);
            if (!fs.existsSync(targetPath)) {
              const content = fs.readFileSync(path.join(srcSummaryDir, file), 'utf-8');
              fs.mkdirSync(getSummariesDir(wsRoot), { recursive: true });
              fs.writeFileSync(targetPath, content, 'utf-8');
              summariesImported++;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return [
      `✓ 从 ${srcWs} 导入完成`,
      `  新增制品: ${artifactsImported}`,
      `  新增节点: ${nodesImported}, 新增边: ${edgesImported}`,
      `  新增 Embeddings: ${embeddingsImported}`,
      `  新增 Summaries: ${summariesImported}`,
    ].join('\n');
  }

  // =========================================================================
  // Private: embedding generation (fire-and-forget)
  // =========================================================================
  private async _updateEmbeddings(wsRoot: string, artifacts: ArtifactEntry[]): Promise<void> {
    if (artifacts.length === 0) return;

    try {
      const embeddings = loadEmbeddings(wsRoot);
      let updated = false;

      for (const artifact of artifacts) {
        const text = `${artifact.name} ${artifact.description} ${artifact.tags.join(' ')}`;
        const embedding = await tryGenerateEmbedding(text);
        if (embedding.length > 0) {
          embeddings[artifact.artifact_id] = embedding;
          updated = true;
        }
      }

      if (updated) {
        saveEmbeddings(wsRoot, embeddings);
      }
    } catch {
      // Silently skip if embedding generation unavailable
    }
  }
}
