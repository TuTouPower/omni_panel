# Logging System Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden OmniUsage logging for safe user diagnostics with configurable log level, structured records, flushing, throttling, trace IDs, and default redaction.

**Architecture:** Keep the existing `createLogger(module)` module as the main seam. Add small internal helpers for JSONL formatting, default-safe metadata redaction, trace IDs, and flushable transports. Config drives log level and Settings writes that config value.

**Tech Stack:** Electron, React, TypeScript, Vitest, existing config IPC and renderer settings view.

---

## File Structure

- Modify `src/shared/lib/logger.ts`: log level helpers, JSONL records, default metadata redaction, flushable transport interface, contextual logger helper.
- Modify `src/main/core/logging.ts`: queued file writer, flush cleanup, default level by env/config.
- Modify `src/main/index.ts`: apply config log level on load/save and flush on quit.
- Modify `src/shared/types/config.ts`: add `LogLevel` and `logLevel` config field.
- Modify `src/main/core/config/types.ts`: validate `logLevel`.
- Modify `src/renderer/views/SettingsView.tsx`: add log level select.
- Modify `src/preload/index.ts`: throttle renderer log IPC.
- Modify `src/main/ipc/log-ipc.ts`: accept sanitized renderer logs and keep meta dev-only.
- Modify `src/main/ipc/logged.ts`: add `trace_id` per IPC handler call.
- Modify `src/main/core/scheduler/refresh-service.ts`, `src/main/core/connector/net-client.ts`, `src/main/core/connector/tier1-poll-executor.ts`, `src/main/core/connector/probe-executor.ts`: carry trace IDs through refresh and connector logs.
- Modify `src/renderer/components/AddAccountDialog.tsx`: replace direct `console.warn` with shared logger.
- Modify tests under `tests/unit/shared`, `tests/unit/renderer`, `tests/unit/ipc`, and scheduler/connector unit tests.
- Update docs only if logging behavior is described outside the new spec.

---

### Task 1: Logger core JSONL, redaction, and flush interface

**Files:**

- Modify: `src/shared/lib/logger.ts`
- Test: `tests/unit/shared/logger.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests asserting:

```ts
it("createFileTransport writes JSONL records with redacted secret metadata", () => {
    const lines: string[] = [];
    const transport = createFileTransport((line) => lines.push(line));
    const remove_transport = addTransport(transport);
    setLogLevel("debug");

    try {
        const log = createLogger("test");
        log.info("hello", {
            api_key: "sk-real",
            nested: { Authorization: "Bearer token-real" },
            safe: "visible",
        });

        const record = JSON.parse(lines[0] ?? "{}");
        expect(record.level).toBe("info");
        expect(record.module).toBe("test");
        expect(record.message).toBe("hello");
        expect(record.meta.api_key).toBe("***");
        expect(record.meta.nested.Authorization).toBe("***");
        expect(record.meta.safe).toBe("visible");
    } finally {
        remove_transport();
    }
});

