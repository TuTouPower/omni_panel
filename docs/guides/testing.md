# 测试指南

OmniPanel 测试命令、分层、覆盖率与打包 smoke 指南。硬约束入口见 `AGENTS.md`；测试规范（命名、层级、回归）见 `docs/blueprint/conventions.md` “编码与测试”小节。

## 运行命令

```bash
pnpm test                 # 单元 + 集成（vitest run）
pnpm test:coverage        # 覆盖率
pnpm test:e2e:web         # Playwright chromium 测 web SPA（日常，恒 synthetic mock fixture）
pnpm test:e2e:electron    # Playwright Electron 驱动（托盘/多窗口等专属, 手动跑，须许可）
pnpm test:e2e:cli         # Playwright chromium 驱动真实无窗口 serve 实例（全栈无弹窗）
pnpm package              # 打包
pnpm test:packaged        # 打包 smoke（CDP 连 exe，须许可）
./artifacts/win-unpacked/OmniPanel.exe   # Windows 产物：先 pnpm package，仓库根目录运行
pnpm test:contract:live   # 连接器 live 契约：当前无用例（tests/contract_live/ 仅剩 README，运行即无匹配文件退出 1）
pnpm check                # typecheck + lint + format:check + deadcode + arch + schema:check + test
python3 -m pytest .repo_template/tests/ # 模板工具链 Python 测试（task.py 等），独立于 pnpm test
```

`E2E_HEADLESS=1 pnpm test:e2e:electron` 跑 headless：窗口 `show:false` 不弹屏，依赖可见窗口/焦点/尺寸的 spec 标「仅 headed」自动跳过（清单见 `docs/archive/tasks/t280_e2e_headless_gate/spec.md`）。

调试入口：打包 smoke 以 `--remote-debugging-port=0` 启动 Electron，从隔离 user-data 目录的 `DevToolsActivePort` 读取动态 CDP 端口后连接；连接器脚本日志打 `connector-sandbox` logger。

## 测试实例（沙盒隔离）

`pnpm start:test` 启动一个与正常实例完全隔离的测试实例，用于验证改动而不碰真实数据：

|维度|正常实例 `pnpm start`|测试实例 `pnpm start:test`|
|---|---|---|
|userData|`%APPDATA%/OmniPanel`|`.scratch/test-instance/`（gitignore）|
|LocalAPI 端口|`17863`|`17864`（`OMNI_PANEL_PORT` env 覆盖）|
|图标|蓝色（`assets/icon.*`）|黄色（`assets/icon-test.*`，`TEST_INSTANCE=1` 切换）|
|视觉区分|—|托盘/窗口黄色|

实现：`scripts/start-test.mjs` 设 `TEST_INSTANCE=1` + `OMNI_PANEL_PORT=17864` + Electron `--user-data-dir=.scratch/test-instance`；`paths.ts` 按 env 切图标资源；`local-api/server.ts` 读 env 覆盖默认端口。

### 同时运行两个实例

两个 dev 实例共享 `out/` 编译目录会冲突，不能同时 `pnpm start` + `pnpm start:test`。同时运行方案：

- **正常实例**：Windows 下 `pnpm make:win` 后运行 `artifacts/win-unpacked/OmniPanel.exe`（占 17863、蓝图标）
- **测试实例**：`pnpm start:test`（占 17864、黄图标、沙盒数据）

端口被占时 local-api 有回退机制（`EADDRINUSE` → 系统 0 分配），但测试实例固定 17864 避免回退随机端口，便于 web 面板/调试工具直连。

**17864 互斥**：`pnpm cli:serve`（见 `docs/guides/cli-mode.md`）同样固定 17864 + 独立沙盒 userData，与 `pnpm start:test` 争用同一端口，二者不能同时运行——后启动者会经 `EADDRINUSE` 回退到随机端口，`cli:quit --port 17864` 将打不到该实例。

### 重新生成测试图标

```bash
pnpm icons:test   # 从 assets/logo-test.svg 渲染 icon-test.png/ico + tray-icon-test.png
```

