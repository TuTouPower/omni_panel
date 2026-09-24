# Task review t508（reviewer_focus: 代码）

- task：`t508_muse_ai_usage_connector`
- spec：`docs/tasks/t508_muse_ai_usage_connector/spec.md`
- diff_anchor：`f31799f5d9611fd670e740115f38ee1b5895da25`
- target：`git diff f31799f5d9611fd670e740115f38ee1b5895da25`
- round：1
- reviewed_at：2026-09-25 07:35 UTC+8

## Findings

Round 1 零 finding。

## 结论

- 代码完整覆盖 `connectors/muse/` manifest（`session` + `web_login` 声明）及 `connector.ts`（Next.js RSC Server Action 周期限额与额外额度抓取）。
- `host-io.ts` 与 `net-client.ts` 对称扩展 `post_raw` 能力，且将 `post_raw` 设为可选方法，不破坏既有存量测试与 mock。
- `WebLoginForm` 与 `AddAccountDialog` 支持 `cookie_names` 精准透传，确保会话登录窗口精确捕获 Muse 所需的 Cookie 集合。
- 会话凭据仅通过 Secret 管理，不入日志不入库；认证错误返回标准化失效提示，能被 `is_auth_error` 准确识别触发后台隐藏窗口自动重登。
- 注册面覆盖 `usageProviderSchema`、`PROVIDER_ORDER`、`PROVIDER_LABELS`、`ADD_COMMON_SERVICES` 与官方图标资源，无悬空引用。
- 总体判断：PASS。

reviewed_scope: 63033ccb3ded8b68
verdict: PASS
