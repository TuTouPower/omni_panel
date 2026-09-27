---
tid: "t532"
slug: "atomic_account_save_empty_remark"
title: "设置页编辑账号清空备注原子保存与闭包写回修复"
status: "done"
branch: "t532_atomic_account_save_empty_remark"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "1dbafa5858cee62fee3bd84949d4dc93f5e8e495"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 重构表单提交架构为单一保存事务（Single Submit Transaction）：`SettingsForm.tsx` 提取 `SaveAccountOptions`，将备注、参数、标签映射、隐藏标签及比例开关一次性打包交由 `onSave` 单次回调提交，消除提交后盲目无条件的级联写盘。
2. 备注输入框转为受控组件，确保清空操作即时反映且输入框状态与外部 props 变更可靠同步。
3. `SettingsView.tsx` 重构 `savePluginSettings`：优先基于 `configRef.current` 最新快照进行单次原子合并，彻底根治基于渲染快照陈旧闭包导致的二次覆盖写回 bug；彻底解除向 `AccountDialog` 传递的 3 个离散子保存回调。
4. `AccountDialog.tsx` 副标题在账号备注为空时动态回退展示厂商名。
5. 补强集成测试与单测：在 `settings_view_accounts.test.tsx` 补齐端到端真实交互测试，在 `settings_form.test.tsx` 补强单测与类型声明；按规则废弃依赖旧写盘覆盖缺陷的旧测试并以单次事务新语义测试替代。
6. 全量通过 338 个测试文件、4168 个用例（`pnpm test`）、`pnpm check` 7 段门禁与 95 个 web e2e Playwright 黑盒测试。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-27 19:40 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 7 段全量通过（338 个测试文件、4168 个用例通过；typecheck、lint、format:check、deadcode、arch、schema:check 全绿；git diff --check 零格式问题）。
- 黑盒：Playwright web e2e 全量 95 个用例全部通过（`pnpm test:e2e:web`）。
- review：`docs/tasks/t532_atomic_account_save_empty_remark/review_general.md` Round 1 PASS，零 finding，`reviewed_scope: b55fe0318f147092` 有效。
- AC 证据：见 `handoff.json`

### 结果摘要

- 成功消除设置页保存已有账号时因连续写盘及陈旧闭包写回导致的备注清空失效 bug。实现单一提交事务原子写盘与展示层空备注动态回退，补齐真实端到端集成测试与单测防线，闭环并归档 `p265`。
