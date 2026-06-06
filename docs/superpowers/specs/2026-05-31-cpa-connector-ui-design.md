# CPA Connector UI Redesign Spec

## Goal

CPA must be modeled and displayed as a quota aggregation connector, not as an AI provider or model.

The main usage surface is organized by provider because users care about remaining quota for each AI service. CPA only appears where users configure and diagnose data sources.

## Non-goals

- Do not keep compatibility with the old plugin-as-card main UI model.
- Do not create a CPA provider tab.
- Do not show CPA wording in overview provider cards.
- Do not expose CPA-Manager implementation details in the main usage flow.
- Do not add account-level refresh in this change.
- Do not add a v1 plugin-output adapter.

## Assumptions and known limits

- CPA `accountId` stability depends on CPA-Manager keeping `auth_index` stable. If CPA-Manager recreates auth files and changes `auth_index`, OmniUsage treats them as new accounts.
- Gemini, Antigravity, and Kimi are CPA-only providers in this implementation. Their tabs appear only when configured, enabled, or returned by data.
- Provider aggregation runs in renderer/shared UI code. Expected data volume is small: bundled connectors should produce fewer than 50 usage items in normal use.
- IPC channel names may remain `plugin:*` during this implementation. UI terminology changes to connector/provider; channel renaming is not required for the product behavior.

## Product Model

### Provider

A provider is the user-facing service whose quota is shown in the main UI.

Provider values for this implementation:

- `claude`
- `codex`
- `gemini`
- `antigravity`
- `kimi`
- `glm`
- `minimax`
- `deepseek`
- `tavily`

`overview` is not a provider. It is a view that displays provider cards.

Providers own:

- main UI tabs or sections
- provider overview cards
- account lists
- provider-level refresh actions
- provider-level quota aggregation

### Connector

A connector is a data source that produces quota items.

Connector source values:

- `cpa`: CPA-Manager aggregation connector.
- `api_key`: direct API-key based connector, used by GLM, MiniMax, DeepSeek, and Tavily.
- `oauth`: direct OAuth connector, reserved for future non-CPA OAuth integrations.
- `local`: local file/session connector, reserved for future local CLI/session quota sources.
- `direct`: generic direct connector only when a source is neither API key, OAuth, nor local. Bundled plugins should prefer the more specific values above.

Connectors own:

- authentication
- endpoint configuration
- supported provider declaration
- sync and refresh status
- source-specific diagnostics
- discovered accounts
- connector settings pages

CPA is one connector. It may produce accounts for multiple providers.

## Data Model

### Usage Item

Every schema v2 plugin output item must include provider, source, source instance, and account metadata. No fallback inference.

```ts
interface UsageItem {
    id: string;
    provider: UsageProvider;
    source: UsageSource;
    sourceInstanceId: string;
    accountId: string;
    accountLabel: string;
    name: string;
    used: number;
    limit: number;
    displayStyle: "percent" | "ratio";
    resetAt?: string | null;
    status: "normal" | "warning" | "critical" | "unknown";
    color?: "blue" | "green" | "yellow" | "orange" | "red";
}
```

```ts
type UsageProvider =
    | "claude"
    | "codex"
    | "gemini"
    | "antigravity"
    | "kimi"
    | "glm"
    | "minimax"
    | "deepseek"
    | "tavily";

type UsageSource = "cpa" | "direct" | "local" | "api_key" | "oauth";
```

### Account Identity

`accountId` is required for every item.

Rules:

- CPA uses `auth_index` as `accountId`.
- API-key plugins use their connector instance ID as `accountId` unless the upstream API returns a stable account identifier.
- Local file/session plugins use a stable local profile identifier; if only one profile exists, use the connector instance ID.
- OAuth direct plugins use the OAuth account identifier when present; otherwise use the connector instance ID.

`accountLabel` is user-facing. It should be an email, remark, profile name, or masked identifier. It must not be a raw secret.

### Source Instance Identity

Persistent config keeps the existing `PluginConfiguration.instanceId` field.

Conversion points:

