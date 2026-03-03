import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StorageEngine } from '../../src/storage/engine.js';
import { SnapshotManager } from '../../src/storage/snapshot.js';
import type { Memory } from '../../src/types/entities.js';

describe('SnapshotManager', () => {
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

  it('creates and lists snapshots', () => {
    const snap = snapshots.create('test-snap');
    expect(snap.label).toBe('test-snap');
    const list = snapshots.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(snap.id);
  });

  it('restores snapshots', () => {
    const mem: Memory = {
      type: 'memory', id: 'mem-snap', agentId: 'a1', userId: 'u1',
      content: 'before', tags: [], category: 'fact',
      accessCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    engine.save(mem);
    const snap = snapshots.create('before-change');

    // Delete the entity
    engine.delete(mem);
    expect(engine.load('mem-snap')).toBeNull();

    // Restore snapshot, then create fresh engine (in-memory caches are stale)
    snapshots.restore(snap.id);
    const freshEngine = new StorageEngine(baseDir);
    freshEngine.init();
    const loaded = freshEngine.load('mem-snap');
    expect(loaded).not.toBeNull();
    expect((loaded as Memory).content).toBe('before');
  });
});
