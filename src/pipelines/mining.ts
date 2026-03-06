import type { AiProvider } from '../types/ai.js';
import type { RepoMemory } from '../index.js';
import type { MiningResult } from '../types/results.js';
import type { Memory, Skill, Session } from '../types/entities.js';
import { AiService } from '../ai/service.js';
import { RepoMemoryError } from '../types/errors.js';

export interface MiningPipelineOptions {
  maxSessionChars?: number;
  compactPrompts?: boolean;
}

const DEFAULT_MAX_SESSION_CHARS = 100_000;

/**
 * Prepare session content for AI extraction.
 * If session has structured messages, format them as "[role]: content".
 * Truncates from the beginning (keeps the most recent messages) if content exceeds maxChars.
 */
function prepareSessionContent(session: Session, maxChars: number): string {
  let content: string;

  if (session.messages && session.messages.length > 0) {
    // Format structured messages
    const lines = session.messages.map(m => {
      const ts = m.timestamp ? `[${m.timestamp}] ` : '';
      return `${ts}[${m.role}]: ${m.content}`;
    });
    content = lines.join('\n');
  } else {
    content = session.content;
  }

  if (content.length <= maxChars) {
    return content;
  }

  // Truncate from the beginning — keep the end (most recent context)
  const truncated = content.slice(content.length - maxChars);
  const firstNewline = truncated.indexOf('\n');
  // Start at the first complete line to avoid partial content
  if (firstNewline !== -1 && firstNewline < 200) {
    return `[...truncated...]\n${truncated.slice(firstNewline + 1)}`;
  }
  return `[...truncated...]\n${truncated}`;
}

export class MiningPipeline {
  private readonly aiService: AiService;
  private readonly maxSessionChars: number;

  constructor(provider: AiProvider, private readonly repo: RepoMemory, options?: MiningPipelineOptions) {
    this.aiService = new AiService(provider, options?.compactPrompts);
    this.maxSessionChars = options?.maxSessionChars ?? DEFAULT_MAX_SESSION_CHARS;
  }

  async run(sessionId: string): Promise<MiningResult> {
    const session = this.repo.sessions.get(sessionId);
    if (!session) {
      throw new RepoMemoryError('NOT_FOUND', `Session not found: ${sessionId}`);
    }

    const sessionContent = prepareSessionContent(session, this.maxSessionChars);
    const extraction = await this.aiService.extractFromSession(sessionContent);
    const memories: Memory[] = [];
    const skills: Skill[] = [];

    for (const m of extraction.memories) {
      const [saved] = this.repo.memories.saveOrUpdate(session.agentId, session.userId, {
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
