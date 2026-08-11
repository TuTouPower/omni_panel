# Task review t309（reviewer_focus: 测试）

- task：`t309_token_stats_source_visibility`
- spec：`docs/tasks/t309_token_stats_source_visibility/spec.md`
- diff_anchor：`1842d8e4ac09acf97b6e75c0c607b316bcf4eb17`
- target：`git diff 1842d8e4ac09acf97b6e75c0c607b316bcf4eb17`
- round：1
- reviewed_at：2026-08-11 19:41 UTC+8

## Findings

### t309_test_f001 - token-stats-ipc 未覆盖 sources_status 为空时的字段省略分支

- 严重度：minor
- 锚点：无 AC 违反（行为兼容细节）
- 位置：`tests/unit/ipc/token-stats-ipc.test.ts`（新增 "TOKEN_STATS_DASHBOARD includes sources_status..." 测试）；生产分支 `src/main/ipc/token-stats-ipc.ts:139`（`source_statuses.length ? { ...status, sources_status: source_statuses } : status`）
- 问题：新测试只覆盖了 store 有报告（非空数组）时快照携带 `sources_status` 的分支；空数组时省略字段的分支无任何测试。该分支影响面板"采集开始前/无报告"的兼容路径，是 `TokenStatsStatus.sources_status` optional 语义的直接落点。
- 建议：补一条 `sources_status()` 返回 `[]` 时断言 `request_dashboard` 收到不含 `sources_status` 的 status 快照的 case。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无"迁就实现"的改测。三处既有测试改动均有规格归因：collector-local 两处（静默 1 条 postMessage 断言 → 新状态语义）与 collector.test.ts 一处删除（"one source failure doesn't prevent..."）均因 AC-003 用 warn+failed 状态替换 ENOENT 静默而失效，改后保留核心行为断言（session 读取、records 落库、其他源继续采集 win-ok），属合法替换而非就地把预期改成实现输出。
- 本轮新发现：1 条（f001，minor）
- 未进表的提示：
    - AC-001 语义澄清：`wsl_enabled=false`（默认配置）时 wsl 源被配置跳过、无 status 条目也无 warn（`collector.ts:472` continue 分支），与 AC-001 字面"非 Windows 宿主下 wsl 源…标记为 unavailable"存在语义间距；实现意图为"配置禁用不参与"，建议 spec 澄清补限定，不计 FAIL。
    - AC-005 证据链：collector 层测试断言 update 消息内容（sessions/records），真实落库主链由 `token-stats-store.test.ts`（91 测）与既有测试未改动保持绿间接覆盖；collector-local 使用真实 fs + 真实 reader，非 mock 冒充。
    - `eslint-disable @typescript-eslint/unbound-method` 为既有文件既有模式（改前已 18 处），非新引入静默错误。
- 总体判断：测试可信、覆盖达标、无危险模式命中，唯一 finding 为 minor，不阻断。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 重跑 `collector.test.ts`（"AC-001: non-Windows host filters..."，linux host + wsl_config，断言无 wsl.localhost 读取调用、5 条 wsl unavailable、4 条 local ok）与 `collector-local.test.ts`（真实 Linux 平台，5 条 unavailable + 5 条 warn），全绿。
- AC-002：`re_verified` — collector.test.ts "AC-002/AC-003: throwing reader..."（failed + lastError 含 "file locked"）、"path resolves to null is unavailable"（lastError 精确 `toBe("path unavailable")`）；shared/token-stats.test.ts schema 接受/拒绝/缺省 `[]`、ok 条目 `toEqual` 精确无 lastError，全绿。
- AC-003：`re_verified` — collector.test.ts 三测试覆盖 unavailable warn（5 条）、failed warn（1 条且第二次 collect 后 0 条，验证 once-per-run 去重）、healthy 0 warn；collector-local 断言真实 ENOENT 错误进 warn 消息，全绿。
- AC-004：`re_verified` — 重跑 `token_stats_view.test.tsx`（33 测），两个新增 AC4 测试断言 unavailable/failed 标记渲染 source/env/原因文本、ok 源无标记（`queryByText(/claude_code/)` 为 null），全绿。
- AC-005：`re_verified` — collector-local "posts local claude jsonl sessions..." 保留 sessions 长度 1 + records `toMatchObject` 断言；本 task 涉及的全部 7 个测试文件 217 测重跑全绿。

coverage = 5 / 5

reviewed_scope: 2c041baa4709dd5f

verdict: PASS

## Round 2 (2026-08-11 19:50 UTC+8)

## Findings

（本轮 0 条新 finding）

## 结论

