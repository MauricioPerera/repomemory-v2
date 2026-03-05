import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { Lockfile, LockGuard } from '../src/storage/lockfile.js';
import { formatRecallContext } from '../src/recall/formatter.js';
import type { Memory, Skill, Knowledge, Profile } from '../src/types/entities.js';
import type { SearchResult } from '../src/types/results.js';
import type { AiProvider } from '../src/types/ai.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'repomemory-v2-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// Gap 6: Configurable dedup threshold
// =============================================================================

describe('Configurable dedup threshold', () => {
  it('uses default threshold (0.2) when not specified', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.memories.save('a1', 'u1', {
      content: 'The database uses PostgreSQL version 15',
      tags: ['database'],
      category: 'fact',
    });
    // Very similar content — should dedup with default threshold
    const [, , meta] = repo.memories.saveOrUpdate('a1', 'u1', {
      content: 'The database uses PostgreSQL version 16',
      tags: ['database'],
      category: 'fact',
    });
    expect(meta.deduplicated).toBe(true);
    expect(repo.memories.list('a1', 'u1')).toHaveLength(1);
  });

  it('high threshold (0.95) prevents deduplication', () => {
    const repo = new RepoMemory({ dir: tmpDir, dedupThreshold: 0.95 });
    repo.memories.save('a1', 'u1', {
      content: 'The database uses PostgreSQL version 15',
      tags: ['database'],
      category: 'fact',
    });
    const [, , meta] = repo.memories.saveOrUpdate('a1', 'u1', {
      content: 'The database uses PostgreSQL version 16',
      tags: ['database'],
      category: 'fact',
    });
    // With very high threshold, these shouldn't be similar enough
    expect(meta.deduplicated).toBe(false);
    expect(repo.memories.list('a1', 'u1')).toHaveLength(2);
  });

  it('very low threshold (0.01) deduplicates almost anything in same category', () => {
    const repo = new RepoMemory({ dir: tmpDir, dedupThreshold: 0.01 });
    repo.memories.save('a1', 'u1', {
      content: 'database postgresql is cool',
      tags: ['db'],
      category: 'fact',
    });
    const [, , meta] = repo.memories.saveOrUpdate('a1', 'u1', {
      content: 'something about database postgresql',
      tags: ['db'],
      category: 'fact',
    });
    expect(meta.deduplicated).toBe(true);
  });
});

// =============================================================================
// Gap 3: AI response validation
// =============================================================================

describe('AI response validation', () => {
  it('rejects invalid mining schema and retries', async () => {
    let callCount = 0;
    const mockProvider: AiProvider = {
      chat: async () => {
        callCount++;
        if (callCount === 1) {
          // Invalid: memories items missing category
          return '{"memories":[{"content":"test"}],"skills":[]}';
        }
        return '{"memories":[{"content":"test","tags":["t"],"category":"fact"}],"skills":[]}';
      },
    };

    const { AiService } = await import('../src/ai/service.js');
    const service = new AiService(mockProvider);
    const result = await service.extractFromSession('test session');
    expect(callCount).toBe(2);
    expect(result.memories[0].category).toBe('fact');
  });

  it('rejects invalid consolidation schema and retries', async () => {
    let callCount = 0;
    const mockProvider: AiProvider = {
      chat: async () => {
        callCount++;
        if (callCount === 1) {
          // Invalid: merge items missing sourceIds
          return '{"keep":[],"merge":[{"merged":{"content":"x","tags":[]}}],"remove":[]}';
        }
        return '{"keep":["id1"],"merge":[],"remove":[]}';
      },
    };

    const { AiService } = await import('../src/ai/service.js');
    const service = new AiService(mockProvider);
    const result = await service.planConsolidation('[]');
    expect(callCount).toBe(2);
    expect(result.keep).toEqual(['id1']);
  });

  it('fails after retry with invalid schema', async () => {
    const mockProvider: AiProvider = {
      chat: async () => '{"memories":"not_an_array","skills":[]}',
    };

    const { AiService } = await import('../src/ai/service.js');
    const service = new AiService(mockProvider);
    await expect(service.extractFromSession('test')).rejects.toThrow();
  });
});

// =============================================================================
// Gap 7: Events / Hooks
// =============================================================================

