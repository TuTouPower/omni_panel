# Task review t516（reviewer_focus: 代码）

- task：`t516_scheduler_and_observation_store`
- spec：`docs/tasks/t516_scheduler_and_observation_store/spec.md`
- diff_anchor：`9717ef55234af07ff8abf774074c198e42010be3`
- target：`git -C '/Users/karson/kar/code/omni_panel_t516' diff 9717ef55234af07ff8abf774074c198e42010be3`
- round：1
- reviewed_at：2026-09-25 17:06 UTC+8

reviewed_scope: 3e90af22452e7379

## Findings

### t516_code_f001 - 调度器连续失败指数退避时序错位且滞后一轮，首轮失败未退避

- 严重度：important
- 锚点：AC-002（调度器遵循不小于 30s 的刷新周期下限，遇到连续采集失败时下次间隔按指数递增且附加随机抖动）
- 位置：`src/main/core/scheduler/connector-scheduler.ts:60-76`
- 问题：`schedule_next()` 在 `deps.refresh(instanceId)` 刚刚被触发（异步任务仍处于 pending 态、`.catch` 微任务尚未执行）时便同步被调用。此时 `failure_counts.get(instanceId)` 仍为旧值（首轮失败时为 0），计算出的 `next_interval` 仍为基准 30s，随后微任务才累加 `failure_counts`。导致首轮失败完全没有退避，且后续连续失败的退避时间始终 off-by-one 滞后一整轮；`tests/integration/scheduler/connector-scheduler.test.ts:238-248` 中的测试注释声称「下一次由于 failures=1，按 base * 2^1 = 60s 调度」，但紧接着推进 `30_000`ms 就断言触发了第 2 次，明显迁就了这一时序缺陷。
- 建议：将下一次调度定时器的安排移至 `deps.refresh(instanceId)` settled（`.then` 或 `.catch` 完成）之后，确保下一次间隔严格依据最新的失败计数计算。

### t516_code_f002 - 生产刷新流程调用 `cancellable_sleep` 均未传 `signal`，退出时休眠无法唤醒

- 严重度：important
- 锚点：AC-007（应用退出时调度休眠立即解除，关闭过程平稳无拖延）
- 位置：`src/main/core/scheduler/refresh-service.ts:402, 533, 550, 564, 598`
- 问题：虽然实现了 `cancellable_sleep(ms: number, signal?: AbortSignal)`，但在 `refresh-service.ts` 的 5 处生产重试等待调用点中，均未传递任何 `signal` 参数，且 `createRefreshService` / `refresh` 接口未接收 AbortSignal 上下文。应用退出时这些定时器无法感知 abort 信号，仍然阻塞等待 1~2 秒，AC-007 在生产路径未生效；单测仅单独导入 helper 传入测试 controller 验证，属生产假覆盖。
- 建议：在 `createRefreshService` deps 或 `refresh` 参数中接入生命周期 `AbortSignal`，并透传给各处 `cancellable_sleep` 调用。

### t516_code_f003 - 数据清理未在数据库层实现 `DELETE ... LIMIT` 分批机制

- 严重度：important
- 锚点：AC-006（数据清理在空间极度紧张时每次分批删除固定行数，避免长时间独占数据库锁导致主线程卡顿）
- 位置：`src/main/core/observation/observation-store.ts:322-331`、`src/main/core/observation/observation-retention.ts:44-57`
- 问题：spec 范围及 AC-006 要求「数据保留清理引入 `DELETE ... LIMIT` 分批机制并设置下限保护」「数据清理在空间极度紧张时每次分批删除固定行数，避免长时间独占数据库锁导致主线程卡顿」。实现中 `observation-store.ts` 的 `prune_stmt` 仍是单条无 LIMIT 的大 DELETE；仅在 `observation-retention.ts` 外层加入最大 10 轮时间步长自适应推进，单次 `deps.prune(cutoff)` 依然会一口气删除超预算时间段内的所有行，在数据密集时依然会长久占用 SQLite 写锁导致主线程卡顿；且对极小 `cache_max_mb` 未设置合理的下限保护（仍为 `Math.max(1, ...)`）。
- 建议：在 `observation-store.ts` 中实现带每批删除上限（如 `LIMIT chunk_size`）的分批清理 SQL，配合循环分批执行，确保每次删除固定行数并释放锁。

### t516_code_f004 - 全轮失败未过滤 `stale=0` 观测，导致从旧 stale 副本再次衍生；部分失败过滤造成后续失败无法更新

