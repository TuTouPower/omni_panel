# p134 概览/N账号 tab 选中态异常（概览双无、明细双高亮）

- 现象：点击「概览」时两个 tab 都无强调样式；点击「N账号」时两个 tab 都有强调样式（白底蓝字）。实测 light 下：明细态两 tab computed bg=rgb(255,255,255) color=rgb(61,122,253)；概览态两 tab 均透明。
- 影响：所有 accountCount>1 的 provider 卡片（Codex/Kimi/Tavily/Firecrawl 等）概览/N账号切换的选中态视觉错误，无法区分当前视图。
- 根因：`src/renderer/components/ProviderCard.tsx:176-205` 两个 tab 的选中样式共用同一个 `l2Open` 布尔（`l2Open ? "bg-surface-window text-accent" : "bg-transparent"`），tablist 缺失「当前激活 tab」互斥判定。产品缺陷。已按 task-bug 第 3 步只读核实：概览 tab（:176-190）与 N账号 tab（:191-205）className 三元条件逐字相同，唯一 `role="tablist"` 位点。
- 测试缺口：现有 ui 测试未断言 tab 选中态（tests 全库无 `title="概览"`/`title="账号明细"`/`tablist`/`bg-surface-window` 断言；popup*view_t250 仅测 l2Open 行为写回与内容切换，provider_card*\* 无 tab 断言）；应补 ProviderCard 测试断言激活 tab 高亮、非激活灰（l2Open 两态）。
- 同类：已扫，无已确认同类位点。检索轴：`role="tablist"` 全仓仅 ProviderCard 一处；`aria-selected`/`data-active`/`data-tab`（SessionShell 工作台/会话库、ProviderNav 总览/provider）、`aria-pressed`（Segmented、SessionLibrary 网格/列表、ProviderAccountRow 趋势窗口、WorkspaceToolbar 排布、appearance_section 强调色等）均逐选项独立 `x === y` 互斥判断，非同因；统一分段控件 `ui/Segmented.tsx` 用 `value === opt.value`，正确互斥；src/web 无 UI 副本。
- 线索：.scratch/bug_t304_evidence.md、.scratch/p134/scan_notes.md
- 处理：t305
