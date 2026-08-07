---
tid: "t251"
slug: "panel_window_bounds_persist"
title: "会话与代理面板窗口位置大小持久化"
status: "done"
branch: "t251_panel_window_bounds_persist"
worktree: ""
review_level: "single"
diff_anchor: "49c0ea008d4d5fb38d40e3d1655c0fa072a9b103"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### Step 1（前置）

- `{doctor_cmd}` 无独立命令。preflight PASS（无 SPIKE/警告）。

### Step 2/3（实现）

- 复用设置窗口先例（index.ts save_settings_bounds / apply_settings_bounds：displayId + 最小尺寸 + workArea 钳制）。
- 新增 config 键 `agentWindowBounds` + `historyWindowBounds`（复用 FloatingBoundsConfiguration 结构，shared + zod 双端）。
- 新增 `src/main/window/window-bounds.ts`：`compute_clamped_bounds` 钳制纯函数（displayId 失效回退主屏、最小尺寸提升、workArea 收缩/负坐标/超界钳制）+ `apply_window_bounds`（真实 screen）+ `watch_window_bounds`（move/resize 保存，值未变跳过防写放大）+ `get_saved_bounds`。
- index.ts `create_panel_window` helper：createWindowFor 后 apply 保存 bounds（无值 center），注册 move/resize 保存（scheduleSave thunk 防回退）。agent/history controller 的 create_window 改用之；两窗口 bounds 各自独立键。
- 测试：`tests/unit/main/window-bounds.test.ts`（11 tests：钳制纯函数 8 例——可见/负坐标/超右界/最小尺寸/超大收缩/副屏/displayId 失效/无 displayId；get_saved_bounds 3 例）。
- 完整套件：240 files / 2599 passed / 8 skipped 全绿。

### Step 4（黑盒）

- `pnpm test`：2599 passed 全绿；typecheck + lint 通过。
- electron e2e：35 passed / 4 skipped / 0 failed（完整套件偶发 plugin_config 失败为既有 p077 flaky，单跑 5 passed 含新 panel_window_bounds 1 + plugin_config 4）。
- 新增 `tests/e2e/electron/panel_window_bounds.spec.ts`：agent 窗口移动/调整大小 → 关闭 → 重开恢复 bounds（AC1）。
- 打包 smoke：4 passed（打包形态 bounds 保存/恢复 + 窗口创建正常）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-08 02:00 UTC+8)

| finding_id    | severity | status | rationale                                                        | fix_ref          |
| ------------- | -------- | ------ | ---------------------------------------------------------------- | ---------------- |
| t251_gen_f001 | minor    | 遗留   | AC2 会话窗口无独立 e2e；共用 create_panel_window 路径缓解        | p080             |
| t251_gen_f002 | minor    | 已修   | apply_window_bounds 注释改准确（仅无保存值返回 false）           | window-bounds.ts |
| t251_gen_f003 | minor    | 遗留   | 保存尺寸提升到 PANEL_MIN 但窗口未设 minWidth；与设置窗口先例一致 | p081             |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1 由 panel_window_bounds e2e（agent 移动/重开恢复）+ window-bounds 单测；AC2 由共用 create_panel_window 路径 + 双键独立（agentWindowBounds/historyWindowBounds）单测；AC3 由钳制纯函数 8 例（displayId 失效/负坐标/超界/副屏）；AC4 由无键 center 单测；AC5 由完整测试 2599 passed + electron e2e（单跑 5 passed 含新 spec）+ 打包 smoke 4 passed。

### Reviewer verdict

`single`：

- Round 1 general：PASS（3 minor：f001 AC2 无独立 e2e 遗留 p080、f002 注释已修、f003 minWidth 遗留 p081）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话/代理面板窗口 bounds 保存与恢复：复用设置窗口先例（displayId + 最小尺寸 + workArea 钳制），抽纯函数便于单测；agent/history 各自独立 config 键；登记 p080（AC2 e2e 缺口）+ p081（minWidth）。
