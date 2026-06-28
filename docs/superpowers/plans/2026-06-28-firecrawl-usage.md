# Firecrawl Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firecrawl as a first-class OmniUsage provider that polls Firecrawl usage with an API key.

**Architecture:** Follow the existing direct API-key connector pattern used by Tavily and MiniMax. Add a focused `connectors/firecrawl` poll connector, extend the provider schema/order/labels, and wire one official Firecrawl SVG logo into the existing `VendorMark` path.

**Tech Stack:** Electron, React, TypeScript, Vitest, Zod v3 schemas, existing connector runtime.

---

## File Structure

- Create: `connectors/firecrawl/manifest.json`
    - Declares provider id, API key secret, default endpoint, and poll request metadata.
- Create: `connectors/firecrawl/connector.ts`
    - Maps `GET /team/token-usage` response to OmniUsage observations.
- Create: `tests/integration/connector/firecrawl-connector.test.ts`
    - Verifies auth header, response mapping, missing key behavior, and invalid response error.
- Modify: `tests/integration/connector/manifest-contract.test.ts`
    - Adds Firecrawl to API-key connector contract.
- Modify: `src/shared/schemas/plugin-output.ts`
    - Adds `firecrawl` to `usageProviderSchema`.
- Modify: `src/renderer/lib/provider-usage.ts`
    - Adds Firecrawl provider order and display label.
- Modify: `src/renderer/components/Icon.tsx`
    - Imports and renders the official Firecrawl logo asset.
- Modify: `tests/unit/renderer/components/icon.test.tsx`
    - Asserts Firecrawl uses an official logo image.
- Create: `src/renderer/assets/vendor_logos/firecrawl.svg`
    - Extracted from `brand-assets.zip`; use `firecrawl-logo.svg`.
- Modify: `CLAUDE.md`
    - Adds Firecrawl to the project-supported providers list.
- Optional if schema export is required by tests: `schemas/plugin-output.schema.json`, `schemas/plugin-metadata.schema.json`
    - Regenerate with `pnpm schema:export` only if tests or checks expect committed schema files to match.

---

### Task 1: Add failing connector tests

**Files:**

- Create: `tests/integration/connector/firecrawl-connector.test.ts`

- [ ] **Step 1: Write the failing connector test**

Create `tests/integration/connector/firecrawl-connector.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const manifest: Manifest = {
    id: "firecrawl",
    provider: "firecrawl",
    capabilities: ["poll"],
    parameters: [
        {
            name: "API_KEY",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
    ],
    endpoints: { default: "https://api.firecrawl.dev" },
    poll: {
        request: { endpoint: "default", path: "/team/token-usage", method: "GET" },
        map: {},
    },
    script: "connector.ts",
};

function create_ctx(
    payload: unknown,
    params: Record<string, string> = { API_KEY: "test-key" },
): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json(endpoint_key, path, opts) {
                expect(endpoint_key).toBe("default");
                expect(path).toBe("/team/token-usage");
                expect(opts?.headers?.["Authorization"]).toBe("Bearer test-key");
                return Promise.resolve(payload);
            },
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params,
    };
}

async function run_firecrawl(payload: unknown, params?: Record<string, string>) {
    const script = await readFile(join("connectors", "firecrawl", "connector.ts"), "utf8");
    return run_connector(manifest, script, create_ctx(payload, params));
}

describe("firecrawl connector", () => {
    it("maps credit and token usage to observations", async () => {
        const result = await run_firecrawl({ credits: 100, tokens: 1500 });

        expect(result.error).toBeNull();
        expect(result.observations.map((o) => o.metric_id)).toEqual([
            "firecrawl:credits-total",
            "firecrawl:tokens-total",
        ]);

        expect(result.observations[0]).toEqual(
            expect.objectContaining({
                provider: "firecrawl",
                source_instance_id: "firecrawl",
                account_id: "firecrawl",
                account_label: "Firecrawl",
                raw_label: "credits",
                normalized_label: "积分",
                used: 100,
                limit: null,
                window: "month",
                display_style: "ratio",
                status: "normal",
                source: "poll",
                stale: false,
                last_error: null,
            }),
        );

        expect(result.observations[1]).toEqual(
            expect.objectContaining({
                metric_id: "firecrawl:tokens-total",
                raw_label: "tokens",
                normalized_label: "Tokens",
                used: 1500,
                limit: null,
            }),
        );
    });

    it("treats missing numeric fields as zero", async () => {
        const result = await run_firecrawl({});

        expect(result.error).toBeNull();
        expect(result.observations.map((o) => o.used)).toEqual([0, 0]);
    });

    it("returns no observations when API key is missing", async () => {
        const script = await readFile(join("connectors", "firecrawl", "connector.ts"), "utf8");
        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json: vi.fn(() => Promise.resolve({ credits: 100, tokens: 1500 })),
                post_json: () => Promise.resolve({}),
                get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
            },
            files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
            params: { API_KEY: "" },
        };

        const result = await run_connector(manifest, script, ctx);

        expect(result.error).toBeNull();
        expect(result.observations).toEqual([]);
        expect(ctx.http.get_json).not.toHaveBeenCalled();
    });

    it("throws when API response is not an object", async () => {
        const result = await run_firecrawl(null);

        expect(result.error).not.toBeNull();
        expect(result.error).toContain("Firecrawl API 返回格式异常");
        expect(result.observations).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/integration/connector/firecrawl-connector.test.ts
```

