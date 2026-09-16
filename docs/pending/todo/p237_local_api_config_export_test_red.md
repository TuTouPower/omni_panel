# p237 LocalAPI 配置导出用例长期红：测试 deps 缺 appVersion，`import("electron")` 在纯 Node 下无 app

- 现象：`tests/integration/local-api/server.test.ts` 的 `local-api config management > export returns canonical config without secrets by default and with secrets explicitly` 固定失败：`GET /v1/config/export` 返回 400（断言 `expected 400 to be 200`）。主仓 base `55f4aa44` 上同样失败，与本任务的改动无关。
- 影响：LocalAPI 导出路径（Web 端「导出设置」的数据来源）缺少可执行回归；该文件在 node 项目下只能靠 `-t` 过滤运行（全量运行会触发 p228 abort），一个红灯会掩盖同组其它用例的真实回归。
- 根因：`handleConfigExportData` → `app_version_for(deps)`（`src/main/ipc/config-ipc.ts:422-426`）在 `deps.appVersion` 未提供时执行 `const { app } = await import("electron")`。`node` vitest 项目里没有 Electron 运行时，`import("electron")` 解析到 npm 包的入口字符串（实测 `typeof m.default === "string"`、`typeof m.app === "undefined"`），于是 `app.getVersion()` 抛 TypeError → `handleConfigExportData` 返回 `fail("INTERNAL_ERROR", …)` → `send_result` 把任何失败映射为 HTTP 400。
    测试侧：`tests/integration/local-api/server.test.ts` 的 LocalAPI deps 未设置 `appVersion`；`canonical_config_transfer()` 里的 `appVersion` 只是导出报文里的字段，不影响 `deps`。
    生产侧不受影响——`src/main/index.ts` 构造 config_deps 时传了 `appVersion: app.getVersion()`。
- 测试缺口：本用例即测试本身失效（断言恒定 400），非覆盖缺口。修法（择一，一行即可）：①在该测试的 `managed_deps`/config_deps 里补 `appVersion: "1.0.0-test"`；②让 `app_version_for` 在 electron 不可用时返回明确错误码（如 `INTERNAL_ERROR` 而非依赖 400 映射），并补一条「无 appVersion 且无 electron 时导出可见失败」的用例。修完须确认该 describe 组整体转绿。
- 线索：`npx vitest run --project node tests/integration/local-api/server.test.ts -t "export returns canonical config"`（node ABI：先 `node scripts/ensure_sqlite_abi.mjs node`）；t490 实施现场记录见 `docs/tasks/t490_settings_data_import_export_unify/task.md` 实施笔记。
- 处理：未开
