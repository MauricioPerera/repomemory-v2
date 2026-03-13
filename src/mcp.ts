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
// Stdio transport (dual-mode: Content-Length framing + newline-delimited JSON)
// ---------------------------------------------------------------------------

function send(msg: JsonRpcResponse): void {
  const json = JSON.stringify(msg);
  process.stdout.write(json + '\n');
}

let buffer = '';
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10 MB — prevents OOM from malicious clients
const MAX_MESSAGE_SIZE = 5 * 1024 * 1024; // 5 MB — max single JSON-RPC message

async function processBuffer(): Promise<void> {
  while (true) {
    // Try Content-Length framing first (standard MCP stdio transport)
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (match) {
        const contentLength = parseInt(match[1], 10);
        if (contentLength > MAX_MESSAGE_SIZE) {
          buffer = buffer.slice(headerEnd + 4 + contentLength);
          send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `Message too large: ${contentLength} bytes (max ${MAX_MESSAGE_SIZE})` } });
          continue;
        }
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + contentLength) return;
        const body = buffer.slice(bodyStart, bodyStart + contentLength);
        buffer = buffer.slice(bodyStart + contentLength);
        try {
          const req = JSON.parse(body) as JsonRpcRequest;
          const res = await handleRequest(mem, req);
          if (res) send(res);
        } catch {
          send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        }
        continue;
      }
    }

    // Fallback: newline-delimited JSON (some MCP clients send without Content-Length)
    const newlineIdx = buffer.indexOf('\n');
    if (newlineIdx === -1) return;
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (!line) continue;
    try {
      const req = JSON.parse(line) as JsonRpcRequest;
      const res = await handleRequest(mem, req);
      if (res) send(res);
    } catch {
      // Not valid JSON — skip the line
    }
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  if (buffer.length > MAX_BUFFER_SIZE) {
    send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Buffer overflow: too much unprocessed data' } });
    buffer = '';
    return;
  }
  processBuffer();
});

process.stdin.on('end', () => {
  mem.flush();
  // Do NOT exit — MCP servers must stay alive until killed by the client.
  // Exiting here causes Claude Code health checks to report "Failed to connect".
});

// Keep the event loop alive — MCP servers must not exit until killed by SIGTERM/SIGINT.
setInterval(() => {}, 60_000);

process.on('SIGTERM', () => { mem.flush(); process.exit(0); });
process.on('SIGINT', () => { mem.flush(); process.exit(0); });
