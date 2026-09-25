# p259 打包后连接器隔离子进程崩溃导致全量采集失败

- 现象：用量面板上所有连接器采集均失败，每次刷新时子进程以 code=1 异常退出（`Connector worker process exited prematurely with code=1, signal=null`），连接器重试 3 次后全部置为 failed 状态。
- 影响：打包应用（packaged app）及生产运行时中，所有依赖脚本执行的连接器（CPA、Codex、DeepSeek、Muse、GrokBot、OpenCodeGo 等全量连接器）彻底瘫痪，无法获取任何服务商用量、额度和余额。
- 根因：产品架构与打包配置缺陷（t515 引入）。
    1. 运行时机制错误：`isolated-process-runner.ts` 使用 Node 原生 `child_process.fork()` 启动子进程并硬编码 `--import=tsx` 执行 `.ts` 文件。打包应用启用了 `electronFuses.runAsNode: false`，导致 Electron 二进制禁止作为 Node.js 启动，而是触发主应用 CLI 报错「未知命令」后以 code 1 退出；且生产打包中无 `tsx` 模块。正确方式应使用 Electron 原生的 `utilityProcess.fork()`。
    2. 构建打包入口缺失：`electron.vite.config.ts` 的 `rollupOptions.input` 缺失 `connector-worker` 入口，`out/main/` 及 `app.asar` 中未打包构建 worker 脚本。
    3. 打包解包配置缺失：`electron-builder.yml` 与 `electron-builder.test.yml` 的 `asarUnpack` 未声明 `out/main/connector-worker.js`。
    4. 路径解析错误：`isolated-process-runner.ts` 硬编码默认路径为 `./worker/connector-worker-entry.ts`，打包后运行时 `__dirname` 为 `out/main`，相对路径必定不存在且未做 `app.asar.unpacked` 回退解析。
        已确认同类位点清单：
    - `src/main/core/connector/isolated-process-runner.ts`（主位点：应采用 utilityProcess.fork 并支持打包环境 unpacked 路径解析，同时保留纯 Node/vitest 单测回退）
    - `src/main/core/connector/worker/connector-worker-entry.ts`（通信适配：需同时兼容 utilityProcess `parentPort` 与单测 Node `process.send`）
    - `electron.vite.config.ts`（构建配置：需添加 `connector-worker` 构建入口）
    - `electron-builder.yml` & `electron-builder.test.yml`（打包配置：`asarUnpack` 需声明 `out/main/connector-worker.js`）
- 测试缺口：t515 仅在纯 Node.js 环境由 vitest 跑单元测试，host Node 直接通过 `--import=tsx` 执行了源码 ts 文件，出现测试假绿；`tests/e2e/packaged/smoke.spec.ts` 仅验证了 token-stats 的 query-worker，未覆盖打包环境下的连接器刷新流程。应在 E2E packaged smoke 增加连接器刷新验证，并在单元/集成测试中覆盖构建产物与双模子进程。
- 线索：`.scratch/repro_isolated_runner.mjs` 证实了 `app.asar` 缺失 worker 文件，以及 Electron 二进制 fork 脚本时被识别为 CLI 未知命令退出 code 1；运行日志位于 `~/Library/Application Support/OmniPanel/logs/app-2026-09-26.log`。
- 处理：t524
