# OpenCode Go Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenCode Go as a first-class session-cookie connector with manual cookie import, browser login capture, and rolling/weekly/monthly usage observations.

**Architecture:** OpenCode Go is implemented as one connector instance per account. Cookie text is normalized in a shared parser before saving to the vault. The connector scrapes OpenCode Go's current SolidJS server-function protocol behind a mocked/tested boundary and emits three percent observations.

**Tech Stack:** Electron + React + TypeScript, Vitest, connector VM runtime, Electron session cookies, vault-backed secrets.

---

## File Structure

- Create: `src/shared/lib/cookie_parser.ts`
    - Parse JSON array/object, EditThisCookie-style objects, Netscape cookie files, and `k=v; k=v` headers into `{ header, names }`.
- Create: `tests/unit/shared/cookie_parser.test.ts`
    - TDD coverage for every supported cookie format and clear failure text.
- Create: `connectors/opencode_go/manifest.json`
    - Session connector metadata, `SESSION_COOKIE` secret, optional `ACCOUNT_LABEL`, default/login endpoints.
- Create: `connectors/opencode_go/connector.ts`
    - Fetch `/auth`, resolve workspace id, fetch workspace/go pages, extract JS assets, extract `lite.subscription.get` server hash, call `/_server`, parse usage, emit observations.
- Create: `tests/unit/connector/opencode_go.test.ts`
    - Runtime-level connector tests using mocked `ctx.http.get_raw`.
- Modify: `src/shared/schemas/plugin-output.ts`
    - Add `opencode_go` to `usageProviderSchema`.
- Modify: `src/renderer/lib/provider-usage.ts`
    - Add provider order + label.
- Modify: `src/renderer/lib/common-services.ts`
    - Add OpenCode Go to common add-account picker.
- Modify: `src/renderer/components/Icon.tsx`
    - Add fallback vendor mark for `opencode_go`.
- Modify: `src/renderer/components/AddAccountDialog.tsx`
    - Add session metadata, parse OpenCode Go cookie input before save, add copy-script button.
- Modify: `tests/unit/renderer/components/add_account_dialog.test.tsx`
    - Add OpenCode Go vendor/parser/script assertions.
- Modify: `src/renderer/components/SettingsForm.tsx`
    - Show generic网页登录 button for session providers with `SESSION_COOKIE`, not MiMo-only.
- Modify: `tests/unit/renderer/components/settings_form.test.tsx`
    - Update MiMo test and add OpenCode Go test.
- Modify: `src/renderer/views/SettingsView.tsx`
    - Route `onCookieLogin` through `window.usageboard.session.login()` for session providers, keep old MiMo `auth.cookieLogin` only if needed as fallback.
- Modify: `src/main/core/session/session-manager.ts`
    - Capture `/_server` request cookies and always fall back to selected Electron session cookies on close.
- Modify: `tests/unit/session/session-manager.test.ts`
    - Add OpenCode Go non-`/api/v1/` and close-fallback tests.
- Modify: `tests/integration/connector/manifest-contract.test.ts`
    - Add OpenCode Go session connector contract.
- Modify: `tests/unit/shared/plugin-output.test.ts`
    - Assert `opencode_go` accepted.
- Modify: `docs/TEST.md`
    - Add OpenCode Go manual verification path.
- Modify: `docs/superpowers/specs/2026-06-27-opencode-go-design.md`
    - Change status after implementation, record any verified limitation.

---

## Task 1: Cookie Parser

**Files:**

- Create: `src/shared/lib/cookie_parser.ts`
- Create: `tests/unit/shared/cookie_parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `tests/unit/shared/cookie_parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parse_cookie_text } from "../../../src/shared/lib/cookie_parser";

