# TypeScript Plugin Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 7 Python plugins with TypeScript, remove Python runtime entirely, add esbuild compilation pipeline.

**Architecture:** TS plugins in `resources/plugins/` compiled to JS via esbuild into `userData/plugin-cache/`. Host spawns Node subprocess (via Electron's `process.execPath`) for each plugin. SDK inline-bundled into each plugin. Output schema uses `success: true/false` discriminated union, all existing data fields preserved.

**Tech Stack:** TypeScript, esbuild, Node.js built-in `fetch()`, Vitest, Zod

---

## Packaging Contract

生产包必须满足：

| 资源                     | 来源                                                          | 说明                    |
| ------------------------ | ------------------------------------------------------------- | ----------------------- |
| `resources/plugins/*.ts` | Electron Forge 打包到 `resources/plugins/`                    | TS 源码，运行时编译     |
| `src/plugins/sdk/*`      | 开发时通过 esbuild alias 引用，开发侧依赖                     | SDK 源码不需要进生产包  |
| `esbuild`                | production dependency (`dependencies` 而非 `devDependencies`) | 运行时编译用户/内置插件 |
| Node runtime             | `process.execPath`（Electron 自带）                           | 不依赖系统 node         |
| `plugin-cache/`          | `userData` 目录，自动创建                                     | 编译产物缓存            |

---

## File Map

### New files

| File                                                            | Responsibility                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/plugins/sdk/index.ts`                                      | SDK unified re-export                                                         |
| `src/plugins/sdk/define-plugin.ts`                              | `definePlugin`, `parseArgs`, `requireParam`                                   |
| `src/plugins/sdk/result.ts`                                     | `ok`, `fail`                                                                  |
| `src/plugins/sdk/http.ts`                                       | `fetchJson`, `PluginHttpError`                                                |
| `src/plugins/sdk/helpers.ts`                                    | `statusFor`, `colorFor`, `colorForPct`, `makeTranslator`, common translations |
| `src/main/core/plugin/compiler.ts`                              | esbuild compile TS→JS, sourceHash cache, manifest                             |
| `resources/plugins/deepseek-usage-plugin.ts`                    | DeepSeek plugin                                                               |
| `resources/plugins/tavily-usage-plugin.ts`                      | Tavily plugin                                                                 |
| `resources/plugins/glm-usage-plugin.ts`                         | GLM plugin                                                                    |
| `resources/plugins/minimax-usage-plugin.ts`                     | MiniMax plugin                                                                |
| `resources/plugins/codex-usage-plugin.ts`                       | Codex plugin                                                                  |
| `resources/plugins/claude-usage-plugin.ts`                      | Claude plugin                                                                 |
| `resources/plugins/cpa-usage-plugin.ts`                         | CPA plugin                                                                    |
| `tests/unit/plugin/compiler.test.ts`                            | Compiler tests                                                                |
| `tests/unit/sdk/result.test.ts`                                 | SDK result tests                                                              |
| `tests/unit/sdk/helpers.test.ts`                                | SDK helpers tests                                                             |
| `tests/unit/sdk/define-plugin.test.ts`                          | SDK definePlugin tests                                                        |
| `tests/fixtures/plugin-metadata/metadata-basic.ts`              | TS metadata fixture                                                           |
| `tests/fixtures/plugin-metadata/metadata-with-secret.ts`        | TS metadata fixture                                                           |
| `tests/fixtures/plugin-metadata/metadata-with-choice.ts`        | TS metadata fixture                                                           |
| `tests/fixtures/plugin-metadata/metadata-missing-end-marker.ts` | TS metadata fixture                                                           |
| `tests/fixtures/plugin-metadata/metadata-invalid-json.ts`       | TS metadata fixture                                                           |

### Modified files

| File                                         | Change                                                    |
| -------------------------------------------- | --------------------------------------------------------- |
| `src/shared/schemas/plugin-output.ts`        | Replace old error schema with discriminated union         |
| `src/main/core/plugin/output-parser.ts`      | Only parse new `success: true/false` schema               |
| `src/main/core/plugin/metadata-parser.ts`    | Only support `//` comments                                |
| `src/main/core/plugin/discovery.ts`          | Scan `.ts` only, drop `.py` and `_common` filter          |
| `src/main/core/plugin/command-builder.ts`    | Node-only via `process.execPath`                          |
| `src/main/core/plugin/runner.ts`             | Use minimalEnv with Windows vars, cumulative stdout limit |
| `src/main/core/plugin/types.ts`              | Add `compiledPath` field                                  |
| `src/main/core/scheduler/refresh-service.ts` | Handle `error: { code, message }`                         |
| `src/main/index.ts`                          | Remove Python detect, add compiler, use Electron execPath |
| `src/shared/types/ipc.ts`                    | Remove `PythonStatus`, `SYSTEM_PYTHON_STATUS`             |
| `src/main/core/paths.ts`                     | Add `getPluginCacheDir()`, `getSdkDir()`                  |
| `package.json`                               | Move `esbuild` to `dependencies`                          |

### Deleted files (Task 12, after all TS plugins written)

| File                                           | Reason                         |
| ---------------------------------------------- | ------------------------------ |
| `src/main/core/plugin/python-detect.ts`        | No Python                      |
| `resources/plugins/*.py`                       | All replaced by TS             |
| `resources/plugins/_common.py`                 | Replaced by SDK                |
| `tests/unit/plugin/python-detect.test.ts`      | Testing deleted code           |
| `src/main/ipc/system-ipc.ts`                   | Only had Python status handler |
| `tests/fixtures/plugin-metadata/metadata-*.py` | Replaced by TS fixtures        |
| `docs/ts-plugin-runtime-plan.md`               | Archive to `docs/archive/`     |

---

### Task 1: Replace output schema with discriminated union

**Files:**

- Modify: `src/shared/schemas/plugin-output.ts`

No old schema retention. Replace `{ error: string }` entirely.

- [ ] **Step 1: Rewrite `plugin-output.ts`**

```ts
import { z } from "zod/v3";

export const usageDisplayStyleSchema = z.enum(["percent", "ratio"]);
export const usageStatusSchema = z.enum(["normal", "warning", "critical", "unknown"]);
export const usageColorSchema = z.enum(["blue", "green", "yellow", "orange", "red"]);

export const usageItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    used: z.number(),
    limit: z.number(),
    displayStyle: usageDisplayStyleSchema,
    resetAt: z.string().nullable().optional(),
    status: usageStatusSchema.default("unknown"),
    color: usageColorSchema.optional(),
});

export const pluginChartSegmentSchema = z.object({
    model: z.string(),
    tokens: z.number(),
});

export const pluginChartBucketSchema = z.object({
    id: z.string().optional(),
    label: z.string(),
    segments: z.array(pluginChartSegmentSchema),
});

export const pluginChartSchema = z.object({
    kind: z.string(),
    period: z.string(),
    bucketUnit: z.enum(["hour", "day"]),
    buckets: z.array(pluginChartBucketSchema),
    message: z.string().nullable().optional(),
});

// --- New discriminated union schema ---

export const pluginSuccessOutputSchema = z.object({
    success: z.literal(true),
    schemaVersion: z.number(),
    updatedAt: z.string(),
    items: z.array(usageItemSchema),
    badge: z.string().optional(),
    chart: pluginChartSchema.optional(),
});

export const pluginFailureOutputSchema = z.object({
    success: z.literal(false),
    error: z.object({
        code: z.string(),
        message: z.string(),
    }),
});

export const pluginResultSchema = z.discriminatedUnion("success", [
    pluginSuccessOutputSchema,
    pluginFailureOutputSchema,
]);

// --- Types ---

export type UsageItem = z.infer<typeof usageItemSchema>;
export type PluginChart = z.infer<typeof pluginChartSchema>;
export type PluginSuccessOutput = z.infer<typeof pluginSuccessOutputSchema>;
export type PluginFailureOutput = z.infer<typeof pluginFailureOutputSchema>;
export type PluginResult = z.infer<typeof pluginResultSchema>;
```

No old `pluginOutputSchema` / `pluginErrorOutputSchema` / `PluginOutput` / `PluginErrorOutput` remain.

- [ ] **Step 2: Update all imports that referenced old types**

Files that import from `plugin-output.ts`:

- `src/shared/types/plugin.ts` — re-export new types
- `src/main/core/plugin/output-parser.ts` — use new schemas (Task 2)
- `src/main/core/scheduler/types.ts` — update `PluginSnapshotState` references
- `src/main/core/cache/types.ts` — update `PluginCachedState`
- `src/shared/types/ipc.ts` — update `PluginSnapshotDTO`
- `src/main/core/scheduler/refresh-service.ts` — update (Task 2)

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: Type errors in downstream files — these are expected, will be fixed in Task 2.

- [ ] **Step 4: Commit**

```
feat: replace plugin output schema with success/error discriminated union
```

---

### Task 2: Rewrite output parser and refresh service

**Files:**

- Modify: `src/main/core/plugin/output-parser.ts`
- Modify: `src/main/core/scheduler/refresh-service.ts`
- Modify: `src/shared/types/plugin.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/core/scheduler/types.ts`
- Modify: `src/main/core/cache/types.ts`
- Modify: `tests/unit/plugin/output-parser.test.ts`

- [ ] **Step 1: Rewrite `output-parser.ts`**

Only accepts new discriminated union. No old schema paths.

```ts
import {
    pluginResultSchema,
    pluginSuccessOutputSchema,
    pluginFailureOutputSchema,
    type PluginResult,
    type PluginSuccessOutput,
    type PluginFailureOutput,
} from "../../../shared/schemas/plugin-output";
import { PluginOutputParseError, PluginSchemaError } from "../../../shared/errors/plugin-errors";

export function parsePluginResult(stdout: string): PluginResult {
    const trimmed = stdout.trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed) as unknown;
    } catch {
        throw new PluginOutputParseError("Failed to parse plugin output as JSON", trimmed);
    }

    const result = pluginResultSchema.safeParse(parsed);
    if (!result.success) {
        throw new PluginSchemaError("Plugin output does not match schema", result.error.issues);
    }
    return result.data;
}

export function parsePluginSuccessOutput(stdout: string): PluginSuccessOutput {
    const trimmed = stdout.trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed) as unknown;
    } catch {
        throw new PluginOutputParseError("Failed to parse plugin output as JSON", trimmed);
    }
    const result = pluginSuccessOutputSchema.safeParse(parsed);
    if (!result.success) {
        throw new PluginSchemaError(
            "Plugin output does not match success schema",
            result.error.issues,
        );
    }
    return result.data;
}
```

- [ ] **Step 2: Update `refresh-service.ts`**

Change the output parser usage. The `outputParser` dep now returns `PluginResult`. Update the `"error" in output` check to use discriminated union:

```ts
// In refresh() function, after runner call:
const result = await deps.runner(command, { timeoutMs: 15_000 });

if (result.exitCode !== 0) {
    throw new PluginExecutionError(
        `Plugin exited with code ${String(result.exitCode)}`,
        result.exitCode,
        result.stderr,
    );
}

const output = deps.outputParser(result.stdout);

if (!output.success) {
    log.warn(
        `Plugin ${instanceId} (${plugin.name}) reported error: ${output.error.code} - ${output.error.message}`,
    );
    deps.runtimeStore.updateState(instanceId, {
        status: "failed",
        error: output.error.message,
    });
    return;
}

log.info(
    `Plugin ${instanceId} (${plugin.name}) refreshed: ${String(output.items.length)} items in ${String(result.durationMs)}ms`,
);

await deps.cacheStore.save(instanceId, {
    updatedAt: output.updatedAt,
    items: output.items,
    ...(output.badge !== undefined && { badge: output.badge }),
    ...(output.chart !== undefined && { chart: output.chart }),
});

deps.runtimeStore.updateState(instanceId, {
    status: "ready",
    items: output.items,
    updatedAt: new Date(output.updatedAt),
    ...(output.badge !== undefined && { badge: output.badge }),
    ...(output.chart !== undefined && { chart: output.chart }),
});
```

- [ ] **Step 3: Update type re-exports**

`src/shared/types/plugin.ts`:

```ts
export type AppLanguage = "zh-Hans" | "en";
export type {
    PluginChart,
    PluginSuccessOutput,
    PluginFailureOutput,
    PluginResult,
    UsageItem,
} from "../schemas/plugin-output";
```

- [ ] **Step 4: Update IPC types and scheduler types**

Update `PluginSnapshotDTO`, `PluginSnapshotState`, `PluginCachedState` to use new type names (`PluginSuccessOutput` instead of `PluginOutput`, `UsageItem[]`/`PluginChart` from new exports).

- [ ] **Step 5: Update and run tests**

Run: `pnpm test`
Expected: All tests pass with new schema.

- [ ] **Step 6: Commit**

```
feat: rewrite output parser for discriminated union, update refresh service
```

---

### Task 3: Update metadata parser — `//` only

**Files:**

- Modify: `src/main/core/plugin/metadata-parser.ts`
- Create: TS fixture files (replace .py fixtures)
- Modify: `tests/unit/plugin/metadata-parser.test.ts`
- Delete: `tests/fixtures/plugin-metadata/metadata-*.py`

Only `//` comment prefix. No `#` support. Replace `.py` fixtures with `.ts` fixtures immediately.

- [ ] **Step 1: Replace `stripCommentPrefix`**

```ts
function stripCommentPrefix(line: string): string {
    const slashIndex = line.indexOf("//");
    if (slashIndex === -1) return line;
    const afterSlash = line.slice(slashIndex + 2);
    if (afterSlash.startsWith(" ")) return afterSlash.slice(1);
    return afterSlash;
}
```

- [ ] **Step 2: Create TS fixtures, delete .py fixtures**

Delete all `tests/fixtures/plugin-metadata/metadata-*.py` files. Create new `.ts` fixtures:

`metadata-basic.ts`:

```ts
// UsageBoardPlugin:
// {
//   "name": "TestPlugin",
//   "parameters": [
//     { "name": "API_KEY", "label": "Key", "type": "secret", "required": true }
//   ]
// }
// /UsageBoardPlugin
```

`metadata-with-secret.ts`:

```ts
// UsageBoardPlugin:
// {
//   "name": "Secret",
//   "parameters": [
//     { "name": "TOKEN", "label": "Token", "type": "secret", "required": true }
//   ]
// }
// /UsageBoardPlugin
```

`metadata-with-choice.ts`:

```ts
// UsageBoardPlugin:
// {
//   "name": "Choice",
//   "parameters": [
//     { "name": "PLAN", "label": "Plan", "type": "choice", "required": false, "options": [{"label":"A","value":"a"}] }
//   ]
// }
// /UsageBoardPlugin
```

`metadata-missing-end-marker.ts`:

```ts
// UsageBoardPlugin:
// {
//   "name": "NoEnd"
```

`metadata-invalid-json.ts`:

```ts
// UsageBoardPlugin:
// { not valid json
// /UsageBoardPlugin
```

`metadata-after-line-80.ts`: 81+ blank lines followed by `// UsageBoardPlugin:` block.

- [ ] **Step 3: Rewrite metadata-parser tests to use TS fixtures**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePluginMetadata } from "../../../src/main/core/plugin/metadata-parser";

