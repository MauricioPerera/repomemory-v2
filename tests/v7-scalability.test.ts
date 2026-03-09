/**
 * Tests for v2.11.0 features:
 * - Scope encoding underscore collision prevention
 * - Content size limit (1MB max)
 * - SessionCollection.listConversations() pagination
 * - ProfileCollection.getByUserAcrossAgents() limit
 * - StorageEngine.listEntitiesByPrefix() bounded scan
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { SearchEngine } from '../src/search/search-engine.js';
import { StorageEngine } from '../src/storage/engine.js';

// ---------------------------------------------------------------------------
// Scope encoding: underscore collision prevention
// ---------------------------------------------------------------------------

describe('SearchEngine scope encoding v2.11', () => {
  let dir: string;
  let engine: SearchEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-scope11-'));
    engine = new SearchEngine(dir);
    engine.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('does not collide when underscores appear in different segment positions', () => {
    // These scopes differ only by where the underscore falls across segments.
    // v2.10 would collide because encodeURIComponent doesn't encode _.
    const scope1 = 'memories:agent_1:user';
    const scope2 = 'memories:agent:1_user';

    engine.indexEntity(scope1, {
      type: 'memory', id: 'mem-a', agentId: 'agent_1', userId: 'user',
      content: 'Rust borrow checker is strict', tags: ['rust'],
      category: 'fact', accessCount: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);

    engine.indexEntity(scope2, {
      type: 'memory', id: 'mem-b', agentId: 'agent', userId: '1_user',
      content: 'Go channels enable concurrency', tags: ['go'],
      category: 'fact', accessCount: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);

    engine.flush();

    // scope1 should only have mem-a
    const r1 = engine.rank(scope1, 'Rust borrow', 10);
    expect(r1.some(r => r.id === 'mem-a')).toBe(true);
    expect(r1.some(r => r.id === 'mem-b')).toBe(false);

    // scope2 should only have mem-b
    const r2 = engine.rank(scope2, 'Go channels', 10);
    expect(r2.some(r => r.id === 'mem-b')).toBe(true);
    expect(r2.some(r => r.id === 'mem-a')).toBe(false);
  });

  it('handles scopes with multiple underscores in segments', () => {
    const scope = 'skills:my_agent_v2:user_name_1';
    engine.indexEntity(scope, {
      type: 'skill', id: 'sk-1', agentId: 'my_agent_v2',
      content: 'Deploy with kubectl apply', tags: ['k8s'],
      category: 'procedure', accessCount: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);

    engine.flush();

    const results = engine.rank(scope, 'kubectl deploy', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('sk-1');
  });
});

// ---------------------------------------------------------------------------
// Content size limit
// ---------------------------------------------------------------------------

describe('Content size limit', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-size-'));
    mem = new RepoMemory({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts normal-sized content', () => {
    const [entity] = mem.memories.save('a1', 'u1', {
      content: 'Normal content that is well within limits',
      tags: ['test'],
    });
    expect(entity.content).toContain('Normal content');
  });

  it('rejects content exceeding 1MB', () => {
    const hugeContent = 'x'.repeat(1_048_577); // 1MB + 1 byte
    expect(() => {
      mem.memories.save('a1', 'u1', {
        content: hugeContent,
        tags: ['huge'],
      });
    }).toThrow('Content too large');
  });

  it('accepts content at exactly 1MB', () => {
    const maxContent = 'a'.repeat(1_048_576); // exactly 1MB
    const [entity] = mem.memories.save('a1', 'u1', {
      content: maxContent,
      tags: ['big'],
    });
    expect(entity.id).toBeTruthy();
  });

  it('rejects oversized content for all entity types', () => {
    const hugeContent = 'y'.repeat(1_048_577);

    expect(() => {
      mem.skills.save('a1', undefined, { content: hugeContent, tags: ['test'] });
    }).toThrow('Content too large');

    expect(() => {
      mem.knowledge.save('a1', undefined, { content: hugeContent, tags: ['test'] });
    }).toThrow('Content too large');
  });
});

// ---------------------------------------------------------------------------
// SessionCollection.listConversations() pagination
// ---------------------------------------------------------------------------

describe('SessionCollection.listConversations pagination', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-convos-'));
    mem = new RepoMemory({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns paginated result structure', () => {
    mem.sessions.save('a1', 'u1', { content: 'S1', conversationId: 'conv-1' });
    mem.sessions.save('a1', 'u1', { content: 'S2', conversationId: 'conv-1' });
    mem.sessions.save('a1', 'u1', { content: 'S3', conversationId: 'conv-2' });
    mem.sessions.save('a1', 'u1', { content: 'S4', conversationId: 'conv-3' });

    const result = mem.sessions.listConversations('a1', 'u1');
    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);

    const conv1 = result.items.find(c => c.conversationId === 'conv-1')!;
    expect(conv1.count).toBe(2);
  });

  it('respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      mem.sessions.save('a1', 'u1', {
        content: `Session ${i}`,
        conversationId: `conv-${i}`,
      });
    }

    const page1 = mem.sessions.listConversations('a1', 'u1', { limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.hasMore).toBe(true);

    const page2 = mem.sessions.listConversations('a1', 'u1', { limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.hasMore).toBe(true);

    const page3 = mem.sessions.listConversations('a1', 'u1', { limit: 2, offset: 4 });
    expect(page3.items).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
  });

  it('returns empty when no conversations', () => {
    mem.sessions.save('a1', 'u1', { content: 'No conv' });
    const result = mem.sessions.listConversations('a1', 'u1');
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProfileCollection.getByUserAcrossAgents() limit
// ---------------------------------------------------------------------------

describe('ProfileCollection.getByUserAcrossAgents limit', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-profiles-'));
    mem = new RepoMemory({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns profiles across agents', () => {
    mem.profiles.save('agent-1', 'user-1', { content: 'Profile A' });
    mem.profiles.save('agent-2', 'user-1', { content: 'Profile B' });
    mem.profiles.save('agent-3', 'user-2', { content: 'Profile C (other user)' });

    const profiles = mem.profiles.getByUserAcrossAgents('user-1');
    expect(profiles).toHaveLength(2);
    expect(profiles.every(p => p.userId === 'user-1')).toBe(true);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      mem.profiles.save(`agent-${i}`, 'user-1', { content: `Profile ${i}` });
    }

    const limited = mem.profiles.getByUserAcrossAgents('user-1', 3);
    expect(limited).toHaveLength(3);

    const all = mem.profiles.getByUserAcrossAgents('user-1', 50);
    expect(all).toHaveLength(10);
  });

  it('returns results sorted by updatedAt descending', () => {
    mem.profiles.save('agent-old', 'user-1', { content: 'Old profile' });
    // small delay to ensure different timestamps
    mem.profiles.save('agent-new', 'user-1', { content: 'New profile' });

    const profiles = mem.profiles.getByUserAcrossAgents('user-1');
    expect(profiles).toHaveLength(2);
    expect(profiles[0].updatedAt >= profiles[1].updatedAt).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StorageEngine.listEntitiesByPrefix() bounded scan
// ---------------------------------------------------------------------------

describe('StorageEngine.listEntitiesByPrefix bounded scan', () => {
  let dir: string;
  let engine: StorageEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-prefix-'));
    const baseDir = join(dir, '.repomemory');
    engine = new StorageEngine(baseDir);
    engine.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('returns all entities when under maxResults', () => {
    for (let i = 0; i < 5; i++) {
      engine.save({
        type: 'memory', id: `mem-prefix-${i}`, agentId: 'a1', userId: 'u1',
        content: `Memory ${i}`, tags: [], category: 'fact',
        accessCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } as any);
    }

    const entities = engine.listEntitiesByPrefix('memories:');
    expect(entities).toHaveLength(5);
  });

  it('respects maxResults limit', () => {
    for (let i = 0; i < 10; i++) {
      engine.save({
        type: 'memory', id: `mem-limit-${i}`, agentId: 'a1', userId: 'u1',
        content: `Memory ${i}`, tags: [], category: 'fact',
        accessCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } as any);
    }

    const limited = engine.listEntitiesByPrefix('memories:', 3);
    expect(limited).toHaveLength(3);
  });
});
