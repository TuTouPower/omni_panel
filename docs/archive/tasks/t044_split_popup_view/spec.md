# Task spec

## 背景

`src/renderer/views/PopupView.tsx` 已 954 行，超文件膨胀标准（≥800），跨 task 慢性累积。t043 引入 `handle_toggle_watched` 等 toggle wiring 时触发（`t043_code_f001`，遗留本 task 治本）。文件堆叠了 view wiring、account_overrides toggle、upcoming items 派生、provider groups memo、refresh handlers 等多类逻辑。

## 范围

- 把可抽离逻辑下沉为自定义 hook / 子组件，降低 PopupView 单文件体量。候选（实施时按耦合度定）：
    - `handle_toggle_watched` + account_overrides toggle 逻辑 → `use_watched_metric_toggler` 之类 hook。
    - `providerGroups` / `upcomingItems` 派生 → 独立 hook 或 memo 模块。
    - refresh handlers（refreshAll / refreshProvider）→ hook。
- 保持行为完全不变（纯重构，无功能变更）。

## 非范围

- 不改业务逻辑 / UI 视觉。
- 不改其他超阈值文件（仅 PopupView）。

## 验收标准

- [ ] PopupView.tsx 行数显著下降（目标 < 800 或较 954 明显减少，具体值实施时定）。
- [ ] 抽出的 hook/组件有单测（若可独立测）。
- [ ] `pnpm test` 全绿；typecheck/lint 干净。
- [ ] 行为零回归（主面板渲染、刷新、即将重置、metric toggle、拖拽等手工/自动验证）。

## 依赖与约束

- 纯重构，无契约/数据层变更。
- PopupView 多个闭包依赖（config/save_config/account_overrides/patchConfig），抽 hook 时注意依赖闭合、无 stale closure。