Expected: FAIL because `connectors/firecrawl/connector.ts` does not exist.

- [ ] **Step 3: Do not implement yet**

Stop after confirming the failure. Task 2 adds the minimal connector.

---

### Task 2: Implement Firecrawl connector

**Files:**

- Create: `connectors/firecrawl/manifest.json`
- Create: `connectors/firecrawl/connector.ts`

- [ ] **Step 1: Create manifest**

Create `connectors/firecrawl/manifest.json`:

```json
{
    "id": "firecrawl",
    "provider": "firecrawl",
    "capabilities": ["poll"],
    "parameters": [
        {
            "name": "API_KEY",
            "type": "secret",
            "required": true,
            "label": "API Key",
            "label@zh-Hans": "API 密钥",
            "exposeToScript": true
        }
    ],
    "endpoints": {
        "default": "https://api.firecrawl.dev"
    },
    "poll": {
        "request": {
            "endpoint": "default",
            "path": "/team/token-usage",
            "method": "GET"
        },
        "map": {}
    },
    "script": "connector.ts"
}
```

- [ ] **Step 2: Create connector**

Create `connectors/firecrawl/connector.ts`:

```ts
import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface TokenUsagePayload {
    readonly credits?: unknown;
    readonly tokens?: unknown;
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function main(): Promise<Observation[]> {
    const api_key = (ctx.params["API_KEY"] ?? "").trim();
    if (!api_key) return [];

    const response = (await ctx.http.get_json("default", "/team/token-usage", {
        headers: { Authorization: `Bearer ${api_key}` },
    })) as TokenUsagePayload | null;

    if (!is_record(response)) {
        throw new Error("Firecrawl API 返回格式异常: 缺少 usage 对象");
    }

    const now = Date.now();
    const base = {
        provider: "firecrawl",
        source_instance_id: "firecrawl",
        account_id: "firecrawl",
        account_label: "Firecrawl",
        window: "month" as const,
        display_style: "ratio" as const,
        reset_at: null,
        observed_at: now,
        source: "poll" as const,
        stale: false,
        last_error: null,
        status: "normal" as const,
        limit: null,
    };

    return [
        {
            ...base,
            metric_id: "firecrawl:credits-total",
            raw_label: "credits",
            normalized_label: "积分",
            used: Math.max(to_number(response["credits"]), 0),
        },
        {
            ...base,
            metric_id: "firecrawl:tokens-total",
            raw_label: "tokens",
            normalized_label: "Tokens",
            used: Math.max(to_number(response["tokens"]), 0),
        },
    ];
}

void main;
```

- [ ] **Step 3: Run connector test to verify it passes**

Run:

```bash
pnpm vitest run tests/integration/connector/firecrawl-connector.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit connector**

Run:

```bash
git add connectors/firecrawl/manifest.json connectors/firecrawl/connector.ts tests/integration/connector/firecrawl-connector.test.ts
git commit -m "feat: add firecrawl usage connector"
```

---

### Task 3: Add provider schema, ordering, labels, and manifest contract

**Files:**

- Modify: `src/shared/schemas/plugin-output.ts`
- Modify: `src/renderer/lib/provider-usage.ts`
- Modify: `tests/integration/connector/manifest-contract.test.ts`
- Test: existing `tests/unit/renderer/provider-usage.test.ts`

- [ ] **Step 1: Write failing manifest contract expectation**

In `tests/integration/connector/manifest-contract.test.ts`, add Firecrawl to `EXPECTED_PROVIDERS`:

```ts
const EXPECTED_PROVIDERS = {
    deepseek: { secret_param: "API_KEY", label: "API 密钥" },
    glm: { secret_param: "API_KEY", label: "API 密钥" },
    gemini: { secret_param: "API_KEY", label: "API 密钥" },
    tavily: { secret_param: "API_KEY", label: "API 密钥" },
    firecrawl: { secret_param: "API_KEY", label: "API 密钥" },
    minimax: { secret_param: "API_KEY", label: "API 密钥" },
    mimo: { secret_param: "SESSION_COOKIE", label: "登录 Cookie" },
    kimi: { secret_param: "SESSION_COOKIE", label: "登录 Cookie" },
    opencode_go: { secret_param: "SESSION_COOKIE", label: "登录 Cookie" },
} as const;
```

Also update the API key provider list:

```ts
const api_key_providers = ["deepseek", "glm", "gemini", "tavily", "firecrawl", "minimax"];
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm vitest run tests/integration/connector/manifest-contract.test.ts tests/unit/renderer/provider-usage.test.ts
```

Expected: FAIL because `firecrawl` is not in `usageProviderSchema`, `PROVIDER_ORDER`, or `PROVIDER_LABELS`.

- [ ] **Step 3: Add Firecrawl to provider schema**

In `src/shared/schemas/plugin-output.ts`, update `usageProviderSchema`:

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
    "firecrawl",
    "mimo",
    "opencode_go",
]);
```

