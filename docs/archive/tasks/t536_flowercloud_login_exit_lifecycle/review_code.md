# Task review t536（reviewer_focus: 代码）

- task：`t536_flowercloud_login_exit_lifecycle`
- spec：`docs/tasks/t536_flowercloud_login_exit_lifecycle/spec.md`
- diff_anchor：`289f1a8c39b70b663b56cb9b8dbfabce33c7bf89`
- target：`git -C '/Users/karson/kar/code/omni_panel_t536' diff 289f1a8c39b70b663b56cb9b8dbfabce33c7bf89`
- round：1
- reviewed_at：2026-09-30T01:15:48+08:00

reviewed_scope: 392d6b77aada2d06

## Findings

### t536_code_f001 - AC-001 有 5 处退出入口的来源记录写不进任何日志 sink，且例外口径只在新 spec 中单方面出现

- 严重度：important
- 锚定：AC-001 —— 要求 12 处显式退出入口「在日志中写入可区分的来源标识与同一 trace，可据此判定退出请求方」。观察差距：`cli.help` / `cli.export` / `cli.control` / `single-instance.lock-lost` / `will-quit.flush-retry` 五处的 `Exit requested` 行在生产中永远不落任何 sink（日志无法回答这些退出的请求方）；`startup.cli-failure` / `startup.failure` 在日志初始化前抛出时同样落空。
- 位置：`src/shared/lib/logger.ts:269`、`src/main/core/logging.ts:213`、`src/main/index.ts:164` / `:170` / `:184` / `:224` / `:1634`、`src/main/bootstrap/cli_init.ts:74`、`src/main/core/logging.ts:306`
- 问题：
    1. `emit()` 只向已注册 transport 写（`logger.ts:269-271`）；transports 唯一注册点是 `initLogging`（`logging.ts:213`，由 `index.ts:224` 调用），唯一移除点是 `cleanupLogging`（`logging.ts:306-307`）。
    2. `cli.help`（`index.ts:164`，兜底分支）、`cli.export`（`index.ts:170`）、`cli.control`（`index.ts:184`）均在 `index.ts:224` 之前 `return`；`single-instance.lock-lost`（`cli_init.ts:74`）在模块加载期触发——四处 `record()` 写入 0 个 sink，进程退出后内存记录随之丢失。
    3. `will-quit.flush-retry`（`index.ts:1634`）位于 `cleanupLogging()` 完成之后的 `.finally()` 内，此时 file/console transport 已被 remove；`cleanupLogging` 内部全为不可 reject 的 await（`logging.ts:303-309`），故各分支下这条记录**必然**丢失，且该丢失在任何文档中均未说明。
    4. `catch`（`index.ts:1654`）可在 `index.ts:224` 之前触发（config load / connector discovery / seed 事务均在其前），此时 `startup.cli-failure` / `startup.failure` 无 sink。
    5. 同一次交付新增的 `docs/specs/app_quit_lifecycle.md:9` 单方面写入「早期出口不落文件」例外，而 task 契约区 AC-001 无此例外，该例外也未覆盖第 3 点——两份 spec 对同一条 AC 口径不一致。
    6. 单测 `tests/unit/main/quit_source.test.ts:117` 对无 transport 场景只断言「不抛错」；AC-001 的日志断言靠测试自注入 transport 完成，掩盖了生产无 sink 的事实。
- 建议：二选一——(a) `record()` 在 transports 为空时兜底写 stderr（CLI 已有 stderr 约定，`index.ts:1666`），并把 flush-retry 的记录提前到 `cleanupLogging()` 之前；(b) 确认「配置先于日志」约束（`index.ts:191-194`）不可动后，走处置流程修订 AC-001 写明例外并同步两份 spec。按当前契约区字面，AC-001 属部分未落地。

## 结论

- 本轮新发现：1 条
- 未进表的提示：
    - 文件过大（按降级规则只列不进表）：`src/main/index.ts` 1685 行（实现源码 ≥800，本 task 净增 +9）；`tests/unit/session/session-manager.test.ts` 1909 行（测试 ≥1200，净增 +130）；`tests/unit/main/main_panel_controller.test.ts` 913 行（测试 ≥600，净增 +128）；`src/main/core/main-panel/main-panel-controller.ts` 489 行（实现源码 ≥400，净增 +32）。`docs/blueprint/conventions.md` 无阈值覆盖，按默认表计量。
    - 圈复杂度：本 task 触及函数手工 McCabe 均 \<10（`handle_browser_window_focus`≈4、`record`≈4），无提示；无项目 CC 工具，未计生成/纯分发函数。
    - 视角覆盖确认（7 视角均已扫过）：**安全**——日志 meta 仅含 `source`/`action`/`exit_code`/`trace_id`，无秘密/PII，source 为静态字面量无拼接注入，新增 eslint 规则不引入配置暴露；**契约·类型**——无公开签名/schema/配置键变更，`request_app_exit` 的 Promise 由 `no-floating-promises` 强制，5 处调用点全 `await`；**性能**——退出路径仅新增一次有界 flush，无循环查询/同步 IO 滥用；**架构**——退出收敛单一漏斗，`pnpm arch` depcruise 408 modules 无违规；**健壮性·可观测**——除 f001 外，`request_app_exit` 中 flush 无超时、无 try/finally 兜底（当前 `logging.ts` 内部全量 catch，实测不可触发，仅作提示）；**文档一致性**——blueprint 两处新增与代码逐条一致，spec 冲突点已归入 f001；**规格**——AC 逐条复验见下。
    - 范围外观察：AC-001 清单以 `app.quit()/app.exit()` 为界，`process.exit()` 出口（`src/main/bootstrap/cli_init.ts:38` / `:43` 即主 help/invalid 路径、`src/main/cli/background_serve.ts` 多处、`src/main/core/connector/worker/connector-worker-entry.ts:56`）无来源埋点——AC 未要求，但蓝图「每个显式退出入口可追溯」的口径宜写清；`index.ts:162` 的 `cli.help` 分支为兜底死分支（`cli_init.ts:36-39` 已 `process.exit(0)` 先行退出）；三个测试文件重复 electron `app.quit/exit` mock 样板（约 13 行 ×3）、委托函数行为已测而 index 接线仅剩字符串断言（`tests/unit/main/tray_menu.test.ts:86`）、AC-002 用另一花云实例代替「其它连接器」断言——均属测试层结构，建议 test reviewer 一并处理。
