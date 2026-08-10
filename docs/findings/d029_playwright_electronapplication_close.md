# d029 Playwright ElectronApplication.close 后子进程可能未完全退出（2026-08-08）

- 来源：t267
- 结论：Playwright `electronApp.close()` 在 Windows 下等待主进程退出，但 Electron 子进程（renderer/gpu/utility）可能残留，继续写 userData 目录或占用 local-api 端口。e2e harness 需在 close 后 kill 兜底 + 监听进程 exit 确保完全终止，否则下一测试的 restart 可能读到旧状态。
- 证据：t267 完整 electron e2e run 2 出现 `snapshot-cache.json` rename ENOENT（`writeJsonAtomic` 失败）——close 后子进程仍写已关闭 userData 目录。
- 影响：electron e2e harness `closeApp` 需确保进程树退出；restart 类测试（stop→start）在完整套件串行下依赖此保证。
- 现状：有效
