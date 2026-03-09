import type { RepoMemory } from '../index.js';
import type { AccessTracker } from '../storage/access-tracker.js';
import type { Memory, Skill, Knowledge, Profile } from '../types/entities.js';
import type { SearchResult, RecallContext, RecallOptions } from '../types/results.js';
import { formatRecallContext, formatWithTemplate } from './formatter.js';
import { resolveTemplate } from './templates.js';
import type { PromptTemplate } from './templates.js';

const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_MAX_CHARS = 8_000;

export class RecallEngine {
  constructor(
    private readonly repo: RepoMemory,
    private readonly accessTracker?: AccessTracker,
  ) {}

  recall(agentId: string, userId: string, query: string, options?: RecallOptions): RecallContext {
    const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
    const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
    const includeSharedSkills = options?.includeSharedSkills ?? true;
    const includeSharedKnowledge = options?.includeSharedKnowledge ?? true;
    const includeProfile = options?.includeProfile ?? true;
    const collections = options?.collections ?? ['memories', 'skills', 'knowledge'];

    // Resolve template (if provided)
    let template: PromptTemplate | undefined;
    if (options?.template) {
      template = resolveTemplate(options.template);
    }

    // Collection weight multipliers from template
    const memWeight = template?.collectionWeights?.memories ?? 1.0;
    const skillWeight = template?.collectionWeights?.skills ?? 1.0;
    const knowledgeWeight = template?.collectionWeights?.knowledge ?? 1.0;

    // Fetch generous candidates from each collection (2x budget)
    const fetchLimit = Math.max(10, maxItems * 2);

    type TaggedResult =
      | { source: 'memories'; result: SearchResult<Memory> }
      | { source: 'skills'; result: SearchResult<Skill> }
      | { source: 'knowledge'; result: SearchResult<Knowledge> };

    const pool: TaggedResult[] = [];

    if (collections.includes('memories')) {
      for (const r of this.repo.memories.search(agentId, userId, query, fetchLimit)) {
        pool.push({ source: 'memories', result: { entity: r.entity, score: r.score * memWeight } });
      }
    }

    if (collections.includes('skills')) {
      for (const r of this.repo.skills.search(agentId, query, fetchLimit, includeSharedSkills)) {
        pool.push({ source: 'skills', result: { entity: r.entity, score: r.score * skillWeight } });
      }
    }

    if (collections.includes('knowledge')) {
      for (const r of this.repo.knowledge.search(agentId, query, fetchLimit, includeSharedKnowledge)) {
        pool.push({ source: 'knowledge', result: { entity: r.entity, score: r.score * knowledgeWeight } });
      }
    }

    // Sort all candidates by score descending and take top maxItems
    pool.sort((a, b) => b.result.score - a.result.score);
    const selected = pool.slice(0, maxItems);

    // Distribute back to typed arrays
    const memories: SearchResult<Memory>[] = [];
    const skills: SearchResult<Skill>[] = [];
    const knowledge: SearchResult<Knowledge>[] = [];
    for (const item of selected) {
      if (item.source === 'memories') memories.push(item.result);
      else if (item.source === 'skills') skills.push(item.result);
      else knowledge.push(item.result);
    }

    let profile: Profile | null = null;
    if (includeProfile) {
      profile = this.repo.profiles.getByUser(agentId, userId);
    }

    // Track access for recalled items
    if (this.accessTracker) {
      const ids = selected.map(r => r.result.entity.id);
      if (ids.length > 0) {
        this.accessTracker.incrementMany(ids);
        this.accessTracker.flush();
      }
    }

    const totalItems = memories.length + skills.length + knowledge.length + (profile ? 1 : 0);
    const recallData = { memories, skills, knowledge, profile };

    // Use template-aware formatter if template provided, otherwise default
    const formatted = template
      ? formatWithTemplate(recallData, template, maxChars)
      : formatRecallContext(recallData, maxChars);
    const estimatedChars = formatted.length;

    return {
      memories,
      skills,
      knowledge,
      profile,
      formatted,
      totalItems,
      estimatedChars,
    };
  }
}
