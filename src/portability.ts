import type { Entity, EntityType, Memory, Skill, Knowledge, Session, Profile } from './types/entities.js';
import { scopeFromEntity } from './scoping.js';
import type { StorageEngine } from './storage/engine.js';
import type { SearchEngine } from './search/search-engine.js';
import type { AccessTracker } from './storage/access-tracker.js';
import { RepoMemoryError } from './types/errors.js';

const EXPORT_VERSION = 1;
const PACK_VERSION = 2;

const VALID_ENTITY_TYPES: ReadonlySet<EntityType> = new Set(['memory', 'skill', 'knowledge', 'session', 'profile']);

/** Validate minimum required fields for an entity before import */
function validateEntity(entity: unknown, index: number): entity is Entity {
  if (!entity || typeof entity !== 'object') {
    throw new RepoMemoryError('INVALID_INPUT', `Import entity[${index}]: not an object`);
  }
  const e = entity as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id.length === 0) {
    throw new RepoMemoryError('INVALID_INPUT', `Import entity[${index}]: missing or invalid id`);
  }
  if (typeof e.type !== 'string' || !VALID_ENTITY_TYPES.has(e.type as EntityType)) {
    throw new RepoMemoryError('INVALID_INPUT', `Import entity[${index}] (${e.id}): invalid type '${e.type}'`);
  }
  if (typeof e.content !== 'string') {
    throw new RepoMemoryError('INVALID_INPUT', `Import entity[${index}] (${e.id}): missing content`);
  }
  if (typeof e.createdAt !== 'string') {
    throw new RepoMemoryError('INVALID_INPUT', `Import entity[${index}] (${e.id}): missing createdAt`);
  }
  if (typeof e.updatedAt !== 'string') {
    throw new RepoMemoryError('INVALID_INPUT', `Import entity[${index}] (${e.id}): missing updatedAt`);
  }
  return true;
}

export interface ExportData {
  version: number;
  exportedAt: string;
  entities: {
    memories: Memory[];
    skills: Skill[];
    knowledge: Knowledge[];
    sessions: Session[];
    profiles: Profile[];
  };
  accessCounts: Record<string, number>;
}

export interface ImportOptions {
  /** When true, skip entities whose ID already exists. When false (default), overwrite existing. */
  skipExisting?: boolean;
}

export interface ImportReport {
  imported: number;
  skipped: number;
  overwritten: number;
  byType: { memories: number; skills: number; knowledge: number; sessions: number; profiles: number };
}

/**
 * Export all live entities and access counts from a RepoMemory instance.
 */
export function exportData(
  storage: StorageEngine,
  accessTracker: AccessTracker,
): ExportData {
  const memories: Memory[] = [];
  const skills: Skill[] = [];
  const knowledge: Knowledge[] = [];
  const sessions: Session[] = [];
  const profiles: Profile[] = [];
  const accessCounts: Record<string, number> = {};

  // Walk all refs to collect live entities
  const allRefs = storage.refs.listAll();
  for (const refPath of allRefs) {
    const ref = storage.refs.get(refPath);
    if (!ref) continue;
    const commit = storage.commits.read(ref.head);
    if (commit.objectHash === 'TOMBSTONE') continue;
    const obj = storage.objects.read(commit.objectHash);
    const entity = obj.data as Entity;

    // Attach current access count
    const count = accessTracker.get(entity.id);
    if (count > 0) accessCounts[entity.id] = count;

    switch (entity.type) {
      case 'memory': memories.push(entity); break;
      case 'skill': skills.push(entity); break;
      case 'knowledge': knowledge.push(entity); break;
      case 'session': sessions.push(entity); break;
      case 'profile': profiles.push(entity); break;
    }
  }

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    entities: { memories, skills, knowledge, sessions, profiles },
    accessCounts,
  };
}

/**
 * Import entities from an ExportData payload into a RepoMemory instance.
 * Entities are re-saved preserving their original IDs and timestamps.
 */
export function importData(
  storage: StorageEngine,
  searchEngine: SearchEngine,
  accessTracker: AccessTracker,
  data: ExportData,
  options: ImportOptions = {},
): ImportReport {
  if (!data || typeof data !== 'object' || !data.entities) {
    throw new RepoMemoryError('INVALID_INPUT', 'Invalid export data: missing entities');
  }
  if (data.version !== EXPORT_VERSION) {
    throw new RepoMemoryError('INVALID_INPUT', `Unsupported export version: ${data.version} (expected ${EXPORT_VERSION})`);
  }

  const skipExisting = options.skipExisting ?? false;
  let imported = 0;
  let skipped = 0;
  let overwritten = 0;
  const byType = { memories: 0, skills: 0, knowledge: 0, sessions: 0, profiles: 0 };

  const allEntities: Entity[] = [
    ...(data.entities.memories ?? []),
    ...(data.entities.skills ?? []),
    ...(data.entities.knowledge ?? []),
    ...(data.entities.sessions ?? []),
    ...(data.entities.profiles ?? []),
  ];

  // Pre-validate all entities and detect duplicate IDs within the import data
  const seenIds = new Set<string>();
  for (let i = 0; i < allEntities.length; i++) {
    const entity = allEntities[i];
    validateEntity(entity, i);
    if (seenIds.has(entity.id)) {
      throw new RepoMemoryError('INVALID_INPUT', `Import contains duplicate entity ID: ${entity.id} (at index ${i})`);
    }
    seenIds.add(entity.id);
  }

  for (let i = 0; i < allEntities.length; i++) {
    const entity = allEntities[i];
    const existing = storage.load(entity.id);

    if (existing) {
      if (skipExisting) {
        skipped++;
        continue;
      }
      overwritten++;
    }

    // Save entity (creates object + commit + updates ref + lookup)
    storage.save(entity);

    // Index in search engine
    searchEngine.indexEntity(scopeFromEntity(entity), entity);

    imported++;
    incrementTypeCount(byType, entity.type);
  }

  // Restore access counts
  for (const [entityId, count] of Object.entries(data.accessCounts ?? {})) {
    for (let i = 0; i < count; i++) {
      accessTracker.increment(entityId);
    }
  }

  searchEngine.flush();
  accessTracker.flush();

  return { imported, skipped, overwritten, byType };
}

