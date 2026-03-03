import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { safeJsonStringify } from '../serialization/json.js';

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
    return content.split('\n').map(line => JSON.parse(line) as AuditEntry);
  }
}
