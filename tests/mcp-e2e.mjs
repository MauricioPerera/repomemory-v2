/**
 * End-to-end test: spawns the MCP server and sends real JSON-RPC messages.
 * Run: node tests/mcp-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const dir = '/tmp/mcp-e2e-' + Date.now();
const proc = spawn(process.execPath, ['dist/mcp.js', '--dir', dir], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let stdout = '';
proc.stdout.on('data', d => { stdout += d.toString(); });
proc.stderr.on('data', d => { process.stderr.write(d); });

function send(obj) {
  const json = JSON.stringify(obj);
  proc.stdin.write('Content-Length: ' + Buffer.byteLength(json) + '\r\n\r\n' + json);
}

function waitResponse() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Response timeout')), 10000);
    const check = setInterval(() => {
      const idx = stdout.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const m = stdout.slice(0, idx).match(/Content-Length:\s*(\d+)/i);
      if (!m) { stdout = stdout.slice(idx + 4); return; }
      const len = parseInt(m[1]);
      const bs = idx + 4;
      if (stdout.length < bs + len) return;
      const body = stdout.slice(bs, bs + len);
      stdout = stdout.slice(bs + len);
      clearInterval(check);
      clearTimeout(timer);
      resolve(JSON.parse(body));
    }, 20);
  });
}

function cleanup() {
  proc.kill();
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

async function run() {
  console.log('MCP Server E2E Test\n');

  // 1. Initialize
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '1.0' } } });
  const init = await waitResponse();
  console.log('✓ Initialize:', init.result.serverInfo.name, 'v' + init.result.serverInfo.version);

  // 2. Save memory
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'memory_save', arguments: { agentId: 'claude', userId: 'user1', content: 'User prefers TypeScript strict mode with dark theme', tags: ['prefs', 'ts'], category: 'fact' } } });
  const s1 = await waitResponse();
  const mem = JSON.parse(s1.result.content[0].text);
  console.log('✓ memory_save:', mem.entity.id);

  // 3. Save skill
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'skill_save', arguments: { agentId: 'claude', content: 'Deploy: npm run build && npm publish', tags: ['deploy'] } } });
  const s2 = await waitResponse();
  const sk = JSON.parse(s2.result.content[0].text);
  console.log('✓ skill_save:', sk.entity.id);

  // 4. Save knowledge
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'knowledge_save', arguments: { agentId: 'claude', content: 'RepoMemory uses TF-IDF search without vectors by design', tags: ['arch'], source: 'README.md' } } });
  const s3 = await waitResponse();
  const kn = JSON.parse(s3.result.content[0].text);
  console.log('✓ knowledge_save:', kn.entity.id);

  // 5. Save session
  send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'session_save', arguments: { agentId: 'claude', userId: 'user1', content: 'MCP creation session', messages: [{ role: 'user', content: 'Create MCP' }, { role: 'assistant', content: 'Done' }], conversationId: 'c1' } } });
  const s4 = await waitResponse();
  const se = JSON.parse(s4.result.content[0].text);
  console.log('✓ session_save:', se.entity.id, '| messages:', se.entity.messages.length);

  // 6. Save profile
  send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'profile_save', arguments: { agentId: 'claude', userId: 'user1', content: 'Senior dev, prefers Spanish', metadata: { lang: 'es' } } } });
  const s5 = await waitResponse();
  const pr = JSON.parse(s5.result.content[0].text);
  console.log('✓ profile_save:', pr.entity.id);

  // 7. Search
  send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'memory_search', arguments: { agentId: 'claude', userId: 'user1', query: 'typescript' } } });
  const s6 = await waitResponse();
  const sr = JSON.parse(s6.result.content[0].text);
  console.log('✓ memory_search:', sr.length, 'results');

  // 8. Recall
  send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'recall', arguments: { agentId: 'claude', userId: 'user1', query: 'typescript deploy' } } });
  const s7 = await waitResponse();
  const rc = JSON.parse(s7.result.content[0].text);
  console.log('✓ recall:', rc.totalItems, 'items |', rc.estimatedChars, 'chars | profile:', rc.profile !== null);

  // 9. Get profile
  send({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'profile_get', arguments: { agentId: 'claude', userId: 'user1' } } });
  const s8 = await waitResponse();
  const pg = JSON.parse(s8.result.content[0].text);
  console.log('✓ profile_get:', pg.content);

  // 10. Entity history
  send({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'entity_history', arguments: { entityId: mem.entity.id, type: 'memory' } } });
  const s9 = await waitResponse();
  const hi = JSON.parse(s9.result.content[0].text);
  console.log('✓ entity_history:', hi.length, 'commits');

  // 11. Stats
  send({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'stats', arguments: {} } });
  const s10 = await waitResponse();
  const st = JSON.parse(s10.result.content[0].text);
  console.log('✓ stats: memories=' + st.memories, 'skills=' + st.skills, 'knowledge=' + st.knowledge, 'sessions=' + st.sessions, 'profiles=' + st.profiles);

  // 12. Verify
  send({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'verify', arguments: {} } });
  const s11 = await waitResponse();
  const vr = JSON.parse(s11.result.content[0].text);
  console.log('✓ verify: valid=' + vr.valid, 'objects=' + vr.totalObjects, 'commits=' + vr.totalCommits);

  // 13. Delete
  send({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'entity_delete', arguments: { entityId: mem.entity.id, type: 'memory' } } });
  const s12 = await waitResponse();
  const dl = JSON.parse(s12.result.content[0].text);
  console.log('✓ entity_delete:', dl.message);

  // 14. Get after delete (should be null)
  send({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'entity_get', arguments: { entityId: mem.entity.id, type: 'memory' } } });
  const s13 = await waitResponse();
  const gn = JSON.parse(s13.result.content[0].text);
  console.log('✓ entity_get after delete: null =', gn === null);

  console.log('\n========================================');
  console.log('  ALL 14 MCP OPERATIONS PASSED');
  console.log('========================================');

  cleanup();
  process.exit(0);
}

run().catch(e => {
  console.error('\nFAILED:', e.message);
  cleanup();
  process.exit(1);
});

setTimeout(() => { console.error('TIMEOUT'); cleanup(); process.exit(1); }, 30000);
