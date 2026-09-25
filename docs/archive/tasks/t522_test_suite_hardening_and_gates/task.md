---
tid: "t522"
slug: "test_suite_hardening_and_gates"
title: "测试套件真实化加固、覆盖率基线与全局超时收紧"
status: "done"
branch: "t522_test_suite_hardening_and_gates"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "c91fd214f3df9fd27d9163cd5f53967b6d8bf8fc"
depends_on: "t509,t512,t514"
conflicts_with: ""
note: "审阅采纳项: A88-A92, A138, A141, A142"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

1. vitest.config.mts: 收紧全局超时至 15s（testTimeout, hookTimeout）；提升各覆盖率阈值至 50%。
2. refresh-service.test.ts: 代理断言精确匹配 ECONNREFUSED；并发刷新精确等式断言同实例为 1、异实例为 2。
3. opencode_go_connector.test.ts: 接入生产 status_for_pct / status_for_ratio 方法与边界断言。
4. grok_bot_auth_ipc.ts / test.ts: 补充非法 origin 拦截与空参数校验用例。
5. muse_connector.test.ts: 补充空 subscription 与异常 RSC 流容错用例。
6. auto-seed.ts / test.ts: 确保跳过交互式 connector（cpa_mgmt）自动创建空实例。
7. grok_bot_pkce_form.test.tsx & grok_bot_oauth_manager.test.ts: 覆盖取消与重入测试。
8. popup_view.test.tsx: 覆盖多卡共存与点击重新登录透传真实 instanceId 测试。

## Review 处置

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（包含 typecheck, lint, format:check, deadcode, arch, schema:check, test）全量通过。
- 黑盒：无 UI 窗口变更，无额外黑盒要求。
- review：single review PASS（Round 1），reviewed_scope 652b9723de7e18a6。
- AC 证据：见 `handoff.json`

### 结果摘要

- AC-001 ~ AC-004 全部达成，测试套件真实性加固，全局超时收紧至 15s，无死锁无挂起，覆盖率达标。
