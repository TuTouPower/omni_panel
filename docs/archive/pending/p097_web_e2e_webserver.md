# p097 web e2e webServer 自动启动偶发失败（2026-08-09）

- 来源：t269 实施期 web e2e 冒烟
- 现象：`pnpm test:e2e:web` 的 playwright `webServer`（vite preview 5174）自动启动偶发失败，`page.goto` 报 ERR_CONNECTION_REFUSED；手动 `pnpm exec vite preview` 200 正常。
- 影响：web e2e flaky（非产品缺陷，t269 未改 web 代码/playwright config）。
- 根因：本机 `http_proxy/https_proxy=127.0.0.1:7890` 环境变量下，playwright webServer 探测走代理，对无服务的 `127.0.0.1:5174` 返回 400 而非 ECONNREFUSED，playwright 将 400 判为「已可用」→ 跳过启动 preview → 测试内真实请求直连 5174 无监听 → `ERR_CONNECTION_REFUSED`。代理变量存在时稳定复现（非偶发）；unset 代理后 probe 正常 ECONNREFUSED → 自动启动 webServer → 测试通过；`NO_PROXY` 无效（playwright probe 不读）。
- 测试缺口：web e2e 未约束代理环境；playwright.config 未对探测做代理隔离。
- 线索：修复方向——`playwright.config.ts` 顶层加载时删除 `http_proxy`/`https_proxy`/`all_proxy`（仅测试进程；web e2e 全 mock 无外网依赖，安全），或 `docs/guides/testing.md` 提示代理环境跑 web e2e 前 unset。
- 处理：t289
