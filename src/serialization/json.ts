import { RepoMemoryError } from '../types/errors.js';

export function safeJsonParse<T>(raw: string, fallback?: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new RepoMemoryError('PARSE_ERROR', `Invalid JSON: ${(e as Error).message}`, e);
  }
}

export function safeJsonStringify(value: unknown, pretty = false): string {
  return JSON.stringify(value, null, pretty ? 2 : undefined);
}
