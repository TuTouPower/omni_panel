# Task report T010

本报告所在 commit 即 task commit，SHA 由 `git log --grep T010` 查，不在此记录。

## spec 验收标准勾选

- [x] `pnpm e2e:gen-data` 生成 `tests/e2e/fixtures/data/responses.json`（61 responses，含 config + 全 instance state + secrets + trend + tokenStats）。secrets 黑名单正则脱敏为 `***`（`cpa_mgmt_key` 等实测验证）。
- [x] `tests/e2e/fixtures/data/` 在 `.gitignore`（`git check-ignore` 验证；`git status` 不显示）。
- [x] mock 响应全部 web SPA 调用端点（对照 `src/web/usageboard-web.ts`：connectors/state/refresh/refreshAll/config/secrets/trend/records/sessions/buckets/status 全覆盖）；state/secrets 精确查 id（f003 修复）。
- [x] `pnpm test:e2e:web` 跑通示范 spec（chromium 驱动 out/web SPA，2 passed，268ms + 211ms）。
- [x] `pnpm test`（vitest）不受影响（138 files / 1407 passed）。

## adoption 处置摘要

- 已修 5 项 / 遗留 3 项 / 无需修改 2 项
- T010_code_f001 — 采纳：spec 脱敏描述对齐实现（黑名单）+ ADR 007
- T010_code_f002 — 采纳：spec proxy 描述对齐实现（vite plugin middleware）+ ADR 007
- T010_code_f003 — 采纳：mock state/secrets 改精确查 id，不再 fallback 首条
- T010_code_f004 / f005 — 无需修改（gitignore + 脱敏正则已验证）
- T010_test_f001 — 采纳：示范 spec 用例 2 改名澄清（React mounted）
- T010_test_f002 — 遗留：trend query 单条录制，T011 多录
- T010_test_f003 — 遗留：CI fixture 策略，T013 定
- T010_test_f004 — 遗留：webServer 顶层污染，Playwright 无 project 级 webServer，T013 评估拆 config
- T010_test_f005 — 采纳：global_setup 删 out/web 冗余检查行

## 遗留问题

- **CI web e2e**（test_f003）：fixture 含本机真实账号不入库，CI 干净环境无 responses.json，web e2e 跨机器不可复现。策略留 T013：(a) synthetic seed fixture 入库供 CI smoke，或 (b) `--grep-invert @local` 跳过 web project。
- **webServer 顶层**（test_f004）：跑 default/packaged 时也启 vite preview（浪费 5174 端口）。Playwright 无 project 级 webServer，拆独立 config 可解但超 T010，留 T013。
- **trend query 覆盖**（test_f002）：gen_fixture 仅录 first_item trend，mock 前缀匹配。T011 迁移 trend spec 时多录组合。
- **数据链路验证**（test_f001）：示范 spec 只证 React 挂载，provider card / 数据渲染由 T011 批量迁移 spec 覆盖。
