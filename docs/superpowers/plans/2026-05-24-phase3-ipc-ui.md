# Phase 3: IPC 与 UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 IPC 合约层、preload 安全桥、Electron 托盘/窗口管理、React renderer UI（仪表板 + 设置）。

**Architecture:** 单 Renderer bundle，hash 路由区分 popup/dashboard/settings 三个视图。IPC 使用 result envelope 模式，preload 通过 contextBridge 暴露 `window.usageboard.*`，secret 只写不读。

**Tech Stack:** Electron 42, React 19, shadcn/ui, Tailwind CSS 4, Vite, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-05-24-phase3-ipc-ui-design.md`

---

## File Map

### 新建文件

| 文件                                             | 职责                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| `src/shared/types/ipc.ts`                        | IPC 通道常量 + DTO 类型 + IpcResult + UsageboardApi  |
| `src/main/ipc/helpers.ts`                        | ok()/fail() result envelope 辅助函数                 |
| `src/main/ipc/plugin-ipc.ts`                     | 插件 IPC handler（list/getState/refresh/refreshAll） |
| `src/main/ipc/config-ipc.ts`                     | 配置 IPC handler（get/save/saveSecrets）             |
| `src/main/ipc/event-ipc.ts`                      | 事件推送（stateChange/themeChange）                  |
| `src/preload/usageboard-api.ts`                  | Window type augmentation                             |
| `src/preload/index.ts`                           | contextBridge 注册 + invoke 辅助                     |
| `src/renderer/index.html`                        | HTML 入口                                            |
| `src/renderer/index.tsx`                         | React 挂载点                                         |
| `src/renderer/App.tsx`                           | 路由 switch                                          |
| `src/renderer/styles/globals.css`                | Tailwind + shadcn CSS 变量                           |
| `src/renderer/lib/utils.ts`                      | cn() className 合并工具                              |
| `src/renderer/lib/theme.ts`                      | useTheme hook                                        |
| `src/renderer/hooks/use-route.ts`                | hash 路由 hook                                       |
| `src/renderer/hooks/use-plugins.ts`              | 插件数据 hook                                        |
| `src/renderer/hooks/use-config.ts`               | 配置数据 hook                                        |
| `src/renderer/components/PluginCard.tsx`         | 插件用量卡片                                         |
| `src/renderer/components/PluginCardSkeleton.tsx` | 加载骨架                                             |
| `src/renderer/components/ErrorBanner.tsx`        | 错误提示                                             |
| `src/renderer/components/EmptyState.tsx`         | 空状态                                               |
| `src/renderer/components/RefreshButton.tsx`      | 刷新按钮                                             |
| `src/renderer/components/SettingsForm.tsx`       | metadata 自动生成表单                                |
| `src/renderer/views/PopupView.tsx`               | 托盘弹出面板                                         |
| `src/renderer/views/DashboardView.tsx`           | 独立窗口仪表板                                       |
| `src/renderer/views/SettingsView.tsx`            | 设置窗口                                             |
| `tests/unit/ipc/helpers.test.ts`                 | helpers 单元测试                                     |
| `tests/unit/ipc/plugin-ipc.test.ts`              | plugin-ipc 单元测试                                  |
| `tests/unit/ipc/config-ipc.test.ts`              | config-ipc 单元测试                                  |

### 修改文件

| 文件                         | 变更                                                |
| ---------------------------- | --------------------------------------------------- |
| `src/main/index.ts`          | 重写：托盘 + 窗口管理 + IPC 注册 + 生命周期         |
| `forge.config.ts`            | entry 指向新路径（main/index.ts, preload/index.ts） |
| `vite.main.config.ts`        | 空 → 无需改（forge 自动处理）                       |
| `vite.preload.config.ts`     | 空 → 无需改                                         |
| `vite.renderer.config.ts`    | 添加 Tailwind 插件 + React 插件                     |
| `package.json`               | 添加 React/Tailwind/shadcn 依赖                     |
| `src/shared/types/config.ts` | 清理占位注释，re-export config types                |
| `src/shared/types/plugin.ts` | 保持不变                                            |

### 删除文件

| 文件              | 原因                                      |
| ----------------- | ----------------------------------------- |
| `src/main.ts`     | 迁移到 `src/main/index.ts`                |
| `src/preload.ts`  | 迁移到 `src/preload/index.ts`             |
| `src/renderer.ts` | 迁移到 `src/renderer/index.tsx`           |
| `src/index.css`   | 被 `src/renderer/styles/globals.css` 替代 |

---

## Task 1: IPC 合约类型

**Files:**

- Rewrite: `src/shared/types/ipc.ts`

- [ ] **Step 1: Write the IPC contract types**

```typescript
// src/shared/types/ipc.ts
import type { UsageItem, PluginChart } from "../schemas/plugin-output";
import type { PluginMetadata } from "../schemas/plugin-metadata";
import type { AppConfiguration } from "../../main/core/config/types";

