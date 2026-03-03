import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { atomicWriteFileSync } from '../src/storage/atomic-write.js';
import { AccessTracker } from '../src/storage/access-tracker.js';
import { AiService } from '../src/ai/service.js';
import { MINING_SYSTEM, CONSOLIDATION_SYSTEM } from '../src/ai/prompts.js';
import type { AiProvider } from '../src/types/ai.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'repomemory-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('atomicWriteFileSync', () => {
  it('writes file correctly', () => {
    const filePath = join(tmpDir, 'test.json');
    atomicWriteFileSync(filePath, '{"hello":"world"}');
    expect(readFileSync(filePath, 'utf8')).toBe('{"hello":"world"}');
  });

  it('overwrites existing file', () => {
    const filePath = join(tmpDir, 'test.json');
    atomicWriteFileSync(filePath, 'first');
    atomicWriteFileSync(filePath, 'second');
    expect(readFileSync(filePath, 'utf8')).toBe('second');
  });

  it('does not leave temporary files', () => {
    const filePath = join(tmpDir, 'clean.json');
    atomicWriteFileSync(filePath, 'data');
    const files = readdirSync(tmpDir);
    expect(files).toEqual(['clean.json']);
  });
});

describe('saveMany', () => {
  it('saves N entities correctly and they are searchable', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const items = Array.from({ length: 10 }, (_, i) => ({
      agentId: 'agent1',
      userId: 'user1',
      input: { content: `Memory about topic ${i}`, tags: [`tag${i}`], category: 'fact' },
    }));
    const results = repo.memories.saveMany(items);
    expect(results).toHaveLength(10);
    for (const [entity, commit] of results) {
      expect(entity.type).toBe('memory');
      expect(commit.hash).toBeTruthy();
    }
    const listed = repo.memories.list('agent1', 'user1');
    expect(listed).toHaveLength(10);
  });

  it('produces same results as saves individually', () => {
    const repo1 = new RepoMemory({ dir: mkdtempSync(join(tmpdir(), 'repo1-')) });
    const repo2 = new RepoMemory({ dir: mkdtempSync(join(tmpdir(), 'repo2-')) });

    const inputs = [
      { agentId: 'a', userId: 'u', input: { content: 'Alpha memory', tags: ['a'], category: 'fact' } },
      { agentId: 'a', userId: 'u', input: { content: 'Beta memory', tags: ['b'], category: 'decision' } },
    ];

    // Individual saves
    for (const item of inputs) {
      repo1.memories.save(item.agentId, item.userId, item.input);
    }

    // Batch save
    repo2.memories.saveMany(inputs);

    const list1 = repo1.memories.list('a', 'u');
    const list2 = repo2.memories.list('a', 'u');
    expect(list1.length).toBe(list2.length);
    expect(list1.map(m => m.content).sort()).toEqual(list2.map(m => m.content).sort());

    rmSync(repo1['storage']['baseDir'], { recursive: true, force: true });
    rmSync(repo2['storage']['baseDir'], { recursive: true, force: true });
  });
});

describe('incrementMany', () => {
  it('batch accumulates correctly', () => {
    const tracker = new AccessTracker(tmpDir);
    tracker.incrementMany(['a', 'b', 'a', 'c', 'a']);
    expect(tracker.get('a')).toBe(3);
    expect(tracker.get('b')).toBe(1);
    expect(tracker.get('c')).toBe(1);
  });

  it('works with empty array', () => {
    const tracker = new AccessTracker(tmpDir);
    tracker.incrementMany([]);
    expect(tracker.get('x')).toBe(0);
  });
});