describe("parse_cookie_text", () => {
    it("parses cookie header strings", () => {
        expect(parse_cookie_text("a=1; b=hello%20world")).toEqual({
            header: "a=1; b=hello%20world",
            names: ["a", "b"],
        });
    });

    it("parses JSON cookie arrays", () => {
        const raw = JSON.stringify([
            { name: "session", value: "abc" },
            { name: "workspace", value: "ws_1" },
        ]);

        expect(parse_cookie_text(raw)).toEqual({
            header: "session=abc; workspace=ws_1",
            names: ["session", "workspace"],
        });
    });

    it("parses a single JSON cookie object", () => {
        expect(parse_cookie_text(JSON.stringify({ name: "session", value: "abc" }))).toEqual({
            header: "session=abc",
            names: ["session"],
        });
    });

    it("parses Netscape cookie files", () => {
        const raw = [
            "# Netscape HTTP Cookie File",
            ".opencode.ai\tTRUE\t/\tTRUE\t2147483647\tsession\tabc",
            "opencode.ai\tFALSE\t/\tTRUE\t2147483647\tworkspace\tws_1",
        ].join("\n");

        expect(parse_cookie_text(raw)).toEqual({
            header: "session=abc; workspace=ws_1",
            names: ["session", "workspace"],
        });
    });

    it("rejects unrecognized cookie text", () => {
        expect(() => parse_cookie_text("not a cookie")).toThrow("无法识别 Cookie 格式");
    });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm vitest run tests/unit/shared/cookie_parser.test.ts
```

Expected: FAIL because `src/shared/lib/cookie_parser.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `src/shared/lib/cookie_parser.ts`:

```ts
export interface ParsedCookieText {
    readonly header: string;
    readonly names: readonly string[];
}

interface CookieLike {
    readonly name?: unknown;
    readonly value?: unknown;
}

function normalize_pairs(pairs: readonly [string, string][]): ParsedCookieText {
    const cleaned = pairs
        .map(([name, value]) => [name.trim(), value.trim()] as const)
        .filter(([name, value]) => name.length > 0 && value.length > 0 && !/[;=\s]/.test(name));

    if (cleaned.length === 0) {
        throw new Error("无法识别 Cookie 格式");
    }

    return {
        header: cleaned.map(([name, value]) => `${name}=${value}`).join("; "),
        names: cleaned.map(([name]) => name),
    };
}

function parse_json_cookie(raw: string): ParsedCookieText | null {
    try {
        const parsed = JSON.parse(raw) as unknown;
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const pairs: [string, string][] = [];
        for (const item of list) {
            const cookie = item as CookieLike;
            if (typeof cookie.name === "string" && typeof cookie.value === "string") {
                pairs.push([cookie.name, cookie.value]);
            }
        }
        return pairs.length > 0 ? normalize_pairs(pairs) : null;
    } catch {
        return null;
    }
}

function parse_netscape_cookie(raw: string): ParsedCookieText | null {
    const pairs: [string, string][] = [];
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const parts = trimmed.split("\t");
        if (parts.length < 7) continue;
        const name = parts[5] ?? "";
        const value = parts.slice(6).join("\t");
        pairs.push([name, value]);
    }
    return pairs.length > 0 ? normalize_pairs(pairs) : null;
}

function parse_header_cookie(raw: string): ParsedCookieText | null {
    if (!raw.includes("=")) return null;
    const pairs: [string, string][] = [];
    for (const part of raw.split(";")) {
        const index = part.indexOf("=");
        if (index <= 0) continue;
        pairs.push([part.slice(0, index), part.slice(index + 1)]);
    }
    return pairs.length > 0 ? normalize_pairs(pairs) : null;
}

export function parse_cookie_text(raw: string): ParsedCookieText {
    const text = raw.trim();
    if (!text) throw new Error("无法识别 Cookie 格式");

    const parsed =
        parse_json_cookie(text) ?? parse_netscape_cookie(text) ?? parse_header_cookie(text);
    if (!parsed) throw new Error("无法识别 Cookie 格式");
    return parsed;
}
```

- [ ] **Step 4: Verify parser tests pass**

Run:

```bash
pnpm vitest run tests/unit/shared/cookie_parser.test.ts
```

Expected: PASS.

---

## Task 2: Provider Registration

**Files:**

- Modify: `src/shared/schemas/plugin-output.ts`
- Modify: `src/renderer/lib/provider-usage.ts`
- Modify: `src/renderer/lib/common-services.ts`
- Modify: `src/renderer/components/Icon.tsx`
- Modify: `tests/unit/shared/plugin-output.test.ts`

- [ ] **Step 1: Write failing schema/UI tests**

Append to `tests/unit/shared/plugin-output.test.ts`:

```ts
it("accepts opencode_go provider", () => {
    const result = pluginSuccessOutputSchema.safeParse({
        ...validOutput,
        items: [
            {
                ...validOutput.items[0],
                id: "opencode_go:rolling",
                provider: "opencode_go",
                source: "session",
                sourceInstanceId: "opencode-go-1",
                accountId: "opencode-go-1",
                accountLabel: "OpenCode Go",
                raw_label: "rolling",
                normalized_label: "滚动",
            },
        ],
    });

    expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run failing schema test**

Run:

```bash
pnpm vitest run tests/unit/shared/plugin-output.test.ts
```

Expected: FAIL because `opencode_go` is not in `usageProviderSchema`.

- [ ] **Step 3: Register provider**

In `src/shared/schemas/plugin-output.ts`, add `"opencode_go"` after `"mimo"` in `usageProviderSchema`.

In `src/renderer/lib/provider-usage.ts`, update:

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
    "opencode_go",
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
    opencode_go: "OpenCode Go",
};
```

In `src/renderer/lib/common-services.ts`, add:

```ts
    { id: "opencode_go", label: "OpenCode Go" },
```

In `src/renderer/components/Icon.tsx`, add to `VENDOR_MARKS`:

```ts
    opencode_go: (s) =>
        `<svg width="${String(s)}" height="${String(s)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>` +
        `<path d="M8.5 9.5l-2.5 2.5 2.5 2.5M15.5 9.5L18 12l-2.5 2.5M13.5 8.5l-3 7"/></svg>`,
```

- [ ] **Step 4: Verify provider tests pass**

Run:

```bash
pnpm vitest run tests/unit/shared/plugin-output.test.ts tests/unit/renderer/components/icon.test.tsx
```

Expected: PASS.

---

## Task 3: Connector Manifest Contract

**Files:**

- Create: `connectors/opencode_go/manifest.json`
- Modify: `tests/integration/connector/manifest-contract.test.ts`

- [ ] **Step 1: Update failing manifest contract test**

In `tests/integration/connector/manifest-contract.test.ts`, add `opencode_go` to `EXPECTED_PROVIDERS`:

```ts
    opencode_go: { secret_param: "SESSION_COOKIE", label: "登录 Cookie" },
```

And update session providers:

```ts
const session_providers = ["mimo", "kimi", "opencode_go"];
```

- [ ] **Step 2: Run failing manifest test**

Run:

```bash
pnpm vitest run tests/integration/connector/manifest-contract.test.ts
```

Expected: FAIL because `connectors/opencode_go/manifest.json` does not exist.

- [ ] **Step 3: Create manifest**

Create `connectors/opencode_go/manifest.json`:

```json
{
    "id": "opencode_go",
    "provider": "opencode_go",
    "capabilities": ["session"],
    "parameters": [
        {
            "name": "SESSION_COOKIE",
            "type": "secret",
            "required": true,
            "label": "Session Cookie",
            "label@zh-Hans": "登录 Cookie",
            "exposeToScript": true
        },
        {
            "name": "ACCOUNT_LABEL",
            "type": "string",
            "required": false,
            "default": "",
            "label": "Account Label",
            "label@zh-Hans": "账号名称",
            "exposeToScript": true
        }
    ],
    "endpoints": {
        "default": "https://opencode.ai",
        "login": "https://opencode.ai/auth"
    },
    "script": "connector.ts"
}
```

- [ ] **Step 4: Verify manifest test passes**

Run:

```bash
pnpm vitest run tests/integration/connector/manifest-contract.test.ts
```

Expected: PASS.

---

## Task 4: OpenCode Go Connector Runtime

**Files:**

- Create: `connectors/opencode_go/connector.ts`
- Create: `tests/unit/connector/opencode_go.test.ts`

- [ ] **Step 1: Write failing connector tests**

Create `tests/unit/connector/opencode_go.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext, RawHttpResponse } from "../../../src/main/core/connector/host-io";

const CONNECTOR_DIR = join(process.cwd(), "connectors", "opencode_go");
const HASH = "a".repeat(64);

function raw(status: number, body: string, headers: Record<string, string> = {}): RawHttpResponse {
    return { status, body, headers };
}

async function run_with(
    routes: Record<string, RawHttpResponse>,
    params: Record<string, string> = {},
) {
    const manifest = await load_manifest(CONNECTOR_DIR);
    if (!manifest) throw new Error("manifest missing");
    const script = await readFile(join(CONNECTOR_DIR, "connector.ts"), "utf8");
    const ctx: ConnectorContext = {
        log: {
            debug() {},
            info() {},
            warn() {},
            error() {},
        },
        http: {
            get_json: async () => null,
            post_json: async () => null,
            get_raw: async (_endpoint, path) => {
                const response = routes[path];
                if (!response) throw new Error(`unexpected path ${path}`);
                return response;
            },
        },
        files: {
            read: async () => "",
            list: async () => [],
        },
        params: {
            SESSION_COOKIE: "session=abc",
            ACCOUNT_LABEL: "Work",
            ...params,
        },
    };

    return run_connector(manifest, script, ctx, 5000);
}

describe("opencode_go connector", () => {
    it("emits rolling, weekly, and monthly observations", async () => {
        const result = await run_with({
            "/auth": raw(302, "", { location: "/workspace/ws_123" }),
            "/workspace/ws_123": raw(
                200,
                '<script type="module" src="/_build/assets/app.js"></script>',
            ),
            "/workspace/ws_123/go": raw(
                200,
                '<script type="module" src="/_build/assets/go.js"></script>',
            ),
            "/_build/assets/app.js": raw(200, ""),
            "/_build/assets/go.js": raw(
                200,
                `const x = lite.subscription.get; createServerReference("${HASH}")`,
            ),
            [`/_server?id=${HASH}&args=%7B%22t%22%3A%7B%22t%22%3A9%2C%22i%22%3A0%2C%22l%22%3A1%2C%22a%22%3A%5B%7B%22t%22%3A1%2C%22s%22%3A%22ws_123%22%7D%5D%2C%22o%22%3A0%7D%2C%22f%22%3A31%2C%22m%22%3A%5B%5D%7D`]:
                raw(
                    200,
                    JSON.stringify({
                        rollingUsage: { usagePercent: 12, resetInSec: 60, status: "normal" },
                        weeklyUsage: { usagePercent: 34, resetInSec: 120, status: "warning" },
                        monthlyUsage: { usagePercent: 56, resetInSec: 180, status: "critical" },
                    }),
                ),
        });

        expect(result.error).toBeNull();
        expect(result.observations.map((item) => item.raw_label)).toEqual([
            "rolling",
            "weekly",
            "monthly",
        ]);
        expect(result.observations[0]).toMatchObject({
            provider: "opencode_go",
            source: "session",
            account_id: "ws_123",
            account_label: "Work",
            raw_label: "rolling",
            normalized_label: "滚动",
            used: 12,
            limit: 100,
            display_style: "percent",
            window: "second",
        });
    });

    it("fails clearly when cookie is invalid", async () => {
        const result = await run_with({
            "/auth": raw(200, "login page"),
        });

        expect(result.error).toContain("Cookie 可能已失效，未跳转到 workspace");
    });

    it("fails clearly when server hash is missing", async () => {
        const result = await run_with({
            "/auth": raw(302, "", { location: "/workspace/ws_123" }),
            "/workspace/ws_123": raw(200, '<script src="/_build/assets/app.js"></script>'),
            "/workspace/ws_123/go": raw(200, ""),
            "/_build/assets/app.js": raw(200, "no server reference"),
        });

        expect(result.error).toContain("OpenCode Go 页面协议可能已变更");
    });
});
```

- [ ] **Step 2: Run failing connector tests**

Run:

```bash
pnpm vitest run tests/unit/connector/opencode_go.test.ts
```

Expected: FAIL because connector script does not exist.

- [ ] **Step 3: Implement connector**

Create `connectors/opencode_go/connector.ts` with no runtime imports/exports:

```ts
import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface UsageWindowPayload {
    readonly usagePercent?: number;
    readonly resetInSec?: number;
    readonly status?: string;
}

interface UsagePayload {
    readonly rollingUsage?: UsageWindowPayload;
    readonly weeklyUsage?: UsageWindowPayload;
    readonly monthlyUsage?: UsageWindowPayload;
}

const HEADERS = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function status_for(value: unknown): Observation["status"] {
    if (value === "warning" || value === "critical" || value === "normal") return value;
    return "normal";
}

function number_or_zero(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function extract_workspace_id(auth_status: number, location: string | undefined): string {
    if (auth_status < 300 || auth_status >= 400 || !location) {
        throw new Error("Cookie 可能已失效，未跳转到 workspace");
    }
    const match = location.match(/\/workspace\/([^/?#]+)/);
    if (!match?.[1]) throw new Error("workspace id 解析失败，请重新网页登录");
    return match[1];
}

function extract_asset_paths(html: string): string[] {
    const paths = new Set<string>();
    const regex = /["'](\/_build\/assets\/[^"']+\.js)["']/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        if (match[1]) paths.add(match[1]);
    }
    return [...paths];
}

function extract_subscription_hash(bundle: string): string | null {
    const references = [...bundle.matchAll(/createServerReference\("([a-f0-9]{64})"\)/g)];
    if (references.length === 0) return null;
    const marker = bundle.indexOf("lite.subscription.get");
    if (marker < 0) return references[0]?.[1] ?? null;

    let best: string | null = null;
    let best_distance = Number.POSITIVE_INFINITY;
    for (const reference of references) {
        const hash = reference[1];
        if (!hash) continue;
        const distance = Math.abs(reference.index - marker);
        if (distance < best_distance) {
            best = hash;
            best_distance = distance;
        }
    }
    return best;
}

function parse_usage_response(text: string): UsagePayload {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first < 0 || last < first) {
        throw new Error(`usage 响应解析失败: ${text.slice(0, 200)}`);
    }
    const parsed = JSON.parse(text.slice(first, last + 1)) as UsagePayload;
    if (!parsed.rollingUsage || !parsed.weeklyUsage || !parsed.monthlyUsage) {
        throw new Error(`usage 响应解析失败: ${text.slice(0, 200)}`);
    }
    return parsed;
}

function build_server_args(workspace_id: string): string {
    return encodeURIComponent(
        JSON.stringify({
            t: {
                t: 9,
                i: 0,
                l: 1,
                a: [{ t: 1, s: workspace_id }],
                o: 0,
            },
            f: 31,
            m: [],
        }),
    );
}

function observation_for(
    workspace_id: string,
    account_label: string,
    raw_label: "rolling" | "weekly" | "monthly",
    normalized_label: string,
    window: Observation["window"],
    payload: UsageWindowPayload,
    now: number,
): Observation {
    const used = number_or_zero(payload.usagePercent);
    const reset_seconds = number_or_zero(payload.resetInSec);
    return {
        provider: "opencode_go",
        source_instance_id: workspace_id,
        account_id: workspace_id,
        account_label,
        metric_id: `opencode_go:${workspace_id}:${raw_label}`,
        raw_label,
        normalized_label,
        used,
        limit: 100,
        window,
        display_style: "percent",
        observed_at: now,
        reset_at: reset_seconds > 0 ? now + reset_seconds * 1000 : null,
        source: "session",
        stale: false,
        status: status_for(payload.status),
        last_error: null,
    };
}

async function main(): Promise<Observation[]> {
    const cookie = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!cookie) throw new Error("Missing required secret: SESSION_COOKIE");

    const headers = { ...HEADERS, Cookie: cookie };
    const auth = await ctx.http.get_raw("default", "/auth", { headers, timeout_ms: 30000 });
    const workspace_id = extract_workspace_id(auth.status, auth.headers.location);

    const [workspace_page, go_page] = await Promise.all([
        ctx.http.get_raw("default", `/workspace/${workspace_id}`, { headers, timeout_ms: 30000 }),
        ctx.http.get_raw("default", `/workspace/${workspace_id}/go`, {
            headers,
            timeout_ms: 30000,
        }),
    ]);

    const asset_paths = [
        ...extract_asset_paths(workspace_page.body),
        ...extract_asset_paths(go_page.body),
    ];
    if (asset_paths.length === 0) throw new Error("无法从 OpenCode Go 页面提取 JS bundle");

    let hash: string | null = null;
    for (const path of asset_paths) {
        const bundle = await ctx.http.get_raw("default", path, { headers, timeout_ms: 30000 });
        hash = extract_subscription_hash(bundle.body);
        if (hash) break;
    }
    if (!hash) throw new Error("OpenCode Go 页面协议可能已变更");

    const usage = await ctx.http.get_raw(
        "default",
        `/_server?id=${hash}&args=${build_server_args(workspace_id)}`,
        { headers: { ...headers, Accept: "text/x-component" }, timeout_ms: 30000 },
    );
    const parsed = parse_usage_response(usage.body);
    const now = Date.now();
    const account_label = (ctx.params["ACCOUNT_LABEL"] ?? "").trim() || workspace_id;

    return [
        observation_for(
            workspace_id,
            account_label,
            "rolling",
            "滚动",
            "second",
            parsed.rollingUsage ?? {},
            now,
        ),
        observation_for(
            workspace_id,
            account_label,
            "weekly",
            "一周",
            "day",
            parsed.weeklyUsage ?? {},
            now,
        ),
        observation_for(
            workspace_id,
            account_label,
            "monthly",
            "一月",
            "month",
            parsed.monthlyUsage ?? {},
            now,
        ),
    ];
}

void main;
```

- [ ] **Step 4: Verify connector tests pass**

Run:

```bash
pnpm vitest run tests/unit/connector/opencode_go.test.ts
```

Expected: PASS.

---

## Task 5: Add Account UI Manual Cookie Import

**Files:**

- Modify: `src/renderer/components/AddAccountDialog.tsx`
- Modify: `tests/unit/renderer/components/add_account_dialog.test.tsx`

- [ ] **Step 1: Write failing AddAccountDialog tests**

In `tests/unit/renderer/components/add_account_dialog.test.tsx`, add a plugin fixture for `opencode_go` and tests:

```ts
it("parses OpenCode Go JSON cookie before save", async () => {
    const opencode_plugin: PluginInfo = {
        ...base_plugin,
        instanceId: "opencode-go-1",
        name: "OpenCode Go",
        displayName: "OpenCode Go",
        activeProviders: ["opencode_go"],
        supportedProviders: ["opencode_go"],
    };
    const user = userEvent.setup();
    render(
        <AddAccountDialog
            plugin_infos={[opencode_plugin]}
            has_cpa={false}
            on_close={on_close}
            on_save={on_save}
            on_cpa={on_cpa}
        />,
    );

    await user.click(screen.getByText("OpenCode Go"));
    await user.type(
        screen.getByPlaceholderText(/支持 JSON/),
        JSON.stringify([{ name: "session", value: "abc" }]),
    );
    await user.click(screen.getByText("添加账号"));

    await vi.waitFor(() => expect(on_save).toHaveBeenCalledTimes(1));
    expect(get_saved_params(on_save).secrets).toEqual({ SESSION_COOKIE: "session=abc" });
});

it("copies OpenCode Go browser cookie script", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
    });
    const opencode_plugin: PluginInfo = {
        ...base_plugin,
        instanceId: "opencode-go-1",
        name: "OpenCode Go",
        displayName: "OpenCode Go",
        activeProviders: ["opencode_go"],
        supportedProviders: ["opencode_go"],
    };
    const user = userEvent.setup();
    render(
        <AddAccountDialog
            plugin_infos={[opencode_plugin]}
            has_cpa={false}
            on_close={on_close}
            on_save={on_save}
            on_cpa={on_cpa}
        />,
    );

    await user.click(screen.getByText("OpenCode Go"));
    await user.click(screen.getByText("复制脚本"));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("opencode.ai");
    expect(writeText.mock.calls[0]?.[0]).toContain("navigator.clipboard.writeText");
});
```

- [ ] **Step 2: Run failing UI tests**

Run:

```bash
pnpm vitest run tests/unit/renderer/components/add_account_dialog.test.tsx
```

Expected: FAIL because OpenCode Go is not session-auth and parser/script UI is missing.

- [ ] **Step 3: Implement OpenCode Go add-account behavior**

In `src/renderer/components/AddAccountDialog.tsx`:

1. Import parser:

```ts
import { parse_cookie_text } from "../../shared/lib/cookie_parser";
```

2. Add to `VENDOR_AUTH_MAP`:

```ts
    opencode_go: "session",
