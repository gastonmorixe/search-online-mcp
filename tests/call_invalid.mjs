#!/usr/bin/env node
import { spawn } from 'node:child_process';

function send(child, obj) { child.stdin.write(JSON.stringify(obj) + "\n"); }
function collect(child, id) {
  return new Promise((resolve) => {
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        try { const msg = JSON.parse(line); if (msg.id === id) return resolve(msg); } catch {}
      }
    });
  });
}

async function main() {
  const cwd = new URL('..', import.meta.url).pathname;
  const child = spawn('node', ['index.mjs'], { cwd, stdio: ['pipe','pipe','pipe'] });
  send(child, { jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2024-11-05', clientInfo:{name:'tests',version:'0.0.0'}, capabilities:{tools:{}} }});
  await collect(child, 1);
  send(child, { jsonrpc:'2.0', id:2, method:'tools/call', params:{ name:'search_online', arguments: { } } });
  const resp = await collect(child, 2);
  if (!resp.error) throw new Error('Expected error for missing query');
  console.log(JSON.stringify({ ok:true, error: resp.error.message }, null, 2));
  child.kill();
}

main().catch(e => { console.error('TEST:call_invalid FAIL -', e.message); process.exit(1); });