改 `assets/logo-test.svg`（黄色渐变）后重跑刷新。

## 测试分层

|层级|目录|框架|职责|
|---|---|---|---|
|单元|`tests/unit/`|Vitest|纯函数、工具、schema 校验、parser、连接器解析逻辑|
|集成|`tests/integration/`|Vitest|Node 环境可真实运行的主进程模块（config/cache/scheduler/runtime/vault/observation-store）|
|Electron E2E|`tests/e2e/electron/`|Playwright|真实 Electron 实例，模拟真实用户操作（`.spec.ts`），手动跑 Electron 专属能力（托盘/多窗口/powerMonitor/restart）|
|打包 smoke|`tests/e2e/packaged/`|Playwright + CDP|验证 `artifacts/win-unpacked/OmniPanel.exe` 启动、渲染、发现内置连接器、popup 高度回归|

三层职责不重叠：

- 单元/集成验证**模块正确性**（返回值、主进程模块契约）。
- E2E 验证**功能正确性**：用户看到 Dashboard、填了 API Key、点了刷新看到数据。**不直接调 `window.usageboard` 绕过 UI**。
- 打包 smoke 验证**产物可用性**：exe 能否启动、渲染是否白屏、托盘是否出现、`extraResource` 连接器是否加载。

## web e2e 录制与运行

web e2e（`tests/e2e/web/`）由 Playwright chromium 驱动 `out/web` SPA，后端 mock 回放录的本机真实响应（`tests/e2e/fixtures/data/responses.json`，gitignore）或入库 synthetic fixture。

### 录制 fixture（一次性，本地）

1. 启动 OmniPanel 提供 local-api :17863（择一）：
    - packaged：Windows 下先 `pnpm package`，再 `./artifacts/win-unpacked/OmniPanel.exe`
    - dev：`pnpm start`（electron-vite dev）
        两者均读本机 `%APPDATA%/OmniPanel` 真实数据。确认 `curl http://localhost:17863/v1/health` 返回 `{"status":"ok"}` 后继续。
2. `pnpm e2e:gen-data` → 录全部 responses 到 `tests/e2e/fixtures/data/responses.json`（不入库；secrets 黑名单正则脱敏 `***`）。响应数随本机 instance 数变化（T010 基线 61）。
3. `pnpm exec playwright test --config=playwright.config.ts --project=web` → chromium 驱动，`vite preview` 内嵌 `mock_api_plugin` 回放刚录的 real responses（`MOCK_FIXTURE` 未设 → real）。

**fixture 选择（权威 = `package.json`）**：`test:e2e:web` 脚本内固定 `MOCK_FIXTURE=synthetic`，即 `pnpm test:e2e:web` **恒用 synthetic**；要跑 real 只能用上一步的 `pnpm exec playwright test --config=playwright.config.ts --project=web`，前置为已执行 `pnpm e2e:gen-data`——缺 `responses.json` 时 mock server 报错退出 1。

**synthetic seed fixture（入库）**：`pnpm e2e:gen-synthetic` 从真实 responses 取 3 instance 脱敏子集（`demo_*@example.com`）→ `tests/e2e/fixtures/synthetic.json`（入库），前置同样是 `pnpm e2e:gen-data`；脚本额外固化注入 `synthetic-kimi-failed` / `synthetic-opencode-go`，写出对齐仓库 prettier（tabWidth=4）。mock local-api 在 `sync_connectors()` 时保留这两类无 config 匹配的 synthetic-only connector。connector 清单变化后重跑 gen-synthetic 刷新入库版。

### CI 状态：已移除（本地门禁如下）

`.github/workflows/` 仅剩 `release.yml`；`ci.yml` 与 `nightly.yml` 已在 `db5a8f60`（2026-09-20，`fix(test): align dock-badge test with p258, rm github CI workflows`）删除，当前**无 CI 门禁**。等价的本地门禁：

- `pnpm check`（typecheck + lint + format:check + deadcode + arch + schema:check + test）
- `pnpm test:e2e:web`（web SPA smoke，synthetic fixture）
- `pnpm test:packaged`（打包 smoke，须许可）

