---
tid: "t420"
slug: "ui_button_layer_adopt"
title: "按钮统一走 Button 组件层"
status: "done"
branch: "t420_ui_button_layer_adopt"
worktree: ""
review_level: "full"
diff_anchor: "7c71df8aa891467a3c61987309f8094a2f66a6e8"
depends_on: ""
conflicts_with: "t403,t405,t406,t407,t408,t409,t410,t413,t415,t418,t419,t421,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor：无
- Button 加法扩展：`variant=text`（accent 行内动作）、size `inline`/`icon`/`icon-md`/`icon-sm`/`icon-xs`（32/28/26/22）、`as="a"` 渲染原生链接；既有 primary/secondary/danger/ghost/icon + standard/sm 默认行为不变。
- 替换位点：provider_card_states×3、ProviderAccountRow 重登、SessionCard/SessionPane session-id、SessionPane 大纲/关闭 icon×2、SessionPreview 关闭、SessionRail 关闭、SelectionDock/Tray 移除、EmptyState/about as-link、AliasEditor secondary×2。
- 审计外但 AC-003 命中：NetBanner「重新连接」span onClick → Button text。
- SessionPane 审计写「icon 串复制 5 次」；现码仅 2 处（大纲/关闭），其余已先于本 task 收敛。PaneMessageRow 展开钮已不在（t408 范围）。
- AliasEditor secondary bg 从 field-bg 收敛到 surface-window（既有 secondary token）。
- 验证：`pnpm test` 3329 passed / 9 skipped；`pnpm typecheck` 绿；变更文件 eslint 绿（全仓 lint 有 4 条存量与本 diff 无关）。

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

### Round 1 (2026-08-16 06:10 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t420_code_f001|important|已修|session-id 钮补回原字号 text-[11px] / text-label-md|SessionPane.tsx / SessionCard.tsx|
|t420_code_f002|minor|已修|16px 移除钮 className 补 rounded|SelectionDock.tsx / SelectionTray.tsx|
|t420_test_f001|important|已修|键盘用例诚实化为语义 button + onClick 精确次数；可达性由 button 语义+AC-003 grep 承担|ui.test.tsx|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~003/005 由组件测 + 配方/span-onClick grep + 全量 `pnpm test`；AC-004 组件层字号/圆角已修，观感 [deploy] 目检保留

### Reviewer verdict

`full`：

- Round 1 code：FAIL（f001 字号 / f002 圆角）
- Round 1 test：FAIL（f001 键盘断言恒真）
- Round 2 code：PASS
- Round 2 test：PASS
- Round 3 code：PASS（仅 specs/findings 收尾，无代码变）
- Round 3 test：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- Button 扩展 text/icon 尺寸/as-link；审计手拼按钮与 NetBanner span 伪按钮收组件层；review 2 轮 PASS。
