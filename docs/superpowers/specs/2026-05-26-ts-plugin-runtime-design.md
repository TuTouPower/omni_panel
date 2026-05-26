# TypeScript Plugin Runtime Redesign

> Date: 2026-05-26
> Status: Approved
> Scope: Replace all Python plugins with TypeScript, remove Python runtime entirely

## 1. Output Protocol

Plugin stdout is JSON, split into success/failure:

**Success:**

```ts
{
  success: true,
  schemaVersion: number,
  updatedAt: string,           // ISO 8601, plugin-generated
  items: UsageItem[],
  badge?: string,
  chart?: PluginChart,
}

type UsageItem = {
  id: string
  name: string
  used: number
  limit: number
  displayStyle: "percent" | "ratio"
  resetAt?: string | null
  status: "normal" | "warning" | "critical" | "unknown"
  color?: "blue" | "green" | "yellow" | "orange" | "red"
}

type PluginChart = {
  kind: string
  period: string
  bucketUnit: "hour" | "day"
  buckets: Array<{
    id?: string
    label: string
    segments: Array<{ model: string; tokens: number }>
  }>
  message?: string | null
}
```

**Failure:**

```ts
{
  success: false,
  error: {
    code: string     // e.g. AUTH_FAILED, TIMEOUT, NETWORK_ERROR
    message: string  // user-readable
  }
}
```

**Diff from current schema:**

- Success: added `success: true`, rest unchanged
- Failure: `{ error: string }` → `{ success: false, error: { code, message } }`

## 2. Metadata & Plugin File Format

Plugin metadata in `//` comment block at file head:

```ts
// UsageBoardPlugin:
// {
//   "name": "DeepSeek",
//   "name@zh-Hans": "DeepSeek",
//   "parameters": [
//     { "name": "API_KEY", "label": "Api Key", "type": "secret", "required": true }
//   ]
// }
// /UsageBoardPlugin
```

Only `//` comment prefix supported. Metadata fields unchanged from current schema (name, description, icon, parameters with i18n passthrough). No new fields like runtime/source/entry.

`metadata-parser.ts` change: `stripCommentPrefix` handles `//` only, remove `#` support.

## 3. Plugin SDK

SDK is inline-bundled via esbuild alias. Plugin authors write:

```ts
import { definePlugin, requireParam, fetchJson, ok, fail } from "@omni-usage/plugin-sdk"

export default definePlugin(async ({ params }) => {
    const apiKey = requireParam(params, "API_KEY")
    const data = await fetchJson("https://api.deepseek.com/user/balance", {
        headers: { Authorization: `Bearer ${apiKey}` },
    })
    return ok({ items: [...] })
})
```

### Exports

| Function                    | Purpose                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `definePlugin(handler)`     | Parse CLI args, run handler, stdout JSON, catch errors → fail           |
| `ok(payload)`               | Build `{ success: true, schemaVersion: 1, updatedAt: ..., ...payload }` |
| `fail(code, message)`       | Build `{ success: false, error: { code, message } }`                    |
| `requireParam(params, key)` | Get required param, throw on missing                                    |
| `fetchJson(url, options)`   | HTTP fetch + JSON parse + non-2xx throws                                |
| `parseArgs(argv)`           | Parse `--usageboard-param KEY=VALUE` → `Record<string, string>`         |

### Shared helpers (replaces `_common.py`)

| Function                       | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `statusFor(used, limit)`       | percent → normal/warning/critical                   |
| `colorFor(used, limit)`        | percent → blue/yellow/orange/red                    |
| `makeTranslator(translations)` | i18n translator merging common translations         |
| HTTP error mapping             | 401→AUTH_FAILED, 429→RATE_LIMITED, 5xx→SERVER_ERROR |

### File structure

```
src/plugins/sdk/
  index.ts          # unified re-export
  define-plugin.ts  # definePlugin + parseArgs + runCli
  result.ts         # ok, fail
  http.ts           # fetchJson
  helpers.ts        # statusFor, colorFor, makeTranslator, HTTP error handling
```