const fixturesDir = resolve(__dirname, "../../fixtures/plugin-metadata");
function loadFixture(name: string): string {
    return readFileSync(resolve(fixturesDir, name), "utf8");
}

describe("parsePluginMetadata", () => {
    it("parses metadata-basic.ts", () => {
        const result = parsePluginMetadata(loadFixture("metadata-basic.ts"));
        expect(result).not.toBeNull();
        expect(result?.parameters?.length).toBeGreaterThan(0);
    });

    it("parses metadata-with-secret.ts", () => {
        const result = parsePluginMetadata(loadFixture("metadata-with-secret.ts"));
        expect(result).not.toBeNull();
        const secretParam = result?.parameters?.find((p) => p.type === "secret");
        expect(secretParam).toBeDefined();
    });

    it("parses metadata-with-choice.ts", () => {
        const result = parsePluginMetadata(loadFixture("metadata-with-choice.ts"));
        expect(result).not.toBeNull();
        const choiceParam = result?.parameters?.find((p) => p.type === "choice");
        expect(choiceParam?.options?.length).toBeGreaterThan(0);
    });

    it("returns null for missing end marker", () => {
        const result = parsePluginMetadata(loadFixture("metadata-missing-end-marker.ts"));
        expect(result).toBeNull();
    });

    it("returns null for invalid JSON", () => {
        const result = parsePluginMetadata(loadFixture("metadata-invalid-json.ts"));
        expect(result).toBeNull();
    });

    it("returns null for metadata after line 80", () => {
        const result = parsePluginMetadata(loadFixture("metadata-after-line-80.ts"));
        expect(result).toBeNull();
    });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: All pass.

- [ ] **Step 5: Commit**

```
feat: metadata parser — // comments only, TS fixtures
```

---

### Task 4: Implement plugin SDK

**Files:**

- Create: `src/plugins/sdk/helpers.ts`
- Create: `src/plugins/sdk/result.ts`
- Create: `src/plugins/sdk/http.ts`
- Create: `src/plugins/sdk/define-plugin.ts`
- Create: `src/plugins/sdk/index.ts`
- Test: `tests/unit/sdk/result.test.ts`
- Test: `tests/unit/sdk/helpers.test.ts`
- Test: `tests/unit/sdk/define-plugin.test.ts`

Key design decision: `definePlugin()` is CLI self-executing. No `export default`.

- [ ] **Step 1: Write `helpers.ts`**

```ts
export type AppLanguage = "zh-Hans" | "en";

export function statusFor(used: number, total: number): "normal" | "warning" | "critical" {
    const pct = total > 0 ? (used / total) * 100 : 0;
    if (pct >= 90) return "critical";
    if (pct >= 75) return "warning";
    return "normal";
}

export function colorFor(
    used: number,
    total: number,
): "blue" | "green" | "yellow" | "orange" | "red" {
    const pct = total > 0 ? (used / total) * 100 : 0;
    if (pct >= 90) return "red";
    if (pct >= 80) return "orange";
    if (pct >= 60) return "yellow";
    return "blue";
}

export function colorForPct(pct: number): "blue" | "green" | "yellow" | "orange" | "red" {
    if (pct >= 90) return "red";
    if (pct >= 80) return "orange";
    if (pct >= 60) return "yellow";
    return "blue";
}

const COMMON_TRANSLATIONS: Record<string, Record<string, string>> = {
    missing_api_key: {
        "zh-Hans": "请在插件设置中配置 API Key",
        en: "Configure API Key in plugin settings",
    },
    request_timeout: {
        "zh-Hans": "请求超时，请检查网络",
        en: "Request timed out. Check your network.",
    },
    network_error: {
        "zh-Hans": "网络连接失败，请检查网络",
        en: "Network error. Check your connection.",
    },
    usage_parse_failed: { "zh-Hans": "用量数据解析失败", en: "Failed to parse usage data" },
};

export type TranslateFn = (
    language: AppLanguage,
    key: string,
    kwargs?: Record<string, string | number>,
) => string;

export function makeTranslator(translations: Record<string, Record<string, string>>): TranslateFn {
    const merged = { ...COMMON_TRANSLATIONS, ...translations };
    return (language, key, kwargs) => {
        const values = merged[key] ?? {};
        const text = values[language] ?? values["zh-Hans"] ?? key;
        if (!kwargs) return text;
        return Object.entries(kwargs).reduce(
            (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
            text,
        );
    };
}

export function appLanguage(params: Record<string, string>): AppLanguage {
    return params["USAGEBOARD_LANGUAGE"] === "en" ? "en" : "zh-Hans";
}

export function numeric(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isNaN(n) ? 0 : n;
    }
    return 0;
}
```

- [ ] **Step 2: Write `result.ts`**

`ok()` auto-generates `updatedAt`, but allows payload override:

```ts
const SCHEMA_VERSION = 1;

export interface UsageItem {
    id: string;
    name: string;
    used: number;
    limit: number;
    displayStyle: "percent" | "ratio";
    resetAt?: string | null;
    status: "normal" | "warning" | "critical" | "unknown";
    color?: "blue" | "green" | "yellow" | "orange" | "red";
}

export interface PluginChart {
    kind: string;
    period: string;
    bucketUnit: "hour" | "day";
    buckets: Array<{
        id?: string;
        label: string;
        segments: Array<{ model: string; tokens: number }>;
    }>;
    message?: string | null;
}

export interface PluginSuccessOutput {
    success: true;
    schemaVersion: number;
    updatedAt: string;
    items: UsageItem[];
    badge?: string;
    chart?: PluginChart;
}

export interface PluginFailureOutput {
    success: false;
    error: { code: string; message: string };
}

export type PluginOutput = PluginSuccessOutput | PluginFailureOutput;

function utcNowIso(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function ok(
    payload: Omit<PluginSuccessOutput, "success" | "schemaVersion" | "updatedAt"> & {
        updatedAt?: string;
    },
): PluginSuccessOutput {
    return {
        success: true,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: payload.updatedAt ?? utcNowIso(),
        items: payload.items,
        ...(payload.badge !== undefined && { badge: payload.badge }),
        ...(payload.chart !== undefined && { chart: payload.chart }),
    };
}

export function fail(code: string, message: string): PluginFailureOutput {
    return { success: false, error: { code, message } };
}
```

- [ ] **Step 3: Write `http.ts`**

Error codes use `HTTP_STATUS` format (e.g. `HTTP_401`). Plugins map to semantic codes at the plugin level.

```ts
export class PluginHttpError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
        public readonly body?: unknown,
    ) {
        super(message);
        this.name = "PluginHttpError";
    }
}

export async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, options);
    } catch (err) {
        throw new PluginHttpError(0, err instanceof Error ? err.message : String(err));
    }

    const text = await response.text();
    let data: unknown = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        throw new PluginHttpError(response.status, `Invalid JSON response from ${url}`);
    }

    if (!response.ok) {
        throw new PluginHttpError(response.status, `HTTP ${response.status} from ${url}`, data);
    }

    return data as T;
}
```

- [ ] **Step 4: Write `define-plugin.ts`**

CLI self-executing. No `export default`.

```ts
import type { PluginOutput } from "./result";
import { fail } from "./result";
import { PluginHttpError } from "./http";

export interface PluginContext {
    params: Record<string, string>;
}

export type PluginHandler = (ctx: PluginContext) => Promise<PluginOutput> | PluginOutput;

export function parseArgs(argv = process.argv.slice(2)): Record<string, string> {
    const params: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--usageboard-param" && i + 1 < argv.length) {
            const pair = argv[++i]!;
            const eqIdx = pair.indexOf("=");
            if (eqIdx > 0) {
                params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
            }
        }
    }
    return params;
}

export function requireParam(params: Record<string, string>, key: string): string {
    const value = params[key];
    if (!value) {
        throw new Error(`MISSING_PARAM:${key}`);
    }
    return value;
}

export function definePlugin(handler: PluginHandler): void {
    const params = parseArgs();
    handler({ params })
        .then((result) => {
            process.stdout.write(JSON.stringify(result));
        })
        .catch((err: unknown) => {
            const result = normalizeError(err);
            process.stdout.write(JSON.stringify(result));
        });
}

function normalizeError(err: unknown): PluginOutput {
    if (err instanceof PluginHttpError) {
        return fail(`HTTP_${err.statusCode}`, err.message);
    }
    if (err instanceof Error) {
        if (err.message.startsWith("MISSING_PARAM:")) {
            const key = err.message.slice("MISSING_PARAM:".length);
            return fail("MISSING_PARAM", `Missing required parameter: ${key}`);
        }
        return fail("PLUGIN_ERROR", err.message);
    }
    return fail("PLUGIN_ERROR", String(err));
}
```

- [ ] **Step 5: Write `index.ts`**

```ts
export { definePlugin, parseArgs, requireParam } from "./define-plugin";
export type { PluginContext, PluginHandler } from "./define-plugin";
export { ok, fail } from "./result";
export type {
    PluginOutput,
    PluginSuccessOutput,
    PluginFailureOutput,
    UsageItem,
    PluginChart,
} from "./result";
export { fetchJson, PluginHttpError } from "./http";
export { statusFor, colorFor, colorForPct, makeTranslator, appLanguage, numeric } from "./helpers";
export type { TranslateFn, AppLanguage } from "./helpers";
```

- [ ] **Step 6: Write SDK tests**

`tests/unit/sdk/result.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ok, fail } from "../../../src/plugins/sdk/result";

describe("ok", () => {
    it("returns success output with auto-generated updatedAt", () => {
        const result = ok({ items: [] });
        expect(result.success).toBe(true);
        expect(result.schemaVersion).toBe(1);
        expect(result.updatedAt).toBeTruthy();
        expect(result.items).toEqual([]);
    });

    it("allows updatedAt override", () => {
        const result = ok({ items: [], updatedAt: "2026-01-01T00:00:00Z" });
        expect(result.updatedAt).toBe("2026-01-01T00:00:00Z");
    });
});

describe("fail", () => {
    it("returns failure output", () => {
        const result = fail("AUTH_FAILED", "Invalid key");
        expect(result.success).toBe(false);
        expect(result.error).toEqual({ code: "AUTH_FAILED", message: "Invalid key" });
    });
});
```

`tests/unit/sdk/helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
    statusFor,
    colorFor,
    colorForPct,
    makeTranslator,
    numeric,
} from "../../../src/plugins/sdk/helpers";

describe("statusFor", () => {
    it("returns critical at 90%", () => expect(statusFor(90, 100)).toBe("critical"));
    it("returns warning at 75%", () => expect(statusFor(75, 100)).toBe("warning"));
    it("returns normal below 75%", () => expect(statusFor(50, 100)).toBe("normal"));
});

describe("colorFor", () => {
    it("returns red at 90%", () => expect(colorFor(90, 100)).toBe("red"));
    it("returns orange at 80%", () => expect(colorFor(80, 100)).toBe("orange"));
    it("returns yellow at 60%", () => expect(colorFor(60, 100)).toBe("yellow"));
    it("returns blue below 60%", () => expect(colorFor(30, 100)).toBe("blue"));
});

describe("makeTranslator", () => {
    it("merges common translations", () => {
        const t = makeTranslator({});
        expect(t("zh-Hans", "missing_api_key")).toBeTruthy();
    });
    it("supports kwargs interpolation", () => {
        const t = makeTranslator({ msg: { "zh-Hans": "code={code}", en: "code={code}" } });
        expect(t("en", "msg", { code: 500 })).toBe("code=500");
    });
});

describe("numeric", () => {
    it("returns number as-is", () => expect(numeric(42)).toBe(42));
    it("parses string number", () => expect(numeric("3.14")).toBeCloseTo(3.14));
    it("returns 0 for NaN", () => expect(numeric("abc")).toBe(0));
});
```

`tests/unit/sdk/define-plugin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseArgs, requireParam } from "../../../src/plugins/sdk/define-plugin";

describe("parseArgs", () => {
    it("parses --usageboard-param KEY=VALUE", () => {
        const result = parseArgs(["--usageboard-param", "API_KEY=abc123"]);
        expect(result).toEqual({ API_KEY: "abc123" });
    });

    it("parses multiple params", () => {
        const result = parseArgs(["--usageboard-param", "A=1", "--usageboard-param", "B=2"]);
        expect(result).toEqual({ A: "1", B: "2" });
    });

    it("handles value with equals sign", () => {
        const result = parseArgs(["--usageboard-param", "KEY=val=ue"]);
        expect(result).toEqual({ KEY: "val=ue" });
    });
});

describe("requireParam", () => {
    it("returns value when present", () => {
        expect(requireParam({ KEY: "val" }, "KEY")).toBe("val");
    });

    it("throws for missing param", () => {
        expect(() => requireParam({}, "KEY")).toThrow("MISSING_PARAM:KEY");
    });
});
```

- [ ] **Step 7: Run tests**

Run: `pnpm test`
Expected: All pass.

- [ ] **Step 8: Commit**

```
feat: implement plugin SDK
```

---

### Task 5: Implement plugin compiler

**Files:**

- Create: `src/main/core/plugin/compiler.ts`
- Modify: `src/main/core/paths.ts`
- Modify: `package.json` — move esbuild to dependencies
- Test: `tests/unit/plugin/compiler.test.ts`

- [ ] **Step 1: Add paths**

```ts
// src/main/core/paths.ts additions
export function getPluginCacheDir(): string {
    return join(getDataRoot(), "plugin-cache");
}

export function getSdkDir(): string {
    if (app.isPackaged) {
        return join(process.resourcesPath, "sdk");
    }
    return join(PROJECT_ROOT, "src", "plugins", "sdk");
}
```

- [ ] **Step 2: Move esbuild to dependencies**

In `package.json`, move `esbuild` from `devDependencies` to `dependencies`. It's needed at runtime for compiling plugins.

- [ ] **Step 3: Write `compiler.ts`**

Four-state result: `compiled` | `cached` | `stale_cache` | `compile_error`.

```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { createLogger } from "../../../shared/lib/logger";
import type { PluginDefinition } from "./types";

const log = createLogger("compiler");

interface CompileManifest {
    sourcePath: string;
    compiledPath: string;
    sourceHash: string;
    compiledAt: string;
}

export type CompileResult =
    | { status: "compiled"; executablePath: string }
    | { status: "cached"; executablePath: string }
    | { status: "stale_cache"; executablePath: string; error: string }
    | { status: "compile_error"; executablePath: ""; error: string };

async function computeHash(filePath: string): Promise<string> {
    const content = await readFile(filePath, "utf8");
    return createHash("sha256").update(content).digest("hex");
}

export async function compilePlugin(
    plugin: PluginDefinition,
    cacheDir: string,
    sdkDir: string,
): Promise<CompileResult> {
    const name = basename(plugin.executablePath, ".ts");
    const outDir = join(cacheDir, name);
    const outPath = join(outDir, "index.js");
    const manifestPath = join(outDir, "manifest.json");

    const sourceHash = await computeHash(plugin.executablePath);

    // Check cache
    try {
        const raw = await readFile(manifestPath, "utf8");
        const manifest: CompileManifest = JSON.parse(raw);
        if (manifest.sourceHash === sourceHash) {
            log.debug(`Cache hit for ${name}`);
            return { status: "cached", executablePath: outPath };
        }
    } catch {
        // No cache, compile fresh
    }

    // Compile
    try {
        const esbuild = await import("esbuild");
        await mkdir(outDir, { recursive: true });

        await esbuild.build({
            entryPoints: [plugin.executablePath],
            outfile: outPath,
            bundle: true,
            platform: "node",
            format: "cjs",
            target: "node18",
            sourcemap: true,
            alias: {
                "@omni-usage/plugin-sdk": join(sdkDir, "index.ts"),
            },
        });

        const manifest: CompileManifest = {
            sourcePath: plugin.executablePath,
            compiledPath: outPath,
            sourceHash,
            compiledAt: new Date().toISOString(),
        };
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

        log.info(`Compiled ${name}`);
        return { status: "compiled", executablePath: outPath };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Compile failed for ${name}: ${message}`);

        // Fallback: stale cache?
        try {
            const existing = await readFile(outPath, "utf8");
            if (existing) {
                log.warn(`Using stale cache for ${name}`);
                return { status: "stale_cache", executablePath: outPath, error: message };
            }
        } catch {
            // No stale cache
        }
        return { status: "compile_error", executablePath: "", error: message };
    }
}
```

- [ ] **Step 4: Write compiler tests**

Use syntax error (not type error) since esbuild doesn't type-check:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compilePlugin } from "../../../src/main/core/plugin/compiler";
import type { PluginDefinition } from "../../../src/main/core/plugin/types";

const testDir = join(tmpdir(), `compiler-test-${Date.now()}`);
const sdkDir = join(testDir, "sdk");

beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    await mkdir(sdkDir, { recursive: true });
    // Minimal SDK stub for compilation
    await writeFile(join(sdkDir, "index.ts"), "export function definePlugin() {}", "utf8");
});

afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
});

function makePlugin(filename: string, content: string): PluginDefinition {
    const srcPath = join(testDir, filename);
    return { scriptName: filename, executablePath: srcPath, metadata: null, source: "bundled" };
}

describe("compilePlugin", () => {
    it("compiles valid TS and returns status compiled", async () => {
        const plugin = makePlugin(
            "test.ts",
            `import { definePlugin } from "@omni-usage/plugin-sdk"; definePlugin(async () => ({}));`,
        );
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        const result = await compilePlugin(plugin, join(testDir, "cache"), sdkDir);
        expect(result.status).toBe("compiled");
        if (result.status === "compiled") expect(result.executablePath).toBeTruthy();
    });

    it("returns cached on second compile of same source", async () => {
        const plugin = makePlugin("test.ts", `console.log("hello");`);
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        const cacheDir = join(testDir, "cache");
        await compilePlugin(plugin, cacheDir, sdkDir);
        const result = await compilePlugin(plugin, cacheDir, sdkDir);
        expect(result.status).toBe("cached");
    });

    it("returns compile_error for syntax error", async () => {
        const plugin = makePlugin("bad.ts", `const x = "unclosed string`);
        await writeFile(plugin.executablePath, `const x = "unclosed`, "utf8");
        const result = await compilePlugin(plugin, join(testDir, "cache"), sdkDir);
        expect(result.status).toBe("compile_error");
    });

    it("returns stale_cache when compile fails but old JS exists", async () => {
        const plugin = makePlugin("test.ts", `console.log("hello");`);
        await writeFile(plugin.executablePath, `console.log("hello");`, "utf8");
        const cacheDir = join(testDir, "cache");
        // First compile succeeds
        await compilePlugin(plugin, cacheDir, sdkDir);
        // Break the source
        await writeFile(plugin.executablePath, `const x = "unclosed`, "utf8");
        const result = await compilePlugin(plugin, cacheDir, sdkDir);
        expect(result.status).toBe("stale_cache");
    });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```
feat: implement plugin compiler with 4-state result
```

