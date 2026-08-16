# Task review t434（reviewer_focus: 代码）

- task：`t434_session_refresh_collect_reset`
- spec：`docs/tasks/t434_session_refresh_collect_reset/spec.md`
- diff_anchor：`0a3849a7b61c85f443ec66739ea936220e75e562`
- target：`git diff 0a3849a7b61c85f443ec66739ea936220e75e562`
- round：1
- reviewed_at：2026-08-17 01:20 UTC+8

## Findings

### t434_code_f001 - AC-005 测试断言与实际验证范围不符：只验 postMessage，未验 interval 重置

- 严重度：minor
- 锚点：AC-005（自动采集定时器以 `poll_interval_ms` 从手动采集时刻重新起算）
- 位置：`tests/unit/main/core/token-stats/manager.test.ts:336`（测试名 "t434 AC-001/AC-005: force_collect posts config to the running child (collect + interval reset)"）
- 问题：该测试仅断言 `last_child!.postMessage` 收到 `{type:"config", config:base_config}`，未断言 interval 重置。interval 重置发生在 collector 侧（`src/main/core/token-stats/collector.ts:791` 的 `start_interval`：先 `clearInterval` 再以 `poll_interval_ms` 重 arm），而该路径无任何测试：collector 测试的 parentPort mock 中 `on: vi.fn()`（`tests/unit/main/core/token-stats/collector.test.ts:43`）从不触发，"config 消息 → load_state → configure + start_interval" 整条链未被任何用例覆盖。测试名把 AC-005 归入自身断言范围，形成「AC 看似已测」的 overclaim。行为本身经代码阅读确认为正确（config 消息处理 → `configure()` 同步 collect → `start_interval()` 清旧 interval 并重 arm，满足 spec 风险节「采完再 arm」），故不判 blocking。
- 建议：在 collector 层补一个假时钟用例（注入 scheduler 或断言 `clearInterval` 后以 `poll_interval_ms` 重新 `setInterval`），或至少把该测试名改为仅声明 AC-001，避免 AC-005 覆盖被误读。

### t434_code_f002 - 新 IPC 通道 TOKEN_STATS_FORCE_COLLECT 无 main handler / preload 契约测试

- 严重度：minor
- 锚点：AC-001 可测试性（spec 测试策略：「mock/spy：collect 或 manager 的『立即采集』入口调用次数」；「UI/IPC 契约有可测断言」）
- 位置：`src/main/ipc/token-stats-ipc.ts:217`、`src/preload/index.ts:104`、`tests/unit/ipc/token-stats-ipc.test.ts`
- 问题：`tests/unit/ipc/token-stats-ipc.test.ts` 对每个既有 token-stats 通道均有 sender 校验与转发用例，唯独新增的 `TOKEN_STATS_FORCE_COLLECT` 通道零覆盖（handler 注册、`assert_valid_sender`、`manager.force_collect()` 调用、`ok(null)`/`COLLECT_FAILED` 返回均未断言）；`tests/unit/preload/token_stats_session_library.test.ts` 也未补 `forceCollect` 转发断言。渲染层测试（`SessionShell.test.tsx:253`）已覆盖 renderer-facing `forceCollect` 被调用，主进程桥仍属 glue，缺口可接受，但与本文件逐通道测试的既有惯例不一致。
- 建议：在 `tests/unit/ipc/token-stats-ipc.test.ts` 补两例（未知 sender 拒绝；正常调用转发 `manager.force_collect` 并回 `ok(null)`），preload 契约测试补 `forceCollect` → 通道名断言。

### t434_code_f003 - AC-003 部分缺口：已打开的最近会话弹窗在顶栏刷新后不重拉

