# p190 存量 lint：session-resume 与 general_section

- 现象：`pnpm lint` 全仓红——`src/renderer/lib/session-resume.ts:32-33`（`no-unnecessary-condition`）、`src/renderer/views/settings-view/sections/general_section.tsx:48`（`no-dynamic-delete`）。
- 影响：`pnpm lint` / `pnpm check` 门禁失败；与阴影/浮层无关，t415 未触这两文件。t412 收尾笔记已记录同残留。
- 根因：t402 起引入的类型收窄后 `??` / 恒 falsy 分支与动态 `delete` 触发 eslint 规则。
- 测试缺口：lint 非 vitest；CI 若未跑 lint 会漏。应修生产代码或补类型后使 lint 绿。
- 线索：`pnpm lint` 直接复现；git blame 落在 t402。
- 处理：未开