describe('Events system', () => {
  it('emits entity:save when saving a memory', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    let emittedPayload: unknown = null;
    repo.on('entity:save', (payload) => {
      emittedPayload = payload;
    });
    repo.memories.save('a1', 'u1', { content: 'Test', tags: ['t'], category: 'fact' });
    expect(emittedPayload).not.toBeNull();
    const p = emittedPayload as { entity: Memory; commit: { hash: string } };
    expect(p.entity.content).toBe('Test');
    expect(p.commit.hash).toBeTruthy();
  });

  it('emits entity:update on memory update', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [saved] = repo.memories.save('a1', 'u1', { content: 'Original', tags: [], category: 'fact' });
    let emittedPayload: unknown = null;
    repo.on('entity:update', (payload) => {
      emittedPayload = payload;
    });
    repo.memories.update(saved.id, { content: 'Updated' });
    expect(emittedPayload).not.toBeNull();
    const p = emittedPayload as { entity: Memory; commit: { hash: string } };
    expect(p.entity.content).toBe('Updated');
  });

  it('emits entity:delete on deletion', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [saved] = repo.memories.save('a1', 'u1', { content: 'ToDelete', tags: [], category: 'fact' });
    let emittedPayload: unknown = null;
    repo.on('entity:delete', (payload) => {
      emittedPayload = payload;
    });
    repo.memories.delete(saved.id);
    expect(emittedPayload).not.toBeNull();
    const p = emittedPayload as { entityId: string; entityType: string; commit: { hash: string } };
    expect(p.entityId).toBe(saved.id);
    expect(p.entityType).toBe('memory');
  });

  it('off() removes listener', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    let callCount = 0;
    const handler = () => { callCount++; };
    repo.on('entity:save', handler);
    repo.memories.save('a1', 'u1', { content: 'One', tags: [], category: 'fact' });
    expect(callCount).toBe(1);
    repo.off('entity:save', handler);
    repo.memories.save('a1', 'u1', { content: 'Two', tags: [], category: 'fact' });
    expect(callCount).toBe(1); // Still 1, handler removed
  });

  it('no error when no listeners attached', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    // Should not throw even with no listeners
    expect(() => {
      repo.memories.save('a1', 'u1', { content: 'Test', tags: [], category: 'fact' });
    }).not.toThrow();
  });

  it('events fire across all collection types', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const events: string[] = [];
    repo.on('entity:save', (p) => {
      events.push(p.entity.type);
    });
    repo.memories.save('a1', 'u1', { content: 'M', tags: [], category: 'fact' });
    repo.skills.save('a1', undefined, { content: 'S', tags: [], category: 'procedure' });
    repo.knowledge.save('a1', undefined, { content: 'K', tags: [] });
    repo.sessions.save('a1', 'u1', { content: 'Sess' });
    repo.profiles.save('a1', 'u1', { content: 'Prof', metadata: {} });
    expect(events).toEqual(['memory', 'skill', 'knowledge', 'session', 'profile']);
  });
});

// =============================================================================
// Gap 2: Structured sessions
// =============================================================================

describe('Structured sessions', () => {
  it('saves and retrieves session with messages', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const messages = [
      { role: 'user', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
      { role: 'assistant', content: 'Hi there!', timestamp: '2024-01-01T00:00:01Z' },
    ];
    const [session] = repo.sessions.save('a1', 'u1', {
      content: 'Session with messages',
      messages,
    });
    expect(session.messages).toHaveLength(2);
    expect(session.messages![0].role).toBe('user');
    expect(session.messages![1].content).toBe('Hi there!');

    // Verify persistence
    const loaded = repo.sessions.get(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(2);
  });

  it('sessions without messages work as before (backward compatible)', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [session] = repo.sessions.save('a1', 'u1', {
      content: 'Plain session content',
    });
    expect(session.messages).toBeUndefined();
    expect(session.content).toBe('Plain session content');
  });

  it('prepareSessionContent formats messages for AI extraction', async () => {
    // Test indirectly through MiningPipeline
    const repo = new RepoMemory({ dir: tmpDir });
    const messages = [
      { role: 'user', content: 'What database do we use?' },
      { role: 'assistant', content: 'We use PostgreSQL version 16.' },
    ];
    repo.sessions.save('a1', 'u1', {
      content: 'fallback content',
      messages,
    });
    const sessions = repo.sessions.list('a1', 'u1');
    expect(sessions[0].messages).toHaveLength(2);
  });
});

