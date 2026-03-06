import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import type { ExportData } from '../src/index.js';

describe('Export / Import', () => {
  let dir1: string;
  let dir2: string;
  let mem1: RepoMemory;
  let mem2: RepoMemory;

  beforeEach(() => {
    dir1 = mkdtempSync(join(tmpdir(), 'rm-export-'));
    dir2 = mkdtempSync(join(tmpdir(), 'rm-import-'));
    mem1 = new RepoMemory({ dir: dir1 });
    mem2 = new RepoMemory({ dir: dir2 });
  });

  afterEach(() => {
    rmSync(dir1, { recursive: true, force: true });
    rmSync(dir2, { recursive: true, force: true });
  });

  it('exports empty repo', () => {
    const data = mem1.export();
    expect(data.version).toBe(1);
    expect(data.exportedAt).toBeTruthy();
    expect(data.entities.memories).toEqual([]);
    expect(data.entities.skills).toEqual([]);
    expect(data.entities.knowledge).toEqual([]);
    expect(data.entities.sessions).toEqual([]);
    expect(data.entities.profiles).toEqual([]);
    expect(data.accessCounts).toEqual({});
  });

  it('exports all entity types', () => {
    mem1.memories.save('a1', 'u1', { content: 'mem1', tags: ['t1'], category: 'fact' });
    mem1.skills.save('a1', undefined, { content: 'skill1', tags: ['s1'], category: 'procedure' });
    mem1.knowledge.save('a1', undefined, { content: 'know1', tags: ['k1'] });
    mem1.sessions.save('a1', 'u1', { content: 'session text' });
    mem1.profiles.save('a1', 'u1', { content: 'profile text', metadata: { lang: 'en' } });

    const data = mem1.export();
    expect(data.entities.memories).toHaveLength(1);
    expect(data.entities.skills).toHaveLength(1);
    expect(data.entities.knowledge).toHaveLength(1);
    expect(data.entities.sessions).toHaveLength(1);
    expect(data.entities.profiles).toHaveLength(1);
    expect(data.entities.memories[0].content).toBe('mem1');
    expect(data.entities.skills[0].content).toBe('skill1');
  });

  it('exports access counts', () => {
    mem1.memories.save('a1', 'u1', { content: 'searchable memory about testing', tags: ['test'] });
    mem1.memories.save('a1', 'u1', { content: 'another memory about deployment', tags: ['deploy'] });
    // Search triggers access count increments
    mem1.memories.search('a1', 'u1', 'testing');
    mem1.memories.search('a1', 'u1', 'testing');
    mem1.flush();

    const data = mem1.export();
    const accessedIds = Object.keys(data.accessCounts);
    expect(accessedIds.length).toBeGreaterThan(0);
  });

  it('imports into empty repo preserving IDs', () => {
    const [saved] = mem1.memories.save('a1', 'u1', { content: 'portable memory', tags: ['x'] });
    const data = mem1.export();

    const report = mem2.import(data);
    expect(report.imported).toBe(1);
    expect(report.skipped).toBe(0);
    expect(report.overwritten).toBe(0);
    expect(report.byType.memories).toBe(1);

    const imported = mem2.memories.get(saved.id);
    expect(imported).not.toBeNull();
    expect(imported!.content).toBe('portable memory');
    expect(imported!.id).toBe(saved.id);
  });

  it('full roundtrip with all entity types', () => {
    mem1.memories.save('a1', 'u1', { content: 'mem', tags: ['t'] });
    mem1.skills.save('a1', undefined, { content: 'skill', tags: ['s'], category: 'procedure' });
    mem1.knowledge.save('a1', undefined, { content: 'know', tags: ['k'] });
    mem1.sessions.save('a1', 'u1', { content: 'sess' });
    mem1.profiles.save('a1', 'u1', { content: 'prof', metadata: {} });

    const data = mem1.export();
    const report = mem2.import(data);

    expect(report.imported).toBe(5);
    expect(report.byType).toEqual({ memories: 1, skills: 1, knowledge: 1, sessions: 1, profiles: 1 });

    const stats = mem2.stats();
    expect(stats.memories).toBe(1);
    expect(stats.skills).toBe(1);
    expect(stats.knowledge).toBe(1);
    expect(stats.sessions).toBe(1);
    expect(stats.profiles).toBe(1);
  });

  it('imported entities are searchable', () => {
    mem1.memories.save('a1', 'u1', { content: 'TypeScript strict mode is essential', tags: ['typescript'] });
    mem1.memories.save('a1', 'u1', { content: 'Docker compose for deployment', tags: ['docker'] });
    mem1.flush();

    const data = mem1.export();
    mem2.import(data);

    const results = mem2.memories.search('a1', 'u1', 'typescript');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entity.content).toContain('TypeScript');
  });

  it('skipExisting skips duplicates', () => {
    mem1.memories.save('a1', 'u1', { content: 'original', tags: ['t'] });
    const data = mem1.export();

    // Import once
    mem2.import(data);
    // Import again with skipExisting
    const report = mem2.import(data, { skipExisting: true });
    expect(report.skipped).toBe(1);
    expect(report.imported).toBe(0);
    expect(report.overwritten).toBe(0);
  });

  it('overwrite mode replaces existing entities', () => {
    const [saved] = mem1.memories.save('a1', 'u1', { content: 'version 1', tags: ['t'] });
    const data = mem1.export();

    // Import into mem2
    mem2.import(data);

    // Modify the export data content
    data.entities.memories[0].content = 'version 2';

    // Import again without skipExisting (overwrite)
    const report = mem2.import(data);
    expect(report.overwritten).toBe(1);
    expect(report.imported).toBe(1);

    const entity = mem2.memories.get(saved.id);
    expect(entity!.content).toBe('version 2');
  });

  it('restores access counts on import', () => {
    mem1.memories.save('a1', 'u1', { content: 'frequently accessed memory', tags: ['popular'] });
    mem1.memories.save('a1', 'u1', { content: 'another memory about something', tags: ['other'] });
    // Search to generate access counts
    mem1.memories.search('a1', 'u1', 'frequently accessed');
    mem1.memories.search('a1', 'u1', 'frequently accessed');
    mem1.memories.search('a1', 'u1', 'frequently accessed');
    mem1.flush();

    const data = mem1.export();
    const totalCounts = Object.values(data.accessCounts).reduce((a, b) => a + b, 0);
    expect(totalCounts).toBeGreaterThan(0);

    mem2.import(data);

    // Access counts should be restored (verify via export)
    const reexported = mem2.export();
    expect(reexported.accessCounts).toEqual(data.accessCounts);
  });

  it('excludes tombstoned (deleted) entities from export', () => {
    const [saved] = mem1.memories.save('a1', 'u1', { content: 'will be deleted', tags: ['t'] });
    mem1.memories.save('a1', 'u1', { content: 'will survive', tags: ['t'] });
    mem1.memories.delete(saved.id);

    const data = mem1.export();
    expect(data.entities.memories).toHaveLength(1);
    expect(data.entities.memories[0].content).toBe('will survive');
  });

  it('handles multiple agents and users', () => {
    mem1.memories.save('agent-a', 'user-1', { content: 'a1-u1 memory' });
    mem1.memories.save('agent-a', 'user-2', { content: 'a1-u2 memory' });
    mem1.memories.save('agent-b', 'user-1', { content: 'a2-u1 memory' });
    mem1.skills.save('agent-a', undefined, { content: 'skill for agent-a' });
    mem1.skills.save('agent-b', undefined, { content: 'skill for agent-b' });

    const data = mem1.export();
    expect(data.entities.memories).toHaveLength(3);
    expect(data.entities.skills).toHaveLength(2);

    mem2.import(data);

    expect(mem2.memories.list('agent-a', 'user-1')).toHaveLength(1);
    expect(mem2.memories.list('agent-a', 'user-2')).toHaveLength(1);
    expect(mem2.memories.list('agent-b', 'user-1')).toHaveLength(1);
    expect(mem2.skills.list('agent-a')).toHaveLength(1);
    expect(mem2.skills.list('agent-b')).toHaveLength(1);
  });

  it('rejects invalid export data', () => {
    expect(() => mem2.import(null as unknown as ExportData)).toThrow('Invalid export data');
    expect(() => mem2.import({} as ExportData)).toThrow('Invalid export data');
    expect(() => mem2.import({ version: 999, entities: {} } as unknown as ExportData)).toThrow('Unsupported export version');
  });

  it('import report counts are correct for mixed operation', () => {
    // Create some entities in target
    mem2.memories.save('a1', 'u1', { content: 'existing memory', tags: ['x'] });

    // Create export from source with 3 entities (including one that matches existing ID)
    mem1.memories.save('a1', 'u1', { content: 'new memory 1', tags: ['y'] });
    mem1.memories.save('a1', 'u1', { content: 'new memory 2', tags: ['z'] });
    const data = mem1.export();

    const report = mem2.import(data);
    // All from source are new (different IDs)
    expect(report.imported).toBe(2);
    expect(report.overwritten).toBe(0);
    expect(report.skipped).toBe(0);
  });
});
