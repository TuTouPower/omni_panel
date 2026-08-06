---
tid: "t231"
slug: "fix_web_e2e_fixture_divergence"
title: "修复本地默认 e2e:web fixture 与 account_error_badge 分叉"
status: "done"
branch: "t231_fix_web_e2e_fixture_divergence"
worktree: ""
review_level: "single"
diff_anchor: "b2d49b0bafa0087adbffc9f8a144484ebef630b7"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- 选择 spec 上下文区列出的候选修法：在 `account_error_badge.spec.ts` 内通过 `test.skip` 非 synthetic fixture 时跳过该用例。
- 验证时发现本地环境变量 `HTTP_PROXY`/`HTTPS_PROXY` 会干扰 Playwright `webServer` 的可用性检测（代理返回 400/502 导致 Playwright 误判端口已可用），在 `NO_PROXY=127.0.0.1,localhost` 且清空代理后 `pnpm test:e2e:web` 的 webServer 可正常启动。

## Review 处置

### Round 1 (2026-08-06 01:45 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：默认 fixture 下 `pnpm exec playwright test tests/e2e/web/account_error_badge.spec.ts --project=web` 该用例 skipped。
    - AC2：`NO_PROXY=127.0.0.1,localhost HTTP_PROXY= HTTPS_PROXY= MOCK_FIXTURE=synthetic pnpm test:e2e:web --grep "account error badge"` 该用例 passed。
    - AC3：`docs/guides/testing.md` 已区分 real/synthetic 命令，未做变更。

### Reviewer verdict

`single`：

- Round 1 general：PASS

### 结果摘要

`account_error_badge.spec.ts` 在默认 fixture 下 skip，在 `MOCK_FIXTURE=synthetic` 下执行并通过。
