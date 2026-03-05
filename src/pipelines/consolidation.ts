import type { AiProvider } from '../types/ai.js';
import type { RepoMemory } from '../index.js';
import type { ConsolidationReport, SkillConsolidationReport, KnowledgeConsolidationReport } from '../types/results.js';
import type { Entity, Memory, Skill, Knowledge } from '../types/entities.js';
import { AiService, type ConsolidationPlan } from '../ai/service.js';

const CHUNK_SIZE = 20;

interface ChunkResult { merged: number; removed: number; kept: number }

abstract class BaseConsolidationPipeline<T extends Entity> {
  protected readonly aiService: AiService;

  constructor(provider: AiProvider, protected readonly repo: RepoMemory) {
    this.aiService = new AiService(provider);
  }

  protected abstract listItems(...args: string[]): T[];
  protected abstract groupItems(items: T[]): Map<string, T[]>;
  protected abstract serializeChunk(items: T[]): string;
  protected abstract planChunk(json: string): Promise<ConsolidationPlan>;
  protected abstract saveMerged(agentId: string, userId: string | undefined, merged: ConsolidationPlan['merge'][number]['merged']): void;
  protected abstract deleteItem(id: string): void;

  protected async runChunked(items: T[]): Promise<ChunkResult> {
    const groups = this.groupItems(items);
    let totalMerged = 0;
    let totalRemoved = 0;
    let totalKept = 0;

    for (const group of groups.values()) {
      for (let i = 0; i < group.length; i += CHUNK_SIZE) {
        const chunk = group.slice(i, i + CHUNK_SIZE);
        const result = await this.processChunk(chunk);
        totalMerged += result.merged;
        totalRemoved += result.removed;
        totalKept += result.kept;
      }
    }

    return { merged: totalMerged, removed: totalRemoved, kept: totalKept };
  }

  private async processChunk(items: T[]): Promise<ChunkResult> {
    if (items.length < 2) {
      return { merged: 0, removed: 0, kept: items.length };
    }

    const plan = await this.planChunk(this.serializeChunk(items));

    let merged = 0;
    let removed = 0;

    for (const merge of plan.merge) {
      this.saveMerged(
        (items[0] as unknown as { agentId: string }).agentId,
        'userId' in items[0] ? (items[0] as unknown as { userId: string }).userId : undefined,
        merge.merged,
      );
      for (const srcId of merge.sourceIds) {
        try { this.deleteItem(srcId); } catch { /* already deleted */ }
      }
      merged += merge.sourceIds.length;
    }

    for (const removeId of plan.remove) {
      try { this.deleteItem(removeId); removed++; } catch { /* already deleted */ }
    }

    return { merged, removed, kept: plan.keep.length };
  }

  protected groupByCategory<U extends { category: string }>(items: U[]): Map<string, U[]> {
    const groups = new Map<string, U[]>();
    for (const item of items) {
      const group = groups.get(item.category) ?? [];
      group.push(item);
      groups.set(item.category, group);
    }
    return groups;
  }
}

export class ConsolidationPipeline extends BaseConsolidationPipeline<Memory> {
  async run(agentId: string, userId: string): Promise<ConsolidationReport> {
    const memories = this.listItems(agentId, userId);
    if (memories.length < 2) {
      return { agentId, userId, merged: 0, removed: 0, kept: memories.length };
    }
    const result = await this.runChunked(memories);
    return { agentId, userId, ...result };
  }

  protected listItems(agentId: string, userId: string): Memory[] {
    return this.repo.memories.list(agentId, userId);
  }

  protected groupItems(items: Memory[]): Map<string, Memory[]> {
    return this.groupByCategory(items);
  }

  protected serializeChunk(items: Memory[]): string {
    return JSON.stringify(items.map(m => ({ id: m.id, content: m.content, tags: m.tags, category: m.category })), null, 2);
  }

  protected planChunk(json: string): Promise<ConsolidationPlan> {
    return this.aiService.planConsolidation(json);
  }

  protected saveMerged(agentId: string, userId: string | undefined, merged: ConsolidationPlan['merge'][number]['merged']): void {
    this.repo.memories.save(agentId, userId, {
      content: merged.content,
      tags: merged.tags,
      category: merged.category as Memory['category'],
    });
  }

  protected deleteItem(id: string): void {
    this.repo.memories.delete(id);
  }
}

export class SkillConsolidationPipeline extends BaseConsolidationPipeline<Skill> {
  async run(agentId: string): Promise<SkillConsolidationReport> {
    const skills = this.listItems(agentId);
    if (skills.length < 2) {
      return { agentId, merged: 0, removed: 0, kept: skills.length };
    }
    const result = await this.runChunked(skills);
    return { agentId, ...result };
  }

  protected listItems(agentId: string): Skill[] {
    return this.repo.skills.list(agentId);
  }

  protected groupItems(items: Skill[]): Map<string, Skill[]> {
    return this.groupByCategory(items);
  }

  protected serializeChunk(items: Skill[]): string {
    return JSON.stringify(items.map(s => ({ id: s.id, content: s.content, tags: s.tags, category: s.category })), null, 2);
  }

  protected planChunk(json: string): Promise<ConsolidationPlan> {
    return this.aiService.planSkillConsolidation(json);
  }

  protected saveMerged(agentId: string, _userId: string | undefined, merged: ConsolidationPlan['merge'][number]['merged']): void {
    this.repo.skills.save(agentId, undefined, {
      content: merged.content,
      tags: merged.tags,
      category: merged.category ?? 'procedure',
    });
  }

  protected deleteItem(id: string): void {
    this.repo.skills.delete(id);
  }
}

export class KnowledgeConsolidationPipeline extends BaseConsolidationPipeline<Knowledge> {
  async run(agentId: string): Promise<KnowledgeConsolidationReport> {
    const items = this.listItems(agentId);
    if (items.length < 2) {
      return { agentId, merged: 0, removed: 0, kept: items.length };
    }
    const result = await this.runChunked(items);
    return { agentId, ...result };
  }

  protected listItems(agentId: string): Knowledge[] {
    return this.repo.knowledge.list(agentId);
  }

  protected groupItems(items: Knowledge[]): Map<string, Knowledge[]> {
    // Knowledge doesn't have a category field, treat as a single group
    return new Map([['all', items]]);
  }

  protected serializeChunk(items: Knowledge[]): string {
    return JSON.stringify(items.map(k => ({ id: k.id, content: k.content, tags: k.tags, source: k.source })), null, 2);
  }

  protected planChunk(json: string): Promise<ConsolidationPlan> {
    return this.aiService.planKnowledgeConsolidation(json);
  }

  protected saveMerged(agentId: string, _userId: string | undefined, merged: ConsolidationPlan['merge'][number]['merged']): void {
    this.repo.knowledge.save(agentId, undefined, {
      content: merged.content,
      tags: merged.tags,
    });
  }

  protected deleteItem(id: string): void {
    this.repo.knowledge.delete(id);
  }
}