- Main process IPC DTO maps `PluginConfiguration.instanceId` to `ConnectorInfo.sourceInstanceId`.
- Plugin runner passes the same value to bundled plugins as reserved runtime context, e.g. `OMNI_SOURCE_INSTANCE_ID` or equivalent SDK context.
- Schema v2 plugin output includes `sourceInstanceId` on every `UsageItem`.
- Renderer code uses `sourceInstanceId` only; it should not manually translate back to `instanceId` outside configuration forms.

This keeps storage migration small while giving UI code connector vocabulary.

### Plugin Output Schema Version

This change bumps plugin output schema to version `2`.

Version `2` requires:

- `provider`
- `source`
- `sourceInstanceId`
- `accountId`
- `accountLabel`

All bundled plugins must be updated in the same implementation branch before schema v1 rejection is enabled. CI must prove no bundled plugin still emits schema v1.

Version `1` plugin output is rejected instead of converted. This is intentional because the user requested a fresh model with no old-plugin compatibility.

### Config Migration

`AppConfiguration.overviewDisplayMode` is removed from the TypeScript config model.

Migration rules:

- Loading an old config containing `overviewDisplayMode` must not fail.
- Config parsing should strip unknown fields or explicitly drop `overviewDisplayMode` during migration.
- Saving config after load writes the new shape without `overviewDisplayMode`.
- Add a config-store migration test for an old config file that includes `overviewDisplayMode`.

### Connector DTO

Renderer needs connector-level status, separate from provider display.

```ts
interface ConnectorInfo {
    sourceInstanceId: string;
    source: UsageSource;
    supportedProviders: UsageProvider[];
    activeProviders: UsageProvider[];
    name: string;
    enabled: boolean;
    displayName: string;
    metadata: ConnectorMetadata | null;
    snapshot: ConnectorSnapshot;
}
```

`ConnectorMetadata` is the current plugin metadata shape renamed at the renderer boundary. Implementation may keep internal parser names such as `PluginMetadata`, and IPC channel names may stay `plugin:*`. `src/shared/types/ipc.ts` must document that `plugin:list` returns connector-oriented data for historical channel-name reasons.

`ConnectorSnapshot` is the current plugin snapshot concept renamed for source semantics. Ready snapshots contain normalized `UsageItem[]`.

`activeProviders` is derived from connector configuration. For CPA, it follows `monitor_claude`, `monitor_codex`, `monitor_gemini`, `monitor_antigravity`, and `monitor_kimi`; direct connectors usually copy `supportedProviders`. Main UI visibility and provider refresh use `activeProviders`, not the full `supportedProviders` list.

### Supported Provider Mapping

Provider refresh needs an explicit connector-to-provider mapping.

Rules:

- Bundled connector metadata declares `supportedProviders`.
- Bundled connector metadata declares `defaultSource`, e.g. CPA uses `cpa`, API-key connectors use `api_key`; IPC must not infer source from plugin name. If a connector supports multiple auth modes, IPC derives `source` from that connector's config before falling back to `defaultSource`.
- CPA declares `claude`, `codex`, `gemini`, `antigravity`, and `kimi`.
- Direct Claude declares `claude`; Direct Codex declares `codex`; GLM declares `glm`; MiniMax declares `minimax`; DeepSeek declares `deepseek`; Tavily declares `tavily`.
- Provider refresh refreshes enabled connectors whose active provider list contains that provider.
- CPA active provider list is computed from its `monitor_*` config switches; providers already present in returned items stay visible even after a later switch change.
- The mapping must not be inferred from the latest snapshot because empty/error snapshots still need refreshability.

### Provider View Model

Main UI consumes a derived provider model from all connector snapshots.

```ts
interface ProviderUsageGroup {
    provider: UsageProvider;
    label: string;
    status: "normal" | "warning" | "critical" | "unknown";
    accountCount: number;
    updatedAt?: string;
    windows: ProviderUsageWindow[];
    accounts: ProviderUsageAccount[];
}
```

```ts
interface ProviderUsageWindow {
    label: string;
    used: number;
    limit: number;
    displayStyle: "percent" | "ratio";
    resetAt?: string | null;
    status: "normal" | "warning" | "critical" | "unknown";
}
```

