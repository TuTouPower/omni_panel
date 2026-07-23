# Task spec

## 背景

三重根因：(1) CSS class 不匹配（组件用 bar-watch，CSS 定义 lm-watch）；(2) opacity 0.35 太淡；(3) bell 在 flex 中排在 bar-clock 后无 flex-shrink:0 -> 换行第二行。

## 范围

- 统一 CSS class（bar-watch 或 lm-watch 二选一）；opacity 提高到 0.5+ 或用 color 区分；bell 加 flex-shrink:0 + margin-left:auto 同行布局。测试断言 class + 可见性。

## 非范围

- 不改其他模块。

## 验收标准

- [ ] 见范围具体条目。
- [ ] pnpm test / typecheck / lint 全绿。

## 依赖与约束

- 无外部依赖。
