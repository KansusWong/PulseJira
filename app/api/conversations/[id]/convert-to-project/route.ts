/**
 * POST /api/conversations/[id]/convert-to-project
 *
 * Converts an existing Chat conversation into a Project.
 * - Summarises the conversation via LLM (generateJSON)
 * - Creates a Project record
 * - Marks the conversation as 'converted' with project_id
 * - Stores the summary as the first project context message
 */

import { NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { errorResponse, withErrorHandler } from '@/lib/utils/api-error';
import { createProject } from '@/projects/project-service';
import { generateJSON } from '@/lib/core/llm';

export const POST = withErrorHandler(async (
  req: Request,
  { params }: { params: { id: string } },
) => {
  const conversationId = params.id;

  if (!supabaseConfigured) {
    return errorResponse('Database not configured', 503);
  }

  const body = await req.json().catch(() => ({}));
  const projectName = body.projectName?.trim();

  // 1. Load conversation
  const { data: conversation, error: convErr } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (convErr || !conversation) {
    return errorResponse('Conversation not found', 404);
  }

  if (conversation.status === 'converted') {
    return errorResponse('Conversation already converted', 409);
  }

  if (conversation.project_id) {
    return errorResponse('Conversation already linked to a project', 409);
  }

  // 2. Load messages
  const { data: messages, error: msgErr } = await supabase
    .from('messages')
    .select('role, content, metadata')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (msgErr) {
    return errorResponse(`Failed to load messages: ${msgErr.message}`, 500);
  }

  // 3. Generate summary via LLM
  const { systemPrompt, userContent } = buildSummaryPrompts(messages || []);
  let summary: string;
  try {
    const result = await generateJSON(systemPrompt, userContent, {
      agentName: 'convert-to-project',
    });
    summary = result.summary || result.brief || JSON.stringify(result);
  } catch (err: any) {
    console.error('[convert-to-project] LLM summary failed:', err.message);
    // Fallback: use conversation title as summary
    summary = `Project converted from chat: ${conversation.title || 'Untitled'}`;
  }

  // 4. Derive project name
  const name = projectName || conversation.title || 'Untitled Project';

  // 5. Create project
  const project = await createProject({
    name,
    description: summary,
    execution_mode: 'foreman',
    conversation_id: conversationId,
  });

  // 6. Update conversation status
  const { error: updateErr } = await supabase
    .from('conversations')
    .update({
      status: 'converted',
      project_id: project.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if (updateErr) {
    console.error('[convert-to-project] Failed to update conversation:', updateErr.message);
  }

  // 7. Create a summary message in the project context
  const { error: summaryMsgErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: 'system',
      content: `**Project Summary**\n\n${summary}`,
      metadata: {
        type: 'project_conversion_summary',
        project_id: project.id,
      },
    });

  if (summaryMsgErr) {
    console.error('[convert-to-project] Failed to create summary message:', summaryMsgErr.message);
  }

  return NextResponse.json({
    success: true,
    project_id: project.id,
    project_name: name,
    summary,
  });
});

/**
 * Build system + user prompts for conversation summary.
 * generateJSON expects (systemPrompt, userContent) and returns parsed JSON.
 */
function buildSummaryPrompts(
  messages: Array<{ role: string; content: string; metadata: any }>,
): { systemPrompt: string; userContent: string } {
  const transcript = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-30)
    .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
    .join('\n\n');

  const systemPrompt = `You are a project manager. Given a conversation transcript, produce a JSON object with a single "summary" field containing a project brief.

The summary should include:
- Goal: What the user wants to achieve
- Key Decisions: Important choices made
- Key Findings: Important discoveries or conclusions
- Next Steps: What should happen next

Keep the summary concise (3-5 paragraphs). Write in the same language as the conversation.

Respond with valid JSON: { "summary": "..." }`;

  const userContent = transcript || '(empty conversation)';

  return { systemPrompt, userContent };
}