it("flushLogTransports waits for flushable transports", async () => {
    const flushed: string[] = [];
    const remove_transport = addTransport({
        write() {},
        async flush() {
            flushed.push("done");
        },
    });

    try {
        await flushLogTransports();
        expect(flushed).toEqual(["done"]);
    } finally {
        remove_transport();
    }
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `pnpm test tests/unit/shared/logger.test.ts`

Expected: FAIL because `flushLogTransports` is not exported and file transport still writes text format.

- [ ] **Step 3: Implement minimal logger core**

In `src/shared/lib/logger.ts`:

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogRecord {
    readonly ts: string;
    readonly level: LogLevel;
    readonly module: string;
    readonly message: string;
    readonly meta?: unknown;
    readonly trace_id?: string;
}
interface LogTransport {
    write(record: LogRecord): void;
    flush?(): Promise<void>;
}
```

Implement `setLogLevel`, `getLogLevel`, `isLogLevel`, default key redaction in metadata, JSONL formatting in `createFileTransport`, console formatting from the record, and `flushLogTransports()`.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `pnpm test tests/unit/shared/logger.test.ts`

Expected: PASS.

---

### Task 2: Config schema and Settings UI log level

**Files:**

- Modify: `src/shared/types/config.ts`
- Modify: `src/main/core/config/types.ts`
- Modify: `src/renderer/views/SettingsView.tsx`
- Test: `tests/unit/renderer/views/settings_view.test.tsx`

- [ ] **Step 1: Write failing tests**

Add a SettingsView test:

```ts
it("saves selected log level from general settings", async () => {
    current_config = { ...base_config, logLevel: "info" };
    render(<SettingsView />);

    const user = userEvent.setup();
    await user.click(await screen.findByText("Info"));
    await user.click(screen.getByText("Debug"));

    await waitFor(() => {
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ logLevel: "debug" }));
    });
});
```

Add a schema assertion in an existing config schema test or new unit test:

```ts
expect(
    appConfigurationSchema.parse({
        schemaVersion: 1,
        language: "zh-Hans",
        launchAtLogin: false,
        plugins: [],
        logLevel: "warn",
    }).logLevel,
).toBe("warn");
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `pnpm test tests/unit/renderer/views/settings_view.test.tsx`

Expected: FAIL because UI does not show log level.

- [ ] **Step 3: Implement minimal config and UI**

Add:

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";
readonly logLevel?: LogLevel;
```

Add schema:

```ts
const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);
logLevel: logLevelSchema.optional(),
```

In Settings general section add diagnostics row:

```tsx
const logLevel = config?.logLevel ?? (import.meta.env.DEV ? "debug" : "info");

<SetRow title="日志等级" sub="Debug 记录最多，Info 适合日常诊断">
    <Select
        value={log_level_value_to_label(logLevel)}
        onChange={(v) => void save_config({ ...config, logLevel: log_level_label_to_value(v) })}
        options={["Debug", "Info", "Warn", "Error"]}
    />
</SetRow>;
```

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `pnpm test tests/unit/renderer/views/settings_view.test.tsx`

Expected: PASS.

---

### Task 3: Main logging init, configured levels, and flush on shutdown

**Files:**

- Modify: `src/main/core/logging.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/shared/logger.test.ts` or new `tests/unit/main/logging.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for queued transport flush and default level helper:

```ts
it("initLogging cleanup flushes queued file writes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-usage-logs-"));
    const cleanup = await initLogging(dir, { logLevel: "debug" });
    createLogger("test").info("queued");
    await cleanup();
    const log_file = join(dir, "logs", `app-${new Date().toISOString().slice(0, 10)}.log`);
    const raw = await readFile(log_file, "utf8");
    expect(raw).toContain('"message":"queued"');
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `pnpm test tests/unit/main/logging.test.ts`

Expected: FAIL because cleanup is synchronous / no options.

- [ ] **Step 3: Implement queued writer and cleanup flush**

Change `initLogging(userDataPath, options?)` to set level from options or env default and return `Promise<() => Promise<void>>`. File transport queues appends and `flush()` waits for `pending_write`.

- [ ] **Step 4: Wire main config**

In `src/main/index.ts`, after config load:

```ts
setLogLevel(currentConfigSnapshot.logLevel ?? defaultLogLevelForEnv());
```

On config save, call `setLogLevel(updatedConfig.logLevel ?? defaultLogLevelForEnv())`. On `before-quit`, await logging cleanup where lifecycle permits.

- [ ] **Step 5: Run targeted tests**

Run: `pnpm test tests/unit/main/logging.test.ts tests/unit/shared/logger.test.ts`

Expected: PASS.

---

### Task 4: Renderer log IPC throttling

**Files:**

- Modify: `src/preload/index.ts`
- Test: create `tests/unit/preload/log-throttle.test.ts` or add focused test for exported helper if extracted.

- [ ] **Step 1: Write failing test**

Extract a helper from preload for testability:

```ts
const throttle = create_renderer_log_throttle({ limit: 2, window_ms: 1000 });
expect(throttle.accept(0)).toEqual({ accepted: true });
expect(throttle.accept(1)).toEqual({ accepted: true });
expect(throttle.accept(2)).toEqual({ accepted: false });
expect(throttle.flush_notice(1000)).toEqual({ dropped_count: 1 });
```

- [ ] **Step 2: Run test and confirm RED**

Run: `pnpm test tests/unit/preload/log-throttle.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement helper and use it**

