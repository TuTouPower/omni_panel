---
tid: "t194"
slug: "popup_hide_not_destroy"
title: "popup 冷启动消除：关闭改隐藏不销毁窗口"
status: "done"
branch: "t194_popup_hide_not_destroy"
worktree: ""
review_level: "full"
diff_anchor: "bb31938d443e98df45c996839fea004249494109"
depends_on: ""
conflicts_with: ""
note: "P0"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

- 主进程：`open_or_toggle` / `hide` 改 `win.hide()`（AC1），`show_panel` 统一 popup 重锚定托盘；`close_for_mode_switch` 保留 close 语义（AC4）。floating 与 popup 分支合并为 `isVisible` 单分支（review f002）。
- renderer：`useNowTick` 增加 `document.visibilityState` 感知，隐藏期间停表、回可见立即刷新（AC3）。
- s010 spike：真实 Electron renderer+preload 验证 hide 后渲染进程保留、CPU/内存表现（report 见 `docs/spikes/s010_popup_hide_resource/`）。
- 测试踩坑：主面板 URL hash 是 `#usage` 而非 `#popup`（`getRendererUrl("usage")`），既有 e2e filter 恒不匹配——修正 filter 使断言变真实；`popup_collapse_persistence.spec.ts` 缺 config.json seed，`config-store` 的「目录存在但 config 缺失」P0 保护拒启——补最小 config.json。
- 既有 11 例 electron e2e 失败经 stash 验证与 t194 无关，登记 p038（`docs/pending.md`）。

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

### Round 1 (2026-08-03 21:30 UTC+8)

4 条 minor 全部已修。

| finding_id     | severity | status | rationale                                          | fix_ref                                                   |
| -------------- | -------- | ------ | -------------------------------------------------- | --------------------------------------------------------- |
| t194_code_f001 | minor    | 已修   | show_panel 重开前重新锚定托盘                      | src/main/core/main-panel/main-panel-controller.ts:179-188 |
| t194_code_f002 | minor    | 已修   | open_or_toggle 两分支合并为 isVisible 单分支       | src/main/core/main-panel/main-panel-controller.ts:191-198 |
| t194_test_f001 | minor    | 已修   | 补 visible→hidden 生产路径 transition 用例         | tests/unit/renderer/hooks/use_now_tick.test.ts:86-100     |
| t194_test_f002 | minor    | 已修   | e2e 重开用例追加面板内容可见断言（AC2 内容级证据） | tests/e2e/electron/tray_interaction.spec.ts:113-115       |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：AC1–AC4 满足；AC5 `[deploy]` 待人工签收
- 证据：AC1 unit（hide/toggle/reopen 复用窗口）+ e2e（tray hide 窗口保留、reopen 窗口数恒 1）；AC2 e2e 重开后内容可见 + unit 断言 `create_window` 仅一次；AC3 renderer unit（hidden 不推进、回 visible 立即刷新、visible→hidden transition）；AC4 既有模式切换用例保留 close 重建语义。s010 spike 实测 Windows hide 后渲染进程保留、内存 94.2MB 不变、3s CPU 增量为 0、show 复用同 webContents 且 load 计数不增。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

popup 关闭改隐藏不销毁 + renderer visibility 降级，AC1–AC4 达成，AC5 待人工签收。
