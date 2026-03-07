import { createServer } from 'node:http';
import { RepoMemory } from './index.js';
import { handleTool, tools } from './mcp/handler.js';

const args = process.argv.slice(2);
let dir = '.repomemory';
let port = 3210;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { dir = args[++i]; }
  else if (args[i] === '--port' && args[i + 1]) { port = Number(args[++i]); }
}

const mem = new RepoMemory({ dir });

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

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // GET /tools — list available tools
    if (url === '/tools' && req.method === 'GET') {
      jsonResponse(res, 200, { tools });
      return;
    }

    // GET /health — health check
    if (url === '/health' && req.method === 'GET') {
      jsonResponse(res, 200, { status: 'ok', dir });
      return;
    }

    // POST /tool/:name — call a tool
    const toolMatch = url.match(/^\/tool\/([a-z_]+)$/);
    if (toolMatch && req.method === 'POST') {
      const toolName = toolMatch[1];
      const body = await readBody(req);
      const args = body ? JSON.parse(body) : {};
      const result = await handleTool(mem, toolName, args);
      jsonResponse(res, 200, { result });
      return;
    }

    jsonResponse(res, 404, { error: 'Not found. Use GET /tools, GET /health, or POST /tool/<name>' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('Unknown tool') ? 404 : 400;
    jsonResponse(res, status, { error: message });
  }
});

server.listen(port, () => {
  process.stderr.write(`RepoMemory HTTP server listening on http://localhost:${port}\n`);
  process.stderr.write(`  Storage: ${dir}\n`);
  process.stderr.write(`  Tools: ${tools.length}\n`);
});
