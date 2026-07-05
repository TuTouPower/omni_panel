# OpenCode Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenCode Web-session usage collection that shows rolling, weekly, and monthly usage percentages.

**Architecture:** Reuse the existing bundled plugin architecture and MiMo-style Cookie login. Add a minimal text-response path to the plugin SDK because OpenCode returns SolidJS server-function payloads as `text/javascript`, then add one `opencode` plugin that discovers current SolidJS server-reference IDs from OpenCode page scripts before calling the usage server function.

**Tech Stack:** Electron, React, TypeScript, Vitest, bundled plugin SDK, undici HTTP client.

---

## File Structure

- Modify `src/plugins/sdk/http-client.ts`: add `getText()` so plugins can read non-JSON responses while preserving existing JSON behavior.
- Modify `src/plugins/sdk/index.ts`: export the new `getText()` type via `HttpClient`.
- Modify `src/plugins/sdk/result.ts`: add `opencode` to the SDK `UsageItem.provider` union.
- Modify `src/shared/schemas/plugin-output.ts`: add `opencode` to runtime output validation.
- Create `assets/plugins/opencode-usage-plugin.ts`: fetch OpenCode pages/scripts, call SolidJS server functions, parse usage percentages, emit `UsageItem[]`.
- Modify `src/main/ipc/auth-ipc.ts`: make login partition/provider/cookie capture generic instead of MiMo-only.
- Modify `src/main/core/cookie-refresh/cookie-refresh-service.ts`: refresh cookies from `persist:opencode-login` using `opencode.ai` domains.
- Modify `src/renderer/lib/provider-usage.ts`: label/order OpenCode.
- Modify `src/renderer/components/AddAccountDialog.tsx`: make OpenCode available as a session provider.
- Modify `src/renderer/components/SettingsForm.tsx`: show Web-login button for OpenCode cookie fields.
- Modify `src/renderer/components/Icon.tsx`: add a small inline OpenCode vendor mark.
- Create `tests/unit/plugin/opencode-usage-plugin.test.ts`: plugin parser and request behavior tests.
- Modify `tests/unit/plugin/bundled-metadata.test.ts`: expect 9 bundled plugins including OpenCode.
- Modify `tests/unit/ipc/auth-ipc.test.ts`: cover dynamic OpenCode partition/cookie capture.
- Modify `tests/unit/main/cookie-refresh-service.test.ts`: cover OpenCode domain cookie refresh.
- Modify `docs/spec.md`: add OpenCode to the documented direct integrations.

## OpenCode Protocol From Capture

The provided log `C:\Users\TestUser\Downloads\capture_all_capture_1781283522049_o5yz5cb.json` shows:

- Login/workspace host: `https://opencode.ai`
- Workspace id response from `checkLoggedIn.get`:

```text
;0x0000004a;((self.$R=self.$R||{})["server-fn:0"]=[],"wrk_01KTTKNTVCFG7RBGPD7QSBRW9S")
```

- Usage server reference in workspace JS:

```js
const queryLiteSubscription_query = createServerReference(
    "c7389bd0e731f80f49593e5ee53835475f4e28594dd6bd83eb229bab753498cd",
);
const queryLiteSubscription = query(queryLiteSubscription_query, "lite.subscription.get");
```

- Usage request shape:

```text
GET /_server?id=<queryLiteSubscription server id>&args=<encoded JSON>
X-Server-Instance: server-fn:1
```

- Decoded `args` JSON:

```json
{
    "t": {
        "t": 9,
        "i": 0,
        "l": 1,
        "a": [{ "t": 1, "s": "wrk_01KTTKNTVCFG7RBGPD7QSBRW9S" }],
        "o": 0
    },
    "f": 31,
    "m": []
}
```

- Usage response shape:

```js
0x00000128;
(((self.$R = self.$R || {})["server-fn:1"] = []),
    (($R) =>
        ($R[0] = {
            mine: !0,
            useBalance: !1,
            rollingUsage: ($R[1] = { status: "ok", resetInSec: 12210, usagePercent: 10 }),
            weeklyUsage: ($R[2] = { status: "ok", resetInSec: 198063, usagePercent: 85 }),
            monthlyUsage: ($R[3] = { status: "ok", resetInSec: 2465553, usagePercent: 42 }),
        }))($R["server-fn:1"]));
```

## Task 1: Add text-response support to plugin SDK

**Files:**

- Modify: `src/plugins/sdk/http-client.ts`
- Modify: `src/plugins/sdk/index.ts`

- [ ] **Step 1: Add failing integration coverage for text responses**

