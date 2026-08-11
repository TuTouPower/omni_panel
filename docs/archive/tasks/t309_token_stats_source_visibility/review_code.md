# Task review t309（reviewer_focus: 代码）

- task：`t309_token_stats_source_visibility`
- spec：`docs/tasks/t309_token_stats_source_visibility/spec.md`
- diff_anchor：`1842d8e4ac09acf97b6e75c0c607b316bcf4eb17`
- target：`git diff 1842d8e4ac09acf97b6e75c0c607b316bcf4eb17`
- round：1
- reviewed_at：2026-08-11 19:44 UTC+8

## Findings

### t309_code_f001 - collector-local 测试隐式依赖非 Windows 平台，Windows CI 必红

- 严重度：important
- 锚点：可观测行为缺陷——CI 门禁（`.github/workflows/ci.yml` test job matrix 含 `windows-2022`）上该测试必失败。
- 位置：`tests/unit/main/core/token-stats/collector-local.test.ts:126-170`（`t309: marks unreachable wsl sources unavailable on a non-Windows host`）
- 问题：测试未注入 host。`collector_host` 在模块加载时由 `process.platform` 推导（collector.ts:252），本测试文件未调用 `set_collector_host`。`wsl data requires a windows host` 消息只产生于 host 过滤分支（collector.ts:480）；在 Windows 平台上该分支不执行，wsl 源改走 `read_source` → 路径 null → `unavailable`（原因 `path unavailable`），`wsl_warns` 过滤命中 0 条，`expect(wsl_warns).toHaveLength(5)` 失败（测试 2，line 166）。t308 版本同文件测试无 host 断言、Windows 上通过，此断言为本 task 引入的平台耦合。本机 linux 全绿不能代表 CI 矩阵。
- 建议：测试顶部显式 `set_collector_host("linux")`（与 collector.test.ts:138 既有注入模式一致），断言与运行平台解耦；或按当前 `collector_host` 分支断言。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无。
- 本轮新发现：1 条（important）。
- 未进表的提示：
    - 文件膨胀（阈值：实现源码 400/800，测试 600/1200）：`src/main/core/token-stats/collector.ts` 619 行（≥400，本 task 净增 +122）；`src/main/core/token-stats/token-stats-store.ts` 1528 行（≥800，本 task 净增约 +8）；`src/renderer/views/TokenStatsView.tsx` 942 行（≥800，净增 +15）。均未引发可观测缺陷，不进 finding 表。
    - 复杂度：`collect()` 手算 CC ≈ 15-17（for + 2 if + 短路与三元多分支 + 容量三条件 OR + try/catch），`read_source` ≈ 12；本 task 对两者各增 1-2 分支，未产出可观测缺陷，仅提示。
    - 范围外观察：spec「Finalization 时更新的 blueprint」（architecture.md 数据流/domain.md §3 源级状态语义）本次 diff 未含，属收尾阶段待办，非本 round 缺陷。
    - `TokenStatsStatus`（ipc.ts:30）新增 `sources_status?` 字段但 `TOKEN_STATS_STATUS` 通道（token-stats-ipc.ts:154-163）不返回该字段；面板状态 state 共用该类型承载 dashboard.status，设计可辩护，仅提示。
- 总体判断：实现主体符合 spec 契约（AC-001~005 均有实现与测试，217 个相关单测全绿、typecheck 通过），但 f001 使 CI Windows job 红灯，修复前不可合入。
- AC 复验方式：
    - AC-001：re_verified——collector.test.ts「AC-001」测试显式注入 linux host 断言 5 wsl 源 unavailable + 无 reader 调用 + 5 条 warn；collector-local.test.ts 测试 2 在 linux 绿。
    - AC-002：re_verified——collector.test.ts「AC-002/AC-003」「AC-002: path null」两测试断言 failed/unavailable + lastError；shared/token-stats.test.ts schema 断言。
    - AC-003：re_verified——warn 去重（第二次 collect 无 warn）、消息含 key+原因、健康源无 warn，测试绿。
    - AC-004：re_verified——token_stats_view.test.tsx 两测试断言 marker 渲染/文案/ok 无标记，绿。
    - AC-005：re_verified——collector 既有 session/daily/records 落库断言（collector.test.ts 28 个 + token-stats-store.test.ts 91 个）全部保持绿；apply_batches/collect 数据收集路径未改。
    - coverage = 5/5
- 系统性 follow-up：无。

verdict: FAIL
reviewed_scope: 2c041baa4709dd5f

