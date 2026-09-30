# Task review t536（reviewer_focus: 测试）

- task：`t536_flowercloud_login_exit_lifecycle`
- spec：`docs/tasks/t536_flowercloud_login_exit_lifecycle/spec.md`
- diff_anchor：`289f1a8c39b70b663b56cb9b8dbfabce33c7bf89`
- target：`git -C '/Users/karson/kar/code/omni_panel_t536' diff 289f1a8c39b70b663b56cb9b8dbfabce33c7bf89`
- round：1
- reviewed_at：2026-09-30T01:12:09+08:00

## Findings

### t536_test_f001 - AC-001 契约字面与交付已知限制不符（初始化前出口不落日志），spec 未同步

- 严重度：minor（按共享规则「实现合理但与 spec 描述不符（spec 过时）→ 处置为改 spec，不计 FAIL」定级）
- 锚点：AC-001「应用内所有显式退出入口……在日志中写入可区分的来源标识与同一 trace，可据此判定退出请求方」
- 位置：`src/main/index.ts:164`（cli.help，位于 `initLogging` `src/main/index.ts:224` 之前）；`tests/unit/main/quit_source.test.ts:117`；`docs/blueprint/architecture.md`（本 diff 新增的退出埋点「已知限制」段）
- 问题：AC-001 字面要求 12 处入口全部「在日志中写入」来源与 trace。交付实现对日志初始化前的出口（`cli.help` / `cli.export` / `cli.control`、`single-instance.lock-lost`、`initLogging` 之前的启动失败路径，至少 5 个调用点）只调用 `log.info` 而当时零 transport，记录不落任何文件——`quit_source.test.ts:117` 用例把该分支固化为「不抛错且状态仍可读」的预期。注入契约区 AC-001 与可测试性声明均未记载该限制，按契约字面这些入口不满足 AC-001。
- 建议：同步 spec AC-001 措辞（注明初始化前出口仅内存登记、不落盘，或收窄为「日志初始化后入口全部落盘」），处置为改 spec 即可闭合；若要求真落盘需另立任务调整「配置先于日志」初始化顺序。

### t536_test_f002 - AC-001 关键链路无自动化断言：调用点 source 语义与 before-quit 关联行仅靠手动黑盒自述

- 严重度：minor
- 锚点：AC-001（漏斗行为已有 6 例单测，非「完全无测试」亦非假行为，按 blocking 硬阈值不升级）
- 位置：`src/main/index.ts:1562`（`before-quit` 关停行）；`tests/unit/main/quit_source.test.ts:69`（仅测漏斗本身）；`tests/e2e/electron/cli_control.spec.ts:227`（quit 断言只查 stdout「quit 已发送」与干净退出，不含日志来源）
- 问题：现有自动化只覆盖 `quit_source.ts` 漏斗行为（日志字段、共享 trace、12 项目录固定）与 eslint/type 层约束。(a) 12 个调用点各自传入的 source 是否与场景语义一致（如 tray.quit 不误标 menu.cmd-q）无任何测试，typecheck 拦不住语义错配；(b) `before-quit` 关停行 `exit_source` / 同 `trace_id` 关联（真实日志中「判定退出请求方」的落点）无断言；(c) 真实运行日志落盘证据仅 task.md 手动黑盒记录（claim），testing.md 记载的黑盒断言步骤未固化为可重复执行的测试。
- 建议：补一个黑盒/e2e 用例断言真实日志含 `Exit requested: source=...` 且 `Application shutting down` 携带同 `trace_id`；或至少对 12 个调用点做逐一触发的参数化断言。

### t536_test_f003 - 重构删除 p258 源文本断言后，index.ts 焦点接线失去唯一自动化哨兵

- 严重度：minor
- 锚点：AC-004（三种面板状态行为已有 6 例测试固定，接线层缺口不满足 blocking 硬阈值）
- 位置：`tests/unit/main/tray_menu.test.ts:94`（删除处）；`src/main/index.ts:1540`（`browser-window-focus` → `handle_browser_window_focus` 接线）；`tests/unit/main/main_panel_controller.test.ts:826`（`focus_session` 由测试自注入 `hide_panel` / `hide_tray_menu` wiring）
- 问题：被删的 p258 用例是唯一检查 index.ts 真实接线的哨兵。AC-004 新测试全部直接调 `handle_browser_window_focus` 且回调 wiring 由测试自己提供，若 index.ts 漏注册处理器或传错 deps（如 `hide_tray_menu` 未接 `hideTrayMenu`），全部测试仍绿，真实行为回归无感知。删除本身合法（源文本断言绑定旧内联实现、理由已写在删除处、行为语义由 p258 纯函数组 + AC-004 组同层补回），但接线层覆盖未在更高层补回。
- 建议：补一层接线断言（集成测试触发 `browser-window-focus` 事件，或对 index.ts 接线做最小 smoke），或在 spec「有意不测」明确豁免该层。