- AC 复验方式：
    - AC-001：`re_verified` —— grep 复核 `src/` 内 `app.quit()/app.exit()` 仅 `quit_source.ts` 调用，12 个 source 与 spec 扫描表逐条对齐；`pnpm lint` 绿 + `eslint --stdin` 探针确认红路径命中 `no-restricted-properties`（红/绿双路径均实测）；`quit_source.test.ts` 6 例复跑通过。真实运行下 `Exit requested` 与 `Application shutting down` 同 trace 的断言依赖 task.md 黑盒记录（`trust_prior` 部分），且该链路的缺口证据见 f001。
    - AC-002：`trust_prior` —— 主进程存活/托盘可用/主面板可重新唤起需真实运行观察，依赖实施侧黑盒记录与上线后回填项 3；reviewer 仅独立复跑其中可自动化部分（`session-manager.test.ts` 3 例通过：登记释放、其它实例刷新继续、退出 API 零调用）。
    - AC-003：`re_verified` —— `session-manager.test.ts` 关窗/取消收尾与登录超时用例复跑通过（65 例全绿），断言为登记释放 + 漏斗零请求 + electron 退出 API 零调用双通道。
    - AC-004：`re_verified` —— `main_panel_controller.test.ts` 新增 6 例复跑通过（popup 收起 / floating 常驻 / 钉住豁免 / 焦点在面板 / 已销毁 / 托盘焦点）；抽取前后逻辑逐行比对等价（`index.ts:1539-1551` vs `main-panel-controller.ts:82-102`）。
    - coverage = 3 / 4
- 总体判断：漏斗、lint 门禁、焦点委托抽取与会话/焦点回归实现扎实（typecheck / lint / format / deadcode / arch / 相关单测均独立复跑通过），但 AC-001 有 5/12 出口在生产中写不出任何日志行、例外口径又与 task 契约不一致，属未解决 important。
- 系统性 follow-up：建议标题「electron e2e headless 预存失败基线修复」、slug `electron_e2e_headless_baseline_fixes`（源自 `docs/findings/d064`，非本 diff 引入；只读 `task.py list` 未见等价 task）。AC-001 例外处置属本 task 范围，不开新 task。

verdict: FAIL

## Round 2 (2026-09-30T04:34:12+08:00)

- round：2
- reviewed_at：2026-09-30T04:34:12+08:00

reviewed_scope: 5a4b91f18546578c

## Findings

### t536_code_f002 - config logLevel 为 warn/error 时来源行被级别过滤吞掉，兜底不触发，AC-001 无落点

- 严重度：minor（置信度：中；默认配置下 AC-001 成立，缺口仅在用户显式调高日志级别时出现，故不按 important 报出——实施侧处置时可在「修实现」与「spec 注明 logLevel 例外」间二选一）
- 锚定：AC-001「在日志中写入可区分的来源标识与同一 trace，可据此判定退出请求方」的配置条件差距：`logLevel` schema 允许 `warn`/`error`（`src/main/core/config/types.ts:60`），此时 `emit()` 的 `should_log` 过滤（`src/shared/lib/logger.ts:270`）让 `Exit requested` 与 `Application shutting down` 两行都不写；而 transport 仍在，`record()` 的兜底条件 `!has_log_transports()`（`src/main/core/quit_source.ts:63`）不满足 → 不落任何 sink。运行期改级别（`src/main/index.ts:638`）同样生效。
- 位置：`src/shared/lib/logger.ts:270`、`src/main/core/quit_source.ts:62-65`、`src/main/core/config/types.ts:60`、`src/main/core/logging.ts:219`
- 问题：f001 修复只覆盖「无 transport」，不覆盖「有 transport 但该行被级别过滤」，且两路行为不一致——无 transport 兜底无条件写 info（不看 logLevel），有 transport 时 info 被过滤。失败场景：`config.json` 设 `logLevel: "error"` → 托盘退出 → 日志无来源行，无法判定请求方。
- 建议：`record()` 兜底条件改为「无 transport **或** 该行未通过 `should_log`」；或在 `docs/specs/app_quit_lifecycle.md` / `architecture.md` 注明 quit-source 行不受 logLevel 过滤约束（处置为改 spec 即可闭合，不计 FAIL）。

### t536_code_f003 - eslint 退出门禁可被改名 import 绕过，architecture.md「否则 lint 失败」口径不成立

