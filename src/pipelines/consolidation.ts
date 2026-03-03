import type { AiProvider } from '../types/ai.js';
import type { RepoMemory } from '../index.js';
import type { ConsolidationReport } from '../types/results.js';
import type { Memory } from '../types/entities.js';
import { AiService } from '../ai/service.js';

const CHUNK_SIZE = 20;

export class ConsolidationPipeline {
  private readonly aiService: AiService;

  constructor(provider: AiProvider, private readonly repo: RepoMemory) {
    this.aiService = new AiService(provider);
  }

  async run(agentId: string, userId: string): Promise<ConsolidationReport> {
    const memories = this.repo.memories.list(agentId, userId);
    if (memories.length < 2) {
      return { agentId, userId, merged: 0, removed: 0, kept: memories.length };
    }

    const groups = this.groupByCategory(memories);
    let totalMerged = 0;
    let totalRemoved = 0;
    let totalKept = 0;

    for (const group of groups.values()) {
      const chunks = this.chunk(group, CHUNK_SIZE);
      for (const chunk of chunks) {
        const result = await this.processChunk(agentId, userId, chunk);
        totalMerged += result.merged;
        totalRemoved += result.removed;
        totalKept += result.kept;
      }
    }

    return { agentId, userId, merged: totalMerged, removed: totalRemoved, kept: totalKept };
  }

  private async processChunk(
    agentId: string,
    userId: string,
    memories: Memory[],
  ): Promise<{ merged: number; removed: number; kept: number }> {
    if (memories.length < 2) {
      return { merged: 0, removed: 0, kept: memories.length };
    }

    const memoriesJson = JSON.stringify(
      memories.map(m => ({ id: m.id, content: m.content, tags: m.tags, category: m.category })),
      null,
      2,
    );

    const plan = await this.aiService.planConsolidation(memoriesJson);

    let merged = 0;
    let removed = 0;

    for (const merge of plan.merge) {
      this.repo.memories.save(agentId, userId, {
        content: merge.merged.content,
        tags: merge.merged.tags,
        category: merge.merged.category as 'fact' | 'decision' | 'issue' | 'task',
      });
      for (const srcId of merge.sourceIds) {
        try {
          this.repo.memories.delete(srcId);
        } catch {
          // Already deleted or not found
        }
      }
      merged += merge.sourceIds.length;
    }

    for (const removeId of plan.remove) {
      try {
        this.repo.memories.delete(removeId);
        removed++;
      } catch {
        // Already deleted or not found
      }
    }

    return { merged, removed, kept: plan.keep.length };
  }

  private groupByCategory(memories: Memory[]): Map<string, Memory[]> {
    const groups = new Map<string, Memory[]>();
    for (const m of memories) {
      const group = groups.get(m.category) ?? [];
      group.push(m);
      groups.set(m.category, group);
    }
    return groups;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
