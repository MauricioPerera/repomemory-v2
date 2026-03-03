import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';

describe('RepoMemory', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repomemory-test-'));
    mem = new RepoMemory({ dir: join(dir, '.repomemory') });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  describe('memories', () => {
    it('saves and retrieves', () => {
      const [saved] = mem.memories.save('agent-1', 'user-1', {
        content: 'User prefers TypeScript strict mode',
        tags: ['preferences', 'typescript'],
        category: 'fact',
      });
      expect(saved.id).toMatch(/^memory-/);
      const loaded = mem.memories.get(saved.id);
      expect(loaded!.content).toBe('User prefers TypeScript strict mode');
    });

    it('searches', () => {
      mem.memories.save('a1', 'u1', { content: 'TypeScript strict mode config', tags: ['ts'] });
      mem.memories.save('a1', 'u1', { content: 'Python data analysis', tags: ['python'] });
      const results = mem.memories.search('a1', 'u1', 'TypeScript');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entity.content).toContain('TypeScript');
    });

    it('deletes', () => {
      const [saved] = mem.memories.save('a1', 'u1', { content: 'temp' });
      mem.memories.delete(saved.id);
      expect(mem.memories.get(saved.id)).toBeNull();
    });

    it('shows history', () => {
      const [saved] = mem.memories.save('a1', 'u1', { content: 'v1' });
      mem.memories.update(saved.id, { content: 'v2' });
      const history = mem.memories.history(saved.id);
      expect(history.length).toBe(2);
    });

    it('shows history after delete', () => {
      const [saved] = mem.memories.save('a1', 'u1', { content: 'v1' });
      mem.memories.update(saved.id, { content: 'v2' });
      mem.memories.delete(saved.id);
      const history = mem.memories.history(saved.id);
      expect(history.length).toBe(3);
      expect(history[0].message).toBe('delete memory');
    });

    it('search does not generate extra commits', () => {
      mem.memories.save('a1', 'u1', { content: 'TypeScript config tips', tags: ['ts'] });
      mem.memories.save('a1', 'u1', { content: 'TypeScript testing patterns', tags: ['ts'] });
      const commitsBefore = mem.stats().commits;
      mem.memories.search('a1', 'u1', 'TypeScript');
      const commitsAfter = mem.stats().commits;
      expect(commitsAfter).toBe(commitsBefore);
    });

    it('tracks access counts via side-index', () => {
      const [saved] = mem.memories.save('a1', 'u1', { content: 'TypeScript patterns', tags: ['ts'] });
      mem.memories.search('a1', 'u1', 'TypeScript');
      mem.memories.search('a1', 'u1', 'TypeScript');
      const loaded = mem.memories.get(saved.id);
      expect(loaded!.accessCount).toBe(2);
    });
  });

  describe('skills', () => {
    it('saves and retrieves', () => {
      const [saved] = mem.skills.save('a1', undefined, { content: 'How to deploy', tags: ['deploy'] });
      expect(saved.type).toBe('skill');
      expect(mem.skills.get(saved.id)!.content).toBe('How to deploy');
    });
  });

  describe('knowledge', () => {
    it('saves and retrieves', () => {
      const [saved] = mem.knowledge.save('a1', undefined, { content: 'API docs chunk', tags: ['api'], source: 'docs.md' });
      expect(saved.type).toBe('knowledge');
    });
  });

  describe('sessions', () => {
    it('saves and marks mined', () => {
      const [saved] = mem.sessions.save('a1', 'u1', { content: 'Session transcript' });
      expect(saved.mined).toBe(false);
      mem.sessions.markMined(saved.id);
      const loaded = mem.sessions.get(saved.id);
      expect(loaded!.mined).toBe(true);
    });
  });

  describe('profiles', () => {
    it('saves and retrieves by user', () => {
      mem.profiles.save('a1', 'u1', { content: 'Prefers dark mode' });
      const profile = mem.profiles.getByUser('a1', 'u1');
      expect(profile!.content).toBe('Prefers dark mode');
    });
  });

  describe('snapshots', () => {
    it('creates and lists', () => {
      const snap = mem.snapshot('test');
      expect(snap.label).toBe('test');
      expect(mem.listSnapshots().length).toBe(1);
    });
  });

  describe('verify', () => {
    it('verifies storage integrity', () => {
      mem.memories.save('a1', 'u1', { content: 'test' });
      const result = mem.verify();
      expect(result.valid).toBe(true);
      expect(result.totalObjects).toBeGreaterThan(0);
    });
  });

  describe('stats', () => {
    it('returns counts', () => {
      mem.memories.save('a1', 'u1', { content: 'test' });
      const s = mem.stats();
      expect(s.memories).toBe(1);
      expect(s.objects).toBeGreaterThan(0);
    });
  });

  describe('flush', () => {
    it('is callable as public method', () => {
      mem.memories.save('a1', 'u1', { content: 'test' });
      expect(() => mem.flush()).not.toThrow();
    });
  });

  describe('mine without AI', () => {
    it('throws when AI not configured', async () => {
      await expect(mem.mine('nonexistent')).rejects.toThrow('AI provider required');
    });
  });
});
