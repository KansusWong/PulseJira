import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/connectors/external/supabase';
import { withErrorHandler, errorResponse } from '@/lib/utils/api-error';

/**
 * GET /api/vault-graph — Vault knowledge graph for visualization.
 *
 * Reads vault_artifacts, missions, and mate_definitions from Supabase,
 * returns GraphNode[] / GraphEdge[] for the frontend VaultGraph component.
 *
 * Query params:
 *   ?project_id=xxx  — filter by project (optional)
 */

// ---------------------------------------------------------------------------
// Graph types (matches vault.ts GraphNode/GraphEdge)
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  type: 'skill' | 'tool' | 'doc' | 'pptx' | 'code' | 'epic' | 'task' | 'mate' | 'mission';
  label: string;
  metadata?: Record<string, any>;
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'produced' | 'depends_on' | 'reuses' | 'part_of' | 'supersedes' | 'participated' | 'led';
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: Request) => {
  if (!supabaseConfigured) {
    return NextResponse.json({
      success: true,
      data: { nodes: [], edges: [] },
      meta: { message: 'Supabase not configured. Graph unavailable.' },
    });
  }

  const url = new URL(req.url);
  const projectId = url.searchParams.get('project_id');

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // --- 1. Vault artifacts → nodes ---
  {
    let query = supabase
      .from('vault_artifacts')
      .select('id, artifact_type, name, description, created_by_epic, created_by_agent, created_by_mate, mission_id, depends_on, tags, reuse_count');

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query.limit(500);
    if (!error && data) {
      for (const row of data) {
        nodes.push({
          id: row.id,
          type: row.artifact_type || 'doc',
          label: row.name || row.id,
          metadata: {
            description: row.description,
            tags: row.tags,
            reuse_count: row.reuse_count,
            created_by_agent: row.created_by_agent,
            created_by_mate: row.created_by_mate,
          },
        });

        // depends_on edges
        if (Array.isArray(row.depends_on)) {
          for (const depId of row.depends_on) {
            edges.push({ source: row.id, target: depId, type: 'depends_on' });
          }
        }

        // mate → artifact edge
        if (row.created_by_mate) {
          edges.push({ source: row.created_by_mate, target: row.id, type: 'produced' });
        }

        // mission → artifact edge
        if (row.mission_id) {
          edges.push({ source: row.mission_id, target: row.id, type: 'part_of' });
        }
      }
    }
  }

  // --- 2. Missions → nodes ---
  {
    let query = supabase
      .from('missions')
      .select('id, mission_name, status, lead_mate, team_mates, created_at');

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query.limit(100);
    if (!error && data) {
      for (const row of data) {
        nodes.push({
          id: row.id,
          type: 'mission',
          label: row.mission_name,
          metadata: { status: row.status, created_at: row.created_at },
        });

        // lead mate → mission edge
        if (row.lead_mate) {
          edges.push({ source: row.lead_mate, target: row.id, type: 'led' });
        }

        // team mates → mission edges
        if (Array.isArray(row.team_mates)) {
          for (const mateName of row.team_mates) {
            edges.push({ source: mateName, target: row.id, type: 'participated' });
          }
        }
      }
    }
  }

  // --- 3. Mate definitions → nodes ---
  {
    const { data, error } = await supabase
      .from('mate_definitions')
      .select('id, name, display_name, description, domains, can_lead, status')
      .limit(200);

    if (!error && data) {
      for (const row of data) {
        nodes.push({
          id: row.name,  // use name as ID for edge matching
          type: 'mate',
          label: row.display_name || row.name,
          metadata: {
            db_id: row.id,
            description: row.description,
            domains: row.domains,
            can_lead: row.can_lead,
            status: row.status,
          },
        });
      }
    }
  }

  // --- Deduplicate nodes by ID ---
  const nodeMap = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
    }
  }

  // --- Filter edges to only include nodes that exist ---
  const nodeIds = new Set(nodeMap.keys());
  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  return NextResponse.json({
    success: true,
    data: {
      nodes: [...nodeMap.values()],
      edges: validEdges,
    },
  });
});
