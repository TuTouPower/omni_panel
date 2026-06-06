# Full Debug Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make development debug logs capture full raw data across main, plugin, cache, config, IPC, and renderer flows.

**Architecture:** Keep the existing logger and file transport. Add safe full-value serialization for meta objects, then add debug calls at each data boundary where data enters, transforms, or leaves the app. This is development logging only: no redaction, no category switches, no business behavior changes.

**Tech Stack:** TypeScript, Electron main/renderer, Vitest, Playwright packaged smoke.

---

## File Structure

- Modify: `src/shared/lib/logger.ts`
    - Remove redaction from logger output.
    - Add full meta serialization that handles circular references and Error objects.
- Modify: `tests/unit/shared/logger.test.ts`
    - Replace redaction test with raw-value and circular-reference tests.
- Modify: `src/main/core/plugin/runner.ts`
    - Log full plugin command args/env and full stdout/stderr.
- Modify: `src/main/core/scheduler/refresh-service.ts`
    - Log config, plugin, merged params, runtime env, raw stdout/stderr, parsed output, cache payload, runtime payload.
- Modify: `tests/integration/scheduler/refresh-service.test.ts`
    - Add failing test proving refresh logs stdout, parsed output, and runtime payload including `resetAt`.
- Modify: `src/main/core/config/config-store.ts`
    - Log config load raw JSON, parsed config, save payload, and save path.
- Modify: `tests/integration/config/config-store.test.ts`
    - Add failing test proving config raw values are logged.
- Modify: `src/main/core/config/secrets-store.ts`
    - Log secret get/set/delete/export/import key/value.
- Modify: `tests/integration/config/secrets-store.test.ts`
    - Add failing test proving secret values are logged.
- Modify: `src/main/core/cache/cache-store.ts`
    - Log cache load/save/delete stateId/path/raw JSON/snapshot.
- Modify: `tests/integration/cache/cache-store.test.ts`
    - Add failing test proving cache payloads are logged.
- Modify: `src/main/ipc/config-ipc.ts`, `src/main/ipc/plugin-ipc.ts`, `src/main/ipc/event-ipc.ts`, `src/main/ipc/log-ipc.ts`
    - Log IPC request and response payloads.
- Modify: existing IPC unit tests under `tests/unit/ipc/`
    - Add focused assertions for config IPC logging.
- Modify: `src/renderer/lib/provider-usage.ts`
    - Log provider grouping inputs and outputs.
- Modify: `src/renderer/lib/usage-colors.ts`
    - Log elapsed and color calculation inputs/outputs.
- Modify: `tests/unit/renderer/lib/usage-colors.test.ts`
    - Add failing test proving `resetAt`, `elapsed`, and result color are logged.
- Modify: `src/renderer/views/PopupView.tsx`
    - Log loaded config, runtime states, grouped usage, and active color scheme.
- Modify: `src/renderer/views/SettingsView.tsx`
    - Log loaded config and save payloads for setting changes.
- Modify: `docs/test.md` or `docs/spec.md` only if implementation changes documented behavior. Expected: no docs change needed beyond this plan/spec.

---

### Task 1: Logger raw serialization

**Files:**

- Modify: `src/shared/lib/logger.ts`
- Modify: `tests/unit/shared/logger.test.ts`

- [ ] **Step 1: Replace the redaction test with a raw-value failing test**

Edit `tests/unit/shared/logger.test.ts` to this full content:

```ts
import { describe, expect, it } from "vitest";
import { addTransport, createLogger, setLogLevel } from "../../../src/shared/lib/logger";

describe("logger", () => {
    it("logs raw message and metadata values in debug mode", () => {
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const log = createLogger("test");
            log.debug("request api_key=secret-token", {
                Authorization: "Bearer real-token",
                nested: { password: "real-password" },
                safe: "visible",
            });

            const output = lines.join("\n");
            expect(output).toContain("api_key=secret-token");
            expect(output).toContain('"Authorization":"Bearer real-token"');
            expect(output).toContain('"password":"real-password"');
            expect(output).toContain("visible");
        } finally {
            remove_transport();
        }
    });

    it("serializes circular metadata without throwing", () => {
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const payload: Record<string, unknown> = { name: "root" };
            payload["self"] = payload;

            const log = createLogger("test");
            expect(() => log.debug("circular", payload)).not.toThrow();
            expect(lines.join("\n")).toContain("[Circular]");
        } finally {
            remove_transport();
        }
    });
});
```

