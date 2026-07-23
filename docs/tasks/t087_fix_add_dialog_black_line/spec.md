# Task spec

## 背景

AddAccountDialog 打开时 React 首帧渲染 .acct-dialog 容器有 border，但 body 内容未填充 -> 空容器 border 闪现为黑色横线。

## 范围

- 查 .acct-dialog CSS border/box-shadow；dialog body 空时不渲染 border 或用 opacity:0 transition。视觉验证（playwright screenshot 或打包后人工确认）。

## 非范围

- 不改其他模块。

## 验收标准

- [ ] AddAccountDialog 打开时不再闪现黑色横线（空内容阶段不渲染 border 或以 opacity 过渡），修复方式记入 task.md。
- [ ] 视觉验证通过（playwright 截图或打包后人工确认），证据记入 task.md。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- 无外部依赖。
