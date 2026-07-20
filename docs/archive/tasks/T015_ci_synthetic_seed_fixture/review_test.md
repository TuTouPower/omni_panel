# Task review T015

- task：`T015_ci_synthetic_seed_fixture`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 14:35 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T015_test_f001 — testing.md CI 策略未同步 synthetic web smoke

- 严重度：medium
- 位置：`docs/guides/testing.md:49-58, 64`
- 问题：T015 在 CI 加 `MOCK_FIXTURE=synthetic pnpm test:e2e:web`（`.github/workflows/ci.yml:67-71`），但 testing.md "CI 策略" 段仍写：
    - 第 51 行："web e2e **不进 CI**（fixture 含本机真实账号 gitignore，CI 无 responses.json）。CI 只跑：vitest / packaged smoke"
    - 第 56 行："web e2e 作本地开发反馈，不作 CI 门禁"
    - 第 58 行："遗留：若未来要 CI web 回归，需造 synthetic seed fixture（脱敏假账号）入库供 CI smoke，见 ADR 008。"
    - 第 64 行三路对照表 web 行 "何时跑" 仅标 "本地日常"。
      实际状态：synthetic.json 已入库，CI 现跑 synthetic web smoke。文档与 CI 行为不一致，新开发者读 testing.md 会误判 CI 门禁范围。
- 建议：CI 策略段改为 "CI 跑 `MOCK_FIXTURE=synthetic pnpm test:e2e:web`（synthetic seed fixture 入库）+ vitest + packaged smoke"；删除第 58 行遗留条目（遗留已落地）；三路对照表 web 行 "何时跑" 加 "CI (synthetic) + 本地日常"。

### T015_test_f002 — synthetic 录制流程未在 testing.md 文档化

- 严重度：low
- 位置：`docs/guides/testing.md:40-47` 录制 fixture 段
- 问题：gen_synthetic.mjs 流程为 `e2e:gen-data` 录真实 → `e2e:gen-synthetic` 脱敏取前 3 instance → commit `tests/e2e/fixtures/synthetic.json` → CI 直接用入库 JSON。testing.md 第 40-47 行只描述 `e2e:gen-data`，未提 `e2e:gen-synthetic` 何时跑、synthetic.json 何时需重生成（如 connectors 列表 / provider 配置变化）。维护盲区：synthetic 过期后 CI smoke 仍绿，但已不反映当前真实 UI 数据结构。
- 建议：录制 fixture 段追加第 4 步："`pnpm e2e:gen-synthetic` → 脱敏前 3 instance 输出 `tests/e2e/fixtures/synthetic.json`（**入库**，供 CI smoke）；当 connectors 列表或 provider 集变化后需重生成并 commit"。

### T015_test_f003 — ADR 008 未追加 T015 落地状态

- 严重度：low
- 位置：`docs/blueprint/decisions.md:65-71`（ADR 008）
- 问题：ADR 008 结论 "CI 选 B（web e2e 不进 CI）"，第 71 行遗留 "未来若需 CI web 回归，造 synthetic seed fixture（脱敏假账号）入库供 CI smoke"——T015 已实现并落地该遗留，但 ADR 008 未追加状态更新。按 CLAUDE.md step 7 "收尾更新 blueprint（含 decisions.md 的非显然决策）"应同步。后人追溯 ADR 008 看不到"该遗留已在 T015 解决、CI 策略从 B 调整为 synthetic smoke"。
- 建议：ADR 008 末尾追加 "更新（T015, 2026-07-21）：synthetic seed fixture 已入库（`tests/e2e/fixtures/synthetic.json`），CI 增 web smoke step（`MOCK_FIXTURE=synthetic pnpm test:e2e:web`）；CI 策略从 B 调整为 'synthetic web smoke + vitest + packaged smoke'；本 ADR 遗留条目关闭"。

## 结论

验收标准 5 条逐条核对：

- synthetic.json 生成入库：✓（37.6K，1113 行；`git check-ignore` exit=1，未 gitignore；即将随 commit 入库）
- 无真实邮箱：✓（24 处邮箱全 `demo_*@example.com`，兜底正则无非 example.com 命中）
- `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 跑通：✓（上下文给定 21 passed；6 个 web spec：app_lifecycle 5 + popup_demo_alignment 3 + popup_platform_behavior 2 + popup_theme 2 + popup_view 5 + scheduler 4）
- ci.yml 加 web smoke step：✓（`.github/workflows/ci.yml:67-71`）
- `pnpm test` 不受影响：✓（上下文给定 vitest 全绿；改动仅 `mock_server.mjs` RESP_FILE 常量加 `MOCK_FIXTURE` 分支默认 real，vitest 不经此路径）

21 passed 覆盖度评估：数据链路非纯挂载。关键数据驱动断言：

- `popup_view.spec.ts:46` "main content area is rendered with overview tab" 断言 `providerTabs.count() > 0` 且 `getByRole("button", { name: /^CPA$/ })` `toHaveCount(0)`（CPA 过滤业务规则）——真实依赖 fixture snapshot.items 结构。
- `scheduler.spec.ts:19` "cards reach a terminal state after initial render" 断言 card 进入 `ready/failed/empty`——真实依赖 snapshot.items 驱动 card 状态机。
- `scheduler.spec.ts:10` "popup renders plugin cards from fixture data" 断言 `.card` 数 > 0——真实依赖 fixture snapshot.items。

对比 T010_test_f001 "只证 React 挂载" 时期，当前 web specs 在 CPA 过滤 / card 终态断言已超出挂载级，数据链路部分覆盖。其余用例（title visible、refresh clickable、theme attribute 等）仍是挂载级，但属 T010 遗留 popup_theme.spec.ts:18 注释 "数据链路由 T011 批量 spec 覆盖" 的历史标注，不在 T015 范围。

CI 可复现性：synthetic.json 入库为固定字节，CI Windows runner 取相同 JSON，跨机器一致；`playwright.config.ts:34-40` `webServer` 顶层会在 `test:e2e:web` 时自动 `build:web` + `vite preview`，CI 无需额外预构建。gen_synthetic.mjs 仅本地维护 synthetic 时跑（依赖 real responses.json，CI 不跑），流程合理。

3 条 finding 全部为文档同步问题（testing.md / ADR 008 / 录制流程文档），不涉及测试代码或 fixture 本身——测试代码与 fixture 本身满足 spec。
