# 测试

`doctor_cmd` / `test_cmd` / `blackbox_verify` 定义如下（`##` 标题为 preflight 门禁机械锚点）。

## doctor_cmd

环境前置检查——本仓无独立 doctor 命令；`task-run` Step 1 写「无」，靠 `test_cmd` 各命令自身的失败信号判定环境。

## test_cmd

日常测试（红/绿）——`pnpm test`（vitest run，单元 + 集成），见下方「门禁类别清单」。

## blackbox_verify

黑盒验证——是一套方法论，不是单个命令。agent 按下方「黑盒验证细则」自行决定如何执行。

日常命令速查（人读）见 `docs/guides/testing.md`；本文件是权威定义。

## Schema / codegen 验证

本仓无 schema、migration 或 codegen 工具（无 Prisma / Alembic / gql-codegen）。

- 触发路径：无
- 生成命令：无
- 验证命令：无
- 合并后动作：无
- migration 窗口：无

`src/generated/build-info.ts` 由 `scripts/gen-build-info.ts` 在 `pnpm build` 时生成（git 信息），不进库（`.gitignore`）；`build` 命令本身会重新生成，无需独立 codegen 步骤。

## 门禁类别清单

填 `test_cmd`（`pnpm test`）时按本节逐类覆盖。运行时通过 ≠ 类型 / 构建正确，每类须有独立验证。本仓当前全部绿。

|类别|命令|说明|
|---|---|---|
|单元测试|`pnpm test`|vitest run；单元 + 集成。mock 不得掉被测逻辑、断言不得过弱（假绿）。vitest.config.mts 用 projects 拆两项目（t177）：`renderer`（jsdom + `tests/smoke/setup.ts`，`tests/unit/renderer/**`、`tests/smoke/**`、`tests/unit/web/**`）+ `node`（node 环境无 setupFiles，其余全部）。新增测试目录须列入对应项目 include，否则被静默跳过。|
|生产 + 测试代码类型检查|`pnpm typecheck`|`tsc --noEmit`；`tsconfig.json` 的 `include` 含 `src` 与 `tests`，生产与测试代码同一次检查覆盖。|
|lint|`pnpm lint`|`eslint src tests scripts connectors tests/fixtures *.ts *.mts --max-warnings=0`；零 warning 零 error。|
|生产构建|`pnpm build`|`gen-build-info` + `electron-vite build` + `vite build`（web）；暴露 codegen、RSC 边界、server-only 导入等问题。|

综合门禁速查：`pnpm check`（typecheck + lint + format:check + deadcode + arch）。

## 用户干扰分级（决定能不能自动跑）

跑任何测试前先按本表判定：**会弹窗 / 抢焦点 / 动到用户正在用的东西的命令，必须先取得用户明确许可**，不得由 agent 自行触发。事实依据：app 侧窗口只在 `E2E=1` **且** `E2E_HEADLESS=1` 时以 `show:false` 创建（`src/main/e2e-headless.ts`），而 `package.json` 的 `test:e2e:*` 脚本**都不设** `E2E_HEADLESS`。

|命令|窗口/焦点|端口/服务|动用户状态|可自动跑|
|---|---|---|---|---|
|`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm check`|无|无（个别集成用例起 127.0.0.1 临时端口）|无|**可**|
|`pnpm test:e2e:web`|无（chromium 默认 headless）|起 `vite preview` 占 `E2E_WEB_PORT`（默认 5274）并重建 web 产物；`reuseExistingServer: true` 会复用残留服务 → 旧 bundle 假失败|无|**可**（先确认 5274 无残留服务）|
|`pnpm test:e2e:cli`|无（chromium headless；脚本带 `E2E_NO_WEBSERVER=1`）|`--cli serve` 自起临时端口|无|**可**|
|`pnpm test:e2e:electron`|**有**：起真实 Electron app，未设 `E2E_HEADLESS` → 真窗口弹出、抢焦点（macOS 无 xvfb）|每用例起停 app|无（独立临时 `--user-data-dir`）|**须许可**|
|`pnpm test:packaged`（`--project=packaged`）|**有**：起打包版 app（CDP）|临时 remote-debugging 端口|无|**须许可**|
|`pnpm package` / `pnpm reload`|**有**：先 kill 正在运行的 OmniPanel 再重启；macOS 上重签会弹钥匙串授权|本地 API 端口随重启变更|**有**：直接改变用户正在用的 app|**须许可**|
|`pnpm start` / `pnpm start:test`|**有**：dev app 窗口|dev server 端口|写用户 userData（除显式 `--user-data-dir`）|**须许可**|
|`pnpm test:contract:live`|无|打真实上游|无（但消耗真实额度）|**须许可**|

