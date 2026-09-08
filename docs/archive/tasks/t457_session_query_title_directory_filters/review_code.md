# Task review t457（reviewer_focus: 代码）

- task：`t457_session_query_title_directory_filters`
- spec：`docs/tasks/t457_session_query_title_directory_filters/spec.md`
- diff_anchor：`2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674`
- target：`git diff 2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674`
- round：1
- reviewed_at：2026-09-08 05:45 UTC+8

reviewed_scope: 0e8da6ec74d0e24a

## Findings

无 critical / important / minor finding。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：0 条。

### AC 覆盖逐条核对

- **AC-001**（title 独立过滤）：`token-stats-store.ts:1472-1479` 仅约束 `title` 列（`unicode_lower(COALESCE(title,''))`），不拼接 directory/id；测试 `token-stats-store.test.ts` AC-001 用例以 id/directory 含 "alpha"、title 含 "other" 的交叉数据断言不串字段。覆盖。
- **AC-002**（directory 独立过滤）：`token-stats-store.ts:1480-1489` 仅约束 `directory` 列；AC-002 用例交叉数据验证。覆盖。
- **AC-003**（title AND directory）：两条件各自 push 进 `conditions`，`conditions.join(" AND ")`（`token-stats-store.ts:1500`）；AC-003 用例含「只满足其一不返回」。覆盖。
- **AC-004**（与现有条件全 AND）：title/directory 与 `sources`（IN 占位符）、`start_at/end_at`（活动交集）、`search`、`order_by/direction/limit/offset` 组合于同一 WHERE；AC-004 用例 5 因子组合 + 排序断言（`["a","c","b"]`）。覆盖。
- **AC-005**（省略/空串不约束）：三处消费点均用真值判断——store `if (filters.title)`、HTTP `if (title)`（`server.ts:1459`）、IPC/web 序列化 `if (filters?.title)`，空串与省略等价；AC-005 用例断言空串结果与 baseline 一致，且 `search` 混搜语义未动（原 SQL 未改）。覆盖。
- **AC-006**（searchContent 候选过滤）：两条路径同改——IPC `session-history-ipc.ts:132-133`（候选枚举）与 `:289-292`（metadata 查询）；HTTP `server.ts:300-301` 与 `:474-475`。空串在展开点被真值判断排除，被排除会话不进候选自然不因正文命中（测试断言 provider 调用参数）。覆盖。
- **AC-007**（三入口同语义）：`GET /v1/sessions`（`server.ts:1456-1460`）、桌面 `TOKEN_STATS_SESSIONS`（`token-stats-ipc.ts:79` 直透 `TokenStatsSessionFilters`，shared 类型已加字段，`index.ts:511` provider 展开透传）、web `getSessions`（`usageboard-web.ts:528-529`）最终都收敛到同一 `query_sessions`；HTTP 集成测试 + web 序列化单测覆盖。覆盖。

### 安全审视（重点核对）