- 严重度：minor
- 锚点：AC-003（最近会话相关 UI 依赖 token-stats 会话查询时，按原调用方式再请求一次）
- 位置：`src/renderer/components/workspace/RecentSessionsModal.tsx:22`（`useEffect(..., [])` 仅 mount 查询一次 `getSessions({limit: RECENT_LIMIT})`）、`src/renderer/components/session-shell/SessionShell.tsx:58`（onRefresh 未接入 modal）
- 问题：`RecentSessionsModal` 仅 mount 时查询，`refresh_token` 未传入，弹窗已打开状态下点顶栏刷新，列表保持旧数据直到关闭重开（弹窗 overlay 下顶栏仍可点）。主路径满足 AC（刷新后打开弹窗会重新 mount 并拿到新数据），缺口仅在「弹窗开着时刷新」的边缘路径，且无数据丢失，仅展示滞后。
- 建议：最小修复为把 `refresh_token` 传入 `RecentSessionsModal` 并加入查询 effect 依赖；或在 AC 处置表声明该边缘路径属「有意不测」等价决策（非范围外），择一并写明。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮 Round 1）
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
  - 文件过大（按规则不进 finding 表）：`src/renderer/components/session-library/SessionLibrary.tsx` 632 行 ≥400（minor 阈值），本 task 净增约 5 行；`src/main/core/token-stats/collector.ts` 835 行未被本 diff 触碰，不计。
  - 圈复杂度：`force_collect` 等新增函数分支简单，无 ≥15 项，不提示。
  - 范围外观察：工作台页签刷新时 `set_refresh_token` 递增同样触发隐藏态 `SessionLibrary` 的 effect 重拉（两个页签 section 常驻挂载，仅 CSS hidden，`SessionShell.tsx:118/144`），每次刷新多一次不可见 `getSessions` 查询；无害（顺带保持库数据新鲜），未产出可观测缺陷，不入 finding。
- 总体判断：实现面窄而准（复用 config 消息走与周期采集同入口，`start_interval` 先清后 arm 满足 spec 风险节），7 条 AC 均有落地，3 条 minor 均为测试覆盖/边缘路径问题，无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。manager 测试断言 `force_collect` 发送 `{type:"config"}`（`manager.test.ts:345`）；collector 侧 config 消息 → `configure()` → `collect()`（`collector.ts:799-810`）与周期采集同入口；渲染测试断言刷新点击后 `forceCollect` 被调（`SessionShell.test.tsx:253`）。
- AC-002：`re_verified`。代码路径：`SessionShell.tsx:64` 递增 `refresh_token` → `WorkspaceView.tsx:101-104` `refresh_all()`（t252 既有槽位重拉），行为保留。
- AC-003：`re_verified`（部分缺口见 f003）。刷新后打开弹窗重新 mount 即按原 `getSessions({limit:100})` 重查（`RecentSessionsModal.tsx:22-38`）。
- AC-004：`re_verified`。`SessionLibrary.tsx:138-168` effect 依赖 `[backend_filters, refresh_token]`，刷新递增 token 按当前筛选/排序 `getSessions({limit: PAGE_SIZE, offset: 0})` 重拉；渲染测试断言第二次 `getSessions` 调用（`SessionShell.test.tsx:256`）。
- AC-005：`re_verified`。行为经代码阅读：config 消息处理链 `collector.ts:799-810` 的 `start_interval()`（`collector.ts:791-795`）先 `clearInterval` 再以 `poll_interval_ms` 重 arm，满足「下一次自动 collect 不早于该间隔」；测试断言缺口见 f001。
- AC-006：`re_verified`。定向复验 `pnpm exec vitest run tests/unit/main/core/token-stats/manager.test.ts tests/unit/renderer/components/session_shell/SessionShell.test.tsx tests/unit/renderer/components/workspace/WorkspaceView.test.tsx` → 3 files / 82 tests 全过（manager 23、SessionShell 12、WorkspaceView 47）。按 CPU 节制未跑全量套件；5 个 usageboard mock 工具文件已补 `forceCollect`，其余 `tokenStats:` 桩（workspace/session_library/token_stats_view/header 等）均不触发该调用，无连锁红灯迹象。
- AC-007：`trust_prior`。`[deploy]`，依赖真实实例点刷新后人工核对列表/最近会话反映磁盘会话变化；无实施侧自动证据，建议合并前人工抽查。

coverage = 6 / 7

reviewed_scope: 1a4d296e6a9048fe

verdict: PASS

## Round 2 (2026-08-17 10:35 UTC+8)

