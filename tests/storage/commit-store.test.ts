import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommitStore } from '../../src/storage/commit-store.js';

describe('CommitStore', () => {
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

  it('creates and reads commits', () => {
    const commit = store.create(null, 'obj123', 'system', 'initial');
    expect(commit.hash).toHaveLength(64);
    expect(commit.parent).toBeNull();
    const read = store.read(commit.hash);
    expect(read.objectHash).toBe('obj123');
  });

  it('chains commits', () => {
    const c1 = store.create(null, 'obj1', 'system', 'first');
    const c2 = store.create(c1.hash, 'obj2', 'system', 'second');
    const chain = store.history(c2.hash);
    expect(chain).toHaveLength(2);
    expect(chain[0].hash).toBe(c2.hash);
    expect(chain[1].hash).toBe(c1.hash);
  });

  it('lists all commits', () => {
    store.create(null, 'obj1', 'system', 'a');
    store.create(null, 'obj2', 'system', 'b');
    expect(store.listAll().length).toBe(2);
  });
});