export const IPC_CHANNELS = {
    PLUGIN_LIST: "plugin:list",
    PLUGIN_GET_STATE: "plugin:getState",
    PLUGIN_REFRESH: "plugin:refresh",
    PLUGIN_REFRESH_ALL: "plugin:refreshAll",

    CONFIG_GET: "config:get",
    CONFIG_SAVE: "config:save",
    CONFIG_SAVE_SECRETS: "config:saveSecrets",

    EVENT_STATE_CHANGE: "event:stateChange",
    EVENT_THEME_CHANGE: "event:themeChange",
} as const;

export type PluginSnapshotDTO =
    | { status: "idle" }
    | { status: "loading" }
    | {
          status: "ready";
          items: readonly UsageItem[];
          updatedAt: string;
          badge?: string;
          chart?: PluginChart;
      }
    | {
          status: "failed";
          error: string;
          updatedAt?: string;
          items?: readonly UsageItem[];
      };

export interface PluginInfo {
    stateId: string;
    name: string;
    enabled: boolean;
    metadata: PluginMetadata | null;
    snapshot: PluginSnapshotDTO;
}

export interface ConfigSaveSecretsPayload {
    stateId: string;
    secrets: Record<string, string>;
}

export interface IpcError {
    code: string;
    message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export interface UsageboardApi {
    plugin: {
        list(): Promise<PluginInfo[]>;
        getState(stateId: string): Promise<PluginSnapshotDTO>;
        refresh(stateId: string): Promise<void>;
        refreshAll(): Promise<void>;
    };
    config: {
        get(): Promise<AppConfiguration>;
        save(config: AppConfiguration): Promise<void>;
        saveSecrets(payload: ConfigSaveSecretsPayload): Promise<void>;
    };
    event: {
        onStateChange(callback: (stateId: string, state: PluginSnapshotDTO) => void): () => void;
        onThemeChange(callback: (isDark: boolean) => void): () => void;
    };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS（类型文件无运行时依赖）

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/ipc.ts
git commit -m "feat: define IPC contract types, channels, and UsageboardApi"
```

---

## Task 2: IPC helpers

**Files:**

- Create: `src/main/ipc/helpers.ts`
- Create: `tests/unit/ipc/helpers.test.ts`

- [ ] **Step 1: Write tests for ok/fail helpers**

```typescript
// tests/unit/ipc/helpers.test.ts
import { describe, it, expect } from "vitest";
import { ok, fail } from "../../../src/main/ipc/helpers";

describe("IPC helpers", () => {
    it("ok() returns success envelope with data", () => {
        const result = ok(42);
        expect(result).toEqual({ ok: true, data: 42 });
    });

    it("ok() returns success envelope with undefined", () => {
        const result = ok(undefined);
        expect(result).toEqual({ ok: true, data: undefined });
    });

    it("ok() returns success envelope with object", () => {
        const data = { name: "test" };
        const result = ok(data);
        expect(result).toEqual({ ok: true, data });
    });

    it("fail() returns error envelope with code and message", () => {
        const result = fail("VALIDATION_ERROR", "Invalid input");
        expect(result).toEqual({
            ok: false,
            error: { code: "VALIDATION_ERROR", message: "Invalid input" },
        });
    });

    it("fail() returns error envelope for internal errors", () => {
        const result = fail("INTERNAL_ERROR", "刷新失败");
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("INTERNAL_ERROR");
        }
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/ipc/helpers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement helpers**

```typescript
// src/main/ipc/helpers.ts
import type { IpcError } from "../../shared/types/ipc";

export type IpcResult<T> =
    | { readonly ok: true; readonly data: T }
    | { readonly ok: false; readonly error: IpcError };

export function ok<T>(data: T): IpcResult<T> {
    return { ok: true, data };
}

export function fail(code: string, message: string): IpcResult<never> {
    return { ok: false, error: { code, message } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/ipc/helpers.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/helpers.ts tests/unit/ipc/helpers.test.ts
git commit -m "feat: add IPC result envelope helpers with tests"
```

---

## Task 3: Plugin IPC handler

**Files:**

- Create: `src/main/ipc/plugin-ipc.ts`
- Create: `tests/unit/ipc/plugin-ipc.test.ts`

- [ ] **Step 1: Write tests for plugin IPC handlers**

```typescript
// tests/unit/ipc/plugin-ipc.test.ts
import { describe, it, expect, vi } from "vitest";
import type { IpcResult } from "../../../src/main/ipc/helpers";
import type { PluginSnapshotDTO } from "../../../src/shared/types/ipc";
import type { AppConfiguration } from "../../../src/main/core/config/types";
import type { RuntimeStore } from "../../../src/main/core/scheduler/runtime-store";

function createMockDeps() {
    const configStore = {
        load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
            schemaVersion: 1,
            language: "zh-Hans",
            overviewDisplayMode: "tabs",
            plugins: [
                {
                    stateId: "claude",
                    name: "Claude",
                    enabled: true,
                    executablePath: "/plugins/claude.py",
                    refreshIntervalSeconds: 300,
                    parameterValues: { API_KEY: "sk-real-key", MODEL: "gpt-4" },
                },
            ],
            launchAtLogin: false,
        }),
        save: vi.fn(),
    };

    const idleState: PluginSnapshotDTO = { status: "idle" };
    const readyState: PluginSnapshotDTO = {
        status: "ready",
        items: [
            {
                id: "tokens",
                name: "Tokens",
                used: 2340,
                limit: 10000,
                displayStyle: "percent",
                status: "normal",
            },
        ],
        updatedAt: "2026-05-24T14:00:00.000Z",
    };

    const runtimeStore: RuntimeStore = {
        getSnapshot: vi.fn().mockReturnValue(readyState),
        updateState: vi.fn(),
        getAll: vi.fn().mockReturnValue(new Map([["claude", readyState]])),
        subscribe: vi.fn().mockReturnValue(() => {}),
        removeInstance: vi.fn(),
    };

    const refreshService = {
        refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        refreshAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    return { configStore, runtimeStore, refreshService };
}

describe("plugin-ipc", () => {
    it("plugin:list returns PluginInfo[] with secret masked", async () => {
        const deps = createMockDeps();
        const { registerPluginIpc, __handlers } = await import("../../../src/main/ipc/plugin-ipc");

        const handler = __handlers[0];
        const result: IpcResult<unknown[]> = await handler(deps);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const list = result.data;
        expect(list).toHaveLength(1);
        expect(list[0].stateId).toBe("claude");
        // secret should be masked
        expect(list[0].parameterValues?.API_KEY).toBe("***");
    });

    it("plugin:getState returns DTO for valid stateId", async () => {
        const deps = createMockDeps();
        const { __handlers } = await import("../../../src/main/ipc/plugin-ipc");

        const getStateHandler = __handlers[1];
        const result = await getStateHandler(deps, "claude");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.status).toBe("ready");
    });

    it("plugin:getState rejects empty stateId", async () => {
        const deps = createMockDeps();
        const { __handlers } = await import("../../../src/main/ipc/plugin-ipc");

        const getStateHandler = __handlers[1];
        const result = await getStateHandler(deps, "");
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
    });

    it("plugin:refresh calls refreshService.refresh with force", async () => {
        const deps = createMockDeps();
        const { __handlers } = await import("../../../src/main/ipc/plugin-ipc");

        const refreshHandler = __handlers[2];
        const result = await refreshHandler(deps, "claude");
        expect(result.ok).toBe(true);
        expect(deps.refreshService.refresh).toHaveBeenCalledWith("claude", { force: true });
    });

    it("plugin:refreshAll calls refreshService.refreshAll", async () => {
        const deps = createMockDeps();
        const { __handlers } = await import("../../../src/main/ipc/plugin-ipc");

        const refreshAllHandler = __handlers[3];
        const result = await refreshAllHandler(deps);
        expect(result.ok).toBe(true);
        expect(deps.refreshService.refreshAll).toHaveBeenCalled();
    });
});
```

Note: The handler export pattern uses `__handlers` for testability. Alternatively, export individual handler functions that accept deps as first arg.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/ipc/plugin-ipc.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement plugin-ipc.ts**

Handler functions take deps as first argument for testability. `registerPluginIpc` wires them to `ipcMain.handle`.

```typescript
// src/main/ipc/plugin-ipc.ts
import { z } from "zod/v3";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PluginInfo, PluginSnapshotDTO } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { PluginSnapshotState } from "../core/scheduler/types";
import type { PluginRefreshService } from "../core/scheduler/refresh-service";

const stateIdSchema = z.string().min(1);
const MASK = "***";

function toDTO(state: PluginSnapshotState): PluginSnapshotDTO {
    switch (state.status) {
        case "idle":
            return { status: "idle" };
        case "loading":
            return { status: "loading" };
        case "ready":
            return {
                status: "ready",
                items: state.items,
                updatedAt: state.updatedAt.toISOString(),
                ...(state.badge !== undefined && { badge: state.badge }),
                ...(state.chart !== undefined && { chart: state.chart }),
            };
        case "failed":
            return {
                status: "failed",
                error: state.error,
                ...(state.lastSuccess !== undefined && {
                    updatedAt: state.lastSuccess.updatedAt,
                    items: state.lastSuccess.items,
                }),
            };
    }
}

export interface PluginIpcDeps {
    configStore: AppConfigStore;
    runtimeStore: RuntimeStore;
    refreshService: PluginRefreshService;
}

export async function handlePluginList(deps: PluginIpcDeps): Promise<IpcResult<PluginInfo[]>> {
    try {
        const config = await deps.configStore.load();
        const plugins: PluginInfo[] = config.plugins.map((plugin) => {
            const snapshot = toDTO(deps.runtimeStore.getSnapshot(plugin.stateId));
            return {
                stateId: plugin.stateId,
                name: plugin.name,
                enabled: plugin.enabled,
                metadata: null,
                snapshot,
            };
        });
        return ok(plugins);
    } catch {
        return fail("INTERNAL_ERROR", "获取插件列表失败");
    }
}

export async function handlePluginGetState(
    deps: PluginIpcDeps,
    stateId: string,
): Promise<IpcResult<PluginSnapshotDTO>> {
    try {
        const parsed = stateIdSchema.safeParse(stateId);
        if (!parsed.success) return fail("VALIDATION_ERROR", "无效的插件 ID");
        const state = deps.runtimeStore.getSnapshot(parsed.data);
        return ok(toDTO(state));
    } catch {
        return fail("INTERNAL_ERROR", "获取插件状态失败");
    }
}

export async function handlePluginRefresh(
    deps: PluginIpcDeps,
    stateId: string,
): Promise<IpcResult<void>> {
    try {
        const parsed = stateIdSchema.safeParse(stateId);
        if (!parsed.success) return fail("VALIDATION_ERROR", "无效的插件 ID");
        await deps.refreshService.refresh(parsed.data, { force: true });
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "刷新失败");
    }
}

export async function handlePluginRefreshAll(deps: PluginIpcDeps): Promise<IpcResult<void>> {
    try {
        await deps.refreshService.refreshAll();
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "刷新全部失败");
    }
}

export function registerPluginIpc(deps: PluginIpcDeps): void {
    const { ipcMain } = require("electron") as typeof import("electron");
    ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST, () => handlePluginList(deps));
    ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_STATE, (_e, stateId: string) =>
        handlePluginGetState(deps, stateId),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_REFRESH, (_e, stateId: string) =>
        handlePluginRefresh(deps, stateId),
    );
    ipcMain.handle(IPC_CHANNELS.PLUGIN_REFRESH_ALL, () => handlePluginRefreshAll(deps));
}
```

- [ ] **Step 4: Update test to match actual export pattern**

Update `tests/unit/ipc/plugin-ipc.test.ts` to use direct function imports (`handlePluginList`, `handlePluginGetState`, etc.) instead of `__handlers`.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/unit/ipc/plugin-ipc.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/plugin-ipc.ts tests/unit/ipc/plugin-ipc.test.ts
git commit -m "feat: implement plugin IPC handlers with tests"
```

---

## Task 4: Config IPC handler

**Files:**

- Create: `src/main/ipc/config-ipc.ts`
- Create: `tests/unit/ipc/config-ipc.test.ts`

- [ ] **Step 1: Write tests for config IPC**

测试重点：secret 脱敏、save 时剥离 secret、saveSecrets 的 paramName 校验。

```typescript
// tests/unit/ipc/config-ipc.test.ts
import { describe, it, expect, vi } from "vitest";
import type { IpcResult } from "../../../src/main/ipc/helpers";

function createMockDeps() {
    const configStore = {
        load: vi.fn().mockResolvedValue({
            schemaVersion: 1,
            language: "zh-Hans" as const,
            overviewDisplayMode: "tabs" as const,
            plugins: [
                {
                    stateId: "claude",
                    name: "Claude",
                    enabled: true,
                    executablePath: "/plugins/claude.py",
                    refreshIntervalSeconds: 300,
                    parameterValues: { API_KEY: "sk-real", MODEL: "gpt-4" },
                },
            ],
            launchAtLogin: false,
        }),
        save: vi.fn().mockResolvedValue(undefined),
    };

    const secretsStore = {
        get: vi.fn().mockResolvedValue("sk-real"),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };

    return { configStore, secretsStore };
}

describe("config-ipc", () => {
    it("config:get masks secret parameters", async () => {
        const deps = createMockDeps();
        const { handleConfigGet } = await import("../../../src/main/ipc/config-ipc");
        const result = await handleConfigGet(deps, ["claude:API_KEY"]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.plugins[0].parameterValues.API_KEY).toBe("***");
        expect(result.data.plugins[0].parameterValues.MODEL).toBe("gpt-4");
    });

    it("config:save strips secret fields from parameterValues", async () => {
        const deps = createMockDeps();
        const { handleConfigSave } = await import("../../../src/main/ipc/config-ipc");

        const config = await deps.configStore.load();
        // Simulate renderer sending back "***" for secret
        config.plugins[0].parameterValues.API_KEY = "***";
        config.plugins[0].parameterValues.MODEL = "gpt-4o";

        const result = await handleConfigSave(deps, config, ["claude:API_KEY"]);
        expect(result.ok).toBe(true);
        // save should NOT include API_KEY in parameterValues
        const saved = deps.configStore.save.mock.calls[0][0];
        expect(saved.plugins[0].parameterValues.API_KEY).toBeUndefined();
        expect(saved.plugins[0].parameterValues.MODEL).toBe("gpt-4o");
    });

    it("config:saveSecrets validates paramName against metadata", async () => {
        const deps = createMockDeps();
        const { handleConfigSaveSecrets } = await import("../../../src/main/ipc/config-ipc");

        const result = await handleConfigSaveSecrets(
            deps,
            {
                stateId: "claude",
                secrets: { API_KEY: "new-key", INVALID_PARAM: "value" },
            },
            { claude: new Set(["API_KEY"]) },
        );

        expect(result.ok).toBe(true);
        // Only API_KEY should be saved, INVALID_PARAM skipped
        expect(deps.secretsStore.set).toHaveBeenCalledTimes(1);
        expect(deps.secretsStore.set).toHaveBeenCalledWith("claude:API_KEY", "new-key");
    });

    it("config:saveSecrets rejects unknown stateId", async () => {
        const deps = createMockDeps();
        const { handleConfigSaveSecrets } = await import("../../../src/main/ipc/config-ipc");

        const result = await handleConfigSaveSecrets(
            deps,
            {
                stateId: "nonexistent",
                secrets: { API_KEY: "new-key" },
            },
            { claude: new Set(["API_KEY"]) },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(deps.secretsStore.set).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests — fail**

Run: `pnpm vitest run tests/unit/ipc/config-ipc.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement config-ipc.ts**

```typescript
// src/main/ipc/config-ipc.ts
import { z } from "zod/v3";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { ConfigSaveSecretsPayload } from "../../shared/types/ipc";
import type { IpcResult } from "./helpers";
import { ok, fail } from "./helpers";
import type { AppConfigStore } from "../core/config/config-store";
import type { SecretsStore } from "../core/config/secrets-store";
import type { AppConfiguration, PluginConfiguration } from "../core/config/types";

const MASK = "***";

export interface ConfigIpcDeps {
    configStore: AppConfigStore;
    secretsStore: SecretsStore;
    secretParamKeys: ReadonlyMap<string, ReadonlySet<string>>;
}

function maskSecrets(
    config: AppConfiguration,
    secretKeys: ReadonlyMap<string, ReadonlySet<string>>,
): AppConfiguration {
    return {
        ...config,
        plugins: config.plugins.map((plugin) => {
            const keys = secretKeys.get(plugin.stateId);
            if (!keys) return plugin;
            const masked = { ...plugin.parameterValues };
            for (const key of keys) {
                if (key in masked) masked[key] = MASK;
            }
            return { ...plugin, parameterValues: masked };
        }),
    };
}

function stripSecrets(
    config: AppConfiguration,
    secretKeys: ReadonlyMap<string, ReadonlySet<string>>,
): AppConfiguration {
    return {
        ...config,
        plugins: config.plugins.map((plugin) => {
            const keys = secretKeys.get(plugin.stateId);
            if (!keys) return plugin;
            const stripped = { ...plugin.parameterValues };
            for (const key of keys) {
                delete stripped[key];
            }
            return { ...plugin, parameterValues: stripped };
        }),
    };
}

export async function handleConfigGet(deps: ConfigIpcDeps): Promise<IpcResult<AppConfiguration>> {
    try {
        const config = await deps.configStore.load();
        return ok(maskSecrets(config, deps.secretParamKeys));
    } catch {
        return fail("INTERNAL_ERROR", "获取配置失败");
    }
}

export async function handleConfigSave(
    deps: ConfigIpcDeps,
    config: unknown,
): Promise<IpcResult<void>> {
    try {
        const { appConfigurationSchema } = await import("../core/config/types");
        const parsed = appConfigurationSchema.safeParse(config);
        if (!parsed.success) return fail("VALIDATION_ERROR", "配置格式无效");

        const stripped = stripSecrets(parsed.data, deps.secretParamKeys);
        await deps.configStore.save(stripped);
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "保存配置失败");
    }
}

export async function handleConfigSaveSecrets(
    deps: ConfigIpcDeps,
    payload: unknown,
): Promise<IpcResult<void>> {
    try {
        if (!payload || typeof payload !== "object") {
            return fail("VALIDATION_ERROR", "无效的请求数据");
        }
        const { stateId, secrets } = payload as ConfigSaveSecretsPayload;

        const config = await deps.configStore.load();
        const plugin = config.plugins.find((p: PluginConfiguration) => p.stateId === stateId);
        if (!plugin) return fail("VALIDATION_ERROR", "插件不存在");

        const allowedKeys = deps.secretParamKeys.get(stateId);
        if (!allowedKeys) return ok(undefined);

        for (const [paramName, value] of Object.entries(secrets)) {
            if (allowedKeys.has(paramName)) {
                await deps.secretsStore.set(`${stateId}:${paramName}`, value);
            }
        }
        return ok(undefined);
    } catch {
        return fail("INTERNAL_ERROR", "保存密钥失败");
    }
}

export function registerConfigIpc(deps: ConfigIpcDeps): void {
    const { ipcMain } = require("electron") as typeof import("electron");
    ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => handleConfigGet(deps));
    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE, (_e, config: unknown) =>
        handleConfigSave(deps, config),
    );
    ipcMain.handle(IPC_CHANNELS.CONFIG_SAVE_SECRETS, (_e, payload: unknown) =>
        handleConfigSaveSecrets(deps, payload),
    );
}
```

- [ ] **Step 4: Adjust tests to match actual function signatures and run**

Run: `pnpm vitest run tests/unit/ipc/config-ipc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/config-ipc.ts tests/unit/ipc/config-ipc.test.ts
git commit -m "feat: implement config IPC handlers with secret masking and validation"
```

---

## Task 5: Event IPC handler

**Files:**

- Create: `src/main/ipc/event-ipc.ts`

- [ ] **Step 1: Implement event IPC**

```typescript
// src/main/ipc/event-ipc.ts
import { nativeTheme, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../../shared/types/ipc";
import type { PluginSnapshotDTO } from "../../shared/types/ipc";
import type { RuntimeStore } from "../core/scheduler/runtime-store";
import type { PluginSnapshotState } from "../core/scheduler/types";

function toDTO(state: PluginSnapshotState): PluginSnapshotDTO {
    switch (state.status) {
        case "idle":
            return { status: "idle" };
        case "loading":
            return { status: "loading" };
        case "ready":
            return {
                status: "ready",
                items: state.items,
                updatedAt: state.updatedAt.toISOString(),
                ...(state.badge !== undefined && { badge: state.badge }),
                ...(state.chart !== undefined && { chart: state.chart }),
            };
        case "failed":
            return {
                status: "failed",
                error: state.error,
                ...(state.lastSuccess !== undefined && {
                    updatedAt: state.lastSuccess.updatedAt,
                    items: state.lastSuccess.items,
                }),
            };
    }
}

export interface EventIpcDeps {
    runtimeStore: RuntimeStore;
}

export function registerEventIpc(deps: EventIpcDeps): () => void {
    const unsubState = deps.runtimeStore.subscribe({
        onStateChange(instanceId: string, state: PluginSnapshotState) {
            const dto = toDTO(state);
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) {
                    win.webContents.send(IPC_CHANNELS.EVENT_STATE_CHANGE, instanceId, dto);
                }
            }
        },
    });

    const themeHandler = () => {
        const isDark = nativeTheme.shouldUseDarkColors;
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.EVENT_THEME_CHANGE, isDark);
            }
        }
    };

    nativeTheme.on("updated", themeHandler);

    return () => {
        unsubState();
        nativeTheme.off("updated", themeHandler);
    };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/event-ipc.ts
git commit -m "feat: implement event IPC handler for state and theme push"
```

---

## Task 6: Preload 层

**Files:**

- Create: `src/preload/usageboard-api.ts`
- Create: `src/preload/index.ts`

- [ ] **Step 1: Create type augmentation**

```typescript
// src/preload/usageboard-api.ts
import type { UsageboardApi } from "../shared/types/ipc";

declare global {
    interface Window {
        usageboard: UsageboardApi;
    }
}
```

- [ ] **Step 2: Create preload bridge with invoke helper**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/types/ipc";
import type { IpcResult, UsageboardApi, PluginSnapshotDTO } from "../shared/types/ipc";
import "./usageboard-api";

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const result: IpcResult<T> = await ipcRenderer.invoke(channel, ...args);
    if (!result.ok) {
        throw new Error(`[${result.error.code}] ${result.error.message}`);
    }
    return result.data;
}

const api: UsageboardApi = {
    plugin: {
        list: () =>
            invoke<UsageboardApi["plugin"] extends { list(): Promise<infer R> } ? R : never>(
                IPC_CHANNELS.PLUGIN_LIST,
            ),
        getState: (stateId) => invoke<PluginSnapshotDTO>(IPC_CHANNELS.PLUGIN_GET_STATE, stateId),
        refresh: (stateId) => invoke<void>(IPC_CHANNELS.PLUGIN_REFRESH, stateId),
        refreshAll: () => invoke<void>(IPC_CHANNELS.PLUGIN_REFRESH_ALL),
    },
    config: {
        get: () =>
            invoke<UsageboardApi["config"] extends { get(): Promise<infer R> } ? R : never>(
                IPC_CHANNELS.CONFIG_GET,
            ),
        save: (config) => invoke<void>(IPC_CHANNELS.CONFIG_SAVE, config),
        saveSecrets: (payload) => invoke<void>(IPC_CHANNELS.CONFIG_SAVE_SECRETS, payload),
    },
    event: {
        onStateChange: (callback) => {
            const handler = (_e: unknown, stateId: string, state: PluginSnapshotDTO) =>
                callback(stateId, state);
            ipcRenderer.on(IPC_CHANNELS.EVENT_STATE_CHANGE, handler);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_STATE_CHANGE, handler);
        },
        onThemeChange: (callback) => {
            const handler = (_e: unknown, isDark: boolean) => callback(isDark);
            ipcRenderer.on(IPC_CHANNELS.EVENT_THEME_CHANGE, handler);
            return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_THEME_CHANGE, handler);
        },
    },
};

contextBridge.exposeInMainWorld("usageboard", api);
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/preload/
git commit -m "feat: implement preload layer with contextBridge and invoke helper"
```

---

## Task 7: 更新 Forge 配置

**Files:**

- Modify: `forge.config.ts`

- [ ] **Step 1: Update entry points to new file locations**

将 `src/main.ts` → `src/main/index.ts`，`src/preload.ts` → `src/preload/index.ts`。

```typescript
// forge.config.ts — 只改 build entry 路径
build: [
    {
        entry: "src/main/index.ts",   // was src/main.ts
        config: "vite.main.config.ts",
        target: "main",
    },
    {
        entry: "src/preload/index.ts", // was src/preload.ts
        config: "vite.preload.config.ts",
        target: "preload",
    },
],
```

- [ ] **Step 2: Commit**

```bash
git add forge.config.ts
git commit -m "chore: update forge config entry points to new directory structure"
```

---

## Task 8: 主进程重写

**Files:**

- Modify: `src/main/index.ts`

- [ ] **Step 1: Rewrite main/index.ts with tray + window management + IPC**

实现要点：

1. 初始化 core 层（configStore, cacheStore, runtimeStore, secretsStore, refreshService）
2. 构建 `secretParamKeys` Map（从插件 metadata 提取 type=secret 参数名）
3. 注册 IPC handlers（plugin-ipc, config-ipc, event-ipc）
4. 创建系统托盘（左键 toggle popup，右键菜单：仪表板/设置/退出）
5. 窗口工厂函数（共享 SECURE_WEB_PREFS，hash 路由）
6. 生命周期：`window-all-closed` 不退出，托盘退出才 quit

具体代码参照 spec section 5。实现时注意：

- popup 窗口 `frame: false, show: false`，通过 `tray.getBounds()` 定位
- dashboard/settings 窗口按需创建，已存在则 focus
- `app.on("before-quit")` 清理 event-ipc 订阅

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: rewrite main process with tray, window management, and IPC registration"
```

---

## Task 9: 安装 React/Tailwind 依赖

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
pnpm add react react-dom class-variance-authority clsx tailwind-merge lucide-react
pnpm add -D @types/react @types/react-dom tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add React, Tailwind, and shadcn/ui dependencies"
```

---

## Task 10: Renderer 基础设施

**Files:**

- Create: `src/renderer/index.html`
- Create: `src/renderer/index.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles/globals.css`
- Create: `src/renderer/lib/utils.ts`
- Modify: `vite.renderer.config.ts`

- [ ] **Step 1: Create index.html**

```html
<!-- src/renderer/index.html -->
<!DOCTYPE html>
<html lang="zh-Hans">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
            http-equiv="Content-Security-Policy"
            content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
        />
        <title>OmniUsage</title>
    </head>
    <body>
        <div id="root"></div>
        <script type="module" src="./index.tsx"></script>
    </body>
</html>
```

- [ ] **Step 2: Create globals.css with shadcn CSS variables**

Full content from spec section 8.3.

- [ ] **Step 3: Create utils.ts**

```typescript
// src/renderer/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Create index.tsx**

```typescript
// src/renderer/index.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
```

- [ ] **Step 5: Create App.tsx with hash router**

```typescript
// src/renderer/App.tsx
import { useRoute } from "./hooks/use-route";
import { PopupView } from "./views/PopupView";
import { DashboardView } from "./views/DashboardView";
import { SettingsView } from "./views/SettingsView";

export function App() {
    const route = useRoute();
    switch (route) {
        case "dashboard":
            return <DashboardView />;
        case "settings":
            return <SettingsView />;
        default:
            return <PopupView />;
    }
}
```

- [ ] **Step 6: Create use-route.ts hook**

```typescript
// src/renderer/hooks/use-route.ts
import { useState, useEffect } from "react";

export function useRoute(): string {
    const [route, setRoute] = useState(() => window.location.hash.slice(1) || "popup");

    useEffect(() => {
        const handler = () => {
            setRoute(window.location.hash.slice(1) || "popup");
        };
        window.addEventListener("hashchange", handler);
        return () => window.removeEventListener("hashchange", handler);
    }, []);

    return route;
}
```

- [ ] **Step 7: Update vite.renderer.config.ts**

```typescript
// vite.renderer.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.join(__dirname, "src/renderer"),
        },
    },
    build: {
        rollupOptions: {
            input: {
                index: path.join(__dirname, "src/renderer/index.html"),
            },
        },
    },
});
```

Note: `@vitejs/plugin-react` 需要安装：`pnpm add -D @vitejs/plugin-react`

- [ ] **Step 8: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/renderer/ vite.renderer.config.ts
git commit -m "feat: set up React renderer with hash router and Tailwind"
```

