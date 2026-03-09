/**
 * GET /api/usage — Token usage aggregation for Settings usage snapshot.
 *
 * Query:
 *   projectId (optional) — filter by project; omit for "all projects".
 *
 * Returns:
 *   last7Days: { totalTokens, avgPerDay, byDay: { date, totalTokens }[] }
 *   last7DaysTime: { totalDurationMs, avgDurationMs, calls, byDay: { date, totalDurationMs }[] }
 *   last30Days: { totalTokens }
 *   last30DaysTime: { totalDurationMs, avgDurationMs, calls }
 *   peakDay: { date, totalTokens } | null
 *   byAgent: { agentName, totalTokens, totalDurationMs, avgDurationMs, calls, percentage }[]
 *   signalUsage: { totalTokens7d, totalTokens30d, byAgent: { agentName, totalTokens }[] }
 *   projectUsage: { totalTokens7d, totalTokens30d }
 *   cacheHitRate: null (placeholder)
 */

import { NextResponse } from 'next/server';
import { supabase, assertSupabase } from '@/lib/db/client';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Round to 4 decimal places for USD cost display. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Signal intelligence phase agents — these run during signal collection,
 * screening, and analysis BEFORE a feature enters the project execution phase.
 * Includes both underscore (BaseAgent config names) and hyphen variants.
 */
const SIGNAL_PHASE_AGENTS = new Set([
  'signal-screener',
  'signal_screener',
  'researcher',
  'knowledge_curator',
  'knowledge-curator',
  'blue_team',
  'blue-team',
  'critic',
  'arbitrator',
  'decision_maker',
  'decision-maker',
]);

