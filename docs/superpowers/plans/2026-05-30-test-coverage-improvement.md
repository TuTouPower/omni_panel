# OmniUsage 测试覆盖改进实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把测试覆盖从 "插件运行时单元 + 22 个 E2E case" 提升到 "spec.md 全章节 E2E 闭环 + 7 个 bundled 插件契约覆盖 + 9 个组件真实 DOM 行为 + 关键 UI 状态视觉回归 + 打包产物自动 smoke + 外部 API 真实握手"，全程少 mock 多真实。

**外部服务测试策略（重要）：**

- **逻辑分支测试**（成功 / 缺 key / HTTP 错 / 超时 / 字段变体）一律 **stub**，本地 http server。
- **真实外部 API**：每个外部服务**全量跑时跑 1 次**，仅校验契约（exit 0 + 合法 `PluginSnapshot` shape），不断言数值。无真 key 时 `test.skip()`。
- 默认 `pnpm test` 不含真服务；新增 `pnpm test:full`（= `pnpm test` + `pnpm test:contract:live`）作为发版/全量跑入口。CI nightly 跑 `test:full`，日常 PR 只跑 `test`。

**Architecture:** 7 个独立 Task 按 ROI 排序，每个 Task 落地一类覆盖空缺。前 Task 不阻塞后 Task（除 Task 1 的 checklist 给 Task 4 提供 spec→E2E 映射依据），可并行也可串行。所有新测试纳入 `pnpm test` / `pnpm test:e2e` / `pnpm test:contract:live`，失败即门禁。

**Tech Stack:** Vitest（单元 / 集成 / 组件行为）、Playwright + Electron（E2E + 视觉回归）、`@testing-library/react` + jsdom（组件 DOM 行为）、Node `http.createServer`（真插件 HTTP 桩，沿用 `tests/integration/plugin/cpa-plugin.test.ts` 套路）。

---

## 当前覆盖快照

| 层级                    | 数量             | 主要 gap                                                                             |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `tests/unit/`           | 19 文件          | 渲染器只有 `relative-time.test.ts`                                                   |
| `tests/integration/`    | 9 文件           | 7 个插件中只有 CPA 跑了真实子进程 + HTTP 桩                                          |
| `tests/smoke/`          | 1 文件           | renderer-smoke 只覆盖 PluginCard 单一形态                                            |
| `tests/user_e2e/specs/` | 5 spec / 22 case | spec.md 多个章节零覆盖（多账号、secrets、suspend/resume、错误降级、托盘、auto-seed） |
| 视觉回归                | 0                | 无                                                                                   |
| 打包产物自动 smoke      | 0                | 仅文档要求手工跑                                                                     |

---

## File Structure

新增 / 修改：

```
docs/
  test-coverage-matrix.md                # Task 1 产出：spec 章节 ↔ 测试用例映射

tests/
  integration/plugin/
    claude-plugin.test.ts                # Task 2 新增（stub）
    codex-plugin.test.ts                 # Task 2 新增（stub）
    deepseek-plugin.test.ts              # Task 2 新增（stub）
    glm-plugin.test.ts                   # Task 2 新增（stub）
    minimax-plugin.test.ts               # Task 2 新增（stub）
    tavily-plugin.test.ts                # Task 2 新增（stub）
    _helpers/
      plugin_test_harness.ts             # Task 2 抽出的公共 spawn + 校验
      http_stub.ts                       # 通用 HTTP 桩工具
  contract_live/                         # Task 7 新增：真实 API 握手
    plugins.live.test.ts                 # 每个外部服务 1 个 case
  unit/renderer/components/
    button.test.tsx                      # Task 3 新增（共 9 个文件）
    card.test.tsx
    empty_state.test.tsx
    error_banner.test.tsx
    icon.test.tsx
    plugin_card.test.tsx                 # 取代 smoke/renderer-smoke 中的部分
    refresh_button.test.tsx
    settings_form.test.tsx
    skeleton.test.tsx
  user_e2e/
    fixtures/
      seeded_plugin.ts                   # Task 4 新增：动态注入虚拟插件
    specs/
      multi_account.spec.ts              # Task 4 新增
      plugin_failure_modes.spec.ts       # Task 4 新增
      suspend_resume.spec.ts             # Task 4 新增
      secrets_persistence.spec.ts        # Task 4 新增
      tray_interaction.spec.ts           # Task 4 新增
      auto_seed.spec.ts                  # Task 4 新增
    visual/
      popup_states.spec.ts               # Task 5 新增
      settings_states.spec.ts            # Task 5 新增
      __snapshots__/                     # Playwright 截图基线
  packaged_smoke/
    smoke.spec.ts                        # Task 6 新增：跑打包产物
    run.ts                               # Task 6 启动 packaged exe 的 driver

scripts/
  run_packaged_smoke.ts                  # Task 6 新增：CI 入口

package.json                              # Task 2-6 增加 npm scripts
playwright.config.ts                      # Task 5 加视觉回归 project
```

---

## Task 1: spec→E2E 覆盖矩阵

**Files:**

- Create: `docs/test-coverage-matrix.md`

后续 Task 4 的 E2E 用例选型依赖此矩阵。该矩阵也是后续维护时 "新加功能 → 必须更新覆盖项" 的检查清单。

- [ ] **Step 1: 解析 spec.md 章节**

抓取 `docs/spec.md` 一级和二级标题，把每个二级标题或 "可观察行为" 列为 1 行。

- [ ] **Step 2: 写矩阵骨架**

写到 `docs/test-coverage-matrix.md`：

```markdown
# OmniUsage 测试覆盖矩阵

> 每行：spec 章节 / 行为 → 覆盖的测试文件 → 状态（✅ / ⚠️ 部分 / ❌ 无）
> 修改 spec 或新增功能时，必须同步更新此表。

## 3. 插件系统

| 行为                            | E2E / 集成                                    | 状态            |
| ------------------------------- | --------------------------------------------- | --------------- |
| 3.1 `.ts` 插件被 discover       | `tests/unit/plugin/discovery.test.ts`         | ✅              |
| 3.1 `_` 前缀文件跳过            | `tests/unit/plugin/discovery.test.ts`         | ✅              |
| 3.1 esbuild 编译 + 缓存命中     | `tests/unit/plugin/compiler.test.ts`          | ✅              |
| 3.1 编译失败降级                | —                                             | ❌              |
| 3.2 元数据 80 行扫描            | `tests/unit/plugin/metadata-parser.test.ts`   | ✅              |
| 3.2 多语言 key                  | `tests/unit/plugin/metadata-parser.test.ts`   | ✅              |
| 3.3 参数 CLI 序列化             | `tests/unit/plugin/command-builder.test.ts`   | ✅              |
| 3.3 空参数跳过                  | `tests/unit/plugin/command-builder.test.ts`   | ✅              |
| 3.3 USAGEBOARD_LANGUAGE 注入    | `tests/unit/plugin/command-builder.test.ts`   | ✅              |
| 3.4 成功 JSON 解析              | `tests/unit/plugin/output-parser.test.ts`     | ✅              |
| 3.4 error JSON 解析             | `tests/unit/plugin/output-parser.test.ts`     | ✅              |
| 3.5 exit 非零 → stderr fallback | —                                             | ❌（Task 2 补） |
| 3.5 timeout 15s                 | —                                             | ❌（Task 2 补） |
| 3.6 7 个 bundled 插件真跑       | `tests/integration/plugin/cpa-plugin.test.ts` | ⚠️ 仅 CPA       |

## 4. 配置与存储

| 行为                      | 测试                                              | 状态 |
| ------------------------- | ------------------------------------------------- | ---- |
| config:save 防抖 500ms    | `tests/unit/config/config-store-debounce.test.ts` | ✅   |
| ...（按 spec.md §4 全列） |

## 5. 调度与刷新

（按 spec.md §5 全列）

## 6. UI

（按 spec.md §6 全列）

## 7. IPC

（按 spec.md §7 全列）

## 8. 安全

（按 spec.md §8 全列）

## 9-10. 测试 / 平台

（按 spec.md §9-10 全列）
```

