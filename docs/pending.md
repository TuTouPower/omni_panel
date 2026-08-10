# 待办与不办总账

项目里「已知、还欠着」的事只在本文件登记：未修 bug、review 遗留、技术债、该做未做的需求，以及用户已确认暂搁的事项。分两节：「待办」放未闭环、待启动条目；「不办」放用户显式确认暂搁的条目。

- 三态划分：未闭环（「待办」节，`- 处理：未开`） / 已闭环（迁 `docs/archive/pending.md`） / 暂搁（「不办」节，`- 处理：不办` + `- 暂搁`）。
- 「不办」不等于闭环：条目整条留本文件「不办」节，不迁 archive；以后决定复活时移回「待办」节（`- 处理` 改回 `未开`、删 `- 暂搁`、保留原 `pNNN`）。
- 所有条目统一使用 `pNNN`，当前主总账（含「待办」「不办」两节）与归档总账共享一条递增序列，历史编号不复用。
- 新增条目前运行 `scripts/pending.py next`；更新已有条目或迁入归档时保留原编号。

## 待办

两种字段模板，按条目性质选一种；`- 处理` 字段未闭环写「未开」，闭环写 `{tid}` 或外部动作说明。

- 普通（需求 / 遗留 / 技术债）：`- 来源` / `- 内容` / `- 处理`。`- 来源` 写清出处：finding_id、原 tid、用户提出，或技术债自查。
- bug：`- 现象` / `- 影响` / `- 根因` / `- 测试缺口` / `- 线索` / `- 处理`。bug 由 `task-bug` 登记并完成根因与补测分析。

已验证的技术发现不属于待办，写 `docs/findings.md`。

## p089 popup_view_height.test.tsx 批量运行 2 条 act 警告（2026-08-08）

- 来源：技术债自查（t261 实施期批量跑 popup_view 8 文件发现；锚点基线复跑确认 pre-existing）
- 内容：批量运行 `tests/unit/renderer/views/popup_view_height.test.tsx` 出现 2 条「update not wrapped in act」警告，测试仍通过但疑似掩盖时序问题（疑似假绿）。单文件运行是否复现未单独验证；根因暂未定位。
- 处理：未开

## p091 synthetic.json 2-space 缩进脱离仓库 prettier 规范（2026-08-08）

- 来源：t266 review f002 遗留
- 内容：`tests/e2e/fixtures/synthetic.json` 由 `scripts/e2e/gen_synthetic.mjs` 以 `JSON.stringify(out, null, 2)` 生成（2-space），仓库 prettier 配置 tabWidth=4，`pnpm format:check` 对该文件恒 warn。锚点版本同样 warn，属既有状态非 t266 引入。改脚本生成缩进为 prettier 对齐会破坏「产物与脚本一致」的再生成约定，故不动。
- 处理：未开

## p092 local-api searchContent 断连测试未处理 AbortError（2026-08-08）

- 来源：技术债自查（t267 全量单测发现；t263 断连测试引入，t264 review 已提示）
- 现象：`tests/integration/local-api/server.test.ts`「POST /v1/sessionHistory/searchContent 客户端断连时中止底层搜索 (t263)」触发 `AbortError: This operation was aborted`（undici），Vitest 报 1 unhandled error（PromiseRejectionHandledWarning），测试本身通过。
- 影响：全量 `pnpm test` exit 1（vitest 把 unhandled error 记为失败），CI 门禁被触发。
- 根因：t263 断连测试 abort fetch 后，undici 的 rejection 在测试结束后的微任务才触发，`req.catch(() => {})` 虽捕获但 timing 上 rejected promise 被 vitest 计为 unhandled。
- 测试缺口：断连测试未在测试内 await 并稳定捕获 abort rejection。
- 线索：`server.test.ts` 断连用例 `await req.catch(() => {})` 后需额外 flush 微任务或改用 `vi.waitFor` 后显式断言；或服务端 handler 对断连 abort 时不 reject 响应 promise。
- 处理：未开

## p095 CLI 控制 restart e2e 泄漏 relaunch 进程（2026-08-09）

- 来源：t276 review Round 2 f005（minor）
- 现象：`tests/e2e/electron/cli_control.spec.ts` AC3 restart 测试，restart 端点 `app.relaunch()` 出的新进程无句柄回收，`finally` 只关原始句柄；跨 run 在 18811 堆积孤儿进程，EADDRINUSE 致 waitHealth 偶发失败。
- 影响：flaky 测试（非产品缺陷）；端口 18811 被孤儿进程占用。
- 根因：relaunch 脱离 playwright ElectronApplication 句柄，测试无法 close。
- 处理：未开

## p097 web e2e webServer 自动启动偶发失败（2026-08-09）

- 来源：t269 实施期 web e2e 冒烟
- 现象：`pnpm test:e2e:web` 的 playwright `webServer`（vite preview 5174）自动启动偶发失败，`page.goto` 报 ERR_CONNECTION_REFUSED；手动 `pnpm exec vite preview` 200 正常。
- 影响：web e2e flaky（非产品缺陷，t269 未改 web 代码/playwright config）。
- 根因：疑似 webServer command `pnpm build:web && vite preview` 偶发超时或 strictPort 竞态；未深究。
- 处理：未开

## p101 electron e2e 全量串行首窗口启动超时（2026-08-09）

- 来源：t272 test review Round 2 未进表提示
- 内容：完整 Electron 无头套件串行运行时，`popup_multi_display` 首用例与 `popup_collapse_persistence` 重启后首用例偶发 `electronApplication.firstWindow` 30s 超时；两文件隔离复跑通过。影响全量 e2e 稳定性，尚未定位根因，非当前 Agent 窗口 diff 路径。
- 处理：未开