- [ ] **Step 2: Run the logger test and verify it fails**

Run:

```bash
pnpm vitest run tests/unit/shared/logger.test.ts
```

Expected: FAIL because current logger redacts secret-like values and does not convert circular metadata for custom transports.

- [ ] **Step 3: Implement raw safe metadata serialization**

In `src/shared/lib/logger.ts`, replace the redaction helpers and `emit`/`formatMeta` support with safe serialization. The resulting file should keep the public API and contain these helper functions:

```ts
function serialize_meta(meta: unknown): unknown {
    const seen = new WeakSet<object>();

    function visit(value: unknown): unknown {
        if (value === undefined || value === null) return value;
        if (typeof value !== "object") return value;
        if (value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                stack: value.stack,
            };
        }
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
        if (Array.isArray(value)) return value.map((item) => visit(item));
        if (Object.getPrototypeOf(value) !== Object.prototype) return String(value);

        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, item]) => [
                key,
                visit(item),
            ]),
        );
    }

    return visit(meta);
}

function emit(level: LogLevel, module: string, message: string, meta?: unknown): void {
    if (!shouldLog(level)) return;
    const safe_meta = serialize_meta(meta);
    for (const t of transports) {
        t.write(level, module, message, safe_meta);
    }
}

function formatMeta(meta: unknown): string {
    if (meta === undefined) return "";
    if (typeof meta === "string") return ` | ${meta}`;
    try {
        return ` | ${JSON.stringify(meta)}`;
    } catch {
        return " | [unserializable]";
    }
}
```

Remove `SENSITIVE_KEY`, `redact_message()`, and `redact_meta()`.

- [ ] **Step 4: Run logger test and verify it passes**

Run:

```bash
pnpm vitest run tests/unit/shared/logger.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/logger.ts tests/unit/shared/logger.test.ts
git commit -m "feat: log raw debug metadata"
```

---

### Task 2: Plugin runner and refresh-service full logs

**Files:**

- Modify: `src/main/core/plugin/runner.ts`
- Modify: `src/main/core/scheduler/refresh-service.ts`
- Modify: `tests/integration/scheduler/refresh-service.test.ts`

- [ ] **Step 1: Add failing refresh-service log test**

Append this test inside `describe("refresh-service", () => { ... })` in `tests/integration/scheduler/refresh-service.test.ts`:

```ts
it("logs full plugin stdout, parsed output, and runtime payload", async () => {
    const lines: string[] = [];
    const remove_transport = addTransport({
        write(level, module, message, meta) {
            lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
        },
    });
    setLogLevel("debug");

    const stdout = JSON.stringify({
        success: true,
        schemaVersion: 1,
        updatedAt: "2026-05-24T12:00:00Z",
        items: [
            {
                id: "item-1",
                provider: "deepseek",
                source: "api_key",
                sourceInstanceId: "state-1",
                accountId: "acct-1",
                accountLabel: "Account 1",
                name: "5小时用量",
                used: 50,
                limit: 100,
                displayStyle: "percent",
                resetAt: "2026-05-24T14:00:00Z",
                status: "normal",
                color: "green",
            },
        ],
    });
    const output = JSON.parse(stdout) as ReturnType<RefreshServiceDeps["outputParser"]>;
    const deps = createDeps({
        runner: vi.fn<RefreshServiceDeps["runner"]>().mockResolvedValue({
            stdout,
            stderr: "debug stderr body",
            exitCode: 0,
            durationMs: 123,
        }),
        outputParser: vi.fn().mockReturnValue(output),
    });
    const service = createRefreshService(deps);

    try {
        await service.refresh("state-1", { force: true });
        const joined = lines.join("\n");

        expect(joined).toContain("plugin stdout raw");
        expect(joined).toContain("2026-05-24T14:00:00Z");
        expect(joined).toContain("debug stderr body");
        expect(joined).toContain("parsed plugin output");
        expect(joined).toContain("runtime ready payload");
    } finally {
        remove_transport();
    }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm vitest run tests/integration/scheduler/refresh-service.test.ts -t "logs full plugin stdout"
```

