# Task review t110（reviewer_focus: 代码）

- task：`t110_fix_add_account_wiring`
- spec：`docs\tasks\t110_fix_add_account_wiring/spec.md`
- diff_anchor：`12fea92b6624ecdc563580667609f77df9b8e239`
- target：`git diff 12fea92b6624ecdc563580667609f77df9b8e239`
- round：1
- reviewed_at：2026-07-25 18:30 UTC+8

## Findings

### t110_code_f001 - SettingsView source lookup 仍保留启发式回退，未按 spec 改为精确匹配

- 严重度：important
- 位置：`src/renderer/views/SettingsView.tsx:2118-2127`
- 问题：spec 要求 source 查找改为 `p.name === params.vendor_id` 的精确匹配，并删除 `source !== "gateway"` 与 `params.vendor_id === "cpa"` 的 fallback。实现虽然优先使用 `source_instance_id` 精确匹配，但回退分支仍使用 `p.name.toLowerCase() === params.vendor_id.toLowerCase()`、`p.supportedProviders.includes(params.vendor_id)`、`p.activeProviders.includes(params.vendor_id)` 等启发式匹配。这些正是原 bug 中 CPA 被错配到 deepseek 的匹配模式；一旦 `source_instance_id` 缺失或失效，CPA 仍可能命中错误的源插件。
- 建议：按 spec 删除回退分支，仅保留精确匹配（或仅保留 `source_instance_id` 精确路径并更新 spec）。

### t110_code_f002 - SettingsView 新增账号保存逻辑未复用 `savePluginSettings`，重复实现 config 更新

- 严重度：important
- 位置：`src/renderer/views/SettingsView.tsx:2135-2152`
- 问题：spec 写明 duplicate 后调用 `savePluginSecrets`，再调用 `savePluginSettings(created.instanceId, { displayName: params.account_name })` 写入账号名。实现却在 `onAddAccount` 内联了与 `savePluginSettings`（`SettingsView.tsx:957-990`）几乎完全相同的 config map 更新逻辑，包括 `parameterValues`、`endpointOverrides`、`refreshIntervalSeconds`、`displayName` 的写入。这违反 DRY，且与 spec 指定的调用路径不一致；未来 `savePluginSettings` 的行为变更（如刷新触发、字段清理）不会同步到新账号流程。
- 建议：复用 `savePluginSettings`，如担心 `duplicate` 后 `configRef` stale，可给 `savePluginSettings` 增加可选的 `baseConfig` 参数，而非复制整段逻辑。

### t110_code_f003 - `ExaServiceKeyForm` 被通用条件渲染，非 exa 的 apikey+extra_fields 会显示 exa 专属文案

- 严重度：minor
- 位置：`src/renderer/components/AddAccountDialog.tsx:300-311`
- 问题：渲染条件为 `auth_method === "apikey" && has_extra_fields`，只要任意厂商 descriptor 的 `auth.extra_fields` 非空就会渲染 `ExaServiceKeyForm`。但该组件写死了 "Service Key"、"API Key ID" 等 exa 专属标签，未来其他厂商复用 `extra_fields` 时会显示错误文案。
- 建议：将条件收窄为 `vendor_id === "exa"`，或将 `ExaServiceKeyForm` 拆为更通用的 extra-fields 表单。

### t110_code_f004 - `configRef.current` 在 render 阶段被赋值，违反 React 推荐模式

- 严重度：minor
- 位置：`src/renderer/views/SettingsView.tsx:733-734`
- 问题：在组件函数体中直接执行 `configRef.current = config`，会在 render 阶段修改 ref。React 文档明确不推荐在 render 中写 ref，在并发特性下可能导致不确定行为。
- 建议：在 `useEffect` 中同步 `configRef.current = config`，或通过其他方式（如将依赖改为稳定引用）避免 render 阶段副作用。

### t110_code_f005 - `config-store.ts` 添加了 task 范围外的额外日志字段

- 严重度：minor
- 位置：`src/main/core/config/config-store.ts:169-174`
- 问题：在裁剪无效插件时额外输出 `droppedIds`（含 `executablePath`）。该改动不在 spec 范围内，属于顺手增强，与本次 task 目标无关。
- 建议：回退该改动或拆入独立 task。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：5 条（2 important，3 minor）
- 总体判断：核心接线逻辑（cpa/exa 表单、displayName 写入）已实现，但 SettingsView 的 source 查找回退与保存逻辑存在 spec 偏离和 DRY 问题，需修复后重审。另提示：预存于 `AddAccountDialog.tsx:41-57` 的 `find_connector` CPA fallback（metadata.name 未命中时取第一个 gateway）在本次 diff 中未改动，但若 CPA metadata 缺失仍可能选错源，建议在后续优化中一并移除。

verdict: FAIL

## Round 2 (2026-07-25 18:40 UTC+8)

### 前轮 finding 复核

