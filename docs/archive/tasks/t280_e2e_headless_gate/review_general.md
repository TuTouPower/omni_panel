# Task review t280（reviewer_focus: 通用）

- task：`t280_e2e_headless_gate`
- spec：`docs/tasks/t280_e2e_headless_gate/spec.md`
- diff_anchor：`8a96dc73d32a160d00acbc6d1e64837cef956e14`
- target：`git diff 8a96dc73d32a160d00acbc6d1e64837cef956e14`
- round：1
- reviewed_at：2026-08-09 03:00 UTC+8

## Findings

### t280_gen_f001 - 门控不完整：controller 层 `show()` 未门控，headless 下窗口仍弹出（AC1 未达成）

- 严重度：critical
- 锚点：AC1「E2E_HEADLESS=1 跑 electron 项目全程无窗口弹出（进程无可见窗口）」；契约区范围「app 侧窗口工厂（window-manager / 各 controller / 托盘菜单窗）在该变量下以 show:false 创建窗口（窗口存在可测但不弹屏）」
- 位置：门控仅落在 `src/main/window/window-manager.ts:153,210`；未门控的 `show()` 调用点：`src/main/core/main-panel/main-panel-controller.ts:186,222`、`src/main/core/main-panel/agent-window-controller.ts:45,57`、`src/main/core/main-panel/history-window-controller.ts:59,90`、`src/main/index.ts:750,1126`
- 问题：`is_e2e_headless()` 只改了 window-manager 创建时的初始 `show:false` 与 `showWhenReady` 跳过。但各窗口 controller 在创建后无条件调用 `win.show()/target.show()`：主面板启动路径 `index.ts:848 → main_panel_controller.open_or_focus() → show_panel() → target.show()`；agent/history/settings/tray 打开路径同理。因此 E2E_HEADLESS=1 时：启动即弹主面板，打开 agent/history/settings 亦弹窗，「全程无窗口弹出」不成立。实测（基于含 t280 门控的构建产物 `out/main/index.js` 02:11，启动 `E2E=1 E2E_HEADLESS=1`）：DISPLAY :0 上存在已映射的 701x347 顶层窗口（xwininfo 枚举），即窗口可见。spec 三试例的「仅 headed」理由（「show:false 无可见窗口」「getBounds 需窗口实际显示」）基于该前提，与实测矛盾——三试例在 headed xvfb 无 WM 下同样失败，属环境固有，非门控掩盖。
- 建议：门控需同时覆盖 controller 层 show 语义——方案 a：在 `main-panel-controller` / `agent-window-controller` / `history-window-controller` 与 index.ts settings/tray 的 show 调用处加 `is_e2e_headless()` 短路（窗口仍创建可测，仅不 show）；方案 b：把「不弹屏」收敛为一个主进程侧开关（如 window-manager 暴露 `should_show()`），各 show 点统一走它。AC1 的「窗口枚举无可见窗口」需补一条自动断言（可按 spec 可测试性声明所述），否则该 AC 无法自证。

### t280_gen_f002 - cli 项目「配置读取」核心链路未真实断言（health 不等于配置生效）

- 严重度：important
- 锚点：AC3 核心链路「（面板加载、dashboard 数据、配置读取）」
- 位置：`tests/e2e/cli/cli_flow.spec.ts:160-162`
- 问题：注释声明「配置读取（导入的空配置生效）」，但只断言 `GET /v1/health` 200。health 是存活探针（`server.ts:593`），不反映配置导入内容是否生效——即使 `--config` 导入被丢弃、language 未落盘，该断言仍通过。真实的配置读取端点 `GET /v1/config` 存在（`server.ts:895-897`，`config-ipc.ts:76 handleConfigGet` 返回含 `language` 的配置），测试未调用。即「配置读取」链路在 AC3 中声明却无可观测断言（间接仅验证了「坏配置会中止启动 → health 不可达」的可读性，未验证生效性）。
- 建议：补 `GET ${url}v1/config` 并断言返回中 `language === "zh-Hans"`（导入的空配置）或 `plugins.length === 0`，使导入内容生效成为真实断言。

### t280_gen_f003 - cli 项目硬编码端口 18860