### t536_test_f004 - AC-002 用例存在时序耦合：flower-2 必须在 flower-1 600ms 预算内完成，慢机可能误报

- 严重度：minor
- 置信度：低—中
- 锚点：AC-002 可自动化部分的测试稳定性（flaky 风险，非掩盖失败）
- 位置：`tests/unit/session/session-manager.test.ts:1845-1848`
- 问题：`await other` 之后立即断言 `expect(deps.windows[0]?.closed).toBe(false)`，依赖 flower-2 刷新在 flower-1 的 `timeout_ms: 600` 预算耗尽前完成。若机器负载使 flower-2 耗时超过 600ms，flower-1 先走预算耗尽关闭窗口，该断言误报失败，且失败信息会误导为「会话不隔离」。
- 建议：改为断言 flower-1 仍登记中（`is_login_in_progress("flower-1") === true`）等不与预算计时竞赛的状态，或拉大 flower-1 预算并以 flower-2 完成为同步点。

## 结论

- 前轮 finding 复核：首轮，无。
- 改测方向复核：无。既有测试断言未被就地改写；唯一旧测试改动是 `tray_menu.test.ts` 整体删除 p258 源文本用例并附理由（覆盖缺口分析见 f003），不属「迁就实现改预期」。
- 本轮新发现：4 条（均 minor）。危险模式扫描已逐条调查、无 important+ 命中：无恒真断言、无删除/反转/注释断言残留、无 `.skip`/`.only`、测试文件未加 `eslint-disable`/`@ts-ignore`、electron mock 属系统边界而非 mock 被测逻辑、无阈值增大掩盖、无条件跳过断言、无程序赋值替代交互场景；「删测试」命中 1 处（tray_menu p258）经判断为合法删除，理由与残留缺口见 f003。
- 未进表的提示：
    1. AC-003「取消」入口 `session-manager.cancel()`（t505 抢占路径）本身无 t536 退出断言；关窗路径与 `finish_with_error`（超时例）已分别覆盖收尾语义，属可选扩展。
    2. AC-002「其它连接器刷新不中断」以花云第二实例代理，非花云 provider 的刷新连续性未直接断言；属可选扩展。
    3. d064 的「18 个 headless 失败在基线 commit 同样失败」与「cli_control.spec 7 passed」为实施侧 stash 对照记录（claim），reviewer 未重跑 e2e 复验。
    4. reviewer 独立复验：`pnpm exec vitest run` 重跑 4 个涉改测试文件 126 例全绿；`rg` 确认 `src/` 内 `app.quit()` / `app.exit()` 仅存于 `quit_source.ts` 与注释，12 个调用点全部经漏斗。
- 总体判断：无未解决 critical / important，4 条 minor 均不阻断；四条 AC 均有触达生产逻辑的真实覆盖，测试可信，PASS。
- 系统性 follow-up：只读 `task.py list` 未见等价 tid；建议标题「electron e2e headless 预存 18 失败根因定位」、slug `electron_e2e_headless_baseline_failures`、阻断性：非阻断（对应已有 finding d064）。

### AC 复验方式

- AC-001：trust_prior——漏斗日志单测与 12 调用点接线已独立复验（重跑 `quit_source.test.ts` 6 例全绿 + `rg` 逐点核对无裸调用），但真实运行落盘与 trace 关联依赖 task.md 手动黑盒记录，reviewer 未跑 electron 黑盒；早期出口不落盘的契约差距见 f001。
- AC-002：trust_prior——进程存活 / 托盘可用 / 主面板重新唤起按可测试性声明属上线后回填项；可自动化部分（登记释放、其它实例刷新继续、退出 API 零调用）已重跑 2 例全绿。
- AC-003：re_verified——重跑 `session-manager.test.ts` AC-003 例通过，断言覆盖关窗、登记释放、复刷成功、`expect_no_app_exit()` 三通道（漏斗 + 两路 electron spy）零调用。
- AC-004：re_verified——重跑 `main_panel_controller.test.ts` 51 例全绿，6 例组合断言 popup 收起 / floating 常驻 / 钉住豁免 / 焦点在面板 / 已销毁 / 托盘焦点，含可见性、`destroyed` 与退出 API 零调用。

