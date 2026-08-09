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

### p102 t273 会话字号测试依赖源文本正则（2026-08-09）

- 来源：t273 test review Round 2 `t273_test_f001`（minor）
- 内容：`tests/unit/renderer/styles/session_typography.test.ts` 通过源文件文本正则验证 utility 类名，类名拆分或 utility 生成规则变化时存在假阳/假阴边界。
- 处理：未开

### p104 Linux packaged smoke 启动脚本使用 macOS 路径（2026-08-09）

- 来源：t274 打包验证
- 内容：Linux 上 `pnpm package` 已生成 `artifacts/linux-unpacked/omni_panel`，但 `scripts/package-and-run.ts` 的非 Windows 分支固定拼接 macOS `OmniPanel.app` 路径，导致包装启动阶段返回 `ENOENT`；直接使用 Linux 产物运行 `pnpm test:packaged` 可通过。
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

## p098 ui 组件视觉细节人工对照（2026-08-09）

- 来源：t269 review f006（minor，AC5 deploy）
- 内容：ui 组件库若干视觉细节需人工对照 DESIGN.md：Switch 尺寸/on 色、Button 字重/圆角、Badge 配色、MenuItem hover、SecretInput 显隐图标（当前 emoji）、Progress 粗细、Dialog 入场动画。实现已对齐 DESIGN 主体，细节属像素级对照。
- 处理：未开

## p099 ui 组件 computed 明暗抽查未实现（2026-08-09）

- 来源：t269 review Round 3 f009（minor）
- 内容：t269 spec AC3 要求「全部组件明暗主题下无需 dark: 即渲染正确（黑盒抽查暗色渲染）」。ui 组件未被应用消费（t270 起迁移），app 级 e2e 无法渲染；jsdom 不解析构建产物 CSS 变量，单测 computed 不可行。待 t270 迁移消费后补黑盒暗色抽查。
- 处理：未开

## p100 .ctx-overlay/.ctx-menu 死选择器（2026-08-09）

- 来源：t270 review Round 2 未进表提示
- 内容：globals.css `.ctx-overlay`/`.ctx-menu` 为死选择器（无 DOM 引用，anchor 提交亦无引用）——迁移前已存在的旧死代码，非 t270 残留。可随后续 CSS 清理删除。
- 处理：未开

## p096 cli e2e 项目继承全局 webServer（2026-08-09）

- 来源：t280 review Round 1 f005（minor）
- 内容：`tests/e2e/cli/cli_flow.spec.ts` 所在 cli 项目继承 playwright.config 全局 `webServer`（5174 vite preview mock），cli 测试自起 `--cli serve` 真实实例，不依赖 webServer；playwright 无按 project 关闭 webServer 的机制，vite preview 闲置启动（无害但多余）。future: playwright 支持 project 级 webServer 后可优化。
- 处理：未开

## p094 CLI 模式 import-config 回滚边界与 WSL apt 依赖清单（2026-08-09）

- 来源：t275 review Round 2 code 非阻断备注
- 内容：两处小项。(1) `import_config_file` 重复导入同一 plugin/param 且 config save 失败时，回滚会连旧 vault 值一并删除（概率极低，两态皆半初始化）；(2) `docs/guides/cli-mode.md` 未逐包枚举 Electron GUI 依赖（libgtk/libnss3 等），建议后续补 apt 包清单。
- 处理：未开

## p088 typecheck TS4111：local-api/server.ts 索引签名属性需 bracket 访问（2026-08-08）

- 来源：技术债自查（t261 实施期发现）
- 内容：`src/main/core/local-api/server.ts:323-325` 三处对索引签名类型属性用点号访问 `source` / `env` / `session_id`，TS4111 要求 `['source']` 等 bracket 形式。主仓与 worktree 均复现，`pnpm typecheck` 失败；文件不在 t261 diff 内，锚点 commit 已存在。
- 处理：未开

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

### p101 electron e2e 全量串行首窗口启动超时（2026-08-09）

- 来源：t272 test review Round 2 未进表提示
- 内容：完整 Electron 无头套件串行运行时，`popup_multi_display` 首用例与 `popup_collapse_persistence` 重启后首用例偶发 `electronApplication.firstWindow` 30s 超时；两文件隔离复跑通过。影响全量 e2e 稳定性，尚未定位根因，非当前 Agent 窗口 diff 路径。
- 处理：未开

## 不办

用户已显式确认暂搁的条目——「以后再说」，不是闭环。`task-from-pending` / `task-bug` 不自动捞本节；`repo-hygiene` 不迁 archive。

字段复用上方普通 / bug 模板，追加必填项：

- `- 暂搁：YYYY-MM-DD 决定不办的理由`：写清为什么现在不动（风险可控、排期靠后、等外部依赖等）。
- `- 处理` 固定写「不办」。

以下 9 条自 `docs/legacy_backlog.md`「暂不建 task（附理由）」节迁入（2026-07-31 对齐模板时迁移）；2026-08-01 复核后 8 条复活回「待办」节，1 条（p008）保留，2026-08-07 用户要求归档迁出。

统一几个面板的设计语言，主题色 强调色 背景色 辅助色 字体等等。

改成 tailwind css
有什么应该用框架但是没用的
