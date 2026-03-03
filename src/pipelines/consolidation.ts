import type { AiProvider } from '../types/ai.js';
import type { RepoMemory } from '../index.js';
import type { ConsolidationReport } from '../types/results.js';
import { AiService } from '../ai/service.js';

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

    const memoriesJson = JSON.stringify(
      memories.map(m => ({ id: m.id, content: m.content, tags: m.tags, category: m.category })),
      null,
      2,
    );

    const plan = await this.aiService.planConsolidation(memoriesJson);

    let merged = 0;
    let removed = 0;

    // Process merges
    for (const merge of plan.merge) {
      // Save merged memory
      this.repo.memories.save(agentId, userId, {
        content: merge.merged.content,
        tags: merge.merged.tags,
        category: merge.merged.category as 'fact' | 'decision' | 'issue' | 'task',
      });
      // Delete source memories
      for (const srcId of merge.sourceIds) {
        try {
          this.repo.memories.delete(srcId);
        } catch {
          // Already deleted or not found
        }
      }
      merged += merge.sourceIds.length;
    }

    // Process removals
    for (const removeId of plan.remove) {
      try {
        this.repo.memories.delete(removeId);
        removed++;
      } catch {
        // Already deleted or not found
      }
    }

    return {
      agentId,
      userId,
      merged,
      removed,
      kept: plan.keep.length,
    };
  }
}
