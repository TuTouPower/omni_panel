---
tid: "t539"
slug: "usage_popup_pin_toggle_fix"
title: "用量 popup 置顶解耦与跨 Space 托盘点击修正"
status: "done"
branch: "t539_usage_popup_pin_toggle_fix"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "c4599ec715df8b4f78906a90650ab7a99215c544"
depends_on: ""
conflicts_with: ""
note: "来源 p271；pin 只管层级不管收起 + toggle Space/focus 修正"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 红绿：先写 t539 新用例（AC-001/002/003）+ 改写 3 处旧语义断言，未改代码跑单文件：3 失败（blur 钉住仍豁免、toggle 失焦走 hide、helper 缺失），符合预期红；实现后 56 passed。
- 连带：toggle 焦点感知致 3 处旧用例（t495 宽恢复、t503 AC-005/提权恢复）走显示路径而失败，按同 Space 聚焦补 `win.focused = true` 保留原意图并注理由。
- `dock-badge.test.ts` 的 `WindowLike` 字面量因新增 `isFocused` 缺键被 typecheck 揪出，已补；全仓 typecheck/lint 过。
- 右键菜单接线（index.ts 真 `BrowserWindow`）按 spec「接线在 index.ts 则以行为单测覆盖」拆为控制器纯函数 + 源码哨兵用例。
- AC-004 `[deploy]` 真机走查未执行（需用户 mac 双 Space 环境），记 handoff 待办，不阻塞合入。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-30T19:28:00+08:00)

Round 1 零 finding（`review_general.md` verdict: PASS，review_scope=ok，coverage 3/4，AC-004 trust_prior 待用户真机走查）。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：AC-001/002/003 满足；AC-004 `[deploy]` 待用户真机走查
- 测试：`pnpm test` 341 passed | 1 skipped 文件、4293 passed | 8 skipped 用例；`typecheck` / `lint` / `format:check` / `md_format --check` / `deadcode` / `arch` / `schema:check` 全绿
- 黑盒：AC-001/002/003 为主进程控制器逻辑，CI 无真窗，按 spec 测试策略以控制器单测等价覆盖（`main_panel_controller.test.ts` 56 passed + tray 哨兵）；AC-004 需 mac 真机 `Command+Tab` + 双全屏 Space 手工走查，未申请弹窗类许可
- review：single 级，`review_general.md` Round 1 PASS 零 finding（scope ok）
- AC 证据：见 `handoff.json`

### 结果摘要

- pin 与收起解耦（3 处）、toggle 焦点感知反转、右键菜单同构修正、6 处旧断言按新语义更新、tray 接线哨兵、architecture/window-management 文档同步；遗留：AC-004 用户真机走查（p271 复现步骤）
