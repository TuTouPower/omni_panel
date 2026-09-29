# Task review t535（reviewer_focus: 代码）

- task：`t535_flowercloud_background_first_refresh`
- spec：`docs/tasks/t535_flowercloud_background_first_refresh/spec.md`
- diff_anchor：`56c01c1be881a2e834248aa11ad849d1b2a70ec3`
- target：`git -C '/Users/karson/kar/code/omni_panel_t535' diff 56c01c1be881a2e834248aa11ad849d1b2a70ec3`
- round：1
- reviewed_at：2026-09-29 22:22 UTC+8

reviewed_scope: 9d8b8ef164555a2a（`git diff 56c01c1b` 全量输出 sha256 前缀；12 文件 +373/-306）
`src/main/core/session/flowercloud_dom.ts`、`src/main/core/session/session-manager.ts`、`src/main/core/session/session-types.ts`、`src/main/core/scheduler/refresh-service.ts`、`src/main/index.ts`、`tests/unit/session/session-manager.test.ts`、`tests/unit/session/flowercloud_dom.test.ts`、`tests/unit/scheduler/refresh-service.test.ts`、`docs/specs/flowercloud_usage.md`、`docs/blueprint/{architecture,decisions,testing}.md`、`docs/tasks/t535_flowercloud_background_first_refresh/task.md`
排除了 `tests/integration/**`（本 diff 未触及）、lockfile / 生成物（无）。审查期间工作区仍在写入（`tests/unit/scheduler/refresh-service.test.ts` 于 22:18:27 追加用例），本 review 结论固定在上述 diff 哈希。

## Findings

### t535_code_f001 - 抓取失败路径未把上次成功观测标 `stale` / 未写 `last_error`，AC-004 只落地了一半

- 严重度：important
- 锚点：AC-004（「失败路径保留最后一次成功观测及其采集时间，观测标 `stale` 并携带失败原因」）；同时违反 `docs/blueprint/domain.md:77` 不变量 02（「采集失败保留上次成功观测，挂 `stale:true` + `lastError`，绝不覆盖删除」）
- 位置：`src/main/core/scheduler/refresh-service.ts:435-448`（新增早退分支），对照同文件 `:791-821`（既有失败收尾：`list_latest_success_by_instance` → `insert_batch({...obs, stale:true, last_error})`）
- 问题：抓取失败时新分支只做 `runtimeStore.updateState({status:"failed", error:reason, lastSuccess:prior})` 便 `return`，整段「为上次成功观测插入 `stale:true` + `last_error` 降级副本」的逻辑（`:797-821`）被绕过。可验证后果链：
    - `Observation.stale` 保持 `false`、`last_error` 不更新（`src/main/core/scheduler/observation-mapping.ts:42` 把 `obs.stale` 直接映射为 `MetricRecord.stale`）；
    - 用量卡「已过期」标记依赖 `group.stale` ← `period.stale` ← `MetricRecord.stale`（`src/renderer/components/ProviderCard.tsx:195-201`、`src/renderer/lib/provider-usage.ts:364,408`），因此抓取失败后不再出现 `stale-badge`；
    - 按 `obs.stale` 判断新鲜度的消费方（如 `src/main/core/scheduler/hydrate-runtime-store.ts:28-43` 经 `observations_to_ready_state` 直接采用 `obs.stale`）会把这段旧数据当新鲜数据处理。
    - 对照证据：连接器失败路径的同类行为有既有集成断言 `tests/integration/scheduler/refresh-service.test.ts:1645`（`stale:true` + `last_error`），本 diff 未给抓取失败路径任何等价断言；spec「测试策略」要求的调度集成测试「旧值保留并标 stale」在本 diff 中完全缺席（`git status` 只有两个 `tests/unit/**` 文件被改）。
    - 注意：失败原因是可见的（`src/renderer/hooks/use_popup_derived.ts:104-119` 由 `status==="failed"` 生成 `connectorError`，`ProviderCardErrorBanner` 渲染「采集失败：…」），所以这是**部分落地**——运行时层满足，观测层未满足；两条失败路径（连接器失败 vs 页面抓取失败）语义自此分叉。