function isSignalPhaseAgent(name: string): boolean {
  return SIGNAL_PHASE_AGENTS.has(name) || name.startsWith('signal-') || name.startsWith('signal_');
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || undefined;

  try {
    assertSupabase();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
    const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

    let query = supabase
      .from('llm_usage')
      .select('used_at, agent_name, total_tokens, account_id, account_name, cost_usd, duration_ms, signal_id, trace_id')
      .gte('used_at', thirtyDaysAgo.toISOString());

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data: rows, error } = await query.order('used_at', { ascending: true });

    if (error) {
      console.error('[usage] Query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const list = (rows || []) as {
      used_at: string;
      agent_name: string;
      total_tokens: number;
      account_id: string | null;
      account_name: string | null;
      cost_usd: number | null;
      duration_ms: number | null;
      signal_id: string | null;
      trace_id: string | null;
    }[];

    const dayMap = new Map<string, number>();
    const dayMap7 = new Map<string, number>();
    const dayDurationMap7 = new Map<string, number>();
    let total30 = 0;
    let total7 = 0;
    let totalCost30 = 0;
    let totalCost7 = 0;
    let totalDuration30 = 0;
    let totalDuration7 = 0;
    let totalCalls30 = 0;
    let totalCalls7 = 0;
    const agentMap = new Map<string, number>();
    const agentCostMap = new Map<string, number>();
    const agentDurationMap = new Map<string, number>();
    const agentCallMap = new Map<string, number>();
    const accountMap = new Map<string, { name: string; totalTokens: number; totalCost: number; totalDurationMs: number; calls: number }>();

    let signalTotal30 = 0;
    let signalTotal7 = 0;
    let signalCost30 = 0;
    let signalCost7 = 0;
    let signalDuration30 = 0;
    let signalDuration7 = 0;
    let signalCalls30 = 0;
    let signalCalls7 = 0;
    const signalAgentMap = new Map<string, number>();
    let projectTotal30 = 0;
    let projectTotal7 = 0;
    let projectCost30 = 0;
    let projectCost7 = 0;
    let projectDuration30 = 0;
    let projectDuration7 = 0;
    let projectCalls30 = 0;
    let projectCalls7 = 0;

    for (const r of list) {
      const t = r.total_tokens || 0;
      const c = r.cost_usd || 0;
      const duration = Math.max(0, Number(r.duration_ms || 0));
      const d = r.used_at.slice(0, 10);
      const isRecent = new Date(r.used_at) >= sevenDaysAgo;
      total30 += t;
      totalCost30 += c;
      totalDuration30 += duration;
      totalCalls30 += 1;
      dayMap.set(d, (dayMap.get(d) || 0) + t);
      if (isRecent) {
        total7 += t;
        totalCost7 += c;
        totalDuration7 += duration;
        totalCalls7 += 1;
        dayMap7.set(d, (dayMap7.get(d) || 0) + t);
        dayDurationMap7.set(d, (dayDurationMap7.get(d) || 0) + duration);
      }
      agentMap.set(r.agent_name, (agentMap.get(r.agent_name) || 0) + t);
      agentCostMap.set(r.agent_name, (agentCostMap.get(r.agent_name) || 0) + c);
      agentDurationMap.set(r.agent_name, (agentDurationMap.get(r.agent_name) || 0) + duration);
      agentCallMap.set(r.agent_name, (agentCallMap.get(r.agent_name) || 0) + 1);

      // Per-account aggregation
      const accId = r.account_id || '__unknown__';
      const accName = r.account_name || '未知账户';
      const existing = accountMap.get(accId) || { name: accName, totalTokens: 0, totalCost: 0, totalDurationMs: 0, calls: 0 };
      existing.totalTokens += t;
      existing.totalCost += c;
      existing.totalDurationMs += duration;
      existing.calls += 1;
      accountMap.set(accId, existing);

      if (isSignalPhaseAgent(r.agent_name)) {
        signalTotal30 += t;
        signalCost30 += c;
        signalDuration30 += duration;
        signalCalls30 += 1;
        if (isRecent) {
          signalTotal7 += t;
          signalCost7 += c;
          signalDuration7 += duration;
          signalCalls7 += 1;
        }
        signalAgentMap.set(r.agent_name, (signalAgentMap.get(r.agent_name) || 0) + t);
      } else {
        projectTotal30 += t;
        projectCost30 += c;
        projectDuration30 += duration;
        projectCalls30 += 1;
        if (isRecent) {
          projectTotal7 += t;
          projectCost7 += c;
          projectDuration7 += duration;
          projectCalls7 += 1;
        }
      }
    }

    const byDay: { date: string; totalTokens: number; totalDurationMs: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      byDay.push({
        date: dateStr,
        totalTokens: dayMap7.get(dateStr) || 0,
        totalDurationMs: dayDurationMap7.get(dateStr) || 0,
      });
    }

    let peakDay: { date: string; totalTokens: number } | null = null;
    for (const { date, totalTokens } of byDay) {
      if (totalTokens > 0 && (!peakDay || totalTokens > peakDay.totalTokens)) {
        peakDay = { date, totalTokens };
      }
    }

    const avgPerDay = total7 > 0 ? Math.round(total7 / 7) : 0;

    const byAgent = Array.from(agentMap.entries())
      .map(([agentName, totalTokens]) => ({
        agentName,
        totalTokens,
        costUsd: round4(agentCostMap.get(agentName) || 0),
        totalDurationMs: Math.round(agentDurationMap.get(agentName) || 0),
        avgDurationMs: Math.round((agentDurationMap.get(agentName) || 0) / Math.max(1, agentCallMap.get(agentName) || 0)),
        calls: agentCallMap.get(agentName) || 0,
        percentage: total30 > 0 ? Math.round((100 * totalTokens) / total30) : 0,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    const signalByAgent = Array.from(signalAgentMap.entries())
      .map(([agentName, totalTokens]) => ({ agentName, totalTokens }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    const byAccount = Array.from(accountMap.entries())
      .map(([accountId, { name, totalTokens, totalCost, totalDurationMs, calls }]) => ({
        accountId,
        accountName: name,
        totalTokens,
        costUsd: round4(totalCost),
        totalDurationMs: Math.round(totalDurationMs),
        avgDurationMs: Math.round(totalDurationMs / Math.max(1, calls)),
        calls,
        percentage: total30 > 0 ? Math.round((100 * totalTokens) / total30) : 0,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    return NextResponse.json({
      success: true,
      data: {
        last7Days: { totalTokens: total7, costUsd: round4(totalCost7), avgPerDay, byDay },
        last7DaysTime: {
          totalDurationMs: Math.round(totalDuration7),
          avgDurationMs: Math.round(totalDuration7 / Math.max(1, totalCalls7)),
          calls: totalCalls7,
          byDay: byDay.map((item) => ({ date: item.date, totalDurationMs: item.totalDurationMs })),
        },
        last30Days: { totalTokens: total30, costUsd: round4(totalCost30) },
        last30DaysTime: {
          totalDurationMs: Math.round(totalDuration30),
          avgDurationMs: Math.round(totalDuration30 / Math.max(1, totalCalls30)),
          calls: totalCalls30,
        },
        peakDay,
        byAgent,
        byAccount,
        signalUsage: {
          totalTokens7d: signalTotal7,
          totalTokens30d: signalTotal30,
          costUsd7d: round4(signalCost7),
          costUsd30d: round4(signalCost30),
          totalDurationMs7d: Math.round(signalDuration7),
          totalDurationMs30d: Math.round(signalDuration30),
          avgDurationMs7d: Math.round(signalDuration7 / Math.max(1, signalCalls7)),
          avgDurationMs30d: Math.round(signalDuration30 / Math.max(1, signalCalls30)),
          calls7d: signalCalls7,
          calls30d: signalCalls30,
          byAgent: signalByAgent,
        },
        projectUsage: {
          totalTokens7d: projectTotal7,
          totalTokens30d: projectTotal30,
          costUsd7d: round4(projectCost7),
          costUsd30d: round4(projectCost30),
          totalDurationMs7d: Math.round(projectDuration7),
          totalDurationMs30d: Math.round(projectDuration30),
          avgDurationMs7d: Math.round(projectDuration7 / Math.max(1, projectCalls7)),
          avgDurationMs30d: Math.round(projectDuration30 / Math.max(1, projectCalls30)),
          calls7d: projectCalls7,
          calls30d: projectCalls30,
        },
        cacheHitRate: null,
      },
    });
  } catch (e: any) {
    console.error('[usage] Error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
