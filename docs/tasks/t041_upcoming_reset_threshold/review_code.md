# Task review t041（reviewer_focus: 代码）

- task：`t041_upcoming_reset_threshold`
- spec：`docs/tasks/t041_upcoming_reset_threshold/spec.md`
- diff_anchor：`d38f3fb`
- target：`git diff d38f3fb -- src/`
- round：1
- reviewed_at：2026-07-22 17:10 UTC+8

## Findings

### t041_code_f001 - SettingsView.tsx 已超 important 文件膨胀阈值且本 task 仍净增

- 严重度：important
- 位置：`src/renderer/views/SettingsView.tsx`（全文 2349 行，本 task 净增 107 行）
- 问题：按 prompt「文件过大标准」实现源码 ≥ 800 行 → important。该文件 t041 前已 2242 行（历史包袱），本 task 在其中追加阈值输入 SetRow（约 36 行）、直连/CPA 两路 `on_toggle_upcoming` 接线与 `acct_key` 计算（约 60 行）、`toggle_upcoming_reset` useCallback（约 16 行）。`docs/blueprint/conventions.md` 未对文件大小阈值做项目覆盖，diff/说明也未给出「SettingsView 不可拆」的硬约束。规则按字面触发 important：单文件已严重膨胀，本 task 继续在其中加分支会进一步降低可读性与 reviewer 可信度。
- 建议：adoption 可处置为「遗留」，开独立 refactor task 拆分 SettingsView（如把账号列表区抽成 `<AccountListSection>` 子组件，承载 hide/upcoming toggle/label 等账号级行为）。本 task 不阻塞，但需要明确跟踪。
- 备注：PopupView.tsx（913 行，净增 36 行）与 provider-usage.ts（613 行，净增 32 行）也分别超 important / minor 阈值，但增量小且无独立可拆的硬约束（条件渲染/单一工具函数），不单独出 finding。

### t041_code_f002 - PopupView 阈值非空判断在 Banner/Rail 两处 verbatim 重复

- 严重度：minor
- 位置：`src/renderer/views/PopupView.tsx:732-733`、`src/renderer/views/PopupView.tsx:775-776`
- 问题：`upcoming_reset_threshold_percent !== null && upcoming_reset_threshold_percent !== undefined` 一模一样地出现在 `<UpcomingResetBanner>` 与 `<UpcomingResetRail>` 外层。DRY 违反；若未来阈值对象演化为 `{ enabled, percent }` 之类结构，两处易漏改。
- 建议：在组件顶部抽 `const show_upcoming = upcoming_reset_threshold_percent != null;`，Banner/Rail 各包一层 `{show_upcoming && (...)}`。

### t041_code_f003 - `apply_config` 的 useCallback 依赖数组遗漏 `set_upcoming_reset_threshold_percent`

- 严重度：minor
- 位置：`src/renderer/views/PopupView.tsx:115-168`（依赖数组在 156-167 行）
- 问题：本 task 在 `apply_config` 内新增了 `set_upcoming_reset_threshold_percent(config.upcomingResetThresholdPercent ?? null)`（第 139 行），但依赖数组未同步加入该 setter。其他 10 个 setter（`set_usage_bar_color_scheme` 等）都在数组内，唯独新 setter 漏列，破坏一致性。运行时因 useState setter identity 稳定不会触发 bug，但触发 `react-hooks/exhaustive-deps` lint 警告，且与同文件其他 setter 处理风格不一致。
- 建议：依赖数组加入 `set_upcoming_reset_threshold_percent`。

### t041_code_f004 - 直连 VendorCard 场景下 toggle 仅作用于 `snapshot_items(info)[0]`，多账号 instance 漏切

