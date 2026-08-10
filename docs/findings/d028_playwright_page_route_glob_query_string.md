# d028 Playwright page.route glob 不匹配 query string（2026-08-08）

- 来源：t266
- 结论：`page.route("**/v1/sessions")` 的 glob **不匹配 URL query string**。会话库首屏请求实际为 `/v1/sessions?limit=50&offset=0`，该 route 不触发，注入数据失效。须以 `*` 收尾 `"**/v1/sessions*"` 匹配带 query 的请求。
- 证据：t266 virtual list 用例 `page.route("**/v1/sessions")` 注入 LARGE_SESSION 恒失效（卡片找不到），改 `**/v1/sessions*` 后通过。
- 影响：web e2e 用 page.route 拦截带 query 的接口时，glob 须以 `*` 收尾。
- 现状：有效