- [ ] **Step 3: 填表**

逐条 `grep -rn "<关键字>" tests/` 找现有覆盖，标 ✅ / ⚠️ / ❌。不要漏标。空白行用 `—` 占位。

- [ ] **Step 4: 提交**

```bash
git add docs/test-coverage-matrix.md
git commit -m "docs: add test coverage matrix mapping spec to tests"
```

---

## Task 2: HTTP 层重构 + 7 个 bundled 插件 stub 集成测试

> **背景**：原计划只想给每个插件写 stub 测试，但 6 个外部插件把 URL 硬编码在源里、SDK 用全局 `fetch`、插件运行在 spawn 子进程里 → 父进程没法 monkeypatch URL，测试桩根本注入不进去。
>
> 用户裁决：**允许改业务代码**，按"最健壮 + 最可维护 + 为未来代理/自定义 baseURL 留口"重新设计；MVP 阶段无存量用户，**迁移策略 A：直接删旧配置，不写兼容代码**。
>
> 新架构核心：
>
> 1. **endpoint 注册表**：插件 metadata 声明 `endpoints: { default: "https://..." }`，URL 不再硬编码在业务代码
> 2. **三级解析优先级**：测试 env (`OMNI_PLUGIN_ENDPOINTS`) > 用户 override (`endpointOverrides`) > metadata 默认
> 3. **typed http client**：SDK 注入 `ctx.http`，返回 `Result<T, HttpError>` 判别联合，业务代码不再 try/catch + 看 `statusCode`
> 4. **代理支持**：`AppConfiguration.proxy` 通过 `OMNI_PLUGIN_PROXY` env 注入子进程，undici `ProxyAgent` 接管
> 5. **测试可注入**：harness 用 env 把桩 URL 灌进去，spawn 真子进程，不动业务代码
>
> CPA 特殊处理：`endpoints.default = null` 表示"必填无默认"，用户必须填 — 不需要特殊代码路径。

**Files (按 Phase 列出)：**

- **Phase A (schema)**：Modify `src/shared/schemas/plugin-metadata.ts`、`src/shared/types/config.ts`、`src/shared/schemas/configuration.ts`(如有)
- **Phase B (SDK)**：Create `src/plugins/sdk/http-client.ts`、`src/plugins/sdk/errors.ts`、`src/plugins/sdk/endpoints.ts`; Modify `src/plugins/sdk/define-plugin.ts`、`src/plugins/sdk/index.ts`; Delete `src/plugins/sdk/http.ts`（旧 fetchJson）
- **Phase C (plugins)**：Modify `resources/plugins/{claude,codex,deepseek,glm,minimax,tavily,cpa}-usage-plugin.ts` 7 个
- **Phase D (runtime)**：Modify `src/main/core/scheduler/refresh-service.ts`、`src/main/core/plugin/command-builder.ts`（如需）、`src/main/core/plugin/runner.ts`（env 透传）
- **Phase E (harness)**：Create `tests/integration/plugin/_helpers/{plugin_test_harness,http_stub,with_stub_backend}.ts`
- **Phase F (tests)**：Create `tests/integration/plugin/{claude,codex,deepseek,glm,minimax,tavily}-plugin.test.ts`; Modify `tests/integration/plugin/cpa-plugin.test.ts`
- **Phase G (docs)**：Modify `docs/spec.md` §3.2/§4.3、`docs/plugin-contract.md`（endpoints 字段）、`docs/test-coverage-matrix.md`（标 ✅）

**全部用 stub**（本地 http server），不打真实外部 API。spawn / compile / output-parser 不 mock。覆盖：成功路径、缺 key、HTTP 401/429/5xx、超时、非法 JSON、exit 非零。

> 真实 API 握手在 Task 7 处理，本 Task 范围内禁止任何 `fetch("https://api.deepseek.com/...")` 之类的真请求。

---

### Phase A：Schema 改动

- [ ] **A.1 plugin-metadata.ts 加 `endpoints` 字段**

```ts
// src/shared/schemas/plugin-metadata.ts
export const pluginMetadataSchema = z
    .object({
        name: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        parameters: z.array(pluginParameterMetadataSchema).optional(),
        // null = 必填无默认（如 CPA cpa_mgmt_url）；string = 官方默认 URL
        endpoints: z.record(z.string().url().nullable()).optional(),
    })
    .passthrough();
```

- [ ] **A.2 PluginConfiguration 加 `endpointOverrides`**

```ts
// src/shared/types/config.ts
export interface PluginConfiguration {
    readonly instanceId: string;
    readonly stateId: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly executablePath: string;
    readonly refreshIntervalSeconds: number;
    readonly parameterValues: Readonly<Record<string, string>>;
    readonly endpointOverrides: Readonly<Record<string, string>>; // 空对象 = 用 metadata 默认
}

export interface AppConfiguration {
    readonly schemaVersion: number;
    readonly language: AppLanguage;
    readonly overviewDisplayMode: "grouped" | "tabs";
    readonly plugins: readonly PluginConfiguration[];
    readonly launchAtLogin: boolean;
    readonly proxy?: {
        readonly url: string; // http://host:port or http://user:pass@host:port
        readonly noProxy?: readonly string[];
    };
}
```

- [ ] **A.3 同步 Zod 配置 schema**

如有 `src/shared/schemas/configuration.ts`（或同级 zod schema），同步加 `endpointOverrides`（默认 `{}`）和可选 `proxy`。auto-seed 时所有插件填 `endpointOverrides: {}`。

- [ ] **A.4 跑 typecheck**

```bash
pnpm typecheck
```

预期：会有大量 `endpointOverrides` 缺失错误（auto-seed、config-store、IPC handler），先全部加默认 `{}` 让 typecheck 通过。**不要**在此 step 改业务逻辑，只补字段。

- [ ] **A.5 提交**

```bash
git add src/shared/
git commit -m "feat(schema): add endpoints metadata, endpointOverrides config, proxy config"
```

---

### Phase B：SDK 重构

- [ ] **B.1 写 `errors.ts` — typed HttpError union**

```ts
// src/plugins/sdk/errors.ts
export type HttpError =
    | { readonly kind: "network"; readonly message: string }
    | { readonly kind: "timeout"; readonly timeoutMs: number }
    | { readonly kind: "http"; readonly status: number; readonly body: unknown }
    | { readonly kind: "invalid_json"; readonly status: number; readonly raw: string }
    | { readonly kind: "missing_endpoint"; readonly key: string };

export type Result<T, E = HttpError> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: E };
```

- [ ] **B.2 写 `endpoints.ts` — 三级解析**

```ts
// src/plugins/sdk/endpoints.ts
// 子进程启动时一次性读 env。OMNI_PLUGIN_ENDPOINTS 形如 {"default":"http://127.0.0.1:1234"}
export function resolveEndpoint(key: string, fallbackFromMetadata?: string | null): string | null {
    const envRaw = process.env["OMNI_PLUGIN_ENDPOINTS"];
    if (envRaw) {
        try {
            const map = JSON.parse(envRaw) as Record<string, string>;
            if (typeof map[key] === "string") return map[key];
        } catch {
            // 静默 — 测试环境注入错就忽略，回落到默认
        }
    }
    return fallbackFromMetadata ?? null;
}
```