- 建议：把抓取失败分支并入统一失败收尾，或在 `:435-448` 内复用同一段 stale 副本写入（`stale:true` + `last_error: reason`，保留原 `observed_at`），使 `Observation.stale` 与 `runtimeStore` 同时反映失败；并补一条调度集成断言（无上次成功观测时走 `failed` 无 stale，与 `:791` 注释的既有约定一致）。

### t535_code_f002 - `flower_needs_user` 成为零引用死导出

- 严重度：minor
- 锚点：代码质量（死代码 / 未使用导出）
- 位置：`src/main/core/session/flowercloud_dom.ts:156-158`
- 问题：删掉 reveal 分支后，全仓（`src/`、`tests/`、`connectors/`、`scripts/`）已无任何调用点（`git grep -n flower_needs_user` 仅命中定义本身）。该函数现在既无生产调用也无测试调用，属本 task 制造的死代码（`docs/specs/flowercloud_usage.md` 也不再引用它）。
- 建议：删除该导出；若保留是为了给 `flower_failure_reason` 的三分类做语义命名，则改为在 `flower_failure_reason` 内部使用或直接删除，避免留下无人调用的「分类器」。

### t535_code_f003 - spec 称新鲜期跳过「不开窗」，实现仍先建窗再关

- 严重度：minor
- 锚点：文档与实现不一致（本 diff 改写的同一行）
- 位置：`docs/specs/flowercloud_usage.md:20`（本 diff 改写为「…不开窗，直接返回 `ok: true`」）对照 `src/main/core/session/session-manager.ts:617`（`deps.create_window(partition, { hidden: true })` 在 `run_flowercloud_snapshot` 之前无条件执行，新鲜期判定在 `flowercloud_dom.ts:369-383` 内、建窗之后）
- 问题：`skip_if_fresh` 命中时仍会创建并立即销毁一个隐藏 `BrowserWindow`（未 `loadURL`），与文档「不开窗」不符；既有单测名称也写「skips opening a window…」却断言 `deps.windows` 长度为 1（`tests/unit/session/session-manager.test.ts` 对应用例），说明文档与测试命名都建立在同一误解上。行为影响仅是一次空窗创建/销毁开销，非功能缺陷。
- 建议：二选一——把新鲜期判定提到 `create_window` 之前（真正不开窗，顺带省一次窗口创建），或把文档/测试措辞改为「不加载页面、不发起抓取」。前者更贴合 AC 意图，但属实现微调，可由 implementer 判断。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无。
- 本轮新发现：3 条（1 important，2 minor）。
- 未进表的提示：
    - 文件过大（降级，不计 finding）：`src/main/core/scheduler/refresh-service.ts` 876 行（实现源码 ≥800，本 task 净增 14 行）、`src/main/core/session/session-manager.ts` 734 行（≥400，净增 12 行）、`tests/unit/scheduler/refresh-service.test.ts` 942 行（测试 ≥600，净增 99 行）；未命中净增条件但已超阈值：`tests/unit/session/session-manager.test.ts` 1779 行（净减 68）、`src/main/index.ts` 1676 行（净减 9）、`src/main/core/session/flowercloud_dom.ts` 432 行（净减 10）。
    - 圈复杂度：`refresh-service.ts` 的 `refresh()` CC ≥ 10（本 task 在其中新增结果归一 catch、generation 复核、失败早退 3 个分支），建议后续把失败收尾抽成独立函数；`poll_flower_usage_html` CC ≈ 8（本 task 删分支后下降）；`flower_failure_reason` 属纯表驱动分发，按规则排除。
    - 范围外观察（均非本 diff 引入，不作 finding）：① `force` 刷新若与在途 `skip_if_fresh` 抓取 join（`session-manager.ts:609-610` 复用同一 Promise），会拿到「跳过」结果而丢掉强制重抓，本 diff 未改该 join 逻辑；② `write_flowercloud_html` 因 CAS 不符 / 不安全 cookie 返回 false 时，`flowercloud_dom.ts:178-181` 的兜底文案会经 `session-manager.ts:650-651` 把本轮标成 `failed`（「花云页面已出现用量，但本轮未写入快照」），语义偏「失败」而实为「被更新数据取代」，文案可再区分；③ `tests/unit/session/flowercloud_dom.test.ts:24,36-41` 的 mock 仍保留已从 `SessionWindow` 删除的 `present_for_capture` / `reveal` 与只自增不断言的 `revealed`，属同类清理项（测试层，交 test reviewer 处置）。
