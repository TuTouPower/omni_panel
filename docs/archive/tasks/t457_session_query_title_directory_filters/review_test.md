# Task review t457（reviewer_focus: 测试）

- task：`t457_session_query_title_directory_filters`
- spec：`docs/tasks/t457_session_query_title_directory_filters/spec.md`
- diff_anchor：`2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674`
- target：`git diff 2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674`
- round：1
- reviewed_at：2026-09-08 05:48 UTC+8

reviewed_scope: 0e8da6ec74d0e24a

## Findings

### t457_test_f001 - AC-004 组合查询缺 `search` 与 `title`/`directory` 同时非空的 store 级用例

- 严重度：minor
- 锚点：AC-004（部分覆盖）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:550`（AC-004 用例）、`tests/unit/ipc/session-history-ipc.test.ts:576`
- 问题：AC-004 列举 6 组可与 `title`/`directory` AND 的现有条件，store 级用例只组合了 `sources`、`start_at`/`end_at`、`order_by`/`direction`、`limit`/`offset` 五组；`search` 与新条件同时非空的组合只有 IPC 层透传断言（provider 为 mock，不验证 store AND 语义），见 `session-history-ipc.test.ts:612`（`filters: { title, directory, search }` 但 `sessions_provider` 是 `vi.fn()`）。store 真实实现上 `search` 与 `title`/`directory` 共用 LIKE 转义与参数绑定路径（`token-stats-store.ts:1466-1489`），参数名冲突类 bug 现有用例抓不到。
- 建议：在 AC-004 用例的组合查询中补一个非空 `search`，一行改动即可闭合。

### t457_test_f002 - AC-001「即使 id 含 T 也不返回」无判别用例

- 严重度：minor
- 锚点：AC-001（部分覆盖）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:521-529`；`tests/integration/local-api/server.test.ts:1217`
- 问题：store 夹具（`token-stats-store.test.ts:467-505`）id 为 `a`/`b`/`c` 单字母，不存在「id 含查询词而 title 不含」的行；`title: "alpha"` → `["a"]` 首条断言里 a 的 title/directory/id 三字段同时含 `alpha`，对串字段不判别（该用例 523 行注释「构造 id/title 交叉用例」与夹具实际不符）。directory 串字段已由 HTTP 端到端判别（`server.test.ts:1255-1260`，sess-dir 目录含 Refactor 被排除）与 store 端 AC-002 判别（`directory: "match"` → `[]`），唯 id 串字段全程无判别。
- 建议：store 夹具加一行 id 含 `alpha` 而 title/directory 不含的会话，断言 `title` 查询不返回它；或修正 523 行注释使夹具意图一致。

### t457_test_f003 - 桌面 IPC `tokenStats:sessions` 通道无 `title`/`directory` 行为断言

