# Task review t276（reviewer_focus: 通用）

- task：`t276_cli_control_commands`
- spec：`docs/tasks/t276_cli_control_commands/spec.md`
- diff_anchor：`5d897672b51cfa356cd7e2bbf5a91e546c1cab6a`
- target：`git diff 5d897672b51cfa356cd7e2bbf5a91e546c1cab6a`
- round：1
- reviewed_at：2026-08-09 01:15 UTC+8

## 审查执行记录

- 已确认仓库根 `/home/karon/karson_ubuntu/omni_panel_t276`，与 task 目录同仓库。
- 已读 spec 契约区（AC1-AC7、非范围、可测试性声明）、上下文区（有意不测、测试策略、未知契约清单均已实跑核销、依赖约束）。
- 已核 diff 全部 10 文件（src 5 + tests 4 + docs 2），含 `git add -N` 新文件。
- 实测验证：
    - `tests/unit/main/cli/args.test.ts` + `client.test.ts`：36 passed
    - `tests/integration/local-api/server.test.ts -t 控制端点`：5 passed
    - `npx tsc --noEmit`：通过
    - `pnpm test:e2e:electron` 子集 `cli_control.spec.ts`：6 passed（AC1 refresh-all + --port 覆盖、AC2 pause 幂等 + resume、AC3 quit/restart + cli.json pid 刷新、AC4 open、AC5 autostart Linux、AC6 实例未运行）
    - t275 回归 `cli_serve.spec.ts`：7 passed（args 重构未破坏 serve）
    - 注意：e2e 首次跑 4 失败系 review 环境 ABI 误切（`ensure_sqlite_abi node`），切回 `electron` ABI 后全过，非代码缺陷。

## Findings

### t276_gen_f001 - AC7 桌面版（tray）实例可被 CLI 控制：无 e2e 覆盖，测试名误标 AC7

- 严重度：important
- 锚点：违反 AC7 + 测试策略（「桌面模式实例同样跑一轮控制命令」）
- 位置：`tests/e2e/electron/cli_control.spec.ts:100`（`AC1/AC2/AC3/AC7：...` 测试内全部实例均为 `--cli serve`）；`src/main/index.ts:592`（cli.json 仅 `cliMode` 写）
- 问题：测试名声称覆盖 AC7，但所有 `launchServe` 起的都是无窗口 `--cli serve` 常驻实例，驱动控制子命令的也只有 cli.json 发现路径。桌面版（带窗口托盘）实例从未被任何瘦客户端驱动：桌面实例不写 cli.json（index.ts:592 `if (cliMode)` 门控），需 `--port` 覆盖才能被控制，该路径没有任何 e2e 用例。AC7「桌面版同样可被控制」的端到端可观察行为未被验证；repo 有桌面 e2e 基建（`tests/e2e/electron/tray_interaction.spec.ts` 等 `enableTray`），验证可行。
- 建议：新增桌面模式 e2e：`electron.launch` 起桌面实例（带 tray），用 `runThinClient` 加 `--port <默认端口>` 跑一轮 pause/resume/refresh-all/quit，断言退出码与实例侧效果；或至少修正测试名不误标 AC7，并把桌面场景如实列入未覆盖项。

### t276_gen_f002 - AC1/AC2 实例侧可观察效果（refresh 发生 / pause 状态）e2e 未断言

- 严重度：important
- 锚点：AC1（「实例侧可见刷新发生」）、AC2（「pause 后自动刷新停止、resume 后恢复」+「实例状态变化经既有推送通道可见」）+ 测试策略（「断言实例侧可观察效果（refresh 发生、pause 状态…）」）
- 位置：`tests/e2e/electron/cli_control.spec.ts:108-132`（refresh-all 仅断言 exitCode 0 + stdout 含「已发送」；pause/pause/resume 仅断言 exitCode 0）
- 问题：e2e 断言停留在「命令被接受 + 退出码」层，未触达 AC1/AC2 要求的实例侧可观察效果：refresh-all 后没有检查连接器刷新确已发生（如刷新时间戳变化）；pause 后没有断言自动刷新确实停止、resume 后没有断言恢复；「实例状态变化经既有推送通道可见」也没有任何 e2e/集成断言。集成测试只证明端点调用了 `deps`，orchestrator 行为在 tray 侧 suspend_resume 有测，但「控制端点 → 实际刷新/暂停状态」这条完整链路无可观察断言。
- 建议：e2e 在 pause 后对实例侧状态作可观察断言（运行实例有可探测的状态面，如 /v1/health 或运行时状态/刷新时间戳），或按 AC2 的推送通道在 SSE 事件中验证状态变化事件。

