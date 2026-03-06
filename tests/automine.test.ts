import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import type { AiProvider, AiMessage } from '../src/types/ai.js';

/** Poll until condition is met or timeout */
async function waitFor(fn: () => boolean, timeout = 5000, interval = 50): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return;
    await new Promise(r => setTimeout(r, interval));
  }
}

/** Mock AI provider that returns a valid mining extraction */
class MockMiningProvider implements AiProvider {
  calls: AiMessage[][] = [];

  async chat(messages: AiMessage[]): Promise<string> {
    this.calls.push(messages);
    return JSON.stringify({
      memories: [
        { content: 'User prefers dark mode', tags: ['preferences', 'ui'], category: 'fact' },
        { content: 'Project uses TypeScript strict', tags: ['typescript'], category: 'fact' },
      ],
      skills: [
        { content: 'Run tests with npm test', tags: ['testing'], category: 'procedure' },
      ],
      profile: {
        content: 'Developer who prefers concise responses',
        metadata: { style: 'concise' },
      },
    });
  }
}

/** Mock AI provider that fails */
class FailingProvider implements AiProvider {
  async chat(): Promise<string> {
    throw new Error('AI service unavailable');
  }
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'repomem-automine-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('Auto-mining', () => {
  it('should automatically mine sessions when autoMine is enabled', async () => {
    const provider = new MockMiningProvider();
    const mem = new RepoMemory({ dir, ai: provider, autoMine: true });

    const minedSessions: string[] = [];
    mem.on('session:mined', ({ sessionId }) => {
      minedSessions.push(sessionId);
    });

    // Save a session — should trigger auto-mine
    const [session] = mem.sessions.save('agent-1', 'user-1', {
      content: 'User asked about dark mode and TypeScript config',
      messages: [
        { role: 'user', content: 'I prefer dark mode' },
        { role: 'assistant', content: 'Noted, dark mode preference saved' },
      ],
    });

    // Auto-mine is async (lazy import + AI call), poll until done
    await waitFor(() => provider.calls.length >= 1);

    expect(provider.calls.length).toBe(1);
    expect(minedSessions).toContain(session.id);

    const memories = mem.memories.list('agent-1', 'user-1');
    expect(memories.length).toBe(2);
    expect(memories.some(m => m.content.includes('dark mode'))).toBe(true);

    const skills = mem.skills.list('agent-1');
    expect(skills.length).toBe(1);
    expect(skills[0].content).toContain('npm test');

    const profile = mem.profiles.getByUser('agent-1', 'user-1');
    expect(profile).not.toBeNull();
    expect(profile!.content).toContain('concise');

    const updated = mem.sessions.get(session.id);
    expect(updated!.mined).toBe(true);
  });

  it('should not auto-mine when autoMine is disabled', async () => {
    const provider = new MockMiningProvider();
    const mem = new RepoMemory({ dir, ai: provider, autoMine: false });

    mem.sessions.save('agent-1', 'user-1', { content: 'Some session' });

    await new Promise(r => setTimeout(r, 300));

    expect(provider.calls.length).toBe(0);
    expect(mem.memories.list('agent-1', 'user-1').length).toBe(0);
  });

  it('should not auto-mine when autoMine is true but no AI provider', async () => {
    const mem = new RepoMemory({ dir, autoMine: true });

    const [session] = mem.sessions.save('agent-1', 'user-1', { content: 'Some session' });

    await new Promise(r => setTimeout(r, 300));

    const s = mem.sessions.get(session.id);
    expect(s).not.toBeNull();
    expect(s!.mined).toBe(false);
  });

  it('should not auto-mine non-session entities', async () => {
    const provider = new MockMiningProvider();
    const mem = new RepoMemory({ dir, ai: provider, autoMine: true });

    mem.memories.save('agent-1', 'user-1', { content: 'A regular memory', tags: ['test'] });

    await new Promise(r => setTimeout(r, 300));

    expect(provider.calls.length).toBe(0);
  });

  it('should emit session:automine:error on AI failure without crashing', async () => {
    const mem = new RepoMemory({ dir, ai: new FailingProvider(), autoMine: true });

    const errors: Array<{ sessionId: string; error: string }> = [];
    mem.on('session:automine:error', (payload) => {
      errors.push(payload);
    });

    const [session] = mem.sessions.save('agent-1', 'user-1', { content: 'A session' });

    await waitFor(() => errors.length >= 1);

    expect(errors.length).toBe(1);
    expect(errors[0].sessionId).toBe(session.id);
    expect(errors[0].error).toContain('AI service unavailable');

    // Session was saved but not mined
    const s = mem.sessions.get(session.id);
    expect(s).not.toBeNull();
    expect(s!.mined).toBe(false);
  });

  it('should mine multiple sessions independently', async () => {
    const provider = new MockMiningProvider();
    const mem = new RepoMemory({ dir, ai: provider, autoMine: true });

    mem.sessions.save('agent-1', 'user-1', { content: 'First session' });
    mem.sessions.save('agent-1', 'user-1', { content: 'Second session' });

    await waitFor(() => provider.calls.length >= 2);

    expect(provider.calls.length).toBe(2);

    // Memories from both mining runs (2 memories per run, but dedup may merge some)
    const memories = mem.memories.list('agent-1', 'user-1');
    expect(memories.length).toBeGreaterThanOrEqual(2);
  });

  it('manual mine() should still work independently of autoMine', async () => {
    const provider = new MockMiningProvider();
    const mem = new RepoMemory({ dir, ai: provider, autoMine: false });

    const [session] = mem.sessions.save('agent-1', 'user-1', { content: 'Manual mining test' });

    // No auto-mine
    expect(provider.calls.length).toBe(0);

    // Manual mine
    const result = await mem.mine(session.id);

    expect(provider.calls.length).toBe(1);
    expect(result.memories.length).toBe(2);
    expect(result.skills.length).toBe(1);
    expect(result.profile).toBeDefined();
  });
});
