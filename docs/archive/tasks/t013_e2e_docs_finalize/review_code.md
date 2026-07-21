# Task review T013

- task：`T013_e2e_docs_finalize`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 03:10 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T013_code_f001 — "录 61 responses" 硬编码数字依机器而变

- 严重度：suggestion
- 位置：`docs/guides/testing.md:44`
- 问题：录制流程 step 2 写 "录 61 responses 到 `tests/e2e/fixtures/data/responses.json`"。61 是 T010 当时本机实例数下的基线（见 T010 task_report `2 passed` 时录到 61）。实际 responses 数 = 1 (connectors) + N (per-instance state) + N (per-instance secrets) + 1 (config) + 1 (trend) + 4 (records/sessions/buckets/status)，随用户配置 instance 数变化。新机器跑 `pnpm e2e:gen-data` 录到不同数字会误以为脚本异常。
- 建议：改 "录全部 responses 到 ..." 或 "录 N responses（依本机 instance 数，T010 基线 61）"。非阻塞，纯文档清晰度。

## 交叉核对

### 1. CI 策略一致性（ci.yml 注释 / testing.md / ADR 008）

三处对 "web e2e 不 CI / CI 跑 vitest+packaged smoke / electron nightly" 表述一致：

- `.github/workflows/ci.yml:68-69` 注释：web e2e 不在 CI 跑 / CI 只跑 packaged smoke + vitest / electron nightly
- `docs/guides/testing.md:48-53` CI 段：web e2e 不进 CI / CI 只跑 `pnpm test` + `pnpm test:packaged` / electron nightly (Xvfb)
- `docs/blueprint/decisions.md` ADR 008 结论：CI 选 B（vitest 单元/集成 + packaged smoke 覆盖；electron nightly）

`ci.yml` 实际行为：`test` job 跑 `pnpm test`（vitest），`e2e` job 跑 `pnpm test:packaged`（packaged smoke），`nightly.yml` 跑 `pnpm test:e2e:electron`。文档与实际 workflow 全部对齐。✓

### 2. testing.md 三路 project 对照表 vs playwright.config.ts vs 目录

`playwright.config.ts:14-33` 定义三 project：`web`（`./tests/e2e/web`）/ `electron`（`./tests/e2e/electron`）/ `packaged`（`./tests/e2e/packaged`）。

`tests/e2e/` 实际子目录 `electron/` `web/` `packaged/` `fixtures/` `pages/` `global_setup.ts` 全部存在。

testing.md 第 57-61 行对照表三行与 config + 目录全部一致。✓

### 3. 录制流程 vs `scripts/e2e/gen_fixture.mjs`

- testing.md step 1 "启动 OmniUsage（packaged 或 `pnpm start`，读本机 `%APPDATA%/OmniUsage`，提供 local-api :17863）" — gen_fixture.mjs:14 `BASE = "http://localhost:17863"`、:49-52 check_health 先验证 :17863 在线，一致 ✓
- testing.md step 2 "`pnpm e2e:gen-data`" — package.json:32 `"e2e:gen-data": "node scripts/e2e/gen_fixture.mjs"`，一致 ✓
- testing.md step 2 "secrets 黑名单正则脱敏 `***`" — gen_fixture.mjs:33 `SECRET_KEY_RE = /(secret|password|token|cookie|key|bearer|credential)/i`、:40 `out[k] = "***"`，一致 ✓
- testing.md step 3 "chromium 驱动，`vite preview` 内嵌 `mock_api_plugin` 回放" — `playwright.config.ts:35-36` `webServer.command` 含 `vite preview`，T010 已落地 mock_api_plugin（T013 不动该层）✓

唯一数字静态化问题见 f001。

### 4. ADR 008 完整性 + T010 task_report 遗留衔接

ADR 008（`docs/blueprint/decisions.md:65-71`）字段完整：背景（说明 fixture gitignore + webServer 顶层污染）/ 选项（CI A+B、webServer A+B）/ 结论（CI 选 B、webServer 选 B）/ 替代（无）/ 遗留（synthetic seed fixture）。

T010 task_report 遗留 3 项中 2 项与本 task 相关：

- test_f003 CI fixture 策略 → ADR 008 CI 选 B 收口 ✓
- test_f004 webServer 顶层污染 → ADR 008 webServer 选 B 收口 ✓
- test_f002 trend query 覆盖 → T011 负责（ADR 007 遗留亦注明）

ADR 007（`decisions.md:90`）遗留三件，前两件（CI fixture / webServer）由 ADR 008 收口，第三件（trend）归 T011。衔接闭环。✓

### 5. handoff.md 格式与 head_commit

模板（`handoff.md:9-19`）要求 7 字段：日期/当前焦点/branch/head_commit/已完成/未完成/陷阱/下一步。

实际段（`handoff.md:21-41`）：

- `## 2026-07-21 02:50 UTC+8 from claude → next` ✓
- 当前焦点 / branch=`main` / head_commit=`a41cbad` / 已完成 / 未完成 / 陷阱 / 下一步 全部齐备 ✓
- head_commit `a41cbad` 与 `git log --oneline -5` 顶部 commit 一致（T012 specs/→electron/ + CI 引用同步）✓
- 段落只追加未改写历史 ✓

### 6. AGENTS.md `{test_cmd}` 引用 testing.md 一致性

`AGENTS.md:111` `{test_cmd}`：单元/集成/E2E/打包 smoke/契约 live 分层 → `docs/guides/testing.md`。

testing.md "运行命令" 段（第 7-17 行）含 `pnpm test` / `pnpm test:e2e:web` / `pnpm test:e2e:electron` / `pnpm test:packaged` / `pnpm test:contract:live` 全部分层命令，引用一致，T013 无需改 AGENTS.md。✓

## 结论

文档+代码维度无阻塞性问题。三处 CI 策略表述一致；三路 project 对照表与 playwright.config.ts 和实际目录一致；录制流程与 gen_fixture.mjs 实现对应；ADR 008 字段完整且衔接 T010 task_report 与 ADR 007 遗留；handoff 格式合模板、head_commit 准确；AGENTS.md `{test_cmd}` 引用无需改动。

唯一 1 条 suggestion（f001，"61 responses" 硬编码），非阻塞，采纳与否由 owner adoption 裁定。spec 四项验收标准全部满足。