| finding_id     | 复核结论 | 修复位置                                                   | 说明                                                                                                                                                                                 |
| -------------- | -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| t110_code_f001 | 已修     | `src/renderer/views/SettingsView.tsx:2117-2127`            | source 查找已完全改为按 `params.source_instance_id` 精确匹配，删除了 `p.name`/supportedProviders/activeProviders/`cpa` fallback/`source !== "gateway"` 等所有启发式分支。            |
| t110_code_f002 | 已修     | `src/renderer/views/SettingsView.tsx:959-995`、`2135-2144` | `onAddAccount` 不再内联 config 更新，改为调用 `savePluginSettings`；`savePluginSettings` 新增 `base_config` 参数，duplicate 后传入从 main 重新拉取的 `latest.config`，避免闭包覆盖。 |
| t110_code_f003 | 已修     | `src/renderer/components/AddAccountDialog.tsx:294-306`     | `ExaServiceKeyForm` 渲染条件已收窄为 `auth_method === "apikey" && vendor_id === "exa" && has_extra_fields`，非 exa 厂商不会显示 exa 专属文案。                                       |
| t110_code_f004 | 已修     | `src/renderer/views/SettingsView.tsx:733-735`              | `configRef.current = config` 已移入 `useEffect`，不再在 render 阶段写 ref。                                                                                                          |
| t110_code_f005 | 已修     | `src/main/core/config/config-store.ts:169-174`             | 裁剪无效插件时的 `droppedIds`（含 `executablePath`）额外日志已回退，当前仅输出裁剪数量。                                                                                             |

### 本轮新发现

#### t110_code_f006 - `form_handles_save` 与 `ExaServiceKeyForm` 渲染条件不一致，非 exa 的 apikey+extra_fields 会进入无表单状态

- 严重度：minor
- 位置：`src/renderer/components/AddAccountDialog.tsx:95-100`、`src/renderer/components/AddAccountDialog.tsx:294-306`
- 问题：`form_handles_save` 对任意 `auth_method === "apikey" && has_extra_fields` 都为 true，会隐藏底部「添加账号」按钮并令 `handle_save` 直接返回；但实际渲染的 `ExaServiceKeyForm` 条件额外限制了 `vendor_id === "exa"`。若未来某个非 exa 厂商 descriptor 声明了 `auth.extra_fields`，对话框会既不显示通用 `ApiKeyForm`，也不显示任何自保存表单，用户无法继续。
- 建议：将 `form_handles_save` 中与 extra_fields 相关的条件与渲染条件对齐，例如改为 `auth_method === "apikey" && vendor_id === "exa" && has_extra_fields`。

### 结论

- 前轮 finding 复核：f001-f005 全部已修，修复位置与 `task.md` 记录一致。
- 本轮新发现：1 条（minor）。
- 总体判断：核心修复已全部落地，CPA/exa 表单接线、精确 source 匹配、displayName 保存、config 闭包问题均符合当前 spec；本轮发现的 `form_handles_save` 条件不一致属于可触发的防御性缺陷，建议修复后无需再审。

verdict: FAIL

## Round 3 (2026-07-25 22:43 UTC+8)

### 前轮 finding 复核

| finding_id     | 复核结论 | 修复位置                                                                | 说明                                                                                                                                                                                             |
| -------------- | -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| t110_code_f001 | 已修     | `src/renderer/views/SettingsView.tsx:2120-2127`                         | source 查找已完全改为按 `params.source_instance_id` 精确匹配，删除了 `p.name`/supportedProviders/activeProviders/`cpa` fallback/`source !== "gateway"` 等所有启发式分支。                        |
| t110_code_f002 | 已修     | `src/renderer/views/SettingsView.tsx:959-995`、`2135-2144`              | `onAddAccount` 不再内联 config 更新，改为调用 `savePluginSettings`；`savePluginSettings` 新增 `base_config` 参数，duplicate 后传入从 main 重新拉取的 `latest.config`，避免闭包覆盖。             |
| t110_code_f003 | 已修     | `src/renderer/components/AddAccountDialog.tsx:294-306`                  | `ExaServiceKeyForm` 渲染条件已收窄为 `auth_method === "apikey" && vendor_id === "exa" && has_extra_fields`，非 exa 厂商不会显示 exa 专属文案。                                                   |
| t110_code_f004 | 已修     | `src/renderer/views/SettingsView.tsx:733-735`                           | `configRef.current = config` 已移入 `useEffect`，不再在 render 阶段写 ref。                                                                                                                      |
| t110_code_f005 | 已修     | `src/main/core/config/config-store.ts:169-174`                          | 裁剪无效插件时的 `droppedIds`（含 `executablePath`）额外日志已回退，当前仅输出裁剪数量。                                                                                                         |
| t110_code_f006 | 已修     | `src/renderer/components/AddAccountDialog.tsx:96-100`、`294-306`、`312` | `form_handles_save` 已加入 `vendor_id === "exa"` 条件，与 `ExaServiceKeyForm` 渲染条件完全一致；footer 渲染也统一使用 `!form_handles_save`，非 exa 的 apikey+extra_fields 不会再进入无表单状态。 |