- 严重度：important
- 锚点：AC-004（采集失败后由单事务批量写入降级副本，且仅基于最新成功记录进行复制，无多轮 stale 衍生雪崩）
- 位置：`src/main/core/scheduler/refresh-service.ts:423, 608-622`
- 问题：在 `refresh-service.ts` 全轮失败处理（line 608-622）中，直接将 `list_by_source_instance_id` 返回的记录 map 为 `stale_copies`，未检查 `!obs.stale`。由于首轮失败后 `list_by_source_instance_id` 返回的正是首轮的 stale 副本，次轮失败会以 stale 副本为基准再次衍生；而在部分账号失败路径（line 423）中虽写了 `if (obs.stale) continue;`，但因 `list_by_source_instance_id` 仅返回 `rn = 1`（即首轮失败生成的 stale 记录），导致次轮及后续连续失败时因 `obs.stale === true` 被直接跳过，无法为降级副本更新最新错误信息。两处逻辑分叉且均未正确实现「仅基于最新成功记录 (stale=0) 进行复制」。
- 建议：在 `ObservationStore` 中提供或在查询时指定仅获取最新成功记录（`WHERE stale = 0`），统一作为两处降级副本复制的基准数据源。

### t516_code_f005 - 采纳项 A126 缺失实现（token-stats 显式列与 LIMIT/offset 分页未落地）

- 严重度：important
- 锚点：spec 契约区范围「查询改为显式列投影；token-stats 查询补充 LIMIT/offset 分页。（A112, A126）」
- 位置：`docs/tasks/t516_scheduler_and_observation_store/spec.md:19`、`src/main/core/token-stats/token-stats-store.ts`
- 问题：spec 契约区范围明确列入「查询改为显式列投影；token-stats 查询补充 LIMIT/offset 分页」，且 task note 中包含 A126。然而在交付的 git diff 中，完全未对 `src/main/core/token-stats/token-stats-store.ts` 进行任何修改，属于范围缺口（半实现）。
- 建议：在 `token-stats-store.ts` 中实现显式列投影与 LIMIT/offset 分页查询，或经立项评估从本 task 剥离并更新 spec。

### t516_code_f006 - `with_concurrency` 逻辑在生产代码与 `__test__` 中重复维护

- 严重度：minor
- 锚点：代码质量（DRY）
- 位置：`src/main/core/scheduler/refresh-service.ts:647-664` 与 `:688-713`
- 问题：为了进行单元测试，`refresh-service.ts` 在内部函数 `createRefreshService` 中定义了一套 `with_concurrency`，又在导出的 `__test__.with_concurrency` 中 verbatim 复制了整套一模一样的实现。未来若修改并发控制逻辑，极易导致生产逻辑与测试用导出逻辑分叉。
- 建议：将 `with_concurrency` 提取为模块级公共工具函数，`createRefreshService` 内部直接调用，并对外按需导出供单测使用。

## 结论

- 本轮新发现：6 条（5 important，1 minor）
- 未进表的提示：
    - 文件过大：`src/main/core/observation/observation-store.ts`（440 行）、`src/main/core/scheduler/refresh-service.ts`（714 行）、`tests/unit/scheduler/refresh-service.test.ts`（661 行）、`tests/integration/scheduler/refresh-service.test.ts`（2305 行）超过行数参考阈值；
    - 圈复杂度：被测新函数 CC 均 < 10；
    - 范围外观察：`force` 刷新语义（采纳项 A137）未见显式固化或注释说明。
- 总体判断：调度器指数退避时序错位、退出休眠唤醒未打通、数据清理缺 LIMIT 分批、失败路径 stale 基准复制有缺陷，且采纳项 A126 缺失实现，判定 FAIL。
- 系统性 follow-up：若 A126（token-stats 显式列与 LIMIT/offset 分页）不在本 task 交付，建议建 follow-up task `t517_token_stats_pagination`。

### AC 复验方式

- AC-001：`re_verified`，查证 `refresh-service.ts` 源码异常隔离并运行 `refresh-service.test.ts` 单测通过。
- AC-002：`re_verified`，查证 `connector-scheduler.ts` 源码发现时序错位缺陷（f001），下限 30s 经单测验证通过但退避逻辑与断言存在 off-by-one。
- AC-003：`re_verified`，查证 `observation-store.ts` DDL 与 `observation-store.test.ts` EXPLAIN QUERY PLAN 测试通过。
- AC-004：`re_verified`，查证 `refresh-service.ts` 源码发现全轮失败路径未过滤 stale=0 且部分失败分支次轮跳过（f004），单事务批量写入经集成测试验证。
- AC-005：`re_verified`，查证 `observation-store.ts` 钳制代码并运行 `observation-store.test.ts` 参数边界测试通过。
- AC-006：`re_verified`，查证 `observation-store.ts` 与 `observation-retention.ts` 源码，未实现 `DELETE ... LIMIT` 分批机制（f003）。
- AC-007：`re_verified`，查证 `refresh-service.ts` 生产调用点均未传 `signal` 参数且未接入关机上下文（f002）。