---

### Task 6: Update discovery, command-builder, runner

**Files:**

- Modify: `src/main/core/plugin/discovery.ts`
- Modify: `src/main/core/plugin/command-builder.ts`
- Modify: `src/main/core/plugin/runner.ts`
- Modify: `tests/unit/plugin/discovery.test.ts`
- Modify: `tests/unit/plugin/command-builder.test.ts`

- [ ] **Step 1: Update discovery.ts — scan `.ts` only**

```ts
const PLUGIN_EXT = ".ts";
```

Remove `COMMON_PREFIX` filter entirely. Keep dot-file filter.

- [ ] **Step 2: Update command-builder.ts — Node via Electron execPath**

```ts
import type { AppLanguage } from "../../../shared/types/plugin";

export interface PluginCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
}

export function buildPluginCommand(
    executablePath: string,
    parameterValues: Record<string, string>,
    language: AppLanguage,
    nodePath: string,
): PluginCommand {
    const paramArgs: string[] = [];
    for (const [key, value] of Object.entries(parameterValues)) {
        if (value !== "") {
            paramArgs.push("--usageboard-param", `${key}=${value}`);
        }
    }
    paramArgs.push("--usageboard-param", `USAGEBOARD_LANGUAGE=${language}`);
    return {
        command: nodePath,
        args: [executablePath, ...paramArgs],
    };
}
```

