---
tid: "t104"
slug: "cpa_account_reset_bell"
title: "主面板 CPA 账号行补监控重置 bell"
status: "done"
branch: "t104_cpa_account_reset_bell"
worktree: ""
review_level: "full"
diff_anchor: "d1b3925e8acb449e3c6d9206dc5249a77c5f9380"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t104_cpa_account_reset_bell

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-25 开始 task。CPA 设置页「同步范围」的厂商 tag 按钮打开 `LabelMapDialog`；弹窗能按 raw_label 聚合多个 gateway 账号的数据标签映射，但缺少监控即将重置 bell。
- 2026-07-25 确认实现范围：在 CPA 数据标签映射弹窗补 bell；多账号同 raw_label 按 `LabelMapRow.account_keys` 全量切换 `upcomingResetWatched`。不改用量视图或概览聚合。
- 既有 `docs/tasks_index.json` 标题含已弃用术语；`scripts/task.py` 未提供标题修改操作，遵守索引仅能由该脚本修改的约束，未手工编辑。此 task 的新增文档与代码不使用该术语。
- 2026-07-25 双审 Round 2：code PASS；test 新增 `t104_test_f003`、`t104_test_f004`、`t104_test_f005`。已达到原 `max_review_round=2`，按流程转为 blocked。
- 2026-07-25 用户批准加轮，`max_review_round` 提升至 4；计数从 Round 2 累计，继续处置测试审阅 finding。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标撤回

### Round 1 (2026-07-25 02:57 UTC+8)

| finding_id     | severity  | status | rationale                                                                         | fix_ref                                                    |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| t104_code_f001 | important | 已修   | CPA 标签映射的监控状态读取、切换和持久化移至独立组件，`SettingsView` 仅保留挂载。 | `src/renderer/components/CpaLabelMapDialog.tsx`            |
| t104_test_f001 | important | 已修   | SettingsView 用例从部分账号已监控状态点击，断言两个 accountKey 均持久化。         | `tests/unit/renderer/views/settings_view.test.tsx`         |
| t104_test_f002 | important | 已修   | 组件用例断言未传监控回调时 bell 缺席。                                            | `tests/unit/renderer/components/label_map_dialog.test.tsx` |

### Round 2 (2026-07-25 03:09 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                   | fix_ref                                                                                                                      |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| t104_test_f003 | important | 已修   | `LabelMapDialog` 仅同时收到 `watched_metrics` 与回调时渲染 bell；CPA 包装组件始终透传空对象表示无已监控项。 | `src/renderer/components/{LabelMapDialog,CpaLabelMapDialog}.tsx`；`tests/unit/renderer/components/label_map_dialog.test.tsx` |
| t104_test_f004 | important | 已修   | 组件用例精确断言每个 bell 的 `title`。                                                                      | `tests/unit/renderer/components/label_map_dialog.test.tsx`                                                                   |
| t104_test_f005 | important | 已修   | 组件用例使用两个 raw_label，断言每行各渲染一个 bell。                                                       | `tests/unit/renderer/components/label_map_dialog.test.tsx`                                                                   |

### Round 3 (2026-07-25 03:22 UTC+8)

- 零 finding。code / test verdict 均为 PASS。

### Round 4 (2026-07-25 03:37 UTC+8)

- 零 finding。最终 lint 修正后的 code / test verdict 均为 PASS。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] CPA 数据标签映射弹窗每条 raw_label 行显示 bell。
- [x] 同 raw_label 的 gateway 多账号按全部 accountKey 聚合 bell 状态与切换。
- [x] 全未/部分监控点击 add；全已监控点击 remove，并持久化到 `upcomingResetWatched`。
- [x] 无回调的 `LabelMapDialog` 与直连账号入口不受影响。
- [x] renderer 单测覆盖组件与 SettingsView 持久化路径。
- [x] `pnpm test` 全量通过。

### Reviewer verdict

- Round 1 code：FAIL（`t104_code_f001` 已修）
- Round 1 test：FAIL（`t104_test_f001`、`t104_test_f002` 已修）
- Round 2 code：PASS
- Round 2 test：FAIL（`t104_test_f003`、`t104_test_f004`、`t104_test_f005` 已修）
- Round 3 code：PASS
- Round 3 test：PASS
- Round 4 code：PASS
- Round 4 test：PASS

### 遗留

- 无

### 结果摘要

- CPA 标签映射弹窗按 raw_label 渲染 bell；同标签多个 gateway accountKey 按全量状态聚合并原子地一并 add/remove。
- 验证：定向 renderer 74 passed；`pnpm typecheck`；`pnpm test` 158 files / 1635 tests；真实 Electron CPA 流程 1 passed。