- 严重度：minor（当前代码无绕过实例，不构成 AC-001 现状违约；属门禁强度与文档口径问题）
- 锚定：AC-001 保障机制——`docs/blueprint/architecture.md` 本 diff 新增段断言「新增退出出口必须登记 `QUIT_SOURCES` 并同步本清单，否则 lint 失败」。
- 位置：`eslint.config.ts:50-72`、`docs/blueprint/architecture.md`（「应用退出来源可追溯（t536 AC-001）」段）、`tests/unit/main/quit_source.test.ts:177-203`
- 问题：`no-restricted-properties` 的 `object: "app"` 只匹配标识符 `app`。本轮 stdin 探针实测：`app.quit()` 命中 `no-restricted-properties`（红路径复验通过）；`import { app as electronApp } ... electronApp.quit()` 零报错（alias 旁路实测为绿），`electron.app.quit()` 同理不匹配。一致性测试（`quit_source.test.ts:177`）只比对漏斗调用点字面量与 `QUIT_SOURCES` 集合，不扫描裸退出调用——改名形态下两道防线同时失效，绕过漏斗的新出口不会被任何自动化发现。
- 建议：一致性测试追加「`src/` 内裸 `app.quit()` / `app.exit(`（漏斗文件除外）为零」的源扫描；或补充覆盖 MemberExpression 的 `no-restricted-syntax` selector；`architecture.md` 口径同步收窄为可实证的表述。

### t536_code_f004 - 兜底路径裸调 app.getPath("userData")，与项目 getDataRoot 的防御兜底不一致（低置信）

- 严重度：minor（置信度：低——依赖 `app.getPath("userData")` 抛错这一未实测场景）
- 锚定：AC-001 配套口径「12 处出口的来源行同步追加到**同一活动日志文件**」（`docs/specs/app_quit_lifecycle.md:9`、architecture.md 新增段）的防御性缺口
- 位置：`src/main/core/quit_source.ts:77` vs `src/main/core/paths.ts:11-17`
- 问题：项目自身把 `app.getPath("userData")` 视为可抛错——`getDataRoot()` 用 try/catch 回落 `process.cwd()`，而 `initLogging` 的活动文件正由 `getDataRoot()`（`src/main/index.ts:183`）解析。`persist_without_transport` 裸调 `app.getPath`，若抛错则 catch → `console.warn` → 来源行不落盘，同进程日志「活动文件」两条写路径解析结果不一致，AC-001 的兜底保证在该场景失效。
- 建议：改用 `getCurrentLogFilePath(getDataRoot())`（`quit_source → paths` 与现有 `quit_source → logging` 同向，`pnpm arch` 408 modules 无违规），一行对齐。

## 结论

- 前轮 finding 复核（以 diff / 代码为准，不采信处置表自称；处置表确有 Round 1 行、`t536_code_f001` 标「已修」，但仅作 claim 记录）：
    - **t536_code_f001（important）：已消除。** 逐项核实：(1) 机制——`record()` 在 `has_log_transports()` 为 false 时经 `persist_without_transport`（`src/main/core/quit_source.ts:63-65` / `:75-94`）同步 `appendFileSync` 到 `getCurrentLogFilePath(app.getPath("userData"))`，路径经 `getLogFilePath(getLogDir(...))`（`src/main/core/logging.ts:71-73`，`getLogDir = join(base, "logs")`，`src/main/core/paths.ts:69-71`）与写路径同一命名约定；`has_log_transports` 已加在 `src/shared/lib/logger.ts:181-183`。(2) Round 1 点名的五处出口逐一过：`cli.help`（`src/main/index.ts:159`）、`cli.export`（`:165`）、`cli.control`（`:179`）均先于 `initLogging`（`:219`），`src/` 内 transport 注册点仅 `logging.ts:221`/`:304`（early 期为 0）→ 走兜底；`single-instance.lock-lost`（`src/main/bootstrap/cli_init.ts:74`）模块加载期同样无 transport → 走兜底，且 `--user-data-dir` 的 `app.setPath`（`cli_init.ts:63`）先于锁检查（`:71`）生效；`will-quit.flush-retry`（`index.ts:1625`）位于 `cleanupLogging()` await 完成后的 `.finally()`（`logging.ts:311-317` 内 `removeFileTransport()` 无 reject 路径）→ 走兜底；`startup.cli-failure` / `startup.failure`（`index.ts:1658` / `:1670`）初始化前走兜底、初始化后走 `flushLogTransports()` 后 `app.exit`（`quit_source.ts:101-107`）。(3) 测试——`tests/unit/main/quit_source.test.ts:133-155` 由 Round 1 的「不抛错」升级为真实读文件断言 `module`/`message`/`trace_id`/`meta.source`，直测生产兜底路径，本轮复跑 8 例全绿。(4) 口径——`docs/specs/app_quit_lifecycle.md:9` 与 architecture.md 新增段均为「transport 不可用时…同步追加…12 处出口的来源行都可落盘；兜底失败只告警不阻塞退出」，Round 1 指出的「早期出口不落文件」例外已删除，与契约区 AC-001 一致。残余差异均非 f001 原claim范围（级别过滤 / 旁路门禁 / 路径防御），续编为 f002-f004（均 minor）。
