# p100 .ctx-overlay/.ctx-menu 死选择器（2026-08-09）

- 来源：t270 review Round 2 未进表提示
- 内容：globals.css `.ctx-overlay`/`.ctx-menu` 为死选择器（无 DOM 引用，anchor 提交亦无引用）——迁移前已存在的旧死代码，非 t270 残留。可随后续 CSS 清理删除。
- 处理：已验证不存在（t274 手写 CSS 清零时选择器已删除，grep 无引用）
