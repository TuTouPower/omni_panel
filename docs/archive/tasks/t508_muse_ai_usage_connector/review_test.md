# Task review t508（reviewer_focus: 测试）

- task：`t508_muse_ai_usage_connector`
- spec：`docs/tasks/t508_muse_ai_usage_connector/spec.md`
- diff_anchor：`f31799f5d9611fd670e740115f38ee1b5895da25`
- target：`git diff f31799f5d9611fd670e740115f38ee1b5895da25`
- round：1
- reviewed_at：2026-09-25 07:35 UTC+8

## Findings

Round 1 零 finding。

## 结论

- 宏观全链路覆盖：
  1. 连接器沙箱解析（`muse_connector.test.ts`）：基于脱敏真实 RSC 数据，验证周期限额计算、额外额度提取与 HTTP 参数校验；
  2. 认证错误与负向路径：无 Cookie 抛错、会话失效 401 响应与 `is_auth_error` 判定；
  3. 添加账号交互与服务发现（`add_account_dialog.test.tsx`）：验证进入 WebLoginForm，点击登录调用 `session.login` 并精准透传 `cookie_names`；
  4. 主用量面板展示（`popup_view_muse.test.tsx`）：验证 Muse AI 顶部 Tab 栏、用量卡片、展开后周用量条（13%）与额外额度进度条（0%）、刷新交互及会话失效重新登录按钮；
  5. 调度器后台保活与自动重登（`refresh-service.test.ts`）：验证凭据失效时调度器自动调用 `sessionLogin` 隐藏窗口重登并在新凭据下重试成功；
- 全量自动化套件：`pnpm check`（0 error 0 warning）与全仓 325 套件（3938 测试）全部通过。
- 总体判断：PASS。

reviewed_scope: 63033ccb3ded8b68
verdict: PASS
