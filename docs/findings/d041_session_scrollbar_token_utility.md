# d041 会话滚动条 token 与 scrollbar-token utility

- 来源：t412 task
- 结论：会话细滚动条配方落在 `@utility scrollbar-token`（6px / 透明轨 / token thumb+hover / 折叠 button），thumb 色经 DESIGN.md `scrollbar-thumb*` → designmd 导出 `--color-scrollbar-*` 与暗色翻转；禁止组件散落色字面量。设置/CPA 仅收口 `scrollbar-color` 引用同一 token，不改结构性 webkit。
- 证据：`globals.css` `@utility scrollbar-token`；`pnpm build` 产物含 `.scrollbar-token::-webkit-scrollbar{width:6px;height:6px}`；`tests/unit/renderer/styles/session_scrollbar.test.ts`。
- 影响：会话五类滚动容器与后续其它窗口统一可复用同一 utility/token。
- 现状：有效
