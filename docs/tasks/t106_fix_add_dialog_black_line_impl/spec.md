# Task spec

## 背景

AddAccountDialog 打开瞬间会闪现一条黑色横线。根因（t087 spike 评估结论 + 当前 CSS 核实）：`.acct-dialog` 容器有 `border: 0.5px solid var(--win-border)`（`src/renderer/styles/globals.css:2527`）与 `box-shadow`，配合 `animation: dialogIn 0.16s`（从 `opacity:0` 起）。React 首帧渲染时容器 border 已就位、body 内容尚未填充，空容器 border 在动画首帧可见，表现为黑色横线。t087 是评估型 spike，只记录结论未实施代码，本 task 是其后续实施。

## 范围

- 定位 `.acct-dialog` 首帧空容器 border 闪现的真实触发条件（opacity:0 是否真隐藏首帧、border/box-shadow 是否在 from 帧仍可见），用 playwright 截图或人工确认证据。
- 修复：让空内容阶段不渲染 border / box-shadow，或调整动画 from 帧（如 `opacity:0` 已够则确认为何仍闪；不够则补 `border-color: transparent` 过渡或延迟 border 出现）。
- 视觉验证通过并留证据。

## 非范围

- 不改 AddAccountDialog 业务逻辑、表单行为。
- 不改其他 dialog / card 的 border 样式。
- 不重构 dialog 动画体系（仅消除首帧黑线）。

## 验收标准

- [ ] AddAccountDialog 打开时不再闪现黑色横线（空内容阶段不渲染 border，或以动画过渡消除），修复方式记入 task.md。
- [ ] 视觉验证通过（playwright 截图或打包后人工确认），证据（截图路径或观察记录）记入 task.md。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- 前置：t087 spike 已评估根因（`.acct-dialog` 首帧空容器 border），本 task 直接进入实施。
- 约束：视觉回归须真实截图或人工确认，不能只靠代码推断。
