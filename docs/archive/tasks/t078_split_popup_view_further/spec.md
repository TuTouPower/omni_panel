# Task spec

## 背景

t043 review finding `t043_code_f001`（minor，遗留）：`src/renderer/views/PopupView.tsx` 在 t043 时 954 行，超实现源码 800 行 important 阈值；t044 已做一轮视图文件层拆分，当前 783 行，虽回落到 important 阈值之下，但仍超 400 行 minor 阈值，任何净增都会重新触发 finding。t043 处置结论：治本需独立重构 task。文件当前仍集中承担：本地 helper（`errorMessage` / `structural_signature` / `arrays_equal` / `account_orders_equal`）、全部 hook 装配（`use_plugins` / `use_popup_derived` / `use_popup_height_report` / `use_watched_metric_toggler` / `use_dnd_handlers` / `use_tab_navigation`）与主 JSX 渲染。

## 范围

- 在 t044 拆分基础上继续拆分 `PopupView.tsx`（候选边界：本地 helper 抽为独立模块；按区块抽子组件或复合 hook 收敛装配层），使 `PopupView.tsx` 向 ≤ 400 行收敛；确实无法收敛时须记录不可拆硬约束。
- 拆分后渲染行为、hook 调用顺序、props 透传不变。

## 非范围

- 不改变任何 UI 行为、样式、交互与视觉快照形态。
- 不处理其他超阈值文件（`refresh-service.ts` 见 t076，`index.ts` 见 t077）。

## 验收标准

- [ ] `PopupView.tsx` ≤ 400 行，或记录不可拆硬约束并说明剩余构成。
- [ ] 新拆出的实现源码文件均 ≤ 400 行。
- [ ] 既有单测全绿（`pnpm test`），必要时仅调整 import 路径。
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过。

## 依赖与约束

- 前置：t044 已完成的视图文件层拆分（hooks 已抽出），本 task 在其基础上继续。
- 不依赖网络；UI 结构改动需复跑 popup 相关组件单测确认无回归。
