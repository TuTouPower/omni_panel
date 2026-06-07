# CPA Connector UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild OmniUsage so CPA is a connector/data source while the main UI is provider-first: Claude, Codex, Gemini, Antigravity, Kimi, GLM, MiniMax, DeepSeek, and Tavily.

**Architecture:** Keep existing `plugin:*` IPC channels and persisted `PluginConfiguration.instanceId`, but expose connector/provider semantics in DTOs and renderer code. Require plugin output schema v2 for all bundled plugins, aggregate usage items by provider in shared renderer logic, and render CPA only in settings/data-source UI.

**Tech Stack:** TypeScript, React 19, Electron, Vite, Zod v3, Vitest, Playwright, electron-vite/electron-builder.

---

## File Structure

### Shared schema/types

- Modify `src/shared/schemas/plugin-output.ts`
    - Define `usageProviderSchema`, `usageSourceSchema`.
    - Require `schemaVersion: 2` for success output.
    - Add `provider`, `source`, `sourceInstanceId`, `accountId`, `accountLabel` to `usageItemSchema`.
- Modify `src/shared/schemas/plugin-metadata.ts`
    - Add `supportedProviders?: UsageProvider[]`.
    - Add `defaultSource?: UsageSource` so IPC does not guess connector source from plugin name.
- Modify `src/shared/types/config.ts`
    - Remove `overviewDisplayMode` from exported `AppConfiguration`.
- Modify `src/shared/types/ipc.ts`
    - Add connector-oriented aliases/interfaces while keeping `plugin:*` channels.
    - Add `activeProviders` computed from connector config, so CPA monitor switches control visible provider tabs.
    - Keep `PluginInfo` as compatibility alias if too many files still import it, but add `ConnectorInfo` and document naming.

### Main process/runtime

- Modify `src/main/core/config/config-store.ts`
    - Strip/migrate `overviewDisplayMode` when loading/saving old configs.
- Modify plugin execution path:
    - Inspect first: `src/main/core/scheduler/refresh-service.ts`, `src/main/core/plugin/runner.ts`, `src/main/core/plugin/sdk-runtime.ts` or equivalent runner files.
    - Pass source instance ID to plugin runtime via env or SDK context.
- Modify `src/main/ipc/plugin-ipc.ts`
    - Map `instanceId` to `sourceInstanceId` and expose `supportedProviders`/`source`.
    - Add provider refresh handler only if current IPC supports per-provider refresh. Otherwise keep refresh all + connector refresh for this implementation.

### Plugin files

- Modify all bundled plugins:
    - `assets/plugins/cpa-usage-plugin.ts`
    - `assets/plugins/claude-usage-plugin.ts`
    - `assets/plugins/codex-usage-plugin.ts`
    - `assets/plugins/glm-usage-plugin.ts`
    - `assets/plugins/minimax-usage-plugin.ts`
    - `assets/plugins/deepseek-usage-plugin.ts`
    - `assets/plugins/tavily-usage-plugin.ts`
- Add metadata `supportedProviders` and output schema v2 usage item metadata.

### Renderer provider UI

- Create `src/renderer/lib/provider-usage.ts`
    - Pure aggregation functions.
    - No React imports.
- Create `src/renderer/components/ProviderNav.tsx`
- Create `src/renderer/components/ProviderOverview.tsx`
- Create `src/renderer/components/ProviderCard.tsx`
- Create `src/renderer/components/ProviderAccountList.tsx`
- Create `src/renderer/components/ProviderAccountRow.tsx`
- Create `src/renderer/components/ConnectorStatusCard.tsx`
- Modify `src/renderer/views/PopupView.tsx`
    - Stop rendering `PluginCard` in main UI.
    - Render provider nav, overview, and provider account list.

### Renderer settings UI

- Create `src/renderer/components/CpaConnectorSettings.tsx`
- Modify `src/renderer/views/SettingsView.tsx`
    - Group settings by data source.
    - CPA gets connector-specific page.
    - Other plugins keep `SettingsForm` flow.
- Modify `src/renderer/components/SettingsForm.tsx` only if needed for connector metadata fields.

### Tests

- Modify/add unit tests:
    - `tests/unit/shared/plugin-output.test.ts`
    - `tests/unit/plugin/bundled-metadata.test.ts`
    - `tests/integration/plugin/*-plugin.test.ts`
    - `tests/unit/renderer/provider-usage.test.ts`
    - `tests/unit/ipc/plugin-ipc.test.ts`
    - `tests/integration/config/config-store.test.ts`
- Modify/add component tests:
    - `tests/unit/renderer/views/popup_view.test.tsx`
    - `tests/unit/renderer/views/settings_view.test.tsx`
    - `tests/unit/renderer/components/cpa_connector_settings.test.tsx`
- Modify E2E/smoke:
    - `tests/user_e2e/specs/popup_view.spec.ts`
    - `tests/user_e2e/specs/plugin_config.spec.ts`
    - `tests/packaged_smoke/smoke.spec.ts`

### Docs

- Modify `CLAUDE.md`
- Modify `docs/plugin-contract.md`
- Modify `docs/spec.md`
- Modify `docs/test.md`
- Modify `docs/test-coverage-matrix.md`

---

## Task 1: Define provider/source schemas and reject v1 output

**Files:**

- Modify: `src/shared/schemas/plugin-output.ts`
- Test: `tests/unit/shared/plugin-output.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `tests/unit/shared/plugin-output.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pluginResultSchema } from "../../../src/shared/schemas/plugin-output";

const baseItem = {
    id: "claude:acct:5h",
    provider: "claude",
    source: "api_key",
    sourceInstanceId: "claude-1",
    accountId: "claude-1",
    accountLabel: "Claude Account",
    name: "Claude · 5小时",
    used: 20,
    limit: 100,
    displayStyle: "percent",
    status: "normal",
};

describe("plugin output schema v2", () => {
    it("accepts schema version 2 usage items with provider source and account metadata", () => {
        const parsed = pluginResultSchema.safeParse({
            success: true,
            schemaVersion: 2,
            updatedAt: "2026-05-31T00:00:00Z",
            items: [baseItem],
        });

        expect(parsed.success).toBe(true);
    });

    it("rejects schema version 1 output", () => {
        const parsed = pluginResultSchema.safeParse({
            success: true,
            schemaVersion: 1,
            updatedAt: "2026-05-31T00:00:00Z",
            items: [baseItem],
        });

        expect(parsed.success).toBe(false);
    });

    it("rejects item without provider metadata", () => {
        const { provider, ...itemWithoutProvider } = baseItem;
        const parsed = pluginResultSchema.safeParse({
            success: true,
            schemaVersion: 2,
            updatedAt: "2026-05-31T00:00:00Z",
            items: [itemWithoutProvider],
        });

        expect(parsed.success).toBe(false);
    });

    it("rejects unsupported provider values", () => {
        const parsed = pluginResultSchema.safeParse({
            success: true,
            schemaVersion: 2,
            updatedAt: "2026-05-31T00:00:00Z",
            items: [{ ...baseItem, provider: "cpa" }],
        });

        expect(parsed.success).toBe(false);
    });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npx vitest run tests/unit/shared/plugin-output.test.ts
```

Expected: FAIL because schema currently accepts numeric `schemaVersion` and items do not require provider/source metadata.

- [ ] **Step 3: Implement schema v2**

Replace the top of `src/shared/schemas/plugin-output.ts` with this structure, preserving chart schemas already present:

```ts
import { z } from "zod/v3";

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
]);

export const usageSourceSchema = z.enum(["cpa", "direct", "local", "api_key", "oauth"]);
export const usageDisplayStyleSchema = z.enum(["percent", "ratio"]);
export const usageStatusSchema = z.enum(["normal", "warning", "critical", "unknown"]);
export const usageColorSchema = z.enum(["blue", "green", "yellow", "orange", "red"]);

