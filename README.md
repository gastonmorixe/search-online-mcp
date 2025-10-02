# Search Online MCP Server

An MCP (Model Context Protocol) server that exposes a standardized web search tool for agents and clients like OpenAI Codex, Claude, and Cursor. It uses Brave Search under the hood and returns stable, agent‑friendly JSON.

## Features

- One tool: `search_online` (engine: Brave; verticals: web/news/images/videos)
- Stable output shape via `structuredContent` and a concise `text` summary
- Fallback chain for robustness:
  1. Fish function `search_online` (if available)
  2. `uvx brave-search-python-client` (httpx/psutil)
  3. Direct Brave HTTP API (X-Subscription-Token)
- No stdout leakage: safe JSON‑RPC framing (all debug goes to logs)

## Install

```bash
cd ~/Projects/mcp
git clone <repo> search-online-mcp
cd search-online-mcp
npm install
```

## Configure Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.searchonline]
command = "node"
args = ["/Users/YOU/Projects/mcp/search-online-mcp/index.mjs"]
env = {
  BRAVE_SEARCH_PYTHON_CLIENT_API_KEY = "YOUR_BRAVE_KEY",
  # skip fish/jq, go straight to uvx for stability
  SEARCH_ONLINE_FORCE_UVX = "1",
}
startup_timeout_ms = 20_000
tool_timeout_sec = 60
```

Restart Codex. Verify:

```bash
codex mcp list
codex mcp get searchonline --json
```

## Tool schema

Input (zod → JSON Schema):

- `query` string (required) — search query
- `vertical` enum: web|news|images|videos (default web)
- `limit` integer 1..20 (optional)
- `offset` integer ≥0 (optional)
- `country`, `lang`, `market` (optional)

Output:

- `content`: `[ { type: "text", text: "ok results=N" } ]`
- `structuredContent`: full JSON with keys: `engine`, `vertical`, `query`, `fetched_at`, `results[]` (rank, title, url, snippet, site_name, etc.)
- on error: `isError: true` with a text explanation

## Environment variables

- `BRAVE_SEARCH_PYTHON_CLIENT_API_KEY` — Brave API key (required)
- `SEARCH_ONLINE_FORCE_UVX=1` — skip fish; go straight to `uvx`
- `SEARCH_ONLINE_DEBUG_STDERR=1` — mirror debug to stderr (Codex logs)

## Logs

- MCP server writes to `~/.codex/log/search_online_mcp.log`
- Codex session logs:
  - TUI: `~/.codex/log/codex-tui.log`
  - exec (non-interactive): stderr you redirect (e.g., `--json >out 2>err`)

## Tests

Local tests (require Brave key unless you mock):

```bash
npm run test:all
```

What they do:

- `tests/list_names.mjs`: confirms tool names comply with the allowed pattern
- `tests/call_basic.mjs`: calls `search_online` (uses `structuredContent`)
- `tests/call_invalid.mjs`: confirms missing `query` produces an MCP error

## Troubleshooting

- See `~/.codex/log/search_online_mcp.log` for per-call details (PATH, cmd, uvx/http status).
- If you still see “tool call failed” in Codex:
  - Kill stale server: `pkill -f "search-online-mcp/index.mjs"`
  - Start a new Codex session (not resume)
  - Ensure `SEARCH_ONLINE_FORCE_UVX=1`

## License

MIT

