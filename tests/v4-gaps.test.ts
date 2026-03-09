import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'repomemory-v4-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// saveOrUpdate for Skills
// =============================================================================

describe('SkillCollection.saveOrUpdate', () => {
  it('creates new skill when no similar exists', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [skill, , meta] = repo.skills.saveOrUpdate('a1', {
      content: 'How to deploy with Docker containers',
      tags: ['docker', 'deployment'],
      category: 'procedure',
    });
    expect(meta.deduplicated).toBe(false);
    expect(skill.content).toBe('How to deploy with Docker containers');
  });

  it('deduplicates when similar skill exists in same category', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.skills.save('a1', undefined, {
      content: 'How to deploy with Docker containers',
      tags: ['docker', 'deployment'],
      category: 'procedure',
    });

    const [updated, , meta] = repo.skills.saveOrUpdate('a1', {
      content: 'How to deploy using Docker containers and compose',
      tags: ['docker', 'deployment', 'compose'],
      category: 'procedure',
    });
    expect(meta.deduplicated).toBe(true);
    expect(updated.content).toContain('compose');
    expect(updated.tags).toContain('compose');
  });

  it('does not deduplicate across different categories', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.skills.save('a1', undefined, {
      content: 'Docker container deployment steps',
      tags: ['docker'],
      category: 'procedure',
    });

    const [, , meta] = repo.skills.saveOrUpdate('a1', {
      content: 'Docker container deployment troubleshooting guide',
      tags: ['docker'],
      category: 'troubleshooting',
    });
    expect(meta.deduplicated).toBe(false);
  });

  it('respects custom threshold', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.skills.save('a1', undefined, {
      content: 'Setting up TypeScript strict mode configuration',
      tags: ['typescript'],
      category: 'configuration',
    });

    // High threshold = no dedup
    const [, , meta] = repo.skills.saveOrUpdate('a1', {
      content: 'TypeScript strict mode config setup',
      tags: ['typescript'],
      category: 'configuration',
    }, 0.99);
    expect(meta.deduplicated).toBe(false);
  });
});

// =============================================================================
// saveOrUpdate for Knowledge
// =============================================================================

describe('KnowledgeCollection.saveOrUpdate', () => {
  it('creates new knowledge when no similar exists', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [knowledge, , meta] = repo.knowledge.saveOrUpdate('a1', {
      content: 'PostgreSQL supports JSONB columns for semi-structured data',
      tags: ['postgresql', 'jsonb'],
      source: 'docs/database.md',
    });
    expect(meta.deduplicated).toBe(false);
    expect(knowledge.content).toContain('JSONB');
  });

  it('deduplicates when similar knowledge exists', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.knowledge.save('a1', undefined, {
      content: 'PostgreSQL supports JSONB columns for semi-structured data',
      tags: ['postgresql', 'jsonb'],
      source: 'docs/database.md',
    });

    // v2.10.0: dedup requires same source (or both undefined)
    const [updated, , meta] = repo.knowledge.saveOrUpdate('a1', {
      content: 'PostgreSQL JSONB columns support semi-structured data with indexing',
      tags: ['postgresql', 'jsonb', 'indexing'],
      source: 'docs/database.md',
    });
    expect(meta.deduplicated).toBe(true);
    expect(updated.content).toContain('indexing');
    expect(updated.source).toBe('docs/database.md');
  });

  it('does not deduplicate unrelated knowledge', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.knowledge.save('a1', undefined, {
      content: 'PostgreSQL supports JSONB columns',
      tags: ['postgresql'],
    });

    const [, , meta] = repo.knowledge.saveOrUpdate('a1', {
      content: 'Redis supports pub/sub messaging patterns',
      tags: ['redis'],
    });
    expect(meta.deduplicated).toBe(false);
  });
});

// =============================================================================
// Pagination: listPaginated()
// =============================================================================

