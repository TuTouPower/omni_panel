# Task review t295（reviewer_focus: 通用）

- task：`t295_net_client_response_body_log`
- spec：`docs/tasks/t295_net_client_response_body_log/spec.md`
- diff_anchor：`3d770c708d10586defbb777b92986fc080b2f06f`
- target：`git diff 3d770c708d10586defbb777b92986fc080b2f06f`
- round：1
- reviewed_at：2026-08-11 03:08 UTC+8

## Findings

### t295_gen_f001 - get_raw ≥400 收敛点无测试守护（Issue 13 第二处）

- 严重度：minor
- 锚点：AC-003；spec 范围「debug 级 ≥400 body 截断日志（body_text.slice(0, 200)）一并收敛（Issue 13 同文件同模式）」覆盖两处
- 位置：`tests/integration/connector/net-client.test.ts`（两处新用例均走 `get_json`，未覆盖 `get_raw`）；`src/main/core/connector/net-client.ts:407-409`（已修复但无测试）
- 问题：本 task 收敛三处日志点——JSON parse warn、do_request ≥400 debug、get_raw ≥400 debug。两处 ≥400 截断日志（Issue 13 同文件同模式）实现均已改对，但新增测试只守护 `get_json`（do_request）路径；`get_raw` ≥400 路径（`HTTP <status> get_raw response (<N> bytes)`）无任何测试驱动（connector 集成测试均 mock `get_raw`，net-client 自身也无 `get_raw` ≥400 用例）。真实生产路径 `probe-executor.ts:59` 调用 `ctx.http.get_raw(...)`，≥400 时响应体此前经 `slice(0, 200)` 落日志，现修复后仅靠代码审查守护。若回归重新引入 `body_text.slice(0, 200)`，无自动化防护，凭据泄漏复现不可测。安全向 task 的第三个收敛点缺 guard，判 minor 而非 blocking：AC-003 行为已在 do_request 实例上验证，get_raw 实例为同模式覆盖扩展，不满足 blocking 硬阈值。建议补一条镜像用例（`ctx.http.get_raw` + 500 响应 + 断言日志不含敏感串）。
- 建议：仿现有 HTTP error 用例，改为 `ctx.http.get_raw("default", "/usage")` 驱动 ≥400，断言 `joined` 不含敏感串。

### t295_gen_f002 - AC-002 诊断断言松散：长度断言靠既有 success-path debug 行命中，status/contentType 未断言

- 严重度：minor
- 锚点：AC-002「日志保留可诊断信息：status、请求 path、content-type、body 长度」
- 位置：`tests/integration/connector/net-client.test.ts:173`（`toMatch(/body.*(bytes|length)|\d+ bytes/)`）
- 问题：JSON parse 失败用例的长度断言 `/\d+ bytes/` 实际命中的是既有 success-path debug 行 `body=22 bytes`（net-client.ts:309-311），而非新增 warn meta 里的 `bodyBytes`。`"bodyBytes"`（大写 B）不匹配正则 `body.*(bytes|length)`。因此即使 JSON parse warn meta 完全删除 `bodyBytes`/`status`/`contentType`（退化为 `{}`），该用例仍会通过——AC-002 的 status 与 contentType 字段实际未被断言。核心 AC-001（`not.toContain` 敏感串）断言有效，故判 minor，非危险模式（恒真/删 expect）级别。
- 建议：针对 warn 日志本身断言，如过滤 `JSON.parse failed` 行后校验 meta 含 `status`、`contentType`、`bodyBytes`（或对完整 joined 断言 `/JSON parse failed.*"bodyBytes":\d+/`），使 AC-002 落到被验证的日志记录上。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：无。已扫描 `src/main/core/connector/` 与全 `src/main`，无其它打响应体原文的日志路径；`probe-executor.ts` 的 `Probe failed for ...: ${message}` 依赖 get_raw 抛错消息，现错误消息仅含 status+bytes，无 body，符合收敛目标。
- 总体判断：三处日志收敛（Issue 4 JSON parse + Issue 13 两处 ≥400）实现完整正确，AC-001/002/003 均已实现；新增 2 用例触达真实 net-client + 真实 logger transport + 真实 HTTP server，非 mock 假路径，实测 37 用例全过（2 新 + 35 既有回归）。仅 2 条 minor 覆盖扩展建议，无未解决 critical/important，可 PASS。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: c9dc654de8fbe220

## Round 2 (2026-08-11 03:11 UTC+8)

### 前轮 finding 复核

- **t295_gen_f001（get_raw ≥400 无测试守护）— 已修**。新增用例「does not log response body on get_raw HTTP error (t295)」真实驱动 `ctx.http.get_raw("default", "/usage")`：500 响应体含敏感串 `leak-getraw-body-sensitive`，断言 `joined` 不含该串且 `rejects.toThrow(/HTTP 500/)`。get_raw ≥400 收敛点（net-client.ts:407-409）现由自动化守护。
- **t295_gen_f002（AC-002 诊断断言松散）— 已修**。JSON parse 用例改为 `lines.find((l) => l.includes("JSON parse failed"))` 定位 warn 日志行并断言 `toBeDefined()`、`'"status":200'`、`'"contentType":"application/json"'`、`'"bodyBytes":'`。status/contentType/bodyBytes 三字段直接落到被验证日志记录，warn meta 任一字段删除即失败。

### 本轮新发现

0 条。

### 复核依据

- `git diff 3d770c708d10586defbb777b92986fc080b2f06f` 实测：net-client.ts 三处收敛（JSON parse warn `{status,contentType,bodyBytes}`、do_request ≥400 `(<N> bytes)`、get_raw ≥400 `(<N> bytes)`）保持不变；测试新增 1 用例（76→115 行 diff）。
- 实跑 `npx vitest run tests/integration/connector/net-client.test.ts`：38 全过（3 新 t295 用例 + 35 既有回归），非采信 implementer 自述。
- 未改任何代码/测试文件。

### 结论

- 前轮 finding 复核：f001 已修、f002 已修
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：无未解决 critical/important，本轮确认 2 条 minor 均消除，PASS
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: cf418e6b7da48403

## 收尾记录（Final，2026-08-11）

收尾文档同步后指纹变化，无逻辑/测试变更：

- `docs/specs/connector-runtime.md`：新增「响应体日志收敛（t295）」纯文档段——JSON 解析失败日志只记 status/content-type/body 长度，≥400 响应日志记 body 长度，均不打响应体原文。
- `docs/specs_index.md`：connector-runtime 行源注加 t295。

与前两轮结论一致：三处日志收敛实现与测试守护完整，38 用例全过，无未解决 critical/important。

verdict: PASS

reviewed_scope: 951e92f0d560dc62

## 最终记录（Final，2026-08-11）

commit 前 lint-staged 拦截：测试文件 3 处 `${addr.port}` 触发 restrict-template-expressions（lint 门禁），已改为 `${String(addr.port)}` 等价改写，无语义变化。实测确认 net-client.test.ts 158/204/242 三处均包 `String(...)`。

复核要点：

- 仅测试文件模板字符串等价改写，无逻辑/测试变更。
- 三处日志收敛实现与测试守护维持前几轮结论，38 用例全绿。
- 本文件已随 `task.py finish` 归档至 `docs/archive/tasks/t295_net_client_response_body_log/`。

与前几轮一致：无未解决 critical/important。

verdict: PASS

reviewed_scope: a86666cc951a3012
