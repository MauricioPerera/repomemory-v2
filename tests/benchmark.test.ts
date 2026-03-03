import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { AccessTracker } from '../src/storage/access-tracker.js';

const N = 50;
let tmpDir: string;

function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('Benchmarks', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'repomemory-bench-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it(`save individual x${N} vs saveMany x${N}`, () => {
    const dir1 = mkdtempSync(join(tmpdir(), 'bench-save1-'));
    const dir2 = mkdtempSync(join(tmpdir(), 'bench-save2-'));
    const repo1 = new RepoMemory({ dir: dir1 });
    const repo2 = new RepoMemory({ dir: dir2 });

    const items = Array.from({ length: N }, (_, i) => ({
      agentId: 'agent1',
      userId: 'user1',
      input: { content: `Benchmark memory ${i} with some detail about topic ${i}`, tags: [`tag${i}`, 'bench'], category: 'fact' },
    }));

    const individualMs = measure(() => {
      for (const item of items) {
        repo1.memories.save(item.agentId, item.userId, item.input);
      }
    });

    const batchMs = measure(() => {
      repo2.memories.saveMany(items);
    });

    console.log(`\n[BENCHMARK] save individual x${N}: ${individualMs.toFixed(1)}ms`);
    console.log(`[BENCHMARK] saveMany x${N}: ${batchMs.toFixed(1)}ms`);
    console.log(`[BENCHMARK] saveMany speedup: ${(individualMs / batchMs).toFixed(2)}x`);

    // Verify both produce the same number of entities
    expect(repo1.memories.list('agent1', 'user1')).toHaveLength(N);
    expect(repo2.memories.list('agent1', 'user1')).toHaveLength(N);

    // Batch should be faster (less flushes)
    expect(batchMs).toBeLessThan(individualMs);

    rmSync(dir1, { recursive: true, force: true });
    rmSync(dir2, { recursive: true, force: true });
  });

  it(`increment x${N} vs incrementMany x${N}`, () => {
    const dir1 = mkdtempSync(join(tmpdir(), 'bench-inc1-'));
    const dir2 = mkdtempSync(join(tmpdir(), 'bench-inc2-'));
    const tracker1 = new AccessTracker(dir1);
    const tracker2 = new AccessTracker(dir2);

    const ids = Array.from({ length: N }, (_, i) => `entity-${i}`);

    const individualMs = measure(() => {
      for (const id of ids) {
        tracker1.increment(id);
      }
    });

    const batchMs = measure(() => {
      tracker2.incrementMany(ids);
    });

    console.log(`\n[BENCHMARK] increment x${N}: ${individualMs.toFixed(1)}ms`);
    console.log(`[BENCHMARK] incrementMany x${N}: ${batchMs.toFixed(1)}ms`);
    console.log(`[BENCHMARK] incrementMany speedup: ${(individualMs / batchMs).toFixed(2)}x`);

    // Verify both produce the same counts
    for (const id of ids) {
      expect(tracker1.get(id)).toBe(1);
      expect(tracker2.get(id)).toBe(1);
    }

    // Batch should be faster (1 persist vs N persists)
    expect(batchMs).toBeLessThan(individualMs);

    rmSync(dir1, { recursive: true, force: true });
    rmSync(dir2, { recursive: true, force: true });
  });

  it(`search latency over ${N} memories`, () => {
    const repo = new RepoMemory({ dir: tmpDir });

    // Seed memories
    const items = Array.from({ length: N }, (_, i) => ({
      agentId: 'agent1',
      userId: 'user1',
      input: {
        content: `Memory about ${['typescript', 'rust', 'python', 'go', 'java'][i % 5]} project number ${i}`,
        tags: [['typescript', 'rust', 'python', 'go', 'java'][i % 5], `project${i}`],
        category: (['fact', 'decision', 'issue', 'task'] as const)[i % 4],
      },
    }));
    repo.memories.saveMany(items);

    const queries = ['typescript project', 'rust project', 'python memory', 'java decision'];
    const times: number[] = [];

    for (const q of queries) {
      const ms = measure(() => {
        repo.memories.search('agent1', 'user1', q, 10);
      });
      times.push(ms);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`\n[BENCHMARK] search avg over ${queries.length} queries (${N} memories): ${avg.toFixed(2)}ms`);
    for (let i = 0; i < queries.length; i++) {
      console.log(`[BENCHMARK]   "${queries[i]}": ${times[i].toFixed(2)}ms`);
    }

    // Search should complete in reasonable time (<100ms per query)
    expect(avg).toBeLessThan(100);
  });
});