- 修复过程引入新问题扫描：兜底相关三处新增（`quit_source.ts` 兜底函数、`logging.ts` `getCurrentLogFilePath`、`logger.ts` `has_log_transports`）均为纯增量，未改动既有写路径；测试改动全部为新增或断言变强（无就地改预期、无删/弱化断言）；`index.ts` 相对 anchor `--numstat` 26+/26−（净 0）。本轮新发现即 f002-f004。
- 本轮新发现：3 条（均 minor）。
- 未进表的提示：
    - 文件过大（按降级规则只列不进表）：`tests/unit/session/session-manager.test.ts` 1910 行（测试 ≥1200，本 task 净增 +131）；`tests/unit/main/main_panel_controller.test.ts` 913 行（≥600，净增 +128）；`src/main/core/main-panel/main-panel-controller.ts` 489 行（实现 ≥400，净增 +32）；`src/main/index.ts` 1676 行虽 ≥800 但净变 0（26+/26−），不满足「本 task 仍净增」的出 finding 条件。`docs/blueprint/conventions.md` 无阈值覆盖。
    - 圈复杂度：触及函数手工 McCabe 均 \<10（`record`≈4、`persist_without_transport`≈3、`handle_browser_window_focus`≈4、`get_shutdown_log_meta`≈3），无提示；未计生成/纯分发函数。
    - 7 视角覆盖确认（均已扫过）：**安全**——兜底 JSON 仅含静态字段（source/action/exit_code/trace_id），无秘密/PII，`appendFileSync` 目标路径不含外部输入，无拼接注入；**契约·类型**——无公开签名/配置键变更，`BrowserWindowFocusArgs` 强类型无 any/强转；**性能**——兜底为退出路径单次有界同步写，无循环/重复 IO；**架构**——`quit_source → logging → paths` 无环，`pnpm arch` 408 modules 绿（本轮独立复跑）；**健壮性·可观测**——兜底失败 `console.warn` 不静默（`quit_source.ts:90-93`），级别过滤缺口已入 f002；**文档·规格**——blueprint/spec 与实现口径已对齐，「否则 lint 失败」绝对口径已入 f003；**测试**——危险模式扫描无命中（无 `.skip`/`.only`/恒真/删改断言/`eslint-disable`，electron mock 属系统边界）。
    - 范围外观察：沿 Round 1（`process.exit()` 出口无埋点、`cli.help` 兜底死分支、electron `app.quit/exit` mock 样板 ×3、AC-002 以花云第二实例代理「其它连接器」等），本轮无新增。
- AC 复验方式（Round 2）：
    - AC-001：`re_verified` —— `grep` 复核 `src/` 内裸 `app.quit()`/`app.exit(` 仅漏斗文件，12 个漏斗调用点 ↔ 12 个 source 字面量一一对应；`pnpm lint` 绿 + raw/alias 双路径 `eslint --stdin` 探针（红/绿实测）；`quit_source.test.ts` 8 例复跑全绿（含真实读文件的无 transport 落盘断言、关停 meta、目录一致性扫描）；f001 五处出口 sink 可达性按上文逐路径人工核对。真实运行整链（`Exit requested` 与 `Application shutting down` 同 trace 落盘、进程退出）为 `trust_prior`——依赖 task.md 黑盒记录（`trace_id=66b31f3c`，claim），reviewer 未起真实 electron（会弹窗需用户许可）；配置条件缺口见 f002。
    - AC-002：`trust_prior` —— 进程存活/托盘可用/主面板可重新唤起按可测试性声明属上线后回填项；可自动化部分独立重跑（`session-manager.test.ts` 65 例绿，含预算耗尽登记释放、其它实例刷新继续、超时收尾、退出 API 零调用双通道）。
    - AC-003：`re_verified` —— 关窗/取消收尾与登录超时例随 65 例重跑通过，断言覆盖登记释放 + 漏斗零请求 + electron 退出 API 零调用。
    - AC-004：`re_verified` —— `main_panel_controller.test.ts` 51 例重跑全绿（6 例组合断言可见性/不销毁/退出零调用），`tray_menu.test.ts` 4 例重跑通过（含 index 委托入口哨兵 `:95`）。
    - coverage = 3 / 4
- 独立复验记录：`pnpm exec vitest run` 涉改 4 文件 128 例全绿（8+4+51+65）；`pnpm lint`、`pnpm typecheck`、`pnpm arch` 均绿；`--numstat` 核对净变更；只读 `task.py list` 查无等价 follow-up tid。`reviewed_scope` 为 prompt 注入值照抄，未自行计算。
- 总体判断：前轮 blocker t536_code_f001 已用 diff 与代码逐路径核实真正消除（同步落盘机制 + 文件内容断言 + 两份 spec 口径对齐），本轮 3 条新发现均 minor、无未解决 critical/important → PASS。
- 系统性 follow-up：沿 Round 1 建议（标题「electron e2e headless 预存失败基线修复」、slug `electron_e2e_headless_baseline_fixes`；`task.py list` 只读核对无等价 tid，t203 已 done 且范围不同）；本轮无新增。

verdict: PASS

## Round 3 (2026-09-30T05:05:27+08:00)

- round：3
- reviewed_at：2026-09-30T05:05:27+08:00

reviewed_scope: ab600c85f89653b2

## Findings

### t536_code_f005 - logLevel≥warn 时 `Application shutting down` 关停关联行仍被级别过滤吞掉，trace 链缺「结束」环节且两份文档断言无该例外（f002 残留续编）

- 严重度：minor（置信度：高——代码直读可复现；AC-001 核心「来源标识 + 同一 trace」已由 f002 修复的来源行兜底保证，缺口在关联行与文档口径，配置条件边缘，不满足 blocking 硬阈值）
- 锚定：AC-001「在日志中写入可区分的来源标识与同一 trace，可据此判定退出请求方」的关联链完整性；亦是 f002 问题描述点名的两行之一（f002 修复只覆盖 `record()` 路径的来源行）
- 位置：`src/main/index.ts:1560`（`log.info("Application shutting down", get_shutdown_log_meta())`）；对照 `src/main/core/quit_source.ts:71`（兜底条件仅在 `record()` 内）；`docs/specs/app_quit_lifecycle.md:8`、`docs/blueprint/architecture.md:104`
- 问题：`logLevel` schema 允许 `warn`/`error`（`src/main/core/config/types.ts:60`）。该配置下 `emit` 的 `should_log` 过滤使关停行不写任何 sink，而关停行不经 `record()`、无 `persist_without_transport` 兜底。失败场景：`config.json` 设 `logLevel: "error"` → 托盘退出 → 日志有 `Exit requested: source=tray.quit`（f002 兜底已落盘）但无 `Application shutting down` 行，`exit_source` 关联与「谁请求 → 清理 → 结束」的结束环节不可查；两份文档对关停行携带 `exit_source`/`trace_id` 的断言（`app_quit_lifecycle.md:8` 无条件表述，architecture 同）未注明 logLevel 例外——兜底句明确只限定「12 处出口的来源行」（`:9` / architecture `:104` 后半）。
- 建议：关停行同条件兜底（transport 缺失或 info 被过滤时同步追加同格式行），或两份文档对关停行补一句 logLevel 例外说明（处置为改 spec 即可闭合）。

