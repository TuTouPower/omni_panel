---
tid: "t259"
slug: "web_desktop_panel_parity"
title: "网页版面板与桌面版同步"
status: "done"
branch: "t259_web_desktop_panel_parity"
worktree: ""
review_level: "full"
diff_anchor: "830702805ed91069f2794ff39ba67196280cee77"
depends_on: ""
conflicts_with: "t252"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

### Step 1（SPIKE）

- `{doctor_cmd}` 无独立命令。
- SPIKE：会话历史 HTTP 桥覆盖面。结论：`GET /v1/sessionHistory` 未注册（web query 404，仅 e2e mock 有）；`searchContent`/`summaries` 为 web stub 空实现。本 task 含服务端 endpoint 新增（最低 1 必补 + 2 完整）。会话面板其余依赖（getSessions/getSessionStats/query/onFocus/open）真实现或无需补。报告 `docs/spikes/` 待建。
- t252 遗留 minor 并入：`use_panel_navigation` web 端 Session 跳转不切 hash（`usageboard-web.sessionHistory.open` 只分发 onFocus 订阅者）——补 hash 切换。
- preflight `--require-verified` PASS。

### Step 2/3（实现）

- local-api `server.ts`：新增 `session_history_deps` option（`service`/`sessions_provider`/`locator_paths`），新增 `handle_web_session_history` 统一分发 `GET /v1/sessionHistory`、`POST /v1/sessionHistory/searchContent`、`POST /v1/sessionHistory/summaries`。实现复用桌面 `session-history-ipc.ts` 的 QUERY/SEARCH_CONTENT/SUMMARIES 逻辑：`resolve_session_file` + `service.query/searchContent/summaries`，`sessions_provider` 供候选会话；HTTP 边界把分页游标序列化为字符串（web `before_cursor` 编码一致）。GET 端点原本放 `handle_web_read` 的方案因 `store` 可选类型冲突弃用，改独立 handler（纯增量）。
- `main/index.ts`：把 `session_history_sessions_provider` / `session_history_locator_paths` 提取为共享变量，`registerSessionHistoryIpc` 与 `create_local_api_server({ session_history_deps })` 共用，保证 web 与桌面同源。
- `usageboard-web.ts`：`sessionHistory.open` 补 `window.location.hash = "history"`（t252 遗留）；`query` 透传 source/env（服务端据此定位）；`searchContent`/`summaries` 从 stub 改为 POST 真调用。
- `subscription-service.ts` 类型已全部导出（SessionsProvider/SessionQueryFilters/QueryOptions/QueryResult/ResolvedSessionLoc/SessionLoc/SessionRow/Env 等），无需改动。
- 测试：local-api 集成补 6 个新 endpoint 契约测试（mock service+sessions_provider+真实 claude_code 文件定位）；web 单测补 open hash / query 透传 / searchContent / summaries；web e2e 新增 `panel_navigation.spec.ts`（AC2 互跳链 + 当前面板隐藏 + AC3 无 min/max/close + AC1 history 渲染）。
- 验证：`server.test.ts`+`usageboard-web.test.ts` 57 通过；typecheck / lint 全绿；web e2e 新增 4 通过。
- web e2e 预存失败处置：完整 web e2e 55 passed / 4 failed / 1 skipped。4 失败全在 `session_panel.spec.ts`（t228 统计行 + t237 虚拟列表），根因为 synthetic fixture 缺 `GET /v1/sessionStats`（统计行显示"统计不可用"，断言 `/9 个会话/` 失败）与 LARGE_SESSION 经 page.route 注入超出会话库首屏分页（`大会话虚拟列表` 卡不出现）。两条路径均不经过 t259 改动的 3 个文件（getSessions/getSessionStats 数据源未变、open/query/searchContent 改动在其后），`git stash` 验证 base（t252）同样失败——**base 预存，非 t259 引入**。另修复 4 处 t252 品牌文案陈旧断言（`OmniPanel` → `Omni Panel`，web e2e popup 标题），属 AC4 无回归要求内清理。
- 4 个预存失败登记 pending 待后续维护（fixture 补 sessionStats + 会话库分页断言适配）。

