# Task spec

## 背景

CPA（`source: "gateway"`）一个 connector 可提供 claude、codex、antigravity 等多个厂商、多个账号。设置页 `CpaConnectorSettings` 的「同步范围」中，每个厂商 tag 按钮会打开 `LabelMapDialog`，用于编辑该厂商的数据标签映射。

`LabelMapDialog` 已按 `raw_label` 聚合 CPA snapshot 中同厂商账号，并由 `build_label_map_rows` 保留每条标签的 `account_keys`。但标签行没有「监控该数据标签的即将重置」bell。直连账号的 `SettingsForm` 已有同一入口与按全部 accountKey 聚合的 toggle 语义。

## 范围

1. `LabelMapDialog` 每条数据标签映射行支持可选 bell：
    - 仅在传入监控状态与回调时渲染；保留现有无回调调用方的界面。
    - `aria-label` / `title` 为「监控该数据标签的即将重置」。
    - 当该行全部 `account_keys` 已监控对应 `raw_label` 时，`aria-pressed="true"`；部分或全未监控为 `false`。
    - 点击回调同时传递 `raw_label` 与该行 `account_keys`。
2. `SettingsView` 打开 CPA 的 `LabelMapDialog` 时透传该厂商 `upcomingResetWatched` 状态；点击 bell 对该 `raw_label` 的全部 accountKey 一起 add/remove，并通过现有 `save_config` 持久化。
3. 补组件与 SettingsView 回归测试，覆盖 CPA gateway 多账号同 raw_label 的 bell 渲染、点击三元组持久化、全部已监控时移除。

## 非范围

- 不改 `CpaConnectorSettings` 的 tag 按钮、同步范围开关或数据标签映射保存语义。
- 不改 `SettingsForm` 已有 bell、`UsageBarRow`、`UsageBarList`、`AccountUsageRow` 或用量视图。
- 不改 `upcomingResetWatched` schema、`accountKey()`、`add_watched_metric` / `remove_watched_metric`、`collect_upcoming_resets`。
- 不改概览聚合与任何 provider 数据采集逻辑。

## 验收标准

- [ ] CPA 设置页从 claude / codex / antigravity 厂商的数据标签映射入口打开弹窗后，每条 raw_label 行显示 bell。
- [ ] CPA 同厂商多账号共享 raw_label 时，bell 的 pressed 状态仅在全部 accountKey 已监控时为 true。
- [ ] 点击未监控或部分监控的 bell，为该 raw_label 所有 accountKey 写入监控；全部已监控时移除全部对应监控。
- [ ] 直连账号和未传监控回调的 `LabelMapDialog` 不受影响。
- [ ] renderer 单测覆盖组件与 SettingsView 持久化路径。
- [ ] `pnpm test` 全量通过。

## 依赖与约束

- `build_label_map_rows` 的 `account_keys` 已由共享 `accountKey()` 生成，gateway key 格式为 `${sourceInstanceId}|label|${accountLabel}`。
- 监控状态 key 为 `upcomingResetWatched[provider][accountKey][raw_label]`。
- 不新增密钥、网络请求或 IPC。
