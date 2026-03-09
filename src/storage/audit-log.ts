import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { safeJsonStringify } from '../serialization/json.js';
import { atomicWriteFileSync } from './atomic-write.js';

export interface AuditEntry {
  timestamp: string;
  operation: string;
  entityType: string;
  entityId: string;
  commitHash?: string;
  author?: string;
}

export class AuditLog {
  private readonly path: string;

  constructor(baseDir: string) {
    this.path = join(baseDir, 'log', 'operations.jsonl');
  }

  init(): void {
    mkdirSync(dirname(this.path), { recursive: true });
  }

  append(entry: Omit<AuditEntry, 'timestamp'>): void {
    const full: AuditEntry = { timestamp: new Date().toISOString(), ...entry };
    appendFileSync(this.path, safeJsonStringify(full) + '\n', 'utf8');
  }

  read(): AuditEntry[] {
    if (!existsSync(this.path)) return [];
    const content = readFileSync(this.path, 'utf8').trim();
    if (!content) return [];
    const entries: AuditEntry[] = [];
    for (const line of content.split('\n')) {
      try {
        entries.push(JSON.parse(line) as AuditEntry);
      } catch {
        // Skip corrupted lines instead of crashing the entire read
      }
    }
    return entries;
  }

  /**
   * Rotate the audit log, keeping only the last `maxLines` entries.
   */
  rotate(maxLines: number): void {
    if (!existsSync(this.path)) return;
    const content = readFileSync(this.path, 'utf8').trim();
    if (!content) return;
    const lines = content.split('\n');
    if (lines.length <= maxLines) return;
    // Keep only valid JSON lines during rotation (filter corrupted entries)
    const kept = lines.slice(lines.length - maxLines).filter(line => {
      try { JSON.parse(line); return true; } catch { return false; }
    });
    atomicWriteFileSync(this.path, kept.join('\n') + '\n');
  }
}
