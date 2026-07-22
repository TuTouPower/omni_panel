# Task plan

## 步骤与验证

1. 红：SettingsForm 组件测（或扩既有 settings 测）——传 watchedMetrics + on_toggle_watched 时数据标签映射每行渲染 bell、watched 状态正确、点击触发 on_toggle_watched(raw_label)；不传则无 bell。 → 验证：失败。
2. 绿：SettingsForm props 加 `watchedMetrics?: AccountOverrides["upcomingResetWatched"]` + `on_toggle_watched?: (raw_label: string) => void`；labelRows 渲染时算每行 watched 状态（该 raw_label 的 accountKey(s) 是否全 watched）+ bell 按钮。
3. 绿：SettingsView 渲染 SettingsForm 处传 watchedMetrics（`config.accountOverrides?.upcomingResetWatched`）+ on_toggle_watched 回调（按 instance snapshot 的 accountKey(s) 调 add/remove_watched_metric + save_config）。
4. 黑盒：`pnpm test` + typecheck/lint + Playwright 验证设置页数据标签映射 bell 渲染 + 点击持久化。 → 验证：通过。
5. 双审 + 收尾。

## 风险与回退

- 风险：多 account instance（CPA）的 raw_label 对应多 accountKey，bell 状态判断（全 watched 才显开）+ toggle（全 add/全 remove）需正确聚合 → 单测覆盖多 account 用例。
- 风险：SettingsForm 拿 snapshot items（含 accountKey）需经 props 或既有 snapshot 通道；确认 labelRows 构建时 accountKey 可得（build_label_map_rows 去重 raw_label，需保留 accountKey 列表）。
- 风险：bell 与现有 label 编辑 input 布局冲突 → CSS 调整 lm-row。
- 回退：revert SettingsForm/SettingsView 改动，入口退回主面板（t043+t046 状态）。

## Finalization 时更新的 blueprint

- `docs/specs/ui-views-web.md`：监控入口位置（设置页数据标签映射旁 + 主面板 period 行两处）。
- `docs/specs/config-store.md`：若 watchedMetrics 语义补充。
