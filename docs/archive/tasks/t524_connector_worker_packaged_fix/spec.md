# Task spec

## 背景

t515 引入了连接器隔离子进程架构，但由于使用 Node 原生 `child_process.fork()` 启动 `.ts` 脚本、未在 `electron.vite.config.ts` 打包构建 worker 脚本、未在 `electron-builder.yml` 的 `asarUnpack` 解包，且打包环境下 Electron Fuse 启用了 `runAsNode: false`，导致打包后的应用中连接器子进程直接被当成未知 CLI 子命令报错（code 1 崩溃），用量面板所有连接器全量采集失败。

## 契约区

### 范围

- `electron.vite.config.ts` 补齐 `connector-worker` 编译打包入口。
- `electron-builder.yml` 及 `electron-builder.test.yml` 的 `asarUnpack` 增加 `out/main/connector-worker.js`。
- `src/main/core/connector/worker/connector-worker-entry.ts` 适配 Electron `parentPort` 与纯 Node `process.send` 双模通信。
- `src/main/core/connector/isolated-process-runner.ts` 适配 Electron 原生 `utilityProcess.fork`，支持开发态、打包态与纯 Node/vitest 单测回退模式下的路径与进程启动。
- 补充打包产物门禁与集成测试，覆盖连接器隔离 worker 的正确加载与刷新执行。

### 非范围

- 不修改各具体连接器（CPA/Codex/Grok/DeepSeek 等）内部采集业务逻辑。
- 不重构 `refresh-service` 调度与退避状态机。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`connector-worker` 编译构建与解包配置生效。执行 `pnpm build` 后在 `out/main/` 产出 `connector-worker.js`；`electron-builder.yml` 与 `electron-builder.test.yml` 的 `asarUnpack` 列表中均包含 `out/main/connector-worker.js`。
- [ ] AC-002：隔离子进程在打包与开发环境下使用 Electron 原生 `utilityProcess` 执行，在纯 Node 单测环境优雅回退至 `child_process.fork`。在 Electron 运行时中，子进程通过 `utilityProcess.fork` 正确加载已构建的 worker 脚本（优先查找 `app.asar.unpacked` 路径），不依赖 `--import=tsx`，不被 Electron Fuse 的 `runAsNode: false` 拦截。
- [ ] AC-003：Worker 入口双模 IPC 通信契约一致性。`connector-worker-entry.ts` 同时支持 Electron `parentPort` 与 Node `process` 消息协议，正确接收参数执行连接器脚本，返回观测数据或结构化错误。
- [ ] AC-004：自动化测试与打包冒烟验证通过。单测与集成测试通过，包含构建产物存在性断言，并在 `tests/e2e/packaged/smoke.spec.ts` 验证打包应用下连接器刷新成功（不再报 code=1 崩溃且状态不落入 failed）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试

## 上下文区

- 来源：p259（2026-09-26 核实通过，在真实打包应用及 `.scratch/repro_isolated_runner.mjs` 中完全复现）

### 有意不测

- 无

### 测试策略

- 针对构建脚本与产物编写断言测试，验证 `out/main/connector-worker.js` 打包后正确存在。
- 在 `tests/integration/connector/isolated-process-runner.test.ts` 中覆盖 `utilityProcess` / Node 双模子进程执行路径与路径解析。
- 在 `tests/e2e/packaged/smoke.spec.ts` 中补充 packaged app 连接器刷新端到端断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：Electron `utilityProcess` 在纯 vitest 运行环境下不可用（`import { utilityProcess } from "electron"` 在非 Electron 环境为 undefined）。
- 回退：在 `isolated-process-runner.ts` 中增加运行时探测，如果当前环境无 `utilityProcess` 或在单测环境下指定了 `.ts` 路径，则无缝回退到 `child_process.fork`，确保 vitest 单测与生产 Electron runtime 均稳定通过。

### 依赖与约束

- 严格遵循 `electron-builder.yml` 的 `runAsNode: false` 与 `asarUnpack` 打包安全基线约束。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：更新连接器隔离子进程运行机制（`utilityProcess` 协议与双模回退说明）。
