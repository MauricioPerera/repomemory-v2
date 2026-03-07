import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoMemory } from '../src/index.js';
import { handleTool, tools } from '../src/mcp/handler.js';

// Instead of spawning the HTTP server process, we create a minimal in-process version
// that mirrors the same logic for testability.

let dir: string;
let mem: RepoMemory;
let server: Server;
let baseUrl: string;

function jsonResponse(res: import('node:http').ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rm-http-'));
  mem = new RepoMemory({ dir });

  server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      if (url === '/tools' && req.method === 'GET') {
        jsonResponse(res, 200, { tools });
        return;
      }
      if (url === '/health' && req.method === 'GET') {
        jsonResponse(res, 200, { status: 'ok', dir });
        return;
      }
      const toolMatch = url.match(/^\/tool\/([a-z_]+)$/);
      if (toolMatch && req.method === 'POST') {
        const body = await readBody(req);
        const args = body ? JSON.parse(body) : {};
        const result = await handleTool(mem, toolMatch[1], args);
        jsonResponse(res, 200, { result });
        return;
      }
      jsonResponse(res, 404, { error: 'Not found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 400, { error: message });
    }
  });

  await new Promise<void>(resolve => {
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function httpGet(path: string): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, data: await res.json() };
}

async function httpPost(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

describe('HTTP API', () => {
  it('GET /health returns ok', async () => {
    const { status, data } = await httpGet('/health');
    expect(status).toBe(200);
    expect((data as Record<string, unknown>).status).toBe('ok');
  });

  it('GET /tools lists available tools', async () => {
    const { status, data } = await httpGet('/tools');
    expect(status).toBe(200);
    const toolList = (data as Record<string, unknown>).tools as Array<{ name: string }>;
    expect(toolList.length).toBeGreaterThan(20);
    expect(toolList.some(t => t.name === 'memory_save')).toBe(true);
  });

  it('POST /tool/memory_save creates a memory', async () => {
    const { status, data } = await httpPost('/tool/memory_save', {
      agentId: 'http-agent',
      userId: 'http-user',
      content: 'Created via HTTP API',
      tags: ['http', 'test'],
    });
    expect(status).toBe(200);
    const result = (data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.entity).toBeTruthy();
    expect(result.commit).toBeTruthy();
  });

  it('POST /tool/memory_search finds saved memory', async () => {
    const { status, data } = await httpPost('/tool/memory_search', {
      agentId: 'http-agent',
      userId: 'http-user',
      query: 'HTTP API',
      limit: 5,
    });
    expect(status).toBe(200);
    const results = (data as Record<string, unknown>).result as Array<unknown>;
    expect(results.length).toBeGreaterThan(0);
  });

  it('POST /tool/stats returns statistics', async () => {
    const { status, data } = await httpPost('/tool/stats', {});
    expect(status).toBe(200);
    const result = (data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.memories).toBeGreaterThanOrEqual(1);
  });

  it('POST /tool/verify returns integrity check', async () => {
    const { status, data } = await httpPost('/tool/verify', {});
    expect(status).toBe(200);
    const result = (data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.valid).toBe(true);
  });

  it('POST /tool/export exports all entities', async () => {
    const { status, data } = await httpPost('/tool/export', {});
    expect(status).toBe(200);
    const result = (data as Record<string, unknown>).result as Record<string, unknown>;
    expect(result.version).toBe(1);
    expect(result.entities).toBeTruthy();
  });

  it('returns 404 for unknown tool', async () => {
    const { status, data } = await httpPost('/tool/nonexistent', {});
    expect(status).toBe(400);
    expect((data as Record<string, unknown>).error).toContain('Unknown tool');
  });

  it('returns 404 for unknown route', async () => {
    const { status } = await httpGet('/unknown');
    expect(status).toBe(404);
  });

  it('CORS headers are present', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('full CRUD workflow', async () => {
    // Save
    const { data: saveData } = await httpPost('/tool/skill_save', {
      agentId: 'http-agent',
      content: 'Deploy with docker compose',
      tags: ['deploy', 'docker'],
      category: 'procedure',
    });
    const skillId = ((saveData as Record<string, unknown>).result as Record<string, Record<string, unknown>>).entity.id as string;
    expect(skillId).toBeTruthy();

    // Get
    const { data: getData } = await httpPost('/tool/entity_get', { entityId: skillId, type: 'skill' });
    const fetched = (getData as Record<string, unknown>).result as Record<string, unknown>;
    expect(fetched.content).toBe('Deploy with docker compose');

    // Delete
    const { data: delData } = await httpPost('/tool/entity_delete', { entityId: skillId, type: 'skill' });
    expect((delData as Record<string, unknown>).result).toBeTruthy();

    // Get after delete
    const { data: afterDel } = await httpPost('/tool/entity_get', { entityId: skillId, type: 'skill' });
    expect((afterDel as Record<string, unknown>).result).toBeNull();
  });
});