- 严重度：minor
- 锚点：AC-007（三端之一缺层内断言）
- 位置：`tests/unit/ipc/token-stats-ipc.test.ts:146-175`（无新增用例）；`src/main/ipc/token-stats-ipc.ts:79`
- 问题：AC-007 要求桌面会话列表请求可携带 `title`/`directory`。web（`usageboard-web.test.ts:73`）与 HTTP（`server.test.ts:1217`）均有专测，桌面 IPC（preload → `TOKEN_STATS_SESSIONS` → `query_sessions(filters ?? {})`）无任何 `title`/`directory` 透传断言。该 handler 为逐字透传、无字段级逻辑，风险低；但 AC-007 明列三端，此端覆盖仅靠类型系统背书。
- 建议：仿 `t389 AC-002` 用例补一条「带 `title`/`directory` 的 filters 原样到达 `query_sessions`」，成本低。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：无。diff 中 4 个测试文件均为纯新增（numstat 删除行数 0），无既有测试被修改或删除；t457 LIKE 转义用例中反斜杠断言（`token-stats-store.test.ts:614`，查询 `\` 只命中 title 含字面反斜杠的 `literal-bs`）断言的是用户可观察的正确行为，属新增正确测试，非迁就实现。
- AC 覆盖判定：AC-001/002/003/005 在 store 层有判别性真实 sqlite 用例；AC-001/003 另有 `GET /v1/sessions` 真实 store 端到端（`server.test.ts:1217`，跨字段判别成立）；AC-004 有五组条件 AND + 排序分页判别（缺 `search` 组合，见 f001）；AC-006 有 IPC 透传精确断言（候选枚举与 metadata 两次调用逐一核对）+ HTTP 透传 + 400 校验；AC-007 三端中两端有专测、第三端靠纯透传（f003）。无任何 AC 完全无测试，无验证假行为。测试边界干净：store 用真实 `:memory:` sqlite，IPC/HTTP mock 只落在 provider/service 依赖边界，web 只 mock fetch。「有意不测」仅 LIKE 耗时门禁，未据此出 finding。
- 门禁验证：`pnpm test` 入口下 3 个单元文件 201 passed、`tests/integration/local-api/server.test.ts` 98 passed（含全部 12 个 t457 用例）。注：绕过 `pnpm test` 直接跑 vitest 会因 better-sqlite3 ABI 指向 electron 而全挂，`ensure_sqlite_abi.mjs` 切回 node 后即绿——环境切换问题，非测试缺陷。
- 本轮新发现：3 条（均 minor，不阻断）。
- 未进表的提示：AC-006 的「被排除会话不因正文命中进入结果」经由 provider 收到 filters + store 过滤正确性分层组合保证，未做 searchContent 端到端排除验证；实现上排除逻辑单点在 store，风险可接受，t458 UI 接入时如有回归可再补。
- 总体判断：7 条 AC 全部有真实行为测试触达生产实现，无危险模式命中，3 条 minor 为覆盖补强项，可 PASS。
- 系统性 follow-up：无。

verdict: PASS

______________________________________________________________________

## Round 2

- task：`t457_session_query_title_directory_filters`
- spec：`docs/tasks/t457_session_query_title_directory_filters/spec.md`
- diff_anchor：`2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674`
- target：`git diff 2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674`
- round：2
- reviewed_at：2026-09-08 06:09 UTC+8

reviewed_scope: 8e8e69b64bfe5e0d

### 前轮 finding 复核

工作树 HEAD 仍为 diff_anchor（改动未提交），`git diff 2f5bc2f3f9b360efe33bd0f1f86591e9c6af3674 -- src tests` 与 Round 1 审定为同一份 diff；按 Round 1 报告行号抽查全部吻合：AC-004 store 用例（`token-stats-store.test.ts:549-576`）仍只组合 sources/时间窗/order/limit/offset 五组、无 `search`；AC-001 用例注释与单字母 id 夹具原样（`:521-529`、`:467-505` id 为 `a`/`b`/`c`）；`token-stats-ipc.test.ts` 全文无 `title`/`directory` 命中。三条均未被修复，implementer 处置为「遗留」并登记 `docs/pending/todo/p224_session_query_filter_test_coverage_gaps.md`。

- t457_test_f001：仍存在。遗留处置核实——p224 条目 1 与 finding 逐项对应（store 级 AC-004 补非空 `search`、共用 LIKE 转义与参数绑定路径的参数名冲突风险、「AC-004 用例加一行」建议），无失真无弱化。同意遗留。
- t457_test_f002：仍存在。p224 条目 2 对应（id 含 T 而 title 不含无判别用例、夹具 id 单字母、「补夹具行或修 523 行注释」两个方向均保留），无失真。同意遗留。
- t457_test_f003：仍存在。p224 条目 3 对应（`tokenStats:sessions` 通道补「filters 原样到达 `query_sessions`」断言、handler 纯透传风险低、仿 t389 AC-002），无失真。同意遗留。

p224 登记完整：三条 finding 一一对应、严重度与建议原样保留、fix_ref 指向明确，处理计划（t458 UI 接入前顺手闭合或随 t458 测试一并补）与三条 minor 均不阻断的判定一致。

### Findings

本轮无新 finding。自 Round 1 起新增改动均为文档：`docs/specs/session_query_title_directory_filters.md`（新建）、`docs/specs_index.md`（+1 行）、`docs/blueprint/architecture.md`（会话库查询路径段改写）、`docs/pending/todo/p224_*.md`（新建）；src 与 tests 零改动。抽查新增文档内容与已实现行为一致（LIKE 转义与参数绑定语义、三入口收敛、searchContent 两路径透传及 HTTP 400 校验，与 `token-stats-store.ts:1466-1489`、`server.ts:297+443` 实际代码相符），specs_index 表行格式符合既有约定。

### 结论

- 前轮 finding 复核：三条均遗留处置，p224 登记无失真，同意遗留。
- 改测方向复核：无。src/tests 相对 Round 1 零改动，无改测。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：Round 1 三条 minor 均为覆盖补强项，已登记 p224 遗留，不阻断；代码与测试未变，Round 1 PASS 判定维持。
- 系统性 follow-up：p224（已登记）。

verdict: PASS