- [ ] **Step 4: Add Firecrawl to provider order and label**

In `src/renderer/lib/provider-usage.ts`, update `PROVIDER_ORDER`:

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
    "firecrawl",
    "mimo",
    "opencode_go",
];
```

Update `PROVIDER_LABELS`:

```ts
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
    firecrawl: "Firecrawl",
    mimo: "MiMo",
    opencode_go: "OpenCode Go",
};
```

- [ ] **Step 5: Run provider and manifest tests**

Run:

```bash
pnpm vitest run tests/integration/connector/manifest-contract.test.ts tests/unit/renderer/provider-usage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit schema and provider wiring**

Run:

```bash
git add src/shared/schemas/plugin-output.ts src/renderer/lib/provider-usage.ts tests/integration/connector/manifest-contract.test.ts
git commit -m "feat: register firecrawl provider"
```

---

### Task 4: Add Firecrawl logo asset and rendering

**Files:**

- Create: `src/renderer/assets/vendor_logos/firecrawl.svg`
- Modify: `src/renderer/components/Icon.tsx`
- Modify: `tests/unit/renderer/components/icon.test.tsx`

- [ ] **Step 1: Write failing logo test**

In `tests/unit/renderer/components/icon.test.tsx`, add this test inside `describe("VendorMark", () => { ... })`:

```ts
it("renders official Firecrawl logo asset", () => {
    const { container } = render(<VendorMark id="firecrawl" />);
    const image = container.querySelector("span.vicon img");
    const svg = readFileSync(
        join(process.cwd(), "src/renderer/assets/vendor_logos/firecrawl.svg"),
        "utf8",
    );

    expect(image).toBeInTheDocument();
    expect(image).toHaveClass("vendor-logo-img");
    expect(image?.getAttribute("src")).toContain("firecrawl");
    expect(svg).toContain("Firecrawl");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/renderer/components/icon.test.tsx
```

Expected: FAIL because `firecrawl.svg` and `VENDOR_LOGOS.firecrawl` do not exist.

- [ ] **Step 3: Extract logo asset**

Run:

```bash
python - <<'PY'
import zipfile
from pathlib import Path
with zipfile.ZipFile('brand-assets.zip') as z:
    data = z.read('firecrawl-logo.svg').decode('utf-8')
Path('src/renderer/assets/vendor_logos/firecrawl.svg').write_text(data, encoding='utf-8')
PY
```

Open `src/renderer/assets/vendor_logos/firecrawl.svg`. If it lacks a title, insert this after the opening `<svg ...>` tag:

```xml
<title>Firecrawl</title>
```

- [ ] **Step 4: Wire logo into `VendorMark`**

In `src/renderer/components/Icon.tsx`, add import after the existing vendor logo imports:

```ts
import firecrawl_svg from "../assets/vendor_logos/firecrawl.svg";
```

Add Firecrawl to `VENDOR_LOGOS` after `tavily`:

```ts
const VENDOR_LOGOS: Record<string, string> = {
    claude: claude_svg,
    codex: codex_svg,
    gemini: gemini_svg,
    antigravity: antigravity_svg,
    kimi: kimi_svg,
    glm: glm_svg,
    deepseek: deepseek_svg,
    minimax: minimax_svg,
    tavily: tavily_svg,
    firecrawl: firecrawl_svg,
};
```

- [ ] **Step 5: Run logo test**

Run:

```bash
pnpm vitest run tests/unit/renderer/components/icon.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit logo wiring**

Run:

```bash
git add src/renderer/assets/vendor_logos/firecrawl.svg src/renderer/components/Icon.tsx tests/unit/renderer/components/icon.test.tsx
git commit -m "feat: add firecrawl logo"
```

---

### Task 5: Update docs and exported schemas

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/glossary.md`
- Modify: `docs/SPEC.md`
- Modify: `docs/omniusage-architecture-v2.md`
- Optional generated: `schemas/plugin-output.schema.json`, `schemas/plugin-metadata.schema.json`

- [ ] **Step 1: Update project provider list**

In `CLAUDE.md`, update the core feature line so it includes Firecrawl:

```md
集中展示多种 AI 服务的用量和费用：Claude、OpenAI Codex、Gemini、Antigravity、Kimi、智谱 GLM、MiniMax、DeepSeek、Tavily、Firecrawl、MiMo。
```

- [ ] **Step 2: Update glossary provider examples**

In `docs/glossary.md`, update the provider examples row to include `firecrawl` after `tavily`:

```md
| 厂商 | provider | `provider` | AI 服务商，UI 聚合维度 | `claude` `codex` `gemini` `glm` `minimax` `deepseek` `tavily` `firecrawl` `mimo` `kimi` `antigravity` |
```

- [ ] **Step 3: Update spec provider table**

In `docs/SPEC.md`, add this row near Tavily:

```md
| Firecrawl | `firecrawl-usage-plugin.ts` | 是 | 调用 Firecrawl API |
```

- [ ] **Step 4: Update architecture connector example list only if it enumerates providers**

In `docs/omniusage-architecture-v2.md`, if the provider list/table near the Tavily connector examples enumerates supported providers, add Firecrawl with endpoint `https://api.firecrawl.dev` and path `/team/token-usage`.

Use this manifest fragment if the file contains connector examples:

```json
{
    "id": "firecrawl",
    "provider": "firecrawl",
    "capabilities": ["poll"],
    "parameters": [{ "name": "API_KEY", "type": "secret", "required": true }],
    "endpoints": { "default": "https://api.firecrawl.dev" },
    "poll": { "request": { "endpoint": "default", "path": "/team/token-usage" }, "map": {} }
}
```

- [ ] **Step 5: Regenerate schema exports**

Run:

```bash
pnpm schema:export
```

Expected: command exits 0. If it changes `schemas/plugin-output.schema.json` or `schemas/plugin-metadata.schema.json`, include those generated files in the commit.

- [ ] **Step 6: Run focused checks**

Run:

```bash
pnpm vitest run tests/integration/connector/firecrawl-connector.test.ts tests/integration/connector/manifest-contract.test.ts tests/unit/renderer/provider-usage.test.ts tests/unit/renderer/components/icon.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit docs and schemas**

Run:

```bash
git add CLAUDE.md docs/glossary.md docs/SPEC.md docs/omniusage-architecture-v2.md schemas/plugin-output.schema.json schemas/plugin-metadata.schema.json
git commit -m "docs: document firecrawl provider"
```

If `schemas/*.json` or `docs/omniusage-architecture-v2.md` did not change, omit them from `git add`.

---

### Task 6: Full verification and final review

**Files:**

- No planned source edits.
- If review finds issues, fix only files touched by this plan.

- [ ] **Step 1: Run full tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run code review subagent**

Use `ecc:typescript-reviewer` or `ecc:code-reviewer` on changed TypeScript/React files.

Ask it to check:

- Firecrawl API key is not committed.
- Connector output uses existing observation naming conventions.
- Provider schema/order/labels are complete.
- Logo import does not break `VendorMark` fallback behavior.
- Docs match code.

- [ ] **Step 3: Apply review fixes if needed**

If review finds a real issue, make the smallest fix and rerun the focused test that covers it.

- [ ] **Step 4: Run full tests again if any fix was applied**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
```

Expected: only `brand-assets.zip` remains untracked unless the user wants it removed or committed. Do not commit `brand-assets.zip`.

- [ ] **Step 6: Commit final fixes if any**

If Task 6 changed files, commit them:

```bash
git add <changed-files>
git commit -m "fix: refine firecrawl usage support"
```

Do not commit `brand-assets.zip`.

---

## Self-Review

- Spec coverage: connector, schema, provider order/label, official logo, tests, and docs are covered by Tasks 1-6.
- Placeholder scan: no TBD/TODO/fill-in placeholders. Conditional schema/doc steps are explicit and bounded.
- Type consistency: provider id is consistently `firecrawl`; endpoint is consistently `GET /team/token-usage`; observation ids are consistently `firecrawl:credits-total` and `firecrawl:tokens-total`.
