# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2] - 2025-10-02
### Changed
- Return Codex‑compatible tool results: TextContent summary + structuredContent JSON.
- Hardened execution flow and logging. Force `uvx` by default; keep fish as optional fast‑path.
- Added direct Brave HTTP fallback to avoid fish/uvx issues.
- Improved README with setup, schema, and troubleshooting.

### Fixed
- MCP tool call failures in Codex caused by unsupported `{type:'json'}` content blocks.
- Output framing issues: no non‑JSON writes to stdout; all debug to server log.

## [0.1.1] - 2025-10-02
### Added
- Initial working MCP server with Brave search through fish function and `uvx` fallback.
- Tests: `list_names`, `call_basic`, `call_invalid`.
- Logging to `~/.codex/log/search_online_mcp.log`.

## [0.1.0] - 2025-10-02
### Added
- Project scaffolding, scripts, and baseline implementation.

---

Guidelines:
- Keep changes minimal and stable; treat stdout as JSON‑RPC only.
- Use `structuredContent` for machine‑readable payloads; `content` for short summaries or error messages.