- 总体判断：AC-001/002/003/005/006 的实现与测试到位，窗口/登记生命周期（成功、失败、超时、取消、登录抢占、在途 join）均一视同仁关窗并释放 `in_progress` / `flower_snapshots`，`refresh_web_session` 契约变更在实现、调用方、测试三侧同步且 `typecheck`/`lint` 通过，无范围外改动；但抓取失败路径未按 AC-004 与 domain 不变量 02 标记 stale 观测，属未解决的 important，判定 FAIL。
- 系统性 follow-up：无（f001 属本 task 自纠范围；若决定把「失败降级副本」抽成 refresh-service 公共收尾，可与 t516 已收敛的 stale 机制合并处理，无需新 tid）。

### AC 复验方式

- AC-001：`re_verified`——`present_for_capture` / `reveal` 已从 `SessionWindow`（`session-types.ts:23-31`）与宿主（`index.ts:752-797`）删除，全链路无 `show()`/`setOpacity()` 调用；隐藏窗断言见 `session-manager.test.ts`「keeps the capture window hidden…」（`deps.window_options[0] === { hidden: true }`）。
- AC-002：`re_verified`——手动刷新与定时刷新同走 `refresh_web_session`，`force` 仅改变 `skip_if_fresh`（`index.ts:404-422`），前台化只剩用户主动 `start_login`；`refresh-service.test.ts`「marks a forced refresh failed as well…」验证 force 与自动刷新失败语义一致。
- AC-003：`re_verified`——`flower_failure_reason` 覆盖 demand 分类并按 `failed` 有界结束（`refresh-service.ts:435-448`）；抓取侧 `timeout_ms` 缺省 45s，`poll_flower_usage_html` 删除 handover 无限期延长后由 `deadline` 收口；`refresh-service.test.ts` 断言 `execute_connector` 未被调用且 `state.status === "failed"`。
- AC-004：`partial`——运行时层（`failed` + 可读 `error` + 保留 `lastSuccess`）已实现且有单测「keeps the last successful snapshot when the page refresh fails」；观测层 `stale` / `last_error` 未写入，见 f001。
- AC-005：`re_verified`——预算耗尽即关窗并释放登记，下一轮可再抓且无残留（`session-manager.test.ts`「closes the window and frees the registration when the capture budget runs out」断言 `windows.length === 2` 且全部 `closed`）；`handover_wait_ms` / `handed_over` 已整体移除（`git grep` 零残留）。
- AC-006：`re_verified`——用户关窗（`stops the flowercloud snapshot when the user closes the window`）、交互登录抢占、并发/重入 join（`second === first`、`windows.length === 1`）、`finally` 统一关闭与注销（`session-manager.ts:652-661`）均有断言覆盖。
- AC-007：`manual_pending`——不可自动复验（`[deploy]`）；实现侧已满足「不前台化」这一前提（窗口 `show:false` 且全程不调用 `show()`），Dock / 窗口切换器 / Mission Control 表现仍需 macOS 真机人工核验，本 worktree 未见核验记录。

coverage = 5 / 7（AC-004 部分落地；AC-007 待真机人工核验）

verdict: FAIL

## Round 2 (2026-09-29 22:34 UTC+8)

