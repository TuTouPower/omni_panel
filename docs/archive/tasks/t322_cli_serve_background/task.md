---
tid: "t322"
slug: "cli_serve_background"
title: "omni_panel serve 默认后台运行 + --foreground 前台"
status: "done"
branch: "t322_cli_serve_background"
worktree: ""
review_level: "single"
diff_anchor: "b3138a0a04b788230311c91fe068d5b2c21ec93a"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

实施：omni_panel.mjs launcher `--cli serve` 默认后台（detached spawn，stdio 日志 fd，轮询 cli.json 拿 URL，pid 校验防旧残留），`--foreground` 保前台。新增 `--user-data-dir` 支持：args.ts serve 解析（空格/= 双形式），index.ts `app.setPath("userData")`（getDataRoot 前），launcher data_root 对齐。package.json 补 homepage（electron-builder 打包必需，pre-existing 缺失致 make:linux 失败）。

关键决策：后台用「轮询 cli.json」而非「pipe stdout 检测 URL」——无 EPIPE/孤儿句柄，cli.json 是权威来源（含 port/url/pid）；interval 不 unref 保活到 cli.json 出现或超时；超时 kill child 防孤儿。

验证：make:linux 重建产物后端到端黑盒——后台 serve 打印 URL 立即返回、health 200、日志落 dataRoot/logs、quit 停止；`--foreground` 阻塞 timeout 杀无残留；`=` 形式 user-data-dir 后台正常。args 单测 28 passed，全量单测 2953 passed，tsc 0。审阅 3 轮（Round1 FAIL → Round2 PASS → Round3 PASS），5 findings 全处置。

环境：worktree 每 task 独立 node_modules，electron dist 从主仓复制补齐。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-12 19:45 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                                                                             | fix_ref                                                       |
| ------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| t322_gen_f001 | important | 已修   | 实现 args.ts `--user-data-dir <path>` 解析 + index.ts serve 时 app.setPath("userData")，launcher data_root 与之对齐；端到端绝对路径 user-data-dir 后台 serve 验证通过 | src/main/cli/args.ts:16-19,95-102 + src/main/index.ts:137-144 |
| t322_gen_f002 | minor     | 已修   | 后台分支改 stdio 日志 fd（无 pipe/EPIPE），轮询 cli.json 拿 URL                                                                                                       | scripts/omni_panel.mjs:59-114                                 |
| t322_gen_f003 | minor     | 已修   | 弃 stdout chunk 检测改轮询 cli.json（pid 校验防旧残留），无 chunk 拆分问题                                                                                            | scripts/omni_panel.mjs:89-113                                 |
| t322_gen_f004 | minor     | 已修   | 早退时提示看日志路径                                                                                                                                                  | scripts/omni_panel.mjs:80-87                                  |

### Round 2 (2026-08-12 19:50 UTC+8)

| finding_id    | severity | status | rationale                                                                           | fix_ref                              |
| ------------- | -------- | ------ | ----------------------------------------------------------------------------------- | ------------------------------------ |
| t322_gen_f005 | minor    | 已修   | launcher data_root 兼容 `--user-data-dir=<path>` = 形式；超时分支 kill child 防孤儿 | scripts/omni_panel.mjs:52-66,106-112 |

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
- 证据：AC-001~004 由黑盒验证覆盖（后台返回+health、日志落盘、foreground 阻塞、quit 停止），AC-005 文档已更新；args 单测 + 全量 2953 passed；详见 handoff.json ac_evidence

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：FAIL
- Round 2 general：PASS
- Round 3 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- omni_panel --cli serve 默认后台运行（stdio 落 dataRoot/logs，轮询 cli.json 返回 URL），--foreground 保前台；实现 --user-data-dir 全链路（args 解析 + app.setPath + launcher 对齐），补 homepage 修复 electron-builder