无窗口替代（推荐给 agent 自测）：`E2E=1 E2E_HEADLESS=1 pnpm exec playwright test --config=playwright.config.ts --project=electron`——窗口 `show:false`，不弹屏抢焦点；Linux CI 另需 `xvfb-run -a`。它仍会起真实 Electron 进程（占 CPU），但不动用户正在用的实例（独立 `--user-data-dir`）。

### worktree 注意事项

task 在 `../omni_usage_{tid}/` worktree 执行时，worktree 无 `node_modules`，门禁命令需先备依赖：

- `pnpm install --prefer-offline`：pnpm store 全局共享，较快；推荐。
- 或软链主仓 `node_modules`（快；better-sqlite3 13 起为 N-API prebuild，同一份二进制通用于 Node 与 Electron，无 ABI 互斥问题）。
- better-sqlite3 13（N-API，自带 `prebuilds/`）无需按运行时切换；`scripts/ensure_sqlite_abi.mjs <runtime>` 保留为**加载校验**（在目标 runtime 实跑一次），`pnpm test` 前置 `node scripts/ensure_sqlite_abi.mjs node`。
- `src/generated/`（gitignore）需在 worktree 内先 `npx tsx scripts/gen-build-info.ts` 生成，否则 `build-info-ipc` 相关测试整批必挂（t218 实测）。

## 黑盒验证细则

黑盒按 task 范围选择层级，非单个命令：

- 默认：`pnpm test`（主）。
- 涉及打包 / 托盘 / 多窗口 / 真实 Electron 行为：`pnpm package` 后真实启动 `artifacts/win-unpacked/OmniPanel.exe`，跑 `pnpm test:packaged`（CDP 连 exe 的 smoke + 后台 serve 锁冲突 `bg_serve_lock.spec.ts`，t443；后者 spawn 隔离 user-data-dir 健康实例再后台 serve，断言秒级 exit=1 + 「实例已在运行」；argv 须空格分隔 `--user-data-dir <dir>`，`=` 拼接被静默丢弃）。
- 涉及连接器 live 契约：`pnpm test:contract:live`（打真实上游，需凭据）。
- 涉及 web SPA：`pnpm test:e2e:web`（Playwright chromium，mock local-api）。会话面板关键路径由 `tests/e2e/web/session_panel.spec.ts` 覆盖（双页签状态保留 / 打开会话装槽与消息渲染 / 槽满 toast / 摘选三格式复制 / 会话库搜索筛选排序预览并排打开闭环），数据来自 synthetic fixture（`scripts/e2e/session_fixture.mjs` → `tests/e2e/fixtures/synthetic.json`）；本地与 CI 均须 `MOCK_FIXTURE=synthetic` 运行（`playwright.config.ts` webServer 固定 `--host 127.0.0.1` 供 Windows IPv4 可达）。
- webServer 环境隔离（t292）：playwright.config 加载期删除代理 env 变体（http_proxy/https_proxy 等 6 个），防探测被代理 400 误判「已可用」→ 不启动 → ECONNREFUSED；本机有代理环境也无需手工 unset。cli 项目（`pnpm test:e2e:cli`）自起 `--cli serve`，脚本注入 `E2E_NO_WEBSERVER=1` 关闭闲置 vite preview。
- synthetic fixture 约定：`pnpm e2e:gen-synthetic` 从 real `responses.json` 脱敏子集写入 `tests/e2e/fixtures/synthetic.json`，并固化注入 `synthetic-kimi-failed` / `synthetic-opencode-go`（无对应 config plugin 的 e2e 锚点 connector）；写出经仓库 prettier 格式化（tabWidth=4，短数组折叠），保证再生成幂等且 `format:check` 无 warn。mock `sync_connectors()` 在按 `config.plugins` 重建时保留 fixture 中初始 config 未收录的 synthetic-only connector，且不把已从 config 删除的真实 plugin 从 initial 复活。
- 涉及测试实例隔离验证：`pnpm start:test`（黄图标、沙盒数据、17864 端口），见 `docs/guides/testing.md`「测试实例」。
- 代理面板性能基线：`pnpm exec tsx scripts/token-stats-baseline.ts --records 600000 --output .scratch/t189/baseline.json`；固定 seed 生成脱敏临时 SQLite，覆盖 24h/7d/30d 与 agent/platform 组合，比较查询、payload 和 renderer 转换阶段。报告只作相对基线，不把绝对耗时设为 CI 门禁。