> RefreshService 已经把 "用户 override overlay 在 metadata 默认上" 的结果整体写进 env（见 Phase D），所以 SDK 这里只看两层：env > metadata 兜底。

- [ ] **B.3 写 `http-client.ts` — typed client + 代理**

```ts
// src/plugins/sdk/http-client.ts
import { request, type Dispatcher, ProxyAgent } from "undici";
import type { HttpError, Result } from "./errors";
import { resolveEndpoint } from "./endpoints";

export interface HttpRequestOptions {
    readonly method?: "GET" | "POST" | "PUT" | "DELETE";
    readonly headers?: Record<string, string>;
    readonly body?: unknown; // JSON.stringify if object
    readonly timeoutMs?: number; // default 10000
    readonly query?: Record<string, string | number | boolean | undefined>;
}

export interface HttpClient {
    getJson<T>(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<T>>;
    postJson<T>(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<T>>;
    request<T>(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<T>>;
}

export function createHttpClient(metadataEndpoints?: Record<string, string | null>): HttpClient {
    const dispatcher: Dispatcher | undefined = buildProxyDispatcher();

    async function call<T>(
        endpointKey: string,
        path: string,
        opts: HttpRequestOptions = {},
    ): Promise<Result<T>> {
        const base = resolveEndpoint(endpointKey, metadataEndpoints?.[endpointKey] ?? null);
        if (!base) {
            return { ok: false, error: { kind: "missing_endpoint", key: endpointKey } };
        }
        const url = buildUrl(base, path, opts.query);
        const timeoutMs = opts.timeoutMs ?? 10_000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await request(url, {
                method: opts.method ?? "GET",
                headers: opts.headers,
                body: opts.body == null ? undefined : JSON.stringify(opts.body),
                signal: controller.signal,
                dispatcher,
            });
            const text = await res.body.text();
            let data: unknown = null;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch {
                    return {
                        ok: false,
                        error: { kind: "invalid_json", status: res.statusCode, raw: text },
                    };
                }
            }
            if (res.statusCode >= 400) {
                return { ok: false, error: { kind: "http", status: res.statusCode, body: data } };
            }
            return { ok: true, value: data as T };
        } catch (err) {
            if ((err as { name?: string }).name === "AbortError") {
                return { ok: false, error: { kind: "timeout", timeoutMs } };
            }
            return {
                ok: false,
                error: {
                    kind: "network",
                    message: err instanceof Error ? err.message : String(err),
                },
            };
        } finally {
            clearTimeout(timer);
        }
    }

    return {
        getJson: (k, p, o) => call(k, p, { ...o, method: "GET" }),
        postJson: (k, p, o) => call(k, p, { ...o, method: "POST" }),
        request: (k, p, o) => call(k, p, o),
    };
}

function buildUrl(base: string, path: string, query?: HttpRequestOptions["query"]): string {
    const baseTrimmed = base.endsWith("/") ? base.slice(0, -1) : base;
    const pathNorm = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(baseTrimmed + pathNorm);
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            if (v != null) url.searchParams.set(k, String(v));
        }
    }
    return url.toString();
}

function buildProxyDispatcher(): Dispatcher | undefined {
    const raw = process.env["OMNI_PLUGIN_PROXY"];
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as { url?: string };
        if (parsed.url) return new ProxyAgent(parsed.url);
    } catch {
        // 忽略 — 用户配置错就走直连
    }
    return undefined;
}
```

- [ ] **B.4 改 `define-plugin.ts` — 注入 `http`/`language`/`t` 到 ctx**

```ts
// src/plugins/sdk/define-plugin.ts (新版)
import type { PluginOutput } from "./result";
import { fail } from "./result";
import { createHttpClient, type HttpClient } from "./http-client";
import type { HttpError } from "./errors";
import { appLanguage, makeTranslator, type AppLanguage, type TranslateFn } from "./helpers";

export interface PluginContext {
    readonly params: Record<string, string>;
    readonly http: HttpClient;
    readonly language: AppLanguage;
    readonly t: TranslateFn;
}

export type PluginHandler = (ctx: PluginContext) => Promise<PluginOutput>;

export interface DefinePluginOptions {
    readonly metadata?: {
        readonly endpoints?: Record<string, string | null>;
    };
}

export function parseArgs(argv = process.argv.slice(2)): Record<string, string> {
    /* 不变 */
}
export function requireParam(params: Record<string, string>, key: string): string {
    /* 不变 */
}

export function definePlugin(handler: PluginHandler, options: DefinePluginOptions = {}): void {
    const params = parseArgs();
    const language = appLanguage(params);
    const ctx: PluginContext = {
        params,
        http: createHttpClient(options.metadata?.endpoints),
        language,
        t: makeTranslator(language),
    };
    handler(ctx)
        .then((result) => process.stdout.write(JSON.stringify(result)))
        .catch((err: unknown) => {
            process.stdout.write(JSON.stringify(normalizeError(err)));
        });
}

function normalizeError(err: unknown): PluginOutput {
    if (err instanceof Error) {
        if (err.message.startsWith("MISSING_PARAM:")) {
            const key = err.message.slice("MISSING_PARAM:".length);
            return fail("MISSING_PARAM", `Missing required parameter: ${key}`);
        }
        return fail("PLUGIN_ERROR", err.message);
    }
    return fail("PLUGIN_ERROR", String(err));
}

// 给业务代码用的便捷工具：HttpError → PluginFailureOutput
export function failFromHttp(err: HttpError, contextLabel?: string): PluginOutput {
    const prefix = contextLabel ? `${contextLabel}: ` : "";
    switch (err.kind) {
        case "network":
            return fail("NETWORK_ERROR", `${prefix}${err.message}`);
        case "timeout":
            return fail("TIMEOUT", `${prefix}request exceeded ${String(err.timeoutMs)}ms`);
        case "http":
            return fail(`HTTP_${String(err.status)}`, `${prefix}HTTP ${String(err.status)}`);
        case "invalid_json":
            return fail("INVALID_RESPONSE", `${prefix}invalid JSON (status ${String(err.status)})`);
        case "missing_endpoint":
            return fail("MISSING_ENDPOINT", `${prefix}endpoint "${err.key}" not configured`);
    }
}
```

- [ ] **B.5 改 `index.ts` 公共出口**

```ts
// src/plugins/sdk/index.ts
export { definePlugin, parseArgs, requireParam, failFromHttp } from "./define-plugin";
export type { PluginContext, PluginHandler, DefinePluginOptions } from "./define-plugin";
export { ok, fail } from "./result";
export type {
    PluginOutput,
    PluginSuccessOutput,
    PluginFailureOutput,
    UsageItem,
    PluginChart,
} from "./result";
export type { HttpClient, HttpRequestOptions } from "./http-client";
export type { HttpError, Result } from "./errors";
export { statusFor, colorFor, colorForPct, makeTranslator, appLanguage, numeric } from "./helpers";
export type { TranslateFn, AppLanguage } from "./helpers";
// 不再 export: fetchJson, PluginHttpError
```

- [ ] **B.6 删 `src/plugins/sdk/http.ts`**

```bash
git rm src/plugins/sdk/http.ts
```

- [ ] **B.7 装 undici（如未在依赖）+ typecheck**

```bash
pnpm add undici
pnpm typecheck
```

预期：所有插件源（`resources/plugins/*.ts`）报错 `fetchJson / PluginHttpError` 找不到 — 留给 Phase C 修。

- [ ] **B.8 提交**

```bash
git add src/plugins/sdk/ package.json pnpm-lock.yaml
git commit -m "feat(sdk): typed http client with endpoint registry and proxy support"
```

---

### Phase C：7 个插件重写