No `pythonCommand` parameter. `nodePath` is required (caller passes `process.execPath`).

- [ ] **Step 3: Update runner.ts — minimalEnv + cumulative stdout limit**

Replace the spawn env with minimal env (including Windows vars):

```ts
const minimalEnv: Record<string, string> = {
    PATH: process.env["PATH"] ?? "",
    HOME: process.env["HOME"] ?? "",
    USERPROFILE: process.env["USERPROFILE"] ?? "",
    APPDATA: process.env["APPDATA"] ?? "",
    LOCALAPPDATA: process.env["LOCALAPPDATA"] ?? "",
    TEMP: process.env["TEMP"] ?? "",
    TMP: process.env["TMP"] ?? "",
    SYSTEMROOT: process.env["SYSTEMROOT"] ?? "",
    COMSPEC: process.env["COMSPEC"] ?? "",
};
```

In spawn options: `env: { ...minimalEnv, ...command.env }`.

Replace stdout size limiting with cumulative counter:

```ts
let stdoutBytes = 0;
child.stdout.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk);
    stdoutBytes += chunk.length;
    if (stdoutBytes > 1024 * 1024) {
        log.warn("Plugin stdout exceeded 1MB, killing");
        child.kill("SIGTERM");
    }
});
```

Similarly for stderr with 256KB limit.

