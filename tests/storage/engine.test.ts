import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StorageEngine } from '../../src/storage/engine.js';
import type { Memory } from '../../src/types/entities.js';

describe('StorageEngine', () => {
  let dir: string;
  let engine: StorageEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repomemory-test-'));
    const baseDir = join(dir, '.repomemory');
    engine = new StorageEngine(baseDir);
    engine.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  function makeMemory(id: string): Memory {
    return {
      type: 'memory', id, agentId: 'agent1', userId: 'user1',
      content: 'test content', tags: ['test'], category: 'fact',
      accessCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }

  it('initializes with VERSION file', () => {
    expect(engine.isInitialized()).toBe(true);
    expect(engine.getVersion()).toBe('2');
  });

  it('saves and loads entities', () => {
    const mem = makeMemory('mem-1');
    engine.save(mem);
    const loaded = engine.load('mem-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('mem-1');
    expect((loaded as Memory).content).toBe('test content');
  });

  it('deletes entities with tombstone', () => {
    const mem = makeMemory('mem-2');
    engine.save(mem);
    engine.delete(mem);
    expect(engine.load('mem-2')).toBeNull();
  });

  it('preserves history after update', () => {
    const mem = makeMemory('mem-3');
    engine.save(mem);
    const updated = { ...mem, content: 'updated content', updatedAt: new Date().toISOString() };
    engine.save(updated);
    const history = engine.history('mem-3');
    expect(history.length).toBe(2);
  });

  it('lists entities by type', () => {
    engine.save(makeMemory('mem-a'));
    engine.save(makeMemory('mem-b'));
    const list = engine.listEntities('memory', 'agent1', 'user1');
    expect(list.length).toBe(2);
  });

  it('appends to audit log', () => {
    engine.save(makeMemory('mem-audit'));
    const entries = engine.audit.read();
    expect(entries.length).toBe(1);
    expect(entries[0].operation).toBe('create');
  });
});
