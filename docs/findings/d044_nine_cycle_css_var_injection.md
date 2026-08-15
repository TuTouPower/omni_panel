# d044 nine-cycle 用量色注入 CSS var，不在 JS 解析 hex

- 来源：t418
- 结论：DOM 进度条 / swatch 等可消费 CSS 的路径，nine-cycle 与 risk 方案统一返回 `var(--color-usage-N)` / `var(--color-risk-*)`，不在 renderer 再维护 hex 数组或 getComputedStyle 解析。hex 唯一真相源为 DESIGN.md → globals.css token。canvas/ECharts 等无法用 CSS var 的路径仍走独立 resolver + fallback。
- 证据：`src/renderer/lib/usage-colors.ts` 的 `USAGE_COLOR_TOKENS`；设置 swatch 复用同常量；`tests/unit/renderer/lib/usage-colors.test.ts` 断言返回值与源码无 hex。
- 影响：后续用量条/预览色禁止再写 hex 副本；改色只动 DESIGN.md 导出链。
- 现状：有效