Add this test to `tests/integration/plugin/https_stub.test.ts` only if the task worker wants direct SDK integration coverage. Otherwise skip this optional test and rely on the OpenCode plugin unit test in Task 3.

- [ ] **Step 2: Update `HttpClient` interface**

In `src/plugins/sdk/http-client.ts`, change the interface to:

```ts
export interface HttpClient {
    getJson<T>(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<T>>;
    postJson<T>(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<T>>;
    request<T>(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<T>>;
    getText(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<string>>;
}
```

- [ ] **Step 3: Split HTTP parsing internally**

Replace `call<T>()` with a mode-aware helper:

```ts
async function call<T>(
    endpointKey: string,
    path: string,
    opts: HttpRequestOptions = {},
    responseType: "json" | "text" = "json",
): Promise<Result<T>> {
    const base = resolveEndpoint(endpointKey, metadataEndpoints?.[endpointKey] ?? null);
    if (!base) {
        return { ok: false, error: { kind: "missing_endpoint", key: endpointKey } };
    }

    const url = buildUrl(base, path, opts.query);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const body =
            opts.body === undefined || opts.body === null ? undefined : JSON.stringify(opts.body);
        const headers: Record<string, string> = { ...(opts.headers ?? {}) };
        if (
            body !== undefined &&
            headers["content-type"] === undefined &&
            headers["Content-Type"] === undefined
        ) {
            headers["content-type"] = "application/json";
        }

        const res = await request(url, {
            method: opts.method ?? "GET",
            headers,
            signal: controller.signal,
            ...(body !== undefined ? { body } : {}),
            ...(dispatcher ? { dispatcher } : {}),
        });

        const text = await readBodyWithLimit(res);
        if (responseType === "text") {
            if (res.statusCode >= 400) {
                return { ok: false, error: { kind: "http", status: res.statusCode, body: text } };
            }
            return { ok: true, value: text as T };
        }

        let data: unknown = null;
        if (text.length > 0) {
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
        const errName = (err as { name?: string }).name;
        if (errName === "AbortError" || errName === "TimeoutError") {
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
```

- [ ] **Step 4: Return `getText()` from `createHttpClient()`**

Update the return object:

```ts
return {
    getJson: <T>(k: string, p: string, o?: HttpRequestOptions) =>
        call<T>(k, p, { ...o, method: "GET" }, "json"),
    postJson: <T>(k: string, p: string, o?: HttpRequestOptions) =>
        call<T>(k, p, { ...o, method: "POST" }, "json"),
    request: <T>(k: string, p: string, o?: HttpRequestOptions) => call<T>(k, p, o, "json"),
    getText: (k: string, p: string, o?: HttpRequestOptions) =>
        call<string>(k, p, { ...o, method: "GET" }, "text"),
};
```

- [ ] **Step 5: Run current plugin tests**

Run:

```bash
pnpm test -- tests/unit/plugin/mimo-usage-plugin.test.ts tests/integration/plugin/https_stub.test.ts
```

Expected: PASS. Existing JSON behavior must not change.

## Task 2: Register OpenCode as a provider

**Files:**

- Modify: `src/shared/schemas/plugin-output.ts`
- Modify: `src/plugins/sdk/result.ts`
- Modify: `src/renderer/lib/provider-usage.ts`
- Modify: `src/renderer/components/Icon.tsx`

- [ ] **Step 1: Add provider to schema**

In `src/shared/schemas/plugin-output.ts`, add `"opencode"` after `"mimo"`:

```ts
export const usageProviderSchema = z.enum([
    "claude",
    "codex",
    "gemini",
    "antigravity",
    "kimi",
    "glm",
    "minimax",
    "deepseek",
    "tavily",
    "mimo",
    "opencode",
]);
```

- [ ] **Step 2: Add provider to SDK result type**

In `src/plugins/sdk/result.ts`, add `| "opencode"` after `| "mimo"`:

```ts
        | "tavily"
        | "mimo"
        | "opencode";
```

- [ ] **Step 3: Add label/order**

In `src/renderer/lib/provider-usage.ts`, update the order and labels:

```ts
export const PROVIDER_ORDER: readonly UsageProvider[] = [
    "claude",
    "codex",
    "gemini",
    "antigravity",
    "kimi",
    "glm",
    "minimax",
    "deepseek",
    "tavily",
    "mimo",
    "opencode",
];

export const PROVIDER_LABELS: Record<UsageProvider, string> = {
    claude: "Claude",
    codex: "Codex",
    gemini: "Gemini",
    antigravity: "Antigravity",
    kimi: "Kimi",
    glm: "GLM",
    minimax: "MiniMax",
    deepseek: "DeepSeek",
    tavily: "Tavily",
    mimo: "MiMo",
    opencode: "OpenCode",
};
```