Electron 驱动 `pnpm test:e2e:electron` 本地手动跑（须许可，无 CI nightly）；real fixture（本机真实响应）仅本地，不入库。

### 三路 e2e project 对照

|project|目录|驱动|何时跑|
|---|---|---|---|
|web|`tests/e2e/web/`|chromium + mock local-api|本地日常（首次需先录 fixture，见上节）|
|electron|`tests/e2e/electron/`|Electron（真实进程）|本地手动（须许可）|
|packaged|`tests/e2e/packaged/`|CDP 连 exe|本地（须许可；CI 已移除）|

## 通用原则

- **少 mock，多真实**：外部服务用本地可控桩；本地能力（连接器发现、TS 编译、配置读写、SQLite、cookie 捕获）真实测。
- **覆盖完整**：覆盖所有功能与所有 UI 状态（loading / 正常 / 错误 / 空）。
- **稳定可复现**：显式等待条件，稳定 `data-testid` 选择器，用例独立自带配置重置。
- **命名** `snake_case`，E2E spec 以 `.spec.ts` 结尾。
- **断言期望行为**：测试断言“应该怎样”，不锁死历史错误行为。

## 必须自动化覆盖

- 按钮点击触发实际行为（刷新 → 进入加载 → 数据更新/失败后结束加载）。
- 刷新重试契约：script / poll / probe / 观测写库失败最多尝试 3 次，任一次成功即 ready，三次均失败才 failed；session auth 错误每轮最多触发一次重新登录，登录失败不跳过剩余尝试。
- 配置读写持久化；连接器参数链路：填 secret → 存 vault → 刷新 → 脚本经 `ctx` 收到参数 → UI 显示数据。
- Dashboard / Settings / Popup 三视图渲染与切换；provider card 状态与错误信息。
- 用量条 UI 回归：细线型/粗胶囊型在概览/单账号/多账号视图行间距列结构一致。
- 空/加载/错误态 DOM。
- CPA UI 回归：主 UI 无 CPA provider tab；CPA 数据进对应 provider；CPA 配置只在设置/数据源页。
- CPA 保存回归：无变化不持久化；备注/刷新间隔不立即采集；管理密钥、CPA-Manager URL、monitor 变化仅刷新当前 CPA；保存成功立即返回账号列表，保存失败保留详情页。
- Scheduler 回归：非调度配置和插件排序变化不重建；有效计划变化才 deferred rebuild；user/system 暂停原因交错时互不解除，暂停期间配置变化不得启动 scheduler。

## 必须真实打包 smoke

自动化不能单独宣称已解决：

- `OmniPanel.exe` 首次启动；托盘真实显示、popup 位置。
- Popup 根容器填满窗口高度（防底部背景空白）；动态高度跟随 `popup:reportContentHeight`、不超 100% 工作区（t081 起 `MAX_HEIGHT_RATIO=1.0`，见 `docs/archive/tasks/t081_popup_height_full_workarea/spec.md`）、无额外底部留白（多显示器/DPI 下 `setBounds` 只能人工验收）。
- 渲染进程正常加载（白屏即失败）；ASAR 内资源路径可访问。

修复涉及打包产物的任务，完成报告必须含：自动化结果 + 打包真实启动验证结果。没有真实 smoke 只能写“自动化路径通过，packaged 行为未验证”，不能写“已修复”。

## 覆盖率阈值

权威 = `vitest.config.mts` 的 `coverage.thresholds`（本表为同步副本，改阈值只改该文件）：

|指标|阈值|
|---|---|
|Statements|50%|
|Branches|50%|
|Functions|50%|
|Lines|50%|

> `3b994034`（t522，2026-09-25）起为 50/50/50/50；此前的「基线 − 5%」口径已作废。

## 任务完成验证清单

1. [ ] `pnpm typecheck` 通过
2. [ ] `pnpm lint` 通过
3. [ ] `pnpm test` 全部通过（或记录已知失败）
4. [ ] 涉及打包/渲染：真实启动打包产物验证
5. [ ] 涉及 UI：手工点击关键路径验证
