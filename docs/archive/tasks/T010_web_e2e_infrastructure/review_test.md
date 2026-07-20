# Task review T010

- task：`T010_web_e2e_infrastructure`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 02:15 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T010_test_f001 — 示范 spec 第二用例名 "mock data loaded" 名不副实，未验证数据链路

- 严重度：medium
- 位置：`tests/e2e/web/popup_theme.spec.ts:18-24`
- 问题：用例名 "app title renders (mock data loaded)" 与注释 "mock local-api 回放录的真实数据" 暗示验证 mock 数据加载链路。但 `src/renderer/views/PopupView.tsx:601` 的 `<span className="app-title">OmniUsage</span>` 是硬编码静态文本，不依赖任何 API 数据。`PopupPage.getTitle()` 读 `.app-title`.textContent 必返 "OmniUsage"。即使 mock_server 全部 404、SPA 没拉到任何 connector，用例仍通过。test 2 通过 ≠ 数据链路通。
- 验证：`grep app-title src/renderer/views/PopupView.tsx` → 硬编码 "OmniUsage"。
- 建议：(a) 改用例名为 "app title renders (React mounted)"，如实反映断言语义；或 (b) 改断言为依赖 mock 数据的元素，例如 provider card 数量应等于 `GET /v1/connectors` 返回的实例数（录的 responses.json 有 27 个实例，可断言 `locator('.provider-card')` 至少出现 N 个，N 来自 responses.json 计数）。T010 作为基础设施 + 示范 spec，(b) 留 T011 批量迁移时补亦可，但应在本 spec 或 task_report 中显式记录"示范 spec 未覆盖 provider card / 数据渲染"。

### T010_test_f002 — mock_server /v1/trend 忽略 query 参数，任意请求返回同一快照

- 严重度：low
- 位置：`tests/e2e/fixtures/mock_server.mjs:42-44`
- 问题：`find_by("GET /v1/trend?")` 前缀匹配录的唯一 trend 响应。SPA 若发不同 provider/accountId/metricId/days 组合也返回同一 JSON。可能掩盖 SPA 参数构造回归（如 T006 sparkline 调错 metricId，测试仍绿）。录制阶段 `gen_fixture.mjs:90-98` 只录了 `first_item` 一条 trend，覆盖面窄。
- 建议：(a) 录制阶段遍历 snapshot 所有 provider×account×metric 组合多录几条；或 (b) 在本 task 范围内接受现状（示范 spec 不依赖 trend，影响低），但需在本 review 记录，T011 迁移 trend 相关 spec 时评估。

### T010_test_f003 — fixture 在 .gitignore，CI 无法跑 web e2e；验收"pnpm test:e2e:web 跑通"非通用可复现

- 严重度：medium
- 位置：`.gitignore:17`（`tests/e2e/fixtures/data/`）+ `scripts/e2e/gen_fixture.mjs`
- 问题：fixture 含本机真实账号邮箱不入库（隐私正确），但带来两个副作用：
    1. CI 干净环境无 responses.json。`mock_api_plugin` 仅 warn 不 fail（`vite_mock_plugin.mjs:13`），SPA 实际走真实 local-api（CI 无桌面 app，全 404），示范 spec 第二用例因断言"app-title"仍过（见 f001），形成假绿；第一用例（data-theme）也不依赖网络，仍过。CI 看似绿实际没验证 web SPA 数据链路。
    2. 不同机器录制数据不同（账号数、provider 不同），测试若未来加数据依赖断言，跨机器不可复现。
- 建议：(a) 提供一份脱敏 synthetic seed fixture 入库（如 2 个假账号），专供 CI smoke；(b) 或在 task_report 显式声明"web e2e 仅本地可跑，CI 跳过 web project"，并加 playwright project grep 过滤（如 `--grep-invert @local`）。spec 验收标准未提 CI，但这是"日常 e2e"硬约束，应纳入遗留。

### T010_test_f004 — webServer 顶层配置，default/packaged project 跑时也会强启 vite preview

- 严重度：low
- 位置：`playwright.config.ts:34-39`
- 问题：`webServer` 放在 config 顶层，不是 web project 独占。跑 `pnpm test:packaged` 或 default project 时 Playwright 仍会先启 `pnpm build:web && vite preview --port 5174 --strictPort`，浪费时间；5174 被占时 `--strictPort` 让整个 packaged/default 测试阻塞失败。
- 验证：顶层 webServer 是 Playwright 官方语义，作用于所有 project，spec 未隔离。
- 建议：把 webServer 移入 `projects[0]`（web project）内部的 `webServer` 字段（Playwright 支持 project 级 webServer），或 default/packaged 显式 `dependencies: []` 解耦。T010 验收范围内可留，但应在 task_report 提及。

### T010_test_f005 — global_setup.ts 检查 out/web 冗余，仅打印日志无验证价值

- 严重度：suggestion
- 位置：`tests/e2e/global_setup.ts:7-13`
- 问题：web project 的 `webServer.command` 已是 `pnpm build:web && vite preview ...`，build 产物必然在；global_setup 检查 `out/web/index.html` 仅 `console.log`，不阻断不分支，纯日志噪音。`out/main/index.js` 检查同样是日志（沿用改动前行为，不在本 task 范围）。
- 建议：删 out/web 检查行（web project 自带 build 保证）；或保留日志但注释明确"仅提示，不阻断"。非阻塞。

## 结论

5 条 finding（1 medium 主要 / 1 medium CI / 3 low/suggestion）。验收标准 5 条在"本机已录制 fixture"前提下全部满足（gen-data 产出、gitignore、mock 全端点、test:e2e:web 2 passed、vitest 1407 passed 不破）。示范 spec 两用例本身能过，但：

- test 1（data-theme）断言合理，是期望行为非旧 bug；
- test 2（app title）**断言语义与用例名不一致**——硬编码文本不证明 mock 数据链路，这是本 task 最主要的测试缺口（f001）；
- mock 回放保真度对 SPA 渲染链路覆盖不足，仅证明 React 挂载，未证明 provider card / 数据渲染（f001/f002）；
- 录制 + 回放模式本机确定性 OK（快照固定），但跨机器、CI 场景不可复现（f003）；
- test_web fixture `goto "/#usage"` 经 `src/renderer/hooks/use-route.ts` hash 路由验证可靠。

建议本 task：f001 至少改名澄清语义（触代码改断言留 T011）；f003 在 task_report 遗留中记录 CI 策略；f002/f004/f005 留 T011/T012 评估。