### 前轮 finding 复核

- **t434_code_f001（minor，AC-005 interval 重置零断言）：已修。** `tests/unit/main/core/token-stats/collector.test.ts:1382-1413` 新增「interval 重置 (t434 AC-005)」假时钟用例：`vi.useFakeTimers()` + spy `setInterval`/`clearInterval`，先 `configure({poll_interval_ms:120_000})` + `start_interval()` 断言按 `collect` 过滤的 arm 调用间隔为 120_000，再换 300_000 重配 + `start_interval()` 断言 `clearInterval` 被调且最后一次 arm 用新值——直接命中 AC-005「clear 旧 + 按 poll_interval_ms 重新起算」。测试触达真实实现 `collector.ts:791-795`（`setInterval(collect, config.poll_interval_ms)`），非 mock 被测逻辑；`-t "interval 重置"` 单独运行通过。manager 测试名 AC-001/AC-005 的 overclaim 现由 collector 层真测试兜底。
- **t434_code_f002（minor，新 IPC 通道无契约测试）：未按建议补测试，处置表状态标注不准。** grep 证实 `tests/unit/ipc/token-stats-ipc.test.ts` 与 preload 契约测试均无 `forceCollect`/`FORCE_COLLECT` 断言，Round 1 建议的两例（未知 sender 拒绝；正常转发回 `ok(null)`）未落地。task.md 处置表标「已修」但 rationale 是「薄转发无独立逻辑」——这实质是撤回/遗留性质，非已修，状态应改「遗留」。缺口本身维持 minor 判定：handler 仅 8 行薄转发（`token-stats-ipc.ts:216-226`），`assert_valid_sender` 为共享 helper 已被既有通道用例覆盖，`force_collect` 行为核心（config 消息 → collector configure + start_interval）已被 manager/collector 测试钉住。不阻断。
- **t434_code_f003（minor，弹窗已打开态刷新不重拉）：已修。** `RecentSessionsModal.tsx:41-44` effect 依赖 `[refresh_token]`，按原 `RECENT_LIMIT=100`/排序重查；prop 传递链完整：`SessionShell.tsx:125` → `WorkspaceView.tsx:25/42` → `WorkspaceView.tsx:438` 传入 modal。行为符合 AC-003「按原接口/原 limit/排序再查一遍」。
- 交叉观察（test 侧修复载体，供 test reviewer 复核）：test f001 载体在 `SessionShell.test.tsx:235-286` 新用例（断言刷新后 `sessionHistory.query` 调用数增长 + `forceCollect` 被调）；test f003 载体即上述 collector 假时钟用例。test f002 的标注问题仍部分存在：新用例断言的 `getSessions` 再调实际来自会话库页签重拉（AC-004 场景），AC-003 最近会话弹窗重查在渲染测试中仍无直接断言（`RecentSessionsModal` 无测试文件引用，`WorkspaceView.test.tsx:309/329` 为 t224 既有用例、未测刷新重查）——不越界评审，留待 test reviewer 定夺。

### 本轮新发现

- 无新增 finding。扫描 7 视角（安全/正确性/契约/性能/架构/健壮性/文档）未见修复引入的新问题：`start_interval` 导出仅测试用，与既有 `configure`/`reset_config` 导出模式一致，不改生产行为；web 端 `forceCollect` no-op 返回 `Promise.resolve(null)` 与 `UsageboardApi` 契约一致；IPC 新 handler 保留 `assert_valid_sender` + try/catch 返回 `COLLECT_FAILED`；渲染层 `.catch(() => undefined)` 吞错为 Round 1 既有行为非新增。

### 结论

- 前轮 finding 复核（Round 2）：f001 已修、f002 未按建议补测试（minor，不阻断；处置表状态应改「遗留」）、f003 已修。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大（按规则不进 finding 表）：`tests/unit/main/core/token-stats/collector.test.ts` 1413 行 ≥1200，本 task 净增 36 行（新增 describe 块）；`src/main/core/token-stats/collector.ts` 836 行 ≥800，本 task 仅净增 1 行（导出 start_interval）；`SessionLibrary.tsx` 632 行 ≥400，净增约 7 行（Round 1 已列）。
  - 圈复杂度：本轮无新增函数分支，不提示。
  - 范围外观察：f002 处置表状态「已修」与实际不符（测试未补），建议 implementer 改「遗留」避免后续 review 误判；AC-003 弹窗重查无渲染测试断言（见上，归 test reviewer）。
