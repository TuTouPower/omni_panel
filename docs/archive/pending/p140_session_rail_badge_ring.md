# p140 会话槽 agent icon 套 accent 圆环,应去圈干净展示

- 现象：会话窗口（托盘「会话面板」）工作台 tab 左侧会话槽 rail（SessionRail）中，每个 agent icon（VendorMark logo）外套了一个 accent 色圆环（`ring-1 ring-[var(--agent-accent)]`），视觉上「icon 套了个圈」。期望 icon 干净展示、无额外描边。用户选择 B：直接去掉圆环。
- 影响：仅 `src/renderer/components/workspace/SessionRail.tsx:98` `history-badge` 一处。
- 根因：产品缺陷（UI 视觉）。`history-badge` 容器 `rounded-md`（方角）+ `ring-1 ring-[var(--agent-accent)]`（accent 圆环）包裹 VendorMark；`VendorMark` 组件本体（`Icon.tsx:257-291`）无任何 ring/border/bg，圈完全来自该容器 class。2026-08-11 已按 task-bug 第 3–6 步核实。
- 同类位点扫描（2026-08-11 核实）：**已扫，无已确认同类位点**。检索轴：`src/renderer` 全量 `ring-(1|2|\[)` + `--agent-accent` 全部使用点 + `VendorMark` 全部 12 处调用点逐读。常驻 accent ring 仅本处与 `SessionCard.tsx:39`（后者为选中态卡片级描边、badge 为 bg-accent 实心块+缩写非 VendorMark，语义不同，判定同因不成立）；`SessionPane.tsx:123` 同容器无 ring（accent 为 logo 着色）判定不成立；其余 VendorMark 位点（ProviderNav/ProviderCard/CpaCard/UpcomingResetRow/CpaConnectorSettings/VendorPicker/AccountRow/AccountDialog/AddAccountDialog/CpaAddDialog）均裸渲染或 bg 底衬（非 ring），逐一判定同因不成立。
- 测试缺口：`tests/unit/renderer/components/workspace/SessionRail.test.tsx` 仅断言 `history-badge` 存在 + VendorMark 渲染 logo，**无 badge className 断言**，ring 存在与否不被测试覆盖。应补：对每个 `history-badge` 断言 `className` 不含 `ring-`（防「套圈」回归），并保留 vendor-mark 存在断言（防去圈后 logo 消失）。
- 线索：`.scratch/p140/verify.md`（核实笔记：机制、逐处判定表、检索轴、补测样例）
- 处理：t314
