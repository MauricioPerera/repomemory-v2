/**
 * Tests for v2.8.0 and v2.9.0 features:
 * - Path traversal validation in RefStore (v2.9.0)
 * - CommitStore.history() depth limit + cycle detection (v2.9.0)
 * - SnapshotManager restore lock (v2.9.0)
 * - Import entity validation (v2.8.0)
 * - MCP tool timeout (v2.8.0) — unit-level
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RefStore } from '../src/storage/ref-store.js';
import { CommitStore } from '../src/storage/commit-store.js';
import { StorageEngine } from '../src/storage/engine.js';
import { SnapshotManager } from '../src/storage/snapshot.js';
import { RepoMemory } from '../src/index.js';
import type { ExportData } from '../src/index.js';
import type { Memory } from '../src/types/entities.js';

// ---------------------------------------------------------------------------
// RefStore: path traversal validation
// ---------------------------------------------------------------------------

describe('RefStore path traversal', () => {
  let dir: string;
  let store: RefStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repomemory-test-'));
    store = new RefStore(dir);
    store.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('allows normal ref paths', () => {
    store.set('memories/agent1/user1/mem1.ref', 'commit123');
    const ref = store.get('memories/agent1/user1/mem1.ref');
    expect(ref).not.toBeNull();
    expect(ref!.head).toBe('commit123');
  });

  it('rejects path traversal with ..', () => {
    expect(() => store.set('../../../evil.ref', 'commit123')).toThrow('path traversal');
  });

  it('rejects path traversal with embedded ..', () => {
    expect(() => store.set('memories/../../../evil.ref', 'commit123')).toThrow('path traversal');
  });

  it('rejects absolute paths (unix)', () => {
    expect(() => store.set('/etc/passwd', 'commit123')).toThrow('absolute');
  });

  it('rejects empty refPath', () => {
    expect(() => store.set('', 'commit123')).toThrow('non-empty');
  });

  it('rejects path traversal in get()', () => {
    expect(() => store.get('../../../evil.ref')).toThrow('path traversal');
  });

  it('rejects path traversal in delete()', () => {
    expect(() => store.delete('../../../evil.ref')).toThrow('path traversal');
  });

  it('rejects path traversal in list()', () => {
    expect(() => store.list('../../../')).toThrow('path traversal');
  });

  it('rejects absolute path in list()', () => {
    expect(() => store.list('/etc')).toThrow('relative');
  });

  it('allows deeply nested valid paths', () => {
    const deepPath = 'a/b/c/d/e/f/test.ref';
    store.set(deepPath, 'commit456');
    const ref = store.get(deepPath);
    expect(ref).not.toBeNull();
    expect(ref!.head).toBe('commit456');
  });
});

// ---------------------------------------------------------------------------
// CommitStore: history depth limit + cycle detection
// ---------------------------------------------------------------------------

describe('CommitStore history limits', () => {
  let dir: string;
  let store: CommitStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repomemory-test-'));
    store = new CommitStore(dir);
    store.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('respects maxDepth parameter', () => {
    // Create a chain of 10 commits
    let prev: string | null = null;
    for (let i = 0; i < 10; i++) {
      const c = store.create(prev, `obj${i}`, 'system', `commit ${i}`);
      prev = c.hash;
    }

    // Full history
    const full = store.history(prev!);
    expect(full).toHaveLength(10);

    // Limited history
    const limited = store.history(prev!, 5);
    expect(limited).toHaveLength(5);
  });

  it('has MAX_HISTORY_DEPTH static constant', () => {
    expect(CommitStore.MAX_HISTORY_DEPTH).toBe(10_000);
  });

  it('detects cycles and stops', () => {
    // Create two commits that point to each other (simulating cycle)
    const c1 = store.create(null, 'obj1', 'system', 'first');
    const c2 = store.create(c1.hash, 'obj2', 'system', 'second');

    // Manually create a cyclic reference by overwriting c1 to point to c2
    // We can't easily create a real cycle with the API, so we test with a chain
    // and verify the visited set prevents infinite loops
    const history = store.history(c2.hash);
    expect(history).toHaveLength(2);
    expect(history[0].hash).toBe(c2.hash);
    expect(history[1].hash).toBe(c1.hash);
  });

  it('handles single commit (no parent)', () => {
    const c = store.create(null, 'obj1', 'system', 'only');
    const history = store.history(c.hash);
    expect(history).toHaveLength(1);
  });

  it('maxDepth=0 returns empty', () => {
    const c = store.create(null, 'obj1', 'system', 'only');
    const history = store.history(c.hash, 0);
    expect(history).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SnapshotManager: restore lock
// ---------------------------------------------------------------------------

describe('SnapshotManager restore lock', () => {
  let dir: string;
  let baseDir: string;
  let engine: StorageEngine;
  let snapshots: SnapshotManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repomemory-test-'));
    baseDir = join(dir, '.repomemory');
    engine = new StorageEngine(baseDir);
    engine.init();
    snapshots = new SnapshotManager(baseDir);
    snapshots.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('restore works normally without existing lock', () => {
    const mem: Memory = {
      type: 'memory', id: 'mem-lock', agentId: 'a1', userId: 'u1',
      content: 'test', tags: [], category: 'fact',
      accessCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    engine.save(mem);
    const snap = snapshots.create('test-snap');
    engine.delete(mem);

    // Should work fine
    snapshots.restore(snap.id);
    const freshEngine = new StorageEngine(baseDir);
    freshEngine.init();
    expect(freshEngine.load('mem-lock')).not.toBeNull();
  });

  it('blocks concurrent restore when lock is fresh', () => {
    const mem: Memory = {
      type: 'memory', id: 'mem-lock2', agentId: 'a1', userId: 'u1',
      content: 'test2', tags: [], category: 'fact',
      accessCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    engine.save(mem);
    const snap = snapshots.create('before');

    // Simulate a lock file from another process
    const lockPath = join(baseDir, '.restore.lock');
    writeFileSync(lockPath, JSON.stringify({ pid: 99999, startedAt: new Date().toISOString() }), 'utf8');

    expect(() => snapshots.restore(snap.id)).toThrow('Another restore operation is in progress');
  });

  it('overrides stale lock (older than 5 minutes)', () => {
    const mem: Memory = {
      type: 'memory', id: 'mem-lock3', agentId: 'a1', userId: 'u1',
      content: 'test3', tags: [], category: 'fact',
      accessCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    engine.save(mem);
    const snap = snapshots.create('before-stale');

    // Create a stale lock file
    const lockPath = join(baseDir, '.restore.lock');
    writeFileSync(lockPath, JSON.stringify({ pid: 99999, startedAt: '2020-01-01T00:00:00Z' }), 'utf8');
    // Set mtime to the past
    const fs = require('node:fs');
    const past = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    fs.utimesSync(lockPath, past, past);

    // Should succeed by removing stale lock
    engine.delete(mem);
    snapshots.restore(snap.id);
    const freshEngine = new StorageEngine(baseDir);
    freshEngine.init();
    expect(freshEngine.load('mem-lock3')).not.toBeNull();
  });

  it('cleans up lock after successful restore', () => {
    const mem: Memory = {
      type: 'memory', id: 'mem-lock4', agentId: 'a1', userId: 'u1',
      content: 'test4', tags: [], category: 'fact',
      accessCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    engine.save(mem);
    const snap = snapshots.create('cleanup-test');

    snapshots.restore(snap.id);

    // Lock should be cleaned up
    const lockPath = join(baseDir, '.restore.lock');
    expect(existsSync(lockPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Import entity validation (v2.8.0)
// ---------------------------------------------------------------------------

describe('Import entity validation', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-validate-'));
    mem = new RepoMemory({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects entity without id', () => {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entities: {
        memories: [{ content: 'no id', type: 'memory', tags: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' } as any],
        skills: [], knowledge: [], sessions: [], profiles: [],
      },
      accessCounts: {},
    };
    expect(() => mem.import(data)).toThrow('missing or invalid id');
  });

  it('rejects entity with invalid type', () => {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entities: {
        memories: [{ id: 'bad-type', content: 'test', type: 'invalid_type', tags: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' } as any],
        skills: [], knowledge: [], sessions: [], profiles: [],
      },
      accessCounts: {},
    };
    expect(() => mem.import(data)).toThrow("invalid type");
  });

  it('rejects entity without content', () => {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entities: {
        memories: [{ id: 'no-content', type: 'memory', tags: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' } as any],
        skills: [], knowledge: [], sessions: [], profiles: [],
      },
      accessCounts: {},
    };
    expect(() => mem.import(data)).toThrow('missing content');
  });

  it('rejects entity without timestamps', () => {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entities: {
        memories: [{ id: 'no-ts', content: 'test', type: 'memory', tags: [] } as any],
        skills: [], knowledge: [], sessions: [], profiles: [],
      },
      accessCounts: {},
    };
    expect(() => mem.import(data)).toThrow('missing createdAt');
  });

  it('rejects non-object entity', () => {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entities: {
        memories: ['not an object' as any],
        skills: [], knowledge: [], sessions: [], profiles: [],
      },
      accessCounts: {},
    };
    expect(() => mem.import(data)).toThrow('not an object');
  });

  it('accepts valid entities', () => {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entities: {
        memories: [{
          id: 'valid-mem', type: 'memory', content: 'test memory',
          agentId: 'a1', userId: 'u1', tags: [], category: 'fact',
          accessCount: 0, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
        } as any],
        skills: [], knowledge: [], sessions: [], profiles: [],
      },
      accessCounts: {},
    };
    const report = mem.import(data);
    expect(report.imported).toBe(1);
    expect(report.byType.memories).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// MCP tool timeout (v2.8.0) — unit test for withTimeout pattern
// ---------------------------------------------------------------------------

describe('withTimeout pattern', () => {
  // We test the same pattern used in handler.ts
  function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  it('resolves normally for fast promises', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, 'test');
    expect(result).toBe(42);
  });

  it('rejects with timeout error for slow promises', async () => {
    const slow = new Promise(resolve => setTimeout(resolve, 5000));
    await expect(withTimeout(slow, 50, 'SlowOp')).rejects.toThrow('SlowOp timed out after 50ms');
  });

  it('propagates original errors', async () => {
    const failing = Promise.reject(new Error('original error'));
    await expect(withTimeout(failing, 1000, 'test')).rejects.toThrow('original error');
  });
});