- 总体判断：前轮 2/3 已修，f002 为 minor 且缺口不可辩护升级（薄转发、下层行为已钉住），无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified`。定向重跑 4 文件 130 用例全过；新用例断言刷新点击后 `forceCollect` 被调（`SessionShell.test.tsx:268-272`）；manager 侧 `force_collect` 发送 config 消息（`manager.test.ts:336-357`）。
- AC-002：`re_verified`。新用例断言刷新后 `sessionHistory.query.mock.calls.length` 增长（`SessionShell.test.tsx:274-277`），配合 `WorkspaceView.tsx:100-104` 既有 `refresh_all`。
- AC-003：`re_verified`（实现层）。`RecentSessionsModal.tsx:41-44` effect 依赖 `[refresh_token]` 按原 limit/排序重查；渲染测试无直接断言（test 层缺口，见结论提示）。
- AC-004：`re_verified`。`SessionLibrary.tsx:164-167` effect 依赖 `[backend_filters, refresh_token]`；新用例断言 `getSessions` 调用数增长（`SessionShell.test.tsx:278-282`）。
- AC-005：`re_verified`。collector 假时钟用例直接断言 clear 旧 + 按 poll_interval_ms re-arm（`collector.test.ts:1382-1413`，单独运行通过）。
- AC-006：`re_verified`。`pnpm exec vitest run tests/unit/main/core/token-stats/manager.test.ts tests/unit/main/core/token-stats/collector.test.ts tests/unit/renderer/components/session_shell/SessionShell.test.tsx tests/unit/renderer/components/workspace/WorkspaceView.test.tsx` → 4 files / 130 tests 全过。按 CPU 节制未跑全量套件。
- AC-007：`trust_prior`。`[deploy]`，同 Round 1 依赖真实实例人工核对，建议合并前人工抽查。

coverage = 6 / 7

reviewed_scope: e32c6a583e75ea53

verdict: PASS

## Round 3 (2026-08-17 10:45 UTC+8)

### 前轮 finding 复核

- **t434_code_f001（minor，AC-005 interval 重置零断言）：维持已消除。** `collector.test.ts:1382-1413` 假时钟用例本轮无变动（本轮 diff 相对 Round 2 仅新增 WorkspaceView.test.tsx 用例与 task.md 处置表），定向套件 131/131 通过；manager 测试名 overclaim 由该真测试兜底。
- **t434_code_f002（minor，新 IPC 通道无契约测试）：维持未修，仍 minor 遗留。** 本轮 diff 未见 token-stats-ipc / preload 契约测试补充；task.md 处置表仍标「已修」、rationale 为「薄转发无独立逻辑」——实质是遗留，Round 2 已建议改「遗留」，本轮仍未改（process 层面名实不符，minor）。不阻断：handler 8 行薄转发，`assert_valid_sender` 为既有共享 helper，force_collect 下层行为已由 manager/collector 测试钉住。
- **t434_code_f003（minor，弹窗打开态刷新不重拉）：代码修复已消除，测试钉住不成立（见 f004）。** 代码链路完整：`RecentSessionsModal.tsx:45` effect 依赖 `[refresh_token]` 按原 `RECENT_LIMIT=100`/排序重查，`SessionShell.tsx:154` 传 token，`WorkspaceView.tsx:435-439` 传入 modal；弹窗保持打开点刷新行为正确。但承载其测试钉住的新用例断言无效。

### 本轮新发现

### t434_code_f004 - 新增 AC-003 用例断言不隔离弹窗重查：改回 Round 1 有 bug 代码用例仍通过

- 严重度：important（test 轴弱化断言 / AC 缺有效钉住）
- 锚点：AC-003 + spec 测试策略「刷新回调后 `tokenStats.getSessions` 被再次调用」
- 位置：`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:384-406`
- 问题：用例经 `render_shell()` 渲染整个 `<SessionShell />`（该文件 :141-145），双页签 section 常驻挂载仅 CSS hidden（`SessionShell.tsx:118-156`），隐藏态 `SessionLibrary` 同样持有 `refresh_token`（`SessionShell.tsx:154`）且 effect 依赖 `[backend_filters, refresh_token]`（`SessionLibrary.tsx:164-167`）——点刷新即再调一次 `getSessions`。断言的 `getSessions.mock.calls.length > calls_before` 计数所有来源的调用：弹窗打开时 calls_before 已含「库 mount + 弹窗 mount」2 次；刷新后库 effect 独立贡献 ≥1 次调用，断言仅凭库重查即满足。**实证**（本 reviewer 用临时探针用例复验，跑完即删，未改动任何被审文件）：探针 A 不打开弹窗，仅 mount + 点刷新，getSessions 计数 1 → 2，增长完全由隐藏态 SessionLibrary 驱动；探针 B 复刻本用例全流程，mount=1、弹窗打开 calls_before=2、刷新后=4（库 +1 与弹窗 +1 叠加）。反证：把 `RecentSessionsModal.tsx:45` effect 依赖改回 `[]`（Round 1 缺陷态），刷新后调用数 3 > 2 用例照过——该测试无法证明「弹窗保持打开态重查」发生，AC-003 弹窗重查实际仍无有效测试钉住，implementer「已补弹窗打开态刷新重查测试」声明不成立。注：test reviewer Round 3 PASS 依据「getSessions 在渲染树中仅 RecentSessionsModal 调用」与实测不符——`SessionLibrary` 常驻挂载并调用 `getSessions`（探针 A 直接证伪该前提）。
- 建议：断言改为弹窗可归因观察，二选一——(a) 刷新后改 mock 后续返回值（不同 title/ended_at 或追加第二条 session），断言弹窗内行内容随之更新（弹窗保持打开）；(b) 断言刷新后出现携带 `limit: 100`（RECENT_LIMIT）的新调用，如 `expect(ub.tokenStats.getSessions).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))`（库重查携带 `limit: 50, offset: 0`，可按参数区分）。另建议 `SessionShell.test.tsx:235` 用例名「AC-001/AC-002/AC-003」仍属标注错位：其 getSessions 增长断言发生在会话库页签场景，对应 AC-004 而非 AC-003（Round 2 已提示，未改）。

### 结论

- 前轮 finding 复核（Round 3）：f001 已消除（维持 Round 2）；f002 维持 minor 遗留（处置表状态仍名实不符）；f003 代码修复已消除、测试钉住无效（f004）。
- 本轮新发现：1 条（f004，important）。
- 未进表的提示：
  - 文件过大（按规则不进 finding 表）：`collector.test.ts` 1413 行、`collector.ts` 836 行、`SessionLibrary.tsx` 632 行——本轮均无净增，维持 Round 2 提示。
  - 圈复杂度：无新增函数分支，不提示。
  - 范围外观察：无。
- 总体判断：实现面保持正确（f001/f003 代码层成立，定向 4 文件 131 用例全过）；但 implementer 用于关闭 Round 2 test FAIL 的新用例断言被隐藏态 SessionLibrary 重查路径满足（探针实证：不打开弹窗计数同样增长），AC-003 弹窗重查仍无有效钉住——存在未解决 important（test 轴弱化断言），本轮 FAIL。该 finding 虽属测试层，但直接裁定 implementer 声称的修复是否成立，且属共享规则允许代码审阅标注的弱化断言 anti-pattern；test reviewer Round 3 PASS 与实测证据冲突（其「getSessions 仅弹窗调用」前提被探针 A 证伪），建议 test reviewer 复核本结论。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified`。`SessionShell.test.tsx:268-272` 断言刷新点击后 `forceCollect` 被调；`manager.test.ts:336-357` force_collect 发 config 消息；定向套件通过。
- AC-002：`re_verified`。`SessionShell.test.tsx:274-277` query 调用数增长 + `WorkspaceView.tsx:100-104` refresh_all 既有行为。
- AC-003：`re_verified`（实现层）/ 测试钉住不成立。`RecentSessionsModal.tsx:45` 依赖 `[refresh_token]` 按 limit 100 重查（代码阅读 + 探针 B 证实刷新后弹窗贡献 +1 次调用）；新增 WorkspaceView 用例无法隔离弹窗重查（f004，探针 A 证伪 test reviewer「仅弹窗调用 getSessions」前提）。
- AC-004：`re_verified`。`SessionLibrary.tsx:164-167` 依赖 `[backend_filters, refresh_token]`；`SessionShell.test.tsx:278-282` 断言 getSessions 调用数增长。
- AC-005：`re_verified`。`collector.test.ts:1382-1413` 假时钟 clear 旧 + 按 poll_interval_ms re-arm，定向运行通过。
- AC-006：`re_verified`。`pnpm exec vitest run tests/unit/main/core/token-stats/manager.test.ts tests/unit/main/core/token-stats/collector.test.ts tests/unit/renderer/components/session_shell/SessionShell.test.tsx tests/unit/renderer/components/workspace/WorkspaceView.test.tsx` → 4 files / 131 tests 全过（manager 23、collector 48、SessionShell 12、WorkspaceView 48）。按 CPU 节制未跑全量套件。
- AC-007：`trust_prior`。`[deploy]`，同前轮依赖真实实例人工核对，建议合并前人工抽查。

