import type { RepoMemory } from '../index.js';
import type { Memory, Skill, Knowledge, Profile } from '../types/entities.js';
import type { SearchResult, RecallContext, RecallOptions } from '../types/results.js';
import { formatRecallContext } from './formatter.js';

const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_MAX_CHARS = 8_000;

export class RecallEngine {
  constructor(private readonly repo: RepoMemory) {}

  recall(agentId: string, userId: string, query: string, options?: RecallOptions): RecallContext {
    const maxItems = options?.maxItems ?? DEFAULT_MAX_ITEMS;
    const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
    const includeSharedSkills = options?.includeSharedSkills ?? true;
    const includeSharedKnowledge = options?.includeSharedKnowledge ?? true;
    const includeProfile = options?.includeProfile ?? true;
    const collections = options?.collections ?? ['memories', 'skills', 'knowledge'];

    const perCollection = Math.max(3, Math.ceil(maxItems / collections.length));

    let memories: SearchResult<Memory>[] = [];
    let skills: SearchResult<Skill>[] = [];
    let knowledge: SearchResult<Knowledge>[] = [];
    let profile: Profile | null = null;

    if (collections.includes('memories')) {
      memories = this.repo.memories.search(agentId, userId, query, perCollection);
    }

    if (collections.includes('skills')) {
      skills = this.repo.skills.search(agentId, query, perCollection, includeSharedSkills);
    }

    if (collections.includes('knowledge')) {
      knowledge = this.repo.knowledge.search(agentId, query, perCollection, includeSharedKnowledge);
    }

    if (includeProfile) {
      profile = this.repo.profiles.getByUser(agentId, userId);
    }

    // Track access for scored items
    for (const r of [...memories, ...skills, ...knowledge]) {
      if ('accessCount' in r.entity) {
        // Access tracking is handled by the collection's get() method
      }
    }

    const totalItems = memories.length + skills.length + knowledge.length + (profile ? 1 : 0);
    const formatted = formatRecallContext({ memories, skills, knowledge, profile }, maxChars);
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