- [ ] **Step 4: Update tests**

`command-builder.test.ts`:

```ts
describe("buildPluginCommand", () => {
    it("uses provided nodePath", () => {
        const result = buildPluginCommand(
            "/cache/plugin/index.js",
            {},
            "zh-Hans",
            "/path/to/electron",
        );
        expect(result.command).toBe("/path/to/electron");
        expect(result.args[0]).toBe("/cache/plugin/index.js");
    });
    // ... keep param formatting tests, remove Python-specific tests
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```
feat: update discovery, command-builder, runner for Node-only execution
```

---

### Task 7: Wire compiler into main entry, remove Python runtime

**Files:**

- Modify: `src/main/index.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify or delete: `src/main/ipc/system-ipc.ts`

- [ ] **Step 1: Update `src/main/index.ts`**

Remove:

- `import { findPython } from "./core/plugin/python-detect";`
- Python detect block (`findPython()`, `pythonCommand`, `pythonAvailable`)
- `import { registerSystemIpc } from "./ipc/system-ipc";` and its call

Add:

```ts
import { compilePlugin } from "./core/plugin/compiler";
import { getPluginCacheDir, getSdkDir } from "./core/paths";
```

After plugin discovery, add compile step:

```ts
const cacheDir = getPluginCacheDir();
const sdkDir = getSdkDir();
const compiledPaths = new Map<string, string>();
const compileErrors = new Map<string, string>();

for (const def of allDefinitions) {
    const result = await compilePlugin(def, cacheDir, sdkDir);
    if (result.executablePath) {
        compiledPaths.set(def.executablePath, result.executablePath);
        if (result.status === "stale_cache") {
            log.warn(`Plugin ${def.scriptName} using stale cache: ${result.error}`);
        }
    } else {
        compileErrors.set(def.scriptName, result.error);
        log.warn(`Plugin ${def.scriptName} failed to compile: ${result.error}`);
    }
}
```