- 严重度：minor
- 位置：`src/renderer/views/SettingsView.tsx:1507-1513`（acct_key 计算）、`1601-1603`（on_toggle_upcoming 内 first_item 取值）；`collect_upcoming_resets` 比较 `account.id` 见 `src/renderer/lib/provider-usage.ts:581`。
- 问题：直连（非 gateway）连接器在 SettingsView 按 `plugin.instanceId` 聚合成一个 VendorCard row，`acct_key` 与 `toggle_upcoming_reset` 都只取 `snapshot_items(info)[0]` 作为该 instance 的账号标识。当一个直连 connector 实例返回多个 `MetricRecord`（多账号 / 多 API key）时：
    - row 上 bell 按钮只反映第一个 item 的 `accountKey` 状态；
    - 点击 toggle 只把第一个 accountKey 写入 `accountOverrides.upcomingResetOff[provider]`；
    - 该 instance 其余账号的 `accountKey` 永远不进 off 集合，仍会进「即将重置」面板。
    - 与 CPA 场景（`CpaCard` 每个 row 一个按钮，逐账号切，见 `1649-1684`、`1743-1756`）的覆盖度不一致。
- 场景：spec AC「监控关的账号不进面板（即使剩余% 达标）」在直连多账号 instance 下，第二、三个账号无法被关闭。
- 建议：短期可选——在 row 计算与 toggle 中遍历所有 `snapshot_items(info)` 计算 accountKey 集合并整体切换；或把直连多账号场景也展开为多 row（与 CPA 对齐）。spec 未明确，也可在 adoption 标「遗留」+补 doc 注释说明当前仅支持单账号直连。

### t041_code_f005 - `upcomingResetThresholdPercent` zod schema 缺范围 / 整数约束

- 严重度：minor
- 位置：`src/main/core/config/types.ts:114`
- 问题：`upcomingResetThresholdPercent: z.number().nullable().optional()`。同 schema 内其他百分比/数值字段有一致约束风格：`convergentTimeMinutes: z.number().int().min(1).max(1440).optional()`（106 行）、`cacheMaxMb: z.number().int().min(1).max(10000).optional()`（87 行）。spec 明确阈值范围「0-100，单位 %」，UI input 也设 `min={0} max={100}`（`SettingsView.tsx:1300-1301`），但 schema 不约束 int / 范围。手动编辑 config 导入文件可写入 `200` / `-5` / `12.7`，schema 通过；运行时逻辑虽不崩（`200` → 大多数账号都进面板），但与 spec「0-100 整数」不一致。
- 建议：改为 `z.number().int().min(0).max(100).nullable().optional()`，与 UI 输入约束对齐，fail-fast 拒绝外部非法值。

### t041_code_f006 - 无效场景下 bell 按钮仍渲染且点击静默 no-op

- 严重度：minor
- 位置：`src/renderer/views/SettingsView.tsx:1593-1609`（on_toggle_upcoming 回调）、`1507-1526`（first_item / upcoming_off 计算）；按钮渲染门控在 `AccountRow.tsx:101-115`。
- 问题：直连 VendorCard 的 `on_toggle_upcoming` 总是向下传递（只要外层 `on_toggle_upcoming` prop 提供就渲染按钮），但 handler 内部有两支静默 return：
    1. `if (provider_id === "overview") return;`（1594-1595）
    2. `if (!first_item) return;`（1604，发生在 plugin 未启用 / snapshot.status !== "ready" / items 为空时）
       同时 row 的 `upcoming_reset_off` 计算也基于 `first_item` 是否存在，无 first_item 时 `upcoming_off = false`，按钮呈现「监控开」视觉态（opacity 1）。用户看到一个看似可用的「监控开」按钮，点击后无任何反馈与持久化，违反 spec AC「点击 toggle 持久化」对有效场景之外的隐含合理行为。
- 场景：plugin 异常（status=failed 且 items 为空）或 provider 未识别（`provider_id === "overview"`）时，按钮可点但无效果。
- 建议：要么在这些场景下不传 `on_toggle_upcoming`（让 `AccountRow` 自动不渲染按钮，因 `AccountRow` 已用 `on_toggle_upcoming &&` 作门控），要么给 button 加 `disabled` 并改 tooltip/state 提示「暂无可用账号」。

## 结论

