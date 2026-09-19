# Task review t506（reviewer_focus: 代码）

- task：`t506_opencode_go_console_api_migration`
- spec：`docs/tasks/t506_opencode_go_console_api_migration/spec.md`
- diff_anchor：`2a34e0e50fca08c11d369facb07f13a962441912`
- target：`git -C '/Users/testuser/kar/code/omni_panel_t506' diff 2a34e0e50fca08c11d369facb07f13a962441912`
- round：Round 1
- reviewed_at：2026-09-20 05:05 UTC+8

## Findings

Round 1 零 finding。

## 结论

- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：OpenCode Go 连接器全面迁移至官方全新 Console REST API（/console/api/orgs, /console/api/usage/summary, /console/api/billing/status），彻底废弃旧版脆弱的 HTML 正则爬虫与 server-fn，登录凭据与探测对齐 \_\_Host-console_session，代码健壮规范。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，`connectors/opencode_go/manifest.json` 中声明 `login_url` 为 `https://opencode.ai/console/login`，`cookieNames` 包含 `__Host-console_session`。
- AC-002：`re_verified`，`src/main/index.ts:706` 探测优先校验 `/console/api/orgs`，回退支持 `/console/` 重定向，彻底解决登录关窗时丢 Cookie 问题。
- AC-003：`re_verified`，`connectors/opencode_go/connector.ts` 中完全移除 HTML 正则与 server-fn，直接调用 `/console/api/orgs` 获取 `org_id`。
- AC-004：`re_verified`，连接器带 `x-org-id` 请求 `/console/api/usage/summary`（24h/7d/30d）与 `/console/api/billing/status`，产出 rolling/weekly/monthly/balance 规范观测项。
- AC-005：`re_verified`，401/403 时抛出 `OpenCode 会话已失效，请重新登录`，触发通用会话保活流程。
- AC-006：`re_verified`，`tests/integration/connector/opencode_go_connector.test.ts` 全覆盖新接口，旧单元测试文件已删除。

coverage = 6 / 6 = 100%

reviewed_scope: f2c8542e273fca40
verdict: PASS