Expected: FAIL because current code logs only stdout/stderr byte counts and not raw/parsed payloads.

- [ ] **Step 3: Add runner full command/output logs**

In `src/main/core/plugin/runner.ts`, after `log.debug(`spawn...`)`, add:

```ts
log.debug("plugin command raw", {
    command: command.command,
    args: command.args,
    env: command.env,
    timeoutMs,
});
```

In the `child.on("close", ...)` success branch, after the existing exit debug line, add:

```ts
log.debug("plugin stdout raw", { stdout });
log.debug("plugin stderr raw", { stderr });
```

- [ ] **Step 4: Add refresh-service full payload logs**

In `src/main/core/scheduler/refresh-service.ts` add these debug logs at the exact boundaries:

After config load:

```ts
log.debug("refresh config raw", { instanceId, config });
```

After plugin lookup succeeds:

```ts
log.debug("refresh plugin config raw", { instanceId, plugin });
```

After `mergeSecrets()` returns:

```ts
log.debug("merged plugin params raw", { instanceId, mergedParams });
```

After `runtimeEnv` is built:

```ts
log.debug("runtime env raw", { instanceId, runtimeEnv, commandWithEnv });
```

After runner returns:

```ts
log.debug("plugin stdout raw", { instanceId, pluginName: plugin.name, stdout: result.stdout });
log.debug("plugin stderr raw", { instanceId, pluginName: plugin.name, stderr: result.stderr });
```

After output parse:

```ts
log.debug("parsed plugin output raw", { instanceId, pluginName: plugin.name, output });
```

Before cache save:

```ts
const cachePayload = {
    updatedAt: output.updatedAt,
    items: output.items,
    ...(output.badge !== undefined && { badge: output.badge }),
    ...(output.chart !== undefined && { chart: output.chart }),
};
log.debug("cache save payload raw", { instanceId, cachePayload });
```

Then replace the existing inline `deps.cacheStore.save(instanceId, { ... })` argument with `cachePayload`.

Before runtime update:

```ts
const readyPayload = {
    status: "ready" as const,
    items: output.items,
    updatedAt: new Date(output.updatedAt),
    ...(output.badge !== undefined && { badge: output.badge }),
    ...(output.chart !== undefined && { chart: output.chart }),
};
log.debug("runtime ready payload raw", { instanceId, readyPayload });
```

