# Task spec

## 背景

PopupView.tsx t044 已拆 4 hooks，但仍超 400 行。render_body 函数 + tab 导航 + overview/detail 分支 + floating 模式逻辑仍重。

## 范围

- 进一步提取：render_body 内容拆为子组件（OverviewPanel / DetailPanel / FloatingPanel）；或提取更多 hook。行为不变。

## 非范围

- 不改其他模块。

## 验收标准

- [ ] 见范围具体条目。
- [ ] pnpm test / typecheck / lint 全绿。

## 依赖与约束

- 无外部依赖。