export const usageItemSchema = z.object({
    id: z.string(),
    provider: usageProviderSchema,
    source: usageSourceSchema,
    sourceInstanceId: z.string(),
    accountId: z.string(),
    accountLabel: z.string(),
    name: z.string(),
    used: z.number(),
    limit: z.number(),
    displayStyle: usageDisplayStyleSchema,
    resetAt: z.string().nullable().optional(),
    status: usageStatusSchema.default("unknown"),
    color: usageColorSchema.optional(),
});
```

Then change success output schema:

```ts
export const pluginSuccessOutputSchema = z.object({
    success: z.literal(true),
    schemaVersion: z.literal(2),
    updatedAt: z.string(),
    items: z.array(usageItemSchema),
    badge: z.string().optional(),
    chart: pluginChartSchema.optional(),
});
```

Ensure exports include:

```ts
export type UsageProvider = z.infer<typeof usageProviderSchema>;
export type UsageSource = z.infer<typeof usageSourceSchema>;
export type UsageItem = z.infer<typeof usageItemSchema>;
```

- [ ] **Step 4: Run schema test**

Run:

```bash
npx vitest run tests/unit/shared/plugin-output.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/schemas/plugin-output.ts tests/unit/shared/plugin-output.test.ts
git commit -m "feat(schema): require provider usage output v2"
```

---

## Task 2: Add supported provider metadata

**Files:**

- Modify: `src/shared/schemas/plugin-metadata.ts`
- Modify: `assets/plugins/*.ts`
- Test: `tests/unit/plugin/bundled-metadata.test.ts`

- [ ] **Step 1: Write failing metadata test**

Open `tests/unit/plugin/bundled-metadata.test.ts`. Add assertions to the existing bundled metadata cases:

```ts
const expectedProvidersByPlugin: Record<string, string[]> = {
    "claude-usage-plugin.ts": ["claude"],
    "codex-usage-plugin.ts": ["codex"],
    "cpa-usage-plugin.ts": ["claude", "codex", "gemini", "antigravity", "kimi"],
    "deepseek-usage-plugin.ts": ["deepseek"],
    "glm-usage-plugin.ts": ["glm"],
    "minimax-usage-plugin.ts": ["minimax"],
    "tavily-usage-plugin.ts": ["tavily"],
};

for (const [scriptName, supportedProviders] of Object.entries(expectedProvidersByPlugin)) {
    it(`${scriptName} declares supportedProviders`, async () => {
        const metadata = await loadBundledMetadata(scriptName);
        expect(metadata.supportedProviders).toEqual(supportedProviders);
    });
}
```

If the file uses a different helper name than `loadBundledMetadata`, adapt only the helper name; keep the same expected mapping.

- [ ] **Step 2: Run failing metadata test**

Run:

```bash
npx vitest run tests/unit/plugin/bundled-metadata.test.ts
```

Expected: FAIL because metadata schema and plugin comment blocks do not declare `supportedProviders` yet.

- [ ] **Step 3: Update metadata schema**

In `src/shared/schemas/plugin-metadata.ts`, import provider and source schemas and add fields:

```ts
import { usageProviderSchema, usageSourceSchema } from "./plugin-output";
```

Then update `pluginMetadataSchema` object:

```ts
export const pluginMetadataSchema = z
    .object({
        name: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        parameters: z.array(pluginParameterMetadataSchema).optional(),
        endpoints: pluginEndpointsSchema.optional(),
        supportedProviders: z.array(usageProviderSchema).optional(),
        defaultSource: usageSourceSchema.optional(),
    })
    .passthrough();
```

- [ ] **Step 4: Update plugin comment metadata**

In each `assets/plugins/*.ts` `UsageBoardPlugin` JSON block, add exact provider list.

CPA:

```json
"supportedProviders": ["claude", "codex", "gemini", "antigravity", "kimi"],
"defaultSource": "cpa"
```

Claude:

```json
"supportedProviders": ["claude"],
"defaultSource": "api_key"
```

Codex:

```json
"supportedProviders": ["codex"],
"defaultSource": "api_key"
```

GLM:

```json
"supportedProviders": ["glm"],
"defaultSource": "api_key"
```

MiniMax:

```json
"supportedProviders": ["minimax"],
"defaultSource": "api_key"
```

DeepSeek:

```json
"supportedProviders": ["deepseek"],
"defaultSource": "api_key"
```

Tavily:

```json
"supportedProviders": ["tavily"],
"defaultSource": "api_key"
```

- [ ] **Step 5: Run metadata test**

Run:

```bash
npx vitest run tests/unit/plugin/bundled-metadata.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/schemas/plugin-metadata.ts assets/plugins tests/unit/plugin/bundled-metadata.test.ts
git commit -m "feat(plugin): declare supported providers"
```

---

## Task 3: Pass source instance ID into plugin runtime

**Files:**

- Inspect/Modify: `src/main/core/scheduler/refresh-service.ts`
- Inspect/Modify: plugin runner file under `src/main/core/plugin/`
- Test: `tests/integration/scheduler/refresh-service.test.ts`

- [ ] **Step 1: Find plugin execution call**

Run:

```bash
rg "runPlugin|executePlugin|spawn|parameterValues|endpointOverrides" src/main/core src/main/ipc
```

Expected: Identify the runner function called by `refresh-service.ts`.

- [ ] **Step 2: Write failing runtime context test**

In `tests/integration/scheduler/refresh-service.test.ts`, add a test near existing successful refresh tests. Use the existing test harness style. The plugin fixture should output the received source instance ID:

```ts
it("passes plugin instance id as source instance id", async () => {
    const plugin = makePluginConfig({
        instanceId: "deepseek-1",
        stateId: "deepseek-1",
        name: "DeepSeek",
    });
    const script = writePluginScript(`
        console.log(JSON.stringify({
            success: true,
            schemaVersion: 2,
            updatedAt: "2026-05-31T00:00:00Z",
            items: [{
                id: "deepseek-1:default",
                provider: "deepseek",
                source: "api_key",
                sourceInstanceId: process.env.OMNI_SOURCE_INSTANCE_ID,
                accountId: process.env.OMNI_SOURCE_INSTANCE_ID,
                accountLabel: "DeepSeek",
                name: "DeepSeek",
                used: 1,
                limit: 100,
                displayStyle: "percent",
                status: "normal"
            }]
        }));
    `);

    await refreshService.refresh(plugin.instanceId, { force: true });
    const snapshot = runtimeStore.getSnapshot(plugin.instanceId);

    expect(snapshot.status).toBe("ready");
    if (snapshot.status !== "ready") return;
    expect(snapshot.items[0]?.sourceInstanceId).toBe("deepseek-1");
});
```

Use existing helpers instead of `makePluginConfig`/`writePluginScript` if this file already defines different names.

- [ ] **Step 3: Run failing test**

Run:

```bash
npx vitest run tests/integration/scheduler/refresh-service.test.ts -t "source instance id"
```

Expected: FAIL because `OMNI_SOURCE_INSTANCE_ID` is not set.

- [ ] **Step 4: Implement runtime env**

In the plugin runner invocation, add environment variable:

```ts
const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    OMNI_SOURCE_INSTANCE_ID: plugin.instanceId,
};
```

If the runner receives only executable path and params, extend its argument object:

```ts
interface PluginRunRequest {
    executablePath: string;
    parameters: Record<string, string>;
    endpointOverrides: Record<string, string>;
    sourceInstanceId: string;
}
```

Pass `plugin.instanceId` from `refresh-service.ts`.

- [ ] **Step 5: Run targeted test**

Run:

```bash
npx vitest run tests/integration/scheduler/refresh-service.test.ts -t "source instance id"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/core tests/integration/scheduler/refresh-service.test.ts
git commit -m "feat(runtime): pass source instance id to plugins"
```

---

## Task 4: Convert bundled plugins to schema v2 output

**Files:**

- Modify: `assets/plugins/cpa-usage-plugin.ts`
- Modify: `assets/plugins/claude-usage-plugin.ts`
- Modify: `assets/plugins/codex-usage-plugin.ts`
- Modify: `assets/plugins/glm-usage-plugin.ts`
- Modify: `assets/plugins/minimax-usage-plugin.ts`
- Modify: `assets/plugins/deepseek-usage-plugin.ts`
- Modify: `assets/plugins/tavily-usage-plugin.ts`
- Test: `tests/integration/plugin/*.test.ts`

- [ ] **Step 1: Update integration test expectations**

For each plugin integration test under `tests/integration/plugin/`, update expected items to include metadata.

Example for API-key plugins:

```ts
expect(parsed.items[0]).toEqual(
    expect.objectContaining({
        provider: "deepseek",
        source: "api_key",
        sourceInstanceId: expect.any(String),
        accountId: expect.any(String),
        accountLabel: expect.any(String),
    }),
);
```

CPA Claude expectation:

```ts
expect(parsed.items).toContainEqual(
    expect.objectContaining({
        id: "cpa:claude:claude-user:5小时",
        provider: "claude",
        source: "cpa",
        sourceInstanceId: expect.any(String),
        accountId: "claude-user",
        accountLabel: "user@example.com",
        name: "Claude (user@example.com) · 5小时",
    }),
);
```

Gemini mapping expectation in `tests/integration/plugin/cpa-plugin.test.ts`:

```ts
it("maps gemini-cli auth files to gemini usage provider", async () => {
    const { parsed } = await runWithStubBackend({
        pluginFile: "cpa-usage-plugin.ts",
        params: { cpa_mgmt_key: "secret-management-key", monitor_gemini: "true" },
        endpointKey: "default",
        routes: geminiQuotaRoutes(),
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.items[0]).toEqual(
        expect.objectContaining({
            provider: "gemini",
            source: "cpa",
        }),
    );
});
```

Use existing route helper names if present; otherwise add local route objects matching existing CPA test style.

- [ ] **Step 2: Run failing plugin tests**

Run:

```bash
npx vitest run tests/integration/plugin --no-file-parallelism
```

Expected: FAIL because plugins still emit schema v1/missing metadata.

- [ ] **Step 3: Add shared plugin helpers inside each plugin as needed**

In each plugin file, define:

```ts
const SOURCE_INSTANCE_ID = process.env.OMNI_SOURCE_INSTANCE_ID ?? "unknown-source";
```

For single-account API key plugins, use:

```ts
const accountId = SOURCE_INSTANCE_ID;
const accountLabel = metadataNameOrProviderLabel;
```

Do not use raw API keys in labels.

- [ ] **Step 4: Convert non-CPA plugins**

Each success output must be:

```ts
return ok({
    items: [
        {
            id: `${SOURCE_INSTANCE_ID}:default`,
            provider: "deepseek",
            source: "api_key",
            sourceInstanceId: SOURCE_INSTANCE_ID,
            accountId: SOURCE_INSTANCE_ID,
            accountLabel: "DeepSeek",
            name: "DeepSeek",
            used,
            limit,
            displayStyle: "percent",
            resetAt,
            status,
            color,
        },
    ],
});
```

Use each plugin's actual provider/name:

| File                       | provider   | accountLabel |
| -------------------------- | ---------- | ------------ |
| `claude-usage-plugin.ts`   | `claude`   | `Claude`     |
| `codex-usage-plugin.ts`    | `codex`    | `Codex`      |
| `glm-usage-plugin.ts`      | `glm`      | `GLM`        |
| `minimax-usage-plugin.ts`  | `minimax`  | `MiniMax`    |
| `deepseek-usage-plugin.ts` | `deepseek` | `DeepSeek`   |
| `tavily-usage-plugin.ts`   | `tavily`   | `Tavily`     |

- [ ] **Step 5: Convert CPA plugin**

In `assets/plugins/cpa-usage-plugin.ts`, keep `PROVIDER_REGISTRY` keys matching CPA-Manager auth file providers, but parse output providers separately. Update every existing parser (`parseClaude`, `parseCodex`, `parseGeminiBuckets`, `parseAntigravityModels`, `parseKimi`) from `(body, email)` to `(body, account: CpaAccount)` so item builders can use `account.accountId` and `account.accountLabel`.

```ts
interface ProviderEntry {
    usageProvider: UsageProvider;
    fetch: (...args) => Promise<Record<string, unknown>>;
    parse: (body: Record<string, unknown>, account: CpaAccount) => UsageItem[];
}

interface CpaAccount {
    authIndex: string;
    accountId: string;
    accountLabel: string;
}
```

Registry:

```ts
const PROVIDER_REGISTRY: Record<string, ProviderEntry> = {
    claude: { usageProvider: "claude", fetch: fetchClaudeQuota, parse: parseClaude },
    codex: { usageProvider: "codex", fetch: fetchCodexQuota, parse: parseCodex },
    "gemini-cli": { usageProvider: "gemini", fetch: fetchGeminiQuota, parse: parseGeminiBuckets },
    antigravity: {
        usageProvider: "antigravity",
        fetch: fetchAntigravityQuota,
        parse: parseAntigravityModels,
    },
    kimi: { usageProvider: "kimi", fetch: fetchKimiQuota, parse: parseKimi },
};
```

CPA item shape:

```ts
items.push({
    id: `cpa:${provider}:${account.accountId}:${label}`,
    provider,
    source: "cpa",
    sourceInstanceId: SOURCE_INSTANCE_ID,
    accountId: account.accountId,
    accountLabel: account.accountLabel,
    name: `Claude (${account.accountLabel}) · ${label}`,
    used: Math.round(pct * 10) / 10,
    limit: 100.0,
    displayStyle: "percent",
    resetAt,
    status: statusFor(pct, 100),
    color: colorForPct(pct),
});
```

Use `auth_index` for `accountId` and email/remark/masked identifier for `accountLabel`. If tests need a deterministic shorter value, set test auth file `auth_index: "claude-user"`.

- [ ] **Step 6: Run plugin tests**

Run:

```bash
npx vitest run tests/integration/plugin --no-file-parallelism
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/plugins tests/integration/plugin
git commit -m "feat(plugins): emit provider usage schema v2"
```

---

## Task 5: Remove overviewDisplayMode from config with migration

**Files:**

- Modify: `src/shared/types/config.ts`
- Modify: `src/main/core/config/config-store.ts`
- Test: `tests/integration/config/config-store.test.ts`
- Test: `tests/unit/ipc/config-ipc.test.ts` if type fixtures include config objects

- [ ] **Step 1: Write failing config migration test**

In `tests/integration/config/config-store.test.ts`, add:

```ts
it("loads old config with overviewDisplayMode and saves without it", async () => {
    const store = createConfigStoreForTest();
    await writeRawConfig({
        schemaVersion: 1,
        language: "zh-Hans",
        overviewDisplayMode: "tabs",
        plugins: [],
        launchAtLogin: false,
    });

    const config = await store.load();
    expect("overviewDisplayMode" in config).toBe(false);

    await store.save(config);
    const raw = await readRawConfig();
    expect(raw).not.toHaveProperty("overviewDisplayMode");
});
```

Use existing helpers in the file. If there is no `writeRawConfig`, write JSON to the test config path using existing temp dir path.

- [ ] **Step 2: Run failing config test**

Run:

```bash
npx vitest run tests/integration/config/config-store.test.ts -t "overviewDisplayMode"
```

Expected: FAIL because type/model still includes `overviewDisplayMode`.

- [ ] **Step 3: Remove from exported type**

In `src/shared/types/config.ts`, remove:

```ts
readonly overviewDisplayMode: "grouped" | "tabs";
```

- [ ] **Step 4: Strip old field in config store**

In config normalization/load logic, destructure the old field out before schema parsing. Do not parse first and strip later; the migration test must fail if `overviewDisplayMode` reaches the new config schema.

```ts
function stripRemovedConfigFields(config: Record<string, unknown>): Record<string, unknown> {
    const { overviewDisplayMode: _overviewDisplayMode, ...rest } = config;
    return rest;
}
```

Apply this before schema parse. Saving then writes the stripped object, so `overviewDisplayMode` never appears in the new persisted shape.

- [ ] **Step 5: Update fixtures**

Search and remove `overviewDisplayMode` from tests/fixtures:

```bash
rg "overviewDisplayMode" src tests fixtures
```

For old-config migration test only, keep the field intentionally.

- [ ] **Step 6: Run config tests**

Run:

```bash
npx vitest run tests/integration/config/config-store.test.ts tests/unit/ipc/config-ipc.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/config.ts src/main/core/config tests/integration/config/config-store.test.ts tests/unit/ipc/config-ipc.test.ts
git commit -m "feat(config): migrate provider overview settings"
```

---

## Task 6: Expose connector-oriented IPC DTO

**Files:**

- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/ipc/plugin-ipc.ts`
- Test: `tests/unit/ipc/plugin-ipc.test.ts`

- [ ] **Step 1: Write failing IPC test**

In `tests/unit/ipc/plugin-ipc.test.ts`, update the list test to expect connector fields:

```ts
expect(result.ok).toBe(true);
if (!result.ok) return;
expect(result.data[0]).toEqual(
    expect.objectContaining({
        sourceInstanceId: "deepseek-1",
        source: "api_key",
        supportedProviders: ["deepseek"],
        activeProviders: ["deepseek"],
    }),
);
```

Also ensure CPA metadata maps source:

```ts
expect(cpaConnector).toEqual(
    expect.objectContaining({
        source: "cpa",
        supportedProviders: ["claude", "codex", "gemini", "antigravity", "kimi"],
        activeProviders: ["claude", "codex"],
    }),
);
```

The CPA fixture must set `parameterValues.monitor_claude = "true"`, `parameterValues.monitor_codex = "true"`, and `parameterValues.monitor_gemini = "false"` to prove `activeProviders` follows monitor switches.

- [ ] **Step 2: Run failing IPC test**

Run:

```bash
npx vitest run tests/unit/ipc/plugin-ipc.test.ts
```

Expected: FAIL because `PluginInfo` lacks connector fields.

- [ ] **Step 3: Add connector types**

In `src/shared/types/ipc.ts`:

```ts
import type { UsageItem, PluginChart, UsageProvider, UsageSource } from "../schemas/plugin-output";

export type ConnectorSnapshotDTO = PluginSnapshotDTO;

export interface ConnectorInfo {
    sourceInstanceId: string;
    stateId: string;
    name: string;
    displayName: string;
    enabled: boolean;
    source: UsageSource;
    supportedProviders: readonly UsageProvider[];
    activeProviders: readonly UsageProvider[];
    metadata: PluginMetadata | null;
    snapshot: ConnectorSnapshotDTO;
}

/** Historical channel names still say plugin, but renderer treats these as connectors. */
export type PluginInfo = ConnectorInfo;
```

Keep `UsageboardApi.plugin.list(): Promise<PluginInfo[]>;` unless changing channel names too.

- [ ] **Step 4: Map fields in plugin IPC**

In `src/main/ipc/plugin-ipc.ts`, read connector source from metadata instead of plugin name. Add helpers:

```ts
function sourceFromMetadata(metadata: PluginMetadata | null): UsageSource {
    return metadata?.defaultSource ?? "direct";
}

