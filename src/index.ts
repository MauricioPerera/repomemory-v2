import { StorageEngine } from './storage/engine.js';
import { SearchEngine } from './search/search-engine.js';
import { SnapshotManager } from './storage/snapshot.js';
import { AccessTracker } from './storage/access-tracker.js';
import { LockGuard } from './storage/lockfile.js';
import { MemoryCollection } from './collections/memories.js';
import { SkillCollection } from './collections/skills.js';
import { KnowledgeCollection } from './collections/knowledge.js';
import { SessionCollection } from './collections/sessions.js';
import { ProfileCollection } from './collections/profiles.js';
import { RepoMemoryEventBus, type EventName, type EventHandler } from './events.js';
import { RecallEngine } from './recall/engine.js';
import { runCleanup } from './cleanup.js';
import type { CleanupOptions, CleanupReport } from './cleanup.js';
import { exportData as runExport, importData as runImport } from './portability.js';
import type { ExportData, ImportOptions, ImportReport } from './portability.js';
import type { RepoMemoryConfig } from './types/config.js';
import type { AiProvider } from './types/ai.js';
import type { SnapshotInfo, VerifyResult } from './types/results.js';
import type { MiningResult, ConsolidationReport, SkillConsolidationReport, KnowledgeConsolidationReport } from './types/results.js';
import type { RecallContext, RecallOptions } from './types/results.js';
import { RepoMemoryError } from './types/errors.js';
import { MiddlewareChain } from './middleware.js';
import type { Middleware } from './middleware.js';
import type { NeuralEngine } from './neural/index.js';

export class RepoMemory {
  readonly memories: MemoryCollection;
  readonly skills: SkillCollection;
  readonly knowledge: KnowledgeCollection;
  readonly sessions: SessionCollection;
  readonly profiles: ProfileCollection;
  readonly events: RepoMemoryEventBus;

  private readonly config: RepoMemoryConfig;
  private readonly storage: StorageEngine;
  private readonly searchEngine: SearchEngine;
  private readonly snapshots: SnapshotManager;
  private readonly accessTracker: AccessTracker;
  private readonly ai?: AiProvider;
  private readonly middlewareChain: MiddlewareChain;
  private autoMineHandler?: EventHandler<'entity:save'>;
  private _neural?: NeuralEngine;
  private _neuralInitPromise?: Promise<boolean>;

