# ProviderCard 概览/N账号 tab 选中态

## 行为（现在是什么）

用量面板多账号 provider 卡片头部「概览 / N账号」分段 tab（`ProviderCard.tsx`，l2Open 分段开关）的选中态互斥：

- 概览态（`l2Open=false`）：「概览」tab 高亮（`bg-[var(--color-surface-window)]` + `text-[var(--color-accent)]` + 浅阴影），「N账号」tab 无强调（`bg-transparent`）。
- 账号明细态（`l2Open=true`）：「N账号」tab 高亮，「概览」tab 无强调。

`l2Open` 语义不变：仍表示「是否展开账号明细」，由父级受控（`l2Open` + `onToggleL2Open` 回调）持久化；点击「概览」在明细态下切回概览，点击「N账号」在概览态下展开明细。

## 验收标准

- accountCount>1 且 `l2Open=true`：「N账号」tab 有强调样式、「概览」tab 无（仅当前 tab 高亮）。
- accountCount>1 且 `l2Open=false`：「概览」tab 有强调样式、「N账号」tab 无（仅当前 tab 高亮）。

## 实现要点

两个 tab 按钮 className 的高亮分支分别使用互斥条件：概览 tab 用 `!l2Open`，账号明细 tab 用 `l2Open`。此前两按钮共用同一 `l2Open` 条件导致双高亮/双无高亮（p134）。

## 测试覆盖

组件单测（`provider_card_overview.test.tsx`）在 l2Open 两态下断言激活 tab 类含 `bg-surface-window text-accent`、非激活 tab 类含 `bg-transparent`。