function incrementTypeCount(
  byType: ImportReport['byType'],
  type: Entity['type'],
): void {
  switch (type) {
    case 'memory': byType.memories++; break;
    case 'skill': byType.skills++; break;
    case 'knowledge': byType.knowledge++; break;
    case 'session': byType.sessions++; break;
    case 'profile': byType.profiles++; break;
  }
}

// ---------------------------------------------------------------------------
// Filtered export (v2 pack format) — inspired by MicroExpert memory packs
// ---------------------------------------------------------------------------

export interface PackMetadata {
  name: string;
  description?: string;
  author?: string;
  packVersion?: string;
  url?: string;
  models?: string[];
  packTags?: string[];
}

export interface ExportFilter {
  /** Full-text search query to filter entities */
  query?: string;
  /** Only include entities with ALL of these tags */
  tags?: string[];
  /** Entity types to include (default: all) */
  types?: EntityType[];
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by user ID */
  userId?: string;
}

export interface PackExportData {
  version: number;
  exportedAt: string;
  agentId?: string;
  userId?: string;
  count: number;
  pack?: PackMetadata;
  entities: {
    memories: Memory[];
    skills: Skill[];
    knowledge: Knowledge[];
    sessions: Session[];
    profiles: Profile[];
  };
  accessCounts: Record<string, number>;
}

/**
 * Export entities with optional filtering and pack metadata.
 * Supports query-based filtering, tag filtering, and type filtering.
 * Returns v2 pack format when pack metadata is provided, v1 otherwise.
 *
 * This feature was developed in MicroExpert to enable distributable
 * Memory Packs — versioned JSON files solving the cold-start problem
 * for new agent instances.
 */
export function exportFiltered(
  storage: StorageEngine,
  _searchEngine: SearchEngine,
  accessTracker: AccessTracker,
  filter?: ExportFilter,
  pack?: PackMetadata,
): PackExportData {
  const memories: Memory[] = [];
  const skills: Skill[] = [];
  const knowledge: Knowledge[] = [];
  const sessions: Session[] = [];
  const profiles: Profile[] = [];
  const accessCounts: Record<string, number> = {};

  const typesFilter = filter?.types ? new Set(filter.types) : null;
  const tagsFilter = filter?.tags?.map(t => t.toLowerCase());

  // Walk all refs to collect live entities
  const allRefs = storage.refs.listAll();
  for (const refPath of allRefs) {
    const ref = storage.refs.get(refPath);
    if (!ref) continue;
    const commit = storage.commits.read(ref.head);
    if (commit.objectHash === 'TOMBSTONE') continue;
    const obj = storage.objects.read(commit.objectHash);
    const entity = obj.data as Entity;

    // Type filter
    if (typesFilter && !typesFilter.has(entity.type)) continue;

    // Agent ID filter
    if (filter?.agentId && 'agentId' in entity && entity.agentId !== filter.agentId) continue;

    // User ID filter
    if (filter?.userId && 'userId' in entity && entity.userId !== filter.userId) continue;

    // Tag filter (entity must have ALL specified tags)
    if (tagsFilter && tagsFilter.length > 0) {
      const entityTags = 'tags' in entity ? (entity.tags as string[]).map(t => t.toLowerCase()) : [];
      const hasAllTags = tagsFilter.every(t => entityTags.includes(t));
      if (!hasAllTags) continue;
    }

    // Query filter (content must contain query terms)
    if (filter?.query) {
      const queryLower = filter.query.toLowerCase();
      const contentLower = entity.content.toLowerCase();
      const tagsStr = 'tags' in entity ? (entity.tags as string[]).join(' ').toLowerCase() : '';
      if (!contentLower.includes(queryLower) && !tagsStr.includes(queryLower)) continue;
    }

    // Attach access count
    const count = accessTracker.get(entity.id);
    if (count > 0) accessCounts[entity.id] = count;

    switch (entity.type) {
      case 'memory': memories.push(entity); break;
      case 'skill': skills.push(entity); break;
      case 'knowledge': knowledge.push(entity); break;
      case 'session': sessions.push(entity); break;
      case 'profile': profiles.push(entity); break;
    }
  }

  const totalCount = memories.length + skills.length + knowledge.length + sessions.length + profiles.length;

  return {
    version: pack ? PACK_VERSION : EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    agentId: filter?.agentId,
    userId: filter?.userId,
    count: totalCount,
    pack,
    entities: { memories, skills, knowledge, sessions, profiles },
    accessCounts,
  };
}