describe('Paginated list', () => {
  it('returns paginated results with metadata', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    for (let i = 0; i < 10; i++) {
      repo.memories.save('a1', 'u1', {
        content: `Memory number ${i}`,
        tags: ['test'],
        category: 'fact',
      });
    }

    const page1 = repo.memories.listPaginated('a1', 'u1', { limit: 3, offset: 0 });
    expect(page1.items.length).toBe(3);
    expect(page1.total).toBe(10);
    expect(page1.limit).toBe(3);
    expect(page1.offset).toBe(0);
    expect(page1.hasMore).toBe(true);
  });

  it('returns correct second page', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    for (let i = 0; i < 5; i++) {
      repo.memories.save('a1', 'u1', {
        content: `Memory ${i}`,
        tags: ['test'],
        category: 'fact',
      });
    }

    const page2 = repo.memories.listPaginated('a1', 'u1', { limit: 3, offset: 3 });
    expect(page2.items.length).toBe(2);
    expect(page2.total).toBe(5);
    expect(page2.hasMore).toBe(false);
  });

  it('returns empty page when offset exceeds total', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.memories.save('a1', 'u1', {
      content: 'Only memory',
      tags: ['test'],
      category: 'fact',
    });

    const page = repo.memories.listPaginated('a1', 'u1', { limit: 10, offset: 100 });
    expect(page.items.length).toBe(0);
    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
  });

  it('defaults to limit=50 offset=0', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    for (let i = 0; i < 3; i++) {
      repo.skills.save('a1', undefined, {
        content: `Skill ${i}`,
        tags: ['test'],
        category: 'procedure',
      });
    }

    const page = repo.skills.listPaginated('a1', undefined);
    expect(page.items.length).toBe(3);
    expect(page.limit).toBe(50);
    expect(page.offset).toBe(0);
  });

  it('works with knowledge collection', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    for (let i = 0; i < 7; i++) {
      repo.knowledge.save('a1', undefined, {
        content: `Knowledge item ${i}`,
        tags: ['test'],
      });
    }

    const page = repo.knowledge.listPaginated('a1', undefined, { limit: 4 });
    expect(page.items.length).toBe(4);
    expect(page.total).toBe(7);
    expect(page.hasMore).toBe(true);
  });
});

// =============================================================================
// count()
// =============================================================================

describe('count()', () => {
  it('returns total entity count without loading all entities', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    for (let i = 0; i < 5; i++) {
      repo.memories.save('a1', 'u1', {
        content: `Memory ${i}`,
        tags: ['test'],
        category: 'fact',
      });
    }
    expect(repo.memories.count('a1', 'u1')).toBe(5);
  });

  it('excludes deleted entities', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [m1] = repo.memories.save('a1', 'u1', {
      content: 'Will be deleted',
      tags: ['test'],
      category: 'fact',
    });
    repo.memories.save('a1', 'u1', {
      content: 'Will stay',
      tags: ['test'],
      category: 'fact',
    });
    repo.memories.delete(m1.id);
    expect(repo.memories.count('a1', 'u1')).toBe(1);
  });
});

// =============================================================================
// deleteMany()
// =============================================================================

describe('deleteMany()', () => {
  it('deletes multiple entities at once', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const [m] = repo.memories.save('a1', 'u1', {
        content: `Memory to delete ${i}`,
        tags: ['delete-me'],
        category: 'fact',
      });
      ids.push(m.id);
    }

    const commits = repo.memories.deleteMany(ids.slice(0, 3));
    expect(commits.length).toBe(3);
    expect(repo.memories.list('a1', 'u1').length).toBe(2);
  });

  it('skips non-existent ids gracefully', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [m] = repo.memories.save('a1', 'u1', {
      content: 'Existing memory',
      tags: ['test'],
      category: 'fact',
    });

    const commits = repo.memories.deleteMany([m.id, 'nonexistent-id', 'also-fake']);
    expect(commits.length).toBe(1);
    expect(repo.memories.list('a1', 'u1').length).toBe(0);
  });

  it('emits entity:delete event for each deletion', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const deleted: string[] = [];
    repo.on('entity:delete', ({ entityId }) => deleted.push(entityId));

    const [m1] = repo.memories.save('a1', 'u1', {
      content: 'First',
      tags: ['test'],
      category: 'fact',
    });
    const [m2] = repo.memories.save('a1', 'u1', {
      content: 'Second',
      tags: ['test'],
      category: 'fact',
    });

    repo.memories.deleteMany([m1.id, m2.id]);
    expect(deleted).toContain(m1.id);
    expect(deleted).toContain(m2.id);
  });

  it('removes from search index', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [m] = repo.memories.save('a1', 'u1', {
      content: 'Unique searchable memory about quantum computing',
      tags: ['quantum'],
      category: 'fact',
    });

    repo.memories.deleteMany([m.id]);
    const results = repo.memories.search('a1', 'u1', 'quantum computing');
    expect(results.length).toBe(0);
  });

  it('returns empty array for empty input', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const commits = repo.memories.deleteMany([]);
    expect(commits).toEqual([]);
  });
});