function activeProvidersForConnector(
    plugin: PluginConfiguration,
    metadata: PluginMetadata | null,
): UsageProvider[] {
    const supported = metadata?.supportedProviders ?? [];
    if (metadata?.defaultSource !== "cpa") return supported;

    return supported.filter((provider) => {
        const key = `monitor_${provider}`;
        return plugin.parameterValues[key] === "true";
    });
}
```

Do not hard-code Claude/Codex as `oauth`; their connector source comes from metadata/config so API-key instances remain accurate. If a connector later supports multiple auth modes, compute the exact `source` from that connector's config before falling back to `metadata.defaultSource`.

When building list items:

```ts
const metadata =
    pluginEntries.find((e) => e.config.instanceId === plugin.instanceId)?.metadata ?? null;
return {
    sourceInstanceId: plugin.instanceId,
    stateId: plugin.stateId,
    name: plugin.name,
    displayName: displayNames.get(plugin.instanceId) ?? plugin.name,
    enabled: plugin.enabled,
    source: sourceFromMetadata(metadata),
    supportedProviders: metadata?.supportedProviders ?? [],
    activeProviders: activeProvidersForConnector(plugin, metadata),
    metadata,
    snapshot,
};
```

- [ ] **Step 5: Run IPC test**

Run:

```bash
npx vitest run tests/unit/ipc/plugin-ipc.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/ipc.ts src/main/ipc/plugin-ipc.ts tests/unit/ipc/plugin-ipc.test.ts
git commit -m "feat(ipc): expose connector provider metadata"
```

---

## Task 7: Build provider aggregation library

**Files:**

- Create: `src/renderer/lib/provider-usage.ts`
- Test: `tests/unit/renderer/provider-usage.test.ts`

- [ ] **Step 1: Write failing provider aggregation tests**

Create `tests/unit/renderer/provider-usage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ConnectorInfo } from "../../../src/shared/types/ipc";
import {
    buildProviderUsageGroups,
    getVisibleProviders,
} from "../../../src/renderer/lib/provider-usage";

