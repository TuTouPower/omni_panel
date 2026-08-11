# p134 概览/N账号 tab 选中态异常（概览双无、明细双高亮）

- 现象：点击「概览」时两个 tab 都无强调样式；点击「N账号」时两个 tab 都有强调样式（白底蓝字）。实测 light 下：明细态两 tab computed bg=rgb(255,255,255) color=rgb(61,122,253)；概览态两 tab 均透明。
- 影响：所有 accountCount>1 的 provider 卡片（Codex/Kimi/Tavily/Firecrawl 等）概览/N账号切换的选中态视觉错误，无法区分当前视图。
- 根因：`src/renderer/components/ProviderCard.tsx:176-205` 两个 tab 的选中样式共用同一个 `l2Open` 布尔（`l2Open ? "bg-surface-window text-accent" : "bg-transparent"`），tablist 缺失「当前激活 tab」互斥判定。产品缺陷。
- 测试缺口：现有 ui 测试未断言 tab 选中态；应补 ProviderCard 测试断言激活 tab 高亮、非激活灰（l2Open 两态）。
- 线索：.scratch/bug_t304_evidence.md
- 处理：未开
