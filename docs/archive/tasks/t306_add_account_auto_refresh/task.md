---
tid: "t306"
slug: "add_account_auto_refresh"
title: "添加账号后自动采集该账号用量"
status: "done"
branch: "t306_add_account_auto_refresh"
worktree: ""
review_level: "single"
diff_anchor: "244419d4e0914d21549873e6a24658bd27edf6ed"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 根因确认：普通新建 `create_instance_and_save`（`use_connector_catalog.ts:67`）调 `savePluginSettings` 传 `refresh_after_save=false` 抑制刷新；复制路径 `handleConfigDuplicate` 落盘后仅 `onConfigSaved`（orchestrator reconcile 只处理 schedule 变化，不触发新实例立即采集）。
- 修复：普通新建参数 `false→true`（与编辑保存默认一致，savePluginSettings 内部 `refresh_after_save=true` 时 `trigger_background_refresh(instanceId)`）；`SettingsView.onDuplicate` 在 `duplicate()` 返回 `{ instanceId }` 后调 `trigger_background_refresh(result.instanceId)` 再关对话框。
- 测试：`use_connector_catalog.test.ts` 断言第 7 参改 `true`；`settings_view_accounts.test.tsx` 新增 2 条 UI 级用例（添加保存后 refresh(new instanceId)、复制后 refresh(duplicate instanceId)）。
- Review Round 2 指纹修复：Round 2 reviewer 复用 Round 1 prompt 致 reviewed_scope 过期（7279f661→5acc5f6345cbfcc6），修正后 overall=PASS。
- 验证：定向 19/19 通过；全量 `pnpm test` 2862 passed / 1 failed（存量 designmd，见 p142）/ 9 skipped；typecheck、lint 通过。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **仅有 minor（无 critical / important）**：Round 1 2 条 minor，处置见下表。

### Round 1 (2026-08-11 16:08 UTC+8)

| finding_id    | severity | status | rationale                                                       | fix_ref                                                                                                                                   |
| ------------- | -------- | ------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| t306_gen_f001 | minor    | 已修   | 恢复 it() 与 current_config 分行、补末尾换行                    | tests/unit/renderer/views/settings_view_accounts.test.tsx:241                                                                             |
| t306_gen_f002 | minor    | 已修   | 新增「添加账号保存后 connector.refresh(新 instanceId)」集成断言 | tests/unit/renderer/views/settings_view_accounts.test.tsx:「t306: new account save triggers background refresh for the created instance」 |

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
- 证据：AC-001 由 `use_connector_catalog.test.ts` 第 7 参 `true` 断言 + `settings_view_accounts.test.tsx`「new account save triggers background refresh」UI 断言覆盖；AC-002 由「triggers refresh for the duplicated instance after copy」UI 断言覆盖；AC-003 全量 `pnpm test` 通过（除存量 designmd drift，见 p142）。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：PASS（2 条 minor）
- Round 2 general：PASS（minor 复核真修，0 新 finding）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 添加/复制账号后自动触发用量采集完成：普通新建 `refresh_after_save=true`，duplicate 后触发新实例刷新；2 条 UI 级刷新断言 + 1 条参数断言；review 两轮 PASS。存量 designmd 失败见 p142。
