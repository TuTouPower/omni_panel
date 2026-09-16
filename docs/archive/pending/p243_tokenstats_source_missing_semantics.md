# p243 macOS 声明了 Claude Code 不会产出的 costs 源：每轮 ENOENT 来源失败与 warn

- 现象：打包版每轮采集固定告警 `collector: claude_costs_mac read failed: ENOENT: no such file or directory, stat '/Users/testuser/.claude/metrics/costs.jsonl'`（2026-09-16 日志，1 次/轮），且 `TokenStatsView` 把它渲染为**源失败标记**（`sources_status` 过滤 `status !== "ok"`，`src/renderer/views/TokenStatsView.tsx:296-298`）。
- 影响：macOS 上「Claude 源坏掉」的持久红字 + 每轮 warn 噪音，实际该文件在这台机器上不可能出现；用户无法区分「本机没用过该 CLI / 该版本不写」与「读取真的坏了」。
- 根因（环境事实 + 声明错误）：
    1. **macOS Claude Code 不写该文件**。本机 Claude Code `2.1.236`（Homebrew Cask 原生二进制）内**不存在 `costs.jsonl` 路径字符串**（`grep -a "costs\.jsonl"` 与 `.claude/metrics` 均 0 命中，同法可命中 `.claude/projects/` 等已知串，方法有效）；`~/.claude/` 下无 `metrics/` 目录，而 `~/.claude/projects/**` 有会话且至少 1 条 assistant 记录带 `usage`（确曾调用 API）。`claude-reader.ts:556-558` 的既有笔记独立记录「costs.jsonl 自 2026-07-04 起不再被新版本写出」。
    2. **声明层仍为 macOS 生成该源**：`collector.ts` 的 `platform_source_defs(host)` 无条件产出 `claude_costs_${env}`，于是 mac 宿主每轮读一个不存在的文件 → `read_costs_jsonl` 的 `fs.statSync`（`claude-reader.ts:122`）抛 ENOENT → `read_source` catch（`collector.ts:822-832`，t309 语义：读取抛错 = failed）→ failed + warn。mac 的 token 数据其实已由同平台 `claude_jsonl_mac` 会话源完整覆盖（usage 含 in/out/cache_read/cache_write）。
- 修复：macOS 宿主不再声明 costs 源；win/wsl 宿主保留（那些平台的该文件确实存在，缺失仍按 t309 记为 failed）。
- 同类位点（已扫，结论：不改）：`claude_jsonl_<env>` 在 `~/.claude/projects` 缺失时静默 `ok`（`collect_jsonl_files` 吞 readdir 异常）——与 costs 的 failed 相反，但这是 t487 之后的既定方向（不在面板给「本机没有该 CLI」报红），故保留；win/wsl 的 costs 缺失仍按 t309 记 failed。
- 测试缺口：原 mac 宿主用例只喂 mock reader，永远不会 ENOENT（`collector.test.ts`「host=macos 平台源 env=mac 参与采集」），且断言的是 8 个平台源——正是它让「声明了一个不存在的源」这件事在测试里不可见。修复后该用例改为断言 7 个源且 `read_costs` 不再以 `mac` 被调用；真实 ENOENT 路径仍由 linux 宿主用例（`collector-local.test.ts` 的 failed + warn 断言）覆盖。
- 线索：打包版日志 `~/Library/Application Support/OmniPanel/logs/app-2026-09-16.log` grep `costs.jsonl`；本机事实 `ls ~/.claude/`（无 metrics）、`ls ~/.claude/projects/`；二进制核验见上。
- 处理：main-direct-fix