- [ ] **Step 4: Add inline icon**

In `src/renderer/components/Icon.tsx`, add this entry in `VENDOR_MARKS` after `mimo`:

```ts
    opencode: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none">` +
        `<rect x="3" y="3" width="18" height="18" rx="4" fill="#211e1e"/>` +
        `<path d="M7 7h5v2H9v6h3v2H7zM13 7h4v10h-4v-2h2V9h-2z" fill="#f1ecec"/>` +
        `</svg>`,
```

- [ ] **Step 5: Type-check provider registration**

Run:

```bash
pnpm test -- tests/unit/renderer/components/icon.test.tsx
```

Expected: PASS.

## Task 3: Add OpenCode bundled plugin with tests

**Files:**

- Create: `assets/plugins/opencode-usage-plugin.ts`
- Create: `tests/unit/plugin/opencode-usage-plugin.test.ts`
- Modify: `tests/unit/plugin/bundled-metadata.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/plugin/opencode-usage-plugin.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from "vitest";

let captured_handler:
    | ((ctx: {
          params: Record<string, string>;
          http: {
              getJson: ReturnType<typeof vi.fn>;
              postJson: ReturnType<typeof vi.fn>;
              request: ReturnType<typeof vi.fn>;
              getText: ReturnType<typeof vi.fn>;
          };
          language: string;
          t: (key: string) => string;
      }) => Promise<unknown>)
    | null = null;

vi.mock("@omni-usage/plugin-sdk", async () => {
    const actual = await vi.importActual("@omni-usage/plugin-sdk");
    return {
        ...(actual as Record<string, unknown>),
        definePlugin: (handler: unknown) => {
            captured_handler = handler as typeof captured_handler;
        },
    };
});