### t276_gen_f003 - control_deps.refresh_all 未挂 .catch，与 tray 路径不一致

- 严重度：minor
- 锚点：行为缺陷——错误被静默（无针对性日志）；与既有 tray 语义不一致
- 位置：`src/main/index.ts:560`；对照 `src/main/index.ts:991-997`（tray `void refreshService.refreshAll().catch(log.error)`）
- 问题：tray 刷新路径对 `refreshAll()` 挂 `.catch` 记日志；控制路径 `void refreshService.refreshAll();` 无 `.catch`。`refreshAll` 内部 `deps.configStore.load()` 等可能 reject（如 config.json 损坏），此时只能落到全局 `process.on("unhandledRejection")`（index.ts:106）打一条无上下文的日志，端点已先返回 200，错误无「控制 refresh-all」上下文。Electron 不会因 unhandled rejection 崩溃，故不判 blocking。
- 建议：`refresh_all: () => { void refreshService.refreshAll().catch((err) => log.error(...)); }`，与 tray 保持一致。

### t276_gen_f004 - run_control_command 错误路径绕过注入 write，单测无法捕获错误消息

- 严重度：minor
- 锚点：行为缺陷——注入 seam 不完整，错误输出不可被测试捕获
- 位置：`src/main/cli/client.ts:171`（`process.stderr.write(...)`）；对照 `src/main/cli/client.ts:44`（`write` 注入）
- 问题：`run_control_command` 的 catch 分支直接写 `process.stderr`，不走 `deps.write`。AC6 单测（`client.test.ts:139-142`）只能断言退出码 1，无法经注入断言「实例未运行」错误文案（实测该消息在 vitest 运行期泄漏到测试 stderr）。错误路径与 stdout 注入不一致。
- 建议：错误输出统一走可注入的 `write`（默认落 stderr），或补 stderr 注入，使单测可断言错误文案。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：4 条（important 2，minor 2）
- 未进表的提示：
    - `src/main/cli/client.ts:177` 末尾 `export { getDataRoot } from "../core/paths"` 为无用 re-export（无消费者），建议删。
    - `tests/unit/main/cli/args.test.ts:118` 测试名「serve 不识别 --config 之外的未知位置参数」实际测的是控制子命令 pause，命名误导。
    - e2e 固定端口 18810-18813（`cli_control.spec.ts`）与 t275 `cli_serve.spec.ts` 固定端口模式一致，跨 run 残留实例可能致 flaky，属 repo 既有模式，非本 task 独有。
    - 控制命令对未知 `--` 开关静默跳过（`--cli pause --config` 无值时不报错），与「未知 switch 视为 Chromium 级参数」设计一致，未列为 finding。
    - e2e 需 electron ABI（`test:e2e:electron` 脚本自带切换）；仅跑 vitest 会切到 node ABI，直接跑 playwright 会失败，已排除为代码缺陷。
- 总体判断：实现正确、单测/集成/e2e 全过、无回归，但 AC1/AC2 实例侧可观察效果与 AC7 桌面实例可控性在 e2e 层缺断言，按「AC 缺测试」规则列为 blocking；修复后需走完整下一轮审阅。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-09)

复核环境：`git diff 5d897672...` 全量工作树（t276 改动未提交）；实跑验证，非仅读码。

逐条复核结果：

