# Task review t174（reviewer_focus: 测试）

- task：`t174_stale_copy_keep_data_time`
- spec：`docs/tasks/t174_stale_copy_keep_data_time/spec.md`
- diff_anchor：`5c48c6c6858d1eb82d25b649da91c0dd5d03e497`
- target：`git diff 5c48c6c6858d1eb82d25b649da91c0dd5d03e497`
- round：1
- reviewed_at：2026-08-01 08:33 UTC+8

## Findings

### t174_test_f001 - AccountUsageRow 的 observedAt 优先取数改动无测试

- 严重度：minor
- 锚点：AC1（覆盖不全，非完全无测试）
- 位置：`src/renderer/components/UsageRows.tsx:179-184`（改动无断言）；对照已测路径 `tests/unit/renderer/components/provider_account_row.test.tsx:55`
- 问题：本 diff 对 `AccountUsageRow` 的 `.ai-time` 做了与 `ProviderAccountRow` 完全对称的改动（相对时间优先取 per-账号 `observedAt`，回退 `updatedAt`），但 `tests/unit/renderer/components/usage_rows.test.tsx` 中没有任何用例断言 `.ai-time` 的取数字段。若该路径字段名或回退逻辑写错，全部测试仍绿。AC1 整体有测试（ProviderAccountRow 路径 + 两层 refresh-service），不构成「AC 完全无测试」，故不阻断。
- 建议：在 `usage_rows.test.tsx` 补一个对称用例——`make_account({ stale: true, observedAt: <3 天前>, updatedAt: <刚刚> })`，断言 `.ai-time` 文案含「天前」且不含「刚刚/分钟前」。

## 结论

- 改测方向复核：diff 共 3 处改既有测试，归因均为「规格变了」（spec 契约区明确要求 stale 副本时间语义从「尝试时间」改为「保留原数据时间」），属合法改测，非迁就实现：
    - `tests/unit/scheduler/refresh-service.test.ts:296`：旧用例的时间断言 `toBeGreaterThan` 反转为 `toBe`，用例名/注释同步改写，`toMatchObject` 核心 stale 断言（account_id/used/last_error）原样保留。spec 测试策略要求该用例「整体删除」，diff 实际为同一 `it` 块就地改写（task.md 自述「整体删除」与 diff 事实不符，不采信自述）；但语义等价——锁旧递增语义的断言消失、新语义断言出现、归因写入实施笔记。形式偏差不构成行为覆盖缺口，不出 finding。
    - `tests/integration/scheduler/refresh-service.test.ts:1118` 与 `:1299`：两处附属时间断言 `toBeGreaterThan(prior)` → `toBe(prior)`，断言变强非弱化，所在用例的 stale 复制机制覆盖（行数/字段/last_error/ready state）完整保留。合法。
- 本轮新发现：1 条（minor）
- 危险模式扫描：无恒真断言、无 `.skip`/`.only`、无注释断言、无 eslint-disable/ts-ignore、无阈值放宽、无条件跳过断言、无删除测试块。renderer 测试的 `toContain("天前")`/`not.toContain("分钟前")` 是对相对时间文案这一用户可观察输出的断言，非弱化（UI 输出本身即模糊文案），且与 `not.toContain` 反向断言组合排除「取错字段仍 PASS」的假绿。mock 边界合规：unit 测试 mock observationStore（DB 边界）与 execute_connector（连接器进程边界）；observation-store 集成测试用真实 better-sqlite3；renderer 测试真实渲染断言 DOM。
- AC 覆盖核对：
    - AC1：unit `refresh-service.test.ts` 两个 t174 用例（全失败路径 + per-account 部分失败路径，断言副本 `observed_at` 保留原值）+ integration 两处断言 + renderer `provider_account_row.test.tsx:55`（stale 账号行取 `observedAt` 而非被拉高的 connector 级 `updatedAt`）。覆盖。
    - AC2：徽标行为不变——renderer 新用例断言「已过期」徽标仍在，既有「marks stale accounts」用例未动；恢复路径语义未被本 task 改变，既有用例（oauth AC2 re-collect 断言 `stale: false`、observation-store 多版本取最新）保留覆盖。
    - AC3：observation-store 两个新集成用例（同 ts stale 副本去重防累积 + `get_latest` stale 优先 tie-breaker 唯一确定）；趋势无重复点由既有 per-day 去重用例（`observation-store.test.ts:255`）覆盖，spike 已验证同 ts 落同一天 bucket 不产生重复点。
- 验证：`npx vitest run` 四个受影响测试文件全绿（observation-store 集成、refresh-service unit/integration、provider_account_row，共 74+ 用例通过）。
- 未进表的提示：unit `refresh-service.test.ts` 的 `create_observation_store` 全 mock（`insert` 仅 push 数组），stale 去重/tie-breaker 的真实 SQL 行为只能靠 observation-store 集成测试验证——当前已有，链路完整，无缺口。
- 总体判断：三条 AC 均有可信测试触达生产逻辑，改测归因合法，仅 1 条 minor（平行展示路径缺对称用例），不阻断。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-01 08:36 UTC+8)

### t174_test_f002 - 「dedupes stale copies」用例名实不符：行累积防护无直接断言