- **注入面**：`title`/`directory` 均以命名参数 `@title`/`@directory` 绑定，SQL 字符串为静态字面量，条件名（`conditions`）不含用户输入；无拼接注入。
- **LIKE 通配符**：`replace(/[\\%_]/g, c => "\\" + c)` + `ESCAPE '\\'`，与既有 `search` 同策略；测试覆盖 `%`、`_`、`\` 字面匹配回归（AC-005 注入的 `%` 若未转义会全表命中，用例断言仅命中字面行，转义有效）。
- **类型校验**：HTTP searchContent body 中 `title`/`directory` 非字符串返回 400（`server.ts:449-456`），与 `search`/`sources` 同级校验；有负向用例（title: 123 → 400）。
- **敏感数据**：无 secret/PII 落日志；无新增鉴权面。

### 规格合规

- 不偏航：改动 8 个 src 文件全部位于 spec 范围声明的查询契约链路（store / HTTP / IPC / shared types / web 序列化）；无 UI 控件、无 `cli.json` 写入、无排序字段扩展（非范围项均未触碰）。
- 不自由发挥：`unicode_lower` + ESCAPE 策略复用既有 `search` 实现，未引入新工具函数或抽象；两个门禁修复（见下）最小化且必要。
- 不变量守住：旧 `search` SQL 字面量未改动（`token-stats-store.ts:1465-1471`）；`fallback` optional-chain 改写语义等价（`fallback?.started_at !== null && fallback?.ended_at !== null && fallback`，三条件合取下 undefined 与原 `fallback && ...` 等价，`null` 检查语义不变）。

### 门禁修复判定（prompt 指定的独立判断）

- **eslint `prefer-optional-chain`（token-stats-store.ts:903）**：已在 base（主仓 = 2f5bc2f3，工作区干净）上实测 `eslint` 报 `899:17 error @typescript-eslint/prefer-optional-chain`——t445 遗留、阻塞 lint 门禁，属实。改写为 `fallback?.started_at !== null && fallback?.ended_at !== null && fallback` 可行；备选 `fallback && fallback.started_at !== null && fallback.ended_at !== null`（规则豁免注释）或 `--fix` 接受规则产出皆可，当前写法无行为差异，属可接受的最小门禁修复。
- **prettier 重排（server.ts 4 处 `agent as ...`、token-stats.ts enum 多行）**：已在 base 上实测 `prettier --check` 报含这两个文件在内 24 文件违规——format:check 是 `pnpm check` 门禁一环，属实。重排仅换行无语义变化。注意：worktree 全量 `format:check` 仍有 22 个 base 既有违规文件（`.repo_template/`、`docs/archive/*/handoff.json`、`codex-extractor.ts` 等），均不在本 task diff 内；本 task 只修自己触及的 2 个文件，未顺手全量 `format`（符合「精准修改」），剩余违规是 main 上既有问题，非本 task 引入。

### 验证记录

- `pnpm typecheck`：通过（worktree）。
- `pnpm lint`：通过（worktree；主仓 base 状态同命令报 optional-chain error，佐证修复必要性）。
- `pnpm test` 全量：286 files / 3527 passed（含 4 个改动 test 文件新用例）；`vitest run tests/integration/local-api/server.test.ts`：95 passed。
- `pnpm deadcode` / `pnpm arch`：通过。
- `prettier --check`（本 task 触及文件）：通过；全量 22 个违规文件均为 base 既有、不在 diff 内。

### 未进表的提示

- **文件过大**（按 prompt 降级规则仅列出，不进 finding 表；项目 `docs/blueprint/conventions.md`「编码与测试」未覆盖阈值，用默认表）：
    - `src/main/core/token-stats/token-stats-store.ts`：1907 行（实现源码 ≥ 800 important 线；本 task 净增约 +24）
    - `src/main/core/local-api/server.ts`：1808 行（实现源码 ≥ 800；本 task 净增约 +50）
    - `src/web/usageboard-web.ts`：823 行（实现源码 ≥ 800；本 task 净增 +3）
    - `tests/integration/local-api/server.test.ts`：3343 行 / `tests/unit/main/core/token-stats/token-stats-store.test.ts`：3172 行 / `tests/unit/web/usageboard-web.test.ts`：1158 行（测试 ≥ 1200）
    - 均为本 task 之前已超阈值的存量文件，本 task 仅小幅净增（新增逻辑为 store 内 18 行条件块与各层透传，无独立可拆单元），无硬约束说明但也不因本 task 恶化到新量级；建议后续 task 考虑 store 的 query_sessions 构建器与 server.ts 的路由分发拆分。
- **圈复杂度**：`query_sessions` 单函数手算 CC ≈ 14（≤ 15 且本 task +2 分支），不进 finding 表；`handle_session_history_search_content` 校验分支已密集（本 task +2 个 if），接近建议关注线。
- **范围外观察**：`session-history-ipc.ts:237-240` 存在注释重复两行（t389 注释粘贴两遍），base 既有、非本 task 引入，顺手提及供后续清理。

### 总体判断

实现完整覆盖 AC-001~007，三入口（HTTP / 桌面 IPC / web）收敛到同一 store 过滤语义；LIKE 转义 + 参数绑定无注入面；类型校验与既有 `search` 同级；无范围外行为。两个门禁修复经实测确认 base 上门禁确实红，处理方式最小且正确。无未解决 critical / important，无 minor。

### 系统性 follow-up

无（文件过大存量问题已在提示段列出，不建议以本 task 立项）。

verdict: PASS

______________________________________________________________________

## Round 2

- task：`t457_session_query_title_directory_filters`
- spec：`docs/tasks/t457_session_query_title_directory_filters/spec.md`
- diff_anchor：`2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674`
- target：`git diff 2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674`
- round：2
- reviewed_at：2026-09-08 06:12 UTC+8

reviewed_scope: 8e8e69b64bfe5e0d

### 复核范围

Round 1（0 finding，verdict: PASS）之后仅三处文档改动：新建 `docs/specs/session_query_title_directory_filters.md`、`docs/specs_index.md` 增一行、`docs/blueprint/architecture.md` 会话库查询路径段更新。声明无代码/测试改动，需独立确认。

### 前轮 finding 复核

Round 1 为 0 finding，无可复核项。

### 代码 diff 不变性确认

- HEAD 未变（仍 `2f5bc2f3`，Round 1 后无新 commit）。
- 工作树内 `src/`、`tests/` 全部 11 个改动文件 mtime 均为 2026-09-08 04:58:32，早于 Round 1 审定时刻（05:45）；`git status` 下 `src/`、`tests/` 无新增未跟踪文件，Round 1 后新增/改动仅为文档与 review 产物。
- 抽查 Round 1 报告引用锚点全部原样：`token-stats-store.ts:903`（optional-chain 门禁改写）、`:1465-1489`（旧 `search` 字面量未动 + t457 title/directory 条件块 + 参数绑定）、`server.ts:300-301 / 449-456 / 474-475 / 1456-1460`、`session-history-ipc.ts:132-133 / 289-292`、`token-stats-ipc.ts:66-79`、`usageboard-web.ts:527-529`、`token-stats.ts:200-203`。确认无悄悄改代码。

### 三处文档改动核对（对照 Round 1 已验证实现）

1. **新建 spec 沉淀**：查询契约逐条与实现一致——`unicode_lower(...) LIKE unicode_lower(@param) ESCAPE '\\'`、`replace(/[\\%_]/g, ...)` 转义、命名参数绑定、空/省略不约束、与既有条件全 AND、旧 `search` 语义不变（`token-stats-store.ts:1465-1489`）。三入口表与实现一致：HTTP 查询参数空串不约束（`server.ts:1456-1460` 真值判断）、桌面 `TokenStatsSessionFilters` 对象整传（`token-stats-ipc.ts:66-79` `query_sessions(filters ?? {})` 纯透传）、web filters 非空才序列化（`usageboard-web.ts:527-529`）。searchContent 双路径（候选枚举 `session-history-ipc.ts:132-133` + metadata `:289-292`；HTTP `server.ts:300-301` + `:474-475`）与 HTTP 400 校验（`server.ts:449-456`）描述准确。AC-001~007 转写忠实于契约区；「测试」章节所列 4 个文件与实际 t457 前缀用例吻合（store 6 / IPC 2 / HTTP 集成 3 / web 1，逐个 grep 核对）；非范围与 spec 一致。无事实错误。
2. **specs_index.md 增行**：slug `session_query_title_directory_filters` 与新文件名一致、task 列 t457、日期 2026-09-08；scope 取「API」为该列既有词表内取值（过滤契约经 LocalAPI HTTP 两端点完整可验），无事实错误。
3. **architecture.md 会话库查询路径段**：t457 标注、过滤清单补 `title`/`directory`、独立条件语义（大小写不敏感子串、与既有条件全 AND、空/省略不约束）、三入口收敛同一过滤语义、searchContent 候选枚举与 metadata 两路径均透传——全部与 Round 1 已验证代码一致；t227/t248 既有表述（renderer 分页、内容搜索合并、摘要策略）原样保留。无事实错误。

### 本轮新发现

0 条。

### 未进表的提示

无。

### 总体判断

三处文档改动均为对 Round 1 已验证实现的如实沉淀，无事实错误、无范围外声明；代码 diff 与 Round 1 审定状态一致（HEAD 未变、mtime 早于审定时刻、锚点逐一对上）。无未解决 critical / important / minor。

### 系统性 follow-up

无（延续 Round 1 结论）。

verdict: PASS
