import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { handleRequest, handleTool, tools, type JsonRpcRequest } from '../src/mcp/handler.js';

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

function toolResult(res: ReturnType<typeof callTool>): unknown {
  const result = res!.result as { content: Array<{ text: string }>; isError?: boolean };
  return JSON.parse(result.content[0].text);
}

describe('MCP Handler', () => {
  describe('protocol', () => {
    it('should respond to initialize', () => {
      const res = rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } });
      expect(res!.jsonrpc).toBe('2.0');
      expect(res!.id).toBe(1);
      const result = res!.result as Record<string, unknown>;
      expect(result.protocolVersion).toBe('2024-11-05');
      expect((result.serverInfo as Record<string, string>).name).toBe('repomemory');
      expect(result.capabilities).toHaveProperty('tools');
    });

    it('should return null for notifications/initialized', () => {
      const res = rpc('notifications/initialized');
      expect(res).toBeNull();
    });

    it('should respond to ping', () => {
      const res = rpc('ping');
      expect(res!.result).toEqual({});
    });

    it('should return error for unknown method', () => {
      const res = rpc('unknown/method');
      expect(res!.error).toBeDefined();
      expect(res!.error!.code).toBe(-32601);
    });
  });

  describe('tools/list', () => {
    it('should list all tools', () => {
      const res = rpc('tools/list');
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
    it('should save and search a memory', () => {
      const saveRes = callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'User prefers TypeScript strict mode', tags: ['preferences', 'typescript'] });
      const saved = toolResult(saveRes) as { entity: { id: string; content: string; type: string }; commit: { hash: string } };
      expect(saved.entity.content).toBe('User prefers TypeScript strict mode');
      expect(saved.entity.type).toBe('memory');
      expect(saved.commit.hash).toBeTruthy();

      const searchRes = callTool('memory_search', { agentId: 'a1', userId: 'u1', query: 'typescript' });
      const results = toolResult(searchRes) as Array<{ entity: { content: string }; score: number }>;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entity.content).toContain('TypeScript');
    });

    it('should save_or_update with deduplication', () => {
      // Save several memories to build the TF-IDF index
      callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'User prefers dark mode for the editor and terminal', tags: ['ui', 'preferences'], category: 'fact' });
      callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Project uses TypeScript strict mode', tags: ['typescript'] });
      callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Deployment runs on Docker containers', tags: ['deploy'] });

      const res = callTool('memory_save_or_update', { agentId: 'a1', userId: 'u1', content: 'User prefers dark mode for the editor and terminal themes', tags: ['ui', 'preferences'], category: 'fact' });
      const result = toolResult(res) as { entity: { content: string }; deduplicated: boolean };
      expect(result.deduplicated).toBe(true);
      expect(result.entity.content).toContain('dark mode');
    });

    it('should list memories with pagination', () => {
      callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Memory 1' });
      callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Memory 2' });
      callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Memory 3' });

      const res = callTool('memory_list', { agentId: 'a1', userId: 'u1', limit: 2, offset: 0 });
      const result = toolResult(res) as { items: unknown[]; total: number; hasMore: boolean };
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('skill tools', () => {
    it('should save and search skills', () => {
      callTool('skill_save', { agentId: 'a1', content: 'Deploy with docker compose up -d', tags: ['deploy', 'docker'] });

      const res = callTool('skill_search', { agentId: 'a1', query: 'docker deploy' });
      const results = toolResult(res) as Array<{ entity: { content: string } }>;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entity.content).toContain('docker');
    });

    it('should save_or_update skills', () => {
      callTool('skill_save', { agentId: 'a1', content: 'Run tests with npm test', tags: ['testing'], category: 'procedure' });

      const res = callTool('skill_save_or_update', { agentId: 'a1', content: 'Run tests with npm test -- --watch', tags: ['testing'], category: 'procedure' });
      const result = toolResult(res) as { deduplicated: boolean };
      expect(result.deduplicated).toBe(true);
    });
  });

  describe('knowledge tools', () => {
    it('should save and search knowledge', () => {
      callTool('knowledge_save', { agentId: 'a1', content: 'API rate limit is 100 requests per minute', tags: ['api'], source: 'docs/api.md' });

      const res = callTool('knowledge_search', { agentId: 'a1', query: 'rate limit' });
      const results = toolResult(res) as Array<{ entity: { content: string } }>;
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('session tools', () => {
    it('should save and list sessions', () => {
      callTool('session_save', { agentId: 'a1', userId: 'u1', content: 'User asked about deployment', conversationId: 'conv-1' });
      callTool('session_save', { agentId: 'a1', userId: 'u1', content: 'Follow-up on deployment', conversationId: 'conv-1' });

      const res = callTool('session_list', { agentId: 'a1', userId: 'u1' });
      const sessions = toolResult(res) as Array<{ conversationId: string }>;
      expect(sessions.length).toBe(2);
    });
  });

  describe('profile tools', () => {
    it('should save and get profile', () => {
      callTool('profile_save', { agentId: 'a1', userId: 'u1', content: 'Senior developer, prefers concise responses', metadata: { lang: 'en' } });

      const res = callTool('profile_get', { agentId: 'a1', userId: 'u1' });
      const profile = toolResult(res) as { content: string; metadata: { lang: string } };
      expect(profile.content).toContain('Senior developer');
      expect(profile.metadata.lang).toBe('en');
    });
  });

  describe('cross-cutting tools', () => {
    it('should recall across collections', () => {
      callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Prefers dark mode for all editors', tags: ['preferences'] });
      callTool('skill_save', { agentId: 'a1', content: 'To enable dark mode: settings > theme > dark', tags: ['dark-mode'] });

      const res = callTool('recall', { agentId: 'a1', userId: 'u1', query: 'dark mode' });
      const ctx = toolResult(res) as { totalItems: number; formatted: string };
      expect(ctx.totalItems).toBeGreaterThan(0);
      expect(ctx.formatted).toContain('dark');
    });

    it('should get and delete entity', () => {
      const saveRes = callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Temp memory' });
      const entityId = (toolResult(saveRes) as { entity: { id: string } }).entity.id;

      // Get
      const getRes = callTool('entity_get', { entityId, type: 'memory' });
      const entity = toolResult(getRes) as { id: string };
      expect(entity.id).toBe(entityId);

      // Delete
      const delRes = callTool('entity_delete', { entityId, type: 'memory' });
      const commit = toolResult(delRes) as { message: string };
      expect(commit.message).toContain('delete');

      // Get after delete
      const afterRes = callTool('entity_get', { entityId, type: 'memory' });
      expect(toolResult(afterRes)).toBeNull();
    });

    it('should return entity history', () => {
      const saveRes = callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Original' });
      const entityId = (toolResult(saveRes) as { entity: { id: string } }).entity.id;

      // Update via direct API (entity_history just reads)
      mem.memories.update(entityId, { content: 'Updated' });

      const histRes = callTool('entity_history', { entityId, type: 'memory' });
      const history = toolResult(histRes) as Array<{ hash: string }>;
      expect(history.length).toBe(2);
    });

    it('should return stats', () => {
      callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Test' });

      const res = callTool('stats', {});
      const stats = toolResult(res) as { memories: number; objects: number; commits: number };
      expect(stats.memories).toBe(1);
      expect(stats.objects).toBeGreaterThan(0);
      expect(stats.commits).toBeGreaterThan(0);
    });

    it('should verify integrity', () => {
      callTool('memory_save', { agentId: 'a1', userId: 'u1', content: 'Test' });

      const res = callTool('verify', {});
      const result = toolResult(res) as { valid: boolean; errors: string[] };
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle unknown tool gracefully', () => {
      const res = callTool('nonexistent_tool', {});
      const result = res!.result as { content: Array<{ text: string }>; isError: boolean };
      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Unknown tool');
    });

    it('should handle missing tool name', () => {
      const res = rpc('tools/call', { arguments: {} });
      expect(res!.error).toBeDefined();
      expect(res!.error!.code).toBe(-32602);
    });
  });
});