coverage = 6 / 7

reviewed_scope: 97d5e3ab4e677499

verdict: FAIL

## Round 4 (2026-08-17 10:55 UTC+8)

### 前轮 finding 复核

- **t434_code_f001（minor，AC-005 interval 重置零断言）：维持已消除。** `collector.test.ts` 假时钟用例本轮无变动（相对 Round 3 增量仅 `WorkspaceView.test.tsx` 该用例断言实现 + task.md 处置表），定向套件 131/131 通过，manager 测试名 overclaim 由 collector 层真测试兜底。
- **t434_code_f002（minor，新 IPC 通道无契约测试）：维持未修，仍 minor 遗留。** grep 证实 `tests/unit/ipc/` 与 `tests/unit/preload/` 仍无 `FORCE_COLLECT`/`forceCollect` 断言（相对锚点 diff 亦无相关文件）；task.md 处置表仍标「已修」、rationale「薄转发无独立逻辑」——实质是遗留，Round 2/3 已两次建议改「遗留」，本轮仍未改（process 层名实不符，minor）。不阻断：handler 8 行薄转发，`assert_valid_sender` 为既有共享 helper 已被既有通道用例覆盖，`force_collect` 下层行为（config 消息 → collector configure + start_interval）已由 manager/collector 测试钉住。
- **t434_code_f003（minor，弹窗打开态刷新不重拉）：代码修复维持，测试钉住本轮成立（f004 消除后）。** 代码链路不变：`RecentSessionsModal.tsx:28-45` effect 依赖 `[refresh_token]` 按 `RECENT_LIMIT=100` 重查；新断言按 `limit:100` 过滤后直接命中弹窗重查，AC-003 现已有有效测试钉住。
- **t434_code_f004（important，弹窗重查断言被隐藏挂载 SessionLibrary 的 limit:50 重拉污染）：已真消除。** 修复载体 `WorkspaceView.test.tsx:384-417`：断言改为 `recent_calls()` 过滤 `mock.calls` 中 `c[0].limit === 100` 的调用（RECENT_LIMIT），弹窗打开后 `calls_before=1`，刷新后弹窗 effect 重查贡献 +1 → 断言 `recent_calls() > calls_before` 成立。隔离有效性经三方面确认：(1) 调用源穷举——grep 全 `src/renderer` 的 `getSessions` 调用点仅 4 处：`RecentSessionsModal`（limit:100）、`SessionLibrary`（limit:50, offset）、`SessionPickerModal`（limit:500，本用例未挂载）、`use-workspace-columns`（limit:5，带 source/env/search），limit:100 为弹窗独占，SessionLibrary 的 limit:50 不再满足断言；(2) 缺陷态敏感性——若 effect 依赖改回 `[]`（Round 1 缺陷态），刷新后 limit:100 计数不变，`recent_calls() > calls_before` 恒 false、waitFor 超时失败，断言能钉住缺陷（与 Round 3 探针 B 反证的旧断言形成对照）；(3) 定向套件全过。断言经参数区分而非计数，`SessionLibrary.tsx:151/188` 的 `{...backend_filters, limit: PAGE_SIZE=50}` 展开顺序保证 limit 恒被 50 覆盖，不受 backend_filters 干扰。

