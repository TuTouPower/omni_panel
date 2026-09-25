---
tid: "t509"
slug: "popup_expand_fix_and_test_gate"
title: "Popup 展开缺陷修复与测试门禁恢复"
status: "done"
branch: "t509_popup_expand_fix_and_test_gate"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "a854c7bb355a887bf59a83e555e1c11638a743dd"
depends_on: ""
conflicts_with: ""
note: "审阅采纳项: A1, A2, A58, A59, A60"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 修复 PopupView.tsx 中 toggle_expand_provider 逻辑，区分 UpcomingResetCard（默认折叠）与常规 Provider（默认展开），使首次点击正常展开。
2. 修复 popup_view_height.test.tsx 与 popup_view_upcoming.test.tsx 断言，保持 Provider 默认展开语义，全仓单测全部恢复绿灯。
3. 修改 package.json 的 check 脚本，追加 pnpm test，并同步 conventions.md。
4. 增强 status_for_pct 防御（NaN/Infinity 返回 unknown），增强 provider-usage 失败占位 observedAt/updatedAt 语义，修复 format_reset_time 防御。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-25 10:18 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 与 `pnpm test` 全部通过（325 套件，3944 用例通过，0 失败）
- 黑盒：单元与集成测试全量验证通过
- review：Round 1 PASS（见 `review_general.md`）
- AC 证据：见 `handoff.json`

### 结果摘要

- 修复了 UpcomingResetCard 展开切换首次点击无效的翻转缺陷与相关 5 个失败测试。
- 将 `pnpm test` 纳入 `package.json` 的 `pnpm check` 完整门禁链。
- 修复了 `status_for_pct` 与 `format_reset_time` 对 NaN / 非法日期的防御。
- 规范了失败占位账号的时间字段语义。