Then replace the existing inline `deps.runtimeStore.updateState(instanceId, { ... })` argument with `readyPayload`.

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
pnpm vitest run tests/integration/scheduler/refresh-service.test.ts -t "logs full plugin stdout"
```

Expected: PASS.

- [ ] **Step 6: Run the full refresh-service tests**

Run:

```bash
pnpm vitest run tests/integration/scheduler/refresh-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/core/plugin/runner.ts src/main/core/scheduler/refresh-service.ts tests/integration/scheduler/refresh-service.test.ts
git commit -m "feat: add full plugin refresh debug logs"
```

---

### Task 3: Config, secrets, and cache store logs

**Files:**

- Modify: `src/main/core/config/config-store.ts`
- Modify: `src/main/core/config/secrets-store.ts`
- Modify: `src/main/core/cache/cache-store.ts`
- Modify: `tests/integration/config/config-store.test.ts`
- Modify: `tests/integration/config/secrets-store.test.ts`
- Modify: `tests/integration/cache/cache-store.test.ts`

- [ ] **Step 1: Add failing config-store log test**

Append inside `describe("config-store", () => { ... })` in `tests/integration/config/config-store.test.ts`:

```ts
it("logs raw config load and save payloads", async () => {
    const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
    const lines: string[] = [];
    const remove_transport = addTransport({
        write(level, module, message, meta) {
            lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
        },
    });
    setLogLevel("debug");

    try {
        const store = createConfigStore(join(tempDir, "config.json"));
        const config: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            plugins: [],
            launchAtLogin: false,
            usageBarColorScheme: "risk-projected",
        };
        await store.save(config);
        await store.load();

        const joined = lines.join("\n");
        expect(joined).toContain("config save payload raw");
        expect(joined).toContain("config load raw");
        expect(joined).toContain("risk-projected");
    } finally {
        remove_transport();
    }
});
```

- [ ] **Step 2: Add failing secrets-store log test**

Append inside `describe("secrets-store", () => { ... })` in `tests/integration/config/secrets-store.test.ts`:

```ts
it("logs raw secret values", async () => {
    const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
    const lines: string[] = [];
    const remove_transport = addTransport({
        write(level, module, message, meta) {
            lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
        },
    });
    setLogLevel("debug");

    try {
        const store = createSecretsStore(join(tempDir, "secrets.json"), testCrypto);
        await store.set("instance:api_secret", "raw-secret-value");
        await store.get("instance:api_secret");
        await store.exportAll();

        const joined = lines.join("\n");
        expect(joined).toContain("secret set raw");
        expect(joined).toContain("secret get raw");
        expect(joined).toContain("secret export raw");
        expect(joined).toContain("raw-secret-value");
    } finally {
        remove_transport();
    }
});
```

- [ ] **Step 3: Add failing cache-store log test**

Append inside `describe("cache-store", () => { ... })` in `tests/integration/cache/cache-store.test.ts`:

```ts
it("logs raw cache save and load payloads", async () => {
    const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
    const lines: string[] = [];
    const remove_transport = addTransport({
        write(level, module, message, meta) {
            lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
        },
    });
    setLogLevel("debug");

    try {
        const store = createCacheStore(tempDir);
        const state = {
            updatedAt: "2026-05-24T12:00:00Z",
            items: [
                {
                    id: "a",
                    provider: "claude" as const,
                    source: "api_key" as const,
                    sourceInstanceId: "test-id",
                    accountId: "test-id",
                    accountLabel: "Claude",
                    name: "5小时用量",
                    used: 10,
                    limit: 100,
                    displayStyle: "percent" as const,
                    resetAt: "2026-05-24T14:00:00Z",
                    status: "normal" as const,
                },
            ],
        };
        await store.save("test-id", state);
        await store.load("test-id");

        const joined = lines.join("\n");
        expect(joined).toContain("cache save raw");
        expect(joined).toContain("cache load raw");
        expect(joined).toContain("2026-05-24T14:00:00Z");
    } finally {
        remove_transport();
    }
});
```

- [ ] **Step 4: Run tests and verify they fail**

Run:

```bash
pnpm vitest run tests/integration/config/config-store.test.ts -t "logs raw config"
pnpm vitest run tests/integration/config/secrets-store.test.ts -t "logs raw secret"
pnpm vitest run tests/integration/cache/cache-store.test.ts -t "logs raw cache"
```

Expected: all FAIL because these raw log messages do not exist yet.

- [ ] **Step 5: Add config-store logs**

In `src/main/core/config/config-store.ts`:

- Log the raw file content after reading.
- Log parsed config after schema parse.
- Log save payload before writing.
- Log final save path after rename.

Use these exact messages:

```ts
log.debug("config load raw", { filePath, raw });
log.debug("config parsed raw", { filePath, config: parsed });
log.debug("config save payload raw", { filePath, config: clean });
log.debug("config save complete raw", { filePath });
```

Use the existing variable names where available. If the current file uses different local names, keep the message strings exact and map to the local values.

- [ ] **Step 6: Add secrets-store logs**

In `src/main/core/config/secrets-store.ts`:

- In `get()`, after decrypt success:

```ts
log.debug("secret get raw", { key, encrypted, value });
```

- In `set()`, before write:

```ts
log.debug("secret set raw", { key, value, encrypted: data[key] });
```

- In `delete()`, before write:

```ts
log.debug("secret delete raw", { key, encrypted: data[key] });
```

- In `exportAll()`, before return:

```ts
log.debug("secret export raw", { result });
```

- In `importAll()`, before write:

```ts
log.debug("secret import raw", { decrypted, encrypted: data });
```

- [ ] **Step 7: Add cache-store logs**

In `src/main/core/cache/cache-store.ts`, import logger:

```ts
import { createLogger } from "../../../shared/lib/logger";
```

Inside `createCacheStore()`:

```ts
const log = createLogger("cache-store");
```

Add logs:

```ts
log.debug("cache load raw", { stateId, path, raw, parsed });
log.debug("cache load missing raw", { stateId, path });
log.debug("cache save raw", { stateId, path, state });
log.debug("cache delete raw", { stateId, path });
```

- [ ] **Step 8: Run focused tests and verify they pass**

Run:

```bash
pnpm vitest run tests/integration/config/config-store.test.ts -t "logs raw config"
pnpm vitest run tests/integration/config/secrets-store.test.ts -t "logs raw secret"
pnpm vitest run tests/integration/cache/cache-store.test.ts -t "logs raw cache"
```

Expected: all PASS.

- [ ] **Step 9: Run full store tests**

Run:

```bash
pnpm vitest run tests/integration/config/config-store.test.ts tests/integration/config/secrets-store.test.ts tests/integration/cache/cache-store.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/main/core/config/config-store.ts src/main/core/config/secrets-store.ts src/main/core/cache/cache-store.ts tests/integration/config/config-store.test.ts tests/integration/config/secrets-store.test.ts tests/integration/cache/cache-store.test.ts
git commit -m "feat: add full storage debug logs"
```

---

### Task 4: IPC full request and response logs

**Files:**

- Modify: `src/main/ipc/config-ipc.ts`
- Modify: `src/main/ipc/plugin-ipc.ts`
- Modify: `src/main/ipc/event-ipc.ts`
- Modify: `src/main/ipc/log-ipc.ts`
- Modify: `tests/unit/ipc/config-ipc.test.ts`

- [ ] **Step 1: Add failing config IPC logging test**

In `tests/unit/ipc/config-ipc.test.ts`, add a test near existing config IPC save/load tests:

```ts
it("logs raw config IPC request and response payloads", async () => {
    const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
    const lines: string[] = [];
    const remove_transport = addTransport({
        write(level, module, message, meta) {
            lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
        },
    });
    setLogLevel("debug");

    try {
        const ipcMain = await import("electron").then((electron) => electron.ipcMain);
        const handler = vi
            .mocked(ipcMain.handle)
            .mock.calls.find(([channel]) => channel === "config:get")?.[1];
        if (!handler) throw new Error("missing config:get handler");

        await handler({} as Electron.IpcMainInvokeEvent);

        const joined = lines.join("\n");
        expect(joined).toContain("ipc request raw");
        expect(joined).toContain("ipc response raw");
        expect(joined).toContain("config:get");
    } finally {
        remove_transport();
    }
});
```

If this test file uses a different Electron mock shape, keep the assertions and adapt only the handler lookup to the file's existing pattern.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm vitest run tests/unit/ipc/config-ipc.test.ts -t "logs raw config IPC"
```