```ts
interface ProviderUsageAccount {
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
```

## CPA Plugin Output

CPA plugin must emit provider-specific items:

- Claude quota item: `provider: "claude"`, `source: "cpa"`
- Codex quota item: `provider: "codex"`, `source: "cpa"`
- Gemini quota item: `provider: "gemini"`, `source: "cpa"`
- Kimi quota item: `provider: "kimi"`, `source: "cpa"`
- Antigravity quota item: `provider: "antigravity"`, `source: "cpa"`

CPA-Manager auth files use provider key `gemini-cli`. The CPA plugin maps that internal key to UI provider `gemini`; CPA-Manager does not need to change.

CPA item IDs should be stable and account scoped:

```text
cpa:<provider>:<accountId>:<quotaWindow>
```

CPA account IDs come from `auth_index`. Account labels use extracted email or a masked auth identifier.

## Other Bundled Plugin Output

All non-CPA bundled plugins must emit schema version `2` items:

- Claude direct: `provider: "claude"`, source `oauth` or `api_key` according to its auth mode.
- Codex direct: `provider: "codex"`, source `oauth` or `api_key` according to its auth mode.
- GLM: `provider: "glm"`, source `api_key`.
- MiniMax: `provider: "minimax"`, source `api_key`.
- DeepSeek: `provider: "deepseek"`, source `api_key`.
- Tavily: `provider: "tavily"`, source `api_key`.

When a plugin instance represents exactly one account and no upstream account ID exists, set both `sourceInstanceId` and `accountId` to the config `instanceId`.

## Main Usage UI

### Navigation

The main usage UI shows provider tabs only. There is no CPA tab.

Available provider order:

- 总览
- Claude
- Codex
- Gemini
- Antigravity
- Kimi
- GLM
- MiniMax
- DeepSeek
- Tavily

Visible tabs are:

- 总览 always.
- Providers with configured enabled connectors.
- Providers with returned accounts.
- CPA-only providers only when CPA is configured and their monitor switch is enabled, or when they have returned accounts.

This prevents first launch from showing multiple permanently empty CPA-only tabs.

### Overview

The overview page shows provider cards for visible providers.

Compact card always shows:

- provider name
- aggregate status
- primary quota window, preferring 5-hour when present
- account count
- last refresh time
- provider refresh button

Expanded card shows:

- secondary quota window, such as weekly quota
- next reset time when known
- per-source account count summary only in expanded details, without using CPA wording in the card title

Overview cards must not show:

- CPA name in card title or primary content
- plugin name
- connector name
- `auth_index`
- CPA-Manager URL
- technical endpoint names

### Provider Page

Each provider page shows accounts for that provider.

Account rows show:

- account label
- quota windows
- reset time
- last refresh time
- account status
- source badge, such as `CPA` or `Direct`

Source badge visual spec:

- text size: 10-11px
- border: 1px solid `var(--border)` or equivalent low-contrast token
- color: `var(--muted-foreground)` or equivalent muted token
- background: transparent or subtle muted background
- placement: after account label, not before it
- never use primary/accent/destructive color unless the source itself is in error

User attention should remain on account quota and reset state.

### Empty and Failure States

- If CPA is not configured, main provider pages simply omit CPA accounts. CPA setup guidance appears only in settings.
- If CPA is configured but CPA-Manager is unreachable, provider pages show no CPA accounts from that connector; CPA settings shows the connection error.
- If a provider has no accounts from any connector, show a provider-level empty state with a settings link.
- If one CPA account fails and others succeed, provider pages show the successful accounts; CPA settings shows the failed account.

### Refresh Behavior

- Global refresh refreshes all enabled connectors.
- Provider refresh refreshes every enabled connector whose metadata declares that provider in `supportedProviders`.
- Account-level refresh is not part of this change; refresh happens at provider or connector scope.
- A failed CPA account must not mark the whole provider failed when other accounts still returned valid items.

### `overviewDisplayMode`

`AppConfiguration.overviewDisplayMode` is removed in this implementation.

The main UI always uses provider navigation with a 总览 view. This avoids carrying a stale grouped/tabs distinction from the old plugin-card UI.

