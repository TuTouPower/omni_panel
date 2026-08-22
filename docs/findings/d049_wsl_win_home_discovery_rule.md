# d049 WSL 宿主自动发现 Windows 用户 home 的可行规则

- 来源：s033 spike / t438 task
- 结论：WSL2 下 `/mnt/c/Users/*` 枚举 + agent 标记目录（`.claude`/`.kimi-code`/`.grok`/`.local/share/opencode`）过滤可确定性定位唯一 Windows 用户 home；多候选取标记最多者；零候选回退 `powershell.exe $env:USERPROFILE` 路径转换；全失败则 win 源 unavailable 不崩溃。发现结果进程内缓存。
- 证据：s033 本机实测——`/mnt/c/Users/` 枚举剔除系统项后唯一候选 `TestUser` 含全部四个标记目录，与 `pwsh.exe $env:USERPROFILE`（`C:\Users\TestUser`）一致。
- 影响：t438 collector/paths/session-locator 的 win 源自动发现；后续任何「WSL 读 Windows 侧」功能可复用此探测顺序。
- 现状：有效
