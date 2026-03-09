import { resolve, basename } from 'node:path';
import { loadDirectory } from './loader.js';
import { chunkText, detectStrategy } from './chunker.js';
import type { ChunkOptions } from './chunker.js';
import type { IngestOptions, IngestResult } from './ingest.js';
import type { RepoMemory } from '../index.js';
import type { Knowledge } from '../types/entities.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult extends IngestResult {
  unchangedFiles: number;
  modifiedFiles: number;
  newFiles: number;
  deletedFiles: number;
  chunksRemoved: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ingestFromContent(
  mem: RepoMemory,
  filePath: string,
  content: string,
  options: IngestOptions,
): IngestResult {
  const strategy = options.strategy ?? detectStrategy(filePath);
  const chunks = chunkText(content, {
    chunkSize: options.chunkSize,
    overlap: options.overlap,
    strategy,
  });

  const ir: IngestResult = {
    filesProcessed: 1,
    chunksIngested: 0,
    chunksCreated: 0,
    chunksDeduplicated: 0,
    skipped: [],
    entities: [],
  };

  for (const chunk of chunks) {
    const tags = ['rag', `source:${basename(filePath)}`, `chunk:${chunk.index}`];
    if (options.extraTags) tags.push(...options.extraTags);

    const [entity, , info] = mem.knowledge.saveOrUpdate(
      options.agent,
      {
        content: chunk.text,
        source: filePath,
        chunkIndex: chunk.index,
        version: chunk.hash,
        tags,
      },
      options.dedupThreshold ?? 0.2,
    );

    ir.entities.push(entity);
    ir.chunksIngested++;
    if (info.deduplicated) ir.chunksDeduplicated++;
    else ir.chunksCreated++;
  }

  return ir;
}

function mergeIngestResult(target: SyncResult, source: IngestResult): void {
  target.filesProcessed += source.filesProcessed;
  target.chunksIngested += source.chunksIngested;
  target.chunksCreated += source.chunksCreated;
  target.chunksDeduplicated += source.chunksDeduplicated;
  target.skipped.push(...source.skipped);
  target.entities.push(...source.entities);
}

function computeChunkHashes(content: string, opts: ChunkOptions & { filePath: string }): string[] {
  const strategy = opts.strategy ?? detectStrategy(opts.filePath);
  const chunks = chunkText(content, {
    chunkSize: opts.chunkSize,
    overlap: opts.overlap,
    strategy,
  });
  return chunks.map(c => c.hash).sort();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Sync a directory: detect changes, re-ingest modified/new, remove deleted chunks. */
export function syncDirectory(
  mem: RepoMemory,
  dirPath: string,
  options: IngestOptions,
): SyncResult {
  const absDir = resolve(dirPath);

  // 1. Load current files from disk
  const diskFiles = loadDirectory(absDir, options);
  const diskMap = new Map<string, string>(); // filePath → content
  for (const f of diskFiles) {
    diskMap.set(f.filePath, f.content);
  }

  // 2. Load existing knowledge entities for this agent (RAG-sourced only)
  const allKnowledge = mem.knowledge.list(options.agent);
  const ragEntities = allKnowledge.filter(
    (k: Knowledge) => k.source && k.source.startsWith(absDir),
  );

  // Group by source
  const storedMap = new Map<string, Knowledge[]>();
  for (const k of ragEntities) {
    const src = k.source!;
    const arr = storedMap.get(src) ?? [];
    arr.push(k);
    storedMap.set(src, arr);
  }

  // 3. Classify and process files
  const result: SyncResult = {
    filesProcessed: 0,
    chunksIngested: 0,
    chunksCreated: 0,
    chunksDeduplicated: 0,
    skipped: [],
    entities: [],
    unchangedFiles: 0,
    modifiedFiles: 0,
    newFiles: 0,
    deletedFiles: 0,
    chunksRemoved: 0,
  };

  const processedSources = new Set<string>();

  for (const [filePath, content] of diskMap) {
    processedSources.add(filePath);
    const existing = storedMap.get(filePath);

    if (!existing || existing.length === 0) {
      // New file
      result.newFiles++;
      const ir = ingestFromContent(mem, filePath, content, options);
      mergeIngestResult(result, ir);
    } else {
      // Compare chunk hashes to detect changes
      const storedHashes = existing.map(k => k.version ?? '').sort();
      const newHashes = computeChunkHashes(content, { ...options, filePath });

      const unchanged = storedHashes.length === newHashes.length &&
        storedHashes.every((h, i) => h === newHashes[i]);

      if (unchanged) {
        result.unchangedFiles++;
      } else {
        // Modified — delete old chunks, re-ingest
        result.modifiedFiles++;
        const ids = existing.map(k => k.id);
        mem.knowledge.deleteMany(ids);
        result.chunksRemoved += ids.length;

        const ir = ingestFromContent(mem, filePath, content, options);
        mergeIngestResult(result, ir);
      }
    }
  }

  // 4. Handle deleted files
  for (const [sourcePath, entities] of storedMap) {
    if (!processedSources.has(sourcePath)) {
      result.deletedFiles++;
      const ids = entities.map(k => k.id);
      mem.knowledge.deleteMany(ids);
      result.chunksRemoved += ids.length;
    }
  }

  return result;
}