reviewed_scope: f19eff06fc4380b0（`git diff 56c01c1b` 全量输出 sha256 前缀；14 文件 +628/-351）
文件集合与 Round 1 相同，新增 `tests/integration/scheduler/refresh-service.test.ts`。复核期间工作区最后一次写入为 `docs/tasks/t535_.../task.md`（22:30:52，仅处置表），之后未再变动；本轮的 typecheck / lint / format / deadcode / arch 与全部定向测试均在该快照上执行。

### 前轮 finding 复核

- t535_code_f001（important，AC-004）→ **已消除**。`refresh-service.ts:418-444` 把原 `:791-821` 的降级逻辑抽成 `refresh()` 内闭包 `mark_observations_stale(reason)`（`list_latest_success_by_instance` → 过滤 `!stale` → 复制为 `stale:true` + `last_error:reason` → `insert_batch`，保留 `try/catch` 只告警）。抓取失败分支在 `updateState(failed)` **之前**调用它（`:481`，先于 `:482-486`），采集失败收尾复用同一函数（`:834`），两条失败路径语义统一；generation 过期检查仍在失败处理之前（`:469-474`），过期轮次不会误插 stale 副本。断言已补齐：unit `tests/unit/scheduler/refresh-service.test.ts`「marks the previous observations stale when the capture fails」（`inserted[0].stale === true`、`last_error === reason`）与 integration `tests/integration/scheduler/refresh-service.test.ts`「marks stale observations when the flowercloud page capture fails (t535 AC-004)」（`execute_connector` 未被调用 + stale 副本 + `failed` 状态）均单独跑通。既有连接器失败路径回归（`:834` 复用后）由「inserts stale observations for last successful data when refresh fails」「does not insert stale observations when first refresh fails with no prior data」「marks only the failed account's prior observations stale…」「preserves lastSuccess across consecutive failures」全绿佐证。
- t535_code_f002（minor）→ **已消除**。`flowercloud_dom.ts` 中 `flower_needs_user` 已删除；`git grep -n flower_needs_user` 仅剩 `docs/specs/flowercloud_usage.md` / `spec.md` / 归档 p269 等历史叙述与 task.md 处置表，`src/`、`tests/`、`connectors/`、`scripts/` 零引用。同文件新增的 `flower_failure_reason` 有直接单测（8 个 kind 的 `it.each` 全表 + Error 1020 端到端）。
- t535_code_f003（minor）→ **已消除**。`docs/specs/flowercloud_usage.md:20` 改为「…直接返回 `ok: true`；实现上仍会创建隐藏窗并在判定后立即关闭（窗口不可见，不产生任何前台影响）」，与 `session-manager.ts:617` + `flowercloud_dom.ts:369-383` 的实际行为一致，不再声称「不开窗」。

### Findings

Round 2 零 finding。抽查修复过程未引入新缺陷：`mark_observations_stale` 的行为与原内联块逐字等价（仅 `last_error` 由形参 `reason` / `last_error` 传入）；新增探针测试（`tests/unit/session/flowercloud_dom.test.ts` 的 `ProbedWindow` + AC-001 用例）未改变生产路径；`Observation` 等既有 import 仍被使用，`pnpm deadcode` / `pnpm arch` 无新告警。

### 结论

