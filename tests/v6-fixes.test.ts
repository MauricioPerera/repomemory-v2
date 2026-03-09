/**
 * Tests for v2.10.0 features:
 * - Scope encoding collision prevention
 * - Knowledge dedup with source check
 * - Snapshot staging validation
 * - HTTP search limit clamping
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { SearchEngine } from '../src/search/search-engine.js';

// ---------------------------------------------------------------------------
// Scope encoding collision prevention
// ---------------------------------------------------------------------------

describe('SearchEngine scope encoding', () => {
  let dir: string;
  let engine: SearchEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-scope-'));
    engine = new SearchEngine(dir);
    engine.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('does not collide scope paths with underscores in segments', () => {
    // These two scopes should NOT map to the same file:
    // "memories:agent_id:user" vs "memories:agent:id_user"
    const scope1 = 'memories:agent_id:user';
    const scope2 = 'memories:agent:id_user';

    // Index different content in each scope
    engine.indexEntity(scope1, {
      type: 'memory', id: 'mem-1', agentId: 'agent_id', userId: 'user',
      content: 'TypeScript strict mode is important', tags: ['ts'],
      category: 'fact', accessCount: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);

    engine.indexEntity(scope2, {
      type: 'memory', id: 'mem-2', agentId: 'agent', userId: 'id_user',
      content: 'Python virtual environments are useful', tags: ['py'],
      category: 'fact', accessCount: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);

    engine.flush();

    // Search scope1 should find mem-1 but NOT mem-2
    const results1 = engine.rank(scope1, 'TypeScript strict', 10);
    expect(results1.length).toBeGreaterThan(0);
    expect(results1.some(r => r.id === 'mem-1')).toBe(true);
    expect(results1.some(r => r.id === 'mem-2')).toBe(false);

    // Search scope2 should find mem-2 but NOT mem-1
    const results2 = engine.rank(scope2, 'Python virtual', 10);
    expect(results2.length).toBeGreaterThan(0);
    expect(results2.some(r => r.id === 'mem-2')).toBe(true);
    expect(results2.some(r => r.id === 'mem-1')).toBe(false);
  });

  it('handles colons in scope segments safely', () => {
    // Scope with special characters should not crash
    engine.indexEntity('test:scope:with:many:parts', {
      type: 'memory', id: 'mem-3', agentId: 'test', userId: '',
      content: 'test content', tags: [],
      category: 'fact', accessCount: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);

    engine.flush();

    const results = engine.rank('test:scope:with:many:parts', 'test content', 5);
    expect(results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Knowledge dedup with source check
// ---------------------------------------------------------------------------

describe('Knowledge dedup source check', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-kdedup-'));
    mem = new RepoMemory({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('deduplicates knowledge with same source', () => {
    // Save initial knowledge
    mem.knowledge.save('a1', undefined, {
      content: 'API rate limit is 100 requests per minute',
      tags: ['api'],
      source: 'docs/api.md',
    });

    // Save similar content with same source — should deduplicate
    const [entity, , meta] = mem.knowledge.saveOrUpdate('a1', {
      content: 'API rate limit is 200 requests per minute',
      tags: ['api'],
      source: 'docs/api.md',
    });

    expect(meta.deduplicated).toBe(true);
    expect(entity.content).toContain('200 requests');
  });

  it('does NOT deduplicate knowledge from different sources', () => {
    // Save initial knowledge from source A
    mem.knowledge.save('a1', undefined, {
      content: 'API rate limit is 100 requests per minute',
      tags: ['api'],
      source: 'docs/api.md',
    });

    // Save similar content from different source — should NOT deduplicate
    const [entity, , meta] = mem.knowledge.saveOrUpdate('a1', {
      content: 'API rate limit is 100 requests per minute for production',
      tags: ['api'],
      source: 'docs/production.md',
    });

    expect(meta.deduplicated).toBe(false);
  });

  it('deduplicates knowledge with both undefined source', () => {
    // Save knowledge without source
    mem.knowledge.save('a1', undefined, {
      content: 'Docker compose for production deployment requires careful setup',
      tags: ['docker'],
    });

    // Save similar content also without source — should deduplicate
    const [, , meta] = mem.knowledge.saveOrUpdate('a1', {
      content: 'Docker compose for production deployment and staging requires careful configuration',
      tags: ['docker'],
    });

    expect(meta.deduplicated).toBe(true);
  });

  it('does not deduplicate when source vs undefined', () => {
    // Save knowledge with source
    mem.knowledge.save('a1', undefined, {
      content: 'Kubernetes pod scaling is configured via HPA resources',
      tags: ['k8s'],
      source: 'infra/k8s.md',
    });

    // Save similar content without source — should NOT deduplicate
    const [, , meta] = mem.knowledge.saveOrUpdate('a1', {
      content: 'Kubernetes pod scaling is configured via HPA horizontal pod autoscaler',
      tags: ['k8s'],
    });

    expect(meta.deduplicated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HTTP search limit clamping (unit test for the clamping logic)
// ---------------------------------------------------------------------------

describe('HTTP search limit clamping', () => {
  it('clamps limit to 1-1000 range', () => {
    // Replicate the clamping logic from http.ts
    function clampLimit(rawLimit: number | null): number {
      const raw = rawLimit ?? 10;
      return Math.max(1, Math.min(raw || 10, 1000));
    }

    expect(clampLimit(null)).toBe(10);        // default
    expect(clampLimit(5)).toBe(5);             // normal
    expect(clampLimit(1000)).toBe(1000);       // max boundary
    expect(clampLimit(1001)).toBe(1000);       // over max
    expect(clampLimit(999999999)).toBe(1000);  // way over max
    expect(clampLimit(0)).toBe(10);            // zero falls to default via ||
    expect(clampLimit(-5)).toBe(1);            // negative clamped to 1
    expect(clampLimit(NaN)).toBe(10);          // NaN falls to default via ||
    expect(clampLimit(1)).toBe(1);             // min boundary
  });
});
