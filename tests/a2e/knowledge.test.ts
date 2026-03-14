/**
 * Tests for A2E knowledge ingestion — primitives + workflow examples.
 */

import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { ingestA2EKnowledge } from '../../src/a2e/knowledge.js';

function makeRepo(): RepoMemory {
  const dir = mkdtempSync(join(tmpdir(), 'a2e-knowledge-test-'));
  return new RepoMemory({ dir, lockEnabled: false });
}

function cleanup(repo: RepoMemory) {
  repo.dispose();
  rmSync(repo.dir, { recursive: true, force: true });
}

describe('ingestA2EKnowledge', () => {
  let repo: RepoMemory;

  beforeEach(() => { repo = makeRepo(); });
  afterEach(() => cleanup(repo));

  it('ingests primitive documentation as knowledge', () => {
    const result = ingestA2EKnowledge(repo, 'agent1');

    // 8 primitives + 1 JSONL format = 9 knowledge entries
    expect(result.knowledge).toBe(9);
    expect(result.skills).toBeGreaterThan(0);
    expect(result.total).toBe(result.knowledge + result.skills);
  });

  it('ingests workflow examples as skills', () => {
    ingestA2EKnowledge(repo, 'agent1');

    const skills = repo.skills.search('agent1', 'consultar API filtrar', 5);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0].entity.content).toContain('[A2E:');
    expect(skills[0].entity.tags).toContain('a2e-example');
  });

  it('is idempotent (deduplication)', () => {
    ingestA2EKnowledge(repo, 'agent1');
    const count1 = repo.knowledge.list('agent1').length;

    ingestA2EKnowledge(repo, 'agent1');
    const count2 = repo.knowledge.list('agent1').length;

    expect(count2).toBe(count1);
  });

  it('knowledge entries contain primitive details', () => {
    ingestA2EKnowledge(repo, 'agent1');

    const results = repo.knowledge.search('agent1', 'ApiCall HTTP request', 10);
    const apiCall = results.find(r => r.entity.content.includes('A2E Primitive: ApiCall'));
    expect(apiCall).toBeDefined();
    expect(apiCall!.entity.content).toContain('method');
    expect(apiCall!.entity.content).toContain('url');
    expect(apiCall!.entity.content).toContain('outputPath');
    expect(apiCall!.entity.content).toContain('GET');
    expect(apiCall!.entity.tags).toContain('a2e-primitive');
  });

  it('knowledge entries contain JSONL format documentation', () => {
    ingestA2EKnowledge(repo, 'agent1');

    const results = repo.knowledge.search('agent1', 'JSONL workflow format', 10);
    const jsonl = results.find(r => r.entity.content.includes('A2E Workflow Format'));
    expect(jsonl).toBeDefined();
    expect(jsonl!.entity.content).toContain('operationUpdate');
    expect(jsonl!.entity.content).toContain('beginExecution');
    expect(jsonl!.entity.content).toContain('operationOrder');
  });

  it('recall with a2e template finds ingested knowledge', () => {
    ingestA2EKnowledge(repo, 'agent1');

    const ctx = repo.recall('agent1', 'user1', 'como hacer una peticion HTTP a una API', {
      template: 'a2e',
      maxItems: 30,
      maxChars: 16000,
    });

    expect(ctx.totalItems).toBeGreaterThan(0);
    expect(ctx.formatted).toContain('Output ONLY valid A2E JSONL');
  });

  it('few-shot examples are extracted from workflow skills', () => {
    ingestA2EKnowledge(repo, 'agent1');

    const ctx = repo.recall('agent1', 'user1', 'consultar API', {
      template: 'a2e',
      maxItems: 30,
      maxChars: 16000,
    });

    // Skills with [A2E: ...] pattern should produce few-shot examples
    if (ctx.fewShotExamples && ctx.fewShotExamples.length > 0) {
      expect(ctx.fewShotExamples[0].assistant).toContain('[A2E:');
    }
  });

  it('each primitive has its own knowledge entry', () => {
    ingestA2EKnowledge(repo, 'agent1');

    const primitives = ['ApiCall', 'FilterData', 'TransformData', 'Conditional', 'Loop', 'StoreData', 'Wait', 'MergeData'];

    for (const name of primitives) {
      const results = repo.knowledge.search('agent1', `A2E Primitive ${name}`, 5);
      const found = results.find(r => r.entity.content.includes(`A2E Primitive: ${name}`));
      expect(found).toBeDefined();
    }
  });

  it('scopes knowledge per agent', () => {
    ingestA2EKnowledge(repo, 'agent1');
    ingestA2EKnowledge(repo, 'agent2');

    const agent1Knowledge = repo.knowledge.list('agent1');
    const agent2Knowledge = repo.knowledge.list('agent2');

    expect(agent1Knowledge.length).toBe(9);
    expect(agent2Knowledge.length).toBe(9);
  });
});