Expected: FAIL because `ipc request raw` and `ipc response raw` do not exist.

- [ ] **Step 3: Add raw logs in IPC helpers**

In each IPC registration file, add logs around handler execution using exact message strings:

```ts
log.debug("ipc request raw", { channel, args });
log.debug("ipc response raw", { channel, result });
log.debug("ipc error raw", { channel, error });
```

Apply to:

- `src/main/ipc/config-ipc.ts`
- `src/main/ipc/plugin-ipc.ts`
- `src/main/ipc/event-ipc.ts`
- `src/main/ipc/log-ipc.ts`

Do not change IPC response shapes.

- [ ] **Step 4: Run focused IPC test**

Run:

```bash
pnpm vitest run tests/unit/ipc/config-ipc.test.ts -t "logs raw config IPC"
```

Expected: PASS.

- [ ] **Step 5: Run IPC unit tests**

Run:

```bash
pnpm vitest run tests/unit/ipc
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/config-ipc.ts src/main/ipc/plugin-ipc.ts src/main/ipc/event-ipc.ts src/main/ipc/log-ipc.ts tests/unit/ipc/config-ipc.test.ts
git commit -m "feat: add full IPC debug logs"
```

---

### Task 5: Renderer usage and color calculation logs

**Files:**

- Modify: `src/renderer/lib/provider-usage.ts`
- Modify: `src/renderer/lib/usage-colors.ts`
- Modify: `src/renderer/views/PopupView.tsx`
- Modify: `src/renderer/views/SettingsView.tsx`
- Modify: `tests/unit/renderer/lib/usage-colors.test.ts`

