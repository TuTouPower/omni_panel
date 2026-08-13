---
tid: "t344"
slug: "cli_json_zod_validation"
title: "omni_panel.mjs cli.json zod 校验"
status: "done"
branch: "t344_cli_json_zod_validation"
worktree: ""
review_level: "full"
diff_anchor: "1ceef5c575b960958eae584d096d6d556c11adcf"
depends_on: ""
conflicts_with: ""
note: "review_intensive: lint 16 error 契约 bug"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

实现要点：

- 抽 `scripts/cli_json_parse.mjs` + `.d.mts`：parse_cli_json 读文件 + JSON 校验 + 字段类型校验，返回判别联合 `{ok:true,info}|{ok:false,error}`。
- omni_panel.mjs 的 probe/serve 轮询改用 parse_cli_json；typeof 收窄 data_root/join 消 any（TS 对 .mjs 推断弱，JSDoc 标注不生效）。
- 16 个 no-unsafe lint 清零；reviewer 发现残留 readFileSync import 已删。

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

### Round 1 (2026-08-13 19:00 UTC+8)

| finding_id     | severity  | status | rationale                                                      | fix_ref                |
| -------------- | --------- | ------ | -------------------------------------------------------------- | ---------------------- |
| t344_code_f001 | important | 已修   | 移除 omni_panel.mjs 残留未用 readFileSync import，lint 0 error | omni_panel.mjs:20      |
| t344_code_f002 | minor     | 遗留   | CliInstanceInfo 三处重复，登记 follow-up                       | p160                   |
| t344_code_f003 | minor     | 遗留   | 防御性 typeof 收窄（恒 string），登记 follow-up                | p161                   |
| t344_code_f004 | minor     | 已修   | spec UNVERIFIED-SPIKE 改为已核实结论                           | spec.md:83             |
| t344_test_f001 | important | 已修   | readFileSync 残留已删，lint 0 error                            | omni_panel.mjs:20      |
| t344_test_f002 | minor     | 已修   | 补文件缺失分支用例（可读错误非抛异常）                         | cli_json_parse.test.ts |
| t344_test_f003 | minor     | 已修   | spec UNVERIFIED-SPIKE 已清                                     | spec.md:83             |
| t344_test_f004 | minor     | 已修   | 补 userData/startedAt 断言 + url/pid 缺字段用例                | cli_json_parse.test.ts |

### Round 2 (2026-08-13 19:05 UTC+8)

| finding_id     | severity | status | rationale                              | fix_ref                |
| -------------- | -------- | ------ | -------------------------------------- | ---------------------- |
| t344_code_f005 | minor    | 已修   | 测试文件 prettier 格式修复（--write）  | cli_json_parse.test.ts |
| t344_test_f005 | minor    | 遗留   | 类型错误分支覆盖可更广，登记 follow-up | p162                   |

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
- 结果：全部满足 / 未满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 important 已修、f002/f003 minor 遗留、f004 minor 已修）
- Round 1 test：FAIL（f001 important 已修、f002/f003/f004 minor 已修）
- Round 2 code：PASS（f005 minor 已修）
- Round 2 test：PASS（f005 minor 遗留）

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- omni_panel.mjs cli.json 解析抽为 cli_json_parse.mjs（判别联合 + 可读错误），16 个 no-unsafe lint 清零；补 7 例解析单测。Round 2 双路 PASS。顺手发现 p160-p162（契约重复/防御性 typeof/类型错误分支）登记 pending。