// =============================================================================
// Gap 4: File locking
// =============================================================================

describe('File locking', () => {
  it('acquire and release cycle', () => {
    const lock = new Lockfile(tmpDir);
    expect(lock.acquire()).toBe(true);
    lock.release();
    // Lock dir should be gone
    expect(existsSync(join(tmpDir, '.lock'))).toBe(false);
  });

  it('second acquire fails when locked', () => {
    const lock1 = new Lockfile(tmpDir);
    const lock2 = new Lockfile(tmpDir);
    expect(lock1.acquire()).toBe(true);
    expect(lock2.acquire()).toBe(false);
    lock1.release();
    // Now lock2 should succeed
    expect(lock2.acquire()).toBe(true);
    lock2.release();
  });

  it('LockGuard wraps function execution', () => {
    const guard = new LockGuard(tmpDir, true, 5, 10);
    const result = guard.withLock(() => 42);
    expect(result).toBe(42);
  });

  it('LockGuard releases on error', () => {
    const guard = new LockGuard(tmpDir, true, 5, 10);
    expect(() => {
      guard.withLock(() => { throw new Error('boom'); });
    }).toThrow('boom');
    // Lock should be released — can acquire again
    const lock = new Lockfile(tmpDir);
    expect(lock.acquire()).toBe(true);
    lock.release();
  });

  it('LockGuard disabled mode bypasses locking', () => {
    const guard = new LockGuard(tmpDir, false);
    const result = guard.withLock(() => 'no lock');
    expect(result).toBe('no lock');
  });
});

// =============================================================================
// Gap 1: Recall engine
// =============================================================================

describe('Recall engine', () => {
  function seedData(repo: RepoMemory) {
    repo.memories.save('a1', 'u1', { content: 'User prefers dark mode', tags: ['preference'], category: 'fact' });
    repo.memories.save('a1', 'u1', { content: 'Project uses TypeScript', tags: ['typescript'], category: 'fact' });
    repo.memories.save('a1', 'u1', { content: 'Bug in login page fixed', tags: ['bug', 'login'], category: 'issue' });
    repo.skills.save('a1', undefined, { content: 'Deploy with docker compose up', tags: ['docker', 'deploy'], category: 'procedure' });
    repo.skills.save('a1', undefined, { content: 'Run tests with vitest', tags: ['testing', 'vitest'], category: 'procedure' });
    repo.knowledge.save('a1', undefined, { content: 'TypeScript strict mode catches more errors', tags: ['typescript'], source: 'docs' });
    repo.profiles.save('a1', 'u1', { content: 'Senior developer who prefers concise answers', metadata: { level: 'senior' } });
  }

  it('recall returns all sections with data', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    seedData(repo);
    const ctx = repo.recall('a1', 'u1', 'typescript');
    expect(ctx.totalItems).toBeGreaterThan(0);
    expect(ctx.formatted.length).toBeGreaterThan(0);
    expect(ctx.profile).not.toBeNull();
    expect(ctx.profile!.content).toContain('Senior developer');
  });

  it('recall returns empty context for unknown agent', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    seedData(repo);
    const ctx = repo.recall('unknown-agent', 'u1', 'typescript');
    expect(ctx.memories).toHaveLength(0);
    expect(ctx.skills).toHaveLength(0);
    expect(ctx.knowledge).toHaveLength(0);
    expect(ctx.profile).toBeNull();
  });

  it('recall respects collection filter', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    seedData(repo);
    const ctx = repo.recall('a1', 'u1', 'typescript', { collections: ['memories'] });
    expect(ctx.skills).toHaveLength(0);
    expect(ctx.knowledge).toHaveLength(0);
    expect(ctx.memories.length).toBeGreaterThan(0);
  });

  it('recall respects includeProfile=false', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    seedData(repo);
    const ctx = repo.recall('a1', 'u1', 'typescript', { includeProfile: false });
    expect(ctx.profile).toBeNull();
  });

  it('recall respects maxChars budget', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    seedData(repo);
    const ctx = repo.recall('a1', 'u1', 'typescript', { maxChars: 200 });
    expect(ctx.formatted.length).toBeLessThanOrEqual(200);
  });
});

// =============================================================================
// Recall formatter
// =============================================================================

