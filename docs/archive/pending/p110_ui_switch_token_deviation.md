# p110 ui Switch 尺寸与开态色偏离 DESIGN token

- 来源：t283 遗留（DESIGN 视觉对照）
- 内容：`src/renderer/components/ui/Switch.tsx` 尺寸 20×36（h-5 w-9）vs DESIGN components `switch-track` 38×22；开态 `bg-accent` vs token `switch-track-on`（success 绿）；关态 `on-surface-muted` vs token `surface-raised`。两种配色对比度均达标（不构成失效），属设计侧形态决策，需设计确认后统一组件与 token 一侧。
- 处理：t301
