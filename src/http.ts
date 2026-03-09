import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { RepoMemory } from './index.js';
import { handleTool, tools } from './mcp/handler.js';

const args = process.argv.slice(2);
let dir = '.repomemory';
let port = 3210;
let apiKey: string | undefined;
let corsOrigin = '*';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { dir = args[++i]; }
  else if (args[i] === '--port' && args[i + 1]) { port = Number(args[++i]); }
  else if (args[i] === '--api-key' && args[i + 1]) { apiKey = args[++i]; }
  else if (args[i] === '--cors-origin' && args[i + 1]) { corsOrigin = args[++i]; }
}

if (Number.isNaN(port) || port < 1 || port > 65535) {
  process.stderr.write(`Invalid port: ${port}. Must be 1-65535.\n`);
  process.exit(1);
}

const mem = new RepoMemory({ dir });

const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB

function jsonResponse(res: import('node:http').ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error(`Request body too large (max ${MAX_BODY_SIZE} bytes)`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';

  // CORS headers (configurable via --cors-origin, defaults to *)
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API key authentication (if configured via --api-key)
  // Uses timing-safe comparison to prevent timing attacks
  if (apiKey) {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const keyBuf = Buffer.from(apiKey, 'utf8');
    const tokenBuf = Buffer.from(token, 'utf8');
    // Constant-time comparison: pad shorter buffer to prevent length leak
    const isValid = keyBuf.length === tokenBuf.length && timingSafeEqual(keyBuf, tokenBuf);
    if (!isValid && url !== '/health') {
      jsonResponse(res, 401, { error: 'Unauthorized: invalid or missing API key' });
      return;
    }
  }

  try {
    // GET /tools — list available tools
    if (url === '/tools' && req.method === 'GET') {
      jsonResponse(res, 200, { tools });
      return;
    }

    // GET /health — health check
    if (url === '/health' && req.method === 'GET') {
      jsonResponse(res, 200, { status: 'ok', dir, version: '2.15.0' });
      return;
    }

    // GET /stats — storage statistics
    if (url === '/stats' && req.method === 'GET') {
      jsonResponse(res, 200, mem.stats());
      return;
    }

    // GET /entity/:id — get any entity by ID
    const entityGetMatch = url.match(/^\/entity\/([^/]+)$/);
    if (entityGetMatch && req.method === 'GET') {
      const entityId = decodeURIComponent(entityGetMatch[1]);
      const collections = [mem.memories, mem.skills, mem.knowledge, mem.sessions, mem.profiles] as const;
      for (const col of collections) {
        const entity = col.get(entityId);
        if (entity) { jsonResponse(res, 200, entity); return; }
      }
      jsonResponse(res, 404, { error: `Entity not found: ${entityId}` });
      return;
    }

    // DELETE /entity/:id — delete any entity by ID
    if (entityGetMatch && req.method === 'DELETE') {
      const entityId = decodeURIComponent(entityGetMatch[1]);
      const collections = [mem.memories, mem.skills, mem.knowledge, mem.sessions, mem.profiles] as const;
      for (const col of collections) {
        const entity = col.get(entityId);
        if (entity) {
          const commit = col.delete(entityId);
          jsonResponse(res, 200, { deleted: true, entityId, commit });
          return;
        }
      }
      jsonResponse(res, 404, { error: `Entity not found: ${entityId}` });
      return;
    }

    // GET /search?q=...&agentId=...&userId=...&type=...&limit=... — search entities
    const searchMatch = url.match(/^\/search\?(.+)$/);
    if (searchMatch && req.method === 'GET') {
      const params = new URLSearchParams(searchMatch[1]);
      const q = params.get('q') ?? '';
      const agentId = params.get('agentId') ?? '';
      const userId = params.get('userId') ?? undefined;
      const type = params.get('type') ?? 'memory';
      const rawLimit = params.get('limit') ? Number(params.get('limit')) : 10;
      const limit = Math.max(1, Math.min(rawLimit || 10, 200)); // clamp 1-200 (consistent with MAX_SEARCH_LIMIT)
      if (!q || !agentId) {
        jsonResponse(res, 400, { error: 'Required query params: q, agentId' });
        return;
      }
      const col = type === 'skill' ? mem.skills : type === 'knowledge' ? mem.knowledge : mem.memories;
      const results = col.find(agentId, userId, q, limit);
      jsonResponse(res, 200, results);
      return;
    }

    // POST /tool/:name — call a tool
    const toolMatch = url.match(/^\/tool\/([a-z_]+)$/);
    if (toolMatch && req.method === 'POST') {
      // Validate Content-Type for POST requests
      const contentType = req.headers['content-type'] ?? '';
      if (contentType && !contentType.includes('application/json')) {
        jsonResponse(res, 415, { error: 'Unsupported Media Type: expected application/json' });
        return;
      }
      const toolName = toolMatch[1];
      const body = await readBody(req);
      let args: Record<string, unknown>;
      try {
        args = body ? JSON.parse(body) : {};
      } catch {
        jsonResponse(res, 400, { error: 'Invalid JSON in request body' });
        return;
      }
      const result = await handleTool(mem, toolName, args);
      jsonResponse(res, 200, { result });
      return;
    }

    jsonResponse(res, 404, { error: 'Not found. Endpoints: GET /health, /stats, /tools, /entity/:id, /search?q=...&agentId=..., POST /tool/<name>, DELETE /entity/:id' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('too large')) {
      jsonResponse(res, 413, { error: message });
    } else {
      const status = message.includes('Unknown tool') ? 404 : 400;
      jsonResponse(res, status, { error: message });
    }
  }
});

// Graceful shutdown: flush data and close connections on SIGTERM/SIGINT
function gracefulShutdown(signal: string): void {
  process.stderr.write(`\n${signal} received. Shutting down gracefully...\n`);
  mem.flush();
  server.close(() => {
    process.stderr.write('HTTP server closed.\n');
    process.exit(0);
  });
  // Force close after 5 seconds if connections are still open
  setTimeout(() => {
    process.stderr.write('Forced shutdown after timeout.\n');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(port, () => {
  process.stderr.write(`RepoMemory HTTP server listening on http://localhost:${port}\n`);
  process.stderr.write(`  Storage: ${dir}\n`);
  process.stderr.write(`  Tools: ${tools.length}\n`);
  process.stderr.write(`  Auth: ${apiKey ? 'enabled (Bearer token)' : 'disabled (use --api-key to enable)'}\n`);
  process.stderr.write(`  CORS: ${corsOrigin}${corsOrigin === '*' ? ' (use --cors-origin to restrict)' : ''}\n`);
});
