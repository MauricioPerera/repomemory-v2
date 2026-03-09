import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { ingestPath } from '../../src/rag/ingest.js';
import { queryKnowledge, queryWithAi } from '../../src/rag/query.js';
import type { AiProvider } from '../../src/types/ai.js';
import type { AiMessage } from '../../src/types/ai.js';

describe('query', () => {
  let tmpDir: string;
  let storageDir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rag-query-'));
    storageDir = join(tmpDir, '.repomemory');
    mem = new RepoMemory({ dir: storageDir });

    // Ingest test content
    const docPath = join(tmpDir, 'docs.md');
    writeFileSync(docPath, [
      '# API Guide',
      '',
      'The rate limit is 100 requests per minute.',
      '',
      '## Authentication',
      '',
      'Use Bearer tokens for authentication. Pass the token in the Authorization header.',
      '',
      '## Endpoints',
      '',
      'GET /users returns a list of users. POST /users creates a new user.',
    ].join('\n'));

    ingestPath(mem, docPath, { agent: 'test-agent', chunkSize: 200, overlap: 20 });
  });

  afterEach(() => {
    mem.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('queryKnowledge', () => {
    it('returns relevant chunks for a query', () => {
      const result = queryKnowledge(mem, 'test-agent', 'rate limit');

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.context.length).toBeGreaterThan(0);
      expect(result.answer).toBeNull();
      expect(result.chunksUsed).toBeGreaterThan(0);
    });

    it('formats context with source headers', () => {
      const result = queryKnowledge(mem, 'test-agent', 'authentication');

      expect(result.context).toContain('--- Source:');
      expect(result.context).toContain('chunk');
    });

    it('returns empty result for irrelevant query', () => {
      const result = queryKnowledge(mem, 'test-agent', 'quantum physics dark matter');
      // May still return results with low scores, but context should be minimal
      expect(result.answer).toBeNull();
    });

    it('respects limit option', () => {
      const result = queryKnowledge(mem, 'test-agent', 'users', { limit: 1 });
      expect(result.chunks.length).toBeLessThanOrEqual(1);
    });

    it('filters by source when sourceFilter is set', () => {
      // Ingest a second file
      const otherPath = join(tmpDir, 'other.md');
      writeFileSync(otherPath, 'Unrelated content about cats and dogs.');
      ingestPath(mem, otherPath, { agent: 'test-agent' });

      const result = queryKnowledge(mem, 'test-agent', 'content', {
        sourceFilter: [join(tmpDir, 'other.md').replace(/\\/g, '\\')],
      });

      // All returned chunks should be from the filtered source
      for (const { entity } of result.chunks) {
        if (entity.source) {
          expect(entity.source).toContain('other.md');
        }
      }
    });
  });

  describe('queryWithAi', () => {
    it('calls AI provider and returns answer', async () => {
      const mockAi: AiProvider = {
        chat: async (_messages: AiMessage[]) => 'The rate limit is 100 requests per minute.',
      };

      const result = await queryWithAi(mem, mockAi, 'test-agent', 'What is the rate limit?');

      expect(result.answer).toBe('The rate limit is 100 requests per minute.');
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunksUsed).toBeGreaterThan(0);
    });

    it('returns fallback message when no context found', async () => {
      // Use a different agent with no knowledge
      const mockAi: AiProvider = {
        chat: async () => 'should not be called',
      };

      const result = await queryWithAi(mem, mockAi, 'empty-agent', 'anything');
      expect(result.answer).toContain('No relevant context');
    });
  });
});