## CPA Settings UI

CPA appears under settings as a connector configuration page.

Sidebar grouping:

```text
一般
数据来源
  CPA 额度连接器
  Claude Direct
  Codex Direct
  GLM
  MiniMax
  DeepSeek
  Tavily
```

### CPA Status Card

Show:

- connected state: 已连接 / 未连接 / 部分失败
- CPA-Manager URL
- last sync time
- discovered account counts by provider, for example:
    - Claude 3
    - Codex 2
    - Gemini 1
    - Kimi 1
    - Antigravity 1

### Connection Configuration

Fields:

- CPA-Manager URL
- Management Key
- Test Connection button
- Sync Now button
- refresh interval

`Test Connection` validates:

- URL is configured
- management key exists
- `/v0/management/auth-files` responds successfully

`Sync Now` triggers a normal connector refresh and updates discovered accounts.

### Monitoring Scope

Boolean switches:

- monitor_claude
- monitor_codex
- monitor_gemini
- monitor_antigravity
- monitor_kimi

Disabled providers must be shown as disabled in the CPA settings page, not as main UI failures.

### Discovered Accounts

Show accounts grouped by provider.

Each account row shows:

- remark or extracted account label
- masked identifier
- status
- last refresh time
- last error if any

A single account OAuth failure marks that account failed only. Other accounts remain usable.

### Error States

CPA settings must distinguish:

- CPA-Manager not connected
- management key invalid
- single account OAuth expired
- upstream provider API failed
- provider monitoring disabled

Errors in settings may mention CPA and CPA-Manager. Main usage UI should not.

## Error Semantics

Connector errors should preserve partial success.

If CPA returns at least one valid account item:

- connector status: partial failure if some accounts failed
- provider pages: show valid accounts normally
- failed accounts: show account-level error in CPA settings

If CPA returns no valid items and has errors:

- connector status: failed
- provider pages: no CPA accounts shown
- CPA settings: show connector-level error

## Renderer Architecture

Add a provider aggregation layer in shared renderer logic:

```text
ConnectorInfo[]
  -> collect UsageItem[] from ready and partial snapshots
  -> group by provider
  -> group provider items by account
  -> calculate provider card windows/status/account count
```

This keeps the UI from depending on plugin names.

### PopupView Refactor

`PopupView.tsx` stops rendering `PluginCard` for the main usage list.

New main renderer components:

- `ProviderNav`: 总览 + visible provider tabs.
- `ProviderOverview`: compact/expanded provider cards.
- `ProviderCard`: one provider summary card.
- `ProviderAccountList`: accounts for one provider.
- `ProviderAccountRow`: one account's quota windows.

`PluginCard` is removed from the main usage UI. If settings diagnostics need a reusable connector status component, create a new `ConnectorStatusCard`; do not rename or reuse `PluginCard` in the main provider UI.

### Suggested Files

- `src/shared/schemas/plugin-output.ts`: add provider/source/sourceInstanceId/accountId/accountLabel and require schema version `2`.
- `src/shared/schemas/plugin-metadata.ts`: add `supportedProviders`.
- `src/shared/types/config.ts`: remove `overviewDisplayMode` from the exported model.
- `src/shared/types/ipc.ts`: expose connector-oriented DTO names or document plugin-channel-to-connector DTO mapping.
- `src/main/core/config/config-store.ts`: strip or migrate old `overviewDisplayMode`.
- `src/main/core/scheduler/refresh-service.ts`: pass source instance context to plugin execution.
- `src/renderer/lib/provider-usage.ts`: derive provider groups.
- `src/renderer/views/PopupView.tsx`: render provider overview and provider pages.
- `src/renderer/views/SettingsView.tsx`: group configuration by data source.
- `src/renderer/components/CpaConnectorSettings.tsx`: CPA-specific settings and diagnostics.
- `assets/plugins/*.ts`: emit schema version `2` items and connector metadata.

## Testing Requirements

### Unit Tests

Add or update tests for:

