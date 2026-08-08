---
tid: "t270"
slug: "usage_tray_design_migration"
title: "用量面板与托盘菜单迁移到统一设计规范"
status: "done"
branch: "t270_usage_tray_design_migration"
worktree: ""
review_level: "single"
diff_anchor: "4c55468b0791cc6d6a39d0dc67bbbdb09802885d"
depends_on: "t269"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 迁移记录

| 组件                  | 迁移                                                                              | 说明                                |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| TitleBar              | icon-btn → ui/Button variant="icon" size="sm"                                     | 7 个 icon-btn 全替换                |
| EmptyState            | btn-primary → ui/Button variant="primary"                                         |                                     |
| SkeletonCard          | skel → ui/Skeleton                                                                | 布局类 card-head/skeleton-bars 保留 |
| NetBanner             | net-banner → 语义类（warning 色容器 + nb-action 语义）                            |                                     |
| provider_card_content | skel → ui/Skeleton                                                                | 用量面板卡片骨架                    |
| TrayMenu              | ctx-item → ui/MenuItem（danger/onSelect），毛玻璃 Menu；ci-check/ci-meta → 语义类 | tray-window/head/body 布局类保留    |

### 关键决策

- 布局机制类（scroll-inner/overview-grid/popup-mirror/container-type）保留——是动态高度报告/容器查询机制，非视觉 token，删除会破坏 offsetHeight 报告。
- btn-primary/ctx-item/ctx-sep/ci-ic CSS 定义已删除（迁移后无引用）；icon-btn/skeleton-bars/net-banner 保留（PanelTitleBar/SettingsView 等 t271 范围组件仍用）。
- 托盘 e2e 的 .ctx-item 选择器改角色定位（getByRole button 退出/Quit）。

### 验证

- 单测 2746 全绿（popup 23 + tray 2）；build 4 段通过；electron e2e popup 5 + tray 7 passed；迁移组件无 dark: 分支。

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

### Round 1 (2026-08-09 06:30 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                  | fix_ref                            |
| ------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| t270_gen_f001 | important | 已修   | 删死选择器：.skel/.skel.lbl/@keyframes shimmer（旧）/nb-action/.tray-window .ctx-item（迁移后无 DOM 匹配） | globals.css                        |
| t270_gen_f002 | minor     | 已修   | popup_page errorBanner 定位改文案（NetBanner 迁移后无 .net-banner）                                        | popup_page.ts                      |
| t270_gen_f003 | minor     | 已修   | TitleBar 非刷新按钮移除 .icon-btn class（仅刷新保留 spinning）；variant=icon 语义生效                      | TitleBar.tsx                       |
| t270_gen_f004 | minor     | 已修   | Skeleton 尺寸适配 skel-row 42px 轨道（w-16→w-10）                                                          | SkeletonCard/provider_card_content |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 功能行为不变：popup_view/tray_menu 单测 25 passed + electron e2e popup 5/tray 7 全过（迁移后真实渲染）
    - AC2 用量条双形态 + 风险阶梯配色未触及（usage-colors 文件无改动）
    - AC3 托盘菜单：迁移到 ui/Menu 毛玻璃 + MenuItem 危险项，托盘 e2e 7 passed
    - AC4 明暗无 dark: 分支（迁移组件 grep 空）
    - AC5 手写 CSS 删除：btn-primary/ctx-item/ctx-sep/ci-ic/skel/nb-action/tray-window .ctx-item 已删，grep 无残留（icon-btn/skeleton-bars/net-banner 保留因 t271 组件仍用）
    - 全量单测 2746 绿；build 4 段；electron e2e 全量 57 passed / 0 failed

### Reviewer verdict

`single`：

- Round 1 general：FAIL
- Round 2 general：PASS

### 结果摘要

- 用量面板 + 托盘迁移到 ui 组件库 + 语义 token：TitleBar/EmptyState/SkeletonCard/NetBanner/provider_card_content/TrayMenu 迁移，死 CSS 清理；行为逻辑与布局机制（动态高度/容器查询）保留。