function connector(overrides: Partial<ConnectorInfo>): ConnectorInfo {
    return {
        sourceInstanceId: "cpa-1",
        stateId: "cpa-1",
        name: "CPA",
        displayName: "CPA 额度",
        enabled: true,
        source: "cpa",
        supportedProviders: ["claude", "codex", "gemini", "antigravity", "kimi"],
        activeProviders: ["claude", "codex"],
        metadata: null,
        snapshot: { status: "ready", updatedAt: "2026-05-31T00:00:00Z", items: [] },
        ...overrides,
    };
}

describe("provider usage aggregation", () => {
    it("groups CPA Claude items under Claude and does not create CPA provider", () => {
        const groups = buildProviderUsageGroups([
            connector({
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-05-31T00:00:00Z",
                    items: [
                        {
                            id: "cpa:claude:acct:5小时",
                            provider: "claude",
                            source: "cpa",
                            sourceInstanceId: "cpa-1",
                            accountId: "acct",
                            accountLabel: "user@example.com",
                            name: "Claude (user@example.com) · 5小时",
                            used: 25,
                            limit: 100,
                            displayStyle: "percent",
                            status: "normal",
                        },
                    ],
                },
            }),
        ]);

        expect(groups.map((g) => g.provider)).toEqual(["claude"]);
        expect(groups[0]?.accounts[0]?.source).toBe("cpa");
    });

    it("keeps GLM and MiniMax as provider groups", () => {
        const groups = buildProviderUsageGroups([
            connector({
                sourceInstanceId: "glm-1",
                source: "api_key",
                supportedProviders: ["glm"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-05-31T00:00:00Z",
                    items: [
                        {
                            id: "glm-1:default",
                            provider: "glm",
                            source: "api_key",
                            sourceInstanceId: "glm-1",
                            accountId: "glm-1",
                            accountLabel: "GLM",
                            name: "GLM",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            status: "normal",
                        },
                    ],
                },
            }),
            connector({
                sourceInstanceId: "minimax-1",
                source: "api_key",
                supportedProviders: ["minimax"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-05-31T00:00:00Z",
                    items: [
                        {
                            id: "minimax-1:default",
                            provider: "minimax",
                            source: "api_key",
                            sourceInstanceId: "minimax-1",
                            accountId: "minimax-1",
                            accountLabel: "MiniMax",
                            name: "MiniMax",
                            used: 20,
                            limit: 100,
                            displayStyle: "percent",
                            status: "normal",
                        },
                    ],
                },
            }),
        ]);

        expect(groups.map((g) => g.provider)).toEqual(["glm", "minimax"]);
    });

    it("uses active providers from connector config instead of all CPA supported providers", () => {
        const providers = getVisibleProviders([
            connector({
                snapshot: { status: "idle" },
                supportedProviders: ["claude", "codex", "gemini", "antigravity", "kimi"],
                activeProviders: ["claude", "codex"],
            }),
        ]);

        expect(providers).toContain("claude");
        expect(providers).toContain("codex");
        expect(providers).not.toContain("gemini");
        expect(providers).not.toContain("antigravity");
        expect(providers).not.toContain("kimi");
    });
});
```

- [ ] **Step 2: Run failing aggregation tests**

Run:

```bash
npx vitest run tests/unit/renderer/provider-usage.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement provider aggregation**

Create `src/renderer/lib/provider-usage.ts`:

```ts
import type { UsageItem, UsageProvider, UsageSource } from "../../shared/schemas/plugin-output";
import type { ConnectorInfo } from "../../shared/types/ipc";

export interface ProviderUsageWindow {
    label: string;
    used: number;
    limit: number;
    displayStyle: "percent" | "ratio";
    resetAt?: string | null;
    status: "normal" | "warning" | "critical" | "unknown";
}

export interface ProviderUsageAccount {
    provider: UsageProvider;
    source: UsageSource;
    sourceInstanceId: string;
    accountId: string;
    accountLabel: string;
    items: UsageItem[];
    status: "normal" | "warning" | "critical" | "unknown";
    updatedAt?: string;
    error?: string;
}

export interface ProviderUsageGroup {
    provider: UsageProvider;
    label: string;
    status: "normal" | "warning" | "critical" | "unknown";
    accountCount: number;
    updatedAt?: string;
    windows: ProviderUsageWindow[];
    accounts: ProviderUsageAccount[];
}

export const PROVIDER_ORDER: UsageProvider[] = [
    "claude",
    "codex",
    "gemini",
    "antigravity",
    "kimi",
    "glm",
    "minimax",
    "deepseek",
    "tavily",
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
};

const STATUS_RANK = { unknown: 0, normal: 1, warning: 2, critical: 3 } as const;

function worseStatus(items: readonly { status: ProviderUsageGroup["status"] }[]) {
    return items.reduce<ProviderUsageGroup["status"]>(
        (current, item) =>
            STATUS_RANK[item.status] > STATUS_RANK[current] ? item.status : current,
        "unknown",
    );
}

function itemWindowLabel(item: UsageItem): string {
    if (item.name.includes("5小时")) return "5小时";
    if (item.name.includes("每周")) return "每周";
    return item.name.split("·").pop()?.trim() || item.name;
}

export function buildProviderUsageGroups(
    connectors: readonly ConnectorInfo[],
): ProviderUsageGroup[] {
    const itemsByProvider = new Map<UsageProvider, { item: UsageItem; updatedAt?: string }[]>();

    for (const connector of connectors) {
        if (connector.snapshot.status !== "ready" && connector.snapshot.status !== "failed")
            continue;
        const updatedAt = connector.snapshot.updatedAt;
        const items = connector.snapshot.items ?? [];
        for (const item of items) {
            const bucket = itemsByProvider.get(item.provider) ?? [];
            bucket.push({ item, updatedAt });
            itemsByProvider.set(item.provider, bucket);
        }
    }

    return PROVIDER_ORDER.flatMap((provider) => {
        const entries = itemsByProvider.get(provider) ?? [];
        if (entries.length === 0) return [];

        const accountsByKey = new Map<string, ProviderUsageAccount>();
        for (const { item, updatedAt } of entries) {
            const key = `${item.sourceInstanceId}:${item.accountId}`;
            const existing = accountsByKey.get(key);
            if (existing) {
                existing.items.push(item);
                existing.status = worseStatus(existing.items);
                existing.updatedAt = [existing.updatedAt, updatedAt].filter(Boolean).sort().pop();
            } else {
                accountsByKey.set(key, {
                    provider,
                    source: item.source,
                    sourceInstanceId: item.sourceInstanceId,
                    accountId: item.accountId,
                    accountLabel: item.accountLabel,
                    items: [item],
                    status: item.status,
                    updatedAt,
                });
            }
        }

        const accounts = [...accountsByKey.values()];
        const windows = entries.map(({ item }) => ({
            label: itemWindowLabel(item),
            used: item.used,
            limit: item.limit,
            displayStyle: item.displayStyle,
            resetAt: item.resetAt,
            status: item.status,
        }));

        return [
            {
                provider,
                label: PROVIDER_LABELS[provider],
                status: worseStatus(accounts),
                accountCount: accounts.length,
                updatedAt: entries
                    .map((entry) => entry.updatedAt)
                    .filter(Boolean)
                    .sort()
                    .pop(),
                windows,
                accounts,
            },
        ];
    });
}

export function getVisibleProviders(connectors: readonly ConnectorInfo[]): UsageProvider[] {
    const groups = buildProviderUsageGroups(connectors);
    const providersWithData = new Set(groups.map((group) => group.provider));
    const providersWithEnabledConnectors = new Set<UsageProvider>();

    for (const connector of connectors) {
        if (!connector.enabled) continue;
        for (const provider of connector.activeProviders)
            providersWithEnabledConnectors.add(provider);
    }

    return PROVIDER_ORDER.filter(
        (provider) =>
            providersWithData.has(provider) || providersWithEnabledConnectors.has(provider),
    );
}
```

- [ ] **Step 4: Run aggregation tests**

Run:

```bash
npx vitest run tests/unit/renderer/provider-usage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/provider-usage.ts tests/unit/renderer/provider-usage.test.ts
git commit -m "feat(renderer): aggregate usage by provider"
```

---

## Task 8: Replace popup plugin cards with provider UI

**Files:**

- Create: `src/renderer/components/ProviderNav.tsx`
- Create: `src/renderer/components/ProviderOverview.tsx`
- Create: `src/renderer/components/ProviderCard.tsx`
- Create: `src/renderer/components/ProviderAccountList.tsx`
- Create: `src/renderer/components/ProviderAccountRow.tsx`
- Modify: `src/renderer/views/PopupView.tsx`
- Test: `tests/unit/renderer/views/popup_view.test.tsx`
- Test: `tests/user_e2e/specs/popup_view.spec.ts`

- [ ] **Step 1: Write component test for no CPA tab**

Create/update `tests/unit/renderer/views/popup_view.test.tsx` with mocked API. Include:

```ts
it("renders provider tabs and no CPA tab", async () => {
    mockPluginList([
        cpaConnectorWithClaudeItem(),
        apiKeyConnector("deepseek-1", "deepseek", "DeepSeek"),
    ]);

    render(<PopupView />);

    expect(await screen.findByRole("button", { name: /总览/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claude/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /DeepSeek/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^CPA$/ })).not.toBeInTheDocument();
});
```

Add helpers in the test file:

```ts
function cpaConnectorWithClaudeItem() {
    return {
        sourceInstanceId: "cpa-1",
        stateId: "cpa-1",
        name: "CPA",
        displayName: "CPA 额度",
        enabled: true,
        source: "cpa",
        supportedProviders: ["claude", "codex", "gemini", "antigravity", "kimi"],
        activeProviders: ["claude", "codex"],
        metadata: null,
        snapshot: {
            status: "ready",
            updatedAt: "2026-05-31T00:00:00Z",
            items: [
                {
                    id: "cpa:claude:acct:5小时",
                    provider: "claude",
                    source: "cpa",
                    sourceInstanceId: "cpa-1",
                    accountId: "acct",
                    accountLabel: "user@example.com",
                    name: "Claude (user@example.com) · 5小时",
                    used: 25,
                    limit: 100,
                    displayStyle: "percent",
                    status: "normal",
                },
            ],
        },
    };
}
```

- [ ] **Step 2: Run failing popup test**

Run:

```bash
npx vitest run tests/unit/renderer/views/popup_view.test.tsx
```

Expected: FAIL because PopupView renders plugin tabs/cards.

- [ ] **Step 3: Implement provider components**

First check `src/renderer/components/Icon.tsx`. `VendorMark` must support `gemini`, `antigravity`, and `kimi`, or provide a generic fallback that renders the provider initial when an id is unknown.

Create `src/renderer/components/ProviderNav.tsx`:

```tsx
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import { VendorMark } from "./Icon";

interface ProviderNavProps {
    activeProvider: UsageProvider | "overview";
    providers: readonly UsageProvider[];
    onSelect: (provider: UsageProvider | "overview") => void;
}

export function ProviderNav({ activeProvider, providers, onSelect }: ProviderNavProps) {
    return (
        <div className="tabs-wrap">
            <button
                className={"tab" + (activeProvider === "overview" ? " active" : "")}
                data-tab="overview"
                onClick={() => onSelect("overview")}
                type="button"
            >
                <span className="tab-ic">
                    <VendorMark id="overview" size={22} />
                </span>
                <span className="tab-lbl">总览</span>
            </button>
            {providers.map((provider) => (
                <button
                    key={provider}
                    className={"tab" + (activeProvider === provider ? " active" : "")}
                    data-tab={provider}
                    onClick={() => onSelect(provider)}
                    type="button"
                >
                    <span className="tab-ic">
                        <VendorMark id={provider} size={22} />
                    </span>
                    <span className="tab-lbl">{PROVIDER_LABELS[provider]}</span>
                </button>
            ))}
        </div>
    );
}
```