### t536_code_f006 - alias 改名 import 形态三道门禁仍全绿，architecture 新口径「由该扫描与 review 兜住」对 f003 实测形态仍不实（f003 修不彻底）

- 严重度：minor（沿 f003 定级：当前 `src/` 无绕过实例，属门禁强度与文档口径问题）
- 锚定：f003 复核 + AC-001 保障机制（`architecture.md:104`「否则上述门禁失败」的覆盖面）
- 位置：`tests/unit/main/quit_source.test.ts:216`（`raw_re = /\bapp\s*\.\s*(?:quit|exit)\s*\(/`）、`:217-229`；`docs/blueprint/architecture.md:104`；对照 `eslint.config.ts:56`
- 问题：本轮独立探针（repo eslint 规则复刻到临时目录 + node 正则实测）：`app.quit()` → eslint 红 + 扫描红；`electron.app.quit()` → eslint 绿 + **扫描红**（f003 建议 (a) 的 member 字面形态已闭合）；`import { app as electronApp }; electronApp.quit()` → eslint 绿 + `raw_re` 不匹配（`\bapp` 对 `electronApp` 内小写 `app` 无词边界，实测 `false`）+ typecheck 绿——f003 点名的 alias 旁路仍三道全绿、无自动化发现。而 `architecture.md:104` 新口径仍写「property 规则可被改名 import 规避的形态由该扫描与 review 兜住」——`app as electronApp` 正是改名 import，「由该扫描兜住」这半句对该形态不成立：口径只解决了字面（原「否则 lint 失败」），未解决覆盖面。
- 建议：口径收窄为「`app.*` / `*.app.*` 字面形态由扫描拦截；完全 alias（`electronApp.quit()`）扫描不匹配、靠 review」；或补自动化（如 `no-restricted-syntax` 覆盖任意对象的 `.quit(`/`.exit(` MemberExpression 并 allowlist 漏斗与已知豁免点）。

## 结论

- 前轮 finding 复核（Round 2，以 diff / 代码 / 独立复跑为准，不采信处置表自称；处置表确有 Round 2 行、三条均标「已修」，仅作 claim 记录）：
    - **t536_code_f002（minor）：已修（核心场景闭合）。** 逐项核实：(1) `record()` 兜底条件已扩为 `!has_log_transports() || !is_log_level_enabled("info")`（`src/main/core/quit_source.ts:71`），`is_log_level_enabled` 由 `should_log` 委托导出（`src/shared/lib/logger.ts:194` / `:198`）；分支核对无双写/漏写——transport 在场且级别启用 → 仅 transport 写（emit 先于兜底条件判定路径互斥）；级别过滤 → emit 早退、仅兜底写一次；无 transport → emit 空转、仅兜底写一次。(2) 单测 `tests/unit/main/quit_source.test.ts:166-187` `setLogLevel("error")` 下断言 `records` 为空 + 真实读文件末行 `module`/`meta.source`/`trace_id`，本轮复跑通过。f002 的失败场景「logLevel=error 托盘退出无来源行」已闭合。其问题描述附带提及的关停关联行缺口独立续编为 f005。
    - **t536_code_f003（minor）：修不彻底。** 已完成部分：一致性扫描扩拦裸 `app.quit()` / `app.exit(` 且剥整行注释（`quit_source.test.ts:216-229`、`:234` `expect(raw_offenders).toEqual([])`），`src/` 现存命中仅两处注释行（`src/main/cli/background_serve.ts:31`、`src/main/cli/client.ts:280`）被正确排除；`electron.app.quit()` 字面形态本轮实测转红（eslint 绿、扫描红）；`architecture.md:104` 口径由「否则 lint 失败」改写为「两道静态门禁 + review」。未闭合部分：f003 实测的 alias 形态 `electronApp.quit()` 仍三道全绿（探针证据见 f006），且新口径点名「property 规则可被改名 import 规避的形态由该扫描兜住」仍不实 → 续编 f006。
    - **t536_code_f004（minor）：已消除。** `src/main/core/quit_source.ts:86` 已改为 `getCurrentLogFilePath(getDataRoot())`（import 于 `:10`），`getDataRoot` 自带 try/catch 回落 `process.cwd()`（`src/main/core/paths.ts:11-17`），与 `initLogging` 活动文件同一 base（`src/main/index.ts:183` `dataRoot = getDataRoot()` → `:219` `initLogging(dataRoot, ...)`），两条写路径解析结果一致；单测经 mock `app.getPath("userData")` 断言落 `tmp_user_data/logs/app-<date>.log`，复跑通过。