Update `buildCommand`:

```ts
const buildCommand = (
    executablePath: string,
    parameterValues: Record<string, string>,
    language: "zh-Hans" | "en",
) => {
    const compiledPath = compiledPaths.get(executablePath) ?? executablePath;
    return buildPluginCommand(compiledPath, parameterValues, language, process.execPath);
};
```

Update auto-seed name extraction: `.replace(/\.ts$/, "")`.

- [ ] **Step 2: Update `src/shared/types/ipc.ts`**

Remove `PythonStatus`, `SYSTEM_PYTHON_STATUS`, `getPythonStatus` from API.

- [ ] **Step 3: Delete or empty `src/main/ipc/system-ipc.ts`**

If it only has Python status handler, delete it and remove the import from `index.ts`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean.

- [ ] **Step 5: Commit**

```
feat: wire compiler into main entry, remove Python runtime
```

---

### Task 8: Write DeepSeek plugin (TS)

**Files:**

- Create: `resources/plugins/deepseek-usage-plugin.ts`

No `export default`. CLI self-executing with `definePlugin()`.

- [ ] **Step 1: Write the plugin**

```ts
// UsageBoardPlugin:
// {
//   "name": "DeepSeek",
//   "name@zh-Hans": "DeepSeek",
//   "name@en": "DeepSeek",
//   "icon": "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/deepseek-color.png",
//   "description": "查询 DeepSeek API 余额",
//   "description@zh-Hans": "查询 DeepSeek API 余额",
//   "description@en": "Query DeepSeek API balance",
//   "parameters": [
//     {
//       "name": "API_KEY",
//       "label": "Api Key",
//       "label@zh-Hans": "Api Key",
//       "label@en": "API Key",
//       "type": "secret",
//       "required": true,
//       "placeholder": "DeepSeek API Key"
//     },
//     {
//       "name": "LIMIT",
//       "label": "Amount Limit",
//       "label@zh-Hans": "金额上限",
//       "label@en": "Amount Limit",
//       "type": "integer",
//       "required": false,
//       "defaultValue": "100",
//       "placeholder": "100"
//     }
//   ]
// }
// /UsageBoardPlugin

import {
    definePlugin,
    requireParam,
    fetchJson,
    ok,
    fail,
    makeTranslator,
    appLanguage,
    statusFor,
    colorFor,
} from "@omni-usage/plugin-sdk";

const ENDPOINT = "https://api.deepseek.com/user/balance";
const DEFAULT_LIMIT = 100;

function parseLimit(raw: string): number {
    const value = Number(raw);
    return value > 0 ? value : DEFAULT_LIMIT;
}

const translations = {
    balance: { "zh-Hans": "余额", en: "Balance" },
};

definePlugin(async ({ params }) => {
    const apiKey = requireParam(params, "API_KEY");
    const language = appLanguage(params);
    const translate = makeTranslator(translations);
    const limitAmount = parseLimit(params["LIMIT"] ?? "");

    interface BalanceInfo {
        currency: string;
        total_balance: string;
    }
    interface BalanceResponse {
        balance_infos: BalanceInfo[];
    }

    let data: BalanceResponse;
    try {
        data = await fetchJson<BalanceResponse>(ENDPOINT, {
            headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        });
    } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
            const s = (err as { statusCode: number }).statusCode;
            if (s === 401) return fail("AUTH_FAILED", translate(language, "missing_api_key"));
            if (s === 429) return fail("RATE_LIMITED", "Rate limited. Try again later.");
            if (s >= 500) return fail("SERVER_ERROR", `Service unavailable (HTTP ${s})`);
            return fail("HTTP_ERROR", `HTTP ${s} from ${ENDPOINT}`);
        }
        return fail("NETWORK_ERROR", translate(language, "network_error"));
    }

    const items = (data.balance_infos ?? []).map((info) => {
        const currency = info.currency ?? "CNY";
        const totalBalance = Number(info.total_balance ?? 0);
        const suffix = currency !== "CNY" ? ` (${currency})` : "";
        return {
            id: `balance-${currency}`,
            name: `${translate(language, "balance")}${suffix}`,
            used: Math.round(totalBalance * 100) / 100,
            limit: Math.round(limitAmount * 100) / 100,
            displayStyle: "ratio" as const,
            status: statusFor(totalBalance, limitAmount),
            color: colorFor(totalBalance, limitAmount),
        };
    });

    return ok({ items });
});
```

