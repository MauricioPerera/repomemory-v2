/**
 * Agent Simulation Test
 *
 * Simula un agente de AI real usando RepoMemory a lo largo de múltiples
 * sesiones de trabajo. Verifica que todos los fixes implementados
 * funcionan correctamente en un escenario end-to-end.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';

const AGENT = 'claude-dev';
const USER = 'mauricio';

describe('Agent simulation: full workflow', () => {
  let dir: string;
  let baseDir: string;
  let mem: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-sim-'));
    baseDir = join(dir, '.repomemory');
    mem = new RepoMemory({ dir: baseDir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  // ── Session 1: Agent learns about the user ──────────────────────

  it('session 1 — onboarding: save memories, skills, profile', () => {
    // Agent saves a session transcript
    const [session] = mem.sessions.save(AGENT, USER, {
      content: 'User asked to set up a TypeScript project with Vitest. Prefers strict mode. Uses pnpm.',
    });
    expect(session.mined).toBe(false);

    // Agent extracts memories from the conversation
    const [m1] = mem.memories.save(AGENT, USER, {
      content: 'User prefers TypeScript strict mode in all projects',
      tags: ['typescript', 'preferences', 'strict'],
      category: 'fact',
      sourceSession: session.id,
    });
    const [m2] = mem.memories.save(AGENT, USER, {
      content: 'User uses pnpm as package manager, not npm or yarn',
      tags: ['pnpm', 'tooling', 'preferences'],
      category: 'fact',
      sourceSession: session.id,
    });
    const [m3] = mem.memories.save(AGENT, USER, {
      content: 'User chose Vitest over Jest for testing',
      tags: ['vitest', 'testing', 'preferences'],
      category: 'decision',
      sourceSession: session.id,
    });

    // Agent saves a skill it learned
    const [skill] = mem.skills.save(AGENT, undefined, {
      content: 'To init a TS project with Vitest: pnpm init, pnpm add -D typescript vitest, create tsconfig.json with strict: true',
      tags: ['typescript', 'vitest', 'setup'],
      category: 'procedure',
    });

    // Agent creates a user profile
    mem.profiles.save(AGENT, USER, {
      content: 'Senior developer. Prefers strict TypeScript, pnpm, Vitest. Works on backend and CLI tools.',
      metadata: { level: 'senior', stack: ['typescript', 'node'] },
    });

    // Mark session as mined
    mem.sessions.markMined(session.id);
    expect(mem.sessions.get(session.id)!.mined).toBe(true);

    // Verify everything persisted
    const stats = mem.stats();
    expect(stats.memories).toBe(3);
    expect(stats.skills).toBe(1);
    expect(stats.sessions).toBe(1);
    expect(stats.profiles).toBe(1);

    // Verify retrieval
    expect(mem.memories.get(m1.id)!.content).toContain('strict mode');
    expect(mem.memories.get(m2.id)!.tags).toContain('pnpm');
    expect(mem.memories.get(m3.id)!.category).toBe('decision');
    expect(mem.skills.get(skill.id)!.status).toBe('active');
    expect(mem.profiles.getByUser(AGENT, USER)!.metadata.level).toBe('senior');
  });

  // ── Fix #1: Search no genera commits extra ──────────────────────

  it('search does NOT create commits (fix #1)', () => {
    mem.memories.save(AGENT, USER, {
      content: 'User prefers dark mode in all IDEs',
      tags: ['preferences', 'ide'],
      category: 'fact',
    });
    mem.memories.save(AGENT, USER, {
      content: 'User prefers VSCode with Vim keybindings',
      tags: ['preferences', 'ide', 'vscode'],
      category: 'fact',
    });
    mem.memories.save(AGENT, USER, {
      content: 'User debugging strategy: logs first, then debugger',
      tags: ['debugging', 'workflow'],
      category: 'fact',
    });

    const statsBefore = mem.stats();

    // Agent searches multiple times (common in real usage)
    mem.memories.search(AGENT, USER, 'IDE preferences');
    mem.memories.search(AGENT, USER, 'debugging');
    mem.memories.search(AGENT, USER, 'VSCode');

    const statsAfter = mem.stats();

    // Zero new commits — searches only update the access-counts side-index
    expect(statsAfter.commits).toBe(statsBefore.commits);
    expect(statsAfter.objects).toBe(statsBefore.objects);
  });

  // ── Fix #1 cont: Access count tracked via side-index ────────────

  it('access counts are tracked without commits (fix #1)', () => {
    const [saved] = mem.memories.save(AGENT, USER, {
      content: 'Always use error boundaries in React components',
      tags: ['react', 'best-practices'],
      category: 'fact',
    });

    expect(mem.memories.get(saved.id)!.accessCount).toBe(0);

    // Search hits this memory 3 times
    mem.memories.search(AGENT, USER, 'React error boundaries');
    mem.memories.search(AGENT, USER, 'React best practices');
    mem.memories.search(AGENT, USER, 'error boundaries components');

    // accessCount should reflect the searches, read from side-index
    const loaded = mem.memories.get(saved.id)!;
    expect(loaded.accessCount).toBe(3);

    // Flush to persist access counts to disk
    mem.flush();

    // Verify the side-index file exists
    expect(existsSync(join(baseDir, 'index', 'access-counts.json'))).toBe(true);
  });

  // ── Fix #2: History funciona después de delete ──────────────────

  it('history works after entity deletion (fix #2)', () => {
    // Agent saves, updates, then deletes a memory
    const [saved] = mem.memories.save(AGENT, USER, {
      content: 'User uses Docker for local development',
      tags: ['docker', 'tooling'],
      category: 'fact',
    });

    mem.memories.update(saved.id, {
      content: 'User uses Docker Compose for local development with multi-service setups',
      tags: ['docker', 'docker-compose', 'tooling'],
    });

    mem.memories.delete(saved.id);

    // Entity is gone
    expect(mem.memories.get(saved.id)).toBeNull();

    // But history is preserved — this was broken before fix #2
    const history = mem.memories.history(saved.id);
    expect(history.length).toBe(3);
    expect(history[0].message).toBe('delete memory');
    expect(history[1].message).toBe('update memory');
    expect(history[2].message).toBe('create memory');
  });

  it('deleted entities do not appear in list()', () => {
    const [m1] = mem.memories.save(AGENT, USER, { content: 'keep this', tags: [] });
    const [m2] = mem.memories.save(AGENT, USER, { content: 'delete this', tags: [] });

    mem.memories.delete(m2.id);

    const list = mem.memories.list(AGENT, USER);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(m1.id);
  });

  // ── Fix #3: Tag overlap simétrico ────────────────────────────────

  it('search relevance is fair with long queries (fix #3)', () => {
    // Entity with 1 very specific tag
    mem.memories.save(AGENT, USER, {
      content: 'PostgreSQL connection string format: postgresql://user:pass@host:5432/db',
      tags: ['postgresql'],
      category: 'fact',
    });

    // Long query that contains the tag — before fix, 1/5 = 0.2 tag overlap
    // After fix, max(1/5, 1/1) = 1.0 tag overlap
    const results = mem.memories.search(AGENT, USER, 'how to connect to postgresql database server');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
  });

  // ── Fix #4: find() rank-then-load ────────────────────────────────

  it('find() returns correct results with rank-then-load (fix #4)', () => {
    // Save many memories — only some are relevant
    for (let i = 0; i < 20; i++) {
      mem.memories.save(AGENT, USER, {
        content: `Irrelevant memory number ${i} about random stuff`,
        tags: ['filler'],
        category: 'fact',
      });
    }
    mem.memories.save(AGENT, USER, {
      content: 'Kubernetes deployment requires a valid container image tag',
      tags: ['kubernetes', 'deployment'],
      category: 'fact',
    });
    mem.memories.save(AGENT, USER, {
      content: 'Kubernetes pods restart policy should be Always for services',
      tags: ['kubernetes', 'pods'],
      category: 'fact',
    });

    const results = mem.memories.find(AGENT, USER, 'kubernetes deployment', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);
    // Top results should be about kubernetes
    expect(results[0].entity.content).toContain('Kubernetes');
  });

  // ── Fix #5: TF-IDF flush ────────────────────────────────────────

  it('bulk operations are efficient with flush (fix #5)', () => {
    // Save 10 memories — each save calls flush() once at the end
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const [saved] = mem.memories.save(AGENT, USER, {
        content: `Technical note ${i}: something about architecture pattern ${i}`,
        tags: ['architecture', `pattern-${i}`],
        category: 'fact',
      });
      ids.push(saved.id);
    }

    // Verify search still works after all saves
    const results = mem.memories.search(AGENT, USER, 'architecture pattern');
    expect(results.length).toBeGreaterThan(0);

    // Manual flush should not throw
    mem.flush();

    // TF-IDF index file should exist
    const tfidfDir = join(baseDir, 'index', 'tfidf');
    expect(existsSync(tfidfDir)).toBe(true);
  });

  // ── Fix #6: Snapshot incluye objects y commits ──────────────────

  it('snapshot restore recovers objects and commits (fix #6)', () => {
    // Save some data
    const [m1] = mem.memories.save(AGENT, USER, {
      content: 'Important fact before snapshot',
      tags: ['important'],
      category: 'fact',
    });
    mem.skills.save(AGENT, undefined, {
      content: 'How to configure ESLint with TypeScript',
      tags: ['eslint', 'typescript'],
    });

    const snap = mem.snapshot('before-disaster');

    // Verify snapshot includes objects and commits dirs
    const snapDir = join(baseDir, 'snapshots', snap.id);
    expect(existsSync(join(snapDir, 'objects'))).toBe(true);
    expect(existsSync(join(snapDir, 'commits'))).toBe(true);
    expect(existsSync(join(snapDir, 'refs'))).toBe(true);
    expect(existsSync(join(snapDir, 'index'))).toBe(true);

    // Delete memory and add new data
    mem.memories.delete(m1.id);
    mem.memories.save(AGENT, USER, {
      content: 'Data added after snapshot',
      tags: ['new'],
      category: 'fact',
    });

    // Restore snapshot — creates fresh instance to clear in-memory caches
    mem.restore(snap.id);
    const restored = new RepoMemory({ dir: baseDir });

    // Original memory is back
    const loaded = restored.memories.get(m1.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.content).toBe('Important fact before snapshot');

    // Verify integrity after restore
    const verifyResult = restored.verify();
    expect(verifyResult.valid).toBe(true);
  });

  // ── Multi-session agent workflow ─────────────────────────────────

  it('full multi-session agent workflow', () => {
    // ── Session 1: Agent learns user preferences ──
    const [s1] = mem.sessions.save(AGENT, USER, {
      content: 'User set up a new React project. Prefers Tailwind over CSS modules.',
    });

    mem.memories.save(AGENT, USER, {
      content: 'User prefers Tailwind CSS over CSS modules and styled-components',
      tags: ['tailwind', 'css', 'preferences'],
      category: 'decision',
      sourceSession: s1.id,
    });
    mem.memories.save(AGENT, USER, {
      content: 'User React project uses Next.js App Router',
      tags: ['nextjs', 'react', 'app-router'],
      category: 'fact',
      sourceSession: s1.id,
    });
    mem.sessions.markMined(s1.id);

    // ── Session 2: Agent recalls and learns more ──
    const [s2] = mem.sessions.save(AGENT, USER, {
      content: 'User asked about state management. Discussed Zustand vs Redux. Chose Zustand.',
    });

    // Agent searches for existing context
    const priorContext = mem.memories.search(AGENT, USER, 'React preferences');
    expect(priorContext.length).toBeGreaterThan(0);

    mem.memories.save(AGENT, USER, {
      content: 'User chose Zustand for state management over Redux — simpler API, less boilerplate',
      tags: ['zustand', 'state-management', 'preferences'],
      category: 'decision',
      sourceSession: s2.id,
    });

    // Agent saves knowledge chunks
    mem.knowledge.save(AGENT, undefined, {
      content: 'Zustand store: const useStore = create((set) => ({ count: 0, inc: () => set(s => ({ count: s.count + 1 })) }))',
      tags: ['zustand', 'code-example'],
      source: 'zustand-docs',
      chunkIndex: 0,
    });

    mem.sessions.markMined(s2.id);

    // ── Session 3: Agent corrects a memory ──
    const cssMemory = mem.memories.search(AGENT, USER, 'Tailwind CSS');
    expect(cssMemory.length).toBeGreaterThan(0);

    // User corrects: actually they now prefer CSS modules for this project
    const tailwindMemId = cssMemory[0].entity.id;
    mem.memories.update(tailwindMemId, {
      content: 'User switched from Tailwind to CSS Modules for current Next.js project (performance reasons)',
      tags: ['css-modules', 'nextjs', 'preferences'],
      category: 'decision',
    });

    // Verify history shows the correction
    const correctionHistory = mem.memories.history(tailwindMemId);
    expect(correctionHistory.length).toBe(2); // create + update

    // ── Session 4: Agent deprecates a skill ──
    const [deploySkill] = mem.skills.save(AGENT, undefined, {
      content: 'Deploy Next.js to Vercel: push to main, Vercel auto-deploys',
      tags: ['nextjs', 'vercel', 'deploy'],
      category: 'procedure',
    });

    // Later, user switches to self-hosting
    mem.skills.update(deploySkill.id, {
      status: 'deprecated',
      content: 'DEPRECATED: Deploy Next.js to Vercel (user switched to self-hosting)',
    });
    const [_newSkill] = mem.skills.save(AGENT, undefined, {
      content: 'Deploy Next.js to Docker: docker build -t app . && docker run -p 3000:3000 app',
      tags: ['nextjs', 'docker', 'deploy'],
      category: 'procedure',
    });

    // Verify deprecated skill
    expect(mem.skills.get(deploySkill.id)!.status).toBe('deprecated');

    // ── Final verification ──
    const finalStats = mem.stats();
    expect(finalStats.memories).toBeGreaterThanOrEqual(3);
    expect(finalStats.skills).toBeGreaterThanOrEqual(2);
    expect(finalStats.knowledge).toBeGreaterThanOrEqual(1);
    expect(finalStats.sessions).toBe(2);
    expect(finalStats.profiles).toBe(0);

    // Search across everything
    const reactResults = mem.memories.search(AGENT, USER, 'React state management');
    expect(reactResults.length).toBeGreaterThan(0);

    const skillResults = mem.skills.search(AGENT, 'deploy Docker');
    expect(skillResults.length).toBeGreaterThan(0);

    const knowledgeResults = mem.knowledge.search(AGENT, 'Zustand store');
    expect(knowledgeResults.length).toBeGreaterThan(0);

    // Verify integrity
    expect(mem.verify().valid).toBe(true);
  });

  // ── Edge cases ──────────────────────────────────────────────────

  it('handles delete + re-save of similar content', () => {
    const [m1] = mem.memories.save(AGENT, USER, {
      content: 'API key rotation every 90 days',
      tags: ['security'],
      category: 'fact',
    });

    mem.memories.delete(m1.id);

    // Save new memory with similar content
    const [m2] = mem.memories.save(AGENT, USER, {
      content: 'API key rotation every 30 days (policy updated)',
      tags: ['security', 'policy'],
      category: 'fact',
    });

    // Old one has history, new one is independent
    const oldHistory = mem.memories.history(m1.id);
    expect(oldHistory.length).toBe(2); // create + delete

    const newHistory = mem.memories.history(m2.id);
    expect(newHistory.length).toBe(1); // just create

    // Only new memory is listed
    const list = mem.memories.list(AGENT, USER);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(m2.id);
  });

  it('multiple agents with isolated data', () => {
    const AGENT2 = 'gpt-assistant';

    mem.memories.save(AGENT, USER, {
      content: 'Claude specific: user likes concise answers',
      tags: ['style'],
      category: 'fact',
    });
    mem.memories.save(AGENT2, USER, {
      content: 'GPT specific: user likes detailed explanations',
      tags: ['style'],
      category: 'fact',
    });

    const claudeMemories = mem.memories.list(AGENT, USER);
    const gptMemories = mem.memories.list(AGENT2, USER);

    expect(claudeMemories.length).toBe(1);
    expect(gptMemories.length).toBe(1);
    expect(claudeMemories[0].content).toContain('concise');
    expect(gptMemories[0].content).toContain('detailed');
  });

  it('search returns results sorted by relevance', () => {
    mem.memories.save(AGENT, USER, {
      content: 'PostgreSQL is the primary database',
      tags: ['postgresql', 'database'],
      category: 'fact',
    });
    mem.memories.save(AGENT, USER, {
      content: 'Redis is used for caching, not as primary database',
      tags: ['redis', 'caching'],
      category: 'fact',
    });
    mem.memories.save(AGENT, USER, {
      content: 'PostgreSQL connection pooling via pgBouncer with max 20 connections',
      tags: ['postgresql', 'pgbouncer', 'performance'],
      category: 'fact',
    });

    const results = mem.memories.search(AGENT, USER, 'PostgreSQL database');
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Both top results should mention PostgreSQL
    expect(results[0].entity.content).toContain('PostgreSQL');
    // Scores should be descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('snapshot + restore preserves full state', () => {
    // Build up state
    mem.memories.save(AGENT, USER, { content: 'Fact A', tags: ['a'], category: 'fact' });
    mem.memories.save(AGENT, USER, { content: 'Fact B', tags: ['b'], category: 'fact' });
    mem.skills.save(AGENT, undefined, { content: 'Skill X', tags: ['x'] });

    const snap = mem.snapshot('checkpoint');
    const statsBefore = mem.stats();

    // Add more data after snapshot
    mem.memories.save(AGENT, USER, { content: 'Fact C', tags: ['c'], category: 'fact' });
    expect(mem.stats().memories).toBe(3);

    // Restore
    mem.restore(snap.id);
    const restored = new RepoMemory({ dir: baseDir });

    const statsAfter = restored.stats();
    expect(statsAfter.memories).toBe(statsBefore.memories);
    expect(statsAfter.skills).toBe(statsBefore.skills);
    expect(statsAfter.objects).toBe(statsBefore.objects);
    expect(statsAfter.commits).toBe(statsBefore.commits);
    expect(restored.verify().valid).toBe(true);
  });
});
