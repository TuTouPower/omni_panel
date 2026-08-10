---
tid: "t292"
slug: "e2e_webserver_isolation"
title: "e2e webServer 隔离：cli 不启闲置 + web 代理探测直连"
status: "done"
branch: "t292_e2e_webserver_isolation"
worktree: ""
review_level: "single"
diff_anchor: "fe46d0b7aff70b5cba35a735cadb76242b6d8261"
depends_on: ""
conflicts_with: "t281,t283,t288"
schedule_status: "scheduled"
note: "merged from t287,t289"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- SPIKE 1：playwright 1.60 无 project 级 webServer 开关（类型仅顶层）；`--project=cli` 会触发全局 webServer。方案：config 条件化（E2E_NO_WEBSERVER=1 时展开省略 webServer 键），package.json test:e2e:cli 注入 env。
- SPIKE 2：代理污染通道确认——http_proxy/https_proxy（本机 7890）下 DEBUG=pw:webserver 探测 5174 返回 400 误判「已可用」；config 加载期删除 6 个代理 env 变体根治（web e2e 全 mock 无外网，对 electron/cli 无外网依赖安全）。
- 验证：AC-003 带代理 web spec 通过、AC-004 无代理通过、AC-001 cli 脚本 5174 无监听、全量单测 2841 passed。
- 注意：`pnpm exec eslint playwright.config.ts` 单文件跑 lint=0，但全量 `pnpm lint` 会报动态 delete（no-dynamic-delete）——审阅 Round 1 抓出，展开为静态 delete 修复。

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

### Round 1 (2026-08-11 00:40 UTC+8)

| finding_id    | severity  | status | rationale                                                    | fix_ref                 |
| ------------- | --------- | ------ | ------------------------------------------------------------ | ----------------------- |
| t292_gen_f001 | important | 已修   | 动态 delete 展开为 6 条静态 delete（no-dynamic-delete lint） | playwright.config.ts:15 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 cli 脚本 5174 无监听 + 4 passed；AC-003 带代理 web spec 通过（config 内清代理）；AC-004 无代理通过；AC-005 git status 无凭据文件改动。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：FAIL（f001 important 动态 delete lint）
- Round 2 general：PASS（处置复核成立，0 新 finding）

### 结果摘要

- e2e webServer 隔离：config 加载期清代理 env（根治探测误判）+ cli 脚本关闭闲置 vite preview（E2E_NO_WEBSERVER=1）；双 SPIKE 结论入 spec；全量单测 2841 passed。