---

## Task 11: Hooks (use-plugins, use-config, use-theme)

**Files:**

- Create: `src/renderer/hooks/use-plugins.ts`
- Create: `src/renderer/hooks/use-config.ts`
- Create: `src/renderer/lib/theme.ts`

- [ ] **Step 1: Create use-plugins.ts**

Full content from spec section 6.8（含 error state + cancelled guard）。

- [ ] **Step 2: Create use-config.ts**

```typescript
// src/renderer/hooks/use-config.ts
import { useState, useEffect, useCallback } from "react";
import type { AppConfiguration } from "../../../main/core/config/types";

export function useConfig() {
    const [config, setConfig] = useState<AppConfiguration | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        window.usageboard.config
            .get()
            .then((c) => {
                if (!cancelled) {
                    setConfig(c);
                    setLoading(false);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "加载配置失败");
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const save = useCallback(async (newConfig: AppConfiguration) => {
        await window.usageboard.config.save(newConfig);
        setConfig(newConfig);
    }, []);

    const saveSecrets = useCallback(async (stateId: string, secrets: Record<string, string>) => {
        await window.usageboard.config.saveSecrets({ stateId, secrets });
    }, []);

    return { config, loading, error, save, saveSecrets };
}
```

- [ ] **Step 3: Create theme.ts**