### Build behavior

esbuild compiles each plugin with `@omni-usage/plugin-sdk` aliased to `src/plugins/sdk/`, bundling everything into a single JS file. No external dependencies needed.

## 4. Host-Side Architecture

### Flow

```
App start
  → discovery scans plugin dirs (only .ts files)
  → metadata-parser parses // comment blocks
  → compiler compiles TS → JS via esbuild (with sourceHash cache)
  → registry manages plugin state (ready / compile_error / disabled)
  → user triggers refresh → runner spawns Node subprocess
  → output-parser validates stdout JSON → update UI
```

### Module changes

| Module               | Change                                                                              |
| -------------------- | ----------------------------------------------------------------------------------- |
| `discovery.ts`       | Scan `.ts` only, remove `.py` and `COMMON_PREFIX` logic                             |
| `metadata-parser.ts` | `stripCommentPrefix` handles `//` only                                              |
| `command-builder.ts` | Remove python branch, use Node: `node <compiled.js> --usageboard-param ...`         |
| `runner.ts`          | Remove `PYTHONIOENCODING` env, use minimalEnv                                       |
| `output-parser.ts`   | Adapt to new schema: `success: true` → outputSchema, `success: false` → errorSchema |
| `python-detect.ts`   | Delete                                                                              |

### New module

| Module        | Purpose                                                               |
| ------------- | --------------------------------------------------------------------- |
| `compiler.ts` | esbuild `.ts` → `.js`, write to `plugin-cache/`, cache via sourceHash |

### Compiler details

- Input: `resources/plugins/deepseek-usage-plugin.ts`
- Output: `userData/plugin-cache/deepseek-usage-plugin/index.js` + `manifest.json`
- Manifest: `{ sourcePath, compiledPath, sourceHash, compiledAt }`
- Startup: compare sourceHash, skip if unchanged
- Compile failure: use old cache + warn if available, else mark `compile_error`

### Directory structure

```
resources/plugins/
  deepseek-usage-plugin.ts
  claude-usage-plugin.ts
  cpa-usage-plugin.ts
  ...

userData/plugin-cache/
  deepseek-usage-plugin/
    index.js
    manifest.json
```

### Removed files

- `resources/plugins/*.py` (all Python plugins)
- `resources/plugins/_common.py`
- `src/main/core/plugin/python-detect.ts`

## 5. Plugin Rewrite List

7 Python plugins → TypeScript, all using SDK.

| Plugin                | Complexity | Key logic                                                    |
| --------------------- | ---------- | ------------------------------------------------------------ |
| deepseek-usage-plugin | Low        | Single fetch, parse balance_infos, color calc                |
| tavily-usage-plugin   | Low        | Single fetch, parse usage                                    |
| glm-usage-plugin      | Low        | Single fetch, parse usage                                    |
| minimax-usage-plugin  | Low        | Single fetch, parse usage                                    |
| codex-usage-plugin    | Medium     | Single fetch, parse rate_limit windows                       |
| claude-usage-plugin   | High       | OAuth token read + OAuth API + JSONL file scan + chart cache |
| cpa-usage-plugin      | High       | Multi-provider concurrent, CPA-Manager API proxy, 5 parsers  |

### Rewrite principles

- Preserve all existing functionality and data structures (add `success: true`)
- Use SDK helpers instead of `_common.py`
- Use Node built-in `fetch()` instead of `urllib`/`httpx`
- Use `fs` module for file operations (claude plugin JSONL scanning)
- Use `child_process.execSync` for keychain reads (claude plugin)

### Execution order

```
1. Implement SDK and compiler (infrastructure)
2. deepseek (simplest, validate full pipeline)
3. tavily / glm / minimax (batch simple plugins)
4. codex
5. cpa (validate multi-provider concurrency)
6. claude (most complex, last)
```