- 前轮 finding 复核（以 git diff 与重跑为准，不采信处置表）：
    - t309_test_f001（minor）：已消除。token-stats-ipc.test.ts:344 新增「TOKEN_STATS_DASHBOARD omits sources_status when the store has no reports (t309)」，`createMockDeps`（:39）默认 `sources_status` 返回 `[]`，断言 `request_dashboard` 收到 `{ running: false, last_updated: null }` 且**不含** `sources_status`——`toHaveBeenCalledWith` 精确对象匹配，实现若误传 `sources_status: []` 必失败，非弱化形式；直接触达生产分支 token-stats-ipc.ts:135-138 的 `length` 三元。重跑该文件 21 测全绿。
    - t309_code_f001（important，code reviewer 侧）：已消除。collector-local.test.ts「marks unreachable wsl sources」测试顶部显式 `set_collector_host("linux")`（import 于 :24 补齐），且在 `configure` 之前调用；`collector_host` 为模块级变量、collect 时读取（collector.ts:479），注入生效。断言强度未变（5 条 wsl `unavailable` + 5 条 warn 均 `toHaveLength` 精确匹配），与运行平台解耦。Windows CI 下同文件其余测试安全：测试 1/3 仅读 local 源（`LOCAL_HOSTS` 含 windows/linux/macos）且 `wsl_enabled=false` 跳过 wsl 源，不依赖注入。
- 改测方向复核：无「迁就实现」的改测。本轮两处修复均为补断言或注入测试环境，未修改任何既有断言预期。
- 本轮新发现：0 条
- 未进表的提示：
    - dashboard fixture 冗余：token-stats-ipc.test.ts:265-334 与 :347-415 为同一 ~40 行 dashboard 对象重复（:178 起已有第三份），建议提取共享 helper；既有模式，不阻断。
    - 全量 `pnpm test` 1 红（2888 过 1 挂）：designmd.test.ts AC5 drift 门禁（真实 globals.css 导出区 vs DESIGN.md）。t309 diff 未触及 globals.css/DESIGN.md（`git diff --name-only` 无命中），HEAD 时即红，pre-existing 与本 task 无关，建议另行跟进。
    - `set_collector_host("linux")` 注入不随 `reset_config` 清除（collector.ts:560 不重置 `collector_host`），残留至文件末；已分析对同文件后续测试无害（local 源 hosts 覆盖全平台），仅提示。
- 总体判断：前轮两个 finding 均已真修，无未解决 important，无新 blocker。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001/002/003：`re_verified` — 重跑修复涉及的 collector-local.test.ts（3 测）与 token-stats-ipc.test.ts（21 测）全绿；host 注入下 wsl 5 unavailable + 5 warn、costs failed + ENOENT、status 快照含/不含 sources_status 两分支断言均直接触达生产逻辑。
- AC-004/005：`re_verified` — 全量 `pnpm test` 回归（2888 passed，唯一红为无关的 designmd drift）覆盖 token_stats_view.test.tsx 与 token-stats-store.test.ts；本轮生产实现零改动（src/ 无新增 diff）。

coverage = 5 / 5

reviewed_scope: 94890648cc5c2ac7

verdict: PASS

## Round 3 (2026-08-11 20:05 UTC+8)

## Findings

### t309_test_f002 - afterEach host 恢复表达式与 host_from_platform 在 darwin 上不一致

- 严重度：minor
- 锚点：测试环境状态管理（无当前红点；CI 矩阵仅 ubuntu/windows，风险限 macOS 本地开发）
- 位置：`tests/unit/main/core/token-stats/collector-local.test.ts:51-58`（afterEach）
- 问题：afterEach 注释声称「恢复平台推导 host」，但 `process.platform === "win32" ? "windows" : "linux"` 与生产推导 `paths.host_from_platform`（`paths.ts:25-34`，darwin→macos）不一致：macOS 上运行本文件时，测试 1 之后 host 被固定为 `"linux"` 而非平台默认 `"macos"`。当前三测试断言在 linux/macos host 下行为等价（local 源 `LOCAL_HOSTS` 含全平台、wsl 仅 windows），故无实际红点；但 f002 要消除的「后续测试静默继承非平台默认 host」隐患在 darwin 上残留——未来在测试 1 后新增依赖 macos host 行为的测试会在 macOS 本地静默以 linux host 运行。Windows CI 侧已正确恢复 `"windows"`，不影响门禁。
- 建议：改用 `host_from_platform(process.platform)`（import 自 `src/main/core/token-stats/paths.ts`），与生产推导单一来源，消除 darwin 偏差。

## 结论