- 严重度：minor
- 锚点：AC3（覆盖不全，非完全无测试）
- 位置：`tests/integration/observation/observation-store.test.ts:86-101`（「dedupes stale copies sharing the same observed_at (t174)」）
- 问题：用例名指向 insert 前清同 (provider,account,metric,instance,ts) 旧 stale 副本的防累积机制（`src/main/core/observation/observation-store.ts:216` `delete_stale_dup_stmt`），但断言只验证查询层去重：`list_latest_by_provider` / `list_by_source_instance_id` 均靠新增的 `stale DESC` tie-breaker + ROW_NUMBER 独立保证返回 1 行，与 `delete_stale_dup` 无关。若删除 `delete_stale_dup_stmt`（重复失败将无限累积同 ts stale 行），本用例仍全绿。验证：手动推演 3 次 insert（原观测 + 副本1 + 副本2），删除 dedupe 后表内 3 行，两个查询仍各返回 1 行（rn=1 取 stale 副本），断言全部通过。实现侧机制当前正确，本条是防回归覆盖缺口。
- 建议：补直接行数断言——插入原观测 + 两份同 ts stale 副本后，用直连 better-sqlite3 `SELECT COUNT(*)`（沿用同文件 `:203` 并发用例模式）断言 `n = 2`（原观测 + 1 副本），锁死防累积机制；或改用断言名聚焦「查询层同 ts 去重唯一确定」。

## 结论（Round 2）

- 前轮 finding 复核：
    - `t174_test_f001`（AccountUsageRow observedAt 改动无测试）：以 diff 与代码复核，仍存在——`src/renderer/components/UsageRows.tsx:179-184` 改动与 `tests/unit/renderer/components/usage_rows.test.tsx` 无对应断言；`AccountUsageRow` 用于 `src/renderer/components/provider_card_content.tsx:80`（真实渲染面）。同意 round 1 的 minor 判定，不阻断。未在本轮重复编号。
- 改测方向复核：无新增改测。本轮独立复核 round 1 结论：unit `refresh-service.test.ts:296` 用例改名为「preserving the original data time」、时间断言 `toBeGreaterThan` → `toBe`，核心 stale 断言（account_id/used/last_error）保留——注意 spec 测试策略写「整体删除」，diff 实际为同 `it` 块就地改写，round 1 已注明不采信 task.md 自述；语义等价（锁旧递增语义断言消失、新语义断言出现、归因入实施笔记），归因「规格变」（AC1 明确要求副本保留原 `observed_at`）成立，非迁就实现，不出 finding。集成 `refresh-service.test.ts:1119/:1300` 两处 `toBe` 断言为附属时间断言，所在用例机制覆盖完整保留，合法。
- 本轮新发现：1 条（minor，f002）
- 独立验证：`pnpm test` 跑 4 个受影响测试文件全绿（observation-store 集成、refresh-service unit/integration、provider_account_row，共 74 tests PASS）。新增用例确实断言新语义（副本 `observed_at` 保留原值、stale 优先 tie-breaker、renderer 取 per-账号 observedAt）。
- 危险模式扫描（独立复核）：无恒真断言、无 `.skip`/`.only`、无注释断言、无 eslint-disable/ts-ignore、无阈值放宽、无条件跳过、无删测试块、无 mock 被测逻辑（unit 仅 mock DB 边界 observationStore 与连接器边界 execute_connector；store 集成用真实 better-sqlite3；renderer 真实渲染断言 DOM）。renderer 用例 `toContain("天前")` + `not.toContain("刚刚"/"分钟前")` 是对用户可观察文案的组合断言，且 `toContain("天前")` 单独即能排除取错字段（updatedAt 显示不会含「天前」），非弱化。
- AC 覆盖核对（独立复核，与 round 1 一致）：
    - AC1：unit 全失败路径 + per-account 部分失败路径两用例断言副本 `observed_at` 保留原值；integration 两处 `toBe`；renderer stale 账号行取 `observedAt`。覆盖。
    - AC2：renderer 新用例断言「已过期」徽标仍在（`rel_time` 含「已过期」）；恢复路径语义未变，既有 oauth AC2 re-collect 用例（`stale: false`）保留。覆盖。
    - AC3：store 两个新集成用例（同 ts 查询去重唯一 + `get_latest` stale 优先）；趋势无重复点由既有 per-day 去重用例（`observation-store.test.ts:255`）覆盖，`query_trend_series` 本 task 未改动。覆盖（同 ts 趋势用例属可选扩展，见未进表提示）。
- 未进表的提示：
    - 可选扩展（非缺口）：`query_trend_series` 同 ts stale 副本输入用例——per-day 去重机制既有测试已覆盖，spike 已验证同 ts 落同天不产生重复点。
    - 范围外观察（建议 code reviewer 关注）：`stale DESC` tie-breaker 在「恢复后新鲜观测与原 stale 副本同 `observed_at`」时优先取 stale 副本——`hydrate-runtime-store.ts:28`（manualRefreshOnly 重启路径）经 `list_by_source_instance_id` 会 hyd 出「已过期」行。需 exact ts 相等才触发，session 内 UI 由 runtimeStore 实时状态驱动不受影响，spec 已批准 stale 优先取舍；不构成本 task 阻断。
- 总体判断：round 1 结论复核成立，三条 AC 均有可信测试触达生产逻辑，改测归因合法；仅 1 条新 minor（防累积机制无直接断言），不阻断。
- 系统性 follow-up：无

verdict: PASS