Create `ProviderCard`, `ProviderOverview`, `ProviderAccountList`, and `ProviderAccountRow` using existing global `.card`, `.card-name`, `.progress`, `.badge`-style classes from `src/renderer/styles/globals.css` where possible. If a needed style only exists inside `PluginCard.tsx`, move that style to the global stylesheet before deleting `PluginCard` in Task 11. Required source badge markup:

```tsx
<span className="source-badge">{source.toUpperCase()}</span>
```

Add CSS to existing renderer stylesheet:

```css
.source-badge {
    margin-left: 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 1px 5px;
    color: var(--muted-foreground);
    background: transparent;
    font-size: 10px;
    line-height: 1.3;
    letter-spacing: 0.02em;
}
```

- [ ] **Step 4: Refactor PopupView**

Before editing, inspect `src/renderer/hooks/use-plugins.ts` and confirm it returns connector objects without dropping `source`, `supportedProviders`, `activeProviders`, or item metadata.

In `src/renderer/views/PopupView.tsx`:

- Remove `PluginCard` import.
- Import provider aggregation:

```ts
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import { buildProviderUsageGroups, getVisibleProviders } from "../lib/provider-usage";
```

- State:

```ts
const [activeTab, setActiveTab] = useState<UsageProvider | "overview">("overview");
```

- Derived values:

```ts
const providerGroups = buildProviderUsageGroups(plugins);
const visibleProviders = getVisibleProviders(plugins);
const activeGroup =
    activeTab === "overview"
        ? undefined
        : providerGroups.find((group) => group.provider === activeTab);
```

- Render:

```tsx
<ProviderNav activeProvider={activeTab} providers={visibleProviders} onSelect={setActiveTab} />
...
{activeTab === "overview" ? (
    <ProviderOverview groups={providerGroups} visibleProviders={visibleProviders} />
) : activeGroup ? (
    <ProviderAccountList group={activeGroup} />
) : (
    <div className="empty">该服务暂无账号。请到设置添加数据来源。</div>
)}
```

- [ ] **Step 5: Run popup tests**

Run:

```bash
npx vitest run tests/unit/renderer/views/popup_view.test.tsx tests/unit/renderer/provider-usage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update E2E selectors**

In `tests/user_e2e/specs/popup_view.spec.ts`, replace plugin-card expectations with provider expectations:

```ts
await expect(page.getByRole("button", { name: /总览/ })).toBeVisible();
await expect(page.getByRole("button", { name: /^CPA$/ })).toHaveCount(0);
```

Keep packaged height regression assertions unchanged.

- [ ] **Step 7: Run E2E popup spec**

Run:

```bash
pnpm test:e2e -- --grep "popup view"
```

Expected: PASS or documented app startup failure if local Electron environment is unavailable.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components src/renderer/views/PopupView.tsx src/renderer/styles tests/unit/renderer/views/popup_view.test.tsx tests/user_e2e/specs/popup_view.spec.ts
git commit -m "feat(popup): render usage by provider"
```

---

## Task 9: Add CPA connector settings page

**Files:**

- Create: `src/renderer/components/ConnectorStatusCard.tsx`
- Create: `src/renderer/components/CpaConnectorSettings.tsx`
- Modify: `src/renderer/views/SettingsView.tsx`
- Test: `tests/unit/renderer/components/cpa_connector_settings.test.tsx`
- Test: `tests/unit/renderer/views/settings_view.test.tsx`

- [ ] **Step 1: Write CPA settings component test**

Create `tests/unit/renderer/components/cpa_connector_settings.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CpaConnectorSettings } from "../../../../src/renderer/components/CpaConnectorSettings";

const connector = {
    sourceInstanceId: "cpa-1",
    stateId: "cpa-1",
    name: "CPA",
    displayName: "CPA 额度",
    enabled: true,
    source: "cpa",
    supportedProviders: ["claude", "codex", "gemini", "antigravity", "kimi"],
    metadata: {
        parameters: [
            { name: "cpa_mgmt_key", label: "管理密钥", type: "secret", required: true },
            {
                name: "monitor_claude",
                label: "监控 Claude",
                type: "boolean",
                required: false,
                defaultValue: "true",
            },
            {
                name: "monitor_codex",
                label: "监控 Codex",
                type: "boolean",
                required: false,
                defaultValue: "true",
            },
            {
                name: "monitor_gemini",
                label: "监控 Gemini",
                type: "boolean",
                required: false,
                defaultValue: "true",
            },
            {
                name: "monitor_antigravity",
                label: "监控 Antigravity",
                type: "boolean",
                required: false,
                defaultValue: "true",
            },
            {
                name: "monitor_kimi",
                label: "监控 Kimi",
                type: "boolean",
                required: false,
                defaultValue: "true",
            },
        ],
        endpoints: { default: null },
    },
    snapshot: {
        status: "ready",
        updatedAt: "2026-05-31T00:00:00Z",
        items: [
            {
                id: "cpa:claude:acct:5小时",
                provider: "claude",
                source: "cpa",
                sourceInstanceId: "cpa-1",
                accountId: "acct",
                accountLabel: "user@example.com",
                name: "Claude (user@example.com) · 5小时",
                used: 25,
                limit: 100,
                displayStyle: "percent",
                status: "normal",
            },
        ],
    },
} as const;

describe("CpaConnectorSettings", () => {
    it("shows CPA status connection fields monitor switches and discovered accounts", () => {
        render(
            <CpaConnectorSettings
                connector={connector}
                config={{
                    endpointOverrides: { default: "http://localhost:20224" },
                    parameterValues: {
                        monitor_claude: "true",
                        monitor_codex: "true",
                        monitor_gemini: "false",
                        monitor_antigravity: "true",
                        monitor_kimi: "true",
                    },
                    refreshIntervalSeconds: 1800,
                }}
                hasSecrets={{ cpa_mgmt_key: true }}
                onSave={vi.fn()}
                onSaveSecrets={vi.fn()}
                onRefresh={vi.fn()}
            />,
        );

        expect(screen.getByText("CPA 额度连接器")).toBeInTheDocument();
        expect(screen.getByText("已连接")).toBeInTheDocument();
        expect(screen.getByLabelText("CPA-Manager URL")).toHaveValue("http://localhost:20224");
        expect(screen.getByLabelText("管理密钥")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "测试连接" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "立即同步" })).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: "监控 Claude" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "监控 Codex" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "监控 Gemini" })).not.toBeChecked();
        expect(screen.getByRole("checkbox", { name: "监控 Antigravity" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "监控 Kimi" })).toBeChecked();
        expect(screen.getByText("Claude 1")).toBeInTheDocument();
        expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run failing CPA settings test**

Run:

```bash
npx vitest run tests/unit/renderer/components/cpa_connector_settings.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement ConnectorStatusCard**

Create `src/renderer/components/ConnectorStatusCard.tsx`:

```tsx
import { Card } from "./Card";

interface ConnectorStatusCardProps {
    title: string;
    status: "已连接" | "未连接" | "部分失败";
    url?: string;
    updatedAt?: string;
    counts: readonly string[];
}

export function ConnectorStatusCard({
    title,
    status,
    url,
    updatedAt,
    counts,
}: ConnectorStatusCardProps) {
    return (
        <Card>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">
                        {url || "未配置 CPA-Manager URL"}
                    </p>
                </div>
                <span className="source-badge">{status}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                {counts.map((count) => (
                    <span key={count}>{count}</span>
                ))}
            </div>
            {updatedAt && (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">上次同步：{updatedAt}</p>
            )}
        </Card>
    );
}
```

- [ ] **Step 4: Implement CpaConnectorSettings**

Create `src/renderer/components/CpaConnectorSettings.tsx` with props matching the test. Required behavior:

