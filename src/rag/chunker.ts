import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChunkStrategy = 'fixed' | 'paragraph' | 'markdown';

export interface ChunkOptions {
  /** Target chunk size in characters. Default: 1000 */
  chunkSize?: number;
  /** Overlap between adjacent chunks in characters. Default: 200 */
  overlap?: number;
  /** Chunking strategy. Default: 'paragraph' */
  strategy?: ChunkStrategy;
}

export interface Chunk {
  /** The text content of this chunk */
  text: string;
  /** Zero-based index within the source */
  index: number;
  /** SHA-256 hex hash of the chunk text */
  hash: string;
  /** Character offset in the original text */
  startOffset: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// ---------------------------------------------------------------------------
// Fixed-size strategy
// ---------------------------------------------------------------------------

function chunkFixed(text: string, chunkSize: number, overlap: number): Chunk[] {
  if (text.length === 0) return [];
  const chunks: Chunk[] = [];
  const step = Math.max(1, chunkSize - overlap);
  let offset = 0;
  let idx = 0;

  while (offset < text.length) {
    const slice = text.slice(offset, offset + chunkSize);
    chunks.push({ text: slice, index: idx, hash: hashText(slice), startOffset: offset });
    idx++;
    offset += step;
    if (offset >= text.length && chunks[chunks.length - 1].text.length < chunkSize && chunks.length > 1) break;
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Paragraph strategy
// ---------------------------------------------------------------------------

function chunkByParagraph(text: string, chunkSize: number, overlap: number): Chunk[] {
  if (text.length === 0) return [];

  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  if (paragraphs.length === 0) return [];

  const chunks: Chunk[] = [];
  let current = '';
  let currentStart = 0;
  let idx = 0;
  let searchFrom = 0;

  for (const para of paragraphs) {
    // If a single paragraph exceeds chunkSize, split it with fixed strategy
    if (para.length > chunkSize) {
      // Flush what we have
      if (current.trim().length > 0) {
        const trimmed = current.trim();
        chunks.push({ text: trimmed, index: idx, hash: hashText(trimmed), startOffset: currentStart });
        idx++;
      }
      // Split the oversized paragraph with fixed strategy
      const subChunks = chunkFixed(para, chunkSize, overlap);
      const paraStart = text.indexOf(para, searchFrom);
      for (const sc of subChunks) {
        chunks.push({ text: sc.text, index: idx, hash: sc.hash, startOffset: paraStart >= 0 ? paraStart + sc.startOffset : sc.startOffset });
        idx++;
      }
      current = '';
      searchFrom = paraStart >= 0 ? paraStart + para.length : searchFrom;
      currentStart = searchFrom;
      continue;
    }

    const separator = current.length > 0 ? '\n\n' : '';
    if (current.length + separator.length + para.length > chunkSize && current.length > 0) {
      // Flush current chunk
      const trimmed = current.trim();
      chunks.push({ text: trimmed, index: idx, hash: hashText(trimmed), startOffset: currentStart });
      idx++;

      // Apply overlap: keep trailing text from previous chunk
      if (overlap > 0 && trimmed.length > 0) {
        const overlapText = trimmed.slice(-overlap);
        current = overlapText + '\n\n' + para;
      } else {
        current = para;
      }
      const paraPos = text.indexOf(para, searchFrom);
      currentStart = paraPos >= 0 ? Math.max(0, paraPos - (overlap > 0 ? overlap : 0)) : currentStart;
      searchFrom = paraPos >= 0 ? paraPos + para.length : searchFrom;
    } else {
      if (current.length === 0) {
        const paraPos = text.indexOf(para, searchFrom);
        currentStart = paraPos >= 0 ? paraPos : currentStart;
        searchFrom = paraPos >= 0 ? paraPos + para.length : searchFrom;
      } else {
        const paraPos = text.indexOf(para, searchFrom);
        searchFrom = paraPos >= 0 ? paraPos + para.length : searchFrom;
      }
      current += separator + para;
    }
  }

  // Flush remaining
  if (current.trim().length > 0) {
    const trimmed = current.trim();
    chunks.push({ text: trimmed, index: idx, hash: hashText(trimmed), startOffset: currentStart });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Markdown strategy
// ---------------------------------------------------------------------------

function chunkMarkdown(text: string, chunkSize: number, overlap: number): Chunk[] {
  if (text.length === 0) return [];

  // Split on markdown headers, keeping headers attached to their content
  const sections: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && current.trim().length > 0) {
      sections.push(current);
      current = line + '\n';
    } else {
      current += line + '\n';
    }
  }
  if (current.trim().length > 0) sections.push(current);

  if (sections.length === 0) return [];

  // Now merge sections into chunks respecting chunkSize
  const chunks: Chunk[] = [];
  let buffer = '';
  let bufferStart = 0;
  let idx = 0;
  let searchFrom = 0;

  for (const section of sections) {
    if (section.length > chunkSize && buffer.trim().length === 0) {
      // Oversized section — split with paragraph strategy
      const subChunks = chunkByParagraph(section.trim(), chunkSize, overlap);
      const secPos = text.indexOf(section.trim(), searchFrom);
      for (const sc of subChunks) {
        chunks.push({
          text: sc.text,
          index: idx,
          hash: sc.hash,
          startOffset: secPos >= 0 ? secPos + sc.startOffset : sc.startOffset,
        });
        idx++;
      }
      searchFrom = secPos >= 0 ? secPos + section.trim().length : searchFrom;
      continue;
    }

    if (buffer.length + section.length > chunkSize && buffer.trim().length > 0) {
      // Flush buffer
      const trimmed = buffer.trim();
      chunks.push({ text: trimmed, index: idx, hash: hashText(trimmed), startOffset: bufferStart });
      idx++;

      // Overlap: prefix next chunk with tail of previous
      if (overlap > 0) {
        const overlapText = trimmed.slice(-overlap);
        buffer = overlapText + '\n\n' + section;
      } else {
        buffer = section;
      }
      const secPos = text.indexOf(section.trimStart(), searchFrom);
      bufferStart = secPos >= 0 ? Math.max(0, secPos - (overlap > 0 ? overlap : 0)) : bufferStart;
      searchFrom = secPos >= 0 ? secPos + section.length : searchFrom;
    } else {
      if (buffer.length === 0) {
        const secPos = text.indexOf(section.trimStart(), searchFrom);
        bufferStart = secPos >= 0 ? secPos : bufferStart;
        searchFrom = secPos >= 0 ? secPos + section.length : searchFrom;
      } else {
        const secPos = text.indexOf(section.trimStart(), searchFrom);
        searchFrom = secPos >= 0 ? secPos + section.length : searchFrom;
      }
      buffer += section;
    }
  }

  if (buffer.trim().length > 0) {
    const trimmed = buffer.trim();
    chunks.push({ text: trimmed, index: idx, hash: hashText(trimmed), startOffset: bufferStart });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Detect chunking strategy from file extension. */
export function detectStrategy(filePath: string): ChunkStrategy {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  if (ext === 'md') return 'markdown';
  if (['txt', 'html', 'css'].includes(ext)) return 'paragraph';
  return 'fixed';
}

/** Split text into chunks using the specified strategy. */
export function chunkText(text: string, options?: ChunkOptions): Chunk[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;
  const strategy = options?.strategy ?? 'paragraph';

  if (overlap >= chunkSize) {
    throw new Error('Overlap must be less than chunkSize');
  }

  switch (strategy) {
    case 'fixed': return chunkFixed(text, chunkSize, overlap);
    case 'paragraph': return chunkByParagraph(text, chunkSize, overlap);
    case 'markdown': return chunkMarkdown(text, chunkSize, overlap);
  }
}
