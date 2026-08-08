# Task review t275（reviewer_focus: 测试）

- task：`t275_cli_serve_bootstrap`
- spec：`docs/tasks/t275_cli_serve_bootstrap/spec.md`
- diff_anchor：`f7dec21b0f46da57db7253e51a6807c7e5391d64`
- target：`git diff f7dec21b0f46da57db7253e51a6807c7e5391d64`
- round：1
- reviewed_at：2026-08-08 14:10 UTC+8

## Findings

### t275_test_f001 - AC3「密钥可用」端到端未验证：导入 secret 的真实 vault 往返（hasSecret=true）无断言

- 严重度：important
- 锚点：AC3（`对应 hasSecret 为 true 的密钥可用（采集能凭该密钥成功请求）`）
- 位置：`tests/e2e/electron/cli_serve.spec.ts:123-176`、`tests/unit/main/cli/import-config.test.ts:73-109`
- 问题：AC3 要求导入的明文 secret 转存 vault 后「密钥可用（hasSecret 为 true）」。当前测试只证明写入侧与「无明文」：单测 `import-config.test.ts` 用 fake `secretsStore`（`makeDeps` 内 `set` 只写入内存对象），断言 `secrets["claude-1:API_KEY"]` 被调用；e2e AC3 只断言 `secrets.vault` 文件存在且不含明文。两处都未验证真实 vault 加密往返后**能按 `keyFor(instanceId, name)` 读回**（即运行中应用 `config:getSecrets` / `handleConfigGet` 推导出的 `hasSecrets["cli-import-test"]["API_KEY"] === true`）。若 vault 写入/密钥派生/加密损坏，当前全部测试仍通过，而 AC3 核心价值（导入密钥真正可用）未成立。既有 `tests/integration/config/secrets-store.test.ts` 覆盖了 vault 通用往返，但不是 CLI 导入路径；spec 可测试性声明「其余全部可自动测试」已断言该子句可自动验证。
- 建议：e2e AC3 增加对运行中应用配置 API 的断言（`/v1/config` 走 `handle_web_config` 无鉴权返回，可读 `hasSecrets`），或用 `app.evaluate` 调 `config:getSecrets` 断言 `cli-import-test:API_KEY` 返回导入的合成值。

### t275_test_f002 - AC8「--config 指向不存在/非法 JSON」进程级行为未测（非零退出 + 不留半初始化状态）

- 严重度：important
- 锚点：AC8（`--config 指向不存在或非法 JSON 文件`给出非零退出码与可读错误信息，不留半初始化状态）
- 位置：`tests/e2e/electron/cli_serve.spec.ts:178-191`（仅覆盖缺子命令）；`tests/unit/main/cli/import-config.test.ts:111-140`（仅函数级 reject）
- 问题：spec 可测试性声明明确要求「AC8 中『不留半初始化状态』：自动断言进程退出且规范 config.json 未被破坏（与启动前一致）」。e2e 只测了缺子命令（`--cli` 无子命令 → launch reject + userData 无 config.json）；`--config` 指向不存在文件 / 非法 JSON 的进程级路径（index.ts 中 `import_config_file` 抛错 → whenReady catch → `app.exit(1)`，config.json 与导入前一致）没有任何 e2e 断言。单测覆盖的是 `import_config_file` 函数级 reject，未触达进程退出码与「半初始化状态」这一 AC 明确要求。若该路径误写成「失败后仍继续启动服务」，测试无法发现。
- 建议：新增 e2e：先在 userData 写入已知 config.json，再以 `--cli serve --config <不存在或非法文件>` 启动，断言 launch reject（非零退出）且 userData/config.json 内容与启动前逐字节一致。

### t275_test_f003 - AC6 与 OMNI_PANEL_PORT 并存时的优先级未测

- 严重度：important
- 锚点：AC6（`与 OMNI_PANEL_PORT 并存时优先级明确且不冲突`）
- 位置：`tests/e2e/electron/cli_serve.spec.ts:84-121`（仅 `--port 18701` 单独生效）；`src/main/core/local-api/server.ts:539-542`（`options?.port ?? (env_port 合法 ? env_port : default)`）
- 问题：AC6 两个子句——「--port 可覆盖监听端口」已由 e2e 覆盖；「与 OMNI_PANEL_PORT 并存时优先级明确且不冲突」完全无测试。`OMNI_PANEL_PORT` 与 `--port` 的优先级解析在 `server.ts`，实现为 `--port`（options.port）压过 env；但没有任何测试设置 `OMNI_PANEL_PORT`（单独或与 `--port` 并存）验证优先级与不冲突。若实现改为 env 优先或合并逻辑出错，当前测试全部通过。既有 `tests/integration/local-api/server.test.ts` 也未覆盖 `OMNI_PANEL_PORT`。
- 建议：单测 `create_local_api_server` 设 `OMNI_PANEL_PORT` + `port` option 断言 option 生效、仅 env 时 env 生效；或 e2e 设 `OMNI_PANEL_PORT=XXXX` 加 `--port YYYY` 断言监听 YYYY。

