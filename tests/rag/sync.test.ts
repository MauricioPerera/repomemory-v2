import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { ingestPath } from '../../src/rag/ingest.js';
import { syncDirectory } from '../../src/rag/sync.js';

describe('sync', () => {
  let tmpDir: string;
  let docsDir: string;
  let storageDir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rag-sync-'));
    docsDir = join(tmpDir, 'docs');
    mkdirSync(docsDir);
    storageDir = join(tmpDir, '.repomemory');
    mem = new RepoMemory({ dir: storageDir });
  });

  afterEach(() => {
    mem.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects unchanged files and skips them', () => {
    writeFileSync(join(docsDir, 'stable.md'), 'Stable content that does not change.');
    ingestPath(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    const result = syncDirectory(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    expect(result.unchangedFiles).toBe(1);
    expect(result.modifiedFiles).toBe(0);
    expect(result.newFiles).toBe(0);
    expect(result.deletedFiles).toBe(0);
  });

  it('detects and re-ingests modified files', () => {
    writeFileSync(join(docsDir, 'changing.md'), 'Original content version one.');
    ingestPath(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    const beforeCount = mem.knowledge.list('test-agent').length;

    // Modify the file
    writeFileSync(join(docsDir, 'changing.md'), 'Updated content version two with different text.');
    const result = syncDirectory(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    expect(result.modifiedFiles).toBe(1);
    expect(result.chunksRemoved).toBeGreaterThan(0);
    expect(result.chunksCreated).toBeGreaterThan(0);
  });

  it('detects and ingests new files', () => {
    writeFileSync(join(docsDir, 'existing.md'), 'Already ingested.');
    ingestPath(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    // Add a new file
    writeFileSync(join(docsDir, 'brand-new.md'), 'Brand new content not seen before.');
    const result = syncDirectory(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    expect(result.newFiles).toBe(1);
    expect(result.unchangedFiles).toBe(1);
  });

  it('removes chunks from deleted files', () => {
    writeFileSync(join(docsDir, 'keep.md'), 'This file stays.');
    writeFileSync(join(docsDir, 'remove.md'), 'This file will be deleted.');
    ingestPath(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    const beforeCount = mem.knowledge.list('test-agent').length;
    expect(beforeCount).toBeGreaterThanOrEqual(2);

    // Delete one file
    unlinkSync(join(docsDir, 'remove.md'));
    const result = syncDirectory(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    expect(result.deletedFiles).toBe(1);
    expect(result.chunksRemoved).toBeGreaterThan(0);
    expect(result.unchangedFiles).toBe(1);
  });

  it('handles mixed changes correctly', () => {
    writeFileSync(join(docsDir, 'unchanged.md'), 'Unchanged content.');
    writeFileSync(join(docsDir, 'to-modify.md'), 'Will be modified.');
    writeFileSync(join(docsDir, 'to-delete.md'), 'Will be deleted.');
    ingestPath(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    // Modify one, delete one, add one
    writeFileSync(join(docsDir, 'to-modify.md'), 'Has been modified with new text.');
    unlinkSync(join(docsDir, 'to-delete.md'));
    writeFileSync(join(docsDir, 'new-file.md'), 'Brand new file added.');

    const result = syncDirectory(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    expect(result.unchangedFiles).toBe(1);
    expect(result.modifiedFiles).toBe(1);
    expect(result.deletedFiles).toBe(1);
    expect(result.newFiles).toBe(1);
  });

  it('empty directory sync removes all stored chunks', () => {
    writeFileSync(join(docsDir, 'temp.md'), 'Temporary content.');
    ingestPath(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    // Delete all files
    unlinkSync(join(docsDir, 'temp.md'));
    const result = syncDirectory(mem, docsDir, { agent: 'test-agent', chunkSize: 500, overlap: 0 });

    expect(result.deletedFiles).toBe(1);
    expect(result.chunksRemoved).toBeGreaterThan(0);
  });
});
