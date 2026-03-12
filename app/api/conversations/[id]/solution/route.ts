/**
 * POST /api/conversations/[id]/solution — approve or reject a code solution proposal
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { executeSolution } from '@/lib/services/solution-executor';
import type { CodeSolutionProposal } from '@/lib/core/types';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { action, solution_id } = body;

  if (action === 'approve') {
    if (!solution_id) {
      return NextResponse.json(
        { success: false, error: 'solution_id is required' },
        { status: 400 }
      );
    }

    // Get conversation to retrieve solution_proposal and workspace info
    let proposal: CodeSolutionProposal | null = null;
    let workspacePath: string | null = null;

    if (supabaseConfigured) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('solution_proposal, project_id')
        .eq('id', params.id)
        .single();

      if (conv?.solution_proposal) {
        proposal = conv.solution_proposal as CodeSolutionProposal;
      }

      // Get workspace path from project if available
      if (conv?.project_id) {
        const { data: project } = await supabase
          .from('projects')
          .select('workspace_path')
          .eq('id', conv.project_id)
          .single();

        workspacePath = project?.workspace_path;
      }
    }

    if (!proposal) {
      return NextResponse.json(
        { success: false, error: 'No solution proposal found' },
        { status: 404 }
      );
    }

    // Find the selected solution
    const selectedSolution = proposal.solutions.find((s) => s.id === solution_id);
    if (!selectedSolution) {
      return NextResponse.json(
        { success: false, error: `Solution ${solution_id} not found` },
        { status: 404 }
      );
    }

    // Execute the solution (if workspace path is available)
    let executionResult;
    if (workspacePath) {
      try {
        executionResult = await executeSolution(selectedSolution, workspacePath);
      } catch (error: any) {
        console.error('[SolutionAPI] Execution failed:', error);
        executionResult = {
          success: false,
          filesChanged: 0,
          errors: [error.message],
        };
      }
    } else {
      // No workspace available - solution will be executed by Developer agent later
      executionResult = {
        success: true,
        filesChanged: 0,
        errors: [],
      };
    }

    // Store the selected solution ID and execution result
    if (supabaseConfigured) {
      await supabase
        .from('conversations')
        .update({
          selected_solution_id: solution_id,
          solution_status: executionResult.success ? 'executed' : 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);
    }

    return NextResponse.json({
      success: true,
      data: {
        status: 'approved',
        solution_id,
        execution: executionResult,
      },
    });
  }

  if (action === 'reject') {
    // Clear any solution proposal state
    if (supabaseConfigured) {
      await supabase
        .from('conversations')
        .update({
          selected_solution_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);
    }

    return NextResponse.json({
      success: true,
      data: { status: 'rejected' },
    });
  }

  return NextResponse.json(
    { success: false, error: 'Invalid action' },
    { status: 400 }
  );
}
