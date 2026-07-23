# Task spec

## 背景

t045 review finding `t045_code_f001`（minor，遗留）：`src/main/index.ts` 在 t045 时 928 行，超实现源码 800 行 important 阈值；当前 922 行，仍超阈值。文件集中承担：single-instance lock、windowManager 创建与依赖装配、`app.whenReady` 内全部 IPC 注册编排、`onConfigSaved` / `onConfigImported` 配置回调（闭包依赖 currentConfigSnapshot / secretParamKeys / orchestrator / grokOAuthManager / tokenStatsManager / BrowserWindow / main_panel_controller）。t045 处置结论：整体外移属独立重构，不绑原 task。

## 范围

- 将 `src/main/index.ts` 按职责拆出模块（候选边界：IPC 注册编排抽为独立 bootstrap 模块；`onConfigSaved` / `onConfigImported` 配置回调抽为 controller 模块，以显式参数注入替代隐式闭包捕获），使 `index.ts` 及新拆出的实现源码文件均 ≤ 800 行，并尽量向 400 行收敛。
- 拆分后启动行为、IPC 注册顺序语义、配置保存/导入副作用不变。

## 非范围

- 不改变任何运行时行为（启动顺序、IPC 注册项、配置回调副作用、单实例锁、窗口创建参数）。
- 不处理其他超阈值文件（`refresh-service.ts` 见 t076，`PopupView.tsx` 见 t078）。

## 验收标准

- [ ] `src/main/index.ts` ≤ 800 行；新拆出的实现源码文件均 ≤ 800 行。
- [ ] 配置保存/导入回调的依赖以显式注入表达，不再依赖超长相邻闭包。
- [ ] 既有测试全绿（`pnpm test`）；涉及打包路径时 `pnpm test:packaged` 打包 smoke 通过。
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过。

## 依赖与约束

- 无前置 task；不依赖网络。
- main 进程入口属打包敏感路径，收尾须真实启动 `artifacts/win-unpacked/OmniUsage.exe` 验证。
