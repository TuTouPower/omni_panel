# p113 Button 字重规格内部矛盾（DESIGN 正文 vs typography token）

- 来源：t283 遗留（DESIGN 视觉对照）
- 内容：DESIGN.md 正文 Components 节称按钮字重 600，而 front matter `typography.body-md` fontWeight=450；组件实现取 `font-medium`（500）居中。两处规格冲突需设计侧统一（按钮文字字重归属 body-md 还是独立档）。
- 处理：t301