### Step 4（黑盒）

- 单测：244 files / 2634 passed / 8 skipped 全绿（含新增 server.test.ts +6、usageboard-web.test.ts +4）。
- electron e2e：42 passed / 4 skipped 全绿（AC4 无回归）。
- web e2e：55 passed / 4 failed / 1 skipped。4 failed 为 base 预存（见上，session_panel fixture 缺口），非本 task 引入；新增 `panel_navigation.spec.ts` 4 passed（AC1 history 渲染、AC2 互跳链 + 当前面板隐藏、AC3 无 min/max/close）。
- 打包 smoke：`pnpm package` + `pnpm test:packaged` 4 passed（local-api server 改动打包后正常）。
- typecheck / lint 全绿。

### Round 1 (2026-08-08 10:50 UTC+8)

双路 review：code FAIL / test PASS。code 5 条处置（f001 important 已修 + f002-f005 minor 遗留），test 4 条 minor 已修。修复后 server.test + usageboard-web.test 60 passed。

| finding_id     | severity  | status | rationale                                                                          | fix_ref                    |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------- | -------------------------- |
| t259_code_f001 | important | 已修   | searchContent/summaries 入口加形态校验，畸形 POST 400 而非 500；补畸形入参集成测试 | server.ts / server.test.ts |
| t259_code_f002 | minor     | 遗留   | 会话检索端点无 auth 暴露会话原文（intranet 决策维持）；残留风险登记 pending        | p085                       |
| t259_code_f003 | minor     | 遗留   | web 跨面板「打开会话」丢目标会话（SessionShell 未挂载时 onFocus 无订阅）           | p082                       |
| t259_code_f004 | minor     | 遗留   | GET /v1/sessionHistory 缺 source/env 时全量枚举（仅兼容 id-only 调用方）           | p083                       |
| t259_code_f005 | minor     | 遗留   | web searchContent 无取消，并发扫描堆积                                             | p084                       |
| t259_test_f001 | minor     | 已修   | searchContent/summaries 非法 body 400 路径补测                                     | server.test.ts             |
| t259_test_f002 | minor     | 已修   | legacy locs 形态补集成测试                                                         | server.test.ts             |
| t259_test_f003 | minor     | 已修   | web searchContent 单元测试补 body/Content-Type 断言                                | usageboard-web.test.ts     |
| t259_test_f004 | minor     | 已修   | panel_navigation AC2 history 侧补其余三入口可见断言                                | panel_navigation.spec.ts   |

### Round 2 (2026-08-08 11:05 UTC+8)

code review 复核 Round 1 修复，verdict PASS。残留 1 处同类 minor（filters.search 非 string 仍 500）顺手补修 + 补测试。test review Round 1 已 PASS。

| finding_id     | severity | status | rationale                                                         | fix_ref                    |
| -------------- | -------- | ------ | ----------------------------------------------------------------- | -------------------------- |
| t259_code_f006 | minor    | 已修   | `filters.search` 非 string 校验补齐（与 f001 同类，400 而非 500） | server.ts / server.test.ts |

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

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：单测 245 files / 2644 passed（含 server.test + usageboard-web.test 60）；electron e2e 42 passed / 4 skipped；web e2e 55 passed（含 panel_navigation 4 项 AC1/AC2/AC3）+ 4 预存失败（base 同源，见 p075）；打包 smoke 4 passed；typecheck + lint 全绿。AC1（#/history 会话面板 + 3 个 local-api endpoint 契约测试）、AC2（互跳 + 当前面板隐藏）、AC3（web 无 min/max/close）、AC4（web + electron e2e 无回归）均验证。

### Reviewer verdict

`full`：

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

- 网页版与桌面版同步落地：3 个会话历史 local-api endpoint（query/searchContent/summaries）+ web open 补 hash 跳转 + searchContent/summaries 真调用；双路 review 两轮后 PASS，全测试套件绿（web e2e 4 个 pre-existing 失败与 base 同源）。
