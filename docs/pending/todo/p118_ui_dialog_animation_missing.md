# p118 ui Dialog 缺少入场动画（DESIGN 规定 160ms 上浮淡入）

- 来源：t283 遗留（DESIGN 视觉对照）
- 内容：DESIGN.md Motion 节与 Components 节规定对话框入场 160ms 轻微上浮淡入；`src/renderer/components/ui/Dialog.tsx` 无任何入场动画类（无 animate/transition）。不影响功能与对比，属 motion 规格缺失，需设计侧确认补动画。
- 处理：未开
