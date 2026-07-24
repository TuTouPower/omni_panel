# connector-user-scripts

用户自定义 connector 支持。用户在 `userData/connectors/<vendor>/` 放 `manifest.json` + `connector.ts`，app 启动自动发现并采集；provider 名为开放 snake*case 命名空间（`^[a-z]a-z0-9*]\*$`），不限于内置 enum。

## 实现要点

- `connectorProviderSchema`（`src/shared/schemas/manifest.ts`）：从 `usageProviderSchema.or(z.literal("cpa"))` 改为 `z.string().regex(/^[a-z][a-z0-9_]*$/)`。`Manifest.provider` 类型随之变 `string`。
- `usageItemSchema.provider`（`src/shared/schemas/plugin-output.ts`）：从 `usageProviderSchema` 改同 regex，`MetricRecord.provider` 变 `string`。`usageProviderSchema` enum 保留作内置 provider 窄类型与 CPA 子 provider 过滤，不再用于 runtime 过滤。
- `plugin-metadata.ts supportedProviders`：`z.array(connectorProviderSchema)`（与 manifest 同源，snake_case 一致）。
- `observation-mapping.ts`：删 `usageProviderSchema.safeParse` 过滤，信任 manifest 声明的 provider（开放命名空间，无 enum re-filter）。
- `connector-ipc.ts supported_providers`：非 CPA 分支返回 `[manifest.provider]`（不再 safeParse 丢未知 provider）；CPA 分支保留 enum 过滤（monitor\_\* 子 provider 仍是已知集合）。
- `ConnectorInfo.activeProviders/supportedProviders`（`src/shared/types/ipc.ts`）：`readonly string[]`。
- `config.ts`：`Partial<Record<UsageProvider, ...>>` 五处改 `Record<string, ...>`（provider 作配置 key 不限 enum）。
- `provider-usage.ts`：派生类型 `ProviderUsagePeriod/Group/AccountError/UpcomingResetItem.provider` 宽化 `string`；`PROVIDER_LABELS: Record<string,string>`、`PROVIDER_ORDER: readonly string[]`；`label = PROVIDER_LABELS[provider] ?? provider`（未知 provider fallback）；`compare_providers` 对未知 provider（indexOf=-1）映射 rank=+∞ 排末尾。
- `PopupView`：删 `valid_providers` 白名单过滤，信任 `config.providerOrder`（自定义 provider 拖拽位置可持久化）。
- 组件/hook prop 类型 `UsageProvider`→`string`、`VendorId`→`string`（Icon/ProviderNav/ProviderOverview/ProviderCard/ProviderAccountList/UpcomingReset×3/use_popup_derived/use_dnd_handlers/use_tab_navigation/use_watched_metric_toggler/LabelMapDialog/SettingsForm/CpaConnectorSettings）。
- 文档：`docs/guides/custom-connector.md`（manifest schema + connector.ts vm sandbox 模板 + ctx 能力 + status 助手阈值 + 示例）。

## 验证方式

Desktop（schema 放开 + IPC 类型 + renderer fallback）。manifest-loader 单测（自定义 provider 发现 + 非法字符拒绝）、observation-mapping/plugin-output 反转断言、provider-usage fallback 两用例、auth-ipc 去 cast。

## 边界

- `UsageProvider` enum 类型保留；残留 `as UsageProvider` cast 为 pre-existing 渐进迁移（CPA monitor 过滤、account-overrides、AddAccountDialog META），运行时无影响。
- connector 脚本在 vm sandbox（无 import/export，`declare const ctx`），约束见 custom-connector.md。
- 自定义 provider 图标用默认 logo（无内置 vendor logo）；label 用 provider 名 fallback。
