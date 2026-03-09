import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory, SHARED_AGENT_ID } from '../src/index.js';
import type { AiProvider } from '../src/types/ai.js';

let dir: string;
let mem: RepoMemory;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'repomemory-scoping-'));
  mem = new RepoMemory({ dir: join(dir, '.repomemory') });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('Shared Scope', () => {
  describe('skills', () => {
    it('saveShared saves with _shared agentId', () => {
      const [skill] = mem.skills.saveShared({ content: 'Shared deploy procedure', tags: ['deploy'] });
      expect(skill.agentId).toBe(SHARED_AGENT_ID);
      expect(skill.content).toBe('Shared deploy procedure');
    });

    it('listShared returns only shared skills', () => {
      mem.skills.save('agent-1', undefined, { content: 'Agent-specific skill', tags: ['a1'] });
      mem.skills.saveShared({ content: 'Shared skill', tags: ['shared'] });
      const shared = mem.skills.listShared();
      expect(shared).toHaveLength(1);
      expect(shared[0].content).toBe('Shared skill');
    });

    it('search with includeShared merges results from own + shared scope', () => {
      mem.skills.save('agent-1', undefined, { content: 'Agent deploy with Docker', tags: ['deploy', 'docker'] });
      mem.skills.saveShared({ content: 'Shared deploy with Kubernetes', tags: ['deploy', 'k8s'] });

      const results = mem.skills.search('agent-1', 'deploy', 10, true);
      expect(results.length).toBe(2);
      const contents = results.map(r => r.entity.content);
      expect(contents).toContain('Agent deploy with Docker');
      expect(contents).toContain('Shared deploy with Kubernetes');
    });

    it('search without includeShared only returns own scope', () => {
      mem.skills.save('agent-1', undefined, { content: 'Agent deploy with Docker', tags: ['deploy'] });
      mem.skills.saveShared({ content: 'Shared deploy with Kubernetes', tags: ['deploy'] });

      const results = mem.skills.search('agent-1', 'deploy', 10, false);
      expect(results.length).toBe(1);
      expect(results[0].entity.content).toBe('Agent deploy with Docker');
    });

    it('shared skills are isolated between agents listing', () => {
      mem.skills.save('agent-1', undefined, { content: 'A1 skill', tags: ['a1'] });
      mem.skills.save('agent-2', undefined, { content: 'A2 skill', tags: ['a2'] });
      mem.skills.saveShared({ content: 'Shared skill', tags: ['shared'] });

      expect(mem.skills.list('agent-1')).toHaveLength(1);
      expect(mem.skills.list('agent-2')).toHaveLength(1);
      expect(mem.skills.listShared()).toHaveLength(1);
    });
  });

  describe('knowledge', () => {
    it('saveShared saves with _shared agentId', () => {
      const [k] = mem.knowledge.saveShared({ content: 'Shared API docs', tags: ['api'] });
      expect(k.agentId).toBe(SHARED_AGENT_ID);
    });

    it('listShared returns only shared knowledge', () => {
      mem.knowledge.save('agent-1', undefined, { content: 'Agent knowledge', tags: ['a1'] });
      mem.knowledge.saveShared({ content: 'Shared knowledge', tags: ['shared'] });
      expect(mem.knowledge.listShared()).toHaveLength(1);
    });

    it('search with includeShared merges results', () => {
      mem.knowledge.save('agent-1', undefined, { content: 'Agent API documentation', tags: ['api'] });
      mem.knowledge.saveShared({ content: 'Shared API reference guide', tags: ['api'] });

      const results = mem.knowledge.search('agent-1', 'API', 10, true);
      expect(results.length).toBe(2);
    });

    it('search without includeShared returns own only', () => {
      mem.knowledge.save('agent-1', undefined, { content: 'Agent API docs', tags: ['api'] });
      mem.knowledge.saveShared({ content: 'Shared API docs', tags: ['api'] });

      const results = mem.knowledge.search('agent-1', 'API', 10, false);
      expect(results.length).toBe(1);
    });
  });
});

describe('Cross-agent Profiles', () => {
  it('getByUserAcrossAgents returns profiles from all agents', () => {
    mem.profiles.save('agent-1', 'user-1', { content: 'Profile from agent 1' });
    mem.profiles.save('agent-2', 'user-1', { content: 'Profile from agent 2' });
    mem.profiles.save('agent-1', 'user-2', { content: 'Different user profile' });

    const profiles = mem.profiles.getByUserAcrossAgents('user-1');
    expect(profiles).toHaveLength(2);
    const contents = profiles.map(p => p.content);
    expect(contents).toContain('Profile from agent 1');
    expect(contents).toContain('Profile from agent 2');
  });

  it('getByUserAcrossAgents is sorted by updatedAt descending', () => {
    mem.profiles.save('agent-1', 'user-1', { content: 'Old profile' });
    // Small delay to ensure different timestamps
    mem.profiles.save('agent-2', 'user-1', { content: 'Newer profile' });

    const profiles = mem.profiles.getByUserAcrossAgents('user-1');
    expect(profiles[0].content).toBe('Newer profile');
  });

  it('saveShared and getSharedByUser work correctly', () => {
    mem.profiles.saveShared('user-1', { content: 'Shared user profile', metadata: { role: 'admin' } });

    const profile = mem.profiles.getSharedByUser('user-1');
    expect(profile).not.toBeNull();
    expect(profile!.content).toBe('Shared user profile');
    expect(profile!.agentId).toBe(SHARED_AGENT_ID);
    expect(profile!.metadata).toEqual({ role: 'admin' });
  });

  it('getSharedByUser returns null when no shared profile', () => {
    mem.profiles.save('agent-1', 'user-1', { content: 'Agent-specific profile' });
    expect(mem.profiles.getSharedByUser('user-1')).toBeNull();
  });

  it('shared profile is included in cross-agent results', () => {
    mem.profiles.save('agent-1', 'user-1', { content: 'Agent profile' });
    mem.profiles.saveShared('user-1', { content: 'Shared profile' });

    const profiles = mem.profiles.getByUserAcrossAgents('user-1');
    expect(profiles).toHaveLength(2);
  });
});

