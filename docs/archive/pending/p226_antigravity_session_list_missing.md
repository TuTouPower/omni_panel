# p226 会话面板列表缺 antigravity，查不到 agy 消息

- 来源：用户提出（2026-09-11 会话面板查不到 agy 消息）；s035/t455/t456 遗留
- 内容：会话库列表链无 antigravity：`tokenStatsSourceSchema`（`src/shared/types/token-stats.ts:5`）仅 5 源、`collector.ts:262` 无 antigravity 源、`observations.sqlite/token_stats_sessions` 实测仅 `claude_code/codex/grok/kimi_code/opencode` 5 源零 agy 行，故 `SessionLibrary.tsx:208` `getSessions` 与 `AgentLogoRow` 永不出现 agy，`searchContent/summaries` 候选亦为空。直查链已通（`session-locator.ts:110`/`antigravity-extractor.ts`/`session-resume.ts:15` `agy --conversation`），知 session_id 可读；本机 `~/.gemini/antigravity-cli/conversations/*.db` 78 库可复现。t455/t456 把 token-stats 划为非范围时误伤列表发现（t456 AC-001 只断言映射函数）。需决策 tokens 口径（无用量源，填 0 造假，s035/t448）后接入发现链：A 独立会话索引并入 sessions_provider；B 反推 protobuf usageMetadata 做真 reader。
- 处理：t470