- [ ] **Step 2: Verify in dev**

Run: `pnpm start`
Expected: DeepSeek appears in plugin list, metadata parsed, error shown without API key.

- [ ] **Step 3: Commit**

```
feat: add DeepSeek TypeScript plugin
```

---

### Task 9: Write Tavily, GLM, MiniMax plugins (TS)

**Files:**

- Create: `resources/plugins/tavily-usage-plugin.ts`
- Create: `resources/plugins/glm-usage-plugin.ts`
- Create: `resources/plugins/minimax-usage-plugin.ts`

Straightforward ports from Python. Each uses SDK, no `export default`.

- [ ] **Step 1: Write tavily-usage-plugin.ts**

Port from `tavily-usage-plugin.py`. Single fetch to `https://api.tavily.com/usage`. Preserve `nextMonthStartIso()`, detail breakdown (search/crawl/extract/map/research).

- [ ] **Step 2: Write minimax-usage-plugin.ts**

Port from `minimax-usage-plugin.py`. Fetch to `https://www.minimaxi.com/v1/token_plan/remains`. Preserve model display key mapping, interval/weekly parsing, sorting logic, image plan badge detection.

- [ ] **Step 3: Write glm-usage-plugin.ts**

Port from `glm-usage-plugin.py`. Two endpoints (quota + model usage). Chart cache with 30-day maintenance. Preserve all bucket/model/timestamp parsing logic.