每个插件按统一模式重写：① metadata 加 `endpoints`；② 业务代码用 `ctx.http.getJson("default", "/path", { headers })`；③ 错误用 `failFromHttp(result.error, "label")`。

- [ ] **C.1 重写 DeepSeek 作为参考实现**

```ts
// resources/plugins/deepseek-usage-plugin.ts (节选)
// UsageBoardPlugin:
// {
//   "name@en": "DeepSeek",
//   "name@zh-Hans": "DeepSeek",
//   "parameters": [
//     { "name": "api_key", "label": "API Key", "type": "secret", "required": true }
//   ],
//   "endpoints": {
//     "default": "https://api.deepseek.com"
//   }
// }
// /UsageBoardPlugin

import { definePlugin, ok, fail, failFromHttp, requireParam } from "../../src/plugins/sdk";

const METADATA_ENDPOINTS = { default: "https://api.deepseek.com" };

definePlugin(
    async (ctx) => {
        const apiKey = requireParam(ctx.params, "api_key");
        const result = await ctx.http.getJson<DeepSeekBalanceResp>("default", "/user/balance", {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!result.ok) return failFromHttp(result.error, "deepseek");
        // ...构造 items
        return ok({
            items: [
                /* ... */
            ],
        });
    },
    { metadata: { endpoints: METADATA_ENDPOINTS } },
);

interface DeepSeekBalanceResp {
    /* ... */
}
```

- [ ] **C.2 跑 typecheck + 编译该插件**

```bash
pnpm typecheck
npx esbuild resources/plugins/deepseek-usage-plugin.ts --bundle --platform=node --format=cjs --outfile=.cache/deepseek.test.cjs
```

预期：通过。

- [ ] **C.3 重写其余 5 个外部插件**

按 C.1 模式改 `glm / minimax / tavily / claude / codex`。Claude / Codex 读本地文件，**不声明 endpoint**（`endpoints` 字段省略），保留原逻辑（fs + JSON）。

- [ ] **C.4 重写 CPA**

- metadata：`"endpoints": { "default": null }` — 表示必填无默认
- 删除 `cpa_mgmt_url` 这个 parameter（迁移策略 A，直接删）
- 业务代码 `ctx.http.getJson("default", "/v0/management/auth-files", { headers: { "X-Mgmt-Key": key } })`
- UI 上"CPA URL"成为 `endpointOverrides.default` 输入框（Settings 渲染由 Task 3 处理）

- [ ] **C.5 跑现有 CPA 集成测试**

```bash
npx vitest run tests/integration/plugin/cpa-plugin.test.ts
```

预期：会挂（参数名变 + URL 来源变），先记下来；Phase F 重写。

- [ ] **C.6 提交**

```bash
git add resources/plugins/
git commit -m "refactor(plugins): all 7 bundled plugins use typed http client and endpoint registry"
```

---

### Phase D：RefreshService 注入 env

- [ ] **D.1 添加 endpoint 解析工具**

```ts
// src/main/core/scheduler/endpoint-resolver.ts (新文件)
import type { PluginMetadata } from "../../../shared/schemas/plugin-metadata";
import type { PluginConfiguration, AppConfiguration } from "../../../shared/types/config";

export interface ResolvedRuntimeEnv {
    readonly endpoints?: string; // JSON serialized
    readonly proxy?: string; // JSON serialized
}

export function resolveRuntimeEnv(
    metadata: PluginMetadata,
    pluginConfig: PluginConfiguration,
    appConfig: AppConfiguration,
): ResolvedRuntimeEnv {
    const merged: Record<string, string> = {};
    const defaults = metadata.endpoints ?? {};
    for (const [k, v] of Object.entries(defaults)) {
        if (typeof v === "string") merged[k] = v;
    }
    for (const [k, v] of Object.entries(pluginConfig.endpointOverrides)) {
        if (v && v.trim()) merged[k] = v.trim();
    }
    const out: ResolvedRuntimeEnv = {};
    if (Object.keys(merged).length > 0) out.endpoints = JSON.stringify(merged);
    if (appConfig.proxy?.url) out.proxy = JSON.stringify(appConfig.proxy);
    return out;
}
```

- [ ] **D.2 RefreshService 调用 → 通过 command.env 传**

`command-builder` 已经返回 `PluginCommand`；扩展其 `env` 字段，把 `OMNI_PLUGIN_ENDPOINTS` / `OMNI_PLUGIN_PROXY` 塞进去。如 `PluginCommand` 没有 `env` 字段，加上。`runner.ts` 已经 `...command.env` 展开，无需改。

```ts
// refresh-service.ts 内构造 command 处
const runtimeEnv = resolveRuntimeEnv(metadata, pluginConfig, appConfig);
const command = commandBuilder(executablePath, parameterValues, language);
const commandWithEnv = {
    ...command,
    env: {
        ...(command.env ?? {}),
        ...(runtimeEnv.endpoints ? { OMNI_PLUGIN_ENDPOINTS: runtimeEnv.endpoints } : {}),
        ...(runtimeEnv.proxy ? { OMNI_PLUGIN_PROXY: runtimeEnv.proxy } : {}),
    },
};
```

- [ ] **D.3 单元测试 `endpoint-resolver`**

```ts
// tests/unit/scheduler/endpoint-resolver.test.ts
// 覆盖：① 仅 metadata 默认；② override 覆盖默认；③ 空 override 不覆盖；④ null default + override 给值 = OK；⑤ null default + 无 override = key 不出现；⑥ proxy 出现/不出现
```

- [ ] **D.4 跑 + 提交**

```bash
pnpm typecheck && npx vitest run tests/unit/scheduler/endpoint-resolver.test.ts
```

```bash
git add src/main/core/scheduler/ tests/unit/scheduler/
git commit -m "feat(scheduler): inject endpoint registry and proxy into plugin subprocess env"
```

---

### Phase E：测试 harness

- [ ] **E.1 `plugin_test_harness.ts`**

跟原计划同款，但额外接收 `env` 参数并透传到 `executePlugin`：

```ts
export interface PluginRunOptions {
    readonly pluginFile: string;
    readonly params: Record<string, string>;
    readonly env?: Record<string, string>; // OMNI_PLUGIN_ENDPOINTS / OMNI_PLUGIN_PROXY
    readonly timeoutMs?: number;
    readonly language?: "zh-Hans" | "en";
}

export async function runBundledPlugin(opts: PluginRunOptions) {
    // ...compile（同原计划）
    const command = buildPluginCommand(
        compileResult.executablePath,
        opts.params,
        opts.language ?? "zh-Hans",
        process.execPath,
    );
    const commandWithEnv = { ...command, env: { ...(command.env ?? {}), ...(opts.env ?? {}) } };
    const exec = await executePlugin(commandWithEnv, { timeoutMs: opts.timeoutMs ?? 15000 });
    const parsed = parsePluginResult(exec.stdout, exec.stderr, exec.exitCode);
    return { exec, parsed };
}
```

- [ ] **E.2 `http_stub.ts`**

同原计划（本地 `http.createServer`，路由匹配，返回 `{ baseUrl, calls }`）。

- [ ] **E.3 `with_stub_backend.ts` — 高层封装**

```ts
// tests/integration/plugin/_helpers/with_stub_backend.ts
import { withHttpStub, type HttpStubRoute } from "./http_stub";
import { runBundledPlugin, type PluginRunOptions } from "./plugin_test_harness";

export interface StubBackendOptions extends Omit<PluginRunOptions, "env"> {
    readonly endpointKey?: string; // 默认 "default"
    readonly routes: HttpStubRoute[];
}

export async function runWithStubBackend(opts: StubBackendOptions) {
    return withHttpStub(opts.routes, async (baseUrl, calls) => {
        const env = {
            OMNI_PLUGIN_ENDPOINTS: JSON.stringify({ [opts.endpointKey ?? "default"]: baseUrl }),
        };
        const result = await runBundledPlugin({ ...opts, env });
        return { ...result, baseUrl, calls };
    });
}
```

