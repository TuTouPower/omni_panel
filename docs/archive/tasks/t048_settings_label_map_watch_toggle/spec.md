# Task spec

## 背景

t043 把「是否监控即将重置」入口放在主面板 period 行（用户当时选择）。实际需求：入口在**设置页账号详情的「数据标签映射」旁**，粒度单个数据标签（raw_label）。主面板入口用户找不到、不符合预期。

数据层已就绪（t043）：`accountOverrides.upcomingResetWatched[provider][accountKey][raw_label]`、`add_watched_metric`/`remove_watched_metric`、`collect_upcoming_resets` watchedMetrics 门控。本 task 只改 UI 入口位置。

## 范围

1. `SettingsForm`（`src/renderer/components/SettingsForm.tsx`）「数据标签映射」区域（`labelMapExpanded` 内，每行 `lm-row`）每条 raw_label 行加 bell toggle：
    - bell 状态：该 raw_label 在当前 instance 的 accountKey(s) 是否 watched（`watchedMetrics[provider][accountKey].includes(raw_label)`）。
    - 点击：全 watched → 移除该 raw_label 对所有 accountKey 的监控；否则为该 raw_label 的所有 accountKey 加监控（`add_watched_metric`/`remove_watched_metric`）。accountKey 来自 `labelRows` 对应的 snapshot items（`MetricRecord` 经 `accountKey(item)`）。
    - tooltip/aria「监控该数据标签的即将重置」，默认关 opacity 0.35。
2. `watchedMetrics` + toggle 回调透传：`SettingsView`（持有 config/save_config）→ `SettingsForm`（加 props `watchedMetrics` + `on_toggle_watched`）。
3. bell 与「数据标签映射」每行并列（raw_label 旁），不破坏现有 label 编辑 UI。

## 非范围

- **不改数据层**（`upcomingResetWatched` / `collect_upcoming_resets` / `add_remove_watched_metric` / config schema）。
- **不移除主面板 bell**（t043 AccountUsageRow 链 + t046 修复保留，两处入口共存，toggle 同一 watched 数据）。
- 不改 `LabelMapDialog`（CPA 数据标签映射弹窗）。
- 不改全局阈值 `upcomingResetThresholdPercent`。

## 验收标准

- [ ] 设置页账号详情展开「数据标签映射」，每条 raw_label 行右侧显示 bell（默认关）。
- [ ] 点击 bell 持久化 `upcomingResetWatched`（provider+accountKey+raw_label），刷新后状态保留。
- [ ] accountKey/raw_label 维度对齐 `collect_upcoming_resets`（`accountKey()` 函数）。
- [ ] 多 account instance：bell 对该 raw_label 的所有 accountKey 一起 toggle。
- [ ] SettingsForm 组件测：bell 渲染 + watched 状态 + 点击触发回调（add/remove 分支）。
- [ ] `pnpm test` 全绿；typecheck/lint 干净。

## 依赖与约束

- t043 数据层（upcomingResetWatched / helpers / collect）已就绪。
- `accountKey()`（provider-usage.ts:169）已存在；snapshot items（MetricRecord[]）含 accountKey 信息。
- SettingsForm 已有 instanceId/providerId/onSaveLabelMap 上下文。
