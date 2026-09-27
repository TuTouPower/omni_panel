---
tid: "t531"
slug: "empty_account_remark_fallback_display"
title: "添加账号未填备注时不设默认值并在展示层动态回退"
status: "done"
branch: "t531_empty_account_remark_fallback_display"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "1ca9764ef72877b68aea4ccbea7ceb0d1c9c43a6"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 修改 `AddAccountDialog.tsx` 及 `src/renderer/components/forms/`（`OAuthDeviceForm`、`GrokBotPkceForm`、`ExaServiceKeyForm`、`CpaMgmtForm`、`WebLoginForm`），当 `account_name` 为空或纯空白时传递空字符串 `""`，不再使用厂商名作为兜底默认值（AC-001/AC-002）。
2. 保留 `form_registry.tsx` 中本地 CLI 授权扫描到邮箱时的自动预填能力（AC-003）。
3. 修改 `use_connector_catalog.ts` 与 `SettingsView.tsx`，当 `account_name` 为空时不向插件配置写入 `displayName`。
4. 增强 `accounts_list.tsx`、`accounts_section.tsx` 与 `AccountRow.tsx`，当 `displayName` 未设置或为空时动态回退展示厂商名称，避免出现空白、undefined 或 `DeepSeek · DeepSeek` 冗余显示（AC-004）。
5. 补齐与更新单测，全量回归验证通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-27 15:52 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test` 全量 336 个测试文件、4125+ 测试用例全部通过；`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm deadcode`、`pnpm arch`、`pnpm build` 全部通过。
- 黑盒：Playwright web e2e 全量 95 个用例全部通过，验证表单交互与展示层动态回退正常。
- review：`docs/tasks/t531_empty_account_remark_fallback_display/review_general.md` Round 1 PASS，零 finding，`reviewed_scope: b4fabd55a65db395` 有效。
- AC 证据：见 `handoff.json`

### 结果摘要

- 成功去除添加账号未填备注时的厂商名兜底写入逻辑，保留本地 CLI 邮箱自动预填，并在展示层实现备注为空时的厂商名动态回退显示。全部 AC-001～AC-004 验收通过。
