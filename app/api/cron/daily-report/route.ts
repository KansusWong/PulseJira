/**
 * Cron endpoint — triggers daily report generation via Analyst agent.
 *
 * POST /api/cron/daily-report
 *
 * Can be called by:
 * - Vercel Cron (vercel.json schedule)
 * - External scheduler (e.g. GitHub Actions, cron job)
 * - Manual trigger from the UI or curl
 *
 * Flow:
 * 1. Check kill switch (system_config.daily_report_enabled)
 * 2. Check idempotency (system_config.daily_report_last_run)
 * 3. Create Analyst agent in daily-report mode
 * 4. Run agent → structured report
 * 5. Dispatch via webhook
 */

import { NextResponse } from 'next/server';
import { createRebuilDAgent } from '@/agents/rebuild';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { emitWebhookEvent, webhookService } from '@/lib/services/webhook';
import type { FinishDailyReportInput } from '@/lib/tools/finish-daily-report';

// ---------------------------------------------------------------------------
// Locale helpers
// ---------------------------------------------------------------------------

type Locale = 'zh' | 'en';

async function getSystemLocale(): Promise<Locale> {
  if (!supabaseConfigured) return 'zh';
  try {
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'system_locale')
      .single();
    if (data) {
      const val = JSON.parse(data.value);
      if (val === 'en') return 'en';
    }
  } catch {
    // default zh
  }
  return 'zh';
}

// ---------------------------------------------------------------------------
// System config helpers
// ---------------------------------------------------------------------------

async function isDailyReportEnabled(): Promise<boolean> {
  if (!supabaseConfigured) return true;
  try {
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'daily_report_enabled')
      .single();
    if (data) {
      const val = JSON.parse(data.value);
      return val === true || val === 'true';
    }
  } catch {
    // Default enabled
  }
  return true;
}

async function hasRunToday(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'daily_report_last_run')
      .single();
    if (data) {
      const lastRun = JSON.parse(data.value);
      const today = new Date().toISOString().slice(0, 10);
      return lastRun === today;
    }
  } catch {
    // not run yet
  }
  return false;
}