- 前轮 finding 复核：3/3 已消除（1 important + 2 minor），无「修不彻底」，无「同意撤回」。
- 本轮新发现：0 条。
- 未进表的提示：
    - 文件过大（降级，不计 finding）：`refresh-service.ts` 889 行（实现源码 ≥800，本 task 净增 27 行）、`session-manager.ts` 734 行（≥400，净增 12 行）、`tests/unit/scheduler/refresh-service.test.ts` 968 行（测试 ≥600，净增 115 行）、`tests/integration/scheduler/refresh-service.test.ts` 2460 行（测试 ≥1200，净增 92 行）；`tests/unit/session/session-manager.test.ts` 1779 行（净减 68）、`src/main/index.ts` 1676 行（净减 9）虽超阈值但未净增。
    - 圈复杂度：`refresh()` CC ≥ 10（本轮抽出降级闭包后略降），`mark_observations_stale` 自身 CC ≈ 3；`flower_failure_reason` 属纯表驱动分发，按规则排除。
    - 范围外观察（均非本 diff 引入，不作 finding）：① `force` 刷新与在途 `skip_if_fresh` 抓取 join 时可能丢掉强制重抓（`session-manager.ts:609-610`，本 diff 未改）；② `write_flowercloud_html` 因 CAS 不符 / 不安全 cookie 返回 false 时，兜底文案经 `session-manager.ts:650-651` 把本轮标成 `failed`（「页面已出现用量，但本轮未写入快照」），语义偏「失败」；③ `runtimeStore` 的 `failed` + `lastSuccess` 项沿用上次成功观测的 `stale` 原值，失败可见性由错误横幅承担——与既有连接器失败路径完全一致、非本 task 引入的分叉，但意味着「已过期」badge 在 failed 态不必然出现（依赖 ready 态或启动 hydrate）；④ `docs/specs/flowercloud_usage.md` §5 测试落点表未列入新增的 `tests/integration/scheduler/refresh-service.test.ts`（AC-004 证据），属文档完整性小缺口。