coverage = 2 / 4
建议合并前人工抽查 trust_prior 项

reviewed_scope: 392d6b77aada2d06

verdict: PASS

## Round 2 (2026-09-30T01:38:44+08:00)

- round：2
- reviewed_at：2026-09-30T01:38:44+08:00

reviewed_scope: 5a4b91f18546578c

## Findings

### t536_test_f005 - f002 修复不彻底：调用点 source 语义错配、index 关停行接线、真实运行端到端日志链路三处仍无自动化断言

- 严重度：minor（覆盖类：AC-001 已有真实覆盖——漏斗日志/trace、无 transport 落盘、关停 meta、目录一致性扫描共 8 例，非完全无测试亦非假行为，按 blocking 硬阈值不升级）
- 锚点：AC-001「可据此判定退出请求方」的自动化证据链完整性
- 位置：`tests/unit/main/quit_source.test.ts:177`（一致性扫描仅保集合相等）；`tests/unit/main/quit_source.test.ts:166`（`get_shutdown_log_meta` 仅函数层单测，`src/main/index.ts:1560` 接线无断言）；`tests/e2e/electron/cli_control.spec.ts:227`；`docs/blueprint/testing.md`「黑盒（真实运行，可自动）」段
- 问题：
    1. Round 1 f002(a) 半修：新增的 `QUIT_SOURCES`↔调用点扫描用正则提取 `request_app_quit/app_exit` 首参字面量做集合相等，能拦「目录死项 / 调用点漏登记」，拦不住语义错配——若 `src/main/index.ts:1428` 托盘处理误标 `"menu.cmd-q"`，集合不变、测试仍绿，日志将误导「谁请求了退出」。
    2. Round 1 f002(b) 半修：`get_shutdown_log_meta` 有函数层单测（untracked / 首请求方 / 同 trace 三断言），但 `index.ts:1560` `before-quit` 是否真把该 meta 传入关停行无任何断言，摘掉接线测试仍绿。
    3. Round 1 f002(c) 未动：真实运行「`Exit requested: source=...` 与 `Application shutting down` 携带同一 `trace_id`」仍只有 task.md 手动黑盒记录（claim）与 testing.md 手动步骤；`cli_control.spec.ts:227` 的 quit 断言仍只查 stdout「quit 已发送」与干净退出，不含日志来源。
- 建议：对 12 个调用点做逐一触发的参数化断言（或做调用点↔source 的位置关联扫描）；给 index `before-quit` 接线补最小哨兵；把 testing.md 黑盒步骤固化为可重复执行的用例（headless e2e 或脚本断言日志行）。

## 结论

- 前轮 finding 复核（以 diff / 代码为准，不采信处置表自称）：
    - t536_test_f001：已消除——`record()` 在无 transport 时经 `persist_without_transport`（`src/main/core/quit_source.ts:63` 判空、`:75` 函数体）同步 `appendFileSync` 到 `getCurrentLogFilePath`（`src/main/core/logging.ts:71`，与写路径同 `getLogFilePath(getLogDir(...))` 命名约定）；测试由 Round 1 的「不抛错」强化为真实读文件断言 `module`/`message`/`trace_id`/`meta.source`（`tests/unit/main/quit_source.test.ts:133-155`，重跑通过）；`docs/specs/app_quit_lifecycle.md:9` 与 `docs/blueprint/architecture.md` §3 口径改为「12 处出口来源行都可落盘」，原「早期出口不落文件」例外段已删除，与注入契约区 AC-001 字面一致。
    - t536_test_f002：修不彻底——(b) 函数层已补 `get_shutdown_log_meta` 单测，(a) 只补到集合一致性、语义错配仍盲，(c) 端到端仍未自动化；残留续编为 f005。
    - t536_test_f003：已修复——`tests/unit/main/tray_menu.test.ts:95` 新增 `expect(main_source).toContain("handle_browser_window_focus")`（与既有 `:87` `browser-window-focus` 哨兵同测试），恢复「index 委托入口未被摘除」的自动化哨兵，漏注册可被发现；deps **值级**接错（如 `hide_tray_menu` 接空函数）仍无断言，但属性名与结构由 `BrowserWindowFocusArgs` 约束、typecheck 可拦，属残余理论缺口，列提示不进表。
    - t536_test_f004：已修复——`tests/unit/session/session-manager.test.ts:1837` flower-1 预算 600→2000ms 并注明解耦意图，`await other`（flower-2 毫秒级完成后）于 `:1849` 断言 `windows[0].closed === false` 与预算计时实际脱钩；重跑该例 2004ms 通过（flower-2 先完成、flower-1 走满预算后关窗）。