### 本轮新发现

- 无新增 finding。扫描 7 视角（安全/正确性/契约/性能/架构/健壮性/文档）未见修复引入的新问题：本轮改动仅限测试文件内断言实现，未触碰生产代码；`c[0] as { limit?: number } | undefined` 类型断言为测试内 mock 参数读取，不涉生产类型面；`waitFor` 内计数断言无时序风险（mock 调用计数在 effect 同步执行时即递增，非依赖 resolve 时序）。

### 结论

- 前轮 finding 复核（Round 4）：f001 维持已消除；f002 维持 minor 遗留（处置表状态仍名实不符，第三次提示）；f003 代码修复维持且测试钉住本轮生效；f004 已真消除（参数过滤隔离有效 + 缺陷态敏感性成立）。
- 本轮新发现：0 条
- 未进表的提示：
  - 文件过大（按规则不进 finding 表）：`collector.test.ts` 1413 行、`collector.ts` 836 行、`SessionLibrary.tsx` 632 行——本轮均无净增，维持 Round 2 提示。
  - 圈复杂度：无新增函数分支，不提示。
  - 范围外观察：新断言将弹窗重查与库重查的区分建立在 `RECENT_LIMIT=100` vs `PAGE_SIZE=50` 的取值差异上——若未来改动任一常量使两者相等，断言会重新被污染。属测试对生产常量的隐式耦合，当前非缺陷，仅提示 implementer 后续改动两常量时留意本用例。