- Count snapshot items by provider.
- Status is `已连接` for ready with items, `部分失败` for failed with stale items, otherwise `未连接`.
- Render endpoint URL, secret field, monitor switches, test/sync buttons, grouped accounts.
- Monitor switches must render the five boolean metadata parameters: `monitor_claude`, `monitor_codex`, `monitor_gemini`, `monitor_antigravity`, and `monitor_kimi`.

Minimum component skeleton:

```tsx
import type { ConnectorInfo } from "../../shared/types/ipc";
import type { PluginConfiguration } from "../../shared/types/config";
import { ConnectorStatusCard } from "./ConnectorStatusCard";

interface CpaConnectorSettingsProps {
    connector: ConnectorInfo;
    config: Pick<
        PluginConfiguration,
        "endpointOverrides" | "parameterValues" | "refreshIntervalSeconds"
    >;
    hasSecrets: Record<string, boolean>;
    onSave: (
        nonSecrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
    ) => Promise<void> | void;
    onSaveSecrets: (secrets: Record<string, string>) => Promise<void> | void;
    onRefresh: () => Promise<void> | void;
}

export function CpaConnectorSettings(props: CpaConnectorSettingsProps) {
    const { connector, config, hasSecrets, onRefresh } = props;
    const items =
        connector.snapshot.status === "ready" || connector.snapshot.status === "failed"
            ? (connector.snapshot.items ?? [])
            : [];
    const counts = ["claude", "codex", "gemini", "antigravity", "kimi"].flatMap((provider) => {
        const accountCount = new Set(
            items.filter((item) => item.provider === provider).map((item) => item.accountId),
        ).size;
        return accountCount > 0 ? [`${providerLabel(provider)} ${String(accountCount)}`] : [];
    });

    return (
        <div className="space-y-4" data-testid="cpa-connector-settings">
            <ConnectorStatusCard
                title="CPA 额度连接器"
                status={
                    connector.snapshot.status === "ready" && items.length > 0
                        ? "已连接"
                        : connector.snapshot.status === "failed" && items.length > 0
                          ? "部分失败"
                          : "未连接"
                }
                url={config.endpointOverrides.default}
                updatedAt={
                    connector.snapshot.status === "ready" || connector.snapshot.status === "failed"
                        ? connector.snapshot.updatedAt
                        : undefined
                }
                counts={counts}
            />
            <label className="block space-y-1">
                <span className="text-xs text-[var(--muted-foreground)]">CPA-Manager URL</span>
                <input
                    aria-label="CPA-Manager URL"
                    defaultValue={config.endpointOverrides.default ?? ""}
                    className="set-input"
                />
            </label>
            <label className="block space-y-1">
                <span className="text-xs text-[var(--muted-foreground)]">管理密钥</span>
                <input
                    aria-label="管理密钥"
                    type="password"
                    defaultValue={hasSecrets.cpa_mgmt_key ? "***" : ""}
                    className="set-input"
                />
            </label>
            <div className="space-y-2">
                <h4 className="text-sm font-semibold">监控范围</h4>
                {[
                    ["monitor_claude", "监控 Claude"],
                    ["monitor_codex", "监控 Codex"],
                    ["monitor_gemini", "监控 Gemini"],
                    ["monitor_antigravity", "监控 Antigravity"],
                    ["monitor_kimi", "监控 Kimi"],
                ].map(([name, label]) => (
                    <label key={name} className="set-row">
                        <input
                            aria-label={label}
                            type="checkbox"
                            defaultChecked={config.parameterValues[name] === "true"}
                        />
                        <span>{label}</span>
                    </label>
                ))}
            </div>
            <div className="flex gap-2">
                <button type="button" className="btn-secondary">
                    测试连接
                </button>
                <button type="button" className="btn-primary" onClick={() => void onRefresh()}>
                    立即同步
                </button>
            </div>
            <div>
                <h4 className="text-sm font-semibold">已发现账号</h4>
                {items.map((item) => (
                    <div key={item.id} className="set-row">
                        <div className="sr-text">
                            <div className="sr-title">{item.accountLabel}</div>
                            <div className="sr-sub">
                                {item.provider} · {item.status}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function providerLabel(provider: string): string {
    return (
        (
            {
                claude: "Claude",
                codex: "Codex",
                gemini: "Gemini",
                antigravity: "Antigravity",
                kimi: "Kimi",
            } as Record<string, string>
        )[provider] ?? provider
    );
}
```

Then wire save fields in a follow-up pass inside the same task, using the existing `SettingsForm` submit style. Saving must include changed monitor switch values in `parameterValues` and must not write the secret placeholder (`***`) back as a real secret.

- [ ] **Step 5: Run component test**

Run:

