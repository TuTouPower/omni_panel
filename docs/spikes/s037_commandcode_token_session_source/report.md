# Spike report

## 问题

用户要求验证 Command Code 能否像其他 agent（claude/codex/kimi/grok/antigravity）一样，既统计 token 又展示会话历史。需实测回答：`~/.commandcode` 有无可靠本地源？token 可否按会话归因、语义是否踩坑（累计 vs 增量）？会话正文与恢复命令是否齐备？接入 omni_panel 需对标哪些改动？

## 成功判据

- 定位会话文件与正文/用量字段的确切路径。
- 确认 token 语义（增量还是累计）与按会话归因的可行性。
- 列出接入 token-stats reader 与 session-history extractor 的证据级结论与 blocker。

## 尝试

- 只读探针 `code/probe_commandcode.py`：统计会话文件数、usage 行归属角色、record/content 结构、时间范围、inputTokens 单调性、starts/last 分布（不打印用户正文）。
- 手工采样单会话（`code` 目录外一次性命令）：确认 `message.content[]` 块类型、user 的 `meta.source` 区分（user/tool/steering/followup）、`usage` 与 `model` 位于顶层。
- 交叉核对：`<id>.meta.json`（title/model）、`<id>.checkpoints.jsonl`（turnNumber/prompt）、`~/.commandcode/history.jsonl`、`cmd --help`（恢复命令）。
- 对照基线：`docs/findings/d017_transcript.md`（四端正文路径）、`docs/findings/d051_codex_rollout_panels.md` 与 `src/main/core/token-stats/codex-reader.ts`（累计差分写法）、s035 antigravity spike（无 token 的反例）。

## 证据

### 源与结构（本机 2026-09-14 实测，cmd v1.53.1）

- 路径：`~/.commandcode/projects/<encoded-cwd>/<session-id>.jsonl`（cwd 以 `-` 连接，如 `users-testuser-kar-code-my-file`）。
- 单文件双用：首行 `{"type":"session","version":3,"id","timestamp","cwd"}`；其余 `{"type":"message","id","parentId","timestamp","message","usage","model","effort"}`。`id` == 文件名（202/202 匹配），天然满足 locator 的 session_id 定位。
- 正文块：`message.content[]` 四种 `type`——`text{text}`、`thinking{thinking}`、`tool_use{id,name,input}`、`tool_result{tool_use_id,content}`（内容块计数 text 5271 / thinking 7280 / tool_use 12324 / tool_result 12324）。
- user 来源：`message.meta.source` ∈ `user`(真人, 纯 text) / `tool`(工具回填, 含 tool_result) / `steering` / `followup`。assistant 为 `model`。
- 量级：202 会话文件，7713 条 usage 行，全在 assistant；turns/会话中位 32；时间范围 2026-09-11 → 09-13；模型 `deepseek/deepseek-v4.1-flash`。

### token 语义（关键坑）

- `usage` 是**累计值**：逐行 `inputTokens` 单调递增，中位首轮 21.5k → 末轮 196k，峰值 709k。直接对 7713 行求和得 `inputTokens` 1.24e9（虚高约 39 倍），差分后 fresh(input-cacheRead) 约 31.7M、output 11.4M、cost $15.24。
- 字段：`inputTokens`（含 `cacheReadTokens`）、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`（实测恒 0）、`costUsd`。`cacheReadTokens <= inputTokens` 恒成立（0 例外），符合 OpenAI 「input 含 cached」语义，可直接套项目现有 `inp - cache_read` 归一化。
- 边界：全库 4 次 `inputTokens` 回落（0.05%），差分基准需按文件分段 + `delta<=0 视为零增量`（同 codex-reader 处理）。

### 会话历史与恢复

- 正文可取：user 纯 text 块、assistant text 块；须过滤 assistant 的 thinking/tool_use 与 user 的 tool_result（`meta.source=="tool"`）。无信封标签（user 正文无 `<...>` 包裹，纯提问）。
- 时间戳齐备（每条 message 顶层 ISO8601）。
- 恢复命令 `cmd --resume <session-id>`（等价 `cmd -r`），另 `-c/--continue` 续最近会话；与 codex `codex resume` 同级。

### 与基线对照的接入点

- token-stats：新增 `commandcode-reader.ts`（累计差分，仿 `codex-reader.ts`）+ `collector.ts` 源/kind + `paths.ts` 路径 + `scan-state.ts` + `shared/types/token-stats.ts` 的 source/agent 枚举 + store agent 断言 + renderer AgentFilter/标签/色。
- session-history：新增 `commandcode-extractor.ts`（全量 + 增量 + first/last user，仿 `codex-extractor.ts`）+ `session-locator.ts`（HistorySource/`locator_source_path`/`resolve_*`）+ `subscription-service.ts` 三处 switch + renderer（agent 标签/abbrev/颜色/resume 模板）。
- 无 blocker；与 antigravity（s035 因无 token 而代理面板受阻）相反，Command Code 单文件同时满足两面板。

## 结论

Command Code 本地源**同时满足 token 统计与会话历史**，可直接按 codex 三件套接入。可信度高（202 会话全量实测，非抽样）。

限制：① 采样仅本机单环境（macOS，cmd v1.53.1），`~/.commandcode` 是否跨平台同路径未验证（Windows/WSL 待查，参考其他 agent 的平台路径层）。② 累计差分对 4 次回落需专门处理，否则口径虚高。③ `cacheWriteTokens` 恒 0，缓存写入信息缺失（不影响 token 总数，影响写缓存指标）。④ 会话 title 在 `.meta.json`，不在主 jsonl，标题来源需额外读取。

## 是否采纳

- 决定：是（拆 task 接入）
- 理由：源齐备、字段明确、语义已实测标定，无 blocker；对标 codex 两面板可直接复用。
- 后续 task：无（待 task-create 拆分：token-stats reader、session-history extractor、两面板接线；findings 已记 d059）