- 修复过程引入新问题扫描（Round 2→3 增量：`quit_source.ts` 兜底条件与路径、`logger.ts` `is_log_level_enabled` 导出、`quit_source.test.ts` 扫描扩展与 logLevel 例、`tray_menu.test.ts` 关停行哨兵 `:96-97`、`cli_control.spec.ts` 真实日志断言、`architecture.md` 口径）：兜底触发条件分支核对无双写；`should_log → is_log_level_enabled` 为纯等价委托；测试改动全为断言增强或纯增量，无就地改预期、无 `.skip`/恒真/弱化断言；`index.ts` 相对 anchor 仍 26+/26−（净 0）。本轮新发现即 f005、f006（均 minor，f006 为 f003 残留续编）。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
    - 文件过大（降级规则只列不进表；`docs/blueprint/conventions.md` 无阈值覆盖，按默认表计量）：`tests/unit/session/session-manager.test.ts` 1910 行（测试 ≥1200，本 task 净增 +131）；`tests/unit/main/main_panel_controller.test.ts` 913 行（≥600，净增 +128）；`src/main/core/main-panel/main-panel-controller.ts` 489 行（实现 ≥400，净增 +32）；`src/main/index.ts` 1676 行（≥800）但相对 anchor 净变 0（26+/26−），不满足「本 task 仍净增」的出 finding 条件。`quit_source.test.ts` 236 行、`cli_control.spec.ts` 436 行、`eslint.config.ts` 95 行均未达阈值。
    - 圈复杂度：触及函数手工 McCabe 均 \<10（`record`≈5、`persist_without_transport`≈3、`handle_browser_window_focus`≈5），无提示；未计纯分发/生成函数。
    - 7 视角覆盖确认（均已扫过）：**安全**——兜底写路径仅静态字段、目标路径来自 `getDataRoot()` 无外部输入拼接，无新秘密/注入面；**正确性**——兜底条件无双写、`??=` 首请求生成与短路顺序正确，关停行缺口已入 f005；**契约·类型**——新增导出 `is_log_level_enabled` 为共享库内部消费，无公开签名/配置键/schema 变更，无迁移需求；**性能**——退出路径单次有界同步写，无循环/重复 IO；**架构**——`pnpm arch` 408 modules 绿（本轮复跑），`quit_source → logging/paths` 无环；**健壮性·可观测**——`record()` 内 `log.info` 无 try/catch（同步抛出会阻断后续 `app.quit()`，依赖 scrub/serialize 内部 catch，理论风险，沿 Round 1 提示不进表）；**测试·文档·规格**——危险模式扫描无命中（无 `.skip`/`.only`/恒真/删改弱化断言/`eslint-disable`），文档缺口已入 f005、门禁口径缺口已入 f006。
    - 范围外观察：沿 Round 1/2（`process.exit()` 出口无埋点、`cli.help` 兜底死分支、electron `app.quit/exit` mock 样板 ×3、AC-002 以花云第二实例代理「其它连接器」），本轮无新增；一致性扫描仅剥整行注释（行尾注释含 `app.quit(` 字样会误报、块注释内非 `*` 行不剥），当前 `src/` 无命中，属测试鲁棒性提示，归 test reviewer。
- AC 复验方式（Round 3）：
    - AC-001：`re_verified` —— 12 个漏斗调用点 ↔ `QUIT_SOURCES` 逐条 grep 对齐（`index.ts` 10 + `application-menu.ts` 1 + `cli_init.ts` 1）；`src/` 裸 `app.quit()/app.exit(` 仅 2 处注释行；独立 eslint 规则探针（红 `app.quit()` / 绿 alias / 绿 member）+ `raw_re` 正则实测（红 `app.quit()` 与 `electron.app.quit()`、绿 alias）；`quit_source.test.ts` 9 例复跑全绿（含 logLevel=error 落盘、无 transport 落盘、关停 meta、目录↔调用点扫描）。**真实运行端到端本轮由 reviewer 亲自复跑**：`E2E=1 E2E_HEADLESS=1 pnpm exec playwright test --config=playwright.config.ts --project=electron tests/e2e/electron/cli_control.spec.ts` → 7 passed / 1 skipped（1 skipped 为 AC5 autostart 平台不支持既有 skip），断言 `Exit requested: source=control-api.quit`、`will-quit.flush-retry`、`Application shutting down` 三者共享同一 `trace_id` 落盘且实例干净退出——Round 2 标 `trust_prior` 的真实运行链（依赖 task.md `trace_id=66b31f3c` claim）已升级为独立复验。配置条件下的残留见 f005/f006，均不推翻 AC-001 核心（来源行在任意 logLevel 下落盘、可判定请求方）。
    - AC-002：`trust_prior` —— 进程存活/托盘可用/主面板重新唤起按可测试性声明属上线后回填项 3；可自动化部分独立重跑（`session-manager.test.ts` 65 例全绿：预算耗尽登记释放、其它实例刷新继续、超时收尾、退出 API 零调用双通道）。
    - AC-003：`re_verified` —— 关窗/取消收尾与登录超时例随 65 例复跑通过，断言覆盖登记释放 + 漏斗零请求 + electron 退出 API 零调用。
    - AC-004：`re_verified` —— `main_panel_controller.test.ts` 51 例复跑全绿（6 例组合断言可见性/不销毁/退出零调用）、`tray_menu.test.ts` 4 例复跑通过（含 `handle_browser_window_focus`/`get_shutdown_log_meta` 接线哨兵 `:96-97`）。
    - coverage = 3 / 4
- 独立复验记录：涉改 4 单测文件 129 例全绿（9+4+51+65）；全量 `pnpm test` 341 文件 4258 passed / 1 skipped；`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm deadcode`、`pnpm arch`（408 modules）均绿；headless e2e `cli_control.spec.ts` 7 passed；`git status --porcelain` 无 `??` 未跟踪交付文件；只读 `task.py list` 查无等价 follow-up tid。`reviewed_scope` 为 prompt 注入值照抄，未自行计算。
- 总体判断：Round 2 三条 minor 中 f002（核心场景）与 f004 真修，f003 修不彻底（alias 残留续编 f006），另发现关停行 logLevel 缺口 f005；两条新发现均 minor、无未解决 critical/important，AC-001 真实运行链本轮已由 reviewer 独立复跑 → PASS。
- 系统性 follow-up：沿 Round 1/2 建议（标题「electron e2e headless 预存失败基线修复」、slug `electron_e2e_headless_baseline_fixes`；`task.py list` 只读核对无等价 tid，t203 已 done 且范围不同）；本轮无新增。

