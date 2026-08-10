---
tid: "t295"
slug: "net_client_response_body_log"
title: "net-client JSON 解析失败日志打全响应体（凭据泄漏）"
status: "done"
branch: "t295_net_client_response_body_log"
worktree: ""
review_level: "single"
diff_anchor: "3d770c708d10586defbb777b92986fc080b2f06f"
depends_on: ""
conflicts_with: ""
note: "Grok Issue 4：JSON parse 失败 log  全 body；错误页/拦截页可含凭据；改记 status/origin/content-type/长度"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## 根因

net-client.ts do_request JSON 解析失败 `request_log.warn(\`JSON parse failed for ...: ${text}\`)`把完整响应体写入日志；≥400 响应`request_log.debug(..., { body: body_text.slice(0, 200) })` 输出 body 片段。错误页/拦截页/类 JSON 响应可含凭据、会话或 PII，scrubber 只脱敏已注册 vault 值，响应体不在其列。

## 方案

三处收敛：

1. do_request JSON parse 失败：warn 改记 meta 字段 `{status, contentType, bodyBytes}`，message 只保留 origin/path，不打 text。
2. do_request ≥400：debug 改记 `HTTP <status> response (<N> bytes)`，去掉 `body: slice(0,200)`。
3. get_raw ≥400：同模式收敛（Issue 13 同文件同模式）。

## 验证记录

- RED：2 新用例失败——日志实际含 `"leak-400-body-sensitive"` 与 `"sensitive-leak-data-xyz"`。
- GREEN：net-client 37 测试全过（2 新 + 35 既有回归）。
- typecheck：`tsc --noEmit` 0 错误。

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-11 03:10 UTC+8)

| finding_id    | severity | status | rationale                                    | fix_ref                                        |
| ------------- | -------- | ------ | -------------------------------------------- | ---------------------------------------------- |
| t295_gen_f001 | minor    | 已修   | get_raw ≥400 通道无日志断言，补 get_raw 用例 | tests/integration/connector/net-client.test.ts |
| t295_gen_f002 | minor    | 已修   | AC-002 断言松散，收紧为 warn meta 字段断言   | tests/integration/connector/net-client.test.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 由 `tests/integration/connector/net-client.test.ts` JSON parse 用例断言日志不含 `sensitive-leak-data-xyz`；AC-002 由同用例断言 warn meta `"status":200`/`"contentType"`/`"bodyBytes"`；AC-003 由 do_request/get_raw ≥400 用例断言日志不含 `leak-400-body-sensitive`/`leak-getraw-body-sensitive`

### Reviewer verdict

`single`：

- Round 1 general：PASS（2 minor）
- Round 2 general：PASS（f001/f002 已修）

### 结果摘要

net-client 三处响应体日志收敛：JSON parse 失败 warn 改记 status/content-type/body 长度，do_request 与 get_raw ≥400 debug 记 body 长度，均不打响应体原文，堵住错误页/拦截页含凭据或 PII 的日志泄漏。全量测试 2846 passed + typecheck 绿。

### 结果摘要

- 一句话；无额外说明可写「见上」