### t275_test_f004 - AC4「不带 --config 沿用现有 config.json」无直接测试

- 严重度：important
- 锚点：AC4（`不带 --config 的 --cli serve 沿用现有规范 config.json，行为与桌面版配置加载一致`）
- 位置：`tests/e2e/electron/cli_serve.spec.ts:84-121`（空 userData 启动，未预置 config.json）；`src/main/index.ts:230-237`（`if (cliMode && cli_args.serve?.configPath)` 守卫）
- 问题：AC4 正向行为——预置一个含连接器实例的 config.json 到 userData，`--cli serve` 不带 `--config` 启动后该配置被沿用——无任何测试。e2e AC1/AC2 在空 userData 启动，只能证明「无 --config 能启动」，不能证明「现有 config.json 被沿用」。若 CLI 分支误清空/忽略现有配置（守卫之外引入重置逻辑），测试全部通过。
- 建议：e2e 预写含一个插件实例的 config.json 到 userData，`--cli serve` 无 `--config` 启动，断言 `/v1/config` 或 config.json 仍含该实例。

### t275_test_f005 - AC1「web 面板与 dashboard 端点」在 CLI e2e 中仅以 /v1/health 代表

- 严重度：minor
- 锚点：AC1（`local-api 正常响应 web 面板与 dashboard 端点`）、AC2（浏览器打开能看到用量面板）
- 位置：`tests/e2e/electron/cli_serve.spec.ts:102-104`（仅 GET `/v1/health`）
- 问题：CLI e2e 只断言 `/v1/health` 200，未 GET `/`（静态 web 面板资源，`serve_static`）也未断言 `/v1/dashboard`。二者均为共享代码（`server.ts` 路由），既有 integration 测试已覆盖 dashboard 端点，因此不阻断；但 CLI 模式「面板可达」的 AC1/AC2 证据仅由 health 端点代表，面板静态资源或 dashboard 在 CLI 分支回归时不会被本 e2e 捕获。
- 建议：e2e 补一个 GET `/`（断言 200 与 HTML）或 GET `/v1/dashboard` 200。

### t275_test_f006 - e2e stdout 捕获存在 attach 竞态，可能 flaky 假红

- 严重度：minor
- 锚点：测试可信（异步时序）
- 位置：`tests/e2e/electron/cli_serve.spec.ts:43-48`（`app.process().stdout?.on("data", ...)` 在 `electron.launch` resolve 之后才 attach）
- 问题：`launchCli` 在 `electron.launch` 返回后才挂 stdout/stderr 监听；`process.stdout.write("OmniPanel CLI mode listening ...")` 在 whenReady 内 `local_api.start()` 之后同步执行。若 Playwright 在 whenReady 完成前 resolve（CLI 无窗口可等），该行可能在监听器挂上之前已输出，Node child stream 无监听时数据事件不流动，`expect.poll(stdout())` 超时假红。属测试可信度/稳定性问题（假红非假绿）。
- 建议：`wait_for_health` 返回后再断言 stdout 不消除竞态（write 早于 health 就绪）；更稳妥做法是在 `launch` 前用 Playwright 的 `stdio` 处理或在 health 就绪后改从日志/`/v1/status` 读端口，或对 stdout 断言容忍一次 health 轮询窗口内重试。

### t275_test_f007 - session-path-index WSL 探测测试条件跳过（it.skipIf），Linux CI 覆盖丢失

- 严重度：minor
- 锚点：危险模式扫描（跳过/独占族）——已调查
- 位置：`tests/unit/main/core/session-history/session-path-index.test.ts:178-200`
- 问题：`it.skipIf(!existsSync("\\\\wsl.localhost\\Ubuntu-22.04\\home"))` 把既有 t254 的「WSL 用户名探测进程内只执行一次」测试改成环境门控跳过。在 Linux/WSL 来宾（无 Windows 宿主挂载）下该测试被静默跳过仍 PASS，覆盖丢失。调查结论：`\\wsl.localhost\...` UNC 仅在 Windows 宿主 + WSL 挂载可达，纯 Linux 无法解析，环境门控合理；断言本身（`wsl_home_scans === 1`）未弱化，且该测试不属于 t275 AC 范围。按「合法环境门控」降级为 minor，不阻断；建议在结论/文档注明 CI 上该用例不执行，需在 Windows 宿主 CI 或人工跑一次。
- 建议：无代码改动必需；在 task.md 或测试注释明确「该用例需 WSL 挂载环境执行」即可。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：本轮修改的既有测试——9 个 IPC 测试 `set_renderer_index_path("D:/...")` → `fileURLToPath("file:///D:/...")` 为跨平台往返修正，已核实 `helpers.ts` 用 `pathToFileURL(abs).pathname` 与 `new URL(url).pathname` 精确比对，Linux 下新旧 pathname 一致（原硬编码 `D:/...` 在 Linux 被 `pathToFileURL` 解析成 cwd 相对路径导致测试真失败，改后自洽），断言语义未弱化，属环境修复非迁就实现。subscription-service 两处 50ms 延迟为 mtime 量化（`/tmp` 毫秒桶）稳定化，断言未变，属合法时序修复非阈值掩盖。无「迁就实现」式改测。
- 本轮新发现：7 条（important 4 / minor 3）
- 未进表的提示：
    - `import-config.test.ts` 的 fake `configStore.save` 不校验 schema（真实 `configStore` 的 doSave 含 prune），schema 合法性由 e2e AC3 真实验证兜底，故未单列。
    - e2e 硬编码端口 18701/18702：若被占用，`server.ts` 会回退随机端口，但 e2e 断言 `cli.json.port === 18701` 会假红（非假绿）；可作为稳定性提示，不阻断。
    - AC5（桌面版回归）未新增测试，属既有 electron e2e 覆盖；diff 仅加 `!cliMode &&` 守卫，桌面行为未变，符合测试策略「桌面版回归走既有 electron e2e」，无 finding。
