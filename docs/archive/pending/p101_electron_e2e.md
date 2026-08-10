# p101 electron e2e 全量串行首窗口启动超时（2026-08-09）

- 来源：t272 test review Round 2 未进表提示
- 内容：完整 Electron 无头套件串行运行时，`popup_multi_display` 首用例与 `popup_collapse_persistence` 重启后首用例偶发 `electronApplication.firstWindow` 30s 超时；两文件隔离复跑通过。影响全量 e2e 稳定性，尚未定位根因，非当前 Agent 窗口 diff 路径。
- 复现：2026-08-10 主仓复现尝试——xvfb 无头全量 electron e2e 串行（54 passed / 1 failed / 8 skipped，约 4.3min）未复现 firstWindow 超时；唯一失败为 `popup_window_constraints` 高度断言在 xvfb 800px 虚拟屏下的环境假失败（与本病无关）。
- 处理：未复现
