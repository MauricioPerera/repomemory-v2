import type { RepoMemory } from './index.js';
import type { StorageEngine } from './storage/engine.js';
import type { Entity } from './types/entities.js';

export interface CleanupOptions {
  maxAgeDays?: number;
  maxAuditLines?: number;
  dryRun?: boolean;
}

export interface CleanupReport {
  removed: number;
  preserved: number;
  auditRotated: boolean;
  details: Array<{ id: string; type: string; reason: string }>;
}

const ENTITY_PREFIXES = ['memories', 'skills', 'knowledge'] as const;

export function runCleanup(repo: RepoMemory, storage: StorageEngine, options: CleanupOptions = {}): CleanupReport {
  const maxAgeDays = options.maxAgeDays ?? 90;
  const maxAuditLines = options.maxAuditLines;
  const dryRun = options.dryRun ?? false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffStr = cutoff.toISOString();

  const report: CleanupReport = {
    removed: 0,
    preserved: 0,
    auditRotated: false,
    details: [],
  };

  // Iterate over all entity prefixes
  for (const prefix of ENTITY_PREFIXES) {
    const entities = storage.listEntitiesByPrefix(prefix);
    for (const entity of entities) {
      if (entity.updatedAt < cutoffStr) {
        report.details.push({
          id: entity.id,
          type: entity.type,
          reason: `updatedAt ${entity.updatedAt} is older than ${maxAgeDays} days`,
        });
        if (!dryRun) {
          deleteEntityFromRepo(repo, entity);
        }
        report.removed++;
      } else {
        report.preserved++;
      }
    }
  }

  // Rotate audit log if requested
  if (maxAuditLines !== undefined && maxAuditLines > 0) {
    if (!dryRun) {
      storage.audit.rotate(maxAuditLines);
    }
    report.auditRotated = true;
  }

  return report;
}

function deleteEntityFromRepo(repo: RepoMemory, entity: Entity): void {
  switch (entity.type) {
    case 'memory':
      repo.memories.delete(entity.id);
      break;
    case 'skill':
      repo.skills.delete(entity.id);
      break;
    case 'knowledge':
      repo.knowledge.delete(entity.id);
      break;
    default:
      // Sessions and profiles are not cleaned up by TTL
      break;
  }
}
