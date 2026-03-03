import type { AiProvider } from '../types/ai.js';
import type { RepoMemory } from '../index.js';
import type { MiningResult } from '../types/results.js';
import type { Memory, Skill } from '../types/entities.js';
import { AiService } from '../ai/service.js';
import { RepoMemoryError } from '../types/errors.js';

export class MiningPipeline {
  private readonly aiService: AiService;

  constructor(provider: AiProvider, private readonly repo: RepoMemory) {
    this.aiService = new AiService(provider);
  }

  async run(sessionId: string): Promise<MiningResult> {
    const session = this.repo.sessions.get(sessionId);
    if (!session) {
      throw new RepoMemoryError('NOT_FOUND', `Session not found: ${sessionId}`);
    }

    const extraction = await this.aiService.extractFromSession(session.content);
    const memories: Memory[] = [];
    const skills: Skill[] = [];

    for (const m of extraction.memories) {
      const [saved] = this.repo.memories.save(session.agentId, session.userId, {
        content: m.content,
        tags: m.tags,
        category: m.category as Memory['category'],
        sourceSession: sessionId,
      });
      memories.push(saved);
    }

    for (const s of extraction.skills) {
      const [saved] = this.repo.skills.save(session.agentId, undefined, {
        content: s.content,
        tags: s.tags,
        category: s.category as Skill['category'],
      });
      skills.push(saved);
    }

    let profile = undefined;
    if (extraction.profile) {
      const existing = this.repo.profiles.getByUser(session.agentId, session.userId);
      if (existing) {
        const [updated] = this.repo.profiles.update(existing.id, {
          content: extraction.profile.content,
          metadata: { ...existing.metadata, ...extraction.profile.metadata },
        });
        profile = updated;
      } else {
        const [saved] = this.repo.profiles.save(session.agentId, session.userId, {
          content: extraction.profile.content,
          metadata: extraction.profile.metadata,
        });
        profile = saved;
      }
    }

    this.repo.sessions.markMined(sessionId);

    return { sessionId, memories, skills, profile };
  }
}
