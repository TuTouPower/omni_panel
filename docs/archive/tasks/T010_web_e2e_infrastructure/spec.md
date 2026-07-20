# Task spec

## 背景

T009 把 `tests/user_e2e` 改名为 `tests/e2e`，但 e2e 仍靠 Electron 驱动（开桌面 app）。用户要求：**日常 e2e 跑浏览器测网站，不开桌面 app**。Web SPA（`out/web`）数据全来自 local-api（端口 17863），故需造 mock local-api + 本机真实数据生成的 fixture，Playwright chromium 纯浏览器驱动。

## 范围

- **fixture 生成器** `scripts/e2e/gen_fixture.mjs`：检测 localhost:17863 在线（packaged/dev app 跑着）→ curl 录 local-api 全响应 → 导出 `tests/e2e/fixtures/data/responses.json`。脱敏用黑名单正则（`secret|password|token|cookie|key|bearer|credential`）递归替换字符串字段为 `***`（实测覆盖本仓库全部 secret 字段名）。
- **mock local-api** `tests/e2e/fixtures/mock_server.mjs`（导出 `create_mock_handler`）+ `tests/e2e/fixtures/vite_mock_plugin.mjs`（vite preview middleware 内嵌回放，单进程）。响应 SPA 调用全部端点（connectors/state 精确查 id/refresh/refreshAll/config/secrets 精确查 instanceId/trend/records/sessions/buckets/status）。
- **vite plugin middleware**（非 preview.proxy 双进程）：`vite.web.config.ts` 加 `mock_api_plugin`，preview server 内嵌 mock，单 server。
- **playwright web project**：`webServer` 启 `build:web && vite preview`；`web` project testDir `tests/e2e/web/`，chromium 驱动，baseURL 5174。
- **示范 spec**：搬 1 个纯 DOM spec（popup_theme）到 `tests/e2e/web/`，跑绿。
- **global_setup 实质化**：仅提示 out/main 状态（default/packaged 用），out/web 由 web project webServer 自带 build 保证。

## 非范围

- 不改 `src/` 运行时代码
- 不批量迁移 spec（留 T011）
- 不整理 electron project（留 T012）
- 不改 packaged smoke

## 验收标准

- [ ] `pnpm e2e:gen-data` 生成 `tests/e2e/fixtures/data/`（config + snapshot，不含明文 secret）
- [ ] `tests/e2e/fixtures/data/` 在 `.gitignore`（不入 git）
- [ ] mock server 响应全部 web SPA 调用端点，返回结构与 local-api 一致
- [ ] `pnpm test:e2e:web` 跑通示范 spec（chromium 驱动 out/web SPA，绿）
- [ ] `pnpm test`（vitest）不受影响

## 依赖与约束

- fixture 数据含本机真实账号邮箱--不硬编码进 spec 断言，泛化断言（非空/结构正确）
- secret 不导出明文：gen_fixture 读 secrets.json 仅取 instanceId 列表，value 用占位 `***`
