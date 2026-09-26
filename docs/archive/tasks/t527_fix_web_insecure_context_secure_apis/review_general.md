# Task review t527（reviewer_focus: 通用）

- task：`t527_fix_web_insecure_context_secure_apis`
- spec：`docs/tasks/t527_fix_web_insecure_context_secure_apis/spec.md`
- diff_anchor：`e5f5b86b12f4c42c34d43a2b323768b9ccd887ed`
- target：`git diff e5f5b86b12f4c42c34d43a2b323768b9ccd887ed`
- round：Round 1
- reviewed_at：2026-09-27 15:15 UTC+8

reviewed_scope: 878d5ad29aa0c8fc

## Findings

Round 1 零 finding。

## 结论

- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：
    - AC-001：`src/shared/lib/uuid.ts` 实现 `safe_random_uuid`，在 `crypto.randomUUID` 缺失时回退至 `crypto.getRandomValues`（或伪随机），`install_web_usageboard()` 与 Web App 挂载正常，无异常抛出。
    - AC-002：`usageboard-web.ts` 改用 `safe_random_uuid()`，两个 bridge 实例生成的 `page_connection_id` 互不相同，保持跨 tab 唯一性。
    - AC-003：`AddAccountDialog.tsx` 中 `generate_instance_id` 改用 `safe_random_uuid()`，非安全上下文中点击厂商按钮无异常，正常进入 auth 步骤。
    - AC-004：`SelectionTray.tsx` 与 `WorkspaceView.tsx` 针对 `navigator.clipboard` 增加未定义守卫，行为与既有 `SessionCard` / `SessionPane` 保持一致，无同步异常。
    - AC-005：配置 `playwright.config.ts` 与 `vite.web.config.ts` 映射 `omni-insecure.test`，新增 `tests/e2e/web/insecure_origin.spec.ts` 真实验证非安全上下文（`isSecureContext=false`）下面板正常挂载且无 pageerror。
    - 门禁复验：`typecheck`、`lint`、`format:check`、`deadcode`、`arch`、`schema:check` 全部通过；全量 336 个测试文件（4126 passed）及 web e2e 实跑全部通过。
    - 范围控制：前序任务遗留的 web e2e 标题断言偏差如实记录至 `p264`，未做超范围顺手修改。
- 系统性 follow-up：`p264`（web e2e 标题断言偏移）

verdict: PASS
