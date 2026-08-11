# p140 会话槽 agent icon 套 accent 圆环,应去圈干净展示

- 现象：会话窗口（托盘「会话面板」）工作台 tab 左侧会话槽 rail（SessionRail）中，每个 agent icon（VendorMark logo）外套了一个 accent 色圆环（`ring-1 ring-[var(--agent-accent)]`），视觉上「icon 套了个圈」。期望 icon 干净展示、无额外描边。
- 影响：仅 `src/renderer/components/workspace/SessionRail.tsx:98` `history-badge` 一处。其余 VendorMark 调用点（ProviderNav/ProviderCard/UpcomingResetRow/CpaCard 等）均无 ring 包装，不受影响。
- 根因：产品缺陷（UI 视觉）。`history-badge` 容器 `rounded-md`（方角）+ `ring-1 ring-accent`（accent 圆环）包裹 VendorMark；用户认为该圆环多余，选择直接去掉。已确认同类位点：已扫，无同类——全仓 `ring-1 ring-[var(--agent-accent)]` 仅本处与 `SessionCard.tsx:39`（后者是选中态卡片描边，语义不同，非 icon 套圈）。
- 测试缺口：`tests/unit/renderer/components/workspace/SessionRail.test.tsx` 仅断言 `history-badge` 存在 + VendorMark 渲染 logo，无 badge 视觉 class 断言，ring 存在与否不被测试覆盖。应补：断言 `history-badge` 不含 ring class（防「套圈」回归）。
- 线索：`.scratch/` 无（纯 CSS class 改动，代码定位即可）
- 处理：未开
