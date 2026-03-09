import { statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { chunkText, detectStrategy } from './chunker.js';
import { loadFile, loadDirectory } from './loader.js';
import type { ChunkOptions } from './chunker.js';
import type { LoadOptions } from './loader.js';
import type { RepoMemory } from '../index.js';
import type { Knowledge } from '../types/entities.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestOptions extends ChunkOptions, LoadOptions {
  /** Agent ID to scope knowledge to. Required. */
  agent: string;
  /** Dedup threshold for saveOrUpdate. Default: 0.2 */
  dedupThreshold?: number;
  /** Extra tags to add to all chunks */
  extraTags?: string[];
}

export interface IngestResult {
  filesProcessed: number;
  chunksIngested: number;
  chunksCreated: number;
  chunksDeduplicated: number;
  skipped: Array<{ filePath: string; reason: string }>;
  entities: Knowledge[];
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function ingestSingleFile(
  mem: RepoMemory,
  filePath: string,
  content: string,
  options: IngestOptions,
): { entities: Knowledge[]; created: number; deduped: number } {
  const absPath = resolve(filePath);
  const strategy = options.strategy ?? detectStrategy(absPath);
  const chunks = chunkText(content, {
    chunkSize: options.chunkSize,
    overlap: options.overlap,
    strategy,
  });

  const entities: Knowledge[] = [];
  let created = 0;
  let deduped = 0;

  for (const chunk of chunks) {
    const tags = ['rag', `source:${basename(absPath)}`, `chunk:${chunk.index}`];
    if (options.extraTags) tags.push(...options.extraTags);

    const [entity, , info] = mem.knowledge.saveOrUpdate(
      options.agent,
      {
        content: chunk.text,
        source: absPath,
        chunkIndex: chunk.index,
        version: chunk.hash,
        tags,
      },
      options.dedupThreshold ?? 0.2,
    );

    entities.push(entity);
    if (info.deduplicated) deduped++;
    else created++;
  }

  return { entities, created, deduped };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Ingest a file or directory into the knowledge store. */
export function ingestPath(
  mem: RepoMemory,
  path: string,
  options: IngestOptions,
): IngestResult {
  const abs = resolve(path);
  const result: IngestResult = {
    filesProcessed: 0,
    chunksIngested: 0,
    chunksCreated: 0,
    chunksDeduplicated: 0,
    skipped: [],
    entities: [],
  };

  let stat;
  try {
    stat = statSync(abs);
  } catch (err) {
    result.skipped.push({ filePath: abs, reason: err instanceof Error ? err.message : String(err) });
    return result;
  }

  if (stat.isFile()) {
    try {
      const file = loadFile(abs);
      const r = ingestSingleFile(mem, file.filePath, file.content, options);
      result.filesProcessed = 1;
      result.chunksIngested = r.entities.length;
      result.chunksCreated = r.created;
      result.chunksDeduplicated = r.deduped;
      result.entities = r.entities;
    } catch (err) {
      result.skipped.push({ filePath: abs, reason: err instanceof Error ? err.message : String(err) });
    }
  } else if (stat.isDirectory()) {
    const files = loadDirectory(abs, options);
    for (const file of files) {
      try {
        const r = ingestSingleFile(mem, file.filePath, file.content, options);
        result.filesProcessed++;
        result.chunksIngested += r.entities.length;
        result.chunksCreated += r.created;
        result.chunksDeduplicated += r.deduped;
        result.entities.push(...r.entities);
      } catch (err) {
        result.skipped.push({ filePath: file.filePath, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return result;
}