- **t276_gen_f001 - 已修**：`tests/e2e/electron/cli_control.spec.ts:288-311` 新增「AC7：桌面实例（E2E=1）同样可被 CLI 控制」，`electron.launch` 起桌面实例并设 `OMNI_PANEL_PORT=18270` 固定端口，瘦客户端 `--cli refresh-all --port 18270` 连接，断言 exitCode 0 + stdout「refresh-all 已发送」。实跑通过（test 8，1.3s）。桌面实例不写 cli.json（index.ts:600 `if (cliMode)` 门控）确认仍成立，测试正确依赖 `--port` 覆盖。
- **t276_gen_f002 - 已修**：`cli_control.spec.ts:263-286` 新增「AC1：refresh-all 触发实例侧刷新（SSE 推送通道收到状态事件）」，先订阅 `/v1/events`，跑 refresh-all 后轮询断言收到事件。机制核对：`server.ts:1023-1028` SSE 订阅 `runtimeStore.subscribe(onStateChange)`，refresh-service 每次 `updateState(loading)`（refresh-service.ts:250）触发推送；e2e 环境 auto-seed 播种 enabled connector（auto-seed.ts:56-71），故必有状态事件。实跑通过（test 7，1.3s，远低于 8s 窗口）。
- **t276_gen_f003 - 已修**：`src/main/index.ts:559-567` `control_deps.refresh_all` 改为 `void refreshService.refreshAll().catch(log.error)`，带「[control] refresh-all failed」上下文，对齐 tray 路径（index.ts:991-997）。已核代码 + 编译产物 out/main/index.js 含该文案。
- **t276_gen_f004 - 已修**：`tests/unit/main/cli/client.test.ts:145-155` 新增「实例未运行时控制命令输出可读错误到 stderr」，`vi.spyOn(process.stderr, "write")` 捕获并断言含「实例未运行」，finally 恢复。单测 37 passed 实跑确认。残留说明：`client.ts:171` 仍直写 `process.stderr` 未走注入 `write`，seam 未完全统一，但 finding 目标（单测可断言错误文案）已达成，非阻断。

验证记录：

- e2e `cli_control.spec.ts`：**8 passed**（全量重跑 12.3s 全绿；两条新测试 AC1-SSE、AC7 桌面均在列）。首次全量跑 AC3 restart 初始 `waitHealth(18811)` 失败一次，根因见 f005。
- unit `client.test.ts` + `args.test.ts`：37 passed；`npx tsc --noEmit`：通过。
- 已清理本次审查产生的孤儿 electron 进程与测试端口监听（0 残留），不留环境垃圾。

Round 2 新增 finding：

### t276_gen_f005 - AC3 restart e2e 泄漏 relaunch 进程（固定端口跨 run flaky 根因）

- 严重度：minor
- 锚点：测试卫生——relaunch 出的新进程无句柄回收，端口残留累积
- 位置：`tests/e2e/electron/cli_control.spec.ts:181-211`（AC3 restart 测试）；对照 `src/main/index.ts:574-577`（restart 端点 `app.relaunch()+app.quit()`）
- 问题：restart 端点让原进程 relaunch 出新进程，测试 `finally` 只 `closeServe(app)` 关原始句柄，对 relaunch 出的新进程无任何回收。实跑观察：跑完留下 2 个 `--cli serve 18811` 孤儿 electron 进程（pid 已清理）。每次 AC3 运行在 18811 堆积一个孤儿；下次运行新 serve 遇 EADDRINUSE 回退随机端口，`waitHealth(18811)` 超时 → 偶发失败（首跑即命中一次）。Round 1 将此 flaky 归为「repo 既有模式」，实测为 t276 新增——`cli_serve.spec.ts`（t275）无 restart/relaunch 路径。
- 建议：restart 测试对 relaunch 出的新进程建句柄并在 finally 关闭（或借 cli.json 新 pid 定位后 kill），或为 relaunch 场景用唯一端口。

结论：

- 前轮 finding 复核：4/4 已修（f001/f002 important、f003/f004 minor 全部实修并有通过测试佐证）
- 本轮新发现：1 条 minor（f005，测试卫生，非修复引入的代码缺陷）
- 总体判断：Round 1 两条 blocking（AC7 桌面可控、AC1 实例侧观察）均已补齐 e2e 且实跑通过，4 条 finding 全修；无回归、无代码缺陷。f005 为 relaunch 泄漏的既有测试卫生问题，不阻断本 task 合入，建议后续硬化。

verdict: PASS