业务测试只需调 `runWithStubBackend({ pluginFile, params, routes })`，URL 注入自动完成。

- [ ] **E.4 提交**

```bash
git add tests/integration/plugin/_helpers/
git commit -m "test(harness): plugin subprocess harness with stub backend env injection"
```

---

### Phase F：7 个插件测试

每个插件文件覆盖 **6 个 case**：① 成功；② 缺必填参数；③ HTTP 401（auth fail）；④ HTTP 429（rate limit）；⑤ HTTP 500；⑥ 超时。

- [ ] **F.1 DeepSeek 示例**

```ts
// tests/integration/plugin/deepseek-plugin.test.ts
import { describe, it, expect } from "vitest";
import { runWithStubBackend } from "./_helpers/with_stub_backend";
import { runBundledPlugin } from "./_helpers/plugin_test_harness";

describe("deepseek-usage-plugin", () => {
    it("成功返回 balance items", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "deepseek-usage-plugin.ts",
            params: { api_key: "sk-test" },
            routes: [
                {
                    path: /\/user\/balance/,
                    body: {
                        is_available: true,
                        balance_infos: [
                            /* ... */
                        ],
                    },
                },
            ],
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.items.length).toBeGreaterThan(0);
    });

    it("缺 api_key 返回 MISSING_PARAM", async () => {
        const { parsed } = await runBundledPlugin({
            pluginFile: "deepseek-usage-plugin.ts",
            params: {},
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.errorCode).toBe("MISSING_PARAM");
    });

    it("HTTP 401 → HTTP_401", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "deepseek-usage-plugin.ts",
            params: { api_key: "bad" },
            routes: [{ path: /\/user\/balance/, status: 401, body: { error: "unauthorized" } }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.errorCode).toBe("HTTP_401");
    });

    it("HTTP 429 → HTTP_429", async () => {
        /* ... */
    });
    it("HTTP 500 → HTTP_500", async () => {
        /* ... */
    });

    it("超时 → TIMEOUT", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: "deepseek-usage-plugin.ts",
            params: { api_key: "sk-test" },
            timeoutMs: 2000,
            routes: [{ path: /\/user\/balance/, delayMs: 5000, body: {} }],
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) expect(parsed.errorCode).toMatch(/TIMEOUT|HTTP_/);
    });
});
```

> 注：`parsePluginResult` 返回 `PluginResult`，其 `success` 是 boolean 字段（不是 `kind`），见 `src/main/core/plugin/output-parser.ts`。

- [ ] **F.2 跑示例验证**

```bash
npx vitest run tests/integration/plugin/deepseek-plugin.test.ts
```

Expected: 6 PASS。

- [ ] **F.3 复制套路写 GLM / MiniMax / Tavily**

按 F.1 模板，每个 6 case。

- [ ] **F.4 Claude / Codex — 文件桩**

不走 HTTP，用 `mkdtempSync` 造 `~/.claude/...` 假目录，通过 `env.HOME` / `env.USERPROFILE` 注入：

```ts
const fakeHome = mkdtempSync(join(tmpdir(), "claude-test-"));
// 写入假 config / token 文件
const { parsed } = await runBundledPlugin({
    pluginFile: "claude-usage-plugin.ts",
    params: {},
    env: { HOME: fakeHome, USERPROFILE: fakeHome },
});
```

每插件至少 4 case：成功、缺文件、文件损坏、字段缺失。

- [ ] **F.5 CPA 迁到新 harness**

把现有 `tests/integration/plugin/cpa-plugin.test.ts` 的 `withCpaServer` 全部换成 `runWithStubBackend`，参数 `cpa_mgmt_url` 删除（URL 由 env 注入），加 `cpa_mgmt_key` 即可。原有 case 数（≥3 个）全部保留并补齐到 6 case。

- [ ] **F.6 全量跑**

```bash
pnpm test
```

Expected: 新增 ~36 case 全 PASS（6 HTTP 插件 × 6 + 2 文件插件 × 4 + CPA ≥ 6）。

- [ ] **F.7 提交**

```bash
git add tests/integration/plugin/
git commit -m "test: stub integration tests for all 7 bundled plugins (real subprocess)"
```

---

### Phase G：文档同步

