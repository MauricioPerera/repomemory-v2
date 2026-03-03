import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/cli/parser.js';

describe('parseArgs', () => {
  it('parses command and subcommand', () => {
    const result = parseArgs(['node', 'cli.js', 'save', 'memory', '--agent', 'a1']);
    expect(result.command).toBe('save');
    expect(result.subcommand).toBe('memory');
    expect(result.flags.agent).toBe('a1');
  });

  it('handles boolean flags', () => {
    const result = parseArgs(['node', 'cli.js', 'init', '--verbose']);
    expect(result.command).toBe('init');
    expect(result.flags.verbose).toBe(true);
  });

  it('handles positional args', () => {
    const result = parseArgs(['node', 'cli.js', 'snapshot', 'create', 'my-label']);
    expect(result.command).toBe('snapshot');
    expect(result.subcommand).toBe('create');
    expect(result.positional).toEqual(['my-label']);
  });

  it('defaults to help', () => {
    const result = parseArgs(['node', 'cli.js']);
    expect(result.command).toBe('help');
  });
});
