import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RefStore } from '../../src/storage/ref-store.js';

describe('RefStore', () => {
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

  it('sets and gets refs', () => {
    store.set('memories/agent1/user1/mem1.ref', 'commit123');
    const ref = store.get('memories/agent1/user1/mem1.ref');
    expect(ref).not.toBeNull();
    expect(ref!.head).toBe('commit123');
  });

  it('preserves created date on update', () => {
    store.set('test/a.ref', 'c1');
    const ref1 = store.get('test/a.ref');
    store.set('test/a.ref', 'c2');
    const ref2 = store.get('test/a.ref');
    expect(ref2!.head).toBe('c2');
    expect(ref2!.created).toBe(ref1!.created);
  });

  it('deletes refs', () => {
    store.set('test/a.ref', 'c1');
    expect(store.delete('test/a.ref')).toBe(true);
    expect(store.get('test/a.ref')).toBeNull();
  });

  it('lists refs by prefix', () => {
    store.set('memories/a1/u1/m1.ref', 'c1');
    store.set('memories/a1/u1/m2.ref', 'c2');
    store.set('skills/a1/s1.ref', 'c3');
    const memRefs = store.list('memories/a1/u1');
    expect(memRefs.length).toBe(2);
  });
});