- 前轮 finding 复核：N/A（round 1）。
- 本轮新发现：6 条（1 important，5 minor）。
- 总体判断：spec AC 覆盖完整，不变量守住（offAccounts 用 accountKey 与 collect_upcoming_resets 对齐、threshold null 整体不渲染、cycleDurationMs 缺失 skip），核心逻辑正确。主要问题是 SettingsView 在已严重膨胀基础上继续堆代码（important，建议拆解遗留）、DRY/exhaustive-deps 等代码质量细节、以及直连多账号 instance 场景的覆盖局限。

verdict: FAIL

## Round 2 (2026-07-22 04:30 UTC+8)

### 前轮 finding 复核

- **t041_code_f001 (important, 遗留)**：SettingsView 已 2384 行（t041 净增 142 行），仍超 important 阈值 800。按约定本轮不重审，维持遗留处置。已修/遗留：遗留。
- **t041_code_f002 (minor)**：`PopupView.tsx:285` 新增 `const show_upcoming = upcoming_reset_threshold_percent != null;`，`Banner`（735-743）与 `Rail`（775-783）均改为 `{show_upcoming && (...)}` 包裹，两处 verbatim 重复消除。已修。
- **t041_code_f003 (minor)**：`PopupView.tsx:167` 依赖数组已加入 `set_upcoming_reset_threshold_percent`，与同文件其他 11 个 setter 风格一致。已修。
- **t041_code_f004 (minor)**：直连多账号场景已重写。`SettingsView.tsx:1534-1539` 由 `snapshot_items(info)` 计算全量 items 与 `can_toggle_upcoming`；行内 `off_list`/`all_off`（1540-1549）遍历全部 items 的 `accountKey`；新增 `toggle_upcoming_reset_keys`（826-848）原子地循环 add/remove 全部 key，`turn_off` 决定整体方向，避免部分切换导致的状态不一致。CPA 侧（1684-1718）逐 row 独立 toggle 保持不变，与直连整体切换语义对齐（直连一个 instance = 一个 VendorCard row）。已修。
- **t041_code_f005 (minor)**：`src/main/core/config/types.ts:114` 已改为 `z.number().int().min(0).max(100).nullable().optional()`，与 UI input `min={0} max={100}` 及 spec「0-100 整数」对齐。已修。
- **t041_code_f006 (minor)**：`VendorCard.tsx:46-52` 行级门控 `on_toggle_upcoming && row.can_toggle_upcoming !== false`，`SettingsView.tsx:1538-1539` 计算 `can_toggle_upcoming = provider_id !== "overview" && items.length > 0`，overview/未启用/空 items 行 `can_toggle_upcoming=false` -> `on_toggle_upcoming` 为 undefined -> `AccountRow.tsx:101` `on_toggle_upcoming &&` 不渲染 bell 按钮。原静默 no-op 场景消除。已修。

### 本轮新发现

0 条。扫描范围：

- `accountKey` 签名由 `ProviderUsagePeriod` 改为 `AccountKeyInput`，三处调用点（`provider-usage.ts:257/328`、`SettingsView.tsx:1548/1638/1690/1789`）类型兼容，`MetricRecord` 满足 `AccountKeyInput` 结构字段（source/sourceInstanceId/accountId/accountLabel）。
- `toggle_upcoming_reset_keys` 循环内 `add_account_override`/`remove_account_override` 均返回非 undefined `AccountOverrides`，`next` 不变量守住，`if (!next) return` guard 仅 TS narrow。
- `collect_upcoming_resets` 新增 `cycleDurationMs <= 0` skip、`off_set` per-provider 过滤、threshold null 早返回，逻辑正确，与 spec AC 4-7 对齐。
- `account-overrides.ts` `AccountOverrideKind` 联合类型扩展，`add/remove_account_override` 复用 hidden 路径，无重复逻辑。
- VendorCard/CpaCard/AccountRow props 传递链完整，无悬空 prop。

### 结论

- 前轮 finding 复核：f002-f006 全部已修；f001 遗留。
- 本轮新发现：0 条。
- 总体判断：修复到位，未引入新问题。

verdict: PASS