- [ ] **G.1 `docs/plugin-contract.md`** — 加 `endpoints` 字段、env 注入规则、`HttpClient` API
- [ ] **G.2 `docs/spec.md`** §3.2 (metadata 新字段)、§4.3 (PluginConfiguration `endpointOverrides`)、§4 顶层 (AppConfiguration `proxy`)
- [ ] **G.3 `docs/test-coverage-matrix.md`** — §3.6 7 个 bundled 插件全部从 ⚠️/❌ 改 ✅
- [ ] **G.4 `CLAUDE.md`** — 如有 "插件不能改业务代码" 类约束，更新为新 SDK API 示例
- [ ] **G.5 提交**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: sync plugin contract, spec, coverage matrix with new http architecture"
```

---

## Task 3: 9 个组件真实 DOM 行为测试

**Files:**

- Create: `tests/unit/renderer/components/{button,card,empty_state,error_banner,icon,plugin_card,refresh_button,settings_form,skeleton}.test.tsx`
- Modify: `tests/smoke/renderer-smoke.test.tsx`（精简：保留多组件协同 smoke，组件级行为迁出）
- Modify: `vitest.config.ts`（如未启用 jsdom 环境，确保 `tests/unit/renderer/**` 用 jsdom）

每个组件覆盖：默认渲染、props 变体、用户事件（click / hover / focus / change）、a11y role / aria 属性、disabled / loading / error 状态。**不用浅渲染**，用 `@testing-library/react` + `userEvent`。

- [ ] **Step 1: 装包（如缺）**

```bash
pnpm add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: 写 `refresh_button.test.tsx`（示例）**

```tsx
// tests/unit/renderer/components/refresh_button.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefreshButton } from "../../../../src/renderer/components/RefreshButton";

describe("RefreshButton", () => {
    it("renders with title and icon", () => {
        render(<RefreshButton onClick={() => {}} loading={false} />);
        expect(screen.getByRole("button")).toBeVisible();
    });

    it("calls onClick when clicked", async () => {
        const fn = vi.fn();
        const user = userEvent.setup();
        render(<RefreshButton onClick={fn} loading={false} />);
        await user.click(screen.getByRole("button"));
        expect(fn).toHaveBeenCalledOnce();
    });

    it("is disabled when loading", () => {
        render(<RefreshButton onClick={() => {}} loading={true} />);
        expect(screen.getByRole("button")).toBeDisabled();
    });

    it("shows spinning animation when loading", () => {
        render(<RefreshButton onClick={() => {}} loading={true} />);
        // 用 data-loading 或 className 断言
        expect(screen.getByRole("button")).toHaveAttribute("data-loading", "true");
    });
});
```

> 实际 props 接口以 `src/renderer/components/RefreshButton.tsx` 为准，先 Read 文件再写测试。如组件未暴露 `data-loading`，加一个不影响视觉的属性，否则用 className 断言。**优先改测试不改组件**，仅当无可观测属性时才动组件。

- [ ] **Step 3: 跑示例**

```bash
npx vitest run tests/unit/renderer/components/refresh_button.test.tsx
```

Expected: 4 PASS。

- [ ] **Step 4: 写其余 8 个**

按 `src/renderer/components/` 逐文件 Read → 写测试。每个文件覆盖至少 3 个 case（默认 + 1 个变体 + 1 个交互）。**PluginCard 必须覆盖 4 状态**：idle / loading / ready / failed，每个状态断言 DOM 关键元素和阈值颜色（>=75% yellow，>=90% red）。

- [ ] **Step 5: 精简 smoke**

打开 `tests/smoke/renderer-smoke.test.tsx`，删除单组件断言（已迁出），保留 "多组件 + IPC mock 协同 mount" 的 smoke。

- [ ] **Step 6: 全量跑 + 提交**

```bash
pnpm test
```

```bash
git add tests/unit/renderer/components/ tests/smoke/
git commit -m "test: component DOM behavior tests with testing-library"
```

---

## Task 4: E2E spec 章节空缺补齐

**Files:**

- Create: `tests/user_e2e/fixtures/seeded_plugin.ts`
- Create: `tests/user_e2e/specs/multi_account.spec.ts`
- Create: `tests/user_e2e/specs/plugin_failure_modes.spec.ts`
- Create: `tests/user_e2e/specs/suspend_resume.spec.ts`
- Create: `tests/user_e2e/specs/secrets_persistence.spec.ts`
- Create: `tests/user_e2e/specs/tray_interaction.spec.ts`
- Create: `tests/user_e2e/specs/auto_seed.spec.ts`
- Modify: `tests/user_e2e/fixtures/app_fixture.ts`（暴露 `userPluginDir` / `userDataDir` 给 spec，便于注入虚拟插件）

依赖 Task 1 矩阵确认 gap。所有 spec 走真实 UI 视角，不调 `electronAPI` 后门。

- [ ] **Step 1: 写 `seeded_plugin.ts` fixture**

```ts
// tests/user_e2e/fixtures/seeded_plugin.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function seedFakePlugin(
    userPluginDir: string,
    spec: {
        name: string;
        items: Array<{ id: string; name: string; used: number; limit: number }>;
        behavior?: "ok" | "error" | "slow" | "crash";
    },
): string {
    mkdirSync(userPluginDir, { recursive: true });
    const file = join(userPluginDir, `${spec.name}.ts`);
    const meta = `// UsageBoardPlugin:\n// { "name": "${spec.name}", "parameters": [] }\n// /UsageBoardPlugin\n`;
    const body =
        spec.behavior === "error"
            ? `console.log(JSON.stringify({ error: "fake error" }));`
            : spec.behavior === "crash"
              ? `process.exit(2);`
              : spec.behavior === "slow"
                ? `setTimeout(() => {}, 60_000);`
                : `console.log(JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items: ${JSON.stringify(spec.items)} }));`;
    writeFileSync(file, meta + body);
    return file;
}
```

- [ ] **Step 2: 改 `app_fixture.ts` 暴露目录**

让 `AppFixture` 接受 `{ userPluginDir?, userDataDir? }`，启动 Electron 时设置对应 env / 命令行参数。如已支持，跳过。

- [ ] **Step 3: 写 `plugin_failure_modes.spec.ts`**

```ts
import { test, expect } from "../fixtures/test";
import { seedFakePlugin } from "../fixtures/seeded_plugin";

test.describe("plugin failure modes", () => {
    test("error JSON shows error banner with message", async ({ omni }) => {
        seedFakePlugin(omni.userPluginDir, { name: "fake-err", items: [], behavior: "error" });
        await omni.restart();
        const page = await omni.app.firstWindow();
        await expect(page.getByText(/fake error/)).toBeVisible({ timeout: 10_000 });
    });

    test("crash (exit 2) shows failed state with stderr message", async ({ omni }) => {
        seedFakePlugin(omni.userPluginDir, { name: "fake-crash", items: [], behavior: "crash" });
        await omni.restart();
        const page = await omni.app.firstWindow();
        await expect(page.locator("[data-state='failed']")).toBeVisible({ timeout: 10_000 });
    });

    test("timeout after 15s shows timeout error", async ({ omni }) => {
        seedFakePlugin(omni.userPluginDir, { name: "fake-slow", items: [], behavior: "slow" });
        await omni.restart();
        const page = await omni.app.firstWindow();
        await expect(page.getByText(/timeout|超时/i)).toBeVisible({ timeout: 20_000 });
    });
});
```

> `omni.restart()` 在 `AppFixture` 没暴露的话，本步前先加。`data-state` 属性如组件未加，需在 `PluginCard` 顶层节点添加（一次性 testability 改动）。

- [ ] **Step 4: 写其余 5 个 spec**

- `multi_account.spec.ts`：用 `seedFakePlugin` 注入两个同名 plugin，断言 displayName 自动去重加序号；CPA 多 item 卡片渲染。
- `suspend_resume.spec.ts`：触发 `powerMonitor` `suspend` / `resume` 事件（通过 Electron remote 或 `--test-power-event` 命令行），断言定时器被取消 + 恢复后立即触发刷新。
- `secrets_persistence.spec.ts`：在 Settings 填 secret → 重启 App → 断言 secret 仍生效（通过插件能拿到对应 header）。**不在 UI 显示明文**断言。
- `tray_interaction.spec.ts`：E2E 模式下托盘默认跳过，需加 `--with-tray` 启动参数；断言左键 toggle、右键菜单。如平台不支持，标 skip 并写 reason。
- `auto_seed.spec.ts`：清空 config，启动 → 断言所有 bundled 插件都生成了默认 PluginConfiguration。

- [ ] **Step 5: 跑全量 E2E**

```bash
pnpm test:e2e
```

Expected: 原 22 case + 新增 ~15 case 全 PASS。失败用例先修，不要 skip。

- [ ] **Step 6: 提交**

```bash
git add tests/user_e2e/
git commit -m "test: e2e coverage for failure modes, multi-account, suspend/resume, tray, auto-seed"
```

---

## Task 5: 视觉回归基线

**Files:**

- Create: `tests/user_e2e/visual/popup_states.spec.ts`
- Create: `tests/user_e2e/visual/settings_states.spec.ts`
- Modify: `playwright.config.ts`（新增 `visual` project，配置 `toHaveScreenshot` 阈值 `maxDiffPixelRatio: 0.02`）
- Modify: `package.json`（加 `test:visual` 和 `test:visual:update`）

只跑本地基线，不上 CI（跨平台字体差异大）。每次 UI 改动前手动 `pnpm test:visual:update` 刷新基线，PR 时人工对比 diff。

- [ ] **Step 1: 改 playwright.config.ts**

```ts
projects: [
    // ...existing
    {
        name: "visual",
        testDir: "./tests/user_e2e/visual",
        use: { /* ... */ },
        expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.2 } },
    },
],
```

- [ ] **Step 2: 写 `popup_states.spec.ts`**

```ts
import { test, expect } from "../fixtures/test";
import { seedFakePlugin } from "../fixtures/seeded_plugin";

