/**
 * POST /api/projects/[projectId]/push-pr — Push local workspace to GitHub and create PR.
 *
 * Body: { repo_url: string }
 *
 * Flow:
 * 1. Resolve local workspace path
 * 2. Add remote (if not exists), push branch
 * 3. Create PR via GitHub API
 * 4. Return PR URL
 */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { GitWorkspace } from '@/lib/sandbox/git-workspace';
import { createPullRequest } from '@/connectors/external/github';
import { supabase, assertSupabase } from '@/lib/db/client';
import { messageBus } from '@/connectors/bus/message-bus';

export async function POST(
  req: Request,
  { params }: { params: { projectId: string } }
) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { repo_url } = body;
  const projectId = params.projectId;

  if (!repo_url) {
    return NextResponse.json(
      { success: false, error: 'repo_url is required' },
      { status: 400 }
    );
  }

  // Parse owner/repo from URL
  const httpsMatch = repo_url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  const sshMatch = repo_url.match(/github\.com:([^/]+)\/([^/.]+)/);
  const match = httpsMatch || sshMatch;
  if (!match) {
    return NextResponse.json(
      { success: false, error: 'Invalid GitHub repo URL' },
      { status: 400 }
    );
  }
  const repoOwner = match[1];
  const repoName = match[2];

  assertSupabase();

  // Fetch project
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('name, implementation_plan')
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
  }

  // Resolve local workspace path
  const dirName = (project.name || `project-${projectId}`)
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_');
  const localPath = path.join(process.cwd(), 'projects', dirName);

  if (!fs.existsSync(localPath)) {
    return NextResponse.json(
      { success: false, error: `Workspace not found at ${localPath}` },
      { status: 404 }
    );
  }

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  let streamClosed = false;

  async function safeWrite(data: Uint8Array) {
    if (streamClosed) return;
    try { await writer.write(data); } catch { streamClosed = true; }
  }
  async function safeClose() {
    if (streamClosed) return;
    try { await writer.close(); } catch {} finally { streamClosed = true; }
  }

  async function log(msg: string) {
    await safeWrite(encoder.encode(`data: ${JSON.stringify({ type: 'log', agent: 'deployer', message: msg })}\n\n`));
  }

  (async () => {
    try {
      const git = new GitWorkspace(localPath);

      // Ensure all changes are committed
      await log('检查本地变更...');
      const status = await git.status();
      if (status.trim()) {
        await git.commit('[Pulse] Final commit before PR');
        await log('已提交本地变更。');
      }

      // Add remote and push
      await log(`添加远程仓库: ${repo_url}`);
      const { CommandRunner } = await import('@/lib/sandbox/command-runner');
      const runner = new CommandRunner(localPath, ['git']);

      // Remove existing remote if it exists, then add
      await runner.run('git', ['remote', 'remove', 'origin']).catch(() => { /* may not exist — expected */ });
      const addResult = await runner.run('git', ['remote', 'add', 'origin', repo_url]);
      if (addResult.exitCode !== 0) {
        throw new Error(`Failed to add remote: ${addResult.stderr}`);
      }

      // Get current branch
      const branchResult = await runner.run('git', ['branch', '--show-current']);
      const branch = branchResult.stdout.trim() || 'main';

      await log(`推送分支 ${branch} 到 ${repoOwner}/${repoName}...`);
      await git.push('origin');
      await log('推送成功。');

      // Create PR
      await log('创建 Pull Request...');
      const planSummary = project.implementation_plan?.summary || project.name;
      const pr = await createPullRequest({
        owner: repoOwner,
        repo: repoName,
        head: branch,
        base: 'main',
        title: `[Pulse] ${planSummary}`,
        body: `由 Pulse AI 自动生成的实现代码。\n\n项目: ${project.name}\n\n请审查并合并。`,
      });

      if (!pr) {
        throw new Error('GitHub API 未返回 PR 信息，请检查 GITHUB_TOKEN 配置。');
      }

      await log(`PR 已创建: ${pr.html_url}`);

      // Update project in DB
      await supabase
        .from('projects')
        .update({ pr_url: pr.html_url, status: 'deployed' })
        .eq('id', projectId);

      await safeWrite(
        encoder.encode(`data: ${JSON.stringify({
          type: 'result',
          data: { prUrl: pr.html_url, prNumber: pr.number },
        })}\n\n`)
      );
    } catch (e: any) {
      console.error('[push-pr] Error:', e);
      await log(`错误: ${e.message}`);
      await safeWrite(
        encoder.encode(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`)
      );
    } finally {
      await safeClose();
    }
  })();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
