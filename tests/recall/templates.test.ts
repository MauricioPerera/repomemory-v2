import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { formatWithTemplate } from '../../src/recall/formatter.js';
import { BUILTIN_TEMPLATES, listTemplates, resolveTemplate } from '../../src/recall/templates.js';
import type { PromptTemplate } from '../../src/recall/templates.js';
import type { RecallData } from '../../src/recall/formatter.js';

describe('Template system', () => {
  it('lists all built-in templates', () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(4);
    const ids = templates.map(t => t.id);
    expect(ids).toContain('default');
    expect(ids).toContain('technical');
    expect(ids).toContain('support');
    expect(ids).toContain('rag_focused');
  });

  it('resolves built-in template by ID', () => {
    const t = resolveTemplate('technical');
    expect(t.id).toBe('technical');
    expect(t.name).toBe('Technical');
  });

  it('throws for unknown template ID', () => {
    expect(() => resolveTemplate('nonexistent')).toThrow('Unknown template');
  });

  it('passes through PromptTemplate object', () => {
    const custom: PromptTemplate = {
      id: 'custom',
      name: 'Custom',
      sectionOrder: ['knowledge', 'memories'],
    };
    expect(resolveTemplate(custom)).toBe(custom);
  });
});

describe('formatWithTemplate', () => {
  const mockData: RecallData = {
    memories: [
      { entity: { id: 'm1', type: 'memory', agentId: 'a', userId: 'u', content: 'User prefers dark mode', tags: ['ui'], category: 'fact', accessCount: 0, createdAt: '', updatedAt: '' }, score: 0.8 },
    ],
    skills: [
      { entity: { id: 's1', type: 'skill', agentId: 'a', content: 'Deploy with Docker: 1) Build image 2) Push to registry', tags: ['docker'], category: 'procedure', status: 'active' as const, accessCount: 0, createdAt: '', updatedAt: '' }, score: 0.7 },
    ],
    knowledge: [
      { entity: { id: 'k1', type: 'knowledge', agentId: 'a', content: 'EmbeddingGemma supports 100+ languages', tags: ['ml'], source: 'docs/models.md', accessCount: 0, createdAt: '', updatedAt: '' }, score: 0.6 },
    ],
    profile: null,
  };

  it('default template uses standard order', () => {
    const result = formatWithTemplate(mockData, BUILTIN_TEMPLATES.default, 10000);
    const memIdx = result.indexOf('Memories');
    const skillIdx = result.indexOf('Skills');
    const knowledgeIdx = result.indexOf('Knowledge');
    expect(memIdx).toBeLessThan(skillIdx);
    expect(skillIdx).toBeLessThan(knowledgeIdx);
  });

  it('technical template puts skills first', () => {
    const result = formatWithTemplate(mockData, BUILTIN_TEMPLATES.technical, 10000);
    const skillIdx = result.indexOf('Procedures & Patterns');
    const knowledgeIdx = result.indexOf('Technical Reference');
    const memIdx = result.indexOf('Context Notes');
    expect(skillIdx).toBeLessThan(knowledgeIdx);
    expect(knowledgeIdx).toBeLessThan(memIdx);
  });

  it('rag_focused template shows knowledge first with preamble', () => {
    const result = formatWithTemplate(mockData, BUILTIN_TEMPLATES.rag_focused, 10000);
    expect(result).toContain('Answer based primarily on the source documents');
    const knowledgeIdx = result.indexOf('Source Documents');
    const memIdx = result.indexOf('Additional Context');
    expect(knowledgeIdx).toBeLessThan(memIdx);
  });

  it('uses custom section headers', () => {
    const custom: PromptTemplate = {
      id: 'test',
      name: 'Test',
      sectionOrder: ['memories'],
      sectionHeaders: { memories: '## Customer History' },
    };
    const result = formatWithTemplate(mockData, custom, 10000);
    expect(result).toContain('## Customer History');
    expect(result).not.toContain('## Relevant Memories');
  });

  it('respects maxChars budget', () => {
    const result = formatWithTemplate(mockData, BUILTIN_TEMPLATES.default, 50);
    expect(result.length).toBeLessThanOrEqual(50);
  });
});

describe('RecallEngine with templates', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repomem-templates-'));
    mem = new RepoMemory({ dir });

    // Seed data
    mem.memories.save('agent1', 'user1', { content: 'Uses PostgreSQL for database', tags: ['db', 'postgresql'], category: 'decision' });
    mem.skills.save('agent1', undefined, { content: 'To migrate DB: create file, run migration, verify', tags: ['db', 'migration'], category: 'procedure' });
    mem.knowledge.save('agent1', undefined, { content: 'PostgreSQL supports JSONB columns for semi-structured data', tags: ['db', 'postgresql'], source: 'docs/db.md' });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('recall with default template works normally', () => {
    const ctx = mem.recall('agent1', 'user1', 'database PostgreSQL');
    expect(ctx.totalItems).toBeGreaterThan(0);
    expect(ctx.formatted).toContain('Relevant Memories');
  });

  it('recall with rag_focused template boosts knowledge', () => {
    const ctx = mem.recall('agent1', 'user1', 'database PostgreSQL', { template: 'rag_focused' });
    expect(ctx.formatted).toContain('Source Documents');
    expect(ctx.formatted).toContain('Answer based primarily');
    // Knowledge should have more items due to 2x weight
    expect(ctx.knowledge.length).toBeGreaterThanOrEqual(1);
  });

  it('recall with technical template reorders sections', () => {
    const ctx = mem.recall('agent1', 'user1', 'database migration', { template: 'technical' });
    if (ctx.skills.length > 0 && ctx.memories.length > 0) {
      const skillIdx = ctx.formatted.indexOf('Procedures');
      const memIdx = ctx.formatted.indexOf('Context Notes');
      expect(skillIdx).toBeLessThan(memIdx);
    }
  });
});
