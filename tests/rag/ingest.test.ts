import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { ingestPath } from '../../src/rag/ingest.js';

describe('ingest', () => {
  let tmpDir: string;
  let storageDir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rag-ingest-'));
    storageDir = join(tmpDir, '.repomemory');
    mem = new RepoMemory({ dir: storageDir });
  });

  afterEach(() => {
    mem.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ingests a single file into knowledge', () => {
    const filePath = join(tmpDir, 'doc.md');
    writeFileSync(filePath, '# Hello\n\nThis is a test document with enough content to be meaningful.');

    const result = ingestPath(mem, filePath, { agent: 'test-agent' });

    expect(result.filesProcessed).toBe(1);
    expect(result.chunksIngested).toBeGreaterThanOrEqual(1);
    expect(result.chunksCreated).toBe(result.chunksIngested);
    expect(result.chunksDeduplicated).toBe(0);
    expect(result.entities.length).toBe(result.chunksIngested);

    // Verify stored entities
    const stored = mem.knowledge.list('test-agent');
    expect(stored.length).toBe(result.chunksIngested);
    expect(stored[0].source).toContain('doc.md');
    expect(stored[0].tags).toContain('rag');
    expect(stored[0].chunkIndex).toBeDefined();
    expect(stored[0].version).toBeDefined();
  });

  it('ingests a directory recursively', () => {
    writeFileSync(join(tmpDir, 'a.md'), '# File A\n\nContent A.');
    mkdirSync(join(tmpDir, 'sub'));
    writeFileSync(join(tmpDir, 'sub', 'b.txt'), 'Content of file B.');

    const result = ingestPath(mem, tmpDir, { agent: 'test-agent' });

    expect(result.filesProcessed).toBe(2);
    expect(result.chunksIngested).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates on second ingest of same file', () => {
    const filePath = join(tmpDir, 'doc.md');
    // Use substantial content so TF-IDF produces scores above the dedup threshold
    const content = [
      '# Deduplication Test Document',
      '',
      'This document contains enough meaningful content about software architecture',
      'and design patterns to produce reliable TF-IDF scores during deduplication.',
      'The system should recognize this content on the second ingestion attempt',
      'and update the existing knowledge entity rather than creating a duplicate.',
    ].join('\n');
    writeFileSync(filePath, content);

    const first = ingestPath(mem, filePath, { agent: 'test-agent', dedupThreshold: 0.1 });
    expect(first.chunksCreated).toBeGreaterThan(0);

    const second = ingestPath(mem, filePath, { agent: 'test-agent', dedupThreshold: 0.1 });
    expect(second.chunksDeduplicated).toBeGreaterThan(0);
  });

  it('applies extra tags', () => {
    const filePath = join(tmpDir, 'tagged.md');
    writeFileSync(filePath, 'Content for tagged test.');

    ingestPath(mem, filePath, { agent: 'test-agent', extraTags: ['project:demo'] });

    const stored = mem.knowledge.list('test-agent');
    expect(stored[0].tags).toContain('project:demo');
  });

  it('skips non-existent paths gracefully', () => {
    const result = ingestPath(mem, join(tmpDir, 'nope.md'), { agent: 'test-agent' });
    expect(result.filesProcessed).toBe(0);
    expect(result.skipped.length).toBe(1);
  });

  it('handles empty directory', () => {
    const emptyDir = join(tmpDir, 'empty');
    mkdirSync(emptyDir);
    const result = ingestPath(mem, emptyDir, { agent: 'test-agent' });
    expect(result.filesProcessed).toBe(0);
    expect(result.chunksIngested).toBe(0);
  });

  it('stores absolute path as source', () => {
    const filePath = join(tmpDir, 'abs.txt');
    writeFileSync(filePath, 'Absolute path test content.');

    ingestPath(mem, filePath, { agent: 'test-agent' });

    const stored = mem.knowledge.list('test-agent');
    expect(stored[0].source).toMatch(/^(\/|[A-Z]:\\)/i); // Absolute path (Unix or Windows)
  });

  it('tags include source filename and chunk index', () => {
    const filePath = join(tmpDir, 'meta.md');
    writeFileSync(filePath, 'Metadata test content.');

    ingestPath(mem, filePath, { agent: 'test-agent' });

    const stored = mem.knowledge.list('test-agent');
    expect(stored[0].tags).toContain('source:meta.md');
    expect(stored[0].tags).toContain('chunk:0');
  });
});