- [ ] **Step 4: Verify**

Run: `pnpm start`

- [ ] **Step 5: Commit**

```
feat: add Tavily, GLM, MiniMax TypeScript plugins
```

---

### Task 10: Write Codex plugin (TS)

**Files:**

- Create: `resources/plugins/codex-usage-plugin.ts`

- [ ] **Step 1: Port codex-usage-plugin.py**

Reads auth from `~/.codex/auth.json`. Fetches from `https://chatgpt.com/backend-api/wham/usage`. JSONL session scanning with chart cache. Use `fs`, `path`, `os` modules.

- [ ] **Step 2: Verify**

Run: `pnpm start`

- [ ] **Step 3: Commit**

```
feat: add Codex TypeScript plugin
```

---

### Task 11: Write CPA and Claude plugins (TS)

**Files:**

- Create: `resources/plugins/cpa-usage-plugin.ts`
- Create: `resources/plugins/claude-usage-plugin.ts`

- [ ] **Step 1: Port cpa-usage-plugin.py**

Multi-provider via CPA-Manager. Use `Promise.allSettled` for concurrency. 5 provider parsers. `loadCodeAssist` for Gemini/Antigravity.

- [ ] **Step 2: Port claude-usage-plugin.py**

OAuth token from keychain or `~/.claude/.credentials.json`. JSONL scanning. Chart cache. Token computation. Use `child_process.execSync` for keychain.

- [ ] **Step 3: Verify**

Run: `pnpm start`

- [ ] **Step 4: Commit**

```
feat: add CPA and Claude TypeScript plugins
```

---

### Task 12: Remove Python plugins and remnants

**Files:**

- Delete: `resources/plugins/*.py`, `resources/plugins/_common.py`
- Delete: `src/main/core/plugin/python-detect.ts`
- Delete: `tests/unit/plugin/python-detect.test.ts`
- Delete: `src/main/ipc/system-ipc.ts` (if not already deleted)
- Delete: `tests/fixtures/plugin-metadata/metadata-*.py`
- Move: `docs/ts-plugin-runtime-plan.md` → `docs/archive/`

All TS plugins are now in place. Safe to remove Python.

- [ ] **Step 1: Delete Python plugin files**

```bash
rm resources/plugins/_common.py resources/plugins/*.py
rm src/main/core/plugin/python-detect.ts
rm tests/unit/plugin/python-detect.test.ts
rm tests/fixtures/plugin-metadata/metadata-*.py
```

- [ ] **Step 2: Archive reference doc**

```bash
mkdir -p docs/archive && mv docs/ts-plugin-runtime-plan.md docs/archive/
```

- [ ] **Step 3: Remove `registerSystemIpc` if still referenced**

Check `src/main/index.ts` — remove any remaining system-ipc import/call.

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: All pass, no Python-related tests remain.

- [ ] **Step 5: Commit**

```
chore: remove Python plugins and runtime
```

---

### Task 13: Final verification and packaging

- [ ] **Step 1: Run full check**

Run: `pnpm check && pnpm test`
Expected: All pass.

- [ ] **Step 2: Package and verify**

Run: `pnpm package`
Expected: Build succeeds, plugins compile, app launches with all 7 TS plugins.

- [ ] **Step 3: Smoke test packaged app**

Launch packaged exe. Verify:

- All plugins appear in settings
- Metadata parsed (names, icons, parameters)
- No Python-related errors
- DeepSeek shows error without key (correct)
- Plugin refresh works for configured plugins

- [ ] **Step 4: Update CLAUDE.md**

Remove Python references. Update plugin system description.

- [ ] **Step 5: Commit**

```
chore: finalize TypeScript plugin migration
```

---

## Self-Review

**Spec coverage:**

- Output schema: Task 1, 2
- Metadata `//` only: Task 3
- SDK: Task 4
- Compiler (4-state): Task 5
- Discovery/command-builder/runner: Task 6
- Main entry wiring: Task 7
- All 7 plugins: Tasks 8-11
- Python removal (after TS ready): Task 12
- Packaging verification: Task 13

**Placeholder scan:** No TBDs, no TODOs. Plugin ports (Tasks 9-11) describe what to port but not line-by-line code since they're full file rewrites of 100-800 line Python files — the Python source IS the spec.

**Type consistency:** `CompileResult` uses discriminated union with 4 statuses. `parsePluginResult` returns `PluginResult`. `refresh-service` checks `output.success`. `process.execPath` passed as `nodePath`. All consistent.

**Review fixes applied:**

1. No old schema compat — clean cut
2. Clean naming — `pluginSuccessOutputSchema`, `pluginFailureOutputSchema`, `pluginResultSchema`
3. `//` only, no `#` — immediate
4. TS plugins written before Python deleted (Tasks 8-11 before Task 12)
5. Node from `process.execPath` (Electron binary)
6. esbuild alias via `getSdkDir()` (resource-relative path)
7. Compiler test uses syntax error
8. 4-state `CompileResult` with `stale_cache`
9. No `export default` — CLI self-executing
10. Packaging contract documented
11. Cumulative `stdoutBytes` counter
12. Windows env vars in `minimalEnv`
13. Error codes: `fetchJson` uses `HTTP_STATUS`, plugins map to semantic codes
14. `ok()` allows `updatedAt` override
15. Reference doc archived, not deleted
