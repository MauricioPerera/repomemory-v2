import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve, basename } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadedFile {
  /** Absolute file path */
  filePath: string;
  /** File content as UTF-8 string */
  content: string;
  /** Last modification time (ISO string) */
  mtime: string;
}

export interface LoadOptions {
  /** File extensions to include (with dot, e.g. '.md'). Default: all supported */
  extensions?: string[];
  /** Patterns to exclude (substring match on path) */
  exclude?: string[];
  /** Maximum recursion depth. Default: 10 */
  maxDepth?: number;
  /** Maximum file size in bytes. Default: 1_048_576 (1 MB) */
  maxFileSize?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = new Set([
  '.md', '.txt', '.ts', '.js', '.json', '.py', '.html', '.css',
]);

const DEFAULT_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__pycache__']);
const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_FILE_SIZE = 1_048_576; // 1 MB

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load a single file. Throws if file doesn't exist or can't be read. */
export function loadFile(filePath: string): LoadedFile {
  const abs = resolve(filePath);
  const stat = statSync(abs);
  const content = readFileSync(abs, 'utf8');
  return { filePath: abs, content, mtime: stat.mtime.toISOString() };
}

/** Load all supported files from a directory (recursive). */
export function loadDirectory(dirPath: string, options?: LoadOptions): LoadedFile[] {
  const abs = resolve(dirPath);
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const allowedExts = options?.extensions
    ? new Set(options.extensions.map(e => e.startsWith('.') ? e : '.' + e))
    : SUPPORTED_EXTENSIONS;
  const exclude = options?.exclude ?? [];
  const files: LoadedFile[] = [];

  walk(abs, 0, maxDepth, allowedExts, exclude, maxFileSize, files);

  // Sort by path for deterministic ordering
  files.sort((a, b) => a.filePath.localeCompare(b.filePath));
  return files;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function walk(
  dir: string,
  depth: number,
  maxDepth: number,
  allowedExts: Set<string>,
  exclude: string[],
  maxFileSize: number,
  out: LoadedFile[],
): void {
  if (depth > maxDepth) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    const full = join(dir, entry);

    // Check exclusion patterns
    if (exclude.some(pat => full.includes(pat))) continue;

    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue; // Skip files we can't stat
    }

    if (stat.isDirectory()) {
      const name = basename(full);
      // Skip hidden dirs and known non-content dirs
      if (name.startsWith('.') || DEFAULT_SKIP_DIRS.has(name)) continue;
      walk(full, depth + 1, maxDepth, allowedExts, exclude, maxFileSize, out);
    } else if (stat.isFile()) {
      const ext = extname(full).toLowerCase();
      if (!allowedExts.has(ext)) continue;
      if (stat.size > maxFileSize) continue;
      if (stat.size === 0) continue;

      try {
        const content = readFileSync(full, 'utf8');
        out.push({ filePath: full, content, mtime: stat.mtime.toISOString() });
      } catch {
        // Skip unreadable files
      }
    }
  }
}