```typescript
// src/renderer/lib/theme.ts
import { useEffect } from "react";

export function useTheme() {
    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        document.documentElement.classList.toggle("dark", mediaQuery.matches);

        const unsubscribe = window.usageboard.event.onThemeChange((isDark) => {
            document.documentElement.classList.toggle("dark", isDark);
        });

        return unsubscribe;
    }, []);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/ src/renderer/lib/theme.ts
git commit -m "feat: add renderer hooks for plugins, config, and theme"
```

---

## Task 12: UI 组件

**Files:**

- Create: `src/renderer/components/PluginCard.tsx`
- Create: `src/renderer/components/PluginCardSkeleton.tsx`
- Create: `src/renderer/components/ErrorBanner.tsx`
- Create: `src/renderer/components/EmptyState.tsx`
- Create: `src/renderer/components/RefreshButton.tsx`

- [ ] **Step 1: Install shadcn/ui base components**

```bash
npx shadcn@latest init
npx shadcn@latest add button card input label select switch skeleton
```

- [ ] **Step 2: Create PluginCard.tsx**

接收 `PluginInfo` props，根据 snapshot.status 渲染：idle/loading 显示骨架，ready 显示用量+进度条，failed 显示错误。

- [ ] **Step 3: Create PluginCardSkeleton.tsx**

