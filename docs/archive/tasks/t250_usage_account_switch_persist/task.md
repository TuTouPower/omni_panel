---
tid: "t250"
slug: "usage_account_switch_persist"
title: "用量面板账号切换与页签选择持久化"
status: "done"
branch: "t250_usage_account_switch_persist"
worktree: ""
review_level: "single"
diff_anchor: "fe7059e3b14f2b14d7bb68d4249f79bf63578f9f"
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

- 新增 config 键：`providerL2Open`（Record<provider, boolean>）+ `activeUsageTab`（string）。shared/types/config.ts + main/core/config/types.ts（zod）双端。
- `ProviderCard.tsx`：`l2open` 本地 state 改受控——props `l2Open` + `onToggleL2Open`，删除 useState/useEffect。折叠复位逻辑上移到父级。
- `ProviderOverview.tsx`：透传 `l2OpenProviders` + `onToggleL2Open`。
- `PopupView.tsx`：新增 `l2open_providers` state（t153 模式：prev ref + record_bool_equal 抑制回显）+ persist effect 写回 providerL2Open；`activeTab` 参照 t222 sparkline 模式（has_active_tab_pref_ref 防 mount 无条件写默认值）写回 activeUsageTab；`toggle_expand_provider` 折叠时强制复位 l2Open=false（原 ProviderCard 内部 effect 语义）。
- 测试：`popup_view_t250.test.tsx`（3 tests：AC2 activeUsageTab 恢复 / 默认 overview / AC4 回显不误写）；适配 `provider_card_overview`（受控化）与 `provider_card_label_map`（l2Open 传参）既有测试。
- 完整套件：240 files / 2584 passed / 8 skipped 全绿。

### Step 4（黑盒）

- `pnpm test`：2584 passed 全绿；typecheck + lint 通过。
- electron e2e：35 passed / 4 skipped / 0 failed。
- web e2e：popup_view 5 passed（手动 synthetic preview 起后）；webServer 自动启动在 Windows 失败为既有问题（t249 已登记 p075 类）。
- 打包 smoke：4 passed。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-08 01:20 UTC+8)

| finding_id    | severity              | status | rationale                                                                          | fix_ref                           |
| ------------- | --------------------- | ------ | ---------------------------------------------------------------------------------- | --------------------------------- |
| t250_gen_f001 | critical              | 已修   | activeTab 改 t153 prev ref 模式，config 无键时用户切换正常写盘                     | PopupView.tsx prev_active_tab_ref |
| t250_gen_f002 | critical              | 已修   | activeTab 补 prev ref 回显抑制；AC4 测试改真实 timers + wait_debounce              | PopupView.tsx / popup_view_t250   |
| t250_gen_f003 | important             | 已修   | 补 providerL2Open 挂载恢复 + 切换写回测试（多账号 fixture）                        | popup_view_t250.test.tsx          |
| t250_gen_f004 | important             | 已修   | 补折叠复位 l2Open 测试（f004 用例）；回显折叠路径差异接受（config 不一致配置罕见） | popup_view_t250.test.tsx          |
| t250_gen_f005 | minor                 | 已修   | config-schema 补 providerL2Open/activeUsageTab 接受/拒绝用例                       | config-schema.test.ts             |
| t250_gen_f006 | minor                 | 已修   | toggle_expand_provider setState 移出 updater 纯函数                                | PopupView.tsx                     |
| t250_gen_f007 | minor                 | 已修   | 结构裁剪处过滤 l2open_providers 过期 provider                                      | PopupView.tsx                     |
| t250_gen_f008 | minor（Round 2 新增） | 遗留   | 真实 timers + wait_debounce 引入 act 警告（断言无假通过风险）                      | p079                              |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1 由 popup_view_t250「providerL2Open 恢复多账号明细 + 切换写回」+ ProviderCard 受控测试；AC2 由「activeUsageTab 挂载恢复 + 无键用户切换写回」；AC3 由「config 无键默认 overview」测试；AC4 由「CONFIG_CHANGED 回显不写回」测试（wait_debounce 后断言）；AC5 由完整测试 2595 passed + electron e2e 35 passed + 打包 smoke 4 passed。

### Reviewer verdict

`single`：

- Round 1 general：FAIL（f001/f002 critical：activeTab 死锁 + AC4 测试恒真；f003/f004 important：providerL2Open 无测试 + 折叠复位断链；f005-f007 minor）
- Round 2 general：PASS（7 finding 全修；新增 f008 minor act 警告遗留 p079；follow-up t222 死锁 p078）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 用量面板选择持久化：providerL2Open（卡片概览/N账号）+ activeUsageTab（顶部页签）双键，t153 prev ref 回显抑制；修复 activeTab 死锁 critical；登记 p078（t222 同款死锁核查）+ p079（act 警告）。
