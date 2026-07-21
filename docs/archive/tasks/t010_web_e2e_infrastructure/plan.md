# Task plan

## 步骤与验证

1. 写 `scripts/e2e/gen_fixture.mjs`（读 %APPDATA%/OmniUsage/ 三个文件 → 脱敏导出）→ 验证：`node scripts/e2e/gen_fixture.mjs` 产 `tests/e2e/fixtures/data/{config,snapshot,secrets}.json`，grep 明文 secret 为 `***`
2. 加 `.gitignore` 条目 `tests/e2e/fixtures/data/` → 验证：`git status` 不显示该目录
3. 写 `tests/e2e/fixtures/mock_server.mjs`（Node http 响应全部端点，读 fixture）→ 验证：手动 curl 各端点返回 200 + 结构正确
4. `vite.web.config.ts` 加 `preview.proxy`（`/v1` → `http://localhost:17864`，mock server 端口）→ 验证：vite preview 启动后 `curl localhost:5174/v1/connectors` 返回 fixture 数据
5. 写 `tests/e2e/fixtures/test_web.ts`（Playwright fixture，暴露 `page`，baseURL 由 project 提供，无 Electron 启动）
6. `playwright.config.ts` 加 `webServer`（并行启 mock + vite preview）+ `web` project（testDir tests/e2e/web，use.baseURL）
7. 搬 `specs/popup_theme.spec.ts` → `web/popup_theme.spec.ts`，改 import `test.ts` → `test_web.ts`，改 fixture `omni` → `page`（chromium Page 直接）
8. `package.json` scripts：`e2e:gen-data`、`test:e2e:web`（前置 `pnpm build:web && pnpm e2e:gen-data`）
9. `pnpm test:e2e:web` 跑绿；`pnpm test` vitest 不破

## 风险与回退

- 风险：fixture 含本机真实邮箱/provider → spec 断言不硬编码具体值，用泛化断言（`.card` count > 0、account label 非空）
- 风险：mock 端点遗漏 → 对照 `usageboard-web.ts` 调用面逐个覆盖（已摸清 9 类端点）
- 风险：vite preview proxy 不生效 → `preview.proxy` 非 `server.proxy`；若仍不生效改用 mock 作 vite plugin middleware
- 回退：删 `tests/e2e/web/` + mock_server + gen_fixture + webServer config，回到 Electron 驱动

## Finalization 时更新的 blueprint

- 无（架构未变，仅测试基建）
