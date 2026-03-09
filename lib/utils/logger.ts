/**
 * Structured logger for observability (#22).
 * Outputs JSON log lines with traceId, agent, level, and timestamp.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLog {
  ts: string;
  level: LogLevel;
  traceId?: string;
  agent?: string;
  msg: string;
  [key: string]: unknown;
}

/**
 * Create a structured logger bound to a traceId and agent name.
 * Each call emits a JSON line to stdout/stderr.
 */
export function createStructuredLogger(opts: {
  traceId?: string;
  agent?: string;
}) {
  const base = { traceId: opts.traceId, agent: opts.agent };

  function emit(level: LogLevel, msg: string, extra?: Record<string, unknown>) {
    const entry: StructuredLog = {
      ts: new Date().toISOString(),
      level,
      ...base,
      msg,
      ...extra,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (msg: string, extra?: Record<string, unknown>) => emit('debug', msg, extra),
    info: (msg: string, extra?: Record<string, unknown>) => emit('info', msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => emit('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => emit('error', msg, extra),
  };
}

export type StructuredLogger = ReturnType<typeof createStructuredLogger>;

/**
 * Generate a short trace ID for correlating logs within a pipeline run.
 */
export function generateTraceId(): string {
  return `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