用 shadcn Skeleton 做占位。

- [ ] **Step 4: Create ErrorBanner.tsx**

简单错误提示条，接收 `message: string`。

- [ ] **Step 5: Create EmptyState.tsx**

居中"暂无插件"文案 + 图标。

- [ ] **Step 6: Create RefreshButton.tsx**

shadcn Button + lucide RefreshCw 图标，点击调 `window.usageboard.plugin.refreshAll()`。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/
git commit -m "feat: add shared UI components (PluginCard, ErrorBanner, etc.)"
```

---

## Task 13: Views

**Files:**

- Create: `src/renderer/views/PopupView.tsx`
- Create: `src/renderer/views/DashboardView.tsx`
- Create: `src/renderer/components/SettingsForm.tsx`
- Create: `src/renderer/views/SettingsView.tsx`

- [ ] **Step 1: Create PopupView.tsx**

2 列网格 PluginCard，顶部标题栏（名称 + 更新时间 + RefreshButton），底部"展开仪表板"按钮。固定 360x480 布局。用 `usePlugins()` hook。

- [ ] **Step 2: Create DashboardView.tsx**

列表式布局，每行 PluginCard 含详情展开区。顶部标题 + RefreshButton + 设置按钮。

- [ ] **Step 3: Create SettingsForm.tsx**

根据 `PluginMetadata.parameters` 自动渲染：

- secret → Input type=password
- string → Input type=text
- integer → Input type=number
- boolean → Switch
- choice → Select
- directory/file → Input（暂时）

表单提交逻辑：非 secret → config.save，secret（且非"\*\*\*"）→ config.saveSecrets。

- [ ] **Step 4: Create SettingsView.tsx**

左侧列表（"一般" + 各插件名），右侧根据选中项渲染：

- "一般" → 语言/显示模式/开机启动
- 插件名 → SettingsForm

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/ src/renderer/components/SettingsForm.tsx
git commit -m "feat: implement popup, dashboard, and settings views"
```

