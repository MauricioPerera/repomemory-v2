import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { handleRequest, tools, type JsonRpcRequest } from '../src/mcp/handler.js';

let mem: RepoMemory;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'repomem-mcp-'));
  mem = new RepoMemory({ dir });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function rpc(method: string, params: Record<string, unknown> = {}, id: number = 1) {
  return handleRequest(mem, { jsonrpc: '2.0', id, method, params } as JsonRpcRequest);
}

function callTool(name: string, args: Record<string, unknown>, id = 1) {
  return rpc('tools/call', { name, arguments: args }, id);
}

async function toolResult(resPromise: ReturnType<typeof callTool>): Promise<unknown> {
  const res = await resPromise;
  const result = res!.result as { content: Array<{ text: string }>; isError?: boolean };
  return JSON.parse(result.content[0].text);
}

describe('MCP Handler', () => {
  describe('protocol', () => {
    it('should respond to initialize', async () => {
      const res = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } });
      expect(res!.jsonrpc).toBe('2.0');
      expect(res!.id).toBe(1);
      const result = res!.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe('2024-11-05');
      expect((result.serverInfo as Record<string, string>).name).toBe('repomemory');
      expect(result.capabilities).toHaveProperty('tools');
    });

    it('should return null for notifications/initialized', async () => {
      const res = await rpc('notifications/initialized');
      expect(res).toBeNull();
    });

    it('should respond to ping', async () => {
      const res = await rpc('ping');
      expect(res!.result).toEqual({});
    });

    it('should return error for unknown method', async () => {
      const res = await rpc('unknown/method');
      expect(res!.error).toBeDefined();
      expect(res!.error!.code).toBe(-32601);
    });
  });

  describe('tools/list', () => {
    it('should list all tools', async () => {
      const res = await rpc('tools/list');
      const result = res!.result as { tools: Array<{ name: string }> };
      const names = result.tools.map(t => t.name);
      expect(names).toContain('memory_save');
      expect(names).toContain('memory_search');
      expect(names).toContain('memory_save_or_update');
      expect(names).toContain('memory_list');
      expect(names).toContain('skill_save');
      expect(names).toContain('skill_search');
      expect(names).toContain('skill_save_or_update');
      expect(names).toContain('knowledge_save');
      expect(names).toContain('knowledge_search');
      expect(names).toContain('knowledge_save_or_update');
      expect(names).toContain('session_save');
      expect(names).toContain('session_list');
      expect(names).toContain('profile_save');
      expect(names).toContain('profile_get');
      expect(names).toContain('recall');
      expect(names).toContain('mine');
      expect(names).toContain('entity_get');
      expect(names).toContain('entity_delete');
      expect(names).toContain('entity_history');
      expect(names).toContain('stats');
      expect(names).toContain('verify');
    });

    it('every tool should have inputSchema', () => {
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('memory tools', () => {
    it('should save and search a memory', async () => {
      const saved = await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'User prefers TypeScript strict mode', tags: ['preferences', 'typescript'] })) as { entity: { id: string; content: string; type: string }; commit: { hash: string } };
      expect(saved.entity.content).toBe('User prefers TypeScript strict mode');
      expect(saved.entity.type).toBe('memory');
      expect(saved.commit.hash).toBeTruthy();

      const results = await toolResult(callTool('memory_search', { agentId: 'a1', userId: 'u1', query: 'typescript' })) as Array<{ entity: { content: string }; score: number }>;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entity.content).toContain('TypeScript');
    });

    it('should save_or_update with deduplication', async () => {
      await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'User prefers dark mode for the editor and terminal', tags: ['ui', 'preferences'], category: 'fact' }));
      await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Project uses TypeScript strict mode', tags: ['typescript'] }));
      await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Deployment runs on Docker containers', tags: ['deploy'] }));

      const result = await toolResult(callTool('memory_save_or_update', { agentId: 'a1', userId: 'u1', content: 'User prefers dark mode for the editor and terminal themes', tags: ['ui', 'preferences'], category: 'fact' })) as { entity: { content: string }; deduplicated: boolean };
      expect(result.deduplicated).toBe(true);
      expect(result.entity.content).toContain('dark mode');
    });

    it('should list memories with pagination', async () => {
      await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Memory 1' }));
      await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Memory 2' }));
      await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Memory 3' }));

      const result = await toolResult(callTool('memory_list', { agentId: 'a1', userId: 'u1', limit: 2, offset: 0 })) as { items: unknown[]; total: number; hasMore: boolean };
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('skill tools', () => {
    it('should save and search skills', async () => {
      await toolResult(callTool('skill_save', { agentId: 'a1', content: 'Deploy with docker compose up -d', tags: ['deploy', 'docker'] }));

      const results = await toolResult(callTool('skill_search', { agentId: 'a1', query: 'docker deploy' })) as Array<{ entity: { content: string } }>;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entity.content).toContain('docker');
    });

    it('should save_or_update skills', async () => {
      await toolResult(callTool('skill_save', { agentId: 'a1', content: 'Run tests with npm test', tags: ['testing'], category: 'procedure' }));

      const result = await toolResult(callTool('skill_save_or_update', { agentId: 'a1', content: 'Run tests with npm test -- --watch', tags: ['testing'], category: 'procedure' })) as { deduplicated: boolean };
      expect(result.deduplicated).toBe(true);
    });
  });

  describe('knowledge tools', () => {
    it('should save and search knowledge', async () => {
      await toolResult(callTool('knowledge_save', { agentId: 'a1', content: 'API rate limit is 100 requests per minute', tags: ['api'], source: 'docs/api.md' }));

      const results = await toolResult(callTool('knowledge_search', { agentId: 'a1', query: 'rate limit' })) as Array<{ entity: { content: string } }>;
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('session tools', () => {
    it('should save and list sessions', async () => {
      await toolResult(callTool('session_save', { agentId: 'a1', userId: 'u1', content: 'User asked about deployment', conversationId: 'conv-1' }));
      await toolResult(callTool('session_save', { agentId: 'a1', userId: 'u1', content: 'Follow-up on deployment', conversationId: 'conv-1' }));

      const sessions = await toolResult(callTool('session_list', { agentId: 'a1', userId: 'u1' })) as Array<{ conversationId: string }>;
      expect(sessions.length).toBe(2);
    });
  });

  describe('profile tools', () => {
    it('should save and get profile', async () => {
      await toolResult(callTool('profile_save', { agentId: 'a1', userId: 'u1', content: 'Senior developer, prefers concise responses', metadata: { lang: 'en' } }));

      const profile = await toolResult(callTool('profile_get', { agentId: 'a1', userId: 'u1' })) as { content: string; metadata: { lang: string } };
      expect(profile.content).toContain('Senior developer');
      expect(profile.metadata.lang).toBe('en');
    });
  });

  describe('cross-cutting tools', () => {
    it('should recall across collections', async () => {
      await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Prefers dark mode for all editors', tags: ['preferences'] }));
      await toolResult(callTool('skill_save', { agentId: 'a1', content: 'To enable dark mode: settings > theme > dark', tags: ['dark-mode'] }));

      const ctx = await toolResult(callTool('recall', { agentId: 'a1', userId: 'u1', query: 'dark mode' })) as { totalItems: number; formatted: string };
      expect(ctx.totalItems).toBeGreaterThan(0);
      expect(ctx.formatted).toContain('dark');
    });

    it('should get and delete entity', async () => {
      const saved = await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Temp memory' })) as { entity: { id: string } };
      const entityId = saved.entity.id;

      const entity = await toolResult(callTool('entity_get', { entityId, type: 'memory' })) as { id: string };
      expect(entity.id).toBe(entityId);

      const commit = await toolResult(callTool('entity_delete', { entityId, type: 'memory' })) as { message: string };
      expect(commit.message).toContain('delete');

      const afterDel = await toolResult(callTool('entity_get', { entityId, type: 'memory' }));
      expect(afterDel).toBeNull();
    });

    it('should return entity history', async () => {
      const saved = await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Original' })) as { entity: { id: string } };
      mem.memories.update(saved.entity.id, { content: 'Updated' });

      const history = await toolResult(callTool('entity_history', { entityId: saved.entity.id, type: 'memory' })) as Array<{ hash: string }>;
      expect(history.length).toBe(2);
    });

    it('should return stats', async () => {
      await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Test' }));

      const stats = await toolResult(callTool('stats', {})) as { memories: number; objects: number; commits: number };
      expect(stats.memories).toBe(1);
      expect(stats.objects).toBeGreaterThan(0);
      expect(stats.commits).toBeGreaterThan(0);
    });

    it('should verify integrity', async () => {
      await toolResult(callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Test' }));

      const result = await toolResult(callTool('verify', {})) as { valid: boolean; errors: string[] };
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle unknown tool gracefully', async () => {
      const res = await callTool('nonexistent_tool', {});
      const result = res!.result as { content: Array<{ text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Unknown tool');
    });

    it('should handle missing tool name', async () => {
      const res = await rpc('tools/call', { arguments: {} });
      expect(res!.error).toBeDefined();
      expect(res!.error!.code).toBe(-32602);
    });

    it('should return error when mine is called without AI provider', async () => {
      const [session] = mem.sessions.save('a1', 'u1', { content: 'test session' });
      const res = await callTool('mine', { sessionId: session.id });
      const result = res!.result as { content: Array<{ text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('AI provider required');
    });
  });
});
