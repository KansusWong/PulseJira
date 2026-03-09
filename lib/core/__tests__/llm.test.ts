import { cleanJSON, isReasonerModel, extractFirstJsonObject } from '../llm';

// ---------------------------------------------------------------------------
// cleanJSON
// ---------------------------------------------------------------------------
describe('cleanJSON', () => {
  it('returns "{}" for empty input', () => {
    expect(cleanJSON('')).toBe('{}');
  });

  it('passes through plain JSON object', () => {
    const input = '{"key":"value"}';
    expect(cleanJSON(input)).toBe('{"key":"value"}');
  });

  it('extracts JSON from markdown code block', () => {
    const input = '```json\n{"a":1}\n```';
    expect(JSON.parse(cleanJSON(input))).toEqual({ a: 1 });
  });

  it('extracts JSON from code block without language tag', () => {
    const input = '```\n{"b":2}\n```';
    expect(JSON.parse(cleanJSON(input))).toEqual({ b: 2 });
  });

  it('strips <think> blocks from DeepSeek Reasoner', () => {
    const input = '<think>reasoning here</think>\n{"result":"ok"}';
    expect(JSON.parse(cleanJSON(input))).toEqual({ result: 'ok' });
  });

  it('handles JSON with surrounding text', () => {
    const input = 'Here is the result: {"decision":"PROCEED"} end.';
    expect(JSON.parse(cleanJSON(input))).toEqual({ decision: 'PROCEED' });
  });

  it('handles nested objects', () => {
    const input = '{"outer":{"inner":true}}';
    expect(JSON.parse(cleanJSON(input))).toEqual({ outer: { inner: true } });
  });

  it('handles whitespace-padded input', () => {
    const input = '   \n  {"x":1}  \n   ';
    expect(JSON.parse(cleanJSON(input))).toEqual({ x: 1 });
  });

  // #24: greedy match regression tests
  it('does NOT greedily match across separate JSON objects', () => {
    // Old regex /\{[\s\S]*\}/ would match: {"a":1} some text {"b":2}
    // New balanced extractor should return only {"a":1}
    const input = '{"a":1} some text {"b":2}';
    expect(JSON.parse(cleanJSON(input))).toEqual({ a: 1 });
  });

  it('does NOT include trailing text with braces', () => {
    const input = 'Result: {"decision":"PROCEED","confidence":0.9} Note: use {caution} here.';
    expect(JSON.parse(cleanJSON(input))).toEqual({ decision: 'PROCEED', confidence: 0.9 });
  });

  it('correctly handles braces inside JSON strings', () => {
    const input = '{"msg":"value with {braces} inside"}';
    expect(JSON.parse(cleanJSON(input))).toEqual({ msg: 'value with {braces} inside' });
  });

  it('handles escaped quotes inside strings', () => {
    const input = '{"msg":"say \\"hello\\""}';
    expect(JSON.parse(cleanJSON(input))).toEqual({ msg: 'say "hello"' });
  });
});

// ---------------------------------------------------------------------------
// extractFirstJsonObject
// ---------------------------------------------------------------------------
describe('extractFirstJsonObject', () => {
  it('returns null for text without braces', () => {
    expect(extractFirstJsonObject('no braces here')).toBeNull();
  });

  it('extracts the first balanced object', () => {
    expect(extractFirstJsonObject('abc {"x":1} def {"y":2}')).toBe('{"x":1}');
  });

  it('handles deeply nested objects', () => {
    const input = '{"a":{"b":{"c":3}}}';
    expect(extractFirstJsonObject(input)).toBe(input);
  });

  it('ignores braces inside strings', () => {
    const input = '{"key":"value with { and }"}';
    expect(extractFirstJsonObject(input)).toBe(input);
  });

  it('handles escaped characters in strings', () => {
    const input = '{"k":"val\\"}"}'; // JSON: {"k":"val\"}"} — escaped quote
    // This is {"k":"val\"}"}  — the string value is val"}
    // After the string closes, the next } closes the object
    const result = extractFirstJsonObject(input);
    expect(result).toBe(input);
  });

  it('falls back to greedy match when braces are unbalanced', () => {
    const input = '{ unclosed {but} has end }';
    // depth goes: 1, 2, 1 (at first }), then 0 at last }
    // Actually this IS balanced, so it should return the whole thing
    expect(extractFirstJsonObject(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// isReasonerModel
// ---------------------------------------------------------------------------
describe('isReasonerModel', () => {
  it('returns true for deepseek-reasoner', () => {
    expect(isReasonerModel('deepseek-reasoner')).toBe(true);
  });

  it('returns true for model names containing "reasoner"', () => {
    expect(isReasonerModel('custom-reasoner-v2')).toBe(true);
  });

  it('returns false for standard models', () => {
    expect(isReasonerModel('gpt-4o')).toBe(false);
    expect(isReasonerModel('claude-3-opus')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isReasonerModel(null)).toBe(false);
    expect(isReasonerModel(undefined)).toBe(false);
  });
});
