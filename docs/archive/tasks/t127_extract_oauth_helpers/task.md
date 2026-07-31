---
tid: "t127"
slug: "extract_oauth_helpers"
title: "提取 grok/kimi OAuth 共享 helper 模块"
status: "done"
branch: "t127_extract_oauth_helpers"
worktree: ""
review_level: "full"
diff_anchor: "91992f535668d2544bb5db17242ef9a6bf7534c0"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t127_extract_oauth_helpers

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-26：完成 Layer 1 提取。`pnpm typecheck` 通过；`oauth_helpers`/`grok_oauth_manager`/`kimi_oauth_manager` 三个单元测试文件共 77 项全部通过。`pnpm test` 全量跑三次，均因不相关测试在并发下超时失败：
    - `tests/unit/scripts/task_py.test.ts` 的 `task.py finish transaction recovery` 单次超时（单独重跑通过）。
    - `tests/integration/config/secrets-store.test.ts` 多个 5s 超时（单独重跑通过）。
    - 另有一次 `tests/integration/vault/file-vault-backend.test.ts` 与若干 connector 测试超时，重跑也通过。
      这些失败与 OAuth helper 提取无关，属于已有 flaky 测试在 Windows 全量并发下的资源竞争问题。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-26 18:55 UTC+8)

Round 1 零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t127_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t127` 查，不在此记。

### 验收标准勾选

- [x] `src/main/core/auth/oauth_helpers.ts` 建立，包含 7 函数 + 8 类型 + 常量 + 统一 `load_tokens` / `store_tokens` / `compute_expires_at`
- [x] `grok_oauth_manager.ts` 与 `kimi_oauth_manager.ts` 各减少约 48 行，重复定义全部移除
- [x] `pnpm typecheck` 通过
- [x] 目标测试全绿（`oauth_helpers`/`grok_oauth_manager`/`kimi_oauth_manager` 共 77 项）；`pnpm test` 全量因不相关 flaky 测试并发超时失败，单独重跑均通过
- [x] grok / kimi OAuth 行为零变化（既有测试全部原样通过）

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 完成 Layer 1 提取：新增 `oauth_helpers.ts` 共享模块，`grok`/`kimi` manager 删除重复常量/类型/纯函数并改为 import；`OAuthLoginResult` 统一为超集版；新增 `oauth_helpers.test.ts` 覆盖 8 个 helper；typecheck 与目标单元测试通过。