- 前轮 finding 复核（以 git diff 与重跑为准，不采信处置表）：
    - t309_code_f001（important，code 侧）：已消除。`collector-local.test.ts:132` 仍显式 `set_collector_host("linux")` 且位于 `configure()` 之前；`collector_host` 为模块级变量（collector.ts:252），仅 `set_collector_host`（:259-260）可改，`configure`/`reset_config`（:555-575）不触碰；Windows CI 上 host 过滤分支（:479-481）必执行，5 unavailable + 5 warn 断言与运行平台解耦。
    - t309_test_f001（minor）：已消除。ipc 测试 includes（:259）/omits（:301）两分支断言原样保留，本轮无相关改动；21 测重跑绿。
    - t309_code_f002（minor）：已修。afterEach（:51-58）在 `reset_config()` 后执行恢复，注入不被覆盖；Windows CI 上测试 2 的 `"linux"` 注入不再泄漏给测试 3（恢复为 `"windows"`）。已推算测试 3 在 Windows host + `win_home="/unused-on-linux"`（无效路径）下读源 ENOENT → `failed` + sessions=[]，与 linux host 下断言等价成立，无回归。darwin 恢复偏差见新 finding t309_test_f002。
    - t309_code_f003（minor）：已修。`make_dashboard()` 工厂（:63-113）每次调用返回全新对象，无共享引用；三处 verbatim 字面量（原 :178/:254/:344）全部替换为工厂调用（:231/:270/:304）；grep 确认文件内仅剩工厂内一份与 pre-existing `complete_dto`（anchor 版本 :349 即存在，属 INVALID_RESPONSE 测试独立 fixture，非 f003 目标），无残留重复。
- 改测方向复核：无「迁就实现」的改测。本轮两处修改均为测试环境状态管理（afterEach 恢复）与 fixture 提取（工厂化），未改任何既有断言预期；includes/omits/delegates 三测试断言逐字保留。
- 本轮新发现：1 条（t309_test_f002，minor）。
- 未进表的提示：
    - `make_dashboard()` 与 pre-existing `complete_dto` 仍为两份 ~45 行 fixture，可进一步合并为带覆盖参数的工厂；既有模式，不阻断。
    - 全量 `pnpm test` 此前 1 红（designmd AC5 drift，pre-existing 与本 task 无关，见 Round 2）；本轮改动仅测试文件，未重跑全量，536 相关测全绿。
- 总体判断：f002/f003 均已真修且未引入新问题，唯一新 finding 为 darwin 恢复偏差 minor，不阻断。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified` — 逐行核对 afterEach 恢复表达式（collector-local.test.ts:55）与 `host_from_platform`（paths.ts:25-34）、host 过滤分支（collector.ts:479-481）；测试 2 显式注入 `"linux"`、测试 3 Windows 路径推算等价；3 测重跑绿。
- AC-002/003：`re_verified` — 重跑 collector-local.test.ts（failed+ENOENT、5 unavailable、warn 计数）与 token-stats-ipc.test.ts（includes/omits 两分支精确匹配）24 测全绿；本轮断言未动。
- AC-004：`re_verified` — token_stats_view.test.tsx 33 测重跑绿（本轮零改动）。
- AC-005：`re_verified` — 32 文件 536 测重跑全绿（含 store/manager/collector 落库回归），typecheck 通过、eslint 两改动文件无告警。

coverage = 5 / 5

reviewed_scope: 6003b72dddfa52d6

verdict: PASS

## Round 4 (2026-08-11 20:15 UTC+8)

## Findings

（本轮 0 条新 finding）

## 结论

- 前轮 finding 复核（以 git diff 与重跑为准，不采信处置表）：
    - t309_test_f002（minor）：已修。collector-local.test.ts:25 import `host_from_platform`（自 `src/main/core/token-stats/paths`），:56 afterEach 恢复表达式改为 `set_collector_host(host_from_platform(process.platform))`，旧三元表达式（`process.platform === "win32" ? "windows" : "linux"`）完全移除。核对生产实现 paths.ts:25-34：darwin→macos、win32→windows、default→linux，恢复推导与生产单一来源，darwin 偏差消除；Windows CI 下恢复 "windows" 行为不变。import 位于 os mock 之后且 paths 为纯函数（不依赖 os/fs），无 mock 污染；重跑 collector-local.test.ts 3/3 绿。
    - t309_code_f001/002/003 与 t309_test_f001（前轮已消除）：本轮 diff 无相关改动（增量仅 afterEach 一行 + import 一行），结论不变。
- 改测方向复核：无「迁就实现」的改测。本轮改动仅为测试环境恢复表达式换用生产推导函数，未修改任何既有断言预期。
- 本轮新发现：0 条
- 未进表的提示：无（make_dashboard 与 complete_dto fixture 合并建议已见 Round 3，不重复）
- 总体判断：f002 已真修且未引入新问题，恢复表达式与生产单一来源对齐；3/3 重跑绿、全量 typecheck 通过、改动文件 eslint 0 告警。
- 系统性 follow-up：无

### AC 复验方式（Round 4）

- AC-001/002/003/004/005：`re_verified` — 本轮改动仅测试环境恢复表达式（不触碰任何断言），AC 覆盖与前轮一致；重跑 collector-local.test.ts 3/3 绿，全量 `pnpm typecheck` 通过，`eslint` 改动文件（collector-local.test.ts / paths.ts）0 告警。

coverage = 5 / 5

reviewed_scope: 2f1fcbbc4aadc7bf

verdict: PASS