- 严重度：minor
- 锚点：无 AC（稳健性）
- 位置：`tests/e2e/cli/cli_flow.spec.ts:73`
- 问题：端口写死 18860。前次失败 run 遗留的孤儿实例占用该端口时，`waitHealth`（`cli_flow.spec.ts:46-60`）会连到孤儿实例，随后本进程因 EADDRINUSE 无法绑定、stdout 无 `listening on`，URL 正则失败 → 测试报错（失败形式令人困惑，但不会静默假过）。与已知孤儿进程问题（blueprint 引用 p095）同类。
- 建议：启动前检测 18860 占用并失败前置（清晰报错），或使用每次 run 随机端口并把 `--port` 传下去（此处需同步解析实际监听端口，`index.ts:549-552` 支持 `--port` 覆盖）。

### t280_gen_f004 - 会话登录窗口未纳入门控（契约范围「各 controller」覆盖不全）

- 严重度：minor
- 锚点：契约区范围「app 侧窗口工厂（window-manager / 各 controller / 托盘菜单窗）…以 show:false 创建窗口」；AC1
- 位置：`src/main/index.ts:622-633`
- 问题：session manager 的 `create_window` 回调创建登录窗口（520x720）时未传 `show`，默认 `show:true`，且不在 window-manager 门控内。当前无 e2e 用例触发 OAuth 登录流程，故 AC1 现行观测不受影响（无窗口在测试中创建）；但一旦未来测试点击「开始登录」或手动 headless 登录，该窗口会弹出。
- 建议：登录窗口创建处按 `is_e2e_headless()` 传 `show:false`，或在 spec 明确其为范围外。同 f001 一并处理可复用一个 show 开关。

### t280_gen_f005 - cli 项目继承全局 webServer（与测试无关的耦合）

- 严重度：minor
- 锚点：无 AC（效率/稳健性）
- 位置：`playwright.config.ts:43-49`
- 问题：`webServer` 为全局配置，`--project=cli` 运行时 Playwright 会照常执行 `pnpm build:web && vite preview`（5174 端口）。cli 测试只访问真实实例（18860），不访问 5174；若 web 构建失败或 5174 被占，整个 cli run 会被无端中止。副作用：webServer 的 build:web 恰好保证了 `out/web` 供 CLI 实例服务，故非纯浪费。
- 建议：评估是否可接受该耦合；若在意，可在 spec/文档标注 cli 项目启动依赖 web 构建，或后续支持 per-project webServer 时解除。

### t280_gen_f006 - 面板加载断言偏浅（`#root` 为静态节点，未验证 SPA 挂载）

- 严重度：minor
- 锚点：AC3 核心链路「面板加载」
- 位置：`tests/e2e/cli/cli_flow.spec.ts:146-150`
- 问题：`page.goto(url)` 后 `waitForSelector("#root")` 命中 `src/web/index.html:10` 的静态 `<div id="root">`，与 React 是否实际挂载无关；`expect(response?.status()).toBeLessThan(500)` 只保证服务端返回 <500。故「面板加载」仅验证到「服务端提供 SPA shell」层面，renderer JS 崩溃/空白页时测试仍通过（dashboard 200 走直连 HTTP，不经过页面）。
- 建议：改为等待 SPA 挂载后的实际内容（如 `.app` 容器或页面特有文本），使「面板真实加载」成为可观测断言。

## 结论

- 前轮 finding 复核：Round 1 无前轮。
- 本轮新发现：6 条（1 critical、1 important、4 minor）
- 未进表的提示：spec 上下文区「未知契约清单」已无 UNVERIFIED 残留（triage 结论与 cli URL 捕获均已转为已验证）；`is_e2e_headless()` 测试侧（`fixtures/test.ts:26`）只查 `E2E_HEADLESS`、app 侧查双条件，electron fixture 恒置 `E2E=1`，两轮实际一致，未出 finding。
- 总体判断：门控本体的验收 AC1 未达成——controller 层 show() 未门控，headless 下窗口实测仍弹出；cli 项目「配置读取」链路缺真实断言。存在未解决 critical + important，FAIL。
- 系统性 follow-up：建议 follow-up 标题「e2e headless 门控覆盖 controller 层 show() 与 AC1 可见窗口自动断言」，slug `e2e_headless_controller_show`，阻断性 blocking（同 f001 处置后可关闭）。

verdict: FAIL

## Round 2 (2026-08-09)