- 改测方向复核：无。Round 1→2 三处测试改动均有归因且方向为变强或解耦：no-transport 用例弱断言→文件内容断言（配套实现新增落盘，断言升级）；flower-1 预算 600→2000（f004 本人给出的解耦建议，实现未变、断言未弱）；tray_menu 新增哨兵（纯增量）。无就地改预期、无删除/注释断言。
- 危险模式扫描（逐条调查后）：`tray_menu.test.ts:87/95` 源文本 `toContain` 为接线存在性哨兵，非 AC 唯一证据（AC-004 行为由 6 例行为测试固定），不构成「存在即通过」；`quit_source.test.ts:72` `toBeDefined()` 是 `meta_of` 取值前置守卫、其后均有具体字段断言；600→2000 属评审建议的时序解耦而非阈值掩盖（预算耗尽后关窗、登记释放断言原样保留）；无 `.skip`/`.only`、无恒真断言、无注释/反转/删除断言、测试文件无 `eslint-disable`/`@ts-ignore`、electron mock 位于系统边界（非 mock 被测逻辑）、无条件跳过断言、无程序赋值替代交互；本轮无删测试。7 视角正交体检：本轮增量落在「测试·文档·规格」维度（f005 即该维度），安全/正确性/契约/性能/架构/健壮性视角扫描本轮改动（测试 + 落盘兜底 + 文档）未见新命中。
- 本轮新发现：1 条（f005，minor）。
- 未进表的提示：
    1. AC-003「取消」入口 `session-manager.cancel()`（t505 抢占路径）仍无 t536 退出断言（沿 Round 1，可选扩展）。
    2. `request_app_exit` 的无 transport 兜底与「flush 先于 `app.exit`」顺序无直接用例（`record()` 共享兜底已被 quit 路径覆盖，残余为组合缺口，可选）。
    3. `persist_without_transport` 的 catch 失败分支（兜底写失败 → stderr 告警）未测。
    4. d064「18 个 headless 失败在基线同样失败」与 task.md 黑盒 `trace_id=66b31f3c` 记录仍为实施侧 claim；reviewer 未重跑 e2e、未起真实 electron（会弹窗，需用户许可）。
    5. reviewer 本轮独立复验：指纹重算 `5a4b91f18546578c` 与注入值一致（无审查后改动）；`pnpm exec vitest run` 4 个涉改测试文件 128 例全绿；全量 `pnpm test` 341 文件 4257 passed / 1 skipped；`pnpm typecheck` 绿；`rg` 复核 `src/` 内 12 个漏斗调用点字面量与 `QUIT_SOURCES` 一一对应、无裸 `app.quit()/app.exit()`。
- 总体判断：前轮 4 条 minor 中 3 条真修、1 条修不彻底（残留为 f005，仍 minor），无未解决 critical / important，测试触及生产逻辑且断言可信，PASS。
- 系统性 follow-up：本轮无新增；沿 Round 1 建议项（d064 对应「electron e2e headless 预存 18 失败根因定位」）。

### AC 复验方式（Round 2）

- AC-001：trust_prior——单测层已独立复验（重跑 `quit_source.test.ts` 8 例全绿：含真实读文件的无 transport 落盘断言、关停 meta 三断言、目录↔调用点扫描；`rg` 复核 12 调用点；`index.ts:1560` 接线代码查证），但进程级真实运行整链（`Exit requested` + 同 trace 关停行落盘）仍依赖 task.md 黑盒记录，reviewer 未起真实 electron（会弹窗需许可）；语义/接线/端到端残留见 f005。
- AC-002：trust_prior——进程存活 / 托盘可用 / 主面板重新唤起按可测试性声明属上线后回填项；可自动化部分重跑 3 例全绿（预算耗尽登记释放、其它实例刷新继续、超时收尾、退出 API 零调用双通道）。
- AC-003：re_verified——重跑关窗/取消例通过，断言覆盖关窗、登记释放、复刷成功、`expect_no_app_exit()`（漏斗 + 两路 electron spy）。
- AC-004：re_verified——重跑 `main_panel_controller.test.ts` 51 例全绿，6 例组合断言可见性 / `destroyed` / 退出 API 零调用，另有 index 委托入口哨兵（`tray_menu.test.ts:95`）。

