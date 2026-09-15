# p231 macOS 平台下 token-stats collector 注册 WSL 源导致 Agent 面板顶部报错

- 现象：在 macOS 环境打开 Agent（用量统计）面板时，顶部常驻红色告警标签，显示形如：
    `claude_code (wsl): wsl data requires a windows host (host=macos)`、
    `opencode (wsl): wsl data requires a windows host (host=macos)`、
    `kimi_code (wsl): wsl data requires a windows host (host=macos)`、
    `grok (wsl): wsl data requires a windows host (host=macos)`。
- 影响：macOS 用户打开 Agent 面板始终看到大批误报的红色错误状态标签，严重干扰正常数据阅读与产品可用性感知。
- 根因：
    1. `src/main/core/token-stats/collector.ts` 中 `sources` 列表在所有平台上无条件拼装了 `...WSL_SOURCES`。
    2. `src/main/core/token-stats/build-config.ts` 中 `wsl_enabled` 默认值为 `true`（跨平台无差别开启）。
    3. 当宿主为 `macos` 时，遍历 `WSL_SOURCES` 命中 `!src.hosts.includes(collector_host)`，直接向 `all_sources_status` 推送 `{ status: "unavailable", lastError: "wsl data requires a windows host (host=macos)" }`。
    4. `src/renderer/views/TokenStatsView.tsx` 中将所有 `s.status !== "ok"` 的数据源全量渲染为红字报错标签。
- 测试缺口：`tests/unit/main/token-stats/collector.test.ts` 未对 macOS 宿主下 `all_sources_status` 进行断言（即在非 Windows/非 Linux 平台不应注册也不应报错 WSL 源）。
- 线索：`collector.ts` 中针对 linux 宿主已使用 `...(collector_host === "linux" ? WIN_SOURCES_LINUX : [])`，但 `WSL_SOURCES` 未按宿主操作系统按需包含（或非 Windows 宿主且不支持 WSL 时不应作为异常暴露）。
- 处理：t487
