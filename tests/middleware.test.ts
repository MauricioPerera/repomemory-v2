import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import type { Middleware } from '../src/index.js';

describe('Middleware', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-middleware-'));
    mem = new RepoMemory({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('beforeSave', () => {
    it('transforms entity on save', () => {
      const autoTag: Middleware = {
        beforeSave(entity) {
          if (entity.type === 'memory' && 'tags' in entity) {
            return { ...entity, tags: [...entity.tags, 'auto-tagged'] };
          }
          return entity;
        },
      };
      mem.use(autoTag);

      const [saved] = mem.memories.save('a1', 'u1', { content: 'test', tags: ['original'] });
      expect(saved.tags).toContain('auto-tagged');
      expect(saved.tags).toContain('original');
    });

    it('cancels save when returning null', () => {
      const blocker: Middleware = {
        beforeSave(entity) {
          if (entity.type === 'memory' && 'content' in entity && (entity.content as string).includes('blocked')) {
            return null;
          }
          return entity;
        },
      };
      mem.use(blocker);

      expect(() => {
        mem.memories.save('a1', 'u1', { content: 'this is blocked content' });
      }).toThrow('cancelled by middleware');

      // Normal saves still work
      const [saved] = mem.memories.save('a1', 'u1', { content: 'allowed content' });
      expect(saved.content).toBe('allowed content');
    });

    it('runs multiple middleware in order', () => {
      const order: string[] = [];

      mem.use({
        beforeSave(entity) {
          order.push('first');
          if (entity.type === 'memory' && 'tags' in entity) {
            return { ...entity, tags: [...entity.tags, 'mw1'] };
          }
          return entity;
        },
      });

      mem.use({
        beforeSave(entity) {
          order.push('second');
          if (entity.type === 'memory' && 'tags' in entity) {
            return { ...entity, tags: [...entity.tags, 'mw2'] };
          }
          return entity;
        },
      });

      const [saved] = mem.memories.save('a1', 'u1', { content: 'test', tags: [] });
      expect(saved.tags).toEqual(['mw1', 'mw2']);
      expect(order).toEqual(['first', 'second']);
    });

    it('short-circuits chain when middleware returns null', () => {
      const called: string[] = [];

      mem.use({
        beforeSave() {
          called.push('first');
          return null; // cancel
        },
      });

      mem.use({
        beforeSave(entity) {
          called.push('second'); // should never run
          return entity;
        },
      });

      expect(() => {
        mem.memories.save('a1', 'u1', { content: 'test' });
      }).toThrow('cancelled by middleware');
      expect(called).toEqual(['first']);
    });

    it('applies to saveMany (skips cancelled items)', () => {
      mem.use({
        beforeSave(entity) {
          if (entity.type === 'memory' && 'content' in entity && (entity.content as string).includes('skip')) {
            return null;
          }
          return entity;
        },
      });

      const results = mem.memories.saveMany([
        { agentId: 'a1', userId: 'u1', input: { content: 'keep this' } },
        { agentId: 'a1', userId: 'u1', input: { content: 'skip this' } },
        { agentId: 'a1', userId: 'u1', input: { content: 'keep this too' } },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0][0].content).toBe('keep this');
      expect(results[1][0].content).toBe('keep this too');
    });

    it('works with skills and knowledge', () => {
      mem.use({
        beforeSave(entity) {
          if ('tags' in entity) {
            return { ...entity, tags: [...(entity.tags as string[]), 'global-tag'] };
          }
          return entity;
        },
      });

      const [skill] = mem.skills.save('a1', undefined, { content: 'skill', tags: [] });
      const [knowledge] = mem.knowledge.save('a1', undefined, { content: 'knowledge', tags: [] });

      expect(skill.tags).toContain('global-tag');
      expect(knowledge.tags).toContain('global-tag');
    });
  });

  describe('beforeUpdate', () => {
    it('transforms updates', () => {
      const [saved] = mem.memories.save('a1', 'u1', { content: 'original', tags: ['t1'] });

      mem.use({
        beforeUpdate(_entity, updates) {
          if ('content' in updates && typeof updates.content === 'string') {
            return { ...updates, content: updates.content.toUpperCase() };
          }
          return updates;
        },
      });

      const [updated] = mem.memories.update(saved.id, { content: 'modified' });
      expect(updated.content).toBe('MODIFIED');
    });

    it('cancels update when returning null', () => {
      const [saved] = mem.memories.save('a1', 'u1', { content: 'original', tags: ['t1'] });

      mem.use({
        beforeUpdate(_entity, updates) {
          if ('content' in updates && (updates.content as string).includes('forbidden')) {
            return null;
          }
          return updates;
        },
      });

      expect(() => {
        mem.memories.update(saved.id, { content: 'forbidden change' });
      }).toThrow('cancelled by middleware');

      // Entity unchanged
      const entity = mem.memories.get(saved.id);
      expect(entity!.content).toBe('original');
    });

    it('receives existing entity for context', () => {
      const [saved] = mem.memories.save('a1', 'u1', { content: 'original', tags: ['important'] });

      mem.use({
        beforeUpdate(entity, updates) {
          // Prevent modifying important entities
          if ('tags' in entity && (entity.tags as string[]).includes('important')) {
            return null;
          }
          return updates;
        },
      });

      expect(() => {
        mem.memories.update(saved.id, { content: 'new content' });
      }).toThrow('cancelled by middleware');
    });
  });

  describe('beforeDelete', () => {
    it('prevents deletion when returning false', () => {
      const [saved] = mem.memories.save('a1', 'u1', { content: 'protected', tags: [] });

      mem.use({
        beforeDelete(_entityId, entityType) {
          return entityType !== 'memory'; // block memory deletions
        },
      });

      expect(() => {
        mem.memories.delete(saved.id);
      }).toThrow('cancelled by middleware');

      // Entity still exists
      expect(mem.memories.get(saved.id)).not.toBeNull();
    });

    it('allows deletion when returning true', () => {
      const [saved] = mem.memories.save('a1', 'u1', { content: 'deletable', tags: [] });

      mem.use({
        beforeDelete() {
          return true;
        },
      });

      const commit = mem.memories.delete(saved.id);
      expect(commit.message).toContain('delete');
      expect(mem.memories.get(saved.id)).toBeNull();
    });

    it('skips vetoed items in deleteMany', () => {
      const [m1] = mem.memories.save('a1', 'u1', { content: 'keep', tags: [] });
      const [m2] = mem.memories.save('a1', 'u1', { content: 'delete', tags: [] });

      mem.use({
        beforeDelete(entityId) {
          return entityId !== m1.id; // protect m1
        },
      });

      const commits = mem.memories.deleteMany([m1.id, m2.id]);
      expect(commits).toHaveLength(1); // only m2 deleted

      expect(mem.memories.get(m1.id)).not.toBeNull();
      expect(mem.memories.get(m2.id)).toBeNull();
    });
  });

  describe('selective middleware', () => {
    it('middleware can target specific entity types', () => {
      mem.use({
        beforeSave(entity) {
          if (entity.type === 'session') return null; // block sessions
          return entity;
        },
      });

      // Memory saves work
      const [saved] = mem.memories.save('a1', 'u1', { content: 'works' });
      expect(saved.content).toBe('works');

      // Session saves blocked
      expect(() => {
        mem.sessions.save('a1', 'u1', { content: 'blocked' });
      }).toThrow('cancelled by middleware');
    });

    it('partial middleware (only some hooks)', () => {
      mem.use({
        beforeDelete() {
          return false; // only implement beforeDelete
        },
      });

      // Saves work normally (no beforeSave hook)
      const [saved] = mem.memories.save('a1', 'u1', { content: 'test' });
      expect(saved).toBeTruthy();

      // Deletes blocked
      expect(() => {
        mem.memories.delete(saved.id);
      }).toThrow('cancelled by middleware');
    });
  });

  describe('content sanitization use case', () => {
    it('auto-trims and lowercases tags', () => {
      mem.use({
        beforeSave(entity) {
          if ('tags' in entity && Array.isArray(entity.tags)) {
            return {
              ...entity,
              tags: (entity.tags as string[]).map(t => t.trim().toLowerCase()),
            };
          }
          return entity;
        },
      });

      const [saved] = mem.memories.save('a1', 'u1', {
        content: 'test',
        tags: ['  TypeScript  ', 'REACT', ' docker '],
      });
      expect(saved.tags).toEqual(['typescript', 'react', 'docker']);
    });
  });
});
