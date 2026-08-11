# p132 collector 采集路径硬编码 Windows 宿主,Linux/WSL 运行全源采集失效

- 现象：代理面板(TokenStatsView)缺 8.09 部分、8.10 与 8.11 用量数据。期望本机用量自动采入。实际 records/daily 最新到 2026-08-09 05:36,其后采集持续 0;8-11 软件运行中仍无新数据,而本机 `~/.claude/projects/**`、`~/.kimi-code/sessions`、`~/.grok/sessions` 存在大量 8-11 用量 jsonl。
- 影响：在 Linux/macOS/WSL 环境运行 OmniPanel 时,token-stats 采集(代理面板、24h 图表、热力图、会话表)全量不可用且无任何可见告警;已确认同类位点:`collector.ts` 全部 path builder(claude/opencode/kimi/grok)+ `effective_wsl_user`,`index.ts:389/452` `win_home: homedir()`;关联位点(机制同源、功能分叉):`session-locator.ts`/`subscription-service.ts`/`session-path-index.ts`(会话历史系统,win env 用 path.join 在 Linux 可用、wsl env 失效)。
- 根因：产品缺陷(跨平台采集支持缺失)。collector 路径构建硬编码 Windows 宿主假设:env 仅 win/wsl 两档无本机维度;`win_home=homedir()` 在 Linux 返回 POSIX home,win 源拼接成 `/home/karon\.claude\projects`(反斜杠字面量)不存在;wsl 源 `\\wsl.localhost\{distro}\home\{user}`(UNC)在 Linux 内不可达,`effective_wsl_user` 探测失败返回空串;ENOENT 静默,无告警。从 8-09 05:36 后持续全 0。
- 测试缺口：`collector.test.ts` mock `win_home: "C:\\Users\\Test"`,仅 Windows 风格;无 POSIX/Linux 平台用例,无 `wsl_user` 探测失败(空串)行为测试,采集失败静默空无可见性断言。应补:路径构建按平台注入(homedir/WSL 探测)+ POSIX 用例 + 探测失败显式告警/失败可见性用例;覆盖主位点与 session-locator 同源点。
- 线索：`.scratch/bug-20260811-tokenstats-missing.md`(含 DB 日期分布、8-08/8-09/8-11 采集日志、本机 jsonl 证据)
- 处理：未开
