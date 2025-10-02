#!/usr/bin/env node
import { spawn } from 'node:child_process';

function send(child, obj) { child.stdin.write(JSON.stringify(obj) + "\n"); }
function recv(child) {
  return new Promise((resolve) => {
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        try { const msg = JSON.parse(line); resolve(msg); return; } catch {}
      }
    });
  });
}

async function main() {
  const cwd = new URL('..', import.meta.url).pathname;
  const child = spawn('node', ['index.mjs'], { cwd, stdio: ['pipe','pipe','pipe'] });
  send(child, { jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2024-11-05', clientInfo:{name:'tests',version:'0.0.0'}, capabilities:{tools:{}} }});
  await recv(child);
  send(child, { jsonrpc:'2.0', id:2, method:'tools/list', params:{} });
  const list = await recv(child);
  const tools = list?.result?.tools || [];
  if (!Array.isArray(tools) || tools.length === 0) throw new Error('No tools listed');
  const names = tools.map(t => t.name);
  const ok = names.every(n => /^[A-Za-z0-9_-]+$/.test(n));
  if (!ok) throw new Error('Tool name did not match allowed pattern');
  console.log(JSON.stringify({ ok:true, names }, null, 2));
  child.kill();
}

main().catch(e => { console.error('TEST:list_names FAIL -', e.message); process.exit(1); });

