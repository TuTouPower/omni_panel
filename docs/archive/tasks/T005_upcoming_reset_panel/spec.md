# Task spec

## 背景

`MetricRecord.resetAt`（epoch ms，可空）已有重置时间，但当前只在 `UsageRows.tsx:115-116` 的用量条行尾以纯文本显示，用户无法一眼看到「未来 7 天内哪些账号要重置、按时间先后排序」。对标 demo 的「即将重置」预警栏，聚合全量 metric 的 `resetAt`，横屏以右侧 sticky 栏呈现、竖屏以总览顶部手风琴横幅呈现。

## 参考来源与设计取舍

- **参考来源**：`data/OmniUsage-横竖屏响应式界面-spec.md` §5.2（着色规则）、§7.4（即将重置预警）、§10（边界）；`data/index.html` 的 `.rail`（宽屏右栏）与 `#railBanner`（紧凑屏手风琴横幅）两形态实现。原型仅作设计参照，不照抄。
- **采纳**：横屏右栏 sticky + 竖屏手风琴横幅的双形态切换；按 `resetAt` 升序；horizon 7 天沿用 demo；行点击跳对应 provider。
- **着色不照搬 demo**：demo 定义 `sevClass`（≥80 红 / ≥50 黄 / 其余 text）数值阈值，应用于预警栏百分比。本项目 `MetricRecord.status` 已由连接器上报 `normal/warning/critical/unknown`，更贴近各平台真实语义——预警行直接用 `status` 映射到现有 `.dot/.red/.amber/.green`，不复刻 demo 的固定阈值。
- **不照搬 demo 的 mock 聚合 `RAIL_ITEMS`**：demo 用静态数组演示；本项目从真实 `ProviderUsageGroup` → `MetricRecord.resetAt` 聚合，`null` 跳过、>7d 过滤。
- **复用 `CollapsibleCard`**：竖屏横幅基于现有折叠组件，不新造手风琴组件（demo 的 `#railBanner` 是独立实现）。
- **载体决策沿用 T004**：rail / banner 的显隐由 T004 建立的 `@container` 断点驱动（`≥1024` 显示 rail、`<1024` 显示 banner），不重复造布局。
- **时间格式只用 `format_reset_time`**：demo 用相对时间；本项目预警行全是未来时刻，`relative_time`（`utils.ts:8-23`）对未来时间一律返回「刚刚」，会让所有行同质化，**禁用**。

## 范围

- `provider-usage.ts` 新增 `collect_upcoming_resets(groups, horizonMs?, now?)`：扁平化所有 `ProviderUsageAccount` 的 metric，过滤半开区间 **`now < resetAt <= now+horizon`**（默认 7d；`resetAt <= now` 视为已重置跳过，`resetAt = null` 跳过）、按 `resetAt` 升序；返回 `{ provider, accountLabel, accountId, metricLabel, resetAt, percent, status }[]`。
    - `percent = period.used/period.limit`（`period.limit>0` 且均 finite），`displayStyle="ratio"` 型也输出 percent，`clamp(0,100)`；与 `OverviewWindow`（`build_overview_for_group`）同口径但**不跨 metric 聚合**。
    - `now` 参数化为入参（便于测试，避免直接耦合 `Date.now()`）。
- 新增组件 `UpcomingResetRail`（横屏：sticky 右栏 264px）与 `UpcomingResetBanner`（竖屏：总览上方手风琴，复用 `CollapsibleCard`）；行点击切到对应 provider tab（复用 `PopupView` 的 `setActiveTab`）。
- `PopupView` 装配两个组件；按 T004 声明的三层拓扑，`@container (min-width:1024px)` 时 rail 作为 `.overview-row` 第二列（sticky 264px，T005 负责包 `.overview-row` 外层），`<1024px` 时 rail 隐藏、banner 显示在 `.overview-grid` 上方。
- 复用现有 `.dot/.red/.amber/.green` 状态点；时间字段**只用 `format_reset_time`**（输出『今天 HH:MM』『MM/DD HH:MM』），不引新颜色 token。

## 非范围

- 不改 `MetricRecord` schema（`resetAt` 字段已存在）。
- 不做预警的推送/通知（仅面板内呈现）。
- 不引入「预测性 elapsed/风险评分」（demo 也未要求，属未来扩展）。
- 不新增独立路由；预警行点击只切 tab，不进二级页。

## 验收标准

- [ ] `collect_upcoming_resets` 单元测试覆盖：空输入、`resetAt=null` 跳过、`resetAt>now+horizon` 过滤、**`resetAt=now` 跳过（已重置）**、**`resetAt=now+horizon` 收（闭右端）**、**`resetAt<now` 跳过**、同账号多 metric 全收、按 `resetAt` 升序。
- [ ] 横屏（容器宽 ≥1024px）：rail 在 `.overview-row` 第二列 sticky，标题「即将重置（7 天内）」，行显示 provider 图标 + 账号/metric label + **重置时间（`format_reset_time` 格式）** + 百分比（按现有 sev 配色）。
- [ ] 竖屏（<1024px）：banner 手风琴，收起时显示「即将重置 N 项」，展开后行列表与 rail 同构。
- [ ] 行点击切到对应 provider tab，滚动回顶。
- [ ] 无符合条件项时两形态都显示空态文案，不渲染空容器。
- [ ] `pnpm test` 通过；PopupView 视觉快照无回归。

## 依赖与约束

- 前置依赖 T004：横屏 `.overview-row` 两列拓扑由 T004 声明、T005 实施外层包装；T004 未合入前 rail 无法就位（可先单测 `collect_upcoming_resets`）。
- 约束：脱敏开关 `uiDesensitizeRemarks` 为真时，账号 label 按现有规则隐藏（预警行同样遵守）。
- 约束：rail 行点击不绕过现有 route 分权。
- 约束：**禁用 `relative_time`** 渲染预警行时间（其未来时间返回「刚刚」）；统一用 `format_reset_time`。