```bash
npx vitest run tests/unit/renderer/components/cpa_connector_settings.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Wire into SettingsView**

In `src/renderer/views/SettingsView.tsx`:

- Identify CPA connector: `pluginInfos.find((p) => p.source === "cpa")`.
- When section/data source selected is CPA, render `CpaConnectorSettings` instead of generic `SettingsForm`.
- Keep other connector forms using existing `SettingsForm`.
- Sidebar label for CPA must be `CPA 额度连接器`.

- [ ] **Step 7: Update settings view test**

In `tests/unit/renderer/views/settings_view.test.tsx`, add:

```ts
it("shows CPA as data source settings page", async () => {
    mockPluginList([cpaConnectorWithClaudeItem()]);
    render(<SettingsView />);

    await userEvent.click(screen.getByText("账号"));
    await userEvent.click(screen.getByText("CPA 额度连接器"));

    expect(screen.getByTestId("cpa-connector-settings")).toBeInTheDocument();
    expect(screen.getByText("CPA 额度连接器")).toBeInTheDocument();
});
```

- [ ] **Step 8: Run settings tests**

Run:

```bash
npx vitest run tests/unit/renderer/components/cpa_connector_settings.test.tsx tests/unit/renderer/views/settings_view.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components src/renderer/views/SettingsView.tsx tests/unit/renderer
git commit -m "feat(settings): add CPA connector settings"
```

---

## Task 10: Add provider refresh behavior

**Files:**

- Modify: `src/renderer/views/PopupView.tsx`
- Modify: `src/renderer/components/ProviderCard.tsx`
- Test: `tests/unit/renderer/views/popup_view.test.tsx`

- [ ] **Step 1: Write failing provider refresh test**

In `tests/unit/renderer/views/popup_view.test.tsx`:

```ts
it("refreshes every enabled connector that supports a provider", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mockUsageboardApi({
        plugin: {
            list: vi.fn().mockResolvedValue([
                cpaConnectorWithClaudeItem(),
                apiKeyConnector("claude-direct-1", "claude", "Claude Direct"),
            ]),
            refresh,
            refreshAll: vi.fn(),
            getState: vi.fn(),
        },
    });

    render(<PopupView />);
    await userEvent.click(await screen.findByRole("button", { name: /刷新 Claude/ }));

    expect(refresh).toHaveBeenCalledWith("cpa-1");
    expect(refresh).toHaveBeenCalledWith("claude-direct-1");
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npx vitest run tests/unit/renderer/views/popup_view.test.tsx -t "refreshes every enabled connector"
```

Expected: FAIL because provider refresh is not implemented.

- [ ] **Step 3: Implement provider refresh in PopupView**

Add:

```ts
const refreshProvider = (provider: UsageProvider) => {
    const targets = plugins.filter(
        (connector) => connector.enabled && connector.activeProviders.includes(provider),
    );
    void Promise.all(
        targets.map((connector) => window.usageboard.plugin.refresh(connector.sourceInstanceId)),
    );
};
```

Pass to `ProviderOverview` and `ProviderCard`:

```tsx
<ProviderOverview
    groups={providerGroups}
    visibleProviders={visibleProviders}
    onRefreshProvider={refreshProvider}
/>
```

Button accessible name:

```tsx
<button aria-label={`刷新 ${group.label}`} title={`刷新 ${group.label}`} onClick={() => onRefreshProvider(group.provider)}>
```

- [ ] **Step 4: Run provider refresh test**

Run:

```bash
npx vitest run tests/unit/renderer/views/popup_view.test.tsx -t "refreshes every enabled connector"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/PopupView.tsx src/renderer/components/ProviderCard.tsx src/renderer/components/ProviderOverview.tsx tests/unit/renderer/views/popup_view.test.tsx
git commit -m "feat(popup): refresh providers through connectors"
```

---

## Task 11: Remove PluginCard from main UI and clean dead paths

**Files:**

- Modify/Delete: `src/renderer/components/PluginCard.tsx`
- Modify tests: `tests/unit/renderer/components/plugin_card.test.tsx` if present
- Modify imports under `src/renderer`

- [ ] **Step 1: Check PluginCard references**

Run:

```bash
rg "PluginCard" src tests
```

Expected: Only old tests/references remain after PopupView refactor.

- [ ] **Step 2: Delete or quarantine old component tests**

If `PluginCard` has no references in source, delete:

```bash
git rm src/renderer/components/PluginCard.tsx tests/unit/renderer/components/plugin_card.test.tsx
```

If tests still need old quota rendering assertions, move those assertions to `ProviderCard`/`ProviderAccountRow` tests instead.

- [ ] **Step 3: Run dead code and unit tests**

Run:

```bash
pnpm deadcode
npx vitest run tests/unit/renderer
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src/renderer/components tests/unit/renderer
git commit -m "refactor(renderer): remove plugin cards from main usage UI"
```

---

## Task 12: Update E2E and packaged smoke coverage

**Files:**

- Modify: `tests/user_e2e/specs/popup_view.spec.ts`
- Modify: `tests/user_e2e/specs/plugin_config.spec.ts`
- Modify: `tests/packaged_smoke/smoke.spec.ts`

- [ ] **Step 1: Update popup E2E assertions**

In `tests/user_e2e/specs/popup_view.spec.ts`, ensure:

```ts
await expect(page.getByRole("button", { name: /总览/ })).toBeVisible();
await expect(page.getByRole("button", { name: /^CPA$/ })).toHaveCount(0);
await expect(page.locator(".window")).toBeVisible();
```

Keep existing height regression test:

```ts
expect(Math.abs(layout.root_height - layout.viewport_height)).toBeLessThanOrEqual(1);
```

- [ ] **Step 2: Add CPA settings E2E path**

In `tests/user_e2e/specs/plugin_config.spec.ts`, add a test that opens settings and verifies CPA connector page:

```ts
test("CPA is configured as a data source not a main provider", async ({ omni }) => {
    const page = await omni.app.firstWindow();
    await page.getByTitle("设置").click();
    await expect(page.getByText("CPA 额度连接器")).toBeVisible();
    await page.getByText("CPA 额度连接器").click();
    await expect(page.getByLabel("CPA-Manager URL")).toBeVisible();
    await expect(page.getByRole("button", { name: "测试连接" })).toBeVisible();
});
```

- [ ] **Step 3: Update packaged smoke**

In `tests/packaged_smoke/smoke.spec.ts`, replace `.card-name` plugin discovery assertion with provider overview assertion:

```ts
await expect(app.page.getByRole("button", { name: /总览/ })).toBeVisible({ timeout: 15_000 });
await expect(app.page.getByRole("button", { name: /^CPA$/ })).toHaveCount(0);
```

Keep packaged root height test unchanged.

- [ ] **Step 4: Run E2E subset**

Run:

```bash
pnpm test:e2e -- --grep "popup view|CPA"
```

Expected: PASS in local Electron environment. If Electron cannot start, record exact failure in final notes and do not claim E2E verified.

- [ ] **Step 5: Commit**

```bash
git add tests/user_e2e tests/packaged_smoke
git commit -m "test(e2e): cover provider UI and CPA connector settings"
```

---

## Task 13: Update project docs

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/plugin-contract.md`
- Modify: `docs/spec.md`
- Modify: `docs/test.md`
- Modify: `docs/test-coverage-matrix.md`

- [ ] **Step 1: Update CLAUDE.md provider list**

In `CLAUDE.md`, update core provider sentence to include:

```md
Claude、OpenAI Codex、Gemini、Antigravity、Kimi、智谱 GLM、MiniMax、DeepSeek、Tavily。
```

- [ ] **Step 2: Update plugin contract**

In `docs/plugin-contract.md`, add schema v2 section:

```md
### UsageItem v2 必填来源字段

每个成功输出必须使用 `schemaVersion: 2`，且每个 item 必须包含：

- `provider`: 用户看到的服务商，如 `claude`、`codex`、`gemini`。
- `source`: 数据来源，如 `cpa`、`api_key`、`oauth`。
- `sourceInstanceId`: 对应配置实例 ID。
- `accountId`: 来源内稳定账号 ID。
- `accountLabel`: 用户可读账号名，禁止写入 secret。

v1 输出不再兼容；bundled plugin 必须全部输出 v2。
```

- [ ] **Step 3: Update product spec**

In `docs/spec.md`, update UI section:

```md
主用量界面按 provider 展示，不按插件展示。CPA 是聚合连接器，只出现在设置 / 数据来源中。CPA 采集到的 Claude、Codex、Gemini、Antigravity、Kimi 账号分别合并到对应 provider 页。
```

- [ ] **Step 4: Update test docs**

In `docs/test.md`, add regression requirement:

```md
CPA UI 回归：主界面不得出现 CPA provider tab；CPA 数据必须进入对应 provider；CPA 配置仅在设置的数据来源页出现。
```

In `docs/test-coverage-matrix.md`, add rows for:

- schema v1 rejection
- config `overviewDisplayMode` migration
- provider aggregation
- CPA connector settings
- no CPA main tab

- [ ] **Step 5: Run format check for docs**

Run:

```bash
pnpm format:check
```

Expected: PASS. If only docs formatting fails, run `pnpm format -- docs/plugin-contract.md docs/spec.md docs/test.md docs/test-coverage-matrix.md CLAUDE.md` and re-run.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/plugin-contract.md docs/spec.md docs/test.md docs/test-coverage-matrix.md
git commit -m "docs: describe CPA connector provider UI"
```

---

## Task 14: Full verification and packaged validation

**Files:**

- No source changes expected unless verification finds issues.

- [ ] **Step 1: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Run unit and integration tests**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 4: Run check gate**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Run packaged build**

Run:

```bash
pnpm package
```

Expected: app package exists under `artifacts/win-unpacked/OmniUsage.exe` on Windows.

- [ ] **Step 6: Run packaged smoke**

Run:

```bash
pnpm test:packaged
```

Expected: PASS, including popup root height and no CPA main provider tab.

- [ ] **Step 7: Manually launch packaged app**

Run:

```bash
./artifacts/win-unpacked/OmniUsage.exe
```

Manual checks:

- Renderer loads, no white screen.
- Popup root fills the window height.
- Main UI shows 总览 and provider tabs, not CPA.
- Settings contains CPA 额度连接器 under data source/account area.
- CPA URL/key fields render.

- [ ] **Step 8: Commit verification fixes if needed**

If verification required fixes:

```bash
git add <changed-files>
git commit -m "fix: stabilize CPA provider UI verification"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

### Spec coverage

- CPA as connector, not provider: Tasks 6, 7, 8, 9, 12.
- Schema v2 and v1 rejection: Tasks 1, 4.
- `supportedProviders`: Tasks 2, 6, 10.
- `gemini-cli` to `gemini`: Task 4.
- `auth_index` as CPA account ID: Task 4.
- Source semantics and badges: Tasks 4, 7, 8.
- `overviewDisplayMode` migration: Task 5.
- Provider tab visibility and compact cards: Tasks 7, 8.
- CPA settings page: Task 9.
- PluginCard removal: Task 11.
- Tests and docs: Tasks 12, 13, 14.

### Placeholder scan

No `TBD`, `TODO`, or unspecified implementation placeholders remain. Steps include exact paths, commands, expected outcomes, and representative code.

### Type consistency

Provider/source/account field names match the spec: `provider`, `source`, `sourceInstanceId`, `accountId`, `accountLabel`, `supportedProviders`. Persistent config keeps `instanceId`; renderer DTO uses `sourceInstanceId`.
