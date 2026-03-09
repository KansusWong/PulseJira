import { createStructuredLogger, generateTraceId } from '../logger';

describe('createStructuredLogger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('emits JSON log with traceId and agent', () => {
    const slog = createStructuredLogger({ traceId: 'tr-abc', agent: 'researcher' });
    slog.info('test message');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.level).toBe('info');
    expect(parsed.traceId).toBe('tr-abc');
    expect(parsed.agent).toBe('researcher');
    expect(parsed.msg).toBe('test message');
    expect(parsed.ts).toBeDefined();
  });

  it('routes error level to console.error', () => {
    const slog = createStructuredLogger({ traceId: 'tr-x' });
    slog.error('failure', { code: 500 });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(parsed.level).toBe('error');
    expect(parsed.code).toBe(500);
  });

  it('routes warn level to console.warn', () => {
    const slog = createStructuredLogger({});
    slog.warn('caution');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(parsed.level).toBe('warn');
  });

  it('includes extra fields in output', () => {
    const slog = createStructuredLogger({ traceId: 'tr-1' });
    slog.info('step done', { step: 3, tokens: 1500 });

    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.step).toBe(3);
    expect(parsed.tokens).toBe(1500);
  });
});

describe('generateTraceId', () => {
  it('returns a string starting with "tr-"', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^tr-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});
