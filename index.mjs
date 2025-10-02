#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

function logDebug(msg) {
  try {
    const dir = path.join(os.homedir(), '.codex', 'log');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'search_online_mcp.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
  try {
    process.stderr.write(`[search_online_mcp] ${msg}\n`);
  } catch {}
}
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer(
  { name: 'search-online-mcp', version: '0.1.1' },
  { capabilities: { tools: {} } }
);
server.server.oninitialized = () => {
  console.error('[search-online-mcp] initialized');
};
server.server.onerror = (e) => {
  console.error('[search-online-mcp] error', e?.message || e);
};

const paramShape = {
  query: z.string().describe('Search query string.'),
  vertical: z.enum(['web','news','images','videos']).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  offset: z.number().int().min(0).optional(),
  country: z.string().optional(),
  lang: z.string().optional(),
  market: z.string().optional(),
};

function shellEscapeSingle(s) {
  // Wrap for fish/bash: 'foo' -> '\'' escaped
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function ensurePathEnv(baseEnv = process.env) {
  const extraPaths = [
    '/opt/homebrew/bin', '/opt/homebrew/sbin',
    '/usr/local/bin', '/usr/local/sbin',
    '/usr/bin', '/bin', '/usr/sbin', '/sbin'
  ];
  const current = baseEnv.PATH || '';
  const parts = new Set(current.split(':').filter(Boolean));
  for (const p of extraPaths) parts.add(p);
  return Array.from(parts).join(':');
}

function which(cmd, env) {
  try {
    const r = spawnSync('bash', ['-lc', `command -v ${cmd} || true`], { env, encoding: 'utf8' });
    return (r.stdout || '').trim() || null;
  } catch {
    return null;
  }
}

function spawnCapture(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, options);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('error', (e) => reject(new Error(`spawn ${cmd} failed: ${e?.message || e}`)));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function runSearchOnline(args) {
  const {
    query,
    vertical = 'web',
    limit,
    offset,
    country,
    lang,
    market,
  } = args || {};

  if (!query || typeof query !== 'string') {
    throw new Error('query must be a string');
  }

  // Build fish command string safely
  const flags = [];
  if (vertical) flags.push(`-v ${shellEscapeSingle(vertical)}`);
  if (limit != null) flags.push(`-L ${Number(limit)}`);
  if (offset != null) flags.push(`-O ${Number(offset)}`);
  if (country) flags.push(`-C ${shellEscapeSingle(country)}`);
  if (lang) flags.push(`-l ${shellEscapeSingle(lang)}`);
  if (market) flags.push(`-M ${shellEscapeSingle(market)}`);

  const cmd = `search_online -o json ${flags.join(' ')} ${shellEscapeSingle(query)}`;
  logDebug(`cmd=${cmd}`);

  const env = { ...process.env, NO_COLOR: '1' };
  env.PATH = ensurePathEnv(env);
  const keyLen = (env.BRAVE_SEARCH_PYTHON_CLIENT_API_KEY || '').length;
  logDebug(`BRAVE_KEY_LEN=${keyLen}`);
  // Resolve binaries
  const fishBin = which('fish', env) || '/opt/homebrew/bin/fish';
  const uvxPath = which('uvx', env) || '/opt/homebrew/bin/uvx';
  const jqPath = which('jq', env) || '/usr/bin/jq';
  const dbg = `PATH=${env.PATH} fish=${fishBin} uvx=${uvxPath} jq=${jqPath}`;
  logDebug(dbg);

  // First attempt: use fish function (fast path, includes jq formatting)
  if (process.env.SEARCH_ONLINE_FORCE_UVX !== '1') {
    const { code, stdout, stderr } = await spawnCapture(fishBin, ['-lc', cmd], { env });
    if (code === 0) {
      try {
        const parsed = JSON.parse(stdout);
        logDebug(`fish ok len=${stdout.length}`);
        return parsed;
      } catch (e) {
        logDebug(`fish parse error: ${e?.message || e}. head=${stdout.slice(0,120)}`);
        // fall through to uvx
      }
    } else {
      logDebug(`fish exit ${code} stderr=${stderr.trim().slice(0,200)}`);
    }
  }

  // Fallback: call brave-search-python-client directly via uvx
  const uvArgs = ['--with','psutil','--with','httpx','brave-search-python-client', vertical, query];
  if (limit != null) uvArgs.splice(uvArgs.length, 0, '--count', String(limit));
  if (offset != null) uvArgs.splice(uvArgs.length, 0, '--offset', String(offset));
  if (country) uvArgs.splice(uvArgs.length, 0, '--country', country);
  if (lang) uvArgs.splice(uvArgs.length, 0, '--search-lang', lang);
  if (market) uvArgs.splice(uvArgs.length, 0, '--ui-lang', market);
  logDebug(`uvx ${uvArgs.join(' ')}`);
  const { code: ucode, stdout: uout, stderr: uerr } = await spawnCapture(uvxPath, uvArgs, { env: { ...env, BRAVE_SEARCH_PYTHON_CLIENT_API_KEY: process.env.BRAVE_SEARCH_PYTHON_CLIENT_API_KEY } });
  if (ucode !== 0) {
    logDebug(`uvx exit ${ucode} stderr=${(uerr||'').trim().slice(0,200)}`);
  } else {
    try {
      const raw = JSON.parse(uout);
      // Standardize to the same shape fish emits
      const results = ((raw[vertical] && raw[vertical].results) || []).map((v, idx) => ({
        rank: idx+1,
        title: v.title || '',
        url: v.url || '',
        snippet_html: v.description || '',
        snippet: (v.description || '').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&'),
        site_name: (v.profile && v.profile.long_name) || (v.meta_url && v.meta_url.hostname) || null,
        site_url: (v.profile && v.profile.url) || null,
        favicon_url: (v.meta_url && v.meta_url.favicon) || (v.profile && v.profile.img) || null,
        thumbnail_url: (v.thumbnail && v.thumbnail.src) || null,
        published_at: v.page_age || null,
        age: v.age || null,
        content_type: v.subtype || v.content_type || null,
        sitelinks: Array.isArray(v.cluster) ? v.cluster.map(c => ({ title: c.title, url: c.url })) : []
      }));
      const out = { engine: 'brave', vertical, query, fetched_at: new Date().toISOString(), results };
      logDebug(`uvx ok count=${results.length}`);
      return out;
    } catch (e) {
      logDebug(`uvx parse error: ${e?.message || e}. head=${uout.slice(0,200)}`);
    }
  }

  // Final fallback: direct HTTP to Brave API (bypass uvx/fish entirely)
  const key = process.env.BRAVE_SEARCH_PYTHON_CLIENT_API_KEY || '';
  if (!key) throw new Error('BRAVE_SEARCH_PYTHON_CLIENT_API_KEY not set');
  const endpoint = `https://api.search.brave.com/res/v1/${vertical}/search`;
  const params = new URLSearchParams({ q: query });
  if (limit != null) params.set('count', String(limit));
  if (offset != null) params.set('offset', String(offset));
  const url = `${endpoint}?${params.toString()}`;
  logDebug(`http GET ${url}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': key,
        'User-Agent': 'search-online-mcp/0.1'
      },
      signal: ctrl.signal
    });
    clearTimeout(t);
    const text = await res.text();
    if (!res.ok) throw new Error(`brave http ${res.status}`);
    let raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error(`brave json parse: ${e?.message || e}`); }
    const arr = ((raw[vertical] && raw[vertical].results) || []);
    const results = arr.map((v, idx) => ({
      rank: idx+1,
      title: v.title || '',
      url: v.url || '',
      snippet_html: v.description || '',
      snippet: (v.description || '').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&'),
      site_name: (v.profile && v.profile.long_name) || (v.meta_url && v.meta_url.hostname) || null,
      site_url: (v.profile && v.profile.url) || null,
      favicon_url: (v.meta_url && v.meta_url.favicon) || (v.profile && v.profile.img) || null,
      thumbnail_url: (v.thumbnail && v.thumbnail.src) || null,
      published_at: v.page_age || null,
      age: v.age || null,
      content_type: v.subtype || v.content_type || null,
      sitelinks: Array.isArray(v.cluster) ? v.cluster.map(c => ({ title: c.title, url: c.url })) : []
    }));
    logDebug(`http ok count=${results.length}`);
    return { engine: 'brave', vertical, query, fetched_at: new Date().toISOString(), results };
  } catch (e) {
    clearTimeout(t);
    throw new Error(`brave http error: ${e?.message || e}`);
  }
}

server.tool(
  'search_online',
  'Search via fish search_online (Brave by default). Returns standardized JSON.',
  paramShape,
  async (args /*, extra */) => {
    try {
      const json = await runSearchOnline(args);
      const summary = `ok results=${Array.isArray(json?.results) ? json.results.length : 0}`;
      logDebug(`returning success: ${summary}`);
      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: json
      };
    } catch (e) {
      const keyLen = (process.env.BRAVE_SEARCH_PYTHON_CLIENT_API_KEY || '').length;
      const msg = `search_online error: ${e?.message || e} (BRAVE_KEY_LEN=${keyLen})`;
      logDebug(msg);
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  }
);
await server.connect(new StdioServerTransport());
