# Task spec

## 背景

承接 t078（spike close 评估型关闭，commit `1a0fb27`，未实施即归档），本 task 为 impl 落地。`PopupView.tsx` t044 已拆 4 hooks，当前 783 行，仍超 400 行 minor 阈值。render_body 函数 + tab 导航 + overview/detail 分支 + floating 模式逻辑仍重。

## 范围

- 进一步提取：render_body 内容拆为子组件（OverviewPanel / DetailPanel / FloatingPanel）；或提取更多 hook。行为不变。

## 非范围

- 不改其他模块；不改变任何 UI 行为、样式、交互与视觉快照形态。

## 验收标准

- [ ] `PopupView.tsx` ≤ 400 行，或记录不可拆硬约束并说明剩余构成；新拆出的实现源码文件均 ≤ 400 行。
- [ ] 既有 popup 相关单测（`popup_view*.test.tsx` 等）不改动断言即全绿（仅允许调整 import 路径）。
- [ ] hook 调用顺序与 props 透传不变，镜像测高（popup-mirror）路径无回归。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- 无外部依赖；UI 结构改动需复跑 popup 组件单测确认无回归。
