---
name: session_library_search
description: >
  Search and read OmniPanel session library over LocalAPI. Use when the user
  asks to find past coding-agent sessions by title, cwd, agent, time, or
  message content, or to read a session transcript.
---

# Search OmniPanel session library

OmniPanel indexes coding-agent sessions and exposes them on LocalAPI. This skill
is read-only HTTP against a **running** OmniPanel (desktop GUI or `omni-panel serve`).

## Discover the instance

1. Read `<dataRoot>/cli.json` (written by GUI and serve after LocalAPI listens).
2. Use field `port`. Call only `http://127.0.0.1:<port>/…` (not LAN IPs).
3. Typical dataRoot:
    - Linux: `~/.config/OmniPanel`
    - macOS: `~/Library/Application Support/OmniPanel`
    - Windows: `%APPDATA%\OmniPanel`
4. If `cli.json` is missing, unreadable, or `GET /v1/health` fails → treat as
    **instance not running**. Report that fact; **do not invent** sessions or messages.

Optional smoke: `GET http://127.0.0.1:<port>/v1/health` → `{ "status": "ok", … }`.

## List / filter sessions

`GET /v1/sessions` with query params (all optional; AND together):

|param|meaning|
|---|---|
|`title`|case-insensitive substring on session title|
|`directory`|case-insensitive substring on cwd / directory|
|`sources`|comma-separated agents, e.g. `claude_code,grok`|
|`source`|single agent|
|`env`|`win` / `wsl` / `linux` / `mac`|
|`search`|legacy mixed match on title + directory + id|
|`start_at` / `end_at`|epoch ms; session activity overlaps the range|
|`order_by`|`ended_at` / `started_at` / `tokens` / `calls`|
|`direction`|`asc` / `desc`|
|`limit` / `offset`|page size / offset (default limit 100)|

Response is a JSON array of session objects (`id`, `source`, `env`, `title`,
`directory`, token fields, `started_at`, `ended_at`, …). Empty page → stop paging.

Example:

```bash
curl -sS "http://127.0.0.1:${PORT}/v1/sessions?directory=omni_panel&sources=claude_code,grok&order_by=ended_at&direction=desc&limit=20"
```

Prefer metadata filters (`title` / `directory` / `sources` / time) before content search.

## Search message content

`POST /v1/sessionHistory/searchContent` with JSON body:

```json
{
  "keyword": "needle",
  "filters": {
    "sources": ["claude_code"],
    "directory": "omni_panel"
  },
  "offset": 0,
  "limit": 64
}
```

`filters` 还可选带 `title` / `search` / `start_at` / `end_at`（省略即不约束；勿写字面量 `optional`）。

- `filters` narrow **candidate sessions** (same semantics as list filters).
- `keyword` is case-insensitive substring over message text.
- **`offset` / `limit` paginate candidate scanning**, not result count. Read
    `progress.done` / `progress.next_offset`; loop until `progress.done` is true
    (or abort). Do not treat one response as the full hit set unless `done`.
- Response includes `hits` (keys `source|env|session_id`), `sessions`, optional
    `truncated`, and `progress`.

Workflow: apply metadata filters first → content-search with the same filters →
open hits with the read-messages call below.

## Read messages

`GET /v1/sessionHistory?id=<session_id>&source=<source>&env=<env>`

- `id`, `source`, and `env` are **required**.
- Optional: `limit` (positive int), `before_cursor` (pagination cursor from prior
    `next_cursor`).
- Response: `{ "messages": [...], "next_cursor": "<string>|null" }`. Follow
    `next_cursor` for older pages.

Example:

```bash
curl -sS "http://127.0.0.1:${PORT}/v1/sessionHistory?id=SESSION&source=claude_code&env=linux&limit=50"
```

## Hard rules

- **Read-only.** Never modify session source files on disk.
- Do **not** call subscribe / unsubscribe / window-open style endpoints
    (`POST /v1/sessionHistory/subscribe`, `unsubscribe`, or UI `sessionHistory.open`).
- Do not configure MCP for this workflow; LocalAPI HTTP is enough.
- Session identity is the triple `(source, env, id)` — never key by `id` alone.
