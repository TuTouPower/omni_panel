# Task review t044（reviewer_focus: 代码）

- task：`t044_split_popup_view`
- spec：`docs/tasks/t044_split_popup_view/spec.md`
- diff_anchor：`6d4f7e0`
- target：`git diff 6d4f7e0`
- round：1
- reviewed_at：2026-07-22 16:35 UTC+8

## Findings

无。

## 观察段（不进 finding 表，供 adoption 参考）

1. **拖拽 handler 由 inline 升级为 useCallback**（`src/renderer/hooks/use_dnd_handlers.ts:58-148`）
   原 PopupView 中 `handle_drag_start/enter/over/end`、`handle_account_drag_*` 均为每渲染重建的内联函数；新版统一 wrap 成 useCallback 并补全 deps。函数 identity 由「每渲染变」转为「deps 变才变」，属轻微行为差异。所有消费方（`ProviderOverview`、`ProviderAccountList` 经 PopupView `render_body` 传入）未对函数作引用比较或作进 effect/useCallback dep，无可见行为差别，且严格减少子组件无谓重渲染。不构成本 task 宣称的「行为零回归」违反。

2. **`use_tab_navigation` 在 effect deps 中显式追加 `tabsRef` 与 `setActiveTab`**（`src/renderer/hooks/use_tab_navigation.ts:29,59`）
   原内联 effect deps 分别为 `[activeTab]` 与 `[orderedProviders]`。新版追加 ref/setter。React 保证 refs 与 useState setters 引用稳定，追加不改变实际触发时机，是更严密的写法。

3. **spec AC「抽出的 hook/组件有单测（若可独立测）」覆盖 2/4**
   `use_dnd_handlers.test.ts`、`use_popup_derived.test.ts` 已建；`use_tab_navigation`、`use_watched_metric_toggler` 未建。二者均为纯 hook、可独立测。测层覆盖判定归 test reviewer；代码层仅记录观察。

## 逐项核对记录

### hook 与原 inline 逻辑等价性

- **`use_watched_metric_toggler`**：与原 `handle_toggle_watched` useCallback 逐字一致；deps `[account_overrides, patchConfig, set_account_overrides]` 闭合。
- **`use_popup_derived`**：8 个 useMemo + 1 个直接计算的 `activeGroup` 全部对齐：
    - `rawGroups` ← `[plugins]`
    - `providerGroups` ← `[rawGroups, account_overrides, account_labels]`
    - `visibleProviders` ← `[rawGroups, plugins]`
    - `upcomingItems` ← `[providerGroups, upcoming_reset_threshold_percent, account_overrides]`
    - `orderedProviders` ← `[visibleProviders, provider_order]`
    - `providerErrors` ← `[plugins]`
    - `accountErrors` ← `[providerGroups]`
    - `activeGroup` ← 由 `active_tab` 与 `providerGroups` 直接派生（未 memo，与原一致）
    - `orderedActiveGroup` ← `[activeGroup, account_orders, active_tab]`
- **`use_dnd_handlers`**：5 个 state + 7 个 handler 全部迁入；闭包变量 `drag_id`/`drag_rect`/`orderedProviders`/`account_drag_id`/`activeGroup`/`activeTab` 均入对应 useCallback deps；setState setters 藉 React 稳定性省略，符合 exhaustive-deps 规则。无 stale closure。
- **`use_tab_navigation`**：两个 effect 原样搬迁；`wheel_at_ref` 由 PopupView 迁入 hook；wheel 回调内 `orderedProviders` 闭包变量已入 deps。

### PopupView 调用面

- 解构 `use_popup_derived` 取 8 项（未取 `rawGroups`，允许）；解构 `use_dnd_handlers` 取 4 state + 7 handler；`use_watched_metric_toggler` 与 `use_tab_navigation` 调用参数对齐。
- `render_body` 内 `drag_id`/`over_id`/`account_drag_id`/`account_over_id`、`handle_*` 全部经 hook 返回值消费，与原 inline 一致。
- 5 个 import 清理：`build_provider_usage_groups` 等 6 个 provider-usage 符号、`add_watched_metric`/`remove_watched_metric`、`compute_drag_reorder`/`build_reorder_base` 全部移走；PopupView 仅保留 `PROVIDER_ORDER` 与 `ProviderUsageGroup` type，仍分别用于 `valid_providers`（line 108）与 `structural_signature` 签名（line 37）。无悬空 import。

### 不变量

- `structural_signature` 参数由 `ReturnType<typeof build_provider_usage_groups>` 改为 `readonly ProviderUsageGroup[]`：后者是前者的超集类型，`providerGroups: ProviderUsageGroup[]` 可赋给 `readonly ProviderUsageGroup[]`，无运行时差异。

### 体量与复杂度

- `PopupView.tsx` 781 行（< 800 important 阈值，满足 AC「< 800」）。
- `use_dnd_handlers.ts` 163 行、`use_popup_derived.ts` 135 行、`use_tab_navigation.ts` 60 行、`use_watched_metric_toggler.ts` 46 行，均 < 400 minor 阈值。
- 单函数最大分支：`handle_drag_over` 与 `handle_account_drag_enter` 约 6-7 支，< 10。无复杂度 finding。

### 命名/风格

- 全部 snake_case；4 空格缩进；`import type` 用于纯类型导入；interface 用 PascalCase 与项目既有风格一致。
- 每个 hook 顶部 `/* eslint-disable react-hooks/rules-of-hooks */` 是为绕开 eslint 对 `use_*`（下划线 + 小写）命名识别不到 hook 的限制；`exhaustive-deps` 规则未禁用，依赖正确性仍由 lint 把关。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无前轮。
- 本轮新发现：0 条。
- 总体判断：4 个 hook 抽离与原 PopupView inline 逻辑逐项等价；memo 依赖链闭合；无 stale closure；无业务/UI 变更；命名风格与体量均符合项目约定。

verdict: PASS
