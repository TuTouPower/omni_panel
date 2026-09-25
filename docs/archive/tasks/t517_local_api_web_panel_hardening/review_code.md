# Task review t517（reviewer_focus: 代码）

- task：`t517_local_api_web_panel_hardening`
- spec：`docs/tasks/t517_local_api_web_panel_hardening/spec.md`
- diff_anchor：`02cdb642c5c5814a3a21593617ffc67573d8d952`
- target：`git -C '/Users/karson/kar/code/omni_panel_t517' diff 02cdb642c5c5814a3a21593617ffc67573d8d952`
- round：1
- reviewed_at：2026-09-25 18:25 UTC+8

reviewed_scope: b1659898056b569a

## Findings

Round 1 零 finding。

## 审计与总结

- 范围与变更审查：
  - `src/main/core/network/effective_proxy.ts`：实现代理 URL 合法性与协议白名单校验（仅接受 `http:`/`https:`/`socks5:`），拒绝畸变与非法协议输入并打印告警（A14 / AC-001）；
  - `src/main/core/network/proxy-pool.ts`：实现 `sanitize_proxy_url` 遮罩账密为 `***`，避免代理池日志打印明文密码凭据（A73 / AC-003）；
  - `src/main/core/local-api/server.ts`：
    - `read_json_body` 接入 `safe_json_reviver`，过滤 `__proto__`、`constructor`、`prototype` 彻底杜绝原型链污染（A17 / AC-002）；
    - 收敛 Web 面板 CSP 头为 `connect-src 'self'`，移除多余的 `ws:` / `wss:`（A19）；
    - 新增 `/v1/trend/bulk` 批量趋势端点，单次请求响应多指标全量历史，支持 GET / POST 双模调用（A116 / AC-006）；
    - 增加 `/v1/auth/grok_bot/logout` 路由处理，杜绝 Web 端假注销（A64）；
  - `src/web/usageboard-web.ts`：
    - 实现 `fetch_with_timeout` 为所有 LocalAPI HTTP 网络请求提供 15s 超时终止与网络错误反馈（A65 / AC-004）；
    - 监听 `visibilitychange` 事件，在页面后台/不可见时暂停 `tokenStats` 轮询，切回前台立即刷新（A66 / AC-005）；
    - `trend.getBulk` 迁移至 `/v1/trend/bulk` 单次批量端点，消除前端 fan-out 并发风暴（A116 / AC-006）；
    - `grok_bot.logout` 真实调用后端注销端点（A64）；
    - 封装并导出类型安全的 `build_query_string` helper（A97）；
  - `src/renderer/components/forms/WebLoginForm.tsx`：手动保存时记录错误日志并透传具体错误文案，避免吞为通用无意义提示（A54）；
  - 数据库参数化审计（A139）：全量查证 `server.ts` 所有查询均走 `ObservationStore`，所有底层 SQL 执行均已使用参数化绑定。
- 门禁与类型：`pnpm check`（tsc、eslint、prettier、knip、depcruise、vitest）全绿无报警。

### AC 复验方式

- AC-001：`verified`，查证 `effective_proxy.ts:7-14` 协议白名单校验，单测 `effective_proxy.test.ts:36-47` 通过。
- AC-002：`verified`，查证 `server.ts:251-257` 原型属性过滤，单测 `server.test.ts:9-29` 通过。
- AC-003：`verified`，查证 `proxy-pool.ts:17-28` 凭据脱敏遮罩，单测 `proxy-pool.test.ts:34-43` 通过。
- AC-004：`verified`，查证 `usageboard-web.ts:91-110` 15s 超时处理，单测 `usageboard-web.test.ts:825-842` 通过。
- AC-005：`verified`，查证 `usageboard-web.ts:200-216` 页面可见性监听与轮询暂停控制，单测 `usageboard-web.test.ts:844-874` 通过。
- AC-006：`verified`，查证 `server.ts:1701-1776` 与 `usageboard-web.ts:925-945` 批量趋势拉取，集成测试 `server.test.ts:2092-2144` 与单测 `usageboard-web.test.ts:807-823` 通过。

coverage = 6 / 6 (100%)

verdict: PASS