verdict: PASS

## Round 4 (2026-09-30T06:40:00+08:00)

- round：4
- reviewed_at：2026-09-30T06:40:00+08:00

reviewed_scope: 401b0b8c256a4510

## Findings

Round 4 零 finding。

## 结论

- 前轮 finding 复核（Round 3，以 diff / 代码 / 独立探针与复跑为准，不采信处置表自称；处置表确有 Round 3 行、两条均标「已修」，仅作 claim 记录）：
    - **t536_code_f005（minor）：已消除。** 逐项核实：(1) 关停行收敛为 `log_application_shutdown()`（`src/main/core/quit_source.ts:154-161`）：`shutdown_log = createLogger("main")`（`src/main/core/quit_source.ts:147`，module 与 index.ts 既有关停行同名），`shutdown_log.info` 后同条件 `!has_log_transports() || !is_log_level_enabled("info")` 走 `persist_log_line("main", ...)` 同步兜底——与 `record()` 同一套互斥分支（transport 在场且 info 启用 → 仅 transport 写一次；否则 emit 早退/空转、仅兜底写一次，无双写），`src/main/index.ts:1560` before-quit 改为 `log_application_shutdown()`（import `src/main/index.ts:129`）。(2) 新单测 `tests/unit/main/quit_source.test.ts:200`「logLevel 过滤 info 时关停行同样同步落盘（module=main、同 trace）」：`setLogLevel("error")` 下断言 transport 零输出 + 真实读文件末行 `module="main"` / `message="Application shutting down"` / `meta.exit_source="tray.quit"` / 同 `trace_id`。(3) 接线哨兵改名：`tests/unit/main/tray_menu.test.ts:96-97` 现断言 index 源含 `handle_browser_window_focus` 与 `log_application_shutdown`（原 `get_shutdown_log_meta` 哨兵位由其替代，`get_shutdown_log_meta` 关联断言保留在 `quit_source.test.ts` 关停 meta 例）。(4) 文档同步：`docs/specs/app_quit_lifecycle.md:8` 明写「该行同样受 transport/级别兜底保护」、`:9` 兜底清单点名 `log_application_shutdown` 关停行，`docs/blueprint/architecture.md:104` 同——f005 指出的「文档无条件断言 vs 实现缺口」已由实现补齐而闭合。真实运行链本轮独立复跑覆盖该修复路径（见 AC-001）。
    - **t536_code_f006（minor）：已消除。** f006 给出二选一（口径收窄 或 补自动化），实施取口径收窄且如实：`docs/blueprint/architecture.md:104` 现写「两道门禁都绑定 `app.` 标识符，改名/别名形态（`electronApp.quit()`）静态不拦，由 code review 的调用点核对兜住（t536 已逐一核实 12 处出口）」——Round 3 点名不实的「property 规则可被改名 import 规避的形态由该扫描与 review 兜住」半句已删除；`docs/specs/app_quit_lifecycle.md:10` 同步「（别名形态由 code review 核对兜住）」。口径真实性本轮独立探针复验（未写任何探针文件）：`app.quit()` → eslint `no-restricted-properties` 红（`eslint --stdin` 借既有 `src/main/menu/application-menu.ts` 文件路径实测）；`electronApp.quit()` → eslint 绿；扫描正则 node 实测 `app.quit()` / `electron.app.quit()` 红、`electronApp.quit()` 绿——文档断言与两道门禁实际覆盖面逐条一致。`src/` 内 `app.quit()/app.exit(` 现存命中仅 2 处注释行（`src/main/cli/background_serve.ts:31`、`src/main/cli/client.ts:280`），零 alias 旁路实例，静态口径 + review 兜底当前成立。
