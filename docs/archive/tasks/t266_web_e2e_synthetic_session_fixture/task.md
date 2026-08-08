---
tid: "t266"
slug: "web_e2e_synthetic_session_fixture"
title: "web e2e synthetic fixture 补会话库统计与虚拟列表数据"
status: "done"
branch: "t266_web_e2e_synthetic_session_fixture"
worktree: ""
review_level: "single"
diff_anchor: "54e65a67272ada41fe9e532953f66e6314c67671"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

- SPIKE：会话库统计端点确认为 `GET /v1/sessionStats` 返回 `{sessions, agents, tokens, source_counts}`（token-stats-store query_session_stats）。页面「统计不可用」= 该请求 404。
- 修复 1（统计不可用）：`scripts/e2e/session_fixture.mjs` `build_session_responses` 补 `GET /v1/sessionStats`（sessions=9、agents=4、tokens=求和、source_counts）；`mock_server.mjs` 把 `/v1/sessionStats` 纳入 GET 数组兜底。synthetic.json 由脚本合并产物再生成（gen_synthetic 依赖真实 responses.json，本机缺失无法完整重跑，用 `build_session_responses` 合并注入）。
- 修复 2（虚拟列表卡片找不到）：根因 `page.route("**/v1/sessions")` Playwright glob 不匹配 query string，首屏请求实际带 `?limit=&offset=`；改 `**/v1/sessions*`。
- 修复 3（搜索闭环）：mock_server 对 `/v1/sessions` 原恒返回全集，不实现 search/sources/order_by/limit/offset 过滤 → 搜索 `auth` 仍 9 卡。补会话库过滤/排序/分页语义（对齐真实 query_sessions：search 匹配 title/directory/id 不区分大小写、sources 数组、order_by tokens/calls 等、limit/offset）。
- 验证：`MOCK_FIXTURE=synthetic pnpm test:e2e:web` 61 passed（原 4 个失败全过，其余无回归）。
- web e2e 环境：5174 preview 需手动起（reuseExistingServer 复用失效端口，t263 已知），mock_server 改动需重启 preview 生效。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-08 18:20 UTC+8)

| finding_id    | severity | status | rationale                                                                                                    | fix_ref           |
| ------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------ | ----------------- |
| t266_gen_f001 | minor    | 已修   | mock_server.mjs prettier --write 格式化                                                                      | mock_server.mjs   |
| t266_gen_f002 | minor    | 遗留   | synthetic.json 2-space 由生成脚本决定，锚点版本同样 prettier warn，非本 task 引入；改脚本破坏 AC2 产物一致性 | gen_synthetic.mjs |

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1（synthetic 下 web e2e 全过含 4 个既有失败）：`MOCK_FIXTURE=synthetic pnpm test:e2e:web` 61 passed（原 4 失败：搜索闭环、virtual list 3 例全过）。
    - AC2（fixture 再生成可重复）：`build_session_responses` 补 sessionStats 后与 synthetic.json 会话部分逐字一致；产物由脚本逻辑合并生成（gen_synthetic 依赖真实 responses.json，本机缺失无法完整重跑，用脚本函数合并）。
    - AC3（无回归）：全量 `pnpm test` 2657 passed；web e2e 其余 57 例保持通过。

### Reviewer verdict

`single`：

- Round 1 general：PASS（f001 minor 已修 prettier；f002 minor 遗留 p091——synthetic.json 2-space 由生成脚本决定，锚点版本同 warn，非本 task 引入）

遗留：p091（synthetic.json 缩进格式，不阻断）

### 结果摘要

- 修 web e2e（synthetic）4 个既有失败：fixture 补 sessionStats、mock_server 补会话库过滤/排序/分页语义、page.route glob 匹配 query；61 passed。p090 闭环，p091 登记。
