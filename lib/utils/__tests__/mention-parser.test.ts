import { parseMentions } from '../mention-parser';
import type { ParsedMessage } from '../mention-parser';

const AGENTS = ['researcher', 'coder', 'reviewer'];

describe('parseMentions', () => {
  it('returns no mentions when text has none', () => {
    const result = parseMentions('hello world', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: [],
      targetAgent: null,
      cleanContent: 'hello world',
    });
  });

  it('parses a single known agent mention', () => {
    const result = parseMentions('@coder please fix the bug', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: ['coder'],
      targetAgent: 'coder',
      cleanContent: 'please fix the bug',
    });
  });

  it('parses @all as broadcast (targetAgent = null, mentions = ["all"])', () => {
    const result = parseMentions('@all stop working', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: ['all'],
      targetAgent: null,
      cleanContent: 'stop working',
    });
  });

  it('ignores unknown @mentions', () => {
    const result = parseMentions('@unknown do something', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: [],
      targetAgent: null,
      cleanContent: '@unknown do something',
    });
  });

  it('handles multiple mentions — uses first as target', () => {
    const result = parseMentions('@researcher @coder collaborate on this', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: ['researcher', 'coder'],
      targetAgent: 'researcher',
      cleanContent: 'collaborate on this',
    });
  });

  it('is case-insensitive', () => {
    const result = parseMentions('@Coder fix it', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: ['coder'],
      targetAgent: 'coder',
      cleanContent: 'fix it',
    });
  });

  it('handles mention in the middle of text', () => {
    const result = parseMentions('hey @reviewer check this PR', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: ['reviewer'],
      targetAgent: 'reviewer',
      cleanContent: 'hey check this PR',
    });
  });

  it('trims extra whitespace from cleanContent', () => {
    const result = parseMentions('  @coder   fix   bug  ', AGENTS);
    expect(result.cleanContent).toBe('fix bug');
  });

  it('returns empty cleanContent when only mention exists', () => {
    const result = parseMentions('@coder', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: ['coder'],
      targetAgent: 'coder',
      cleanContent: '',
    });
  });

  it('handles agents with hyphens in names', () => {
    const agents = ['code-reviewer', 'data-analyst'];
    const result = parseMentions('@code-reviewer check this', agents);
    expect(result).toEqual<ParsedMessage>({
      mentions: ['code-reviewer'],
      targetAgent: 'code-reviewer',
      cleanContent: 'check this',
    });
  });

  it('does not match @ inside words (e.g. email)', () => {
    const result = parseMentions('send to user@coder.com', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: [],
      targetAgent: null,
      cleanContent: 'send to user@coder.com',
    });
  });

  it('treats @all mixed with @agent as broadcast', () => {
    const result = parseMentions('@all @coder do something', AGENTS);
    expect(result.mentions).toContain('all');
    expect(result.targetAgent).toBeNull();
    expect(result.cleanContent).toBe('do something');
  });

  it('handles empty string', () => {
    const result = parseMentions('', AGENTS);
    expect(result).toEqual<ParsedMessage>({
      mentions: [],
      targetAgent: null,
      cleanContent: '',
    });
  });

  it('deduplicates repeated mentions of the same agent', () => {
    const result = parseMentions('@coder @coder fix', AGENTS);
    expect(result.mentions).toEqual(['coder']);
    expect(result.targetAgent).toBe('coder');
  });
});