async function recordRun(dateStr: string): Promise<void> {
  if (!supabaseConfigured) return;
  await supabase
    .from('system_config')
    .upsert(
      { key: 'daily_report_last_run', value: JSON.stringify(dateStr), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
}

// Bump this version whenever the report schema changes to auto-invalidate old caches.
const REPORT_SCHEMA_VERSION = 2;

async function getCachedReport(dateStr: string, locale: Locale): Promise<FinishDailyReportInput | null> {
  if (!supabaseConfigured) return null;
  try {
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', `daily_report_cache_${locale}`)
      .single();
    if (data) {
      const cached = JSON.parse(data.value);
      if (
        cached?.date === dateStr &&
        cached?.report &&
        cached?.schemaVersion === REPORT_SCHEMA_VERSION
      ) {
        return cached.report;
      }
    }
  } catch {
    // no cache
  }
  return null;
}

async function cacheReport(dateStr: string, locale: Locale, report: FinishDailyReportInput): Promise<void> {
  if (!supabaseConfigured) return;
  await supabase
    .from('system_config')
    .upsert(
      {
        key: `daily_report_cache_${locale}`,
        value: JSON.stringify({ date: dateStr, report, schemaVersion: REPORT_SCHEMA_VERSION }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
}

// ---------------------------------------------------------------------------
// Webhook formatting
// ---------------------------------------------------------------------------

const LABELS = {
  zh: {
    title: '每日报告',
    executiveSummary: '摘要',
    deliveryOutcomes: '交付成果',
    prsCreated: 'PR 创建',
    deploymentsCompleted: '部署完成',
    decisionsMade: '决策完成',
    codeChanges: '代码变更',
    tokenUsage: 'Token 消耗',
    totalTokens: '总消耗',
    trend: '趋势',
    topAgent: 'Top Agent',
    decisionTrend: '决策趋势',
    decisionCount: '决策数',
    avgConfidence: '平均置信度',
    projectAlignment: '项目对齐',
    tasksCompleted: '任务完成',
    risksAndBlockers: '风险与阻塞',
    recommendations: '明日建议',
  },
  en: {
    title: 'Daily Report',
    executiveSummary: 'Summary',
    deliveryOutcomes: 'Delivery Outcomes',
    prsCreated: 'PRs Created',
    deploymentsCompleted: 'Deployments Completed',
    decisionsMade: 'Decisions Made',
    codeChanges: 'Code Changes',
    tokenUsage: 'Token Usage',
    totalTokens: 'Total',
    trend: 'Trend',
    topAgent: 'Top Agent',
    decisionTrend: 'Decision Trend',
    decisionCount: 'Decisions',
    avgConfidence: 'Avg Confidence',
    projectAlignment: 'Project Alignment',
    tasksCompleted: 'tasks completed',
    risksAndBlockers: 'Risks & Blockers',
    recommendations: 'Recommendations',
  },
} as const;

// ---------------------------------------------------------------------------
// Token formatting helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatReportForWebhook(report: FinishDailyReportInput, _locale: Locale = 'zh'): string {
  const l = LABELS[_locale];
  const lines: string[] = [
    `### ${l.executiveSummary}`,
    report.executive_summary,
    '',
    `### ${l.deliveryOutcomes}`,
    `- ${l.prsCreated}: ${report.delivery_outcomes.prs_created}`,
    `- ${l.deploymentsCompleted}: ${report.delivery_outcomes.deployments_completed}`,
    `- ${l.decisionsMade}: ${report.delivery_outcomes.decisions_made}`,
    `- ${l.codeChanges}: ${report.delivery_outcomes.code_changes_summary}`,
    '',
    `### ${l.tokenUsage}`,
    `- ${l.totalTokens}: ${formatTokens(report.cost_analysis.total_tokens ?? 0)} tokens`,
    `- ${l.trend}: ${report.cost_analysis.cost_trend_note}`,
  ];

  if (report.cost_analysis.top_cost_agents.length > 0) {
    lines.push(`- ${l.topAgent}:`);
    for (const a of report.cost_analysis.top_cost_agents.slice(0, 3)) {
      const tokenStr = formatTokens(a.tokens ?? 0);
      const summary = a.work_summary ? ` — ${a.work_summary}` : '';
      lines.push(`  - ${a.agent_name}: ${tokenStr} tokens (${a.percentage}%)${summary}`);
    }
  }

  lines.push(
    '',
    `### ${l.decisionTrend}`,
    `- ${l.decisionCount}: ${report.prediction_trend.decision_count}`,
    `- ${l.avgConfidence}: ${report.prediction_trend.avg_confidence?.toFixed(2) ?? 'N/A'}`,
    `- ${l.trend}: ${report.prediction_trend.trend_note}`,
  );

  if (report.project_alignment.length > 0) {
    lines.push('', `### ${l.projectAlignment}`);
    for (const p of report.project_alignment) {
      lines.push(`- **${p.project_name}** (${p.status}): ${p.tasks_completed}/${p.tasks_total} ${l.tasksCompleted} — ${p.alignment_note}`);
    }
  }

  if (report.risks_and_blockers.length > 0) {
    lines.push('', `### ${l.risksAndBlockers}`);
    for (const r of report.risks_and_blockers) {
      lines.push(`- ${r}`);
    }
  }

  if (report.recommendations.length > 0) {
    lines.push('', `### ${l.recommendations}`);
    for (const r of report.recommendations) {
      lines.push(`- ${r}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // Parse optional body (webhook_id for per-webhook manual trigger, locale for language)
  let webhookId: string | undefined;
  let bodyLocale: string | undefined;
  try {
    const body = await req.json();
    webhookId = body?.webhook_id;
    bodyLocale = body?.locale;
  } catch {
    // No body (cron trigger) — that's fine
  }

  const isManual = !!webhookId;

  // Auth check — only for cron triggers, not manual UI triggers
  if (!isManual) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get('authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  // Kill switch
  const enabled = await isDailyReportEnabled();
  if (!enabled) {
    return NextResponse.json({
      success: true,
      data: { mode: 'disabled', message: 'Daily report is disabled via system config.' },
    });
  }

  // Idempotency — only for cron triggers; manual always proceeds (reuses cache)
  if (!isManual) {
    const alreadyRun = await hasRunToday();
    if (alreadyRun) {
      return NextResponse.json({
        success: true,
        data: { mode: 'skipped', message: 'Daily report already generated today.' },
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // Resolve locale: body > system_config > default 'zh'
  const locale: Locale = bodyLocale === 'en' ? 'en'
    : bodyLocale === 'zh' ? 'zh'
    : await getSystemLocale();

  try {
    // Try to reuse cached report from today (avoids re-running the agent)
    let result = await getCachedReport(today, locale);

    if (!result) {
      const agent = createRebuilDAgent({ maxLoops: 10 });
      const userMessage = locale === 'en'
        ? `Please generate the daily project progress report for ${today}. Call fetch_daily_data to retrieve data, analyze it, then submit the structured report via finish_daily_report.`
        : `请生成 ${today} 的每日项目进展报告。调用 fetch_daily_data 获取数据，分析后通过 finish_daily_report 提交结构化报告。`;
      result = (await agent.run(userMessage)) as FinishDailyReportInput;

      // Cache and record
      await Promise.all([cacheReport(today, locale, result), recordRun(today)]);
    }

    const reportTitle = locale === 'en' ? `Daily Report — ${today}` : `每日报告 — ${today}`;
    const detail = formatReportForWebhook(result, locale);

    if (isManual) {
      // Send to the specific webhook only
      await webhookService.sendToWebhook(webhookId!, {
        event: 'daily_report_complete',
        title: reportTitle,
        detail,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Broadcast to all subscribed webhooks
      emitWebhookEvent({
        event: 'daily_report_complete',
        title: reportTitle,
        detail,
        from: 'analyst',
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        mode: 'completed',
        report_date: today,
        executive_summary: result.executive_summary,
        task_count: result.task_deliverables?.length ?? 0,
        total_tokens: result.cost_analysis?.total_tokens ?? 0,
        detail,
      },
    });
  } catch (error: any) {
    console.error('[cron/daily-report] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

// Vercel Cron uses GET by default
export async function GET(req: Request) {
  return POST(req);
}