- plugin output schema requires schema version `2` and provider/source/account metadata
- schema version `1` output is rejected
- all bundled plugins emit schema version `2` items before v1 rejection ships
- CPA plugin maps CPA-Manager `gemini-cli` auth files to UI provider `gemini`
- CPA plugin emits provider-specific `UsageItem`s
- provider aggregation groups CPA Claude items into Claude provider
- GLM and MiniMax remain provider groups
- no CPA provider group is created
- visible provider tabs hide CPA-only providers until CPA is configured, enabled, or has data
- provider cards hide connector names in primary content
- provider account list shows source labels with muted badge styling
- partial CPA account failure preserves successful accounts
- provider refresh selects connectors from `supportedProviders`
- old config containing `overviewDisplayMode` loads and saves without that field

### Component Tests

Add tests for:

- overview renders provider cards, not plugin cards
- overview cards render compact information by default
- expanded provider cards reveal secondary quota/reset details
- CPA items appear under matching provider pages
- no CPA tab exists
- settings sidebar shows CPA as data source
- CPA settings page shows status card, URL, key field, switches, account groups, errors
- CPA unconfigured state appears in settings, not main UI
- CPA unreachable state appears in settings, not overview cards

### E2E Tests

Add user E2E coverage for:

- configure CPA URL and management key
- test connection success/failure
- sync CPA
- verify Claude/Codex/Gemini/Kimi/Antigravity tabs receive CPA accounts after CPA sync
- verify GLM/MiniMax/DeepSeek/Tavily remain provider tabs when configured
- verify no CPA tab exists
- verify overview does not show CPA wording

### Packaged Smoke

Packaged smoke must verify:

- app launches
- provider overview loads
- provider popup root fills the packaged window height
- settings CPA connector page loads
- CPA does not appear as a main provider tab

## Documentation Updates

Update:

- `CLAUDE.md`: core provider list includes Gemini, Antigravity, and Kimi when this feature lands.
- `docs/plugin-contract.md`: connector/source semantics, schema version `2`, required usage item fields, supported provider metadata
- `docs/spec.md`: main UI is provider-first; CPA is connector-only; GLM/MiniMax remain providers
- `docs/test.md`: required CPA UI regression coverage
- `docs/test-coverage-matrix.md`: CPA connector UI, config migration, schema v1 rejection, and provider aggregation coverage

## Implementation Phases

1. Schema v2 and bundled plugin output conversion. Update every bundled plugin in one branch and add CI tests that reject v1 output.
2. Provider aggregation layer and connector DTO mapping. Keep IPC channels stable unless a full channel rename is explicitly planned.
3. PopupView provider UI refactor. Add visible provider tab logic, compact overview cards, and provider account lists.
4. SettingsView CPA connector UI. Add CPA status, connection testing, sync action, monitor switches, account groups, and connector errors.
5. Config cleanup and dead component removal. Remove `overviewDisplayMode`, migrate old configs, remove `PluginCard` from main UI, and create `ConnectorStatusCard` for settings diagnostics.
6. Documentation, E2E, and packaged smoke verification.

## Acceptance Criteria

- Main UI has no CPA provider tab.
- Overview cards are provider cards, not plugin cards.
- Overview cards use compact display by default and do not overload the popup.
- `overview` is a view, not a provider value.
- GLM and MiniMax remain first-class provider tabs/cards when configured.
- CPA-only providers are hidden until CPA is configured/enabled or returns data.
- CPA-collected Claude data appears under Claude.
- CPA-collected Codex data appears under Codex.
- CPA-collected Gemini data appears under Gemini.
- CPA-collected Kimi data appears under Kimi.
- CPA-collected Antigravity data appears under Antigravity.
- CPA `gemini-cli` auth files map to UI provider `gemini`.
- Overview does not show CPA wording in primary card content.
- Provider account rows show muted source badges.
- CPA settings page explains connection, scope, discovered accounts, and errors.
- CPA unconfigured and unreachable states are surfaced in settings only.
- Single CPA account failure does not hide healthy accounts.
- Old config files containing `overviewDisplayMode` load successfully and save without that field.
- Schema version `1` plugin output is rejected after all bundled plugins emit v2.
- Tests cover this regression so CPA cannot reappear as a main provider.
