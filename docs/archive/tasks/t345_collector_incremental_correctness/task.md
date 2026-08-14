---
tid: "t345"
slug: "collector_incremental_correctness"
title: "token-stats collector 增量正确性"
status: "done"
branch: "t345_collector_incremental_correctness"
worktree: ""
review_level: "full"
diff_anchor: "70ceea2682ea3ed255ede79bbb0a6147c6cc4b74"
depends_on: ""
conflicts_with: ""
note: "review_intensive: 增量数据静默丢失"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

实现要点：

- AC-001：grok-reader GrokScanResult 加 file_unreadable 字段，collector 部分不可读返回已解析部分 + failed。
- AC-002：claude/kimi 文件读失败不提交 mtime（read 成功后提交，parse-null 也提交与 grok 对齐）；第二轮测试用 first.new_state。
- AC-003：跨轮截断游标 source_cursors（超上限回滚 state + 记累计已发数 + 不 break，下轮跳过已发推进发完）。
- AC-004：postMessage 失败回滚参与 source 的扫描状态 + 游标（下轮全量重扫重发）；newly_emitted 成功才并入。
- AC-005：costs 过滤缺 timestamp（含 null）。
- AC-006：wsl_user 空结果不缓存，下轮重试。
- review 4 轮：f001/f002/f003（Round1）、f008（Round2）、f009（Round3）为重要 finding，均修复；f007/f004（Round2/3）minor 遗留登记 p164/p165。

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

### Round 1 (2026-08-13 19:50 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                      | fix_ref                           |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| t345_code_f001 | important | 已修   | postMessage 失败回滚参与 source 的扫描状态（participated 列表 + 5 map 删 key），下轮全量重扫重发；测试改真实增量 mock + 断言 jsonl_states 回滚 | collector.ts                      |
| t345_code_f002 | important | 已修   | 撤销活锁回滚方案；改超上限不 break（不饿死后续 source）；跨轮截断游标登记 p163 backlog                                                         | collector.ts                      |
| t345_code_f003 | important | 已修   | claude/kimi mtime 改 read 成功后提交（parse-null 也提交，满足契约 + 与 grok 对齐）；仅 read 失败不提交                                         | claude-reader.ts / kimi-reader.ts |
| t345_code_f004 | minor     | 已修   | AC-005 过滤补 timestamp:null（RawCostLine 类型改 string\|null\|undefined）                                                                     | claude-reader.ts                  |
| t345_code_f005 | minor     | 已修   | 补 collector 层 grok file_unreadable→failed 传播测试                                                                                           | collector.test.ts                 |
| t345_code_f006 | minor     | 已修   | claude/kimi AC-002 测试第二轮改 first.new_state（走增量重试路径）                                                                              | claude/kimi reader test           |
| t345_test_f001 | important | 已修   | AC-001 collector 层 failed 传播测试补上                                                                                                        | collector.test.ts                 |
| t345_test_f002 | minor     | 已修   | claude/kimi 重读测试第二轮用 first.new_state                                                                                                   | claude/kimi reader test           |

### Round 2 (2026-08-13 19:55 UTC+8)

| finding_id     | severity  | status | rationale                                                                                           | fix_ref           |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------------------------- | ----------------- |
| t345_code_f007 | minor     | 遗留   | AC-004 测试 mock 忽略 scan-state，登记 follow-up                                                    | p164              |
| t345_code_f008 | important | 已修   | 实现跨轮截断游标 source_cursors（超上限回滚 state + 记累计已发数 + 不 break，下轮跳过已发推进发完） | collector.ts      |
| t345_test_f003 | critical  | 已修   | AC-003 测试改为三轮游标推进验证（首轮 10000+cursor → 二轮 s10000 → 三轮清）                         | collector.test.ts |

### Round 3 (2026-08-13 20:10 UTC+8)

| finding_id     | severity  | status | rationale                                                                                      | fix_ref          |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------- | ---------------- |
| t345_code_f009 | important | 已修   | postMessage catch 对 participated source 删 source_cursors（截断轮失败游标回滚，下轮全量重发） | collector.ts:622 |
| t345_test_f004 | minor     | 遗留   | AC-003 daily 截断游标路径无测试，登记 follow-up                                                | p165             |

### Round 4 (2026-08-13 20:30 UTC+8)

| finding_id     | severity | status | rationale                                        | fix_ref |
| -------------- | -------- | ------ | ------------------------------------------------ | ------- |
| t345_code_f010 | —        | —      | 本轮零 finding（code reviewer 确认 f009 已消除） | —       |

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

- Round 1 code：FAIL（f001/f002/f003 important 已修、f004-f006 minor 已修）
- Round 1 test：FAIL（f001 important 已修、f002 minor 已修）
- Round 2 code：FAIL（f008 important 已修、f007 minor 遗留）
- Round 2 test：FAIL（f003 critical 已修）
- Round 3 code：FAIL（f009 important 已修）、test PASS
- Round 4 code：PASS

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- token-stats 6 处增量数据丢失修复（AC-001 grok 部分不可读、AC-002 读失败不提交 mtime、AC-003 超上限跨轮截断游标、AC-004 postMessage 失败回滚重发、AC-005 缺 ts 过滤、AC-006 wsl_user 空缓存重试）；Round 4 code + Round 3 test 双 PASS。顺手发现 p163-p165（截断游标/测试守卫）登记 pending。
