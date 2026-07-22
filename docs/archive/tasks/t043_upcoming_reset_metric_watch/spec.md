# Task spec

## 背景

t041「即将重置」监控为 account 级开关（`accountOverrides.upcomingResetOff`，列出的 account 不监控，默认全开）。用户需 metric（数据标签）级粒度：只监控指定 provider+account+某个数据标签；默认全部关闭；用户显式开启对单个数据标签的监控。不是监控整个账号。

面板 item 已是 account+metric 粒度（`UpcomingResetItem.metricLabel` 来自 `period`），`collect_upcoming_resets` 当前按 account 级 `offAccounts` 过滤——本 task 将过滤粒度下沉到 metric，并把默认语义从「全开」反转为「全关 + 显式开启」。

## 范围

### 1. 数据模型（config-store）

- 废弃 `AccountOverrides.upcomingResetOff`。
- 新增 `AccountOverrides.upcomingResetWatched?: Partial<Record<UsageProvider, Partial<Record<string, readonly string[]>>>>`
    - 外层 provider；中层 accountKey（`accountKey()` 已有，provider-usage.ts:169）；内层 `raw_label` 数组（`MetricRecord` 无 metric_id，`raw_label` 为数据标签稳定标识）。
    - 缺省/空 = 全关；列出的 (provider, accountKey, raw_label) = 显式开启监控。
- Zod schema 同步；迁移：加载旧 config 时丢弃 `upcomingResetOff`（不报错），`upcomingResetWatched` 默认空。

### 2. 过滤逻辑（provider-usage.ts）

- `collect_upcoming_resets`：`thresholdPercent` null/undefined → `[]`（不变，整体不监控）。
- period 进面板 iff `period.raw_label ∈ watched[provider][accountKey]` 且 剩余% ≤ threshold。
- 默认 watched 空 → 面板空（无符合 item）。
- `UpcomingResetItem` 加 `rawLabel: string`（UI toggle 状态判断 + 匹配键）。

### 3. 主面板 metric 行 toggle（UI）

- account 展开的 period/数据标签行加 toggle icon（即将重置监控开/关；沿用 t041 account icon 的自绘风格）。
- 默认关态；点击 in/out `watched[provider][accountKey]` 的 `raw_label`，持久化。
- tooltip「监控该数据标签的即将重置」。

### 4. 移除 t041 account 级入口

- 移除账号设置「是否监控即将重置」icon 按钮（粒度转 metric 行）。

## 非范围

- 不改 t005 UpcomingResetBanner/Rail 视觉。
- 不改 observation-store resetAt/cycleDurationMs 写入。
- 不加重置通知。
- 全局阈值 `upcomingResetThresholdPercent` 保留（null=整体不监控；非 null + metric watched + 剩余%≤阈值 = 进面板）。

## 验收标准

- [ ] config schema：移除 `upcomingResetOff`，加 `upcomingResetWatched`（上述结构）；旧 config（含 `upcomingResetOff`）加载不报错，迁移为 watched 空。
- [ ] `collect_upcoming_resets`：watched 空 → `[]`；watched 含 (provider,accountKey,raw_label) + threshold 非 null + 剩余%≤阈值 → 该 period 进面板；非 watched period 不进。
- [ ] `UpcomingResetItem` 含 `rawLabel`。
- [ ] 主面板 metric 行 toggle：默认关；点击持久化 `watched`（raw_label in/out）。
- [ ] t041 account 级「是否监控即将重置」icon 按钮移除。
- [ ] schema 单测 + collect 过滤单测 + metric 行 toggle 组件测；`pnpm test` 全绿。

## 依赖与约束

- t005/t041 既有 upcoming reset 面板与全局阈值。
- period/MetricRecord 稳定标识为 `raw_label`（无 metric_id）。
- `accountKey()`（provider-usage.ts:169）已存在。
- 纯前端 + config schema，无后端契约变更。
- 用户已确认：废弃 account 级（旧 off 配置丢失，默认全关）、保留全局阈值、入口在主面板 metric 行。