coverage = 7 / 7

verdict: FAIL

## Round 2 (2026-09-25 17:35 UTC+8)

reviewed_scope: 3ce10c5db8b63723

### Findings

本轮无新增 finding。

### 结论

- 前轮 finding 复核：
    - `t516_code_f001`（调度器连续失败退避时序滞后且单测断言迁就）：**仍存在**。`src/main/core/scheduler/connector-scheduler.ts:79` 中 `schedule_next()` 依然在 `deps.refresh(instanceId)` 异步调用的同步 turn 立即被调用。此时 `failure_counts` 尚未被异步微任务更新，导致计算下一次调度间隔时仍使用旧失败计数值（首轮失败使用 0 即 30s，次轮失败使用 1 即 60s），退避始终滞后一整轮；`tests/integration/scheduler/connector-scheduler.test.ts:238-251` 注释写着按 60s / 120s 调度，但代码推进 30s / 60s 即可断言触发，断言迎合了时序缺陷。
    - `t516_code_f002`（refresh-service 未传 signal 导致退出无法唤醒）：**已消除**。`RefreshServiceDeps` 引入 `abort_signal?: AbortSignal`，`refresh-service.ts` 的 5 处生产重试等待均改为 `await cancellable_sleep(..., deps.abort_signal)`，且集成测试验证了中断行为。
    - `t516_code_f003`（数据清理未实现 DELETE ... LIMIT 分批）：**已消除**。`observation-store.ts` 的 `prune` 实现循环 `DELETE ... LIMIT` 分批，配合 `observation-retention.ts` 的最大 10 轮迭代与自适应时间步长。
    - `t516_code_f004`（全轮与部分失败降级副本未基于 stale=0 且后续失败无法更新）：**修不彻底**。全轮失败路径已增加并调用 `list_latest_success_by_instance`（`stale=0`）；但部分账号失败路径（`refresh-service.ts:421`）仍调用 `list_by_source_instance_id`，而该查询在首轮产生降级副本后返回 `rn=1`（`stale=1`），导致 `if (obs.stale) continue;` 直接跳过后续失败更新，多账号场景下连续失败时最新错误信息依然无法更新。两处逻辑分叉。
    - `t516_code_f005`（token-stats 显式列与 LIMIT/offset 分页未落地）：**已消除**。`token-stats-store.ts` 的 `query_buckets` 与 `query_sessions` 均已实现显式列投影与 `LIMIT @limit OFFSET @offset` 分页，默认 limit 做了 1~5000 范围钳制。
    - `t516_code_f006`（with_concurrency 逻辑重复维护）：**已消除**。`with_concurrency` 已作为顶层公共函数单源导出，移除了闭包内部和 `__test__` 中的重复实现。
- 本轮新发现：0 条
- 未进表的提示：
    - 文件过大：`src/main/core/observation/observation-store.ts`（469 行）、`src/main/core/scheduler/refresh-service.ts`（693 行）、`tests/integration/scheduler/refresh-service.test.ts`（2347 行）超过参考阈值；
    - 圈复杂度：全部函数 CC < 10；
    - 范围外观察：无。
- 总体判断：调度器连续失败退避时序仍存在异步时序错位与单测假断言（f001 仍存在），部分账号失败降级副本派生仍调用旧查询导致连续失败无法刷新错误信息（f004 修不彻底），判定 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查证 `refresh-service.ts` 中 `with_concurrency` 源码异常隔离并运行 `tests/integration/scheduler/refresh-service.test.ts:2173` 测试通过。
- AC-002：`re_verified`，查证 `connector-scheduler.ts:79` 发现退避调度仍在异步微任务前同步触发，首轮失败未退避，时序滞后一轮；单测存在假断言。
- AC-003：`re_verified`，查证 `observation-store.ts` DDL 与 `observation-store.test.ts:422` EXPLAIN QUERY PLAN 测试通过。
- AC-004：`re_verified`，查证 `refresh-service.ts:421` 发现部分账号失败路径仍调用 `list_by_source_instance_id` 导致连续失败时跳过更新降级副本。
- AC-005：`re_verified`，查证 `observation-store.ts:409-413` 钳制代码并运行 `observation-store.test.ts:452` 超限测试通过。
- AC-006：`re_verified`，查证 `observation-store.ts:335, 441` 的 `DELETE ... LIMIT` 分批实现及集成测试 `observation-store.test.ts:494` 通过。
- AC-007：`re_verified`，查证 `refresh-service.ts:404, 535, 555, 569, 603` 均传入 `deps.abort_signal`，并运行集成测试 `refresh-service.test.ts:2212` 通过。