coverage = 2 / 4
建议合并前人工抽查 trust_prior 项

verdict: PASS

## Round 3 (2026-09-30T08:48:20+08:00)

- round：3
- reviewed_at：2026-09-30T08:48:20+08:00

reviewed_scope: 401b0b8c256a4510

## Findings

Round 3 零 finding。

## 结论

- 前轮 finding 复核（仅 t536_test_f005 为前轮未闭合项；以 diff / 代码为准，不采信处置表自称）：
    - **t536_test_f005：已消除**，三个子项逐一核实：
        1. (a) 调用点 source 语义——本轮 reviewer 用 `rg 'request_app_quit\("|request_app_exit\("' src/` 独立列出 12 处调用点逐一对照触发场景，全部匹配：`src/main/menu/application-menu.ts:50` 菜单 Cmd+Q else 分支（`src/main/index.ts:1175` 未传 `on_quit`，必然走漏斗）→ `menu.cmd-q`；`src/main/index.ts:159/165/179` help/export/control → `cli.*`；`:904/907` 控制 API restart/quit → `control-api.*`；`:1428/1432` TRAY_QUIT/TRAY_RESTART IPC → `tray.*`；`:1625` will-quit `.finally()` 重入 → `will-quit.flush-retry`；`:1658/1670` 启动失败两路 → `startup.*`；`src/main/bootstrap/cli_init.ts:74` 单实例锁竞争失败回调 → `single-instance.lock-lost`。无错配。静态测试确无法判定语义（处置表此点判断成立），当前交付的语义正确性由本轮 reviewer 独立核对闭合；未来语义漂移无自动 guard 属固有限制，列提示不进表。
        2. (b) index 关停行接线——`src/main/index.ts:1560` before-quit 实调 `log_application_shutdown()`（`:129` 导入）；`tests/unit/main/tray_menu.test.ts:97` 接线哨兵 `toContain("log_application_shutdown")`。摘掉接线会连带 `:129` 导入变未使用（lint 拦截）且 e2e 关停行断言归零（见下条），与 Round 2 已接受的 `handle_browser_window_focus` 哨兵同型，判定消除。
        3. (c) 真实运行端到端——`tests/e2e/electron/cli_control.spec.ts:235-275` 新增：解析实例 `userDataDir/logs/app-*.log` 全部 JSON 行，断言 `meta.source==="control-api.quit"` 记录存在且 `trace_id` 非空（`:261-264`）；`will-quit.flush-retry` 记录 >0 且**全部**与实例 `trace_id` 相等（`:266-270`）；`Application shutting down` 记录 >0 且全部同 trace（`:271-275`）。断言为 filter + `every` 全称相等，非存在性断言，弱化不成立。flush-retry 必然触发已核机理：`src/main/index.ts:228` `logging_cleanup_done` 初值 false 且仅在该分支内置真 → 首次 will-quit 必走 `preventDefault` + `.finally` 重入，断言不 flaky。取数口径两条写入路径均成立：logger 路径由 `src/shared/lib/logger.ts:294-308` `create_record` 从 meta 提取顶层 `trace_id`，兜底路径由 `quit_source.ts` `persist_log_line` 直接写顶层字段；关停行唯一产出点即 `log_application_shutdown`，记录缺失即接线缺失，断言可发现摘接线。
        4. Round 3 追加项——`tests/unit/main/quit_source.test.ts:200-227`「logLevel 过滤 info 时关停行同样同步落盘」实读文件断言 `module==="main"` / `message==="Application shutting down"` / `meta.exit_source==="tray.quit"` / `trace_id===get_quit_trace_id()`，走真实 fs 落盘断言，非恒真、非 mock 被测逻辑；重跑通过。
    - t536_test_f001 / f002 / f003 / f004：维持 Round 2 已消除结论，本轮 diff 未回退相关交付（quit_source 落盘兜底、tray 委托哨兵、AC-004 组、2000ms 解耦均在位）。