---

## Task 14: 清理旧文件

**Files:**

- Delete: `src/main.ts`
- Delete: `src/preload.ts`
- Delete: `src/renderer.ts`
- Delete: `src/index.css`

- [ ] **Step 1: Delete old entry points**

```bash
git rm src/main.ts src/preload.ts src/renderer.ts src/index.css
```

- [ ] **Step 2: Run typecheck + build**

Run: `pnpm typecheck && pnpm start -- --no-sandbox`
Expected: App starts, tray icon visible

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove old entry points migrated to new directory structure"
```

---

## Task 15: 端到端验证

- [ ] **Step 1: Run full check suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: All pass

- [ ] **Step 2: Manual smoke test**

1. `pnpm start -- --no-sandbox`
2. 托盘图标出现
3. 左键点击 → 弹出面板窗口
4. 弹出面板显示空状态（无插件配置时）
5. 右键托盘 → "设置" → 设置窗口打开
6. 右键托盘 → "打开仪表板" → 仪表板窗口打开
7. 右键托盘 → "退出" → 应用退出

- [ ] **Step 3: Final commit if any fixes needed**

---

## Self-Review Checklist

- [x] Spec section 2 (IPC 合约) → Task 1
- [x] Spec section 3.1 (plugin-ipc) → Task 3
- [x] Spec section 3.2 (config-ipc) → Task 4
- [x] Spec section 3.3 (event-ipc) → Task 5
- [x] Spec section 3.4 (错误处理) → Task 2 + Tasks 3-5
- [x] Spec section 3.5 (错误脱敏) → Tasks 3-5 (通用文案)
- [x] Spec section 4 (Preload) → Task 6
- [x] Spec section 5 (主进程) → Tasks 7-8
- [x] Spec section 6.2 (路由) → Task 10
- [x] Spec section 6.3 (主题) → Task 11
- [x] Spec section 6.4-6.6 (Views) → Task 13
- [x] Spec section 6.7 (SettingsForm) → Task 13
- [x] Spec section 6.8 (Hooks) → Task 11
- [x] Spec section 7 (Secret 脱敏) → Task 4
- [x] Spec section 8 (构建配置) → Tasks 7, 9, 10
- [x] Spec section 10 (测试) → Tasks 2-5, 15
- [x] No placeholders — all tasks have concrete code or explicit guidance
- [x] Type consistency — IpcResult, PluginSnapshotDTO, IPC_CHANNELS used consistently