test.describe("popup visual states", () => {
    test("empty: 无插件", async ({ omni }) => {
        // 清空 user plugin dir + disable bundled plugins via config
        const page = await omni.app.firstWindow();
        await expect(page).toHaveScreenshot("popup-empty.png");
    });

    test("loading: 全部加载中", async ({ omni }) => {
        seedFakePlugin(omni.userPluginDir, { name: "slow", items: [], behavior: "slow" });
        await omni.restart();
        const page = await omni.app.firstWindow();
        await expect(page).toHaveScreenshot("popup-loading.png");
    });

    test("ready: 多卡片含进度条", async ({ omni }) => {
        seedFakePlugin(omni.userPluginDir, {
            name: "ok-1",
            items: [{ id: "a", name: "用量", used: 30, limit: 100 }],
        });
        seedFakePlugin(omni.userPluginDir, {
            name: "ok-2",
            items: [{ id: "b", name: "余额", used: 95, limit: 100 }],
        });
        await omni.restart();
        const page = await omni.app.firstWindow();
        await page.waitForSelector("[data-state='ready']", { timeout: 10_000 });
        await expect(page).toHaveScreenshot("popup-ready.png");
    });

    test("failed: 错误态", async ({ omni }) => {
        seedFakePlugin(omni.userPluginDir, { name: "err", items: [], behavior: "error" });
        await omni.restart();
        const page = await omni.app.firstWindow();
        await page.waitForSelector("[data-state='failed']", { timeout: 10_000 });
        await expect(page).toHaveScreenshot("popup-failed.png");
    });
});
```

- [ ] **Step 3: 写 `settings_states.spec.ts`**

覆盖：侧栏空 / 侧栏多插件 / 表单含 secret 输入 / 复制按钮 hover 态。

- [ ] **Step 4: 生成基线**

```bash
pnpm test:visual:update
```

检查 `tests/user_e2e/visual/__snapshots__/` 内 PNG 是否符合预期（人工对照 `docs/design/omni-usage/project/`）。

- [ ] **Step 5: 跑 + 提交**

```bash
pnpm test:visual
```

Expected: 全 PASS（用刚生成的基线比对）。

```bash
git add playwright.config.ts package.json tests/user_e2e/visual/
git commit -m "test: visual regression baseline for popup and settings states"
```

---

## Task 6: 打包产物自动 smoke

**Files:**

- Create: `tests/packaged_smoke/smoke.spec.ts`
- Create: `tests/packaged_smoke/run.ts`
- Create: `scripts/run_packaged_smoke.ts`
- Modify: `package.json`（加 `test:packaged`：先 `pnpm package` 再跑 packaged smoke）
- Modify: `playwright.config.ts`（新增 `packaged` project，executablePath 指向 `dist/OmniUsage-win32-x64/OmniUsage.exe`）

之前的踩坑：dev 跑通 packaged 白屏（GPU / 路径 / extraResource）。这是最关键的一层。

- [ ] **Step 1: 写 driver `run.ts`**

```ts
// tests/packaged_smoke/run.ts
import { _electron, type ElectronApplication } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGED_EXE = {
    win32: resolve("dist/OmniUsage-win32-x64/OmniUsage.exe"),
    darwin: resolve("dist/OmniUsage-darwin-arm64/OmniUsage.app/Contents/MacOS/OmniUsage"),
    linux: resolve("dist/OmniUsage-linux-x64/OmniUsage"),
}[process.platform];

export async function launchPackaged(): Promise<ElectronApplication> {
    if (!PACKAGED_EXE || !existsSync(PACKAGED_EXE)) {
        throw new Error(`packaged binary not found: ${PACKAGED_EXE}. Run 'pnpm package' first.`);
    }
    return _electron.launch({ executablePath: PACKAGED_EXE, env: { ...process.env, E2E: "1" } });
}
```

- [ ] **Step 2: 写 smoke spec**

```ts
// tests/packaged_smoke/smoke.spec.ts
import { test, expect } from "@playwright/test";
import { launchPackaged } from "./run";

test("packaged app launches without white screen", async () => {
    const app = await launchPackaged();
    try {
        const page = await app.firstWindow();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.getByText("OmniUsage")).toBeVisible({ timeout: 15_000 });
        // 渲染进程没崩
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.waitForTimeout(2000);
        expect(errors).toEqual([]);
    } finally {
        await app.close();
    }
});

