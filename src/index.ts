import { StorageEngine } from './storage/engine.js';
import { SearchEngine } from './search/search-engine.js';
import { SnapshotManager } from './storage/snapshot.js';
import { AccessTracker } from './storage/access-tracker.js';
import { MemoryCollection } from './collections/memories.js';
import { SkillCollection } from './collections/skills.js';
import { KnowledgeCollection } from './collections/knowledge.js';
import { SessionCollection } from './collections/sessions.js';
import { ProfileCollection } from './collections/profiles.js';
import type { RepoMemoryConfig } from './types/config.js';
import type { AiProvider } from './types/ai.js';
import type { SnapshotInfo, VerifyResult } from './types/results.js';
import type { MiningResult, ConsolidationReport, SkillConsolidationReport, KnowledgeConsolidationReport } from './types/results.js';
import { RepoMemoryError } from './types/errors.js';

export class RepoMemory {
  readonly memories: MemoryCollection;
  readonly skills: SkillCollection;
  readonly knowledge: KnowledgeCollection;
  readonly sessions: SessionCollection;
  readonly profiles: ProfileCollection;

  private readonly storage: StorageEngine;
  private readonly searchEngine: SearchEngine;
  private readonly snapshots: SnapshotManager;
  private readonly accessTracker: AccessTracker;
  private readonly ai?: AiProvider;

  constructor(config: RepoMemoryConfig) {
    this.storage = new StorageEngine(config.dir);
    this.searchEngine = new SearchEngine(config.dir);
    this.snapshots = new SnapshotManager(config.dir);
    this.accessTracker = new AccessTracker(config.dir);
    this.ai = config.ai;

    this.storage.init();
    this.searchEngine.init();
    this.snapshots.init();

    this.memories = new MemoryCollection(this.storage, this.searchEngine, this.accessTracker);
    this.skills = new SkillCollection(this.storage, this.searchEngine, this.accessTracker);
    this.knowledge = new KnowledgeCollection(this.storage, this.searchEngine, this.accessTracker);
    this.sessions = new SessionCollection(this.storage, this.searchEngine);
    this.profiles = new ProfileCollection(this.storage, this.searchEngine);
  }

  flush(): void {
    this.searchEngine.flush();
    this.accessTracker.flush();
  }

  snapshot(label: string): SnapshotInfo {
    return this.snapshots.create(label);
  }

  restore(snapshotId: string): void {
    this.snapshots.restore(snapshotId);
  }

  listSnapshots(): SnapshotInfo[] {
    return this.snapshots.list();
  }

  async mine(sessionId: string): Promise<MiningResult> {
    if (!this.ai) {
      throw new RepoMemoryError('AI_NOT_CONFIGURED', 'AI provider required for mining');
    }
    const { MiningPipeline } = await import('./pipelines/mining.js');
    const pipeline = new MiningPipeline(this.ai, this);
    return pipeline.run(sessionId);
  }

  async consolidate(agentId: string, userId: string): Promise<ConsolidationReport> {
    if (!this.ai) {
      throw new RepoMemoryError('AI_NOT_CONFIGURED', 'AI provider required for consolidation');
    }
    const { ConsolidationPipeline } = await import('./pipelines/consolidation.js');
    const pipeline = new ConsolidationPipeline(this.ai, this);
    return pipeline.run(agentId, userId);
  }

  async consolidateSkills(agentId: string): Promise<SkillConsolidationReport> {
    if (!this.ai) {
      throw new RepoMemoryError('AI_NOT_CONFIGURED', 'AI provider required for consolidation');
    }
    const { SkillConsolidationPipeline } = await import('./pipelines/consolidation.js');
    const pipeline = new SkillConsolidationPipeline(this.ai, this);
    return pipeline.run(agentId);
  }

  async consolidateKnowledge(agentId: string): Promise<KnowledgeConsolidationReport> {
    if (!this.ai) {
      throw new RepoMemoryError('AI_NOT_CONFIGURED', 'AI provider required for consolidation');
    }
    const { KnowledgeConsolidationPipeline } = await import('./pipelines/consolidation.js');
    const pipeline = new KnowledgeConsolidationPipeline(this.ai, this);
    return pipeline.run(agentId);
  }

  verify(): VerifyResult {
    const errors: string[] = [];
    const allObjects = this.storage.objects.listAll();
    const allCommits = this.storage.commits.listAll();

    for (const hash of allObjects) {
      if (!this.storage.objects.verify(hash)) {
        errors.push(`Object hash mismatch: ${hash}`);
      }
    }

    for (const hash of allCommits) {
      try {
        const commit = this.storage.commits.read(hash);
        if (commit.objectHash !== 'TOMBSTONE' && !this.storage.objects.exists(commit.objectHash)) {
          errors.push(`Commit ${hash} references missing object ${commit.objectHash}`);
        }
      } catch {
        errors.push(`Cannot read commit: ${hash}`);
      }
    }

    return {
      valid: errors.length === 0,
      totalObjects: allObjects.length,
      totalCommits: allCommits.length,
      errors,
    };
  }

  stats(): { memories: number; skills: number; knowledge: number; sessions: number; profiles: number; objects: number; commits: number } {
    return {
      memories: this.storage.refs.list('memories').length,
      skills: this.storage.refs.list('skills').length,
      knowledge: this.storage.refs.list('knowledge').length,
      sessions: this.storage.refs.list('sessions').length,
      profiles: this.storage.refs.list('profiles').length,
      objects: this.storage.objects.listAll().length,
      commits: this.storage.commits.listAll().length,
    };
  }
}

// Re-exports
export type { RepoMemoryConfig } from './types/config.js';
export { SHARED_AGENT_ID } from './types/entities.js';
export type { Memory, Skill, Knowledge, Session, Profile, Entity, EntityType } from './types/entities.js';
export type { SaveMemoryInput, SaveSkillInput, SaveKnowledgeInput, SaveSessionInput, SaveProfileInput } from './types/entities.js';
export type { SearchResult, CommitInfo, RefInfo, SnapshotInfo, VerifyResult, MiningResult, ConsolidationReport, SkillConsolidationReport, KnowledgeConsolidationReport } from './types/results.js';
export type { AiProvider, AiMessage } from './types/ai.js';
export { RepoMemoryError } from './types/errors.js';
export type { ErrorCode } from './types/errors.js';
