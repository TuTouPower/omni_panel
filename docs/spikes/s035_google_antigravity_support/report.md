# Spike report

## 问题

用户要的不是用量面板的额度连接器，而是**会话面板 + 代理面板接入 antigravity**，对标最近的 codex 三件套（t445 token-stats reader、t446 session-history extractor、t447 接线，及修复 t448/t449）。需实测回答：antigravity 本地数据能否支撑两面板？字段路径、缺口、接入点分别是什么？

## 成功判据

- 列出 codex 接入改了哪些文件（对照基线）。
- 定位 antigravity 会话正文与用量字段的确切来源，确认可否按会话归因。
- 指明接入两面板需改的契约点与 blocker。

## 尝试

只读探针（脚本在 `code/`，不读 secret 内容，只取结构；完整用户文本不入库）：

- `code/probe_local.py`：`~/.antigravity`、`~/.config/Antigravity` 不存在，证伪现 stub manifest 路径。
- `code/probe_panel_sources.py`：brains/messages 单消息统计、`history.jsonl` 类型分布、`conversation_summaries.db` 索引表、`conversations/*.db` 表结构 + step_type 分布。
- `code/walk_step_proto.py`：手写 protobuf wire 遍历，确认某已知用户文本落在 steps `field=19 / sub field=2` 明文。
- 代码核查：`git show bcebc530/e5b21a3e/8419e747`（codex 三件套 diff）、`docs/findings/d051_codex_rollout_panels.md`。

## 证据

### codex 接入对照（t445/t446/t447 + t448/t449）

- t445 reader：新增 `src/main/core/token-stats/codex-reader.ts`（rollout JSONL，`token_count` 累计差分，按会话+小时桶落明细，mtime 增量）；改 `collector.ts`（`codex_jsonl` kind + `codex_states` + `codex_<env>` 源）、`paths.ts`（`codex_sessions_path`）、`scan-state.ts`（`codex_states` 持久化）、`token-stats-store.ts` + `shared/types/token-stats.ts`（agent/source 加 `codex`）。
- t446 extractor：新增 `codex-extractor.ts`（全量 + byte_offset 增量 + first_user，与 grok 同构）；`session-locator.ts`（`HistorySource` + `codex`，dated 目录文件名尾部 UUID 定位）；`subscription-service.ts`（`ExtractorKind` + 三处 switch）；`normalize_user_text.ts`（剥 `environment_context/skills_instructions` 大信封）。
- t447 接线：`AgentFilter` + `AGENT_OPTIONS`、`session-resume.ts`（`codex resume {session_id}`，`--help` 实测）、`markdown.ts`、`slots.ts`（vendor logo，早已就绪）。
- t448/t449 教训：tool tokens 误标用量虚胖、model 切换双计——新 reader 必须做行型过滤与 model 分段归因的回归用例。

### antigravity 本地数据源实测（本机 Linux，`~/.gemini/antigravity-cli/`）

- 会话索引 ✅：`conversation_summaries.db` 单表 `conversation_summaries`（31 行；`conversation_id/title/preview/step_count/last_modified_time/workspace_uris/project_id/agent_name`），对标 kimi `session_index.jsonl`。另有 `cache/conversation_metadata.json`（32 会话）+ `last_conversations.json`（workspace→conv）。
- 用户正文 ✅（两处）：`history.jsonl` 151 行（120 条 type 空 = 用户原文，`display/timestamp/workspace`，9 个 workspace；32 slash_command；无 assistant 回复、无 token）；`conversations/*.db` 的 steps protobuf 内含用户原文（38 库；表 `trajectory_meta/steps/gen_metadata/executor_metadata`；`walk_step_proto.py` 确认某已知文本在 `field=19/sub field=2` 明文 UTF-8）。
- 脑内信箱 ❌（非会话正文）：`brain/<conv>/.system_generated/messages/*.json` 89 个单消息文件全为内部任务信箱（82 task tool 输出 + 7 system notice，有 timestamp 但无 user/assistant 对话），不能作会话面板数据源。
- 用量字段 ❌：明文层无任何 token 计数（messages 无、history 无、log 无 usage 行、`conversation_summaries` 只有 `step_count`）。候选只剩 steps/gen_metadata protobuf 内嵌的 usageMetadata 变长整数（未确认，需按 field 号反推 schema；`protoc` 本机不可用，已用手写遍历验证可解）。
- 量级对应：38 brains ≈ 38 conversation dbs ≈ 31 summaries（7 会话无索引行，locator 需直扫回退）。

### 接入点清单（对标 codex）

- 会话面板：`HistorySource` + `ExtractorKind` 加 `"antigravity"`；新增 `antigravity-extractor.ts`（读 `conversations/<id>.db` steps：field 19 子消息提 user/assistant 文本 + timestamp，`history.jsonl` 作首条 user/标题回退）；locator 加 antigravity 分支（`conversation_summaries.db` 索引优先，缺行回退扫 `conversations/*.db` 文件名）；resume 已验证：`agy --conversation {session_id}`（`agy --help` 原文 "Resume a previous conversation by ID"，`--continue` 为继续最近会话；codex 同级验证方式）。
- 代理面板：**受阻**。`antigravity_jsonl`-style reader 无数据源——无明文 token 字段；`remainingFraction` 远端配额是百分比非 tokens，不合 token-stats schema（input/output/cache 整数）。两条路：① protobuf RE 找 usageMetadata（工作量未知、脆弱）；② 放弃代理面板，仅做会话面板 + 用量面板配额（s035 前版远端 OAuth 方案）。
- 网上 token 统计办法（2026-09-06 直连抓取验证）：**没有**。社区全部工具（QuotaWatcher 2.3k stars 为代表）只跟踪 `remainingFraction` 百分比；且配额粒度极粗——官方按 20% 一跳递减（100→80→60），近期还出现长期 100% 不刷新（疑似官方机制变更）。token 只在 `streamGenerateContent` SSE 末帧 `usageMetadata` 出现，即在途数据：CLIProxyAPI 这类代理能记账（`antigravity_gemini_response.go` 取末帧 usage 快照），落盘无留存（本机全部 CLI log 无 usage 行已实测）。`countTokens` 只能事前估算；周限检测是发 "Hi" 看 429 reason 的耗配额探测，不可当统计。`SessionTable.tsx` 要求每行 tokens 数字，填 0/估算即造假（t448 前车之鉴）。
- 接线（会话部分可直接抄 t447）：`markdown.ts`、`slots.ts`（vendor logo 已有 `antigravity`）、`session-resume.ts`（待 resume 命令实测后填）。

## 结论

- 会话面板可接入：索引（summaries db）、用户正文（history.jsonl + steps field19）、时间戳齐备；assistant 文本需在 extractor 实现期做 protobuf field 映射（文本明文，难度中）。可信度中高。
- 代理面板不可直接接入：无 token-count 来源是硬 blocker；protobuf RE 或降级为配额展示需另行决策。可信度高（89 消息文件 + 151 history 行 + 全库表结构实测）。
- 限制：采样仅本机 CLI 单环境；无 Antigravity GUI（`state.vscdb` 路径未验证）。范围只做 CLI（用户确认）。

## 是否采纳

- 决定：部分采纳（会话面板是 / 代理面板否）
- 理由：会话源齐备可拆 task；代理缺用量字段，硬做只能造假数据。
- 后续 task：无（待 task-create 拆分：antigravity session-history extractor+locator、AgentFilter/HistorySource/resume 接线；代理面板待 protobuf usage 反推另起 spike 或直接不做）
