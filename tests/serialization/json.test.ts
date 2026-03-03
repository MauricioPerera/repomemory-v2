import { describe, it, expect } from 'vitest';
import { safeJsonParse, safeJsonStringify } from '../../src/serialization/json.js';

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns fallback on invalid JSON', () => {
    expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
  });

  it('throws on invalid JSON without fallback', () => {
    expect(() => safeJsonParse('invalid')).toThrow();
  });
});

describe('safeJsonStringify', () => {
  it('stringifies objects', () => {
    expect(safeJsonStringify({ a: 1 })).toBe('{"a":1}');
  });

  it('pretty prints when requested', () => {
    const result = safeJsonStringify({ a: 1 }, true);
    expect(result).toContain('\n');
  });
});