## Round 2 (2026-08-11 19:50 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t309_code_f001（important）——已消除。** collector-local.test.ts:129 在 wsl 测试顶部显式 `set_collector_host("linux")`，位于 `configure()`（:136）之前；`configure`/`reset_config`（collector.ts:555-575）均不触碰模块级 `collector_host`（collector.ts:252，仅 `set_collector_host` 可改），注入不会被覆盖。Windows CI 上 host 过滤分支（collector.ts:479-481）必执行，5 wsl 源 `unavailable` + 5 条 warn 断言与运行平台解耦。本机复跑该文件 3 测试绿、typecheck 绿；平台独立性由注入语义保证，非本机结果外推。
- **t309_test_f001（minor）——已消除。** token-stats-ipc.test.ts:344-417 新增「omits sources_status when the store has no reports (t309)」，断言 dispatcher 收到 `{running, last_updated}`（无 `sources_status`），与实现 token-stats-ipc.ts:135-138 的 `source_statuses.length ? { ...status, sources_status } : status` 逐一对应；`createMockDeps` 默认 `sources_status: vi.fn().mockReturnValue([])`（:39）使既有 delegates 测试（:176）亦走 omit 分支。该测试在修复前会红（多余 key 使精确匹配失败），是有效回归测试。全文件 21 测试复跑绿。

### 本轮新发现

### t309_code_f002 - collector-local 测试 host 注入不复位，文件内测试产生顺序依赖

- 严重度：minor
- 锚点：测试结构/状态管理（当前无红点）
- 位置：`tests/unit/main/core/token-stats/collector-local.test.ts:129`（注入点）、`:51-55`（afterEach）
- 问题：`set_collector_host("linux")` 只在 wsl 测试内注入，afterEach 的 `reset_config()` 不复位 `collector_host`。同文件后续「empty home」测试（:178）在 Windows CI 上将以泄漏的 linux host 运行——当前该测试断言 host 无关、结果不变，但文件内已形成「wsl 测试之后所有测试继承注入 host」的顺序依赖；此后在 wsl 测试之后新增任何依赖平台推导 host 的测试，会在 Windows CI 上静默以 linux host 跑，且失败归因困难。collector.test.ts:129-138 是整文件 beforeEach 注入模式，本文件只做单点注入且不复位，两者不一致。
- 建议：afterEach 恢复平台推导 host（`set_collector_host(process.platform === "win32" ? "windows" : "linux")`），或把注入提升到 describe 级 beforeEach，保证每个测试的 host 起点独立。

### t309_code_f003 - ipc 测试 dashboard fixture 字面量 verbatim 三份重复

- 严重度：minor
- 锚点：DRY（verbatim 重复）
- 位置：`tests/unit/ipc/token-stats-ipc.test.ts:178` / `:254` / `:344`
- 问题：约 30 行 `dashboard: TokenStatsDashboardDto` 字面量在 delegates（:178）、includes（:254）、本轮新增 omits（:344）三个测试中逐字复制；`TokenStatsDashboardDto` 结构演进（新增/改名字段）需同步改三处，漏改即 fixture 与 schema 漂移、断言弱化。
- 建议：提取 `make_dashboard()` fixture 工厂（与 `createMockDeps` 同文件模式），三测试复用。

### 结论（Round 2）

- 前轮 finding 复核：t309_code_f001 已消除、t309_test_f001 已消除（均以 diff 与复跑为准，非处置表自述）。
- 本轮新发现：2 条（均 minor，不阻断）。
- 未进表的提示：
    - 文件膨胀/复杂度：本轮修复只改测试文件，未增源码行数，阈值结论同 Round 1（collector.ts 619 / token-stats-store.ts 1528 / TokenStatsView.tsx 942），无新增可观测缺陷。
    - f002 当前无红点，正是因为「empty home」测试断言与 host 无关；顺序依赖风险已作为 f002 报告，不重复。
- 总体判断：前轮唯一 blocker（f001）已按建议注入 host 消除，test f001 新增测试与实现分支逐一对应；536 相关单测 + typecheck 复跑全绿。仅 2 条 minor，可 PASS。
- AC 复验方式（Round 2）：
    - AC-001：re_verified——diff 含 wsl 测试顶部 `set_collector_host("linux")`，configure/reset_config 不复位 host，host 过滤分支必执行；复跑绿。
    - AC-002/003：re_verified——collector.test.ts 与 collector-local.test.ts 状态/日志断言本轮复跑全绿，源码零改动。
    - AC-004：re_verified——includes/omits 两测试与 token-stats-ipc.ts:135-138 条件展开逐分支对应，dispatcher 收参精确匹配；token_stats_view.test.tsx 33 测试复跑绿。
    - AC-005：re_verified——token-stats-store.test.ts 91 测试 + collector 落库回归本轮复跑全绿，数据写入路径零改动。
    - coverage = 5/5
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: 94890648cc5c2ac7

