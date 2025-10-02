#!/usr/bin/env node
import { spawn } from 'node:child_process';

function writeFrame(child, obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

function readFrames(stream, onMessage) {
  let buf = '';
  stream.on('data', chunk => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try { onMessage(JSON.parse(line)); } catch (_) {}
    }
  });
}


async function main() {
  const child = spawn('node', ['index.mjs'], { cwd: new URL('.', import.meta.url).pathname, stdio: ['pipe','pipe','pipe'] });
  const results = {};
  readFrames(child.stdout, (msg) => {
    if (msg.id) {
      results[msg.id] = msg;
    }
  });
  const initId = 1;
  writeFrame(child, {
    jsonrpc: '2.0', id: initId, method: 'initialize',
    params: { protocolVersion: '2024-11-05', clientInfo: { name: 'self-test', version: '0.1.0' }, capabilities: { tools: {} } }
  });
  // wait a bit for response
  await new Promise(r => setTimeout(r, 1200));
  if (!results[initId] || !results[initId].result) throw new Error('No initialize result');

  const listId = 2;
  writeFrame(child, { jsonrpc: '2.0', id: listId, method: 'tools/list', params: {} });
  await new Promise(r => setTimeout(r, 800));
  const list = results[listId]?.result?.tools;
  if (!Array.isArray(list) || !list.find(t => t.name === 'search_online')) throw new Error('Tool not listed');

  const callId = 3;
  writeFrame(child, {
    jsonrpc: '2.0', id: callId, method: 'tools/call',
    params: { name: 'search_online', arguments: { query: 'OpenAI Codex', limit: 1 } }
  });
  await new Promise(r => setTimeout(r, 2500));
  const call = results[callId];
  if (!call || !call.result) throw new Error('No tools/call result');
  const content = call.result?.content || [];
  const jsonPart = content.find(c => c.type === 'json');
  if (!jsonPart) throw new Error('No JSON content');
  const count = (jsonPart.json?.results || []).length;
  console.log(JSON.stringify({ ok: true, tools: list.map(t=>t.name), count }, null, 2));
  child.kill();
}

main().catch(err => { console.error('SELF-TEST-ERROR:', err.message); process.exit(1); });