Create `src/preload/log-throttle.ts` with pure helper. In `log_method`, send accepted logs, count drops, and emit one warn `renderer logs throttled` with `{ dropped_count }` when the window rolls over.

- [ ] **Step 4: Run targeted test**

Run: `pnpm test tests/unit/preload/log-throttle.test.ts`

Expected: PASS.

---

### Task 5: Trace IDs for IPC and refresh connector chain

**Files:**

- Modify: `src/shared/lib/logger.ts`
- Modify: `src/main/ipc/logged.ts`
- Modify: `src/main/core/scheduler/refresh-service.ts`
- Modify: `src/main/core/connector/net-client.ts`
- Modify: `src/main/core/connector/host-io.ts`
- Modify: `src/main/core/connector/tier1-poll-executor.ts`
- Modify: `src/main/core/connector/probe-executor.ts`
- Test: `tests/unit/ipc/config-ipc.test.ts`, `tests/unit/connector/tier1-poll-executor.test.ts`, `tests/integration/scheduler/refresh-service.test.ts`

- [ ] **Step 1: Write failing IPC trace test**

Extend config IPC log test:

```ts
const trace_ids = lines
    .map((line) => JSON.parse(line.split(":").slice(3).join(":"))?.trace_id)
    .filter(Boolean);
expect(new Set(trace_ids).size).toBe(1);
```

If transport test stores raw meta, assert `meta.trace_id` exists on request and response logs.

- [ ] **Step 2: Run test and confirm RED**

Run: `pnpm test tests/unit/ipc/config-ipc.test.ts`

Expected: FAIL because no trace_id exists.

- [ ] **Step 3: Implement trace helpers**

In logger add:

```ts
export function createTraceId(prefix = "trace"): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
export function withLogContext(log: Logger, context: Record<string, unknown>): Logger { ... }
```

Use `withLogContext(log, { trace_id })` in `createLoggedIpcHandler`. Pass `trace_id` through refresh calls and connector context logs.

- [ ] **Step 4: Run targeted tests**

Run: `pnpm test tests/unit/ipc/config-ipc.test.ts tests/unit/connector/tier1-poll-executor.test.ts tests/integration/scheduler/refresh-service.test.ts`

Expected: PASS.

---

### Task 6: Replace direct console use

**Files:**

- Modify: `src/renderer/components/AddAccountDialog.tsx`
- Test: existing renderer component tests if relevant.

- [ ] **Step 1: Write failing grep/check test or targeted component test**

Run: `rg "console\." src/renderer/components/AddAccountDialog.tsx`

Expected before implementation: one `console.warn` hit.

- [ ] **Step 2: Implement replacement**

Add module logger:

```ts
const log = createLogger("renderer:add-account-dialog");
```

Replace click handler body with:

```ts
log.warn("Manual file selection is not yet implemented");
```

- [ ] **Step 3: Verify no direct console remains**

Run: `rg "console\." src/renderer/components/AddAccountDialog.tsx`

Expected: no matches.

---

### Task 7: Full verification and docs sync

**Files:**

- Modify docs only if impacted after search.

- [ ] **Step 1: Search docs**

Run: use Grep for `日志|logging|log level|运行日志` under `docs/` excluding `docs/design/omni-usage/`.

Expected: update any docs that describe old behavior.

- [ ] **Step 2: Typecheck and tests**

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Report honestly**

If tests pass, report changed files and verification. If packaged behavior was not tested, say it was not packaged-smoke verified.
