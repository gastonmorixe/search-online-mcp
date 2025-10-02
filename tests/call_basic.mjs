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
  send(child, { jsonrpc:'2.0', id:2, method:'tools/call', params:{ name:'search_online', arguments:{ query:'OpenAI Codex', limit:2 } } });
  const resp = await collect(child, 2);
  if (!resp.result) throw new Error('No result');
  const sc = resp.result.structuredContent;
  if (!sc || !Array.isArray(sc.results) || sc.results.length === 0) throw new Error('Empty results');
  console.log(JSON.stringify({ ok:true, results: sc.results.length, first: { title: sc.results[0].title, url: sc.results[0].url } }, null, 2));
  child.kill();
}

main().catch(e => { console.error('TEST:call_basic FAIL -', e.message); process.exit(1); });
