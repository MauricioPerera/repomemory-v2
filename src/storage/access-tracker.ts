import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeJsonParse, safeJsonStringify } from '../serialization/json.js';
import { atomicWriteFileSync } from './atomic-write.js';

export class AccessTracker {
  private counts = new Map<string, number>();
  private readonly filePath: string;
  private dirty = false;

  constructor(baseDir: string) {
    const dir = join(baseDir, 'index');
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, 'access-counts.json');
    this.load();
  }

  increment(entityId: string): void {
    this.counts.set(entityId, (this.counts.get(entityId) ?? 0) + 1);
    this.dirty = true;
  }

  incrementMany(entityIds: string[]): void {
    for (const id of entityIds) {
      this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    }
    if (entityIds.length > 0) this.dirty = true;
  }

  get(entityId: string): number {
    return this.counts.get(entityId) ?? 0;
  }

  remove(entityId: string): void {
    if (this.counts.delete(entityId)) {
      this.dirty = true;
    }
  }

  flush(): void {
    if (!this.dirty) return;
    this.persist();
    this.dirty = false;
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    const data = safeJsonParse<Record<string, number>>(readFileSync(this.filePath, 'utf8'), {});
    this.counts = new Map(Object.entries(data));
  }

  private persist(): void {
    atomicWriteFileSync(this.filePath, safeJsonStringify(Object.fromEntries(this.counts)));
  }
}
