# Task review t046（reviewer_focus: 代码）

- task：`t046_fix_account_usage_row_watch_toggle`
- spec：`docs\tasks\t046_fix_account_usage_row_watch_toggle/spec.md`
- diff_anchor：`be9f98d89d3949279b49bf8f8281a5f75890a143`
- target：`git diff be9f98d89d3949279b49bf8f8281a5f75890a143`
- round：1
- reviewed_at：2026-07-22 21:11 UTC+8

## Findings

无。

## 规格合规核对

| AC                                                       | 状态 | 证据                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 主面板 provider 卡片 account 详情每条数据标签行显示 bell | ✓    | `AccountUsageRow`（UsageRows.tsx:188-195）按 period 透传 `watched` + `on_toggle_watched` 到 `UsageBarRow`；`UsageBarRow:124` 在 `on_toggle_watched` 存在时渲染 bell（默认 opacity 0.35）。                                                                                                                              |
| 点击 bell 持久化 upcomingResetWatched                    | ✓    | 链路 `PopupView → ProviderOverview → ProviderCard → AccountUsageRow → UsageBarRow` 全程透传 `on_toggle_watched`；`PopupView.tsx:642` 接 `handle_toggle_watched`（来自 `use_watched_metric_toggler`），内部走 `add/remove_watched_metric` + `patchConfig`。                                                              |
| account 维度对齐                                         | ✓    | `ProviderCard.tsx:335,341` 使用 `watchedMetrics?.[provider]?.[account.id]` 与 `accountKey: account.id`。`provider-usage.ts:273-274` 证明 `account.id` 就是 `accountKey(period)` 的产物（`id: key`），与 t043 `ProviderAccountList:75,81` 同口径，且与 collect 侧 `accountKey()` 定义（provider-usage.ts:169-174）一致。 |
| AccountUsageRow 单测                                     | ✓    | tests/unit/renderer/components/usage_rows.test.tsx:160-236 覆盖渲染、未渲染、aria-pressed 状态、点击回调（断言 `toHaveBeenCalledWith("glm-4-air")`）。实现层不评测试质量。                                                                                                                                              |
| pnpm test / typecheck / lint                             | ✓    | `pnpm typecheck` 干净。lint 因全局 eslint 模块缺失未跑通（环境问题，非 diff 引入）。                                                                                                                                                                                                                                    |

**不偏航**：工作集 = spec 列出的 4 个源文件（ProviderCard / ProviderOverview / UsageRows / PopupView）+ 1 个测试文件 + 文档/JSON。无 spec 之外的「顺手改进」。

**不变量守住**：spec 非范围声明「不改 UsageBarList/ProviderAccountRow/ProviderAccountList 链（已正确）」——diff 未触及这三个文件。spec 非范围「不改数据层」——`account-overrides.ts` 等数据层文件未改。

**技术决策落地**：spec 写「props 加 `on_toggle_watched?: (raw_label: string) => void` 与 `watched_labels?: ReadonlySet<string>`」——实现一字不差（UsageRows.tsx:148-151）。spec 写「给 UsageBarRow 传 `watched={watched_labels?.has(period.raw_label) ?? false}` 与 `on_toggle_watched={on_toggle_watched ? () => on_toggle_watched(period.raw_label) : undefined}`」——实现一字不差（UsageRows.tsx:188-195）。

## 代码质量核对

- **DRY**：`ProviderCard.render_account_detail` 的 watched_labels/toggle 构造与 `ProviderAccountList:75-85` 结构相似但不 verbatim（后者保留 `undefined` 短路、前者统一 `new Set(... ?? [])`），且 spec 非范围禁改 ProviderAccountList，无重复提取空间。
- **控制流**：改动均为单层 props 透传与可选链，无新增嵌套。touched 函数（`AccountUsageRow`、`render_account_detail`、`ProviderOverview`、`PopupView` JSX 块）CC 未因本 task 显著上升。
- **错误处理 / 边界**：`watchedMetrics?.[provider]?.[account.id] ?? []` 对 undefined 链全保护；`account.id` 类型为 `string`（必填），无非空担忧。
- **并发 / 资源**：纯 props 透传，无 IPC/订阅/timer 新增。
- **命名 / SoC**：`watched_labels` / `on_toggle_watched` / `watchedMetrics` 与既有 t043 链一致；snake_case 符合项目约定。ProviderCard 仅承担渲染编排，watched 维度构造就地写无误。
- **死代码**：新增 import（`AccountOverrides` / `ToggleWatchedMetric`）均有引用。无注释掉的代码。
- **文件膨胀**：ProviderCard.tsx 434 行（pre-diff ~415，本 task +19）、PopupView.tsx 783 行（pre-diff ~781，+2）均已达 minor 阈值 400 且本 task 净增。但两处增量都是 spec 强制要求的 props 透传（ProviderCard.render_account_detail 是 spec 明确指定修改点），拆分会制造人为抽象，不属于「task 仍继续堆大」。不立 finding。
- **实现正确性**：`(raw_label) => on_toggle_watched({ provider, accountKey: account.id, raw_label })` 闭包对每次 map 迭代独立捕获 `account.id`，无共享变量竞态。`new Set(...)` 每次 render 新建不影响正确性（AccountUsageRow 未 memo）。

## 范围外观察（不进 finding 表）

- `ProviderCard.tsx:388-397` 的单账号分支（`!is_multi`）直接渲染 `UsageBarList` 且未传 `watched_labels`/`on_toggle_watched`，导致单账号 provider 在主面板卡片不显示 bell。spec 范围显式只覆盖 `render_account_detail`（多账号 L2 展开），此分支在 spec 非目标内；如后续要求主面板单账号卡片也支持监控，需单独 task。
- `pnpm lint` 因全局 pnpm 环境的 eslint 模块缺失未跑通（`Cannot find module ... eslint/bin/eslint.js`），与本 diff 无关；adoption 阶段如需 lint 证据，建议在干净环境复跑。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：改动精准落在 spec 声明的两条透传链与 `AccountUsageRow` 上，props 形状、accountKey 对齐、不变量、非范围边界全部守住；无代码质量问题值得立案。

verdict: PASS
