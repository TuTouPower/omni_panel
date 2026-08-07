# 用量面板选择持久化

## 背景

用量面板概览中多账号 provider 卡片的「概览 / N账号」分段开关与 popup 顶部 provider 页签选择均为本地 state，重启后重置，用户需重新切换。需持久化恢复。

## 范围

- 每个多账号 provider 卡片的「概览 / N账号」选择持久化：切换后写入配置，重启（或面板重开）后恢复各 provider 上次选择。
- popup 顶部 provider 页签（overview / 各 provider）选择持久化：重启后恢复上次页签。
- 旧配置无对应键时的默认行为：保持现状默认（卡片为「概览」，页签为 overview）。

## 非范围

- 不改变切换控件本身的交互与视觉。
- 不改已有持久化键（`providerOrder`、`accountOrders`、`collapsedAccounts`、`expandedProviders`、`sparklineWindowDays`）的语义。
- 不做账号选择的跨面板同步（仅用量面板内持久化）。

## 验收标准

- [x] AC1：将某多账号 provider 卡片切到「N账号」明细后重启应用，该卡片恢复为明细视图；切回「概览」重启后恢复为概览。多个 provider 的选择互不影响。
- [x] AC2：切换到某 provider 页签后重启应用，面板恢复显示该页签；切回 overview 重启后恢复 overview。
- [x] AC3：配置中无新增键（旧配置）时，首次启动行为与现状一致（卡片概览、overview 页签），不产生错误。
- [x] AC4：面板运行期间收到外部配置回显（如导入配置）时，不把内存中的选择误写回覆盖新配置。
- [x] AC5：现有测试与 e2e 全部通过，无回归。

## 实现要点

- 新增 config 键：`providerL2Open`（Record<provider, boolean>）+ `activeUsageTab`（string）。shared/types/config.ts + main/core/config/types.ts（zod）。
- `ProviderCard.tsx`：`l2open` 本地 state 改受控（props `l2Open` + `onToggleL2Open`），折叠复位逻辑上移父级。
- `PopupView.tsx`：`l2open_providers` 与 `activeTab` 均用 t153 prev ref 回显抑制（值相等保留 state 不触发写回；用户切换才写）；config 无键时首次切换正常写盘（不死锁）；折叠卡片强制复位 l2Open；结构裁剪过滤过期 provider。

## 测试覆盖

- `tests/unit/renderer/views/popup_view_t250.test.tsx`：activeUsageTab 挂载恢复 / config 无键用户切换写回 / providerL2Open 恢复多账号明细 + 切换写回 / CONFIG_CHANGED 回显不误写 / 折叠复位 l2Open。
- `tests/unit/config/config-schema.test.ts`：providerL2Open/activeUsageTab 接受与拒绝用例。
- `tests/unit/renderer/components/provider_card_overview.test.tsx` 等：受控化适配。
- `pnpm test` 全量 + `pnpm test:e2e:electron` + `pnpm test:packaged`。