- 总体判断：新功能（args / cli-json / import-config）单测与 e2e 质量高、危险模式干净；但 AC3 密钥可用、AC8 --config 失败进程级、AC6 端口优先级、AC4 无 --config 沿用现有配置 4 条 AC 子句无端到端测试，按「覆盖类 AC 完全无测试/子句未验证」判 blocking。
- 系统性 follow-up：无

verdict: FAIL

## 撤回记录

- finding: t275_test_f006
- 撤回人: reviewer（test）
- 日期: 2026-08-09
- 理由: Node child stdout paused-mode 缓冲不丢数据，attach 晚不丢失输出；f006 竞态假设不成立，撤回

## Round 2 (2026-08-09)

逐条复核结果（对照当前测试代码 + git diff f7dec21b0f46da57db7253e51a6807c7e5391d64）：

- f001 已修：e2e AC3 增真实 vault 往返断言（`tests/e2e/electron/cli_serve.spec.ts:200-207`）——`GET /v1/secrets?instanceId=cli-import-test` 断言 200 且 `body["API_KEY"] === "sk-synthetic-cli-e2e"`。链路核实：deepseek manifest `API_KEY` type=secret → `build_secret_param_keys` 建 key → `import_config_file` 转存 vault → `handleConfigGetSecrets` 按 `keyFor` 读回 → `send_result` ok 时直接返回 `result.data`（无 ok 包装，断言解析正确）。读回明文即证明「密钥可用」。
- f002 已修：e2e 增两条进程级断言——`--config` 指向不存在文件（`cli_serve.spec.ts:230-258`）与非法 JSON（`:260-286`），均 `wait_exit_code` 断言 exit 非 0，且 config.json（若存在）仍为合法 JSON、不含导入内容；`index.ts:1157-1170` cliMode catch 写 stderr 后 `app.exit(1)`，退出路径一致。
- f003 已修：e2e 增 `OMNI_PANEL_PORT=18704` 与 `--port 18703` 并存（`cli_serve.spec.ts:288-311`），断言 cli.json.port===18703（--port 生效）且 env 端口 `/v1/health` 不可达；与 `server.ts:541-542`（`options?.port ?? (env 合法 ? env : default)`）优先级实现一致。
- f004 已修：e2e 增预置 config.json 后 `--cli serve` 无 `--config` 启动（`cli_serve.spec.ts:313-349`），断言 config.json 仍含预置 `preset-ds` 实例。断言强度核实：dev 下 `getBundledConnectorsDir()` 返回 worktree `connectors/`（17 连接器），deepseek-only 预置配置必触发 `auto_seed_connectors` 重写 config.json，preset-ds 存活即证明「预置配置被加载沿用」，非空转断言。
- f005 已修：AC1 补 `/v1/dashboard` 合法 query 200 断言（`cli_serve.spec.ts:129-132`），参数 agent=all/platform=all/start=0/end=86400000/metric=tokens/xaxis=time/gran=day 全部命中 schema 枚举与 end>start/桶数 refine，经 `token_stats_query_dispatcher` 空数据返回 200。
- f007 已修：`session-path-index.test.ts:178-182` skipIf 注释明确「WSL home UNC 仅 Windows 宿主 + WSL 挂载可达，纯 Linux 不可解析……需 WSL 挂载环境验证」，断言本身（`wsl_home_scans === 1`）未弱化。
- f006 撤回记录：确认已写入 review_test.md 末尾，理由（Node child stdout paused-mode 缓冲不丢数据，attach 晚不丢失输出）成立，撤回合理。

Round 2 新增 finding：无（新补 4 条 e2e 断言均核实为真实往返/进程级/非空转；假绿风险点均已查：`/v1/secrets` send_result 解包、dashboard schema 合法性、auto_seed 改写对 f004 断言的影响）。

verdict: PASS
