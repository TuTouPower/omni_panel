# Task review t384（reviewer_focus: 测试）

- task：`t384_token_stats_model_alias_expand`
- spec：`docs/tasks/t384_token_stats_model_alias_expand/spec.md`
- diff_anchor：`7db9320dfabc1edd7e93c167daa60728989d2518`
- target：`git diff 7db9320dfabc1edd7e93c167daa60728989d2518`
- round：1
- reviewed_at：2026-08-15 06:24 UTC+8

## Findings

### t384_test_f001 - AC-004/AC-005 仅有 records fallback 路径，union 路径缺 agent+model 组合覆盖

- 严重度：minor
- 锚点：AC-004；测试策略「每条用例均跑 records fallback 与 backfill_hour_rollup 后的 union 两路径（对齐 :2200-2227）」
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2515-2548`（AC-004）、`:2548-2568`（AC-005）；对照 `:2569-2599`（AC-002 union）
- 问题：union 路径只有 AC-002 一个变体。AC-002 union fixture（deepseek-v4-flash + __secondary__ 碰撞）与 AC-001 同形，故 AC-001 的 collision+expansion union 变体被隐含覆盖；AC-005 单值 union 由既有 t204（:2225-2252）与 t202 equality 循环（:2206-2223）覆盖。真正缺口：union 路径的 agent+model 组合（`AND agent = @agent` 与新 `AND model IN (...)`）无断言——若 union builder 组合条件写成 OR 或漏掉其一，现有测试全绿。
- 建议：补一条 union 路径 AC-004 变体：backfill 后 query `agent='claude-code' + model='deepseek-v4-flash'`，断言 calls=1。

### t384_test_f002 - AC-002 union 用例未断言 rollup ready，backfill 静默失效时退化为 records fallback 仍 PASS

- 严重度：minor
- 锚点：测试策略（union 路径用例应对齐 :2200-2227 的 backfill 后语义）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2569-2599`
- 问题：用例调 `backfill_hour_rollup()` 后 query，但未断言 `is_hour_rollup_ready()`。若 backfill 静默失效（mutation 或未来重构），query 落到 records fallback，用例仍 PASS，无法证明触达 `dashboard_window_union_builder`（src/main/core/token-stats/token-stats-store.ts:537-597）新增的 model_where 代码。对齐测试 t204（:2229-2230）显式断言 ready。当前 backfill 正确性由 AC6（:2412-2426）等用例保证，故用例实际已触达 union_builder，仅缺一行锁定。
- 建议：backfill 后加 `expect(store.is_hour_rollup_ready()).toBe(true)`。

### t384_test_f003 - `dashboard_model_filter_keys` 多 key 展开与 resolver 后写覆盖无测试

- 严重度：minor
- 锚点：AC-002；测试策略「多 key alias（{alias:"X",keys:["m1","m6"]} 两路并入）」「resolver 去重语义（按代码实际「后写覆盖」）」；风险区「展开式与 resolver 去重语义分叉（须复用同一 resolver 而非新写逆映射）」
- 位置：`src/main/core/token-stats/token-stats-store.ts:362-376`（被测函数）；新用例 alias `keys` 均为单元素
- 问题：全部 t384 后端用例 alias `keys` 恒为单元素数组，`for (const key of item.keys)` 的多元素分支与「同 key 属两个 alias 时后写覆盖、先写 alias 不含该 key」语义无测试锁定。mutation「展开只取 `item.keys[0]`」或按逆映射「先写获胜」实现时，现有 5 条后端用例全绿。spec 风险区明确点名该分叉为关键实现风险，测试策略亦列明，实现未落地。
- 建议：加两条用例——(a) `{alias:"X",keys:["m1","m6"]}` 选 X 同时命中 m1 与 m6；(b) `[{alias:"A",keys:["k"]},{alias:"B",keys:["k"]}]` 选 A 不含 k、选 B 含 k（后写覆盖）。

### t384_test_f004 - AC-002「COUNT(DISTINCT session) 跨 model 同 session 不重复计数」未断言，spec 声称的锁定未落地

