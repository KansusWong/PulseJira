// Stage color mapping (aligned with agent-ui-meta.ts stage system)
export const STAGE_COLORS: Record<string, string> = {
  prepare:   'bg-green-500/10 text-green-400 border-green-500/20',
  plan:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  implement: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  deploy:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  meta:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

// Status color mapping
export const STATUS_COLORS: Record<string, string> = {
  running:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-green-500/10 text-green-400 border-green-500/20',
  failed:    'bg-red-500/10 text-red-400 border-red-500/20',
};

/** Format duration between two ISO timestamps */
export function formatTraceDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return '--';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

/** Format ISO timestamp to HH:mm:ss */
export function formatTraceTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
