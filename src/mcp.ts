/**
 * RepoMemory MCP Server — stdio transport.
 *
 * Model Context Protocol server over stdio (JSON-RPC 2.0).
 * Zero external dependencies — uses only Node.js built-ins.
 *
 * Usage:
 *   node dist/mcp.js --dir .repomemory
 */

import { RepoMemory } from './index.js';
import { handleRequest, type JsonRpcRequest, type JsonRpcResponse } from './mcp/handler.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getDir(): string {
  const idx = process.argv.indexOf('--dir');
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : '.repomemory';
}

const mem = new RepoMemory({ dir: getDir() });

// ---------------------------------------------------------------------------
// Stdio transport (Content-Length framed JSON-RPC)
// ---------------------------------------------------------------------------

function send(msg: JsonRpcResponse): void {
  const json = JSON.stringify(msg);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

let buffer = '';

function processBuffer(): void {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + contentLength) return;

    const body = buffer.slice(bodyStart, bodyStart + contentLength);
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const req = JSON.parse(body) as JsonRpcRequest;
      const res = handleRequest(mem, req);
      if (res) send(res);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  processBuffer();
});

process.stdin.on('end', () => {
  mem.flush();
  process.exit(0);
});

process.on('SIGTERM', () => { mem.flush(); process.exit(0); });
process.on('SIGINT', () => { mem.flush(); process.exit(0); });