- [ ] **Step 1: Add failing usage-colors log test**

Append inside `tests/unit/renderer/lib/usage-colors.test.ts`:

```ts
describe("usage color debug logs", () => {
    it("logs resetAt elapsed and color decisions", async () => {
        const { addTransport, setLogLevel } = await import("../../../../src/shared/lib/logger");
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const now = Date.parse("2026-06-06T10:00:00Z");
            const elapsed = usage_window_elapsed("5 小时用量", "2026-06-06T12:00:00Z", now);
            const color = bar_fill_color("risk-projected", { pct: 50, idx: 0, elapsed });

            const joined = lines.join("\n");
            expect(color).toBe("var(--risk-yellow)");
            expect(joined).toContain("usage window elapsed raw");
            expect(joined).toContain("bar fill color raw");
            expect(joined).toContain("2026-06-06T12:00:00Z");
            expect(joined).toContain("risk-projected");
        } finally {
            remove_transport();
        }
    });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm vitest run tests/unit/renderer/lib/usage-colors.test.ts -t "logs resetAt elapsed"
```

Expected: FAIL because color calculation logs do not exist.

- [ ] **Step 3: Add usage-colors logs**

In `src/renderer/lib/usage-colors.ts`, import logger:

```ts
import { createLogger } from "../../shared/lib/logger";
```

Add module logger:

```ts
const log = createLogger("renderer:usage-colors");
```

In `usage_window_elapsed()`, before each return, log exact inputs and output. For successful duration path:

```ts
const elapsed = Math.min(1, Math.max(0, 1 - remaining / duration));
log.debug("usage window elapsed raw", {
    period_name,
    reset_at,
    now_ms,
    reset_ms,
    duration,
    remaining,
    elapsed,
});
return elapsed;
```

For missing/invalid paths, log:

```ts
log.debug("usage window elapsed raw", {
    period_name,
    reset_at,
    now_ms,
    elapsed: undefined,
    reason: "missing resetAt",
});
log.debug("usage window elapsed raw", {
    period_name,
    reset_at,
    now_ms,
    elapsed: undefined,
    reason: "invalid resetAt",
});
log.debug("usage window elapsed raw", {
    period_name,
    reset_at,
    now_ms,
    elapsed: undefined,
    reason: "unknown period",
});
```

In `bar_fill_color()`, compute result before returning and log:

```ts
log.debug("bar fill color raw", { scheme, pct, idx, elapsed, result });
```

- [ ] **Step 4: Add provider usage logs**

In `src/renderer/lib/provider-usage.ts`, import logger and add:

```ts
const log = createLogger("renderer:provider-usage");
```

At the start and end of grouping/build functions, add:

```ts
log.debug("provider usage input raw", { snapshots });
log.debug("provider usage grouped raw", { groups });
log.debug("provider overview periods raw", { provider, overviewPeriods });
```

Use the actual local variable names in the file. Keep message strings exact.

- [ ] **Step 5: Add PopupView and SettingsView logs**

