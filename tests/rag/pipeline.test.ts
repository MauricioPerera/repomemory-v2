import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { RagPipeline } from '../../src/rag/index.js';
import type { AiProvider } from '../../src/types/ai.js';

describe('RagPipeline', () => {
  let tmpDir: string;
  let docsDir: string;
  let storageDir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rag-pipeline-'));
    docsDir = join(tmpDir, 'docs');
    mkdirSync(docsDir);
    storageDir = join(tmpDir, '.repomemory');
    mem = new RepoMemory({ dir: storageDir });
  });

  afterEach(() => {
    mem.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses constructor defaults for chunk options', async () => {
    const rag = new RagPipeline(mem, { chunkSize: 500, overlap: 50 });

    writeFileSync(join(docsDir, 'test.md'), 'A'.repeat(1200));
    const result = await rag.ingest(docsDir, { agent: 'test-agent' });

    // With chunkSize=500, 1200 chars should produce multiple chunks
    expect(result.chunksIngested).toBeGreaterThan(1);
  });

  it('end-to-end: ingest → query → sync cycle', async () => {
    const rag = new RagPipeline(mem, { chunkSize: 500, overlap: 50 });

    // 1. Ingest
    writeFileSync(join(docsDir, 'guide.md'), [
      '# Setup Guide',
      '',
      'Install the package with npm install repomemory.',
      'Configure the storage directory with the dir option.',
      '',
      '## Usage',
      '',
      'Create a new instance and call save to store memories.',
      'Use search to find relevant memories by query.',
    ].join('\n'));

    const ingestResult = await rag.ingest(docsDir, { agent: 'my-agent' });
    expect(ingestResult.filesProcessed).toBe(1);
    expect(ingestResult.chunksIngested).toBeGreaterThanOrEqual(1);

    // 2. Query (no AI)
    const queryResult = await rag.query('my-agent', 'how to install');
    expect(queryResult.chunks.length).toBeGreaterThan(0);
    expect(queryResult.answer).toBeNull();
    expect(queryResult.context).toContain('Source:');

    // 3. Sync (no changes)
    const syncResult = await rag.sync(docsDir, { agent: 'my-agent' });
    expect(syncResult.unchangedFiles).toBe(1);
    expect(syncResult.modifiedFiles).toBe(0);
  });

  it('query returns AI answer when ai is configured', async () => {
    const mockAi: AiProvider = {
      chat: async () => 'You can install it with npm.',
    };
    const rag = new RagPipeline(mem, { chunkSize: 500, overlap: 50, ai: mockAi });

    writeFileSync(join(docsDir, 'install.md'), 'Install the package using npm install repomemory. Then require it.');
    await rag.ingest(docsDir, { agent: 'my-agent' });

    const result = await rag.query('my-agent', 'how to install');
    expect(result.answer).toBe('You can install it with npm.');
  });

  it('sync detects modifications', async () => {
    const rag = new RagPipeline(mem, { chunkSize: 500, overlap: 0 });

    writeFileSync(join(docsDir, 'dynamic.md'), 'Version one content.');
    await rag.ingest(docsDir, { agent: 'my-agent' });

    writeFileSync(join(docsDir, 'dynamic.md'), 'Version two content completely different.');
    const result = await rag.sync(docsDir, { agent: 'my-agent' });

    expect(result.modifiedFiles).toBe(1);
    expect(result.chunksRemoved).toBeGreaterThan(0);
    expect(result.chunksCreated).toBeGreaterThan(0);
  });

  it('per-call options override constructor defaults', async () => {
    const rag = new RagPipeline(mem, { chunkSize: 1000, overlap: 200 });

    writeFileSync(join(docsDir, 'big.md'), 'X'.repeat(600));
    // Override with smaller chunk size
    const result = await rag.ingest(docsDir, { agent: 'my-agent', chunkSize: 200, overlap: 0 });

    // 600 chars / 200 = 3 chunks
    expect(result.chunksIngested).toBeGreaterThanOrEqual(3);
  });
});