## Round 3 (2026-08-11 20:05 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t309_code_f002（minor）——已消除。** collector-local.test.ts:51-58 afterEach 在 `reset_config()` 后新增 `set_collector_host(process.platform === "win32" ? "windows" : "linux")`，与建议逐字一致。核实 `reset_config()`（collector.ts:560-575）不触碰模块级 `collector_host`（仅 `set_collector_host` 可改，:259-261），恢复不会被覆盖；wsl 测试内注入（:132）在 `configure` 前，afterEach 恢复在其后执行，文件内每个测试的 host 起点独立，顺序依赖消除。CI 矩阵仅 ubuntu-latest + windows-2022（.github/workflows/ci.yml:38），两平台恢复值均与模块加载推导 `paths.host_from_platform`（collector.ts:252）精确一致；darwin 上恢复为 `"linux"` 而非 `"macos"`，但 paths.ts 对两者行为一致（:50 base 均取 homedir、:76 joiner 均取 posix），host 过滤（collector.ts:479）对任一非 windows host 同样过滤 wsl，无可观测差异。复跑 collector-local 3 测试绿。
- **t309_code_f003（minor）——已消除。** token-stats-ipc.test.ts:62-113 新增 `make_dashboard(): TokenStatsDashboardDto` 工厂；delegates（:231）、includes（:270）、omits（:304）三处原 verbatim 字面量全部替换为 `make_dashboard()`。工厂内容与 diff 移除的字面量逐字段一致（query/current/previous/chart_data/heatmap/models/sessions/status/freshness/data_version），无字段增减；每次调用返回 fresh 对象，无跨测试引用别名。剩余字面量均不构成延续：AC1 测试 `complete_dto`（:423-471）为 diff 外既有代码、本 task 未触及；INVALID_RESPONSE 畸形 DTO（:354-377）为故意缺字段 fixture，纳入工厂反破坏测试意图。

### 本轮新发现

无（0 条）。

### 结论（Round 3）

- 前轮 finding 复核：t309_code_f002、t309_code_f003 均已消除（以 diff 与复跑为准，非处置表自述）。
- 本轮新发现：0 条。
- 未进表的提示：
    - `complete_dto`（token-stats-ipc.test.ts:423-471）仍为 verbatim 字面量（与工厂内容相同），系 diff 外既有代码，本 task 未触及；如后续彻底 DRY 可纳入工厂，非本 task 范围。
    - afterEach 恢复值在 darwin 上为 `"linux"` 而非 `host_from_platform` 的 `"macos"`；当前 paths 层与 host 过滤对两者行为一致、CI 无 macOS job，无可观测差异。若未来新增依赖 macos 特有路径的测试，建议改用 `paths.host_from_platform(process.platform)` 恢复。
    - 文件膨胀/复杂度：本轮处置仅改测试文件，两文件 550/212 行均低于测试阈值 600/1200，src 无本轮改动，无新增提示。
- 总体判断：f002/f003 均按建议真修（24/24 复跑绿、typecheck rc=0、eslint rc=0），修复未引入新问题；仅 2 条结论提示，无未解决 critical/important，可 PASS。
- AC 复验方式（Round 3）：
    - AC-001：re_verified——wsl 测试显式注入 linux（:132）+ afterEach 恢复平台 host（:55），host 过滤分支必执行；collector-local 3 测试复跑绿。
    - AC-002：re_verified——failed/unavailable + lastError 断言（collector-local.test.ts:108-112、:160-162、:203-207）与实现（collector.ts:479-500）对应，复跑绿。
    - AC-003：re_verified——warn 断言（:113-123、:165-172）匹配实现消息格式 `${key} unavailable: ${lastError}`（collector.ts:482），复跑绿。
    - AC-004：re_verified——依赖 Round 2 复验（token_stats_view.test.tsx 33 测试绿）；本轮处置仅涉 collector-local / token-stats-ipc 两测试文件，renderer 相关文件无本轮改动。
    - AC-005：re_verified——依赖 Round 2 复验（collector 落库回归绿）；src 无本轮改动，数据写入路径不变。
    - coverage = 5/5
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: 6003b72dddfa52d6

## Round 4 (2026-08-11 20:20 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t309_code_f002（minor）——维持已消除。** 本轮唯一实质 diff 为 collector-local.test.ts afterEach 恢复表达式改 `set_collector_host(host_from_platform(process.platform))`（import 一行 + 表达式一行），不触碰生产代码（src/ 无本轮改动）；host 过滤语义与 f002 修复意图一致，无新问题。
- **t309_code_f003（minor）——维持已消除。** 无相关改动。
- **t309_test_f002（minor，test 侧）——由 test Round 4 复核真修**：恢复表达式与生产 `host_from_platform`（paths.ts:25-34）单一来源对齐。

### 本轮新发现

无（0 条）。

### 结论（Round 4）

- 前轮 finding 复核：f002/f003 维持已消除；test 侧 f002 由 test Round 4 复核真修。
- 本轮新发现：0 条。
- 总体判断：生产代码零改动，测试环境恢复表达式对齐生产推导，无未解决 critical/important/minor，PASS。
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: 2f1fcbbc4aadc7bf