describe('Conversations', () => {
  it('save with conversationId', () => {
    const [session] = mem.sessions.save('a1', 'u1', {
      content: 'Session content',
      conversationId: 'conv-1',
    });
    expect(session.conversationId).toBe('conv-1');

    const loaded = mem.sessions.get(session.id);
    expect(loaded!.conversationId).toBe('conv-1');
  });

  it('save without conversationId (backward compat)', () => {
    const [session] = mem.sessions.save('a1', 'u1', { content: 'No conversation' });
    expect(session.conversationId).toBeUndefined();
  });

  it('listByConversation filters correctly', () => {
    mem.sessions.save('a1', 'u1', { content: 'Session A', conversationId: 'conv-1' });
    mem.sessions.save('a1', 'u1', { content: 'Session B', conversationId: 'conv-1' });
    mem.sessions.save('a1', 'u1', { content: 'Session C', conversationId: 'conv-2' });
    mem.sessions.save('a1', 'u1', { content: 'Session D' });

    const conv1 = mem.sessions.listByConversation('a1', 'u1', 'conv-1');
    expect(conv1).toHaveLength(2);
    expect(conv1.map(s => s.content).sort()).toEqual(['Session A', 'Session B']);

    const conv2 = mem.sessions.listByConversation('a1', 'u1', 'conv-2');
    expect(conv2).toHaveLength(1);
  });

  it('listConversations returns grouped summaries', () => {
    mem.sessions.save('a1', 'u1', { content: 'S1', conversationId: 'conv-1' });
    mem.sessions.save('a1', 'u1', { content: 'S2', conversationId: 'conv-1' });
    mem.sessions.save('a1', 'u1', { content: 'S3', conversationId: 'conv-2' });
    mem.sessions.save('a1', 'u1', { content: 'S4' }); // no conversation

    const result = mem.sessions.listConversations('a1', 'u1');
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);

    const conv1 = result.items.find(c => c.conversationId === 'conv-1')!;
    expect(conv1.count).toBe(2);

    const conv2 = result.items.find(c => c.conversationId === 'conv-2')!;
    expect(conv2.count).toBe(1);
  });

  it('listConversations returns empty array when no conversations', () => {
    mem.sessions.save('a1', 'u1', { content: 'No conv' });
    const result = mem.sessions.listConversations('a1', 'u1');
    expect(result.items).toHaveLength(0);
  });
});

describe('Consolidation for Skills and Knowledge', () => {
  it('consolidateSkills throws without AI', async () => {
    await expect(mem.consolidateSkills('agent-1')).rejects.toThrow('AI provider required');
  });

  it('consolidateKnowledge throws without AI', async () => {
    await expect(mem.consolidateKnowledge('agent-1')).rejects.toThrow('AI provider required');
  });

  it('consolidateSkills runs with mock AI', async () => {
    const mockAi: AiProvider = {
      chat: async () => '{"keep":[],"merge":[],"remove":[]}',
    };
    const repo = new RepoMemory({ dir: join(dir, '.repo2'), ai: mockAi });
    repo.skills.save('a1', undefined, { content: 'Skill A', tags: ['a'], category: 'procedure' });
    repo.skills.save('a1', undefined, { content: 'Skill B', tags: ['b'], category: 'procedure' });

    const report = await repo.consolidateSkills('a1');
    expect(report.agentId).toBe('a1');
    expect(report.merged).toBe(0);
    expect(report.removed).toBe(0);
    expect(report.kept).toBe(0);
  });

  it('consolidateKnowledge runs with mock AI', async () => {
    const mockAi: AiProvider = {
      chat: async () => '{"keep":[],"merge":[],"remove":[]}',
    };
    const repo = new RepoMemory({ dir: join(dir, '.repo3'), ai: mockAi });
    repo.knowledge.save('a1', undefined, { content: 'Knowledge A', tags: ['a'] });
    repo.knowledge.save('a1', undefined, { content: 'Knowledge B', tags: ['b'] });

    const report = await repo.consolidateKnowledge('a1');
    expect(report.agentId).toBe('a1');
    expect(report.merged).toBe(0);
    expect(report.removed).toBe(0);
    expect(report.kept).toBe(0);
  });

  it('consolidateSkills with <2 skills returns immediately', async () => {
    const mockAi: AiProvider = {
      chat: async () => { throw new Error('should not be called'); },
    };
    const repo = new RepoMemory({ dir: join(dir, '.repo4'), ai: mockAi });
    repo.skills.save('a1', undefined, { content: 'Only skill', tags: ['a'] });

    const report = await repo.consolidateSkills('a1');
    expect(report.kept).toBe(1);
    expect(report.merged).toBe(0);
  });

  it('consolidateKnowledge with <2 items returns immediately', async () => {
    const mockAi: AiProvider = {
      chat: async () => { throw new Error('should not be called'); },
    };
    const repo = new RepoMemory({ dir: join(dir, '.repo5'), ai: mockAi });

    const report = await repo.consolidateKnowledge('a1');
    expect(report.kept).toBe(0);
    expect(report.merged).toBe(0);
  });
});
