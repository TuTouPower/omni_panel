---
tid: "t517"
slug: "local_api_web_panel_hardening"
title: "LocalAPI 与 Web 面板契约与健壮性加固"
status: "done"
branch: "t517_local_api_web_panel_hardening"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "02cdb642c5c5814a3a21593617ffc67573d8d952"
depends_on: "t510"
conflicts_with: ""
note: "审阅采纳项: A14, A17, A19, A54, A64-A66, A73, A97, A116, A139"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

1. `effective_proxy.ts`：实现 URL 格式与协议校验，仅接受合法 `http:`/`https:`/`socks5:`，拒绝畸变协议（A14 / AC-001）。
2. `proxy-pool.ts`：新增 `sanitize_proxy_url` 遮罩账密为 `***`，避免明文密码落入日志（A73 / AC-003）。
3. `server.ts`：
    - 增加 `safe_json_reviver` 过滤 `__proto__`、`constructor`、`prototype` 避免原型链污染（A17 / AC-002）；
    - Web 面板 CSP 头收敛为 `connect-src 'self'`，移除多余 `ws:` / `wss:`（A19）；
    - 新增 `/v1/trend/bulk` 批量趋势端点支持单次拉取全部指标（A116 / AC-006）；
    - 增加 `/v1/auth/grok_bot/logout` 路由处理真实注销会话（A64）；
    - 全量审计底层数据库调用，均已使用参数化绑定（A139）。
4. `usageboard-web.ts`：
    - 实现 `fetch_with_timeout` 包装器为所有网络请求施加 15s 超时控制（A65 / AC-004）；
    - 监听 `visibilitychange` 事件在页面不可见时停止 `tokenStats` 轮询（A66 / AC-005）；
    - `trend.getBulk` 迁移至 `/v1/trend/bulk` 单次批量端点（A116 / AC-006）；
    - `grok_bot.logout` 真实调用后端端点（A64）；
    - 封装并导出类型安全的 `build_query_string` helper（A97）。
5. `WebLoginForm.tsx`：手动保存时记录错误日志并透传具体错误文案（A54）。

## Review 处置

### Round 1 (2026-09-25 18:25 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 全绿（331 files passed, 4059 tests passed, 8 skipped）
- 黑盒：全部 AC 可自动测试
- review：code PASS / test PASS（reviewed_scope: `b1659898056b569a`）
- AC 证据：见 `handoff.json`

### 结果摘要

已按审阅采纳项（A14, A17, A19, A54, A64-A66, A73, A97, A116, A139）完成 LocalAPI 契约加固、安全防御（原型链、CSP、日志脱敏、参数化）与 Web 面板健壮性重构（15s 超时、后台降频、批量趋势端点）。所有门禁与测试全部通过。
