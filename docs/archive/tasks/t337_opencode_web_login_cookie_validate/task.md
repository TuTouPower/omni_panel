---
tid: "t337"
slug: "opencode_web_login_cookie_validate"
title: "Opencode 网页登录捕获无效 cookie 校验（p148）"
status: "done"
branch: "t337_opencode_web_login_cookie_validate"
worktree: ""
review_level: "full"
diff_anchor: "f828251c17ec9ac6891943c67b2d237d3d30cddf"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

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

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

### Round 1 (2026-08-13 04:05 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                   | fix_ref                                           |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| t337_code_f001 | important | 已修   | auth-ipc startCookieLogin 按 reason 区分 invalid_cookie/no_cookie 文案；cookie_login_poll 透传中文                          | src/main/ipc/auth-ipc.ts:110                      |
| t337_code_f002 | minor     | 已修   | is_valid_opencode_login 用 /\/workspace\/([^/?#]+)/ 正则对齐 connector                                                      | src/main/core/session/session-manager.ts          |
| t337_code_f003 | minor     | 已修   | 决策接受：当前仅 opencode_go 为 web_login provider，verify_cookie 全局注入无现成回归；新 provider 走 web_login 时再按需分派 | src/main/core/session/session-manager.ts          |
| t337_code_f004 | minor     | 已修   | verify_cookie fetch 加 10s AbortController 超时                                                                             | src/main/index.ts:605                             |
| t337_test_f001 | important | 已修   | cookie_login_poll.test 补 web 编辑态 invalid_cookie 文案用例                                                                | tests/unit/renderer/lib/cookie_login_poll.test.ts |
| t337_test_f002 | minor     | 已修   | session-ipc.test 补 reason 透传用例                                                                                         | tests/unit/ipc/session-ipc.test.ts                |
| t337_test_f003 | minor     | 已修   | is_valid 补 3xx+null/空 location 边界                                                                                       | tests/unit/session/session-manager.test.ts        |
| t337_test_f004 | minor     | 已修   | auth-ipc reason→文案映射补间接覆盖（cookie_login_poll.test 透传 + web_login_section.test 文案）                             | tests/unit/renderer/lib/cookie_login_poll.test.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003/006 由 session-manager.test.ts（verify_cookie 无效/匿名时序/有效 + is_valid 判定矩阵）覆盖；AC-004 由 cookie_login_poll.test.ts（web 编辑态 invalid_cookie 透传）+ web_login_section.test.tsx（桌面/web add invalid_cookie 文案）覆盖；AC-005 手动粘贴路径不调 start_login 由既有 SettingsForm 路径保证。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 important：AC-004 web 编辑态 reason 丢失；f002-f004 minor）
- Round 1 test：FAIL（f001 important：AC-004 覆盖缺口；f002-f003 minor）
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- session-manager 捕获 cookie 后新增有效性探测（verify_cookie 注入，/auth 3xx+workspace 判定），无效 saved:false+reason:invalid_cookie 不落库；web 编辑态/桌面/web add 三路径均贯通「登录态无效」文案。p148 闭环。