- 总体判断：f001 的 stale 降级已与采集失败路径同源，AC-004 观测层要求落地并有两层断言（unit + integration）；死导出与文档口径均已修正；窗口/登记生命周期、失败语义、`refresh_web_session` 契约与并发路径在 Round 1 结论基础上无回归，typecheck / lint / format / deadcode / arch 与 146 项定向测试全绿，判定 PASS。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`——`present_for_capture` / `reveal` 已从 `SessionWindow` 与宿主删除；新增负向守卫 `tests/unit/session/flowercloud_dom.test.ts`「never surfaces the capture window (AC-001)」用带 `show` / `showInactive` / `setOpacity` 探针的假窗断言三计数均为 0。
- AC-002：`re_verified`——手动与定时刷新同走 `refresh_web_session`，`force` 仅影响 `skip_if_fresh`；`refresh-service.test.ts`「marks a forced refresh failed as well when the capture reports a blocked page」验证 force 与自动刷新失败语义一致；前台化只剩用户主动 `start_login`。
- AC-003：`re_verified`——`flower_failure_reason` 8 个分类有直接单测全表覆盖；抓取失败有界结束且不跑连接器（unit + integration 双断言）。
- AC-004：`re_verified`——观测层 `stale:true` + `last_error:reason`（unit / integration 断言）+ 运行时 `failed` + 可读 `error` + 保留 `lastSuccess`（unit「keeps the last successful snapshot when the page refresh fails」）；首次失败无历史观测时不插 stale 副本的约定由既有集成用例继续守住。
- AC-005：`re_verified`——预算耗尽即关窗并释放登记，下一轮可再抓且无残留（`session-manager.test.ts` 对应用例）；handover 语义零残留。
- AC-006：`re_verified`——用户关窗、交互登录抢占、并发/重入 join、`finally` 统一关闭与注销均有断言。
- AC-007：`manual_pending`——仍不可自动复验（`[deploy]`）；实现侧不前台化的前提已由 AC-001 探针测试固定，Dock / 窗口切换器 / Mission Control 表现待 macOS 真机人工核验，本 worktree 未见核验记录。

coverage = 6 / 7（AC-007 待真机人工核验）

verdict: PASS

## Round 3 (2026-09-29 22:38 UTC+8)

reviewed_scope: f01aef3b451004b8（`git diff 56c01c1b` 全量输出 sha256 前缀；14 文件 +655/-351）
定向复核（Round 2 之后的两处改动，其余文件未再变动）：`src/main/core/session/flowercloud_dom.ts`（新增 `"network"` 分类）、`tests/unit/session/flowercloud_dom.test.ts`（it.each 加行 + 新用例）、`docs/specs/flowercloud_usage.md`（§3 失败原因分类 + §5 测试落点表）。

### 定向复核

- **改动 1（network 分类）**：`FlowerPageKind` 新增 `"network"`（`flowercloud_dom.ts:44`），`run_flowercloud_snapshot` 的 catch 由 `kind:"other"` 改为 `kind:"network"`（`:431`），`flower_failure_reason` 补 `case "network"`（`:175-176`）。语义上把 AC-003 列举的「网络失败」从原先并进 `other`（文案「页面未出现用量数据」）改为独立可解释状态；`docs/specs/flowercloud_usage.md:21` 失败原因分类已同步。`flower_failure_reason` 是无 default 的穷尽 switch，新增 variant 未补分支会 typecheck 失败，故穷尽性成立。测试到位：`it.each` 新增 `["network","网络"]`；新用例「reports a network reason when loading the page fails」让 `window.loadURL` reject（`net::ERR_FAILED`）走真实 catch 路径，断言 `outcome.kind === "network"` 且文案含「网络」。`flowercloud_dom.test.ts` 17 项全绿。
- **改动 2（spec §5 测试落点表）**：`tests/integration/scheduler/refresh-service.test.ts`（抓取失败插入 stale 副本 `stale` + `last_error`、连接器未被调用）与 unit 侧新增用例说明（抓取失败置 failed、不跑连接器、stale 降级与 lastSuccess 保留）均已补入，与测试文件实际用例一致。Round 2 提示 ④ 关闭。

### Findings

#### t535_code_f004 - 抓取路径的全部异常都被归为 `network`，非网络异常会给出错误归因

- 严重度：minor
- 锚点：AC-003 的反向问题——状态可解释，但归因错误（用户可见原因与真实失败原因不符）
- 位置：`src/main/core/session/flowercloud_dom.ts:367-431`（try 起于 `:367`，catch 在 `:423-431`）
- 问题：catch 覆盖的不只是页面加载，同一 try 内还有 `await vault.get(...)`（`:370`，skip_if_fresh 读数）、`session.get_cookies`（`:385`、`:414`）、`seed_partition_cookies`（`:386`，内部 `vault.get` / `session.set_cookie`）、`write_flowercloud_html`（`:417`，内部 `vault.get` / `vault.set`）。这些路径抛错（vault/SQLite 故障、Electron session 已销毁等）时，用户与 `last_error` 看到的原因都是「花云页面加载失败（网络或超时）」，与真实原因不符；catch 内注释列举的「网络、超时、页面被销毁等」也未覆盖 vault / 凭据读取失败这一类。真实错误仍进 `log.warn`（`:424-428`），故影响面限于用户可见文案与 `last_error`，不影响状态机与 AC 判定。
- 建议：把网络归类收窄到导航调用本身——单独包住 `await window.loadURL(start_url)`（`:392`）与 `poll_flower_usage_html` 内 productdetails 导航，其余异常保留中性分类；低成本替代：文案不主张具体原因（如「花云页面抓取失败（加载或会话读取异常）」）。

### 结论

- 前轮 finding 复核：Round 1/2 的 f001-f003 维持「已消除」；本轮改动未触及这三处路径（`flowercloud_dom.ts` 仅新增分类与文案，reveal/handover 删除与 stale 降级/窗口生命周期逻辑不变）。
- 本轮新发现：1 条（minor）。
- 未进表的提示：Round 2 提示 ①（force 与在途 `skip_if_fresh` join 丢强刷）、②（`write_flowercloud_html` 返回 false 时经兜底文案标 failed，含 CAS / 不安全 cookie / 无会话三种情形）、③（`failed` + `lastSuccess` 下「已过期」badge 依赖 ready 态或启动 hydrate）仍开放，均非 blocking；提示 ④ 已关闭。文件过大（`refresh-service.ts` 889、`session-manager.ts` 734、unit scheduler test 968、integration scheduler test 2460）与 `refresh()` CC ≥ 10 同 Round 2。
- 总体判断：两处改动按要求落地且无回归，仅 f004 一条 minor，无未解决 critical / important，判定 PASS。
- 系统性 follow-up：无。

### AC 复验方式（本轮仅列变动项）

- AC-003：`re_verified`——新增 `network` 使「网络失败」成为独立可解释状态（`flowercloud_dom.ts:175-176, 431`），由 `it.each` 表驱动 + `loadURL` reject 真实 catch 用例双重覆盖；其余分类（cloudflare / login / blocked / empty / other / cancelled）保持原样。
- AC-001 / AC-002 / AC-004 / AC-005 / AC-006：维持 Round 2 结论（本轮改动未触及对应路径；定向回归 `tests/unit/session/flowercloud_dom.test.ts`、`tests/unit/session/session-manager.test.ts`、`tests/unit/scheduler/refresh-service.test.ts` 共 105 项全绿）。
- AC-007：`manual_pending`（不变）。

coverage = 6 / 7（AC-007 待真机人工核验）

verdict: PASS

## Round 4 (2026-09-29 22:39 UTC+8)

reviewed_scope: 329b2320904a2711（`git diff 56c01c1b` 全量输出 sha256 前缀；14 文件 +685/-351）
定向复核（Round 3 之后仅此一处族改动）：`src/main/core/session/flowercloud_dom.ts`（catch 增加取消判定 + `network` 文案中性化）、`tests/unit/session/flowercloud_dom.test.ts`（it.each 期望 + 新取消用例）、`docs/specs/flowercloud_usage.md`（§3 失败原因分类同步）。

### 定向复核

- **f004 采纳方式**：`flowercloud_dom.ts:424-435` 的 catch 在 `log.warn` 之后先判 `if (is_cancelled()) return { written: false, kind: "cancelled" }`（`:432`），其余返回 `kind: "network"`（`:435`）；`flower_failure_reason("network")`（`:175-176`）改为「花云页面抓取失败（加载、网络或会话读取异常）」，不再主张 network 为唯一原因。即 Round 3 给出的「低成本替代」（文案不主张具体原因）落地，同时把取消从网络类里摘出，归因错误消除。
- **取消分类正确性**：抢占/关窗在 await 期间让 `session.get_cookies` / `window.loadURL` / `executeJavaScript` reject 时归 `cancelled`，与 `poll_flower_usage_html:331` 的取消返回、`run_flowercloud_snapshot:400-403` 的取消分支口径一致；三类取消路径最终都经 `session-manager` 返回 `ok:false` → `refresh-service` 置 `failed` + stale 副本，与 Round 1/2 已审的 cancelled 语义相同，未引入新分叉。
- **文案与测试一致性**：`it.each` 期望改 `["network","抓取失败"]`（`flowercloud_dom.test.ts:231`）与新文案匹配；新用例「reports a cancelled reason when the session is torn down mid-capture」在 mock 的 `get_cookies` 内翻转 `cancelled` 后 reject，模拟 await 期被拆毁，断言 `kind === "cancelled"` 且文案含「取消」；既有 `loadURL` reject 用例仍断言 `kind === "network"`（`:255`）且文案含「网络」（新文案括号内保留「网络」字样，断言仍成立）。`grep "页面加载失败|网络或超时"` 在 `src/`、`tests/`、`docs/specs/` 零残留。
- **spec 同步**：`docs/specs/flowercloud_usage.md:21` 改为「`network` → 抓取过程异常（页面加载、网络或会话读写失败，文案不主张具体原因，真实错误在日志）」，与实现一致。

### Findings

Round 4 零 finding。

### 结论

- 前轮 finding 复核：t535_code_f004 **已消除**（按建议的低成本替代落地，并追加取消前置判定，未引入新分叉）；f001-f003 维持已消除（本轮只动 catch 分类与文案，未触及 stale 降级、窗口/登记生命周期、`refresh_web_session` 契约面）。
- 本轮新发现：0 条。
- 未进表的提示：Round 2 提示 ①（force 与在途 `skip_if_fresh` join 丢强刷）、②（`write_flowercloud_html` 返回 false 时经兜底文案标 failed：CAS / 不安全 cookie / 无会话）、③（`failed` + `lastSuccess` 下「已过期」badge 依赖 ready 态或启动 hydrate）仍开放，均非 blocking；新增一条低优先观察：catch 在取消判定之前 `log.warn(...)`（`:425-429`），常规取消（抢占时 await reject）会因此留下一条 warn 级「refresh failed」日志，建议取消分支用 info 或把 warn 移到判定之后（纯日志卫生，不影响行为）。文件过大（`flowercloud_dom.ts` 437、`refresh-service.ts` 889、`session-manager.ts` 734、unit scheduler test 968、integration scheduler test 2460）与 `refresh()` CC ≥ 10 同 Round 3。
- 总体判断：f004 消除、无新缺陷，仅 1 条日志卫生观察，无未解决 critical / important，判定 PASS。
- 系统性 follow-up：无。

### AC 复验方式（本轮变动项）

- AC-003：`re_verified`——取消与抓取失败不再互相误报（catch 内 `is_cancelled()` 前置判定，`flowercloud_dom.ts:432/435`），`network` 文案不再主张具体原因；3 条定向用例（`loadURL` reject → `network`、teardown reject → `cancelled`、it.each 全表）通过。
- AC-001 / AC-002 / AC-004 / AC-005 / AC-006：维持前轮结论（本轮未触及对应路径；定向回归 `tests/unit/session/flowercloud_dom.test.ts`、`tests/unit/session/session-manager.test.ts`、`tests/unit/scheduler/refresh-service.test.ts` 共 106 项全绿）。
- AC-007：`manual_pending`（不变）。

coverage = 6 / 7（AC-007 待真机人工核验）

verdict: PASS

## Round 4 scope（final, tip 99499345）

- 复核对象：执行 commit `994993456c544df78a43a287216ad648e4e28e0e`（first parent = diff_anchor `56c01c1be881a2e834248aa11ad849d1b2a70ec3`），含 husky/lint-staged `md_format.py` 的 md 重排。
- 结论未变：逐一比对 tip 内容与 Round 1-4 审查快照——源码/测试文件行数与关键锚点完全一致（`flowercloud_dom.ts` 437、`refresh-service.ts` 889、`session-manager.ts` 734、`index.ts` 1676；`tests/unit/scheduler/refresh-service.test.ts` 968、`tests/integration/scheduler/refresh-service.test.ts` 2460、`tests/unit/session/session-manager.test.ts` 1779、`tests/unit/session/flowercloud_dom.test.ts` 305；`flowercloud_dom.ts:424-435` 的 catch 取消判定、`:175-177` 的 `network` 文案、`tests/unit/session/flowercloud_dom.test.ts:231` 的 it.each 均未变），docs 差异文本与 Round 3/4 审查时逐行相同，md 重排只影响排版，未改变任何结论（f001-f004 均已消除，零未解决 finding）。
- tip 复核验证（工作区干净，即该 commit 内容）：`pnpm typecheck`、`pnpm lint`、`pnpm format:check` 通过；`tests/unit/session/flowercloud_dom.test.ts`、`tests/unit/session/session-manager.test.ts`、`tests/unit/scheduler/refresh-service.test.ts`、`tests/integration/scheduler/refresh-service.test.ts` 共 149 passed。
- 门禁指纹：用 `.repo_template/scripts/repo_task/monitoring.py` 复算 `reviewed_scope_fingerprint(first_parent=56c01c1b, task_dir=docs/archive/tasks/t535_flowercloud_background_first_refresh, ref=99499345)` 得 `9c7a7ca7ca43a7af`，与本行取值一致；`review_code.md` / `task.md` / `handoff.json` 属 `REVIEW_PROCESS_FILES`，不参与指纹，故本条最终声明不影响该值。

reviewed_scope: 9c7a7ca7ca43a7af

verdict: PASS