- 改测方向复核：无。Round 2→3 测试侧改动均为增强或哨兵同步：e2e 同 trace 全称断言为纯增量；`tests/unit/main/tray_menu.test.ts:97` 哨兵由 `get_shutdown_log_meta` 改指 `log_application_shutdown`（实现收敛为统一出口后的同步，接线哨兵本随实现形态走，被断言语义另有单测与 e2e 断言兜底，非削弱）；logLevel 关停行单测为纯增量。无就地改预期、无删除/注释/反转断言。
- 危险模式扫描（逐条调查后）：无恒真断言（`toBeDefined` / `toBeTruthy` 均为取值前置守卫，其后均有全称相等或字段断言）；无删除/反转/注释 expect（Round 2→3 零删除，Round 1 的 p258 删除已在 Round 2 判合法）；无新增 `.skip`/`.only`（`tests/e2e/electron/cli_control.spec.ts:344` 为 t276 既有平台条件 skip，不在本 diff）；测试文件无 `eslint-disable` / `@ts-ignore`；electron mock 位于系统边界（`app.quit`/`app.exit`/`getPath`），未 mock 被测漏斗或会话逻辑本身；无 timeout/容差增大掩盖（2000ms 为 Round 1 建议的解耦，本轮未动）；无条件跳过弱化断言；e2e 对非 JSON 行的忽略不构成掩盖（全称断言仍要求目标记录存在且全部相等）。7 视角正交体检：安全 / 正确性 / 契约·Breaking / 性能·资源 / 架构·可维护性 / 健壮性·可观测 / 测试·文档·规格均已扫描本轮改动（测试 + 关停行出口收敛 + 文档），命中为零。
- 本轮新发现：0 条。
- 未进表的提示：
    1. `tests/unit/main/tray_menu.test.ts:97` 哨兵亦可由 `src/main/index.ts:129` 的 import 行单独满足（纯接线哨兵的固有精度限制），实际由 lint 未使用导入 + e2e 关停行断言兜底，不进表。
    2. e2e 与真实 electron 链路 reviewer 未复跑（起窗须用户许可）；`cli_control 7 passed`、d064 基线对照、task.md 黑盒 `trace_id=66b31f3c` 记录仍为实施侧 claim。
    3. 沿 Round 1/2 提示不变：AC-003 `session-manager.cancel()` 入口无退出断言、非花云连接器刷新连续性未直接断言（均可选扩展）。
    4. reviewer 本轮独立复验：`pnpm exec vitest run` 重跑 4 个涉改单测文件 130 例全绿（quit_source 10、tray_menu 4、main_panel_controller 51、session-manager 65）；`rg` 复核 `app.quit()`/`app.exit(` 仅存于 `src/main/core/quit_source.ts:112/120` 与注释，12 个调用点字面量与 `QUIT_SOURCES` 一一对应；`git status --short` 无 reviewer 不可见的未跟踪交付文件。
- 总体判断：t536_test_f005 三子项均以 diff / 代码核实消除，本轮零新发现，无未解决 critical / important，测试可信且触及生产逻辑，PASS。
- 系统性 follow-up：本轮无新增；沿 Round 1 建议（d064「electron e2e headless 预存 18 失败根因定位」）。

### AC 复验方式（Round 3）

- AC-001：trust_prior——单测层 re_verified（重跑 `quit_source.test.ts` 10 例：真实文件落盘、logLevel 兜底、关停 meta、一致性扫描；`rg` 逐一核对 12 调用点语义；`src/main/index.ts:1560` 接线查证），真实运行整链依赖实施侧 e2e `cli_control 7 passed` 与 task.md 黑盒 trace 记录，reviewer 未起真实 electron（会弹窗需许可）。
- AC-002：trust_prior——进程存活 / 托盘可用 / 主面板重新唤起按可测试性声明属上线后回填项；可自动化部分（登记释放、其它实例刷新继续、退出 API 零调用）重跑 3 例全绿。
- AC-003：re_verified——重跑关窗/取消例通过，断言覆盖关窗、登记释放、复刷成功、`expect_no_app_exit()` 三通道。
- AC-004：re_verified——重跑 `main_panel_controller.test.ts` 51 例全绿，6 例组合断言可见性 / `destroyed` / 退出 API 零调用，另有 index 委托入口哨兵（`tray_menu.test.ts:96`）。

coverage = 2 / 4
建议合并前人工抽查 trust_prior 项

verdict: PASS