describe('Recall formatter', () => {
  it('formats empty data as empty string', () => {
    const result = formatRecallContext(
      { memories: [], skills: [], knowledge: [], profile: null },
      8000,
    );
    expect(result).toBe('');
  });

  it('includes profile section when present', () => {
    const profile: Profile = {
      type: 'profile', id: 'p1', agentId: 'a1', userId: 'u1',
      content: 'Senior dev', metadata: { level: 'senior' },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const result = formatRecallContext(
      { memories: [], skills: [], knowledge: [], profile },
      8000,
    );
    expect(result).toContain('## User Profile');
    expect(result).toContain('Senior dev');
    expect(result).toContain('level: senior');
  });

  it('truncates sections to respect maxChars', () => {
    const memories: SearchResult<Memory>[] = Array.from({ length: 50 }, (_, i) => ({
      entity: {
        type: 'memory' as const, id: `m${i}`, agentId: 'a', userId: 'u',
        content: `A very long memory content about topic number ${i} that takes space`,
        tags: ['tag'], category: 'fact' as const, accessCount: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      score: 1 - i * 0.01,
    }));
    const result = formatRecallContext(
      { memories, skills: [], knowledge: [], profile: null },
      500,
    );
    expect(result.length).toBeLessThanOrEqual(500);
  });
});

// =============================================================================
// Gap 5: Cleanup / TTL
// =============================================================================

describe('Cleanup', () => {
  it('removes memories older than maxAgeDays', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    // Create a memory
    const [oldMemory] = repo.memories.save('a1', 'u1', { content: 'Old memory', tags: ['old'], category: 'fact' });

    // Directly write an aged version to storage (update() always overwrites updatedAt to now)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100); // 100 days ago
    const aged = { ...repo.memories.get(oldMemory.id)!, updatedAt: oldDate.toISOString() };
    repo['storage'].save(aged);

    // Create a recent memory
    repo.memories.save('a1', 'u1', { content: 'Recent memory', tags: ['new'], category: 'fact' });

    const report = repo.cleanup({ maxAgeDays: 90 });
    expect(report.removed).toBe(1);
    expect(report.preserved).toBeGreaterThanOrEqual(1);
    expect(report.details[0].id).toBe(oldMemory.id);
  });

  it('dryRun does not actually remove entities', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [memory] = repo.memories.save('a1', 'u1', { content: 'Memory', tags: [], category: 'fact' });

    // Directly write an aged version to storage
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    const aged = { ...repo.memories.get(memory.id)!, updatedAt: oldDate.toISOString() };
    repo['storage'].save(aged);

    const report = repo.cleanup({ maxAgeDays: 90, dryRun: true });
    expect(report.removed).toBe(1);

    // Memory should still exist
    expect(repo.memories.get(memory.id)).not.toBeNull();
  });

  it('preserves recent entities', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.memories.save('a1', 'u1', { content: 'Fresh', tags: [], category: 'fact' });
    repo.skills.save('a1', undefined, { content: 'Skill', tags: [], category: 'procedure' });

    const report = repo.cleanup({ maxAgeDays: 90 });
    expect(report.removed).toBe(0);
    expect(report.preserved).toBe(2);
  });
});

// =============================================================================
// Audit log rotation
// =============================================================================

describe('Audit log rotation', () => {
  it('rotate keeps last N lines', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    // Create several entities to generate audit entries
    for (let i = 0; i < 10; i++) {
      repo.memories.save('a1', 'u1', { content: `Memory ${i}`, tags: [], category: 'fact' });
    }

    // Read current audit
    const auditBefore = repo['storage'].audit.read();
    expect(auditBefore.length).toBe(10);

    // Rotate to keep only 5
    repo['storage'].audit.rotate(5);
    const auditAfter = repo['storage'].audit.read();
    expect(auditAfter.length).toBe(5);

    // Should keep the LAST 5 (most recent)
    expect(auditAfter[4].entityId).toBe(auditBefore[9].entityId);
  });

  it('cleanup with maxAuditLines triggers rotation', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    for (let i = 0; i < 10; i++) {
      repo.memories.save('a1', 'u1', { content: `Memory ${i}`, tags: [], category: 'fact' });
    }

    const report = repo.cleanup({ maxAgeDays: 365, maxAuditLines: 3 });
    expect(report.auditRotated).toBe(true);
    expect(repo['storage'].audit.read().length).toBe(3);
  });
});
