# p090 web e2e session_panel 既有失败：搜索统计行 + virtual list 大会话卡片（2026-08-08）

- 现象：`tests/e2e/web/session_panel.spec.ts` 搜索闭环用例断言 `9 个会话` 统计行未出现（fixture 无 `GET /v1/sessionStats`，统计显示「统计不可用」）；virtual list 三例（加载多页/向上翻页/大纲跳转）在会话库找不到「大会话虚拟列表」卡片。
- 影响：web e2e 会话面板关键路径部分失败，AC 验收被阻塞。
- 根因：`MOCK_FIXTURE=synthetic` 时 mock 全量 `/v1/*` 走 `synthetic.json`，fixture 缺会话库统计端点与虚拟列表会话标题；`page.route("**/v1/sessions")` Playwright glob 不匹配 query string，LARGE_SESSION 注入失效。
- 测试缺口：synthetic fixture 未覆盖会话库统计端点；mock_server 对 `/v1/sessions` 不实现 search/sources/order_by/limit/offset 过滤。
- 线索：`scripts/e2e/session_fixture.mjs` 生成脚本无「大会话虚拟列表」。
- 处理：t266（session_fixture 补 sessionStats、mock_server 补会话库过滤语义、route glob 改 `**/v1/sessions*`）
