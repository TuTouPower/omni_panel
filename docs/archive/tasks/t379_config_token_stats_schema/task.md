---
tid: "t379"
slug: "config_token_stats_schema"
title: "config tokenStats 字段 schema 缺失"
status: "done"
branch: "t379_config_token_stats_schema"
worktree: ""
review_level: "full"
diff_anchor: "7e2f7e2add166ad98028a07c8e95c0d883dbc39d"
depends_on: ""
conflicts_with: ""
note: "review_intensive: 类型有 schema 无 strip 丢失"
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

### Round 1 (2026-08-15 03:08 UTC+8)

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t379_code_f001 | important | 已修   | store 集成用例命中内存缓存假绿（load 返回 save 原对象不经 schema）：改新 store 实例冷缓存 load，mutation 敏感 | tests/integration/config/config-store.test.ts:911-932 |
| t379_code_f002 | minor    | 已修   | pollIntervalMinutes min(1) 严于类型：去 min(1) 对齐 number，历史越界值不再毁整份 config | src/main/core/config/types.ts:117-128 |
| t379_test_f001 | important | 已修   | 同上（test 轴复核冷缓存 mutation 敏感） | tests/integration/config/config-store.test.ts:911-932 |
| t379_test_f002 | minor    | 遗留   | AC-002 第二分句 build_token_stats_config 读取无直接覆盖（index.ts 未导出闭包，平凡属性访问，无独立失败模式） | p178 |

### Round 2 (2026-08-15 03:15 UTC+8)

- 复核：code PASS（f001/f002 消除，`.int()` 残留标 scope 外观察）；test PASS（f001 消除，f002 维持 minor）。两轴无新 finding。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001（schema 补 tokenStats，parse 保留）+ AC-002（store 冷缓存 save→load 保留）均列于 `handoff.json` 的 `ac_evidence`，mutation 双敏感

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 缓存假绿 + f002 schema 过严）
- Round 1 test：FAIL（f001 缓存假绿 + f002 minor）
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- appConfigurationSchema 补 tokenStats 子对象，strip 不再丢；45 测试全绿，code/test 双轴 2 轮 PASS。
