---
tid: "t527"
slug: "fix_web_insecure_context_secure_apis"
title: "修复 web 面板非安全上下文 API 缺失导致的局域网白屏"
status: "done"
branch: "t527_fix_web_insecure_context_secure_apis"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "e5f5b86b12f4c42c34d43a2b323768b9ccd887ed"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 实现 `src/shared/lib/uuid.ts` 中的 `safe_random_uuid()`，在非安全上下文下 `crypto.randomUUID` 缺失时回退至 `crypto.getRandomValues`（RFC 4122 v4 UUID）与伪随机兜底。
2. 在 `src/web/usageboard-web.ts` 中将 `page_connection_id` 生成替换为 `safe_random_uuid()`，解决 `install_web_usageboard()` 同步抛错导致入口脚本中断、React 无法挂载的问题（AC-001/AC-002）。
3. 在 `src/renderer/components/AddAccountDialog.tsx` 中将 `generate_instance_id` 改用 `safe_random_uuid()`，解决 web 模式添加账号选择厂商抛错（AC-003）。
4. 在 `src/renderer/components/workspace/SelectionTray.tsx` 和 `WorkspaceView.tsx` 中增加 `typeof navigator.clipboard !== "undefined"` 守卫，与既有 `SessionCard`/`SessionPane` 对齐静默降级行为（AC-004）。
5. 在 `playwright.config.ts` 与 `vite.web.config.ts` 中配置直连代理与 host 解析映射 `omni-insecure.test`，新增 `tests/e2e/web/insecure_origin.spec.ts` 真实端到端验证非安全上下文加载（AC-005）。
6. 归档已由本 task 闭环的来源待办 `p262`（`docs/archive/pending/p262_web_insecure_context_secure_apis.md`）。
7. 执行中发现存量 3 个 web e2e 用例因 t493 简化标题为 panel 名而断言 "Omni Panel" 失败，按纪律不混入旁支修复，登记至 `docs/pending/todo/p264_web_e2e_app_title_assertion_drift.md`。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-27 15:15 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test`（336 test files, 4119+ tests passed）、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm deadcode`、`pnpm arch`、`pnpm build` 全部通过。
- 黑盒：`MOCK_FIXTURE=synthetic pnpm exec playwright test --config=playwright.config.ts --project=web tests/e2e/web/insecure_origin.spec.ts` 通过（验证非安全上下文 `isSecureContext=false` 下 `#root` 正常渲染且零 pageerror）。
- review：`docs/tasks/t527_fix_web_insecure_context_secure_apis/review_general.md` Round 1 PASS，零 finding，`reviewed_scope: 878d5ad29aa0c8fc` 有效。
- AC 证据：见 `handoff.json`

### 结果摘要

- 成功修复 web 面板在非安全上下文（LAN IP / 非 loopback 域名明文 HTTP）下 Secure Context 专属 API 缺失导致的白屏与交互崩溃。全部 AC-001～AC-005 验收通过。遗留存量测试断言漂移已建 `p264` 跟踪。
