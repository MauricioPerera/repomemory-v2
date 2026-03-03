import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ObjectStore } from '../../src/storage/object-store.js';

describe('ObjectStore', () => {
  let dir: string;
  let store: ObjectStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repomemory-test-'));
    store = new ObjectStore(dir);
    store.init();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('writes and reads objects', () => {
    const hash = store.write('memory', { content: 'test' });
    expect(hash).toHaveLength(64);
    const obj = store.read(hash);
    expect(obj.type).toBe('memory');
    expect(obj.data).toEqual({ content: 'test' });
  });

  it('deduplicates identical objects', () => {
    const hash1 = store.write('memory', { content: 'test' });
    const hash2 = store.write('memory', { content: 'test' });
    expect(hash1).toBe(hash2);
  });

  it('verifies hash integrity', () => {
    const hash = store.write('memory', { content: 'test' });
    expect(store.verify(hash)).toBe(true);
  });

  it('throws on missing object', () => {
    expect(() => store.read('nonexistent')).toThrow();
  });

  it('lists all objects', () => {
    store.write('memory', { content: 'a' });
    store.write('memory', { content: 'b' });
    const all = store.listAll();
    expect(all.length).toBe(2);
  });
});