In `src/renderer/views/PopupView.tsx`, use the existing renderer logging bridge or `createLogger` pattern already used in the file. Add logs for:

```ts
log.debug("popup config raw", { config: result.config });
log.debug("popup runtime states raw", { states });
log.debug("popup grouped usage raw", { groups });
log.debug("popup usage bar color scheme raw", { usage_bar_color_scheme });
```

In `src/renderer/views/SettingsView.tsx`, add logs for:

```ts
log.debug("settings config raw", { config });
log.debug("settings save payload raw", { payload });
log.debug("settings usage bar color scheme raw", { value });
```

Use nearby existing variables; do not create new state just for logging.

- [ ] **Step 6: Run focused renderer test**

Run:

```bash
pnpm vitest run tests/unit/renderer/lib/usage-colors.test.ts -t "logs resetAt elapsed"
```

Expected: PASS.

- [ ] **Step 7: Run renderer unit tests touched by this change**

Run:

```bash
pnpm vitest run tests/unit/renderer/lib/usage-colors.test.ts tests/unit/renderer/views/settings_view.test.tsx tests/unit/renderer/components/provider_card.test.tsx tests/unit/renderer/components/provider_account_row.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/lib/provider-usage.ts src/renderer/lib/usage-colors.ts src/renderer/views/PopupView.tsx src/renderer/views/SettingsView.tsx tests/unit/renderer/lib/usage-colors.test.ts
git commit -m "feat: add renderer usage debug logs"
```

---

### Task 6: Full verification and documentation check

**Files:**

- Check: `docs/test.md`
- Check: `docs/spec.md`
- Check: `CLAUDE.md`

- [ ] **Step 1: Run typecheck**

Run:

```bash
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Run full tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 4: Run E2E tests**

Run:

```bash
pnpm test:e2e
```

Expected: PASS, with skipped tests only if already configured by the project.

- [ ] **Step 5: Package and launch**

Run:

```bash
pnpm package
```

Expected: package succeeds and starts `out/OmniUsage-win32-x64/OmniUsage.exe`.

- [ ] **Step 6: Run packaged smoke**

Run:

```bash
pnpm test:packaged
```

Expected: PASS.

- [ ] **Step 7: Run visual tests**

Run:

```bash
pnpm test:visual
```

Expected: PASS. If snapshots fail due only to intended UI differences, do not update baselines without explicit user approval.

- [ ] **Step 8: Manual log verification**

Open the app, refresh a plugin, switch usage bar color scheme to `risk-projected`, and inspect:

```text
C:\Users\TestUser\AppData\Roaming\OmniUsage\logs\app-YYYY-MM-DD.log
```

Expected log content includes:

```text
usageBarColorScheme
resetAt
plugin stdout raw
parsed plugin output raw
provider usage grouped raw
usage window elapsed raw
bar fill color raw
```

- [ ] **Step 9: Documentation impact check**

Read `docs/test.md`, `docs/spec.md`, and project `CLAUDE.md` sections about testing/logging. If none mention debug logging behavior, no docs update is required. If any document says logs are redacted or minimal, update that sentence to state development logs are full raw debug logs.

- [ ] **Step 10: Commit verification/docs changes**

If documentation changed:

```bash
git add docs/test.md docs/spec.md CLAUDE.md
git commit -m "docs: document development debug logging"
```

If no documentation changed, skip this commit.

---

## Self-Review

**Spec coverage:**

- Full app/config/cache/secrets/plugin/runtime/IPC/renderer data flow logging is covered by Tasks 1-5.
- No redaction and no category switches are covered by Task 1 and by the plan architecture.
- Validation by unit, integration, E2E, packaged, visual, and manual log inspection is covered by Task 6.

**Placeholder scan:**

- No placeholder markers remain.
- Each code-changing task includes exact file paths, code snippets, commands, and expected outcomes.

**Type consistency:**

- Logger API remains `log.debug(message, meta)`.
- Log message strings are consistent across tests and implementation steps.
- Existing project names remain camelCase where already required by TypeScript types; no new public API naming is introduced.
