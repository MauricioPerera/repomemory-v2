import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { BUILTIN_TEMPLATES, resolveTemplate } from '../src/recall/templates.js';

describe('Filtered export (Memory Packs)', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-filtered-'));
    mem = new RepoMemory({ dir });

    mem.memories.save('a1', 'u1', { content: 'memory about typescript', tags: ['typescript', 'dev'] });
    mem.memories.save('a1', 'u1', { content: 'memory about python', tags: ['python', 'dev'] });
    mem.memories.save('a2', 'u1', { content: 'different agent memory', tags: ['typescript'] });
    mem.skills.save('a1', undefined, { content: 'deploy with docker', tags: ['docker', 'deploy'], category: 'procedure' });
    mem.knowledge.save('a1', undefined, { content: 'EmbeddingGemma docs', tags: ['ml', 'embedding'] });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exports all entities without filter', () => {
    const data = mem.exportFiltered();
    expect(data.version).toBe(1);
    expect(data.count).toBe(5);
  });

  it('filters by agent ID', () => {
    const data = mem.exportFiltered({ agentId: 'a1' });
    expect(data.count).toBe(4); // 2 memories + 1 skill + 1 knowledge
    expect(data.agentId).toBe('a1');
  });

  it('filters by entity type', () => {
    const data = mem.exportFiltered({ types: ['skill'] });
    expect(data.count).toBe(1);
    expect(data.entities.skills).toHaveLength(1);
    expect(data.entities.memories).toHaveLength(0);
  });

  it('filters by tags (ALL must match)', () => {
    const data = mem.exportFiltered({ tags: ['typescript', 'dev'] });
    expect(data.count).toBe(1);
    expect(data.entities.memories[0].content).toContain('typescript');
  });

  it('filters by query text', () => {
    const data = mem.exportFiltered({ query: 'docker' });
    expect(data.count).toBe(1);
    expect(data.entities.skills[0].content).toContain('docker');
  });

  it('returns v2 pack format with pack metadata', () => {
    const data = mem.exportFiltered(undefined, {
      name: 'test-pack',
      description: 'A test pack',
      author: 'tester',
      packVersion: '1.0.0',
    });
    expect(data.version).toBe(2);
    expect(data.pack).toBeDefined();
    expect(data.pack!.name).toBe('test-pack');
    expect(data.pack!.author).toBe('tester');
  });

  it('combines filters', () => {
    const data = mem.exportFiltered({ agentId: 'a1', types: ['memory'], tags: ['dev'] });
    expect(data.count).toBe(2); // both a1 memories have 'dev' tag
  });

  it('includes access counts for filtered entities', () => {
    // Search to generate access counts
    mem.memories.search('a1', 'u1', 'typescript');
    mem.flush();

    const data = mem.exportFiltered({ query: 'typescript' });
    expect(data.count).toBeGreaterThan(0);
  });
});

describe('Few-shot template', () => {
  it('few_shot template is registered in built-ins', () => {
    const t = resolveTemplate('few_shot');
    expect(t.id).toBe('few_shot');
    expect(t.extractFewShot).toBe(true);
    expect(t.maxFewShot).toBe(3);
  });

  it('few_shot template has correct collection weights', () => {
    const t = BUILTIN_TEMPLATES.few_shot;
    expect(t.collectionWeights!.skills).toBe(2.0);
    expect(t.collectionWeights!.memories).toBe(0.8);
    expect(t.collectionWeights!.knowledge).toBe(0.6);
  });

  it('few_shot template has preamble', () => {
    const t = BUILTIN_TEMPLATES.few_shot;
    expect(t.preamble).toContain('learned patterns');
  });
});

describe('Few-shot extraction in RecallEngine', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-fewshot-'));
    mem = new RepoMemory({ dir });

    // Skills with tool patterns (should be extracted as few-shot)
    mem.skills.save('a1', undefined, {
      content: 'Calculate compound interest [CALC: principal * (1 + rate)^years]',
      tags: ['math', 'finance'],
      category: 'procedure',
    });
    mem.skills.save('a1', undefined, {
      content: 'Get weather data [FETCH: api.weather.com/current?city={city}]',
      tags: ['weather', 'api'],
      category: 'procedure',
    });
    mem.skills.save('a1', undefined, {
      content: 'Query database [MCP: repomemory.recall agentId=a1]',
      tags: ['database', 'mcp'],
      category: 'procedure',
    });
    // Skill without tool pattern (should NOT be extracted)
    mem.skills.save('a1', undefined, {
      content: 'Always use strict TypeScript mode',
      tags: ['typescript', 'best-practice'],
      category: 'procedure',
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('extracts few-shot examples with few_shot template', () => {
    const ctx = mem.recall('a1', 'user1', 'calculate finance math', { template: 'few_shot' });
    expect(ctx.fewShotExamples).toBeDefined();
    expect(ctx.fewShotExamples!.length).toBeGreaterThan(0);
    // Each example should have user and assistant fields
    for (const ex of ctx.fewShotExamples!) {
      expect(ex.user).toBeTruthy();
      expect(ex.assistant).toBeTruthy();
    }
  });

  it('does not extract few-shot with default template', () => {
    const ctx = mem.recall('a1', 'user1', 'calculate finance');
    expect(ctx.fewShotExamples).toBeUndefined();
  });

  it('respects maxFewShot limit', () => {
    const ctx = mem.recall('a1', 'user1', 'calculate weather database', {
      template: {
        id: 'test-fewshot',
        name: 'Test',
        sectionOrder: ['skills'],
        collectionWeights: { skills: 2.0 },
        extractFewShot: true,
        maxFewShot: 1,
      },
    });
    expect(ctx.fewShotExamples).toBeDefined();
    expect(ctx.fewShotExamples!.length).toBeLessThanOrEqual(1);
  });
});