黑盒失败处置见 `task-run` skill：`< max_verify_round` 回 Step 3 修复；`≥ max_verify_round`（默认 5）`block --reason blackbox`。

### CLI 模式验证（t275）

- CLI 模式 e2e：`tests/e2e/electron/cli_serve.spec.ts`（`--cli serve` 起真进程，断言无窗口、stdout URL、cli.json 端口、`--config` 导入 vault 往返、端口优先级、失败退出码）。跑前须 `node scripts/ensure_sqlite_abi.mjs electron`（校验 better-sqlite3 能在 Electron 运行时加载），并经 `pnpm build` 出 `out/main/index.js`。
- 无显示环境（WSL 无 WSLg）：`xvfb-run` 包一层；`DISPLAY` 存在时 `dialog.showErrorBox` 会同步阻塞，CLI 模式启动失败只向 stderr 输出后退出，不弹框。

### CLI 控制子命令验证（t276）

- `tests/e2e/electron/cli_control.spec.ts`：`--cli serve` 起真实例后，瘦客户端（子进程 spawn，因 `app.exit` 快退 Playwright `electron.launch` 会 reject）跑各控制命令，断言实例侧可观察效果——refresh-all 经 `/v1/events` SSE 收到状态事件、restart 后 cli.json pid 更新 + 新端口 health、桌面实例（E2E=1 + `OMNI_PANEL_PORT` 固定端口）可被 `--port` 覆盖控制、实例未运行时非零退出 + stderr 可读错误。
- 单测：`tests/unit/main/cli/client.test.ts`（实例发现 cli.json/`--port` 覆盖、post_control 端点、autostart Linux unsupported、错误文案）；`tests/integration/local-api/server.test.ts` 控制端点组（refresh-all/pause/resume/restart/quit POST 200、GET 405、未配置 control_deps 时 401 落认证门）。
- restart 用例 teardown（t288）：`app.relaunch()` 出的新进程脱离 playwright 句柄，`closeServe` 管不到；`reap_user_data_dir_processes` 按 `--user-data-dir` 唯一定位后 SIGTERM（超时 SIGKILL）整树回收，避免孤儿进程跨 run 堆积阻塞端口。

### e2e headless 门控与 cli 项目（t280）

- `E2E_HEADLESS=1` 门控：仅当 `E2E=1` 且 `E2E_HEADLESS=1` 同时存在时，app 侧窗口 `show:false`（窗口存在可测但不弹屏），playwright chromium 侧 `headless: true`。双条件之外代码路径零改动——正常启动/CI（不设 `E2E_HEADLESS`）行为与现状完全一致。
- 依赖窗口可见性/焦点/尺寸度量的既有 electron spec 标「仅 headed」，headless 下跳过不计失败——`test.skip(is_e2e_headless(), reason)`（fixtures/test.ts 提供 helper）；清单见 t280 spec「仅 headed 清单」。
- `cli` 项目：`pnpm test:e2e:cli`（playwright `--project=cli`）——`_electron.launch` 传 argv 起真实 `--cli serve` 无头实例（含 `--config` 导入），stdout 正则抓 URL，chromium 驱动 web UI 走核心链路（面板加载、dashboard、config），全程零窗口。跑前 `node scripts/ensure_sqlite_abi.mjs electron` + `pnpm build`。
