---
tid: "t216"
slug: "fix_grok_incremental_id"
title: "修复 grok 会话历史增量消息 id 冲突"
status: "done"
branch: "t216_fix_grok_incremental_id"
worktree: ""
review_level: "full"
diff_anchor: "a4d5c903f69f0022ecddd68a8d442bbe8020b91e"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

创建期核实（2026-08-05，只读仓库）：

- p050 根因复核：`grok-extractor.ts:40` 全量 id `grok:${line_index}`（只对合法消息 +1）；`:101` 增量 `line_index` 从 0 起 → 追加消息 id 与全量前段冲突。`merge_tail`（SessionHistoryView.tsx:22-30）按 id 去重，watcher 增量新消息会被当重复丢弃，只能靠 5s 兜底全量重拉。与 p050 描述一致。
- 半行场景：增量按 `cursor.offset` 切片，若 offset 落在 JSON 行中间（写入半行），`JSON.parse` 失败整行跳过 → 该记录在增量通道丢失。与 p050 描述一致。

无

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

### Round 1 (2026-08-05 21:20 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                                    | fix_ref                                                                                           |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| t216_code_f001 | minor     | 已修   | `extract_grok_incremental` 游标推进区分「完整无换行末行」与「未完成半行」：尾部行 JSON.parse 成功则推进到文件末尾不重发，失败才驻留行首；新增「完整末行无尾换行不重发 + 追加后 id 延续」用例 | src/main/core/session-history/grok-extractor.ts:126-146；tests/.../grok-extractor.test.ts:161-189 |
| t216_test_f001 | important | 已修   | subscription-service p050 用例补 80ms settle 等待（Windows mtime 量化，紧邻两写 mtime 常同），与既有轮询用例同法；连跑 5 次全绿                                                              | tests/.../subscription-service.test.ts:199-202                                                    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 增量 id 与全量全局不冲突：`grok-extractor.test.ts`「增量 id 与全量 id 全局不冲突」（断言 before_ids 无交集 + 与全量重提取同 id）、「半行写入不丢记录」「完整末行无尾换行不重发」。
    - AC2 半行容错：`parse_grok_lines` 复用 + 游标回退行边界 + 未完成尾行驻留行首；半行 fixture 用例增量取回补全记录。
    - AC3 watcher 链路：`subscription-service.test.ts`「grok 增量推送 id 延续全量命名空间」断言推送 `["grok:2"]`（旧实现会得 `["grok:0"]` 判红），连跑 6 次稳定。
    - AC4 全量 id 格式不变：既有 `grok:0..N` 断言保留。
    - `pnpm test` 全量 2341 通过、typecheck、lint 通过。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL（t216_test_f001 轮询 flake，已修）
- Round 2 test：PASS（f001 消除，零新 finding）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

修复 grok 增量 id 与全量冲突（共享全局序号命名空间）+ 半行/尾行游标容错（回退重读、未完成驻留行首），历史窗口 watcher 增量不再丢新消息。2 轮 review 收尾 code PASS / test PASS，无遗留。

### 结果摘要

- 一句话；无额外说明可写「见上」
