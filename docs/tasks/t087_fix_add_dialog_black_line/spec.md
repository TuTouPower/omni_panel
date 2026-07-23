# Task spec

## 背景

AddAccountDialog 打开时 React 首帧渲染 .acct-dialog 容器有 border，但 body 内容未填充 -> 空容器 border 闪现为黑色横线。

## 范围

- 查 .acct-dialog CSS border/box-shadow；dialog body 空时不渲染 border 或用 opacity:0 transition。视觉验证（playwright screenshot 或打包后人工确认）。

## 非范围

- 不改其他模块。

## 验收标准

- [ ] 见范围具体条目。
- [ ] pnpm test / typecheck / lint 全绿。

## 依赖与约束

- 无外部依赖。