test("bundled plugins discovered from extraResource", async () => {
    const app = await launchPackaged();
    try {
        const page = await app.firstWindow();
        await page.waitForLoadState("domcontentloaded");
        // 至少 1 个 PluginCard 出现（不要求 ready，因 secret 未配）
        await expect(page.locator("[data-component='plugin-card']").first()).toBeVisible({
            timeout: 15_000,
        });
    } finally {
        await app.close();
    }
});
```

- [ ] **Step 3: 加 npm script**

`package.json`:

```json
"test:packaged": "pnpm package && playwright test --config=playwright.config.ts --project=packaged"
```

- [ ] **Step 4: 改 `playwright.config.ts`**

加 `packaged` project，testDir 指向 `tests/packaged_smoke`。

- [ ] **Step 5: 跑**

```bash
pnpm test:packaged
```

Expected: 2 case PASS。如失败必须修，**不能 skip**——这是 Task 5 文档里反复强调过的红线。

- [ ] **Step 6: 提交**

```bash
git add tests/packaged_smoke/ scripts/ playwright.config.ts package.json
git commit -m "test: automated packaged binary smoke for white-screen & plugin discovery"
```

---

## Task 7: 外部 API 真实握手契约测试

**Files:**

- Create: `tests/contract_live/plugins.live.test.ts`
- Create: `tests/contract_live/README.md`（说明 env 变量和跑法）
- Modify: `package.json`（加 `test:contract:live` 和 `test:full`）
- Modify: `vitest.config.ts`（默认排除 `tests/contract_live/**`，避免 `pnpm test` 误跑）
- Modify: `.github/workflows/`（如有 CI；新增 nightly job 跑 `test:full`）

**目的**：每个外部服务**跑一次真实 API**，握手契约。stub 测试无法发现的"字段改名、路径迁移、auth 流程变更"在这里被抓到。**不断言数值**（用量每次都变），只断言 shape。

**何时跑**：

- `pnpm test` — **不跑**（默认 exclude，避免日常迭代受 rate limit / 网络 / 密钥影响）
- `pnpm test:contract:live` — 单独跑真服务
- `pnpm test:full` — `pnpm test` + `pnpm test:contract:live`（发版 / nightly / 用户主动全量跑）

**密钥来源**：环境变量。缺 key 时 `test.skip()` 而非 fail，确保无 key 环境也能跑 `test:full`。

- [ ] **Step 1: 改 `vitest.config.ts` 默认排除**

```ts
test: {
    // ...existing
    exclude: [...configDefaults.exclude, "tests/contract_live/**"],
},
```

- [ ] **Step 2: 写 `plugins.live.test.ts`**

```ts
// tests/contract_live/plugins.live.test.ts
import { describe, it, expect } from "vitest";
import { runBundledPlugin } from "../integration/plugin/_helpers/plugin_test_harness";

interface LivePluginCase {
    readonly pluginFile: string;
    readonly envKeyVar: string; // 环境变量名
    readonly paramName: string; // 插件 secret 参数名
    readonly extraParams?: Record<string, string>;
}

const LIVE_CASES: LivePluginCase[] = [
    { pluginFile: "deepseek-usage-plugin.ts", envKeyVar: "DEEPSEEK_API_KEY", paramName: "api_key" },
    { pluginFile: "glm-usage-plugin.ts", envKeyVar: "GLM_API_KEY", paramName: "api_key" },
    { pluginFile: "minimax-usage-plugin.ts", envKeyVar: "MINIMAX_API_KEY", paramName: "api_key" },
    { pluginFile: "tavily-usage-plugin.ts", envKeyVar: "TAVILY_API_KEY", paramName: "api_key" },
    {
        pluginFile: "cpa-usage-plugin.ts",
        envKeyVar: "CPA_MGMT_KEY",
        paramName: "cpa_mgmt_key",
        extraParams: { cpa_mgmt_url: process.env["CPA_MGMT_URL"] ?? "" },
    },
    // Claude / Codex 读本地文件，不打外网；不在此列。
    // 如需校验本地数据存在，单独写本地契约 case。
];

describe("live contract: external APIs handshake", () => {
    for (const c of LIVE_CASES) {
        const key = process.env[c.envKeyVar];
        const t = key ? it : it.skip;
        t(
            `${c.pluginFile} returns valid PluginSnapshot or error JSON`,
            async () => {
                const { parsed, exec } = await runBundledPlugin({
                    pluginFile: c.pluginFile,
                    params: { [c.paramName]: key ?? "", ...(c.extraParams ?? {}) },
                    timeoutMs: 30_000,
                });

                // 契约断言：要么合法 snapshot，要么合法 error JSON
                expect(["snapshot", "error"]).toContain(parsed.kind);
                expect(exec.exitCode).toBe(0);

                if (parsed.kind === "snapshot") {
                    // shape only — 不断言数值
                    expect(parsed.snapshot.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
                    expect(Array.isArray(parsed.snapshot.items)).toBe(true);
                    for (const item of parsed.snapshot.items) {
                        expect(typeof item.id).toBe("string");
                        expect(typeof item.name).toBe("string");
                        expect(typeof item.used).toBe("number");
                        expect(typeof item.limit).toBe("number");
                        expect(["percent", "ratio"]).toContain(item.displayStyle);
                        expect(["normal", "warning", "critical", "unknown"]).toContain(item.status);
                    }
                } else {
                    expect(typeof parsed.error).toBe("string");
                    expect(parsed.error.length).toBeGreaterThan(0);
                }
            },
            60_000,
        );
    }
});
```

- [ ] **Step 3: 写 `README.md`**

````markdown
# 真实 API 契约测试

每次"全量跑"（`pnpm test:full`）打 1 次真实外部 API，校验契约 shape，**不断言数值**。

## 环境变量

| 变量                            | 必需？ | 说明             |
| ------------------------------- | ------ | ---------------- |
| `DEEPSEEK_API_KEY`              | 可选   | 缺则该 case skip |
| `GLM_API_KEY`                   | 可选   | 同上             |
| `MINIMAX_API_KEY`               | 可选   | 同上             |
| `TAVILY_API_KEY`                | 可选   | 同上             |
| `CPA_MGMT_KEY` + `CPA_MGMT_URL` | 可选   | 同上             |

## 跑法

```bash
# 仅真实 API
pnpm test:contract:live

# 全量（stub + 真实）
pnpm test:full
```
````

## 何时挂

- 真实 API 字段改名 / 路径迁移 / auth 变更 — 这是它的本职工作
- rate limit 429 / 网络抖动 — 重试 1 次再失败；不要静默跳过

````

- [ ] **Step 4: 改 `package.json`**

```json
"test": "vitest run",
"test:contract:live": "vitest run --config vitest.config.ts tests/contract_live",
"test:full": "pnpm test && pnpm test:contract:live"
````

> `test:contract:live` 显式指向 `tests/contract_live`，覆盖 vitest exclude。

- [ ] **Step 5: 本地跑（至少配 1 个 key 验证不 skip 全部）**

```bash
DEEPSEEK_API_KEY=sk-xxx pnpm test:contract:live
```

Expected: DeepSeek case PASS，其余 skip。

```bash
pnpm test:contract:live
```

Expected: 全 skip（无 key），无 fail。

```bash
pnpm test:full
```

Expected: `pnpm test` 全 PASS + `pnpm test:contract:live` 按 key 配置 PASS / skip。

- [ ] **Step 6: CI nightly（可选，repo 有 workflow 时）**

`.github/workflows/nightly-contract.yml`：

```yaml
name: nightly-contract
on:
    schedule:
        - cron: "0 18 * * *" # UTC 18:00 = 北京 02:00
    workflow_dispatch:
jobs:
    contract:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: pnpm/action-setup@v3
            - uses: actions/setup-node@v4
              with: { node-version: 20, cache: pnpm }
            - run: pnpm install --frozen-lockfile
            - run: pnpm test:full
              env:
                  DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
                  GLM_API_KEY: ${{ secrets.GLM_API_KEY }}
                  MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
                  TAVILY_API_KEY: ${{ secrets.TAVILY_API_KEY }}
                  CPA_MGMT_KEY: ${{ secrets.CPA_MGMT_KEY }}
                  CPA_MGMT_URL: ${{ secrets.CPA_MGMT_URL }}
```

- [ ] **Step 7: 提交**

```bash
git add tests/contract_live/ vitest.config.ts package.json .github/workflows/nightly-contract.yml
git commit -m "test: live contract handshake for external plugin APIs (full-run only)"
```

---

## Task 8: 覆盖率报告与门槛

**Files:**

- Modify: `vitest.config.ts`（加 `coverage` 配置，provider v8）
- Modify: `package.json`（加 `test:coverage` script）
- Modify: `docs/test.md`（写命令、当前基线、阈值策略）
- Create: `docs/coverage-baseline.md`（首次基线快照，列 <80% 模块）

来源：原 `TASKS.md` Phase 18.6。其余 18.1-18.5 已被 Task 2-6 覆盖；18.7 文档同步分散到各 Task 的 docs commit。

- [ ] **Step 1: vitest coverage 配置**

```ts
// vitest.config.ts
test: {
    coverage: {
        provider: "v8",
        reporter: ["text", "html", "json-summary"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.d.ts", "src/renderer/main.tsx", "src/preload/**", "**/*.test.{ts,tsx}"],
        thresholds: {
            // 首次跑后填实际基线，避免开发阻塞
        },
    },
},
```

- [ ] **Step 2: 装 provider + 加 script**

```bash
pnpm add -D @vitest/coverage-v8
```

`package.json`：

```json
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: 跑基线**

```bash
pnpm test:coverage
```

预期：生成 `coverage/` 目录 + 终端汇总表。

- [ ] **Step 4: 写 `docs/coverage-baseline.md`**

按 `coverage/coverage-summary.json` 输出，按目录分组列出当前覆盖率。标记 <80% 的模块为"补测试候选"。

- [ ] **Step 5: 设阈值**

按基线取个不阻塞当前的下限（如基线 75% 就设 70%），写到 `vitest.config.ts` `thresholds.lines / functions / branches / statements`。**不要**直接设 80% 让 CI 红。

- [ ] **Step 6: 更新 `docs/test.md`**

加一节 "覆盖率"，记录命令、当前阈值、查看 HTML 报告的方式（`open coverage/index.html`）。

- [ ] **Step 7: 提交**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml docs/test.md docs/coverage-baseline.md
git commit -m "test: vitest coverage baseline and threshold gate"
```

---

## 完成判定

- `pnpm test` 全 PASS（stub 全覆盖，**不打真服务**），case 数 ≥ 现有 + ~50
- `pnpm test:e2e` 全 PASS，case 数 ≥ 22 + ~15
- `pnpm test:visual` 全 PASS（本地基线）
- `pnpm test:packaged` 全 PASS
- `pnpm test:contract:live` 在有 key 环境下全 PASS / 无 key 全 skip（不报错）
- `pnpm test:coverage` 出基线 + 阈值不阻塞 CI
- `pnpm test:full` 在 nightly CI 跑通
- `docs/test-coverage-matrix.md` 每个 spec 章节都标了状态，无 `—` 占位
- 任何后续 PR 改 spec / 加功能时，矩阵必须同步更新（建议加 pre-commit grep gate）

## 不在此计划范围

- 性能 / 压力测试（spec 未要求）
- a11y 自动化扫描（可后续单独 Task）
- 跨平台 CI 矩阵（先把 Windows 本地跑稳，再考虑 mac/linux runners）

---

> 计划写完。建议执行模式：**Subagent-Driven**（每 Task 单独 subagent，做完两阶段 review）。Task 1 必须最先做，2/3/4/5/6/7 可串可并。