  constructor(config: RepoMemoryConfig) {
    this.config = config;
    const lockEnabled = config.lockEnabled ?? true;
    this.storage = new StorageEngine(config.dir, lockEnabled);
    this.searchEngine = new SearchEngine(config.dir);
    // Pass a LockGuard to SnapshotManager so snapshots are created atomically
    const snapshotLock = new LockGuard(config.dir, lockEnabled);
    this.snapshots = new SnapshotManager(config.dir, snapshotLock);
    this.accessTracker = new AccessTracker(config.dir);
    this.ai = config.ai;
    this.events = new RepoMemoryEventBus();
    this.middlewareChain = new MiddlewareChain();

    this.storage.init();
    this.searchEngine.init();
    this.snapshots.init();

    this.memories = new MemoryCollection(this.storage, this.searchEngine, this.accessTracker, config.dedupThreshold);
    this.skills = new SkillCollection(this.storage, this.searchEngine, this.accessTracker);
    this.knowledge = new KnowledgeCollection(this.storage, this.searchEngine, this.accessTracker);
    this.sessions = new SessionCollection(this.storage, this.searchEngine);
    this.profiles = new ProfileCollection(this.storage, this.searchEngine);

    // Wire event bus, middleware, and scoring weights to all collections
    const allCollections = [this.memories, this.skills, this.knowledge, this.sessions, this.profiles];
    const scorableCollections = [this.memories, this.skills, this.knowledge];
    for (const col of allCollections) {
      col.setEventBus(this.events);
      col.setMiddleware(this.middlewareChain);
    }
    if (config.scoring) {
      for (const col of scorableCollections) {
        col.setScoringWeights(config.scoring);
      }
    }

    if (config.autoMine && config.ai) {
      this.autoMineHandler = ({ entity }) => {
        if (entity.type === 'session') {
          this.mine(entity.id).catch(err => {
            this.events.emit('session:automine:error', {
              sessionId: entity.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      };
      this.events.on('entity:save', this.autoMineHandler);
    }

    // Neural engine lazy-init (if configured)
    if (config.neural?.enabled) {
      this._neuralInitPromise = this.initNeural(config);
    }
  }

  /** Lazy-load and wire the neural engine */
  private async initNeural(config: RepoMemoryConfig): Promise<boolean> {
    try {
      const { NeuralEngine: NE } = await import('./neural/index.js');
      const neural = new NE(config.dir, config.neural!);
      const ready = await neural.ensureReady();
      if (ready) {
        this._neural = neural;
        // Wire to scorable collections
        const scorableCollections = [this.memories, this.skills, this.knowledge];
        for (const col of scorableCollections) {
          col.setNeuralEngine(neural);
        }
        this.events.emit('neural:ready', { modelId: neural.stats().modelId });
      } else {
        const errMsg = neural.lastError?.message ?? 'Unknown error';
        this.events.emit('neural:error', { error: errMsg });
      }
      return ready;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.events.emit('neural:error', { error: errMsg });
      return false;
    }
  }

  on<K extends EventName>(event: K, handler: EventHandler<K>): void {
    this.events.on(event, handler);
  }

  off<K extends EventName>(event: K, handler: EventHandler<K>): void {
    this.events.off(event, handler);
  }

  use(middleware: Middleware): void {
    this.middlewareChain.use(middleware);
  }

  /** Neural engine instance (null if not configured or not yet ready) */
  get neural(): NeuralEngine | null {
    return this._neural ?? null;
  }

  /**
   * Ensure the neural engine is loaded and ready.
   * Returns true if ready, false if not configured or loading failed.
   * Safe to call multiple times — returns cached promise.
   */
  async ensureNeural(): Promise<boolean> {
    if (this._neural?.isReady) return true;
    if (this._neuralInitPromise) return this._neuralInitPromise;
    if (!this.config.neural?.enabled) return false;
    // Re-attempt initialization
    this._neuralInitPromise = this.initNeural(this.config);
    return this._neuralInitPromise;
  }

  flush(): void {
    this.searchEngine.flush();
    this.accessTracker.flush();
    if (this._neural) this._neural.flush();
  }

  /** Clean up event listeners and flush pending data. Call when discarding the instance. */
  dispose(): void {
    if (this.autoMineHandler) {
      this.events.off('entity:save', this.autoMineHandler);
      this.autoMineHandler = undefined;
    }
    this.flush();
  }

  /** Rebuild lookup index from refs. Use after crash recovery or when verify() reports errors. */
  rebuildIndex(): { rebuilt: number; orphaned: number } {
    return this.storage.rebuildLookupIndex();
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

  recall(agentId: string, userId: string, query: string, options?: RecallOptions): RecallContext {
    const engine = new RecallEngine(this, this.accessTracker);
    return engine.recall(agentId, userId, query, options);
  }

  async mine(sessionId: string): Promise<MiningResult> {
    if (!this.ai) {
      throw new RepoMemoryError('AI_NOT_CONFIGURED', 'AI provider required for mining');
    }
    const { MiningPipeline } = await import('./pipelines/mining.js');
    const pipeline = new MiningPipeline(this.ai, this, { maxSessionChars: this.config.maxSessionChars, compactPrompts: this.config.compactPrompts });
    const result = await pipeline.run(sessionId);
    this.events.emit('session:mined', { sessionId });
    return result;
  }

  async consolidate(agentId: string, userId: string): Promise<ConsolidationReport> {
    if (!this.ai) {
      throw new RepoMemoryError('AI_NOT_CONFIGURED', 'AI provider required for consolidation');
    }
    const { ConsolidationPipeline } = await import('./pipelines/consolidation.js');
    const pipeline = new ConsolidationPipeline(this.ai, this, this.config.compactPrompts);
    const result = await pipeline.run(agentId, userId);
    this.events.emit('consolidation:done', { type: 'memories', agentId });
    return result;
  }

  async consolidateSkills(agentId: string): Promise<SkillConsolidationReport> {
    if (!this.ai) {
      throw new RepoMemoryError('AI_NOT_CONFIGURED', 'AI provider required for consolidation');
    }
    const { SkillConsolidationPipeline } = await import('./pipelines/consolidation.js');
    const pipeline = new SkillConsolidationPipeline(this.ai, this, this.config.compactPrompts);
    const result = await pipeline.run(agentId);
    this.events.emit('consolidation:done', { type: 'skills', agentId });
    return result;
  }

  async consolidateKnowledge(agentId: string): Promise<KnowledgeConsolidationReport> {
    if (!this.ai) {
      throw new RepoMemoryError('AI_NOT_CONFIGURED', 'AI provider required for consolidation');
    }
    const { KnowledgeConsolidationPipeline } = await import('./pipelines/consolidation.js');
    const pipeline = new KnowledgeConsolidationPipeline(this.ai, this, this.config.compactPrompts);
    const result = await pipeline.run(agentId);
    this.events.emit('consolidation:done', { type: 'knowledge', agentId });
    return result;
  }

  async ragIngest(path: string, agentId: string, options?: Record<string, unknown>): Promise<unknown> {
    const { RagPipeline } = await import('./rag/index.js');
    const rag = new RagPipeline(this, { ai: this.ai });
    const result = await rag.ingest(path, { agent: agentId, ...options });
    this.events.emit('rag:ingest:done', { agentId, filesProcessed: result.filesProcessed, chunksIngested: result.chunksIngested });
    return result;
  }

  async ragQuery(agentId: string, query: string, options?: Record<string, unknown>): Promise<unknown> {
    const { RagPipeline } = await import('./rag/index.js');
    const rag = new RagPipeline(this, { ai: this.ai });
    const result = await rag.query(agentId, query, options as undefined);
    this.events.emit('rag:query:done', { agentId, query, chunksUsed: result.chunksUsed, hasAiAnswer: result.answer !== null });
    return result;
  }

  async ragSync(dirPath: string, agentId: string, options?: Record<string, unknown>): Promise<unknown> {
    const { RagPipeline } = await import('./rag/index.js');
    const rag = new RagPipeline(this, { ai: this.ai });
    const result = await rag.sync(dirPath, { agent: agentId, ...options });
    this.events.emit('rag:sync:done', { agentId, modified: result.modifiedFiles, deleted: result.deletedFiles, newFiles: result.newFiles });
    return result;
  }

  cleanup(options: CleanupOptions = {}): CleanupReport {
    const report = runCleanup(this, this.storage, options);
    // Flush search index changes to disk after deletions
    if (report.removed > 0 && !options.dryRun) {
      this.searchEngine.flush();
    }
    return report;
  }

  export(): ExportData {
    return runExport(this.storage, this.accessTracker);
  }

  import(data: ExportData, options?: ImportOptions): ImportReport {
    return runImport(this.storage, this.searchEngine, this.accessTracker, data, options);
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

  stats(): {
    memories: number; skills: number; knowledge: number; sessions: number; profiles: number;
    objects: number; commits: number;
    index: { scopes: number; totalDocuments: number; scopeDetails: Array<{ scope: string; documents: number }> };
  } {
    return {
      memories: this.storage.refs.list('memories').length,
      skills: this.storage.refs.list('skills').length,
      knowledge: this.storage.refs.list('knowledge').length,
      sessions: this.storage.refs.list('sessions').length,
      profiles: this.storage.refs.list('profiles').length,
      objects: this.storage.objects.listAll().length,
      commits: this.storage.commits.listAll().length,
      index: this.searchEngine.indexStats(),
    };
  }
}

// Re-exports
export type { RepoMemoryConfig } from './types/config.js';
export { SHARED_AGENT_ID } from './types/entities.js';
export type { Memory, Skill, Knowledge, Session, Profile, Entity, EntityType, SessionMessage } from './types/entities.js';
export type { SaveMemoryInput, SaveSkillInput, SaveKnowledgeInput, SaveSessionInput, SaveProfileInput } from './types/entities.js';
export type { SearchResult, CommitInfo, RefInfo, SnapshotInfo, VerifyResult, MiningResult, ConsolidationReport, SkillConsolidationReport, KnowledgeConsolidationReport, RecallContext, RecallOptions, ListOptions, ListResult } from './types/results.js';
export type { AiProvider, AiMessage } from './types/ai.js';
export { RepoMemoryError } from './types/errors.js';
export type { ErrorCode } from './types/errors.js';
export type { RepoMemoryEvents, EventName, EventHandler } from './events.js';
export type { CleanupOptions, CleanupReport } from './cleanup.js';
export type { ExportData, ImportOptions, ImportReport } from './portability.js';
export type { Middleware } from './middleware.js';
export type { ScoringWeights } from './search/scoring.js';
export type { NeuralConfig, NeuralStats, MatryoshkaEmbedding, CuratedItem, SimilarityResult } from './neural/types.js';