- 总体判断：f004（important）已由参数过滤断言真消除并经验证对缺陷态敏感，定向 4 文件 131 用例全过；无未解决 critical/important，仅有 1 条 minor 遗留（f002，非阻断）。
- 系统性 follow-up：无

### AC 复验方式（Round 4）

- AC-001：`re_verified`。`SessionShell.test.tsx:268-272` 断言刷新点击后 `forceCollect` 被调；`manager.test.ts:336-357` force_collect 发 config 消息；定向套件通过。
- AC-002：`re_verified`。`SessionShell.test.tsx:274-277` query 调用数增长 + `WorkspaceView.tsx:100-104` refresh_all 既有行为。
- AC-003：`re_verified`。`RecentSessionsModal.tsx:28-45` effect 依赖 `[refresh_token]` 按 `RECENT_LIMIT=100` 重查；`WorkspaceView.test.tsx:384-417` 按 limit:100 参数过滤断言弹窗重查，调用源穷举确认 limit:100 为弹窗独占、缺陷态敏感性成立。
- AC-004：`re_verified`。`SessionLibrary.tsx:164-167` 依赖 `[backend_filters, refresh_token]`；`SessionShell.test.tsx:278-282` 断言 getSessions 调用数增长。
- AC-005：`re_verified`。`collector.test.ts:1400-1425` 假时钟 clear 旧 + 按 poll_interval_ms re-arm，定向运行通过。
- AC-006：`re_verified`。`pnpm exec vitest run tests/unit/renderer/components/workspace/WorkspaceView.test.tsx tests/unit/renderer/components/session_shell/SessionShell.test.tsx tests/unit/main/core/token-stats/manager.test.ts tests/unit/main/core/token-stats/collector.test.ts` → 4 files / 131 tests 全过（manager 23、collector 48、SessionShell 12、WorkspaceView 48）。按 CPU 节制未跑全量套件。
- AC-007：`trust_prior`。`[deploy]`，同前轮依赖真实实例人工核对，建议合并前人工抽查。

coverage = 6 / 7

reviewed_scope: 57e903d3e4002b5e

verdict: PASS