coverage = 7 / 7

verdict: FAIL

## Round 3 (2026-09-25 17:48 UTC+8)

reviewed_scope: d157acdcc8998d17

### Findings

本轮无新增 finding。

### 结论

- 前轮 finding 复核：
    - `t516_code_f001`（调度器连续失败退避时序滞后且单测断言迁就）：**已消除**。`src/main/core/scheduler/connector-scheduler.ts:78-103` 的 `trigger_cycle` 在触发异步刷新时先排入默认周期防卡死，并在 `.catch` 失败回调中按累计失败次数精确计算退避延时（`count = failure_counts + 1`），重置并替换为指数退避定时器。`tests/integration/scheduler/connector-scheduler.test.ts:225-271` 单测已精确断言失败 1 次 60s、失败 2 次 120s 以及 0~20% 抖动推进时序，分秒不差，断言真实可靠。
    - `t516_code_f002`（refresh-service 未传 signal 导致退出无法唤醒）：**已消除**（Round 2 已确认）。
    - `t516_code_f003`（数据清理未实现 DELETE ... LIMIT 分批）：**已消除**（Round 2 已确认）。
    - `t516_code_f004`（部分账号失败与全轮失败降级副本未基于 stale=0 且后续失败无法更新）：**已消除**。`refresh-service.ts:421-435`（部分账号失败路径）与 `:618-630`（全轮失败路径）均统一调用 `ObservationStore.list_latest_success_by_instance`（`stale=0`），彻底消除了从旧 stale 副本再次衍生；且连续失败时每轮均能以真实成功观测为基底生成带有最新 `failed.error` / `last_error` 的 stale 副本，集成测试 `refresh-service.test.ts:2258` 验证了连续失败下错误刷新与防雪崩行为。
    - `t516_code_f005`（token-stats 显式列与 LIMIT/offset 分页未落地）：**已消除**（Round 2 已确认）。
    - `t516_code_f006`（with_concurrency 逻辑重复维护）：**已消除**（Round 2 已确认）。
- 本轮新发现：0 条
- 未进表的提示：
    - 文件过大：`src/main/core/observation/observation-store.ts`（469 行）、`src/main/core/scheduler/refresh-service.ts`（695 行）、`tests/unit/scheduler/refresh-service.test.ts`（661 行）、`tests/integration/scheduler/refresh-service.test.ts`（2350 行）超过行数参考阈值，均为已有核心业务/测试文件；
    - 圈复杂度：全部函数 CC < 10；
    - 范围外观察：无。
- 总体判断：前两轮所有 critical / important finding 已彻底修复消除，调度器退避时序与抖动断言精确，stale 副本衍生基准修复彻底，各功能与测试正常通过，无阻断缺陷，判定 PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查证 `refresh-service.ts:670-694` 的 `with_concurrency` 异常隔离，运行集成测试 `refresh-service.test.ts:2173` 通过。
- AC-002：`re_verified`，查证 `connector-scheduler.ts:78-103` 失败退避重置时序与 `calculate_next_interval` 抖动计算，运行单测 `connector-scheduler.test.ts:225-271` 通过。
- AC-003：`re_verified`，查证 `observation-store.ts:74-76, 107-110` DDL 与集成测试 `observation-store.test.ts:422` 索引命中通过。
- AC-004：`re_verified`，查证 `observation-store.ts:322-332`、`refresh-service.ts:421, 618` 统一使用 `list_latest_success_by_instance`，运行集成测试 `refresh-service.test.ts:2258` 验证无二次衍生且错误刷新通过。
- AC-005：`re_verified`，查证 `observation-store.ts:415-420` 参数钳制逻辑，运行单元测试 `observation-store.test.ts:452` 通过。
- AC-006：`re_verified`，查证 `observation-store.ts:335-347, 441-456` 的 `DELETE ... LIMIT` 分批实现，运行集成测试 `observation-store.test.ts:494` 与 `observation-retention.test.ts` 通过。
- AC-007：`re_verified`，查证 `refresh-service.ts:397, 535, 555, 569, 603` 传入 `deps.abort_signal`，运行集成测试 `refresh-service.test.ts:2212` 通过。

coverage = 7 / 7

verdict: PASS