```

3. Add to `AUTH_SESSION_META`:

```ts
    opencode_go: {
        host: "opencode.ai",
        login_url: "https://opencode.ai/auth",
        cookie_keys: ["session", "__Host-session", "__Secure-session"],
    },
```

4. Add script helper near `SessionForm`:

```ts
const OPENCODE_GO_COOKIE_SCRIPT = `(() => {
    if (!location.hostname.endsWith("opencode.ai")) {
        alert("请先打开 https://opencode.ai 后再运行此脚本");
        return;
    }
    const cookie = document.cookie.trim();
    if (!cookie) {
        alert("没有可读取 Cookie。HttpOnly Cookie 无法被脚本读取，请改用网页登录捕获或 DevTools/Application 导出。");
        return;
    }
    navigator.clipboard.writeText(cookie)
        .then(() => alert("OpenCode Go Cookie 已复制，可回到 OmniUsage 粘贴。"))
        .catch((error) => alert("复制失败：" + String(error)));
})();`;
```

5. In `SessionForm`, show copy button only for OpenCode Go:

```tsx
{
    vendor_id === "opencode_go" && (
        <button
            className="cf-secondary"
            type="button"
            onClick={() => {
                void navigator.clipboard.writeText(OPENCODE_GO_COOKIE_SCRIPT);
            }}
        >
            复制脚本
        </button>
    );
}
```

6. Change OpenCode placeholder to mention formats:

```tsx
placeholder={
    vendor_id === "opencode_go"
        ? "支持 JSON、EditThisCookie、Netscape、k=v; k=v"
        : "在浏览器登录 " + meta.host + " 后，从开发者工具复制完整 Cookie…"
}
```

7. In `handle_save`, parse OpenCode Go cookie before saving:

```ts
const cookie = data.cookie.trim();
if (cookie) {
    params.secrets = {
        SESSION_COOKIE: vendor_id === "opencode_go" ? parse_cookie_text(cookie).header : cookie,
    };
}
```

- [ ] **Step 4: Verify AddAccountDialog tests pass**

Run:

```bash
pnpm vitest run tests/unit/renderer/components/add_account_dialog.test.tsx tests/unit/shared/cookie_parser.test.ts
```

Expected: PASS.

---

## Task 6: Generic Session Login UI

**Files:**

- Modify: `src/renderer/components/SettingsForm.tsx`
- Modify: `src/renderer/views/SettingsView.tsx`
- Modify: `tests/unit/renderer/components/settings_form.test.tsx`

- [ ] **Step 1: Update failing SettingsForm tests**

Change the existing non-MiMo test to expect OpenCode Go support:

```ts
it("renders 网页登录 for OpenCode Go SESSION_COOKIE parameter", () => {
    renderForm({
        instanceId: "opencode-go-1",
        providerId: "opencode_go",
        parameters: [
            {
                name: "SESSION_COOKIE",
                label: "Cookie",
                type: "secret",
                required: true,
            },
        ],
        values: {},
        hasSecrets: {},
        onCookieLogin: vi.fn().mockResolvedValue(true),
    });
    expect(screen.getByText("网页登录")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run failing SettingsForm tests**

Run:

```bash
pnpm vitest run tests/unit/renderer/components/settings_form.test.tsx
```

Expected: FAIL because button is MiMo-only.

- [ ] **Step 3: Make SettingsForm generic**

In `src/renderer/components/SettingsForm.tsx`, replace:

```tsx
{providerId === "mimo" &&
    param.name === "SESSION_COOKIE" &&
    onCookieLogin && (
```

With:

```tsx
{providerId &&
    param.name === "SESSION_COOKIE" &&
    onCookieLogin && (
```

In `src/renderer/views/SettingsView.tsx`, update `onCookieLogin` so OpenCode Go uses session login:

```ts
const session_meta: Record<string, { login_url: string; cookie_names: string[] }> = {
    mimo: {
        login_url: "https://platform.xiaomimimo.com/console/plan-manage",
        cookie_names: ["api-platform_serviceToken", "api-platform_slh", "api-platform_ph"],
    },
    kimi: {
        login_url: "https://www.kimi.com/login",
        cookie_names: ["access_token", "refresh_token"],
    },
    opencode_go: {
        login_url: "https://opencode.ai/auth",
        cookie_names: ["session", "__Host-session", "__Secure-session"],
    },
};
```

Then inside `onCookieLogin`, use `pluginInfo.activeProviders[0]` to route:

```ts
const provider = pluginInfo.activeProviders[0];
const meta = provider ? session_meta[provider] : undefined;
const result = meta
    ? await window.usageboard.session.login({
          instance_id: id,
          login_url: meta.login_url,
          cookie_names: meta.cookie_names,
      })
    : await window.usageboard.auth.cookieLogin(id);
```

Keep existing refresh-on-saved behavior.

- [ ] **Step 4: Verify SettingsForm tests pass**

Run:

```bash
pnpm vitest run tests/unit/renderer/components/settings_form.test.tsx
```

Expected: PASS.

---

## Task 7: Session Manager OpenCode Capture

**Files:**

- Modify: `src/main/core/session/session-manager.ts`
- Modify: `tests/unit/session/session-manager.test.ts`

- [ ] **Step 1: Write failing session-manager test**

Append to `tests/unit/session/session-manager.test.ts`:

```ts
it("captures OpenCode Go _server Cookie header", async () => {
    const deps = create_deps();
    const manager = create_session_manager(deps);

    const promise = manager.start_login({
        instance_id: "opencode-go-1",
        login_url: "https://opencode.ai/auth",
        cookie_names: ["session"],
    });
    deps.emit_before_send_headers("https://opencode.ai/_server?id=abc", {
        Cookie: "session=abc",
    });
    deps.window.close();

    await expect(promise).resolves.toEqual({ saved: true });
    await expect(deps.vault.get("opencode-go-1:SESSION_COOKIE")).resolves.toBe("session=abc");
});
```

- [ ] **Step 2: Run failing session test**

Run:

```bash
pnpm vitest run tests/unit/session/session-manager.test.ts
```

Expected: FAIL because only `/api/v1/` request cookies are captured.

- [ ] **Step 3: Support OpenCode Go capture**

In `src/main/core/session/session-manager.ts`, replace:

```ts
if (!details.url.includes("/api/v1/")) return;
```

With:

```ts
if (!details.url.includes("/api/v1/") && !details.url.includes("/_server")) return;
```

No cookie values in logs.

- [ ] **Step 4: Verify session-manager tests pass**

Run:

```bash
pnpm vitest run tests/unit/session/session-manager.test.ts tests/unit/ipc/session-ipc.test.ts
```

Expected: PASS.

---

## Task 8: Documentation

**Files:**

- Modify: `docs/TEST.md`
- Modify: `docs/superpowers/specs/2026-06-27-opencode-go-design.md`

- [ ] **Step 1: Update test docs**

In `docs/TEST.md`, add an OpenCode Go manual validation subsection with exact steps:

```md
### OpenCode Go 手工验证

涉及 OpenCode Go UI 或 session 登录时，除 `pnpm test` 外，还需手工验证：

1. 打开设置。
2. 添加 `OpenCode Go`。
3. 粘贴 JSON / Netscape / `k=v; k=v` 任一格式 Cookie 并保存。
4. 手动刷新该 connector。
5. 概览出现 rolling / weekly / monthly 三条用量。
6. 再添加第二个 OpenCode Go 账号，确认显示为两个账号行。
7. 点击网页登录，关闭登录窗口后确认 Cookie 已保存，再刷新。

限制：控制台复制脚本无法读取 HttpOnly Cookie。遇到 HttpOnly 必需 Cookie 时，使用网页登录捕获或 DevTools/Application 导出。
```

- [ ] **Step 2: Update spec status**

In `docs/superpowers/specs/2026-06-27-opencode-go-design.md`, change:

```md
状态：待用户确认
```

To:

```md
状态：实施中
```

If final implementation changes cookie names or protocol assumptions, record them in the spec before completion.

- [ ] **Step 3: Verify docs mention the manual path**

Run:

```bash
pnpm vitest run tests/unit/shared/cookie_parser.test.ts
```

Expected: PASS. Docs are text-only, no separate doc test exists.

---

## Task 9: Full Verification and Review

**Files:**

- All modified files

- [ ] **Step 1: Run focused test set**

Run:

```bash
pnpm vitest run tests/unit/shared/cookie_parser.test.ts tests/unit/shared/plugin-output.test.ts tests/integration/connector/manifest-contract.test.ts tests/unit/connector/opencode_go.test.ts tests/unit/renderer/components/add_account_dialog.test.tsx tests/unit/renderer/components/settings_form.test.tsx tests/unit/session/session-manager.test.ts tests/unit/ipc/session-ipc.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run required full test suite**

Run:

```bash
pnpm test
```

Expected: PASS. If FAIL, fix only failures caused by this change. If unrelated existing failure appears, record exact failing test/output.

- [ ] **Step 3: Run typecheck if tests expose type drift**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review` or the project code-review agent on the current diff.

Expected: no critical findings. Fix confirmed findings only.

- [ ] **Step 5: Manual UI verification note**

Because this changes UI, do not claim packaged/user behavior fully verified unless one of these is true:

- Manual clicks were performed in the running Electron app; or
- The final response explicitly says: `自动化路径通过，UI 手工点击未验证。`

---

## Self-Review

- Spec coverage: connector instance model, session secret, cookie parser, copy script,网页登录, `/auth` workspace resolution, JS bundle/hash extraction, `/_server` usage fetch, three observations, provider UI, docs, tests all mapped to tasks.
- Placeholder scan: no TBD/TODO/implement later. Each code step gives concrete code or exact replacement.
- Type consistency: provider id is consistently `opencode_go`; display label is `OpenCode Go`; secret is `SESSION_COOKIE`; optional label is `ACCOUNT_LABEL`; observation raw labels are `rolling`, `weekly`, `monthly`.