### 本轮新发现

无。

### 扫描说明

- 复查了 `SettingsView.tsx` 的 `onAddAccount` 流程：`params.source_instance_id` 精确查找源插件 → `duplicate` → 拉取最新 config → 通过 `savePluginSettings` 统一写入 secrets/parameter_values/endpoint_overrides/displayName，符合 spec 要求。
- `AddAccountDialog.tsx` 中 `handle_save` 与 `handle_form_save` 均已注入 `source_instance_id`，CPA/exa 两个自保存表单通过 `handle_form_save` 复用同一套注入逻辑。
- 新增 `CpaMgmtForm.tsx`/`ExaServiceKeyForm.tsx` 职责单一，字段、保存 payload 与 spec 一致；未引入死代码或未使用 import。
- `schemas/plugin-metadata.schema.json` 的 `auth.extra_fields`/`require_endpoint` 扩展属于支撑本次表单契约的必要改动，仍在 task 范围内。
- 范围外提示（不进 finding 表）：`AddAccountDialog.tsx:41-51` 的 `find_connector` 仍保留 `metadata?.name`/supportedProviders/activeProviders 启发式匹配，但 spec 本轮只要求改造 `SettingsView` 的 source 查找；若未来 CPA metadata 缺失仍可能选错源，建议在后续优化中移除。

### 结论

- 前轮 finding 复核：f001-f006 全部已修或已撤回。
- 本轮新发现：0 条。
- 总体判断：核心接线逻辑、精确 source 匹配、config 闭包问题、CPA/exa 独立表单及 displayName 保存均已按 spec 落地，无新增代码质量问题。

verdict: PASS

## Round 4 (2026-07-26 06:52 UTC+8)

### 前轮 finding 复核

| finding_id     | 复核结论 | 修复位置                                                         | 说明                                                                                                                                                                                                                                             |
| -------------- | -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| t110_code_f001 | 已修     | `src/renderer/views/SettingsView.tsx:2120-2127`                  | source 查找仍完全按 `params.source_instance_id` 精确匹配；无 `p.name`/supportedProviders/activeProviders/`cpa` fallback/`source !== "gateway"` 等启发式回退。                                                                                    |
| t110_code_f002 | 已修     | `src/renderer/views/SettingsView.tsx:959-995`、`2131-2140`       | `onAddAccount` 调用 `savePluginSettings` 统一写入 secrets/parameter_values/endpoint_overrides/displayName；`savePluginSettings` 新增 `base_config` 参数，duplicate 后传入 `window.usageboard.config.get()` 返回的 `latest.config` 避免闭包覆盖。 |
| t110_code_f003 | 已修     | `src/renderer/components/AddAccountDialog.tsx:294-306`           | `ExaServiceKeyForm` 渲染条件保持 `auth_method === "apikey" && vendor_id === "exa" && has_extra_fields`，非 exa 厂商不会渲染 exa 专属表单。                                                                                                       |
| t110_code_f004 | 已修     | `src/renderer/views/SettingsView.tsx:730-735`                    | `configRef.current = config` 仍在 `useEffect` 中同步，未在 render 阶段写 ref。                                                                                                                                                                   |
| t110_code_f005 | 已修     | `src/main/core/config/config-store.ts`                           | 范围外日志增强未重新引入；当前 diff 中无相关新增日志字段。                                                                                                                                                                                       |
| t110_code_f006 | 已修     | `src/renderer/components/AddAccountDialog.tsx:95-100`、`294-306` | `form_handles_save` 与 `ExaServiceKeyForm` 渲染条件均含 `vendor_id === "exa"`，保持一致；footer 渲染使用 `!form_handles_save`，非 exa 的 apikey+extra_fields 不会进入无表单状态。                                                                |

### 本轮新发现

无。

### 扫描说明

- 复核 `SettingsView.tsx` 的 `onAddAccount`：source 精确匹配 → `duplicate` → 拉取最新 config → `savePluginSettings` 统一保存的完整链路无回退，符合 spec。
- `AddAccountDialog.tsx` 的 `handle_save` 与 `handle_form_save` 均注入 `source_instance_id`，覆盖 apikey/session/local_cli/oauth_device/web_login/cpa_mgmt/exa 全部保存路径。
- `CpaMgmtForm.tsx` 字段、默认值（`http://127.0.0.1:17863`）、保存 payload 与 spec 一致；`ExaServiceKeyForm.tsx` 双字段、可选 LIMIT、保存 payload 与 spec 一致。
- 未发现新增死代码、未使用 import、verbatim 重复块或明显控制流/空值问题。

### 结论

- 前轮 finding 复核：f001-f006 全部已修。
- 本轮新发现：0 条。
- 总体判断：修复已稳定落地，符合 spec 要求，无新增代码质量问题。

verdict: PASS