describe('saveOrUpdate', () => {
  it('creates new when no duplicate', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    const [memory, , meta] = repo.memories.saveOrUpdate('agent1', 'user1', {
      content: 'Unique memory content',
      tags: ['unique'],
      category: 'fact',
    });
    expect(meta.deduplicated).toBe(false);
    expect(memory.content).toBe('Unique memory content');
  });

  it('updates existing with same category and similar content', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.memories.save('agent1', 'user1', {
      content: 'The database uses PostgreSQL version 15',
      tags: ['database', 'postgresql'],
      category: 'fact',
    });

    const [updated, , meta] = repo.memories.saveOrUpdate('agent1', 'user1', {
      content: 'The database uses PostgreSQL version 16',
      tags: ['database', 'postgresql'],
      category: 'fact',
    });
    expect(meta.deduplicated).toBe(true);
    expect(updated.content).toBe('The database uses PostgreSQL version 16');
    const all = repo.memories.list('agent1', 'user1');
    expect(all).toHaveLength(1);
  });

  it('does NOT deduplicate between different categories', () => {
    const repo = new RepoMemory({ dir: tmpDir });
    repo.memories.save('agent1', 'user1', {
      content: 'PostgreSQL database setup',
      tags: ['database'],
      category: 'fact',
    });

    const [, , meta] = repo.memories.saveOrUpdate('agent1', 'user1', {
      content: 'PostgreSQL database setup',
      tags: ['database'],
      category: 'task',
    });
    expect(meta.deduplicated).toBe(false);
    const all = repo.memories.list('agent1', 'user1');
    expect(all).toHaveLength(2);
  });
});

describe('AI service', () => {
  it('retry works with invalid JSON on first attempt', async () => {
    let callCount = 0;
    const mockProvider: AiProvider = {
      chat: async () => {
        callCount++;
        if (callCount === 1) {
          return 'Here is the result: {broken json';
        }
        return '{"memories":[],"skills":[],"profile":null}';
      },
    };
    const service = new AiService(mockProvider);
    const result = await service.extractFromSession('test session');
    expect(callCount).toBe(2);
    expect(result.memories).toEqual([]);
  });

  it('extracts JSON from braces without code block', async () => {
    const mockProvider: AiProvider = {
      chat: async () => 'Sure, here is the result:\n{"memories":[],"skills":[]}\nHope that helps!',
    };
    const service = new AiService(mockProvider);
    const result = await service.extractFromSession('test session');
    expect(result.memories).toEqual([]);
  });

  it('throws error after retry failure', async () => {
    const mockProvider: AiProvider = {
      chat: async () => 'not json at all {{{',
    };
    const service = new AiService(mockProvider);
    await expect(service.extractFromSession('test')).rejects.toThrow('Failed to parse AI response as JSON after retry');
  });
});

describe('Consolidation chunking', () => {
  it('calls provider multiple times with >20 memories', async () => {
    const repo = new RepoMemory({ dir: tmpDir });
    // Create 25 fact memories
    for (let i = 0; i < 25; i++) {
      repo.memories.save('agent1', 'user1', {
        content: `Fact memory number ${i} about topic ${i}`,
        tags: [`tag${i}`],
        category: 'fact',
      });
    }

    let chatCalls = 0;
    const mockProvider: AiProvider = {
      chat: async () => {
        chatCalls++;
        return '{"keep":[],"merge":[],"remove":[]}';
      },
    };

    const { ConsolidationPipeline } = await import('../src/pipelines/consolidation.js');
    const pipeline = new ConsolidationPipeline(mockProvider, repo);
    await pipeline.run('agent1', 'user1');
    // 25 facts → 2 chunks (20 + 5), so 2 calls
    expect(chatCalls).toBe(2);
  });
});

describe('Prompts', () => {
  it('mining prompt contains concrete example output', () => {
    expect(MINING_SYSTEM).toContain('EXAMPLE OUTPUT');
    expect(MINING_SYSTEM).toContain('"postgresql"');
    expect(MINING_SYSTEM).toContain('"fact"');
  });

  it('consolidation prompt contains concrete example output', () => {
    expect(CONSOLIDATION_SYSTEM).toContain('EXAMPLE OUTPUT');
    expect(CONSOLIDATION_SYSTEM).toContain('"sourceIds"');
    expect(CONSOLIDATION_SYSTEM).toContain('"keep"');
  });
});
