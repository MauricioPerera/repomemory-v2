import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { computeScore } from '../../src/search/scoring.js';

describe('Correction Scoring', () => {
  it('correctionBoost multiplies the final score', () => {
    const base = computeScore({
      tfidfScore: 0.8,
      tagOverlap: 0.5,
      daysSinceUpdate: 1,
      accessCount: 0,
    });

    const corrected = computeScore({
      tfidfScore: 0.8,
      tagOverlap: 0.5,
      daysSinceUpdate: 1,
      accessCount: 0,
      isCorrection: true,
    });

    // Default correctionBoost is 2.0
    expect(corrected).toBeCloseTo(base * 2.0, 5);
  });

  it('non-corrections are unchanged (isCorrection=false)', () => {
    const a = computeScore({
      tfidfScore: 0.5,
      tagOverlap: 0.3,
      daysSinceUpdate: 10,
      accessCount: 5,
    });

    const b = computeScore({
      tfidfScore: 0.5,
      tagOverlap: 0.3,
      daysSinceUpdate: 10,
      accessCount: 5,
      isCorrection: false,
    });

    expect(a).toBe(b);
  });

  it('custom correctionBoost overrides default', () => {
    const base = computeScore({
      tfidfScore: 0.7,
      tagOverlap: 0.2,
      daysSinceUpdate: 0,
      accessCount: 0,
    });

    const boosted = computeScore({
      tfidfScore: 0.7,
      tagOverlap: 0.2,
      daysSinceUpdate: 0,
      accessCount: 0,
      isCorrection: true,
      weights: { correctionBoost: 3.0 },
    });

    expect(boosted).toBeCloseTo(base * 3.0, 5);
  });
});

describe('Corrections in search results', () => {
  let dir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'repomem-correction-'));
    mem = new RepoMemory({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('corrections rank above regular memories with same content', () => {
    // Save a regular fact
    mem.memories.save('agent1', 'user1', {
      content: 'PostgreSQL does not support JSON operators',
      tags: ['postgresql', 'json'],
      category: 'fact',
    });

    // Save a correction
    mem.memories.save('agent1', 'user1', {
      content: 'PostgreSQL DOES support JSON operators via -> and ->> syntax',
      tags: ['postgresql', 'json'],
      category: 'correction',
    });

    const results = mem.memories.find('agent1', 'user1', 'PostgreSQL JSON operators', 10);
    expect(results.length).toBe(2);

    // Correction should rank first due to boost
    const first = results[0].entity;
    expect(first.category).toBe('correction');
    expect(first.content).toContain('DOES support');

    // Score should be higher
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('memory_save with correction category works', () => {
    const [entity] = mem.memories.save('agent1', 'user1', {
      content: 'The API rate limit is 1000/min, not 100/min',
      tags: ['api', 'rate-limit'],
      category: 'correction',
    });

    expect(entity.category).toBe('correction');
    expect(entity.type).toBe('memory');

    const loaded = mem.memories.get(entity.id);
    expect(loaded?.category).toBe('correction');
  });
});