复核基准：当前工作区代码 + `git diff 8a96dc73d32a160d00acbc6d1e64837cef956e14`；实证以实跑为准（electron headless 全量 + cli 项目实跑 + 定向 xwininfo/HTTP 复现）。

### 逐条复核结果

- **t280_gen_f001（critical）已修**。门控扩展至全部 show() 调用点：main-panel-controller.ts:188,224、agent-window-controller.ts:47,59、history-window-controller.ts:61,92、index.ts:754（settings）、index.ts:628（session 登录窗 `show: !is_e2e_headless()`），window-manager.ts:153,210（show/showWhenReady）。实证 AC1：`E2E_HEADLESS=1 pnpm test:e2e:electron` 实跑 54 passed / 8 skipped / 0 failed（exit 0）；跑动中 xwininfo 枚举 DISPLAY :0 全部 app 窗口（Usage/Agent/Settings）Map State 均为 IsUnMapped——无可见窗口成立。
- **t280_gen_f002（important）已修**。cli_flow.spec.ts 补 `GET /v1/config` 断言 `config.language === "zh-Hans"`、`config.plugins === []`。定向复现（同 launch 参数 + `--config` 导入）返回 200 `{"config":{"language":"zh-Hans","plugins":[],...}}`——导入配置确实生效。
- **t280_gen_f003（minor）已修**。端口仍固定 18860，但补 quit 兜底：测试 2「实例在测后干净退出（quit 控制）」POST `/v1/control/quit` 后断言 health 不可达（实跑 1.1s passed），closeApp 另有 kill 兜底。注：处置表 rationale 措辞自相矛盾（「改动态随机端口」vs「保留 18860」），实际代码为保留 18860，属措辞问题非功能问题。
- **t280_gen_f004（minor）已修**。session 登录窗创建 `show: !is_e2e_headless()`（index.ts:628）；session-manager.ts 全程无 `.show()` 调用，可见性仅由创建 show 决定。
- **t280_gen_f005（minor）遗留 → p096**。docs/pending.md「待办」已登记 p096（2026-08-09，来源 t280 review Round 1 f005），fix_ref 指向正确。
- **t280_gen_f006（minor）已修（断言已改，但暴露新问题，见 f007）**。`#root` 改 `#root > *`（cli_flow.spec.ts:164）。但实跑 cli 项目：断言确定性失败——`page.goto(url)` 对 `/` 返回 401 `{"error":"Unauthorized"}`，SPA 从未被服务，故「面板加载」链路实际未通。

### Round 2 新增 finding

- **t280_gen_f007（important，阻断 cli 项目）** cli 项目 e2e test 1 确定性失败，AC3「面板加载」链路未满足，且与 spec.md「cli 项目 e2e 2 passed」声明矛盾（实跑 1 failed / 1 passed）。
    - 复现：`pnpm test:e2e:cli` → test 1 在 `waitForSelector("#root > *")` 超时（error-context 页面快照为 `{"error":"Unauthorized"}`）。定向复现（与 launchCliWithConfig 相同参数，`electron out/main/index.js --cli serve`）：`GET /` → 401；`GET /v1/config`、`/v1/dashboard` → 200 正常。
    - 根因：dev 下 `web_root_path = join(app.getAppPath(), "out", "web")`（index.ts:542-544）。electron 以文件参数启动时 `app.getAppPath()` 返回入口文件所在目录 `<ROOT>/out/main`，web_root 解析为不存在的 `<ROOT>/out/main/out/web` → `existsSync` 为 false → `web_root` 未传 → server.ts:599 静态服务分支跳过，`/` 落入 `check_auth` → 401。用 `electron .`（应用目录，cwd=ROOT）启动则 `GET /` 返回 200 完整 SPA HTML（定向复现验证）。
    - 影响：f006 改严的断言正确暴露了既有缺陷（t275 遗留，非 t280 门控引入），但 cli_flow 的面板加载断言在当前形态下无法通过，AC3 不成立。修复可选：cli_flow 以应用目录启动（`args: [".", "--cli", "serve", ...]` + cwd ROOT），或修正 web_root 解析（如 `resolve(__dirname, "../web")` 与 rendererIndexPath 一致）。

### 未进表提示