- 修复过程引入新问题扫描（Round 3→4 增量按 mtime + numstat 圈定 8 个文件：`src/main/core/quit_source.ts`、`src/main/index.ts`、`tests/unit/main/tray_menu.test.ts`、`tests/unit/main/quit_source.test.ts`、`docs/blueprint/architecture.md`、`docs/blueprint/testing.md`、`docs/specs/app_quit_lifecycle.md`、`task.md`，mtime 均在 06:19-06:23，与处置表 Round 3 行声称一致，无隐藏改动）：`log_application_shutdown` 为纯新增函数，`record()` 兜底条件与既有写路径未改；`index.ts` 相对 anchor 仍 26+/26−（净 0，before-quit 单行替换）；测试改动为新增用例 + 哨兵改名，无就地改预期、无 `.skip`/恒真/删改弱化断言；文档仅按实现改口径、无超出实现的新断言。7 视角扫描未见本轮新增命中。
- 本轮新发现：0 条（Round 4 零 finding）。
- 未进表的提示：
    - 文件过大（降级规则只列不进表；`docs/blueprint/conventions.md` 无阈值覆盖，按默认表计量）：`tests/unit/session/session-manager.test.ts` 1910 行（测试 ≥1200，本 task 净增 +132）；`tests/unit/main/main_panel_controller.test.ts` 913 行（≥600，净增 +128）；`src/main/core/main-panel/main-panel-controller.ts` 489 行（实现 ≥400，净增 +32）；`src/shared/lib/logger.ts` 405 行（实现 ≥400，净增 +10——本轮补列，前轮清单漏计）；`src/main/index.ts` 1676 行（≥800）但相对 anchor 净变 0（26+/26−），不满足「本 task 仍净增」条件。`quit_source.test.ts` 265 行、`cli_control.spec.ts` 436 行、`eslint.config.ts` 95 行、`quit_source.ts` 166 行均未达阈值。
    - 圈复杂度：本轮触及函数手工 McCabe 均 \<10（`log_application_shutdown`≈3、`record`≈5、`handle_browser_window_focus`≈5），无提示；无项目 CC 工具，未计生成/纯分发函数。
    - 7 视角覆盖确认（均已扫过）：**安全**——兜底写路径 meta 仅静态字段（source/action/exit_code/trace_id/exit_source），无秘密/PII，目标路径取自 `getDataRoot()` 无外部输入拼接，无新注入面或配置暴露；**正确性**——关停行兜底与 transport 写互斥核对无双写/漏写，`trace_id ??=` 首请求生成先于 `app.quit()` 触发（entry 先 push，before-quit 同步取到首请求方）；**契约·类型**——新增导出（`log_application_shutdown`/`has_log_transports`/`is_log_level_enabled`/`getCurrentLogFilePath`/`BrowserWindowFocusArgs`）均为进程内部消费，无公开签名/配置键/schema 变更与迁移需求；**性能**——退出路径单次有界同步写，无循环/重复 IO；**架构**——`pnpm arch` 绿（408 modules），`quit_source → logging/paths` 无环，无新增跨层依赖；**健壮性·可观测**——兜底失败仅 `console.warn` 不阻塞退出（`src/main/core/quit_source.ts:104-107`），`record()` 内 `log.info` 无 try/catch 仍为理论风险（沿 Round 1-3 提示不进表）；**测试·文档·规格**——危险模式扫描无命中（无 `.skip`/`.only`/恒真/删改弱化断言/`eslint-disable`），blueprint/spec/testing 描述与代码逐条一致。
    - 范围外观察：沿 Round 1-3（`process.exit()` 出口无埋点、`cli.help` 兜底死分支、electron `app.quit/exit` mock 样板 ×3、AC-002 以花云第二实例代理「其它连接器」、一致性扫描仅剥整行注释），本轮无新增。另：全量 `pnpm test` 首跑出现 1 个 vitest `Errors 1 error`（unhandled 类，附 clearTimeout/await 提示；341 文件 / 4259 用例仍全过），其后 3 次复跑均干净、未复现，来源未定位——与本 diff 无归因证据，列为观察项供 test reviewer 关注。
- AC 复验方式（Round 4）：
    - AC-001：`re_verified` —— (a) 12 个漏斗调用点 ↔ `QUIT_SOURCES` grep 逐条对齐（`index.ts` 10 + `application-menu.ts` 1 + `cli_init.ts` 1），`src/` 内裸 `app.quit()/app.exit(` 仅 2 处注释行、零 alias 实例；(b) 门禁红/绿双路径独立探针（eslint `--stdin`：raw 红 / alias 绿；node 正则：raw 与 member 红 / alias 绿），与 architecture/spec 新口径逐条互证；(c) `quit_source.test.ts` 10 例复跑全绿（来源行无 transport 落盘、logLevel=error 来源行落盘、关停 meta、logLevel=error 关停行 module=main 落盘、目录↔调用点扫描、reset 等）；(d) 真实运行端到端独立复跑：`E2E=1 E2E_HEADLESS=1 pnpm exec playwright test --config=playwright.config.ts --project=electron tests/e2e/electron/cli_control.spec.ts` → 7 passed / 1 skipped（1 skipped 为 AC5 autostart 平台不支持既有 skip），断言 `Exit requested: source=control-api.quit`、`will-quit.flush-retry`、`Application shutting down` 三者共享同一 `trace_id` 落盘且实例干净退出——f005 修复后的真实关停链已覆盖。
    - AC-002：`trust_prior` —— 进程存活/托盘可用/主面板重新唤起按可测试性声明属上线后回填项 3；可自动化部分独立重跑（`session-manager.test.ts` 65 例全绿：预算耗尽登记释放、其它实例刷新继续、超时收尾、退出 API 零调用双通道）。
    - AC-003：`re_verified` —— 关窗/取消收尾与登录超时例随 65 例复跑通过，断言覆盖登记释放 + 漏斗零请求 + electron 退出 API 零调用。
    - AC-004：`re_verified` —— `main_panel_controller.test.ts` 51 例复跑全绿（6 例组合断言可见性/不销毁/退出零调用）、`tray_menu.test.ts` 4 例复跑通过（含 `handle_browser_window_focus`/`log_application_shutdown` 接线哨兵 `:96-97`）。
    - coverage = 3 / 4
- 独立复验记录：涉改 4 单测文件 130 例全绿（10+4+51+65）；全量 `pnpm test` 341 文件 4259 passed / 1 skipped（复跑 ×3，首跑 1 个未复现 unhandled error 见范围外观察）；`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm deadcode`、`pnpm arch`（408 modules）均绿；headless e2e `cli_control.spec.ts` 7 passed；`git status --short` 无 `??` 未跟踪交付文件；mtime/numstat 圈定 Round 3→4 增量 8 文件与处置表声称一致；只读 `task.py list` 查无等价 follow-up tid。`reviewed_scope` 为 prompt 注入值照抄，未自行计算。
- 总体判断：Round 3 两条 minor（f005 关停行兜底、f006 门禁口径改实）均已用代码、文档与独立探针/复跑核实真正消除，本轮零新增 finding，无未解决 critical / important → PASS。
- 系统性 follow-up：沿 Round 1-3 建议（标题「electron e2e headless 预存失败基线修复」、slug `electron_e2e_headless_baseline_fixes`；`task.py list` 只读核对无等价 tid）；本轮无新增。

verdict: PASS
