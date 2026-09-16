# p243 令牌统计源「数据不存在」语义不统一：claude costs 记 failed（每轮 warn），claude session 静默 ok

- 现象：打包版每轮采集固定告警 `collector: claude_costs_mac read failed: ENOENT: no such file or directory, stat '/Users/testuser/.claude/metrics/costs.jsonl'`（2026-09-16 日志 1 次/轮），且 `TokenStatsView` 会把它作为**源失败标记**渲染（`sources_status` 过滤 `status !== "ok"`，`src/renderer/views/TokenStatsView.tsx:296-298`）。
- 影响：用户看到的是一台机器上「Claude 源坏掉」的持久标记 + 每轮一条 warn 噪音；实际只是该机器没有这个文件（本机 Claude Code 2.1.236）。无法从 UI 区分「没用过该 CLI / 该版本不写这个文件」与「读取真坏了」。
- 根因：`read_source`（`src/main/core/token-stats/collector.ts`）对「数据不存在」没有统一语义：
    - `kind: "costs"`：`read_costs_jsonl` 开头 `fs.statSync(file_path)`（`claude-reader.ts:122`）无 try，ENOENT 冒泡到 `read_source` 的 catch（`collector.ts:822-832`）→ `status: "failed"` + `logMessage: "<key> read failed: ..."`；
    - `kind: "session_jsonl"`：`collect_jsonl_files`（`claude-reader.ts:436-445`）把 `readdirSync` 异常吞掉，目录缺失→ 0 文件 → 该分支**无条件** `status: "ok"`（`collector.ts:629-641`）；
    - 对照：`grok_jsonl` / `codex_jsonl` 有显式 `missing` 分支 → `status: "unavailable"` + established warn 文案（`collector.ts:668-681`、`:696-710`）。即同一 provider（claude_code）内部两侧相反，跨 kind 又有第三种做法。
- 同类位点（需一并定策略）：`kimi_jsonl`、`opencode_db`、`antigravity_index`、`commandcode_jsonl` 各分支的「目录/文件缺失」是否都走 `unavailable` 且不刷 warn，尚未逐一核对（成本/会话两处已确认不一致）。
- 待核实的独立问题：**macOS 的 Claude Code 是否写 `~/.claude/metrics/costs.jsonl`**。本机 `~/.claude/` 下无 `metrics/` 目录（`ls ~/.claude/metrics` 为空），而 `~/.claude/projects/**/*.jsonl` 存在且至少 1 条 assistant 记录带 `usage`（说明确实发生过 API 调用）→ 初步证据指向「macOS 不产该文件」，但样本很小、且不确定该文件是否只在特定条件（会话结束/成本统计开关）下写出。文档 `docs/specs/ai-cli-token-stats-api.md:29,131-132` 把它列为 session 级累积快照主源（Win/WSL 已验证），若 macOS 不写，则 mac 侧「主源恒 unavailable」需要按平台修正文档与期望，而非当成失败。核实方式：用本机 Claude Code 完整跑一次会话后检查 `~/.claude/metrics/`；比对 Claude Code 版本行为。
- 测试缺口：现有单测覆盖了各 kind 的正常读取与 grok 的 missing 分支，但**没有** costs 文件缺失 / projects 目录缺失的语义断言，也没有「同一 provider 两源缺失时状态一致」的用例。应补：`read_source` 层断言 missing → `unavailable`（而非 failed/ok），并断言每轮 warn 的去重行为（AC-003）。
- 线索：日志 `~/Library/Application Support/OmniPanel/logs/app-2026-09-16.log` grep `costs.jsonl`；本机事实 `ls ~/.claude/`（无 metrics）、`ls ~/.claude/projects/`（2 个会话目录）。
- 处理：未开