- `maybe_show()`（e2e-headless.ts:16）导出但全库无引用（controller 用内联 `if (!is_e2e_headless())`），属 t280 新增死代码，建议删除。
- spec.md「仅 headed 清单」正文「其余 spec headless 下全绿（55 passed）」已过期：加 tray skip 后实跑为 54 passed / 8 skipped（62 用例；tray 由 passed 转 skipped）。清单表格本身（含 tray_interaction）已更新，仅该数字过时。
- triage 清单核对：spec「仅 headed 清单」4 条与实跑 skip 一致（panel_window_bounds 2 + panel_window_controls 1 + tray_interaction 1），其余 skip 为既有（token panel 3 + multi-display 1），8 skipped 与代码断言匹配。

### Round 2 总体判断

AC1 已达成（headless 全量 0 failed，全程无可见窗口，f001-f004 处置验证通过，f005 已登记 p096）。但 cli 项目实跑 1 failed——f006 改严的断言暴露面板 SPA 在 dev cli serve 下未被服务（401），AC3「面板加载」未满足，新增 important finding f007。存在未解决 important，FAIL。

verdict: FAIL

## Round 3 (2026-08-09)

复核基准：当前工作区代码 + 实跑为准（cli 项目 + cli_serve 回归 + headless electron 全量）。

### 复核 f007 结果：已修

- **代码证据**：`src/main/index.ts:545-547` web_root 已改为 `app.isPackaged ? join(process.resourcesPath, "web") : resolve(__dirname, "..", "web")`。dev 分支解析：`__dirname = <ROOT>/out/main` → `resolve(__dirname, "..", "web") = <ROOT>/out/web`（electron-vite 输出位置，`ls out/web/index.html` 确认存在），不再错指 `out/main/out/web`。`git diff 8a96dc73` 仅 dev 分支一行变化，packaged 分支未动。
- **实跑证据（SPA 200 而非 401）**：`pnpm exec playwright test --config=playwright.config.ts --project=cli` → **2 passed**（test 1 `page.goto(url)` 后 `#root > *` 挂载成功，面板加载链路打通；test 2 quit 兜底通过）。Round 2 的 401 `{"error":"Unauthorized"}` 不再出现。
- **cli_serve 回归**：`playwright test --project=electron tests/e2e/electron/cli_serve.spec.ts` → **7 passed**（AC1/AC2/AC3/AC4/AC6/AC8 全部通过），f007 改动未影响 CLI serve 既有契约。

### Round 2 已修项（f001-f004/f006）未破坏

- f007 改动仅限 index.ts:545-547 静态服务路径，与门控 show() 调用点（window-manager.ts:153,210、main-panel/agent/history controller、index.ts:631,757）无交集。grep 复核各 show() 点 `is_e2e_headless()` 短路全部就位。
- headless electron 全量实跑（`E2E=1 E2E_HEADLESS=1 pnpm test:e2e:electron`，含 ABI 重建）：**54 passed / 8 skipped / 0 failed，exit 0**——与 Round 2 基线一致，f001（controller show 门控）实证未回归。
- f006（`#root > *` 断言）现随 cli 项目 2 passed 真正通过，不再依赖静态节点。

### packaged 路径复核：无新问题

`process.resourcesPath/web` 与 `electron-builder.yml:21-22` `extraResources: from: out/web, to: web` 吻合（extraResources 拷至 `<install>/resources/web`，即 `process.resourcesPath/web`），且该分支在 f007 修复中未改动，packaged 行为不变。

### Round 3 新增 finding

无。

### 未进表提示（非 finding）

- cli / electron e2e 实跑前置条件：`node scripts/ensure_sqlite_abi.mjs electron`（better-sqlite3 针对 Electron ABI 重建）。裸跑 `pnpm exec playwright test` 会因 ABI 不匹配（本机曾 137 vs 146）在启动期崩溃、health 不可达——属环境前置，非代码问题；规范入口 `pnpm test:e2e:cli` / `test:e2e:electron` 已含该步骤。

### Round 3 总体判断

f007 已修且实证通过（cli 项目 2 passed、cli_serve 7 passed），f001-f004/f006 未破坏（headless electron 全量 54 passed / 8 skipped）。packaged 路径未引入新问题。Round 1 critical f001、Round 2 important f007 均已关闭，遗留仅 p096（f005 minor）。无未解决阻断项。

verdict: PASS