- 严重度：minor
- 锚点：AC-002；风险区「IN 展开误伤聚合去重」与「聚合去重由 AC-002 用例锁定」
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2489-2514`（AC-001，fixture 恰为跨 model 同 session）、`:2569-2599`（AC-002 union，u1/u2 默认同 session_id "s1"）
- 问题：spec 声称「聚合去重由 AC-002 用例锁定」，但用例只断言 `current.calls`，未断言 `current.sessions`。AC-001/AC-002 union 的 fixture 恰是跨 model 同 session（两记录均 session_id "s1"），若 `current.sessions` 出现按 model 行各计一次（=2），测试仍绿。当前实现用 JS Set 去重（`dashboard_summary_from_rollup` :419-445）结构性保证不重复，实际风险低，但 spec 声明的锁定未落地。
- 建议：AC-001 或 AC-002 union 补 `expect(dto.current.sessions).toBe(1)`。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无。
- 改测方向复核：无迁就实现的改测。两个改名用例均因 spec 契约变更而改——
  - backend `t384 AC-002`（:2452）：旧用例「filters by original model name」（query 原始名 → calls=1）在新实现下仍 PASS（原始名经展开命中 a1），改动是把主查询改为展示名「Sonnet」以覆盖新 AC-002 归并语义，原始名断言保留为 `via_raw`（:2482-2486），属新增覆盖而非删断言迁就。新断言（选展示名 → calls=1）在旧实现（`model = @model` 精确匹配 "Sonnet" → 0 行）下必然失败。
  - frontend `t384 AC-003`（:571）：旧用例断言 value=原始 key，spec 测试策略明令「为碰撞 bug 预期，禁止只改 expect」、整段替换；新断言（value=label=展示名、无原始 key option、查询参数为展示名）在旧实现（`aliasToOriginal` 反翻译）下必然失败（option value 变 claude-3-5-sonnet-20241022 → toBeDefined 挂）。
- 本轮新发现：4 条（均 minor）。
- 未进表的提示：
  - `materialize_session_meta` from_records=false 位置参数 IN 展开（src/main/core/token-stats/token-stats-store.ts:674-682，新代码）只被 union 用例运行、无断言；session 集由 window_rows 结构性过滤，语义影响限 title/timestamp 富化，风险低，未单独进表。
  - 前端碰撞 fixture（deepseek-v4-flash）的 value 正确性由 AC-006（select.value）断言，查询参数为展示名仅由 AC-003（Sonnet）断言，两者分跨用例，可选项。
  - union 路径 IN 排除（第三 out-of-group model 被排除）未单独断言，但 `dashboard_model_where` 与 records 路径共用、AC-002（:2472-2480，opus 被排除）已锁定 IN 排除，t204 锁定 union 单值排除，风险低。
- 总体判断：全部 7 条 AC（后端 5 + 前端 2）均有真实、灵敏、实跑通过的用例（131 条全绿）；mutation 敏感性经推演确认——单值展开使 AC-001/AC-002/AC-002 union 三条挂（与 implementer 声称 3 failed 一致），恢复 `aliasToOriginal` 使 AC-003 挂；无危险模式、无迁就实现改测、无未解决 critical/important。4 条 minor 为覆盖扩展与断言加强。PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: e1e8db1b48b0efa4

## Round 2 (2026-08-15 06:29 UTC+8)

- task：`t384_token_stats_model_alias_expand`
- diff_anchor：`7db9320dfabc1edd7e93c167daa60728989d2518`
- target：`git diff 7db9320dfabc1edd7e93c167daa60728989d2518`
- round：2
- reviewed_at：2026-08-15 06:29 UTC+8
- 实跑：`npx vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts tests/unit/renderer/views/token_stats_view.test.tsx` → backend 99 passed（含 7 条 t384）、renderer 34 passed，133 全绿。

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核（以 diff 与实跑为准）：
  - **t384_test_f003（minor，多 key 展开 + 后写覆盖无测试）——已消除。** 新增 2 用例入 diff，均真实、灵敏、与 spec 风险区精确对齐：
    1. `tests/unit/main/core/token-stats/token-stats-store.test.ts:2601-2629`「多 key alias 展开整组（spec 风险区）」——fixture m1-raw/m6-raw/unrelated，`{alias:"GroupX",keys:["m1-raw","m6-raw"]}` 选 GroupX → calls=2。推演：`dashboard_model_filter_keys` 展开到 `{GroupX,m1-raw,m6-raw}`，unrelated 排除；mutation「只取 item.keys[0]」→ 仅 m1-raw 命中 calls=1，挂。敏感、非恒真。
    2. `:2631-2666`「resolver 后写覆盖——同 key 多个 alias 组只按最后声明的别名展开」——shared-key 先后声明属 AliasA/AliasB，选 AliasA → calls=0、选 AliasB → calls=1。推演：`dashboard_alias_resolver` Map.set 后写 → resolver(shared-key)=AliasB，AliasA 组不含 shared-key；mutation「先写获胜」→ resolver(shared-key)=AliasA，AliasA 命中 1，`toBe(0)` 挂。精确锁定「后写覆盖」语义（spec 非范围「按 resolver 去重语义（后写覆盖）实现时必须复用同一 resolver，不重写逆映射」）。
  - f001/f002/f004：维持 minor 覆盖扩展类，本轮不重复进表。
- 改测方向复核：无迁就实现的改测。新增 2 用例为纯新增，未改任何既有断言。
- 本轮新发现：0 条。
- 未进表的提示：无新增。多 key 用例未跑 union 路径（rollup ready 后多 key IN），但 `dashboard_model_where` IN 子句与单 key 展开共用、AC-002 union 已锁定 IN 在 union_builder 生效，风险低，不阻断。
- 总体判断：f003 已消除，无未解决 critical/important，无新 blocker。PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 856ae40a8f6d555c