function make_http_mock() {
    return {
        getJson: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
        postJson: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
        request: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
        getText: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
}

function make_ctx(cookie_value: string, http_mock = make_http_mock()) {
    return {
        params: { SESSION_COOKIE: cookie_value },
        http: http_mock,
        language: "zh-Hans" as const,
        t: (key: string): string => {
            const map: Record<string, string> = {
                rolling_usage: "滚动用量",
                weekly_usage: "每周用量",
                monthly_usage: "每月用量",
                invalid_response: "响应数据格式异常",
            };
            return map[key] ?? key;
        },
    };
}

interface TestItem {
    id: string;
    provider: string;
    name: string;
    used: number;
    limit: number;
    displayStyle: string;
    status: string;
    color: string;
    resetAt?: string | null;
}

interface TestResult {
    success: boolean;
    items?: TestItem[];
    badge?: string;
    error?: { code: string; message: string };
}

describe("opencode-usage-plugin", () => {
    beforeAll(async () => {
        await import("../../../assets/plugins/opencode-usage-plugin");
    });

    function get_handler() {
        if (!captured_handler) throw new Error("Handler not captured — plugin import failed");
        return captured_handler;
    }

    async function run(ctx: ReturnType<typeof make_ctx>): Promise<TestResult> {
        return get_handler()(ctx) as Promise<TestResult>;
    }

    it("throws MISSING_PARAM when SESSION_COOKIE is empty", async () => {
        await expect(get_handler()(make_ctx("") as never)).rejects.toThrow(
            "MISSING_PARAM:SESSION_COOKIE",
        );
    });

    it("discovers server refs and returns three percentage items", async () => {
        const http = make_http_mock();
        http.getText.mockImplementation((_endpoint: unknown, path: unknown, opts: unknown) => {
            const p = path as string;
            const options = opts as {
                query?: Record<string, string>;
                headers?: Record<string, string>;
            };
            if (p === "/go") {
                return Promise.resolve({
                    ok: true,
                    value: '<script type="module" src="/assets/go-page.js"></script>',
                });
            }
            if (p === "/assets/go-page.js") {
                return Promise.resolve({
                    ok: true,
                    value: 'const checkLoggedIn_query = createServerReference("2ce91b3e3223afcebef79e386bb9ca6d735e38770a345ca9570ace4526a6ae56");',
                });
            }
            if (p === "/_server" && options.query?.id?.startsWith("2ce91")) {
                expect(options.headers?.["X-Server-Instance"]).toBe("server-fn:0");
                return Promise.resolve({
                    ok: true,
                    value: ';0x0000004a;((self.$R=self.$R||{})["server-fn:0"]=[],"wrk_test")',
                });
            }
            if (p === "/workspace/wrk_test/go") {
                return Promise.resolve({
                    ok: true,
                    value: '<script type="module" src="/assets/workspace-page.js"></script>',
                });
            }
            if (p === "/assets/workspace-page.js") {
                return Promise.resolve({
                    ok: true,
                    value: 'const queryLiteSubscription_query = createServerReference("c7389bd0e731f80f49593e5ee53835475f4e28594dd6bd83eb229bab753498cd");',
                });
            }
            if (p === "/_server" && options.query?.id?.startsWith("c738")) {
                expect(options.headers?.["X-Server-Instance"]).toBe("server-fn:1");
                expect(decodeURIComponent(String(options.query.args))).toContain("wrk_test");
                return Promise.resolve({
                    ok: true,
                    value: ';0x00000128;((self.$R=self.$R||{})["server-fn:1"]=[],($R=>$R[0]={mine:!0,useBalance:!1,rollingUsage:$R[1]={status:"ok",resetInSec:12210,usagePercent:10},weeklyUsage:$R[2]={status:"ok",resetInSec:198063,usagePercent:85},monthlyUsage:$R[3]={status:"ok",resetInSec:2465553,usagePercent:42}})($R["server-fn:1"]))',
                });
            }
            return Promise.resolve({ ok: false, error: { kind: "http", status: 404 } });
        });

        const result = await run(make_ctx("sid=abc", http));

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.badge).toBe("OpenCode");
        expect(result.items).toHaveLength(3);
        expect(result.items?.map((i) => [i.id, i.name, i.used, i.limit, i.displayStyle])).toEqual([
            ["opencode-rolling", "滚动用量", 10, 100, "percent"],
            ["opencode-weekly", "每周用量", 85, 100, "percent"],
            ["opencode-monthly", "每月用量", 42, 100, "percent"],
        ]);
    });

    it("returns OPENCODE_PARSE_ERROR when usage response is missing fields", async () => {
        const http = make_http_mock();
        http.getText.mockResolvedValue({ ok: true, value: "no usage here" });

        const result = await run(make_ctx("sid=abc", http));

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("OPENCODE_PARSE_ERROR");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- tests/unit/plugin/opencode-usage-plugin.test.ts
```

Expected: FAIL because `assets/plugins/opencode-usage-plugin.ts` does not exist.

- [ ] **Step 3: Create plugin implementation**

Create `assets/plugins/opencode-usage-plugin.ts`:

```ts
// UsageBoardPlugin:
// {
//   "schemaVersion": 1,
//   "name": "OpenCode",
//   "supportedProviders": ["opencode"],
//   "defaultSource": "direct",
//   "name@zh-Hans": "OpenCode",
//   "name@en": "OpenCode",
//   "description": "查询 OpenCode Go 用量",
//   "description@zh-Hans": "查询 OpenCode Go 用量",
//   "description@en": "Query OpenCode Go usage",
//   "parameters": [
//     {
//       "name": "SESSION_COOKIE",
//       "label": "Cookie",
//       "label@zh-Hans": "Cookie",
//       "label@en": "Cookie",
//       "type": "secret",
//       "required": true,
//       "description": "OpenCode 登录 Cookie。推荐点击「网页登录」自动获取。",
//       "description@zh-Hans": "OpenCode 登录 Cookie。推荐点击「网页登录」自动获取。",
//       "description@en": "OpenCode login Cookie. Use the Login button to auto-fill.",
//       "placeholder": "点击「网页登录」可自动填入"
//     }
//   ],
//   "endpoints": {
//     "default": "https://opencode.ai",
//     "login": "https://opencode.ai/go"
//   }
// }
// /UsageBoardPlugin

import {
    definePlugin,
    requireParam,
    ok,
    fail,
    failFromHttp,
    statusFor,
    colorFor,
} from "@omni-usage/plugin-sdk";
import type { PluginContext, UsageItem } from "@omni-usage/plugin-sdk";

const METADATA_ENDPOINTS = {
    default: "https://opencode.ai",
    login: "https://opencode.ai/go",
};
const SOURCE_INSTANCE_ID = process.env["OMNI_SOURCE_INSTANCE_ID"] ?? "unknown-source";

const translations = {
    rolling_usage: { "zh-Hans": "滚动用量", en: "Rolling Usage" },
    weekly_usage: { "zh-Hans": "每周用量", en: "Weekly Usage" },
    monthly_usage: { "zh-Hans": "每月用量", en: "Monthly Usage" },
    invalid_response: { "zh-Hans": "响应数据格式异常", en: "Invalid response format" },
};

interface UsageSlice {
    status: string;
    resetInSec: number;
    usagePercent: number;
}

interface ParsedUsage {
    rollingUsage: UsageSlice;
    weeklyUsage: UsageSlice;
    monthlyUsage: UsageSlice;
}

function cookie_headers(cookie: string, referer: string, server_instance?: string) {
    return {
        Cookie: cookie,
        Referer: referer,
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        ...(server_instance ? { "X-Server-Instance": server_instance } : {}),
    };
}

function extract_script_paths(html: string): string[] {
    const paths = new Set<string>();
    const pattern = /(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/g;
    for (const match of html.matchAll(pattern)) {
        const raw = match[1];
        if (!raw) continue;
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
            const url = new URL(raw);
            paths.add(`${url.pathname}${url.search}`);
        } else if (raw.startsWith("/")) {
            paths.add(raw);
        }
    }
    return [...paths];
}

function find_server_reference(source: string, variable_name: string): string | null {
    const escaped = variable_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
        `const\\s+${escaped}_query\\s*=\\s*createServerReference\\("([a-f0-9]{64})"\\)`,
    );
    return pattern.exec(source)?.[1] ?? null;
}

async function find_reference_in_page(
    ctx: PluginContext,
    page_path: string,
    cookie: string,
    referer: string,
    variable_name: string,
): Promise<string | null> {
    const page = await ctx.http.getText("default", page_path, {
        headers: cookie_headers(cookie, referer),
    });
    if (!page.ok) throw page.error;

    const direct = find_server_reference(page.value, variable_name);
    if (direct) return direct;

    for (const script_path of extract_script_paths(page.value)) {
        const script = await ctx.http.getText("default", script_path, {
            headers: cookie_headers(cookie, referer),
        });
        if (!script.ok) continue;
        const found = find_server_reference(script.value, variable_name);
        if (found) return found;
    }
    return null;
}

function parse_workspace_id(text: string): string | null {
    return /"(wrk_[A-Z0-9]+)"/.exec(text)?.[1] ?? null;
}

function parse_usage_slice(text: string, key: keyof ParsedUsage): UsageSlice | null {
    const pattern = new RegExp(
        `${key}:\\$R\\[\\d+\\]=\\{status:"([^"]+)",resetInSec:(\\d+),usagePercent:(\\d+)\\}`,
    );
    const match = pattern.exec(text);
    if (!match) return null;
    return {
        status: match[1] ?? "unknown",
        resetInSec: Number(match[2] ?? 0),
        usagePercent: Number(match[3] ?? 0),
    };
}

function parse_usage(text: string): ParsedUsage | null {
    const rollingUsage = parse_usage_slice(text, "rollingUsage");
    const weeklyUsage = parse_usage_slice(text, "weeklyUsage");
    const monthlyUsage = parse_usage_slice(text, "monthlyUsage");
    if (!rollingUsage || !weeklyUsage || !monthlyUsage) return null;
    return { rollingUsage, weeklyUsage, monthlyUsage };
}

function reset_at(seconds: number): string {
    return new Date(Date.now() + seconds * 1000).toISOString();
}

function make_item(id: string, name: string, usage: UsageSlice): UsageItem {
    const used = usage.usagePercent;
    const limit = 100;
    return {
        id,
        provider: "opencode",
        source: "direct",
        sourceInstanceId: SOURCE_INSTANCE_ID,
        accountId: SOURCE_INSTANCE_ID,
        accountLabel: "OpenCode",
        name,
        used,
        limit,
        displayStyle: "percent",
        resetAt: reset_at(usage.resetInSec),
        status: statusFor(used, limit),
        color: colorFor(used, limit),
    };
}

definePlugin(
    async (ctx: PluginContext) => {
        const cookie = requireParam(ctx.params, "SESSION_COOKIE");
        const check_ref = await find_reference_in_page(
            ctx,
            "/go",
            cookie,
            "https://opencode.ai/go",
            "checkLoggedIn",
        );
        if (!check_ref) return fail("OPENCODE_PARSE_ERROR", ctx.t("invalid_response"));

        const workspace_result = await ctx.http.getText("default", "/_server", {
            headers: cookie_headers(cookie, "https://opencode.ai/", "server-fn:0"),
            query: { id: check_ref },
        });
        if (!workspace_result.ok) return failFromHttp(workspace_result.error, "opencode");

        const workspace_id = parse_workspace_id(workspace_result.value);
        if (!workspace_id) return fail("OPENCODE_PARSE_ERROR", ctx.t("invalid_response"));

        const workspace_path = `/workspace/${workspace_id}/go`;
        const usage_ref = await find_reference_in_page(
            ctx,
            workspace_path,
            cookie,
            `https://opencode.ai/workspace/${workspace_id}`,
            "queryLiteSubscription",
        );
        if (!usage_ref) return fail("OPENCODE_PARSE_ERROR", ctx.t("invalid_response"));

        const args = JSON.stringify({
            t: { t: 9, i: 0, l: 1, a: [{ t: 1, s: workspace_id }], o: 0 },
            f: 31,
            m: [],
        });
        const usage_result = await ctx.http.getText("default", "/_server", {
            headers: cookie_headers(
                cookie,
                `https://opencode.ai/workspace/${workspace_id}`,
                "server-fn:1",
            ),
            query: { id: usage_ref, args },
        });
        if (!usage_result.ok) return failFromHttp(usage_result.error, "opencode");

        const usage = parse_usage(usage_result.value);
        if (!usage) return fail("OPENCODE_PARSE_ERROR", ctx.t("invalid_response"));

        return ok({
            badge: "OpenCode",
            items: [
                make_item("opencode-rolling", ctx.t("rolling_usage"), usage.rollingUsage),
                make_item("opencode-weekly", ctx.t("weekly_usage"), usage.weeklyUsage),
                make_item("opencode-monthly", ctx.t("monthly_usage"), usage.monthlyUsage),
            ],
        });
    },
    { metadata: { endpoints: METADATA_ENDPOINTS }, translations },
);
```

- [ ] **Step 4: Run plugin unit test**

Run:

```bash
pnpm test -- tests/unit/plugin/opencode-usage-plugin.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update bundled metadata test**

In `tests/unit/plugin/bundled-metadata.test.ts`:

```ts
it("discovers exactly 9 plugins", async () => {
    const defs = await discoverPlugins(bundledDir);
    expect(defs.length).toBe(9);
});
```

Add to `expected`:

```ts
{ scriptName: "opencode-usage-plugin.ts", name: "OpenCode", secretParams: ["SESSION_COOKIE"] },
```

Add to `expectedProvidersByPlugin`:

```ts
"opencode-usage-plugin.ts": ["opencode"],
```

Add to `expectedSourceByPlugin`:

```ts
"opencode-usage-plugin.ts": "direct",
```

- [ ] **Step 6: Run metadata test**

Run:

```bash
pnpm test -- tests/unit/plugin/bundled-metadata.test.ts
```

Expected: PASS.

## Task 4: Generalize Cookie login for OpenCode

**Files:**

- Modify: `src/main/ipc/auth-ipc.ts`
- Modify: `tests/unit/ipc/auth-ipc.test.ts`

- [ ] **Step 1: Update auth IPC tests for provider-specific partition**

In `tests/unit/ipc/auth-ipc.test.ts`, change the hoisted Electron mock so `fromPartition` can be asserted:

```ts
const mock_from_partition = vi.fn(() => ({
    cookies: {
        get: vi.fn(() => Promise.resolve(mock_cookie_get_result)),
    },
    webRequest: {
        onBeforeSendHeaders: vi.fn(),
    },
}));

vi.mock("electron", () => ({
    BrowserWindow: vi.fn().mockImplementation(() => ({
        on: (event: string, handler: () => void) => {
            mock_window_events[event] = handler;
        },
        close: vi.fn(() => {
            const h = mock_window_events["closed"];
            if (h) h();
        }),
        isDestroyed: () => false,
        loadURL: vi.fn(),
    })),
    session: {
        fromPartition: mock_from_partition,
    },
    ipcMain: {
        handle: vi.fn(),
    },
}));
```

Add a helper that can build OpenCode deps:

```ts
function build_deps_for_provider(instance_id: string, provider: "mimo" | "opencode") {
    const executablePath = `plugins/${provider}-usage-plugin.ts`;
    const login =
        provider === "opencode"
            ? "https://opencode.ai/go"
            : "https://platform.xiaomimimo.com/console/plan-manage";
    return {
        ...build_deps(instance_id),
        configStore: {
            ...build_deps(instance_id).configStore,
            load: vi.fn().mockResolvedValue({
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [
                    {
                        instanceId: instance_id,
                        stateId: instance_id,
                        name: provider,
                        enabled: true,
                        executablePath,
                        refreshIntervalSeconds: 300,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
                launchAtLogin: false,
            }),
        },
        definitions: [
            {
                scriptName: `${provider}-usage-plugin`,
                executablePath,
                source: "bundled" as const,
                metadata: {
                    schemaVersion: 1,
                    name: provider,
                    supportedProviders: [provider],
                    defaultSource: "direct" as const,
                    endpoints: { default: login, login },
                },
            },
        ],
    };
}
```

Add this test:

```ts
it("uses opencode persistent partition and saves opencode domain cookies", async () => {
    mock_cookie_get_result = [
        { name: "sid", value: "abc" },
        { name: "csrf", value: "def" },
    ];

    const mod = await import("../../../src/main/ipc/auth-ipc");
    const promise = mod.handleCookieLogin(
        build_deps_for_provider("opencode-test-1", "opencode") as never,
        "opencode-test-1",
    );

    await vi.waitFor(() => {
        if (!mock_window_events["closed"]) throw new Error("not ready");
    });

    mock_window_events["closed"]?.();
    await Promise.resolve();

    const result = await promise;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.saved).toBe(true);
    expect(mock_from_partition).toHaveBeenCalledWith("persist:opencode-login");
    expect(secrets_store["opencode-test-1:SESSION_COOKIE"]).toBe("sid=abc; csrf=def");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- tests/unit/ipc/auth-ipc.test.ts
```

Expected: FAIL because current implementation uses `persist:mimo-login` and MiMo-only cookie names.

- [ ] **Step 3: Implement provider-specific partition and cookie fallback**

In `src/main/ipc/auth-ipc.ts`, import `UsageProvider`:

```ts
import type { UsageProvider } from "../../shared/schemas/plugin-output";
```

Add near constants:

```ts
interface LoginCookieConfig {
    cookieNames?: string[];
    domains?: string[];
}

const LOGIN_COOKIE_MAP: Partial<Record<UsageProvider, LoginCookieConfig>> = {
    mimo: {
        cookieNames: ["api-platform_serviceToken", "api-platform_slh", "api-platform_ph", "userId"],
    },
    kimi: { cookieNames: ["access_token", "refresh_token"] },
    opencode: { domains: [".opencode.ai", "opencode.ai"] },
};
```

Replace the fixed partition:

```ts
const provider = def?.metadata?.supportedProviders?.[0] ?? "mimo";
const partition = `persist:${provider}-login`;
const loginSession = session.fromPartition(partition);
```

Replace the `onBeforeSendHeaders` condition:

```ts
const loginHost = new URL(loginUrl).host;
loginSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!resolved) {
        const requestHost = new URL(details.url).host;
        const cookie = details.requestHeaders["Cookie"] ?? details.requestHeaders["cookie"];
        if (requestHost === loginHost && cookie) {
            captured_cookie = cookie;
            log.info(`Captured Cookie header from browser request to ${details.url.slice(0, 80)}`);
        }
    }
    callback({ requestHeaders: details.requestHeaders });
});
```

Replace the fallback cookie read block with:

```ts
const cookie_config = LOGIN_COOKIE_MAP[provider];
let all_cookies: Electron.Cookie[];
if (cookie_config?.domains && cookie_config.domains.length > 0) {
    const batches = await Promise.all(
        cookie_config.domains.map((domain) => loginSession.cookies.get({ domain })),
    );
    const seen = new Set<string>();
    all_cookies = [];
    for (const batch of batches) {
        for (const c of batch) {
            const key = `${c.name}:${c.domain ?? ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            all_cookies.push(c);
        }
    }
} else {
    all_cookies = await loginSession.cookies.get({});
}
const target_names = new Set(cookie_config?.cookieNames ?? []);
const matched =
    target_names.size > 0 ? all_cookies.filter((c) => target_names.has(c.name)) : all_cookies;
```

Keep the existing `matched.length === 0`, `cookie_parts`, and `secretsStore.set()` logic.

- [ ] **Step 4: Run auth IPC tests**

Run:

```bash
pnpm test -- tests/unit/ipc/auth-ipc.test.ts
```

Expected: PASS.

## Task 5: Add OpenCode to settings UI and cookie refresh

**Files:**

- Modify: `src/renderer/components/AddAccountDialog.tsx`
- Modify: `src/renderer/components/SettingsForm.tsx`
- Modify: `src/main/core/cookie-refresh/cookie-refresh-service.ts`
- Modify: `tests/unit/main/cookie-refresh-service.test.ts`

- [ ] **Step 1: Register OpenCode in Add Account dialog**

In `src/renderer/components/AddAccountDialog.tsx`, add to `VENDOR_AUTH_MAP`:

```ts
    opencode: "session",
```

Add to `ADD_COMMON_SERVICES` after MiMo:

```ts
    { id: "opencode", label: "OpenCode" },
```

Add to `AUTH_SESSION_META`:

```ts
    opencode: {
        host: "opencode.ai",
        login_url: "https://opencode.ai/go",
        cookie_keys: ["opencode.ai session cookies"],
    },
```

- [ ] **Step 2: Show Web-login button for OpenCode settings**

In `src/renderer/components/SettingsForm.tsx`, replace:

```tsx
{providerId === "mimo" &&
```

with:

```tsx
{(providerId === "mimo" || providerId === "opencode") &&
```

- [ ] **Step 3: Add OpenCode cookie refresh config**

In `src/main/core/cookie-refresh/cookie-refresh-service.ts`, add to `VENDOR_COOKIE_MAP`:

```ts
    opencode: {
        cookieNames: [],
        domains: [".opencode.ai", "opencode.ai"],
        secretParamName: "SESSION_COOKIE",
    },
```

- [ ] **Step 4: Add cookie refresh test**

In `tests/unit/main/cookie-refresh-service.test.ts`, add:

```ts
it("refreshes opencode cookies from opencode persistent session", async () => {
    const opencode_def = make_plugin_def("opencode_plugin", ["opencode"], {
        has_secret: true,
        login_url: "https://opencode.ai/go",
    });

    config_store_mock.load.mockResolvedValue(
        make_config([make_plugin_config("opencode1", "/plugins/opencode_plugin")]),
    );

    mock_cookies.get.mockResolvedValue([
        { name: "sid", value: "abc" },
        { name: "csrf", value: "def" },
    ]);

    const service = createCookieRefreshService({
        configStore: config_store_mock,
        secretsStore: secrets_store_mock,
        definitions: [opencode_def],
    });

    const result = await service.refreshAll();

    expect(result).toEqual({ refreshed: 1, failed: 0 });
    expect(mock_session.fromPartition).toHaveBeenCalledWith("persist:opencode-login");
    expect(secrets_store_mock.set).toHaveBeenCalledWith(
        "opencode1:SESSION_COOKIE",
        "sid=abc; csrf=def",
    );
});
```

- [ ] **Step 5: Run UI/cookie tests**

Run:

```bash
pnpm test -- tests/unit/main/cookie-refresh-service.test.ts tests/unit/renderer/components/settings_form.test.tsx
```

Expected: PASS.

## Task 6: Update docs and full verification

**Files:**

- Modify: `docs/spec.md`

- [ ] **Step 1: Update docs**

Search `docs/spec.md` for the provider/integration list. Add OpenCode as a direct Web-session provider with percentage-only usage:

```md
- OpenCode：通过网页登录 Cookie 读取 OpenCode Go 用量，展示滚动、每周、每月三个百分比用量；当前不展示绝对 token/额度。
```

Do not modify `docs/design/omni-usage/`.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm test -- tests/unit/plugin/opencode-usage-plugin.test.ts tests/unit/plugin/bundled-metadata.test.ts tests/unit/ipc/auth-ipc.test.ts tests/unit/main/cookie-refresh-service.test.ts tests/unit/renderer/components/settings_form.test.tsx tests/unit/renderer/components/icon.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full project tests**

Run:

```bash
pnpm test
```

Expected: PASS, as required by `CLAUDE.md`.

- [ ] **Step 4: Package and manually verify UI**

Because this touches UI and Web login, run:

```bash
pnpm package
./artifacts/win-unpacked/OmniUsage.exe
```

Manual path:

1. Open Settings.
2. Add account.
3. Confirm OpenCode appears in common services.
4. Select OpenCode.
5. Click Web login.
6. Log into OpenCode and close the login window after the OpenCode page loads.
7. Save the account.
8. Trigger refresh.
9. Confirm the dashboard shows three OpenCode bars: 滚动用量, 每周用量, 每月用量.
10. Confirm values match the reference pattern when using the captured account: 10%, 85%, 42% if the live account state has not changed.

Expected: packaged app launches and OpenCode can be added via Web login. If the live service has changed its SolidJS server-function layout, automated tests can still pass while packaged live verification fails; report that as a live protocol drift limitation instead of claiming full verification.

## Commit Plan

- Commit 1: `feat: add text responses to plugin sdk`
- Commit 2: `feat: register opencode provider`
- Commit 3: `feat: add opencode usage plugin`
- Commit 4: `feat: support opencode cookie login`
- Commit 5: `docs: document opencode usage support`

Only commit if the user explicitly asks for commits.

## Self-Review

- Spec coverage: adds OpenCode usage, uses Web Cookie login, displays percentage-only rolling/weekly/monthly data, follows MiMo-style session flow.
- Placeholder scan: no `TBD`/`TODO` placeholders remain; protocol constants come from the provided capture and dynamic server ids are parsed from page scripts.
- Type consistency: provider id is consistently `opencode`; plugin output ids are `opencode-rolling`, `opencode-weekly`, and `opencode-monthly`; secret parameter is consistently `SESSION_COOKIE`.
