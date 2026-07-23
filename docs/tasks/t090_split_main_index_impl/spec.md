# Task spec

## 背景

承接 t077（spike close 评估型关闭，commit `1a0fb27`，未实施即归档），本 task 为 impl 落地。`src/main/index.ts` 922 行，超 800 行 important 阈值，承担 app lifecycle + window management + IPC registration + tray + auto_seed + connector setup。

## 范围

- 按职责拆分（候选：app-lifecycle.ts / ipc-setup.ts / connector-setup.ts / tray-setup.ts）；index.ts 仅保留 `app.whenReady` 编排。行为不变。

## 非范围

- 不改其他模块；不改变启动顺序、IPC 注册项、配置回调副作用、单实例锁、窗口创建参数。

## 验收标准

- [ ] `index.ts` ≤ 800 行；新拆出的实现源码文件均 ≤ 800 行（`wc -l` 核验）。
- [ ] 既有测试不改动断言即全绿（仅允许调整 import 路径）。
- [ ] 打包 smoke：`pnpm test:packaged` 真实启动 `artifacts/win-unpacked/OmniUsage.exe` 通过（index.ts 属打包敏感入口）。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- 无外部依赖；main 进程入口属打包敏感路径，收尾须真实启动打包产物验证。
