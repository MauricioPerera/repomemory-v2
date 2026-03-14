import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../../src/index.js';
import { sanitizeSecrets, resolveSecrets, SENSITIVE_PARAMS } from '../../src/a2e/sanitize.js';
import { checkCircuitBreaker, checkCircuitBreakerFromTag, extractHost } from '../../src/a2e/circuit-breaker.js';
import {
  saveWorkflowSkill,
  saveWorkflowError,
  extractApiKnowledge,
  recallWorkflows,
  parseWorkflowSkill,
  mineA2ePatterns,
} from '../../src/a2e/workflow-skills.js';

// ---------------------------------------------------------------------------
// Sanitize
// ---------------------------------------------------------------------------

describe('A2E Sanitize', () => {
  describe('resolveSecrets', () => {
    it('replaces {{VAR}} placeholders with secret values', () => {
      const result = resolveSecrets('GET https://api.example.com?appid={{API_KEY}}', { API_KEY: 'abc123' });
      expect(result).toBe('GET https://api.example.com?appid=abc123');
    });

    it('leaves unknown placeholders unchanged', () => {
      const result = resolveSecrets('{{KNOWN}} and {{UNKNOWN}}', { KNOWN: 'val' });
      expect(result).toBe('val and {{UNKNOWN}}');
    });

    it('returns text unchanged when no secrets', () => {
      expect(resolveSecrets('hello', {})).toBe('hello');
    });
  });

  describe('sanitizeSecrets', () => {
    it('replaces known secret values with placeholders', () => {
      const result = sanitizeSecrets(
        'ApiCall GET https://api.example.com?key=mysecretkey123',
        { API_KEY: 'mysecretkey123' },
      );
      expect(result).toContain('{{API_KEY}}');
      expect(result).not.toContain('mysecretkey123');
    });

    it('heuristically redacts sensitive query params', () => {
      const result = sanitizeSecrets(
        'ApiCall GET https://api.example.com/data?apikey=secret123&q=weather',
        {},
      );
      expect(result).toContain('apikey={{APIKEY}}');
      expect(result).toContain('q=weather');
      expect(result).not.toContain('secret123');
    });

    it('does not redact already-placeholdered values', () => {
      const result = sanitizeSecrets(
        'GET https://api.example.com?apikey={{MY_KEY}}&q=test',
        {},
      );
      expect(result).toContain('apikey={{MY_KEY}}');
    });

    it('handles longer secrets first to avoid partial matches', () => {
      const result = sanitizeSecrets(
        'token=abcdefghijklmnop prefix=abcdef',
        { LONG: 'abcdefghijklmnop', SHORT: 'abcdef' },
      );
      expect(result).toContain('{{LONG}}');
      expect(result).toContain('{{SHORT}}');
    });

    it('skips secrets shorter than 4 chars', () => {
      const result = sanitizeSecrets('key=abc', { K: 'abc' });
      expect(result).toBe('key=abc');
    });
  });

  describe('SENSITIVE_PARAMS', () => {
    it('contains common auth param names', () => {
      expect(SENSITIVE_PARAMS.has('apikey')).toBe(true);
      expect(SENSITIVE_PARAMS.has('token')).toBe(true);
      expect(SENSITIVE_PARAMS.has('password')).toBe(true);
      expect(SENSITIVE_PARAMS.has('client_secret')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

describe('A2E Circuit Breaker', () => {
  let dir: string;
  let repo: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-a2e-cb-'));
    repo = new RepoMemory({ dir });
  });

  afterEach(() => {
    repo.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('extractHost', () => {
    it('extracts host from URL', () => {
      expect(extractHost('ApiCall GET https://api.weather.com/v1/forecast')).toBe('api.weather.com');
    });

    it('returns null for non-URL text', () => {
      expect(extractHost('FilterData field=name')).toBeNull();
    });
  });

  describe('checkCircuitBreaker', () => {
    it('returns closed when no errors exist', () => {
      const result = checkCircuitBreaker(repo, 'agent1', 'user1', 'api.example.com');
      expect(result.open).toBe(false);
      expect(result.errorCount).toBe(0);
    });

    it('returns open when errors exceed threshold', () => {
      // Save 3 error memories
      for (let i = 0; i < 3; i++) {
        repo.memories.save('agent1', 'user1', {
          content: `Error al ejecutar api.example.com attempt ${i}`,
          category: 'correction',
          tags: ['a2e', 'a2e-error', 'correction'],
        });
      }

      const result = checkCircuitBreaker(repo, 'agent1', 'user1', 'api.example.com');
      expect(result.open).toBe(true);
      expect(result.errorCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('checkCircuitBreakerFromTag', () => {
    it('returns null for non-URL tags', () => {
      const result = checkCircuitBreakerFromTag(repo, 'agent1', 'user1', 'FilterData field=name');
      expect(result).toBeNull();
    });

    it('checks circuit for URL-containing tags', () => {
      const result = checkCircuitBreakerFromTag(repo, 'agent1', 'user1', 'ApiCall GET https://api.example.com/v1');
      expect(result).not.toBeNull();
      expect(result!.open).toBe(false);
      expect(result!.host).toBe('api.example.com');
    });
  });
});

// ---------------------------------------------------------------------------
// Workflow Skills
// ---------------------------------------------------------------------------

describe('A2E Workflow Skills', () => {
  let dir: string;
  let repo: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-a2e-wf-'));
    repo = new RepoMemory({ dir });
  });

  afterEach(() => {
    repo.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('saveWorkflowSkill', () => {
    it('saves a workflow as a fact memory with a2e tags', () => {
      saveWorkflowSkill(repo, 'agent1', 'user1', 'ApiCall GET https://api.weather.com/v1/forecast', 'What is the weather?');
      const results = repo.memories.search('agent1', 'user1', 'weather', 10);
      const a2eResults = results.filter(r => r.entity.tags.includes('a2e'));
      expect(a2eResults.length).toBeGreaterThanOrEqual(1);
      expect(a2eResults[0].entity.content).toContain('[A2E:');
      expect(a2eResults[0].entity.content).toContain('Para What is the weather?');
      expect(a2eResults[0].entity.category).toBe('fact');
    });

    it('sanitizes secrets before saving', () => {
      saveWorkflowSkill(
        repo, 'agent1', 'user1',
        'ApiCall GET https://api.weather.com/v1/forecast?appid=mysecret123',
        'Get forecast',
        { APPID: 'mysecret123' },
      );
      const results = repo.memories.search('agent1', 'user1', 'forecast', 10);
      const a2eResult = results.find(r => r.entity.tags.includes('a2e'));
      expect(a2eResult).toBeDefined();
      expect(a2eResult!.entity.content).not.toContain('mysecret123');
      expect(a2eResult!.entity.content).toContain('{{APPID}}');
    });
  });

  describe('saveWorkflowError', () => {
    it('saves error as correction with a2e-error tag', () => {
      saveWorkflowError(repo, 'agent1', 'user1', 'ApiCall GET https://api.bad.com/v1', '404 Not Found', 'Bad query');
      const results = repo.memories.search('agent1', 'user1', 'bad api', 10);
      const errorResults = results.filter(r => r.entity.tags.includes('a2e-error'));
      expect(errorResults.length).toBeGreaterThanOrEqual(1);
      expect(errorResults[0].entity.category).toBe('correction');
      expect(errorResults[0].entity.content).toContain('Error al ejecutar');
    });
  });

  describe('extractApiKnowledge', () => {
    it('saves API knowledge from a successful ApiCall', () => {
      extractApiKnowledge(
        repo, 'agent1', 'user1',
        'ApiCall GET https://api.weather.com/v1/forecast?appid=secret',
        JSON.stringify({ data: { temp: 20, humidity: 50, wind: 5 } }),
        { APPID: 'secret' },
      );
      const results = repo.memories.search('agent1', 'user1', 'api weather', 10);
      const apiResult = results.find(r => r.entity.tags.includes('a2e-skill'));
      expect(apiResult).toBeDefined();
      expect(apiResult!.entity.content).toContain('API disponible');
      expect(apiResult!.entity.content).toContain('api.weather.com');
    });

    it('ignores non-ApiCall tags', () => {
      extractApiKnowledge(repo, 'agent1', 'user1', 'FilterData field=name', '{}');
      const all = repo.memories.list('agent1', 'user1');
      expect(all.length).toBe(0);
    });
  });

  describe('recallWorkflows', () => {
    it('returns saved workflow patterns matching query', () => {
      saveWorkflowSkill(repo, 'agent1', 'user1', 'ApiCall GET https://api.weather.com/v1/forecast', 'Get weather forecast');
      saveWorkflowSkill(repo, 'agent1', 'user1', 'ApiCall GET https://api.news.com/v1/headlines', 'Get news headlines');

      const workflows = recallWorkflows(repo, 'agent1', 'user1', 'weather');
      expect(workflows.length).toBeGreaterThanOrEqual(1);
      expect(workflows[0]).toContain('[A2E:');
    });

    it('excludes error corrections', () => {
      saveWorkflowSkill(repo, 'agent1', 'user1', 'ApiCall GET https://api.good.com/v1', 'Good query');
      saveWorkflowError(repo, 'agent1', 'user1', 'ApiCall GET https://api.good.com/v1', 'Error', 'Bad query');

      const workflows = recallWorkflows(repo, 'agent1', 'user1', 'good api');
      for (const w of workflows) {
        expect(w).not.toContain('Error al ejecutar');
      }
    });
  });

  describe('parseWorkflowSkill', () => {
    it('parses valid workflow skill format', () => {
      const result = parseWorkflowSkill('Para What is the weather?: [A2E: ApiCall GET https://api.weather.com/v1]');
      expect(result).not.toBeNull();
      expect(result!.user).toBe('What is the weather?');
      expect(result!.assistant).toContain('[A2E:');
    });

    it('returns null for non-matching content', () => {
      expect(parseWorkflowSkill('Just some text')).toBeNull();
    });
  });

  describe('mineA2ePatterns', () => {
    it('extracts A2E patterns from session content', () => {
      const session = [
        'user: What is the weather in Madrid?',
        'assistant: [A2E: ApiCall GET https://api.weather.com/v1/forecast?q=Madrid]',
        'user: And the news?',
        'assistant: [A2E: ApiCall GET https://api.news.com/v1/headlines?q=Spain]',
      ].join('\n');

      const count = mineA2ePatterns(repo, 'agent1', 'user1', session);
      expect(count).toBe(2);

      const results = repo.memories.search('agent1', 'user1', 'weather', 10);
      expect(results.some(r => r.entity.tags.includes('mined'))).toBe(true);
    });

    it('skips error lines', () => {
      const session = [
        'user: Bad request',
        'assistant: [A2E: ApiCall GET https://bad.com] [error: 500]',
      ].join('\n');

      const count = mineA2ePatterns(repo, 'agent1', 'user1', session);
      expect(count).toBe(0);
    });

    it('sanitizes secrets in mined patterns', () => {
      const session = [
        'user: Get data',
        'assistant: [A2E: ApiCall GET https://api.example.com?token=secretval123]',
      ].join('\n');

      mineA2ePatterns(repo, 'agent1', 'user1', session, { TOKEN: 'secretval123' });
      const results = repo.memories.search('agent1', 'user1', 'data', 10);
      const mined = results.find(r => r.entity.tags.includes('mined'));
      expect(mined).toBeDefined();
      expect(mined!.entity.content).not.toContain('secretval123');
    });
  });
});

// ---------------------------------------------------------------------------
// RecallEngine A2E integration
// ---------------------------------------------------------------------------

describe('RecallEngine A2E few-shot extraction', () => {
  let dir: string;
  let repo: RepoMemory;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-a2e-recall-'));
    repo = new RepoMemory({ dir });
  });

  afterEach(() => {
    repo.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  it('extracts [A2E: ...] skills as few-shot examples', () => {
    repo.skills.save('agent1', undefined, {
      content: 'Para consultar el clima: [A2E: ApiCall GET https://api.weather.com/v1/forecast]',
      tags: ['a2e', 'workflow'],
      category: 'workflow',
    });

    const ctx = repo.recall('agent1', 'user1', 'clima', { template: 'few_shot' });
    expect(ctx.fewShotExamples).toBeDefined();
    expect(ctx.fewShotExamples!.length).toBeGreaterThanOrEqual(1);
    expect(ctx.fewShotExamples![0].assistant).toContain('[A2E:');
  });
});
