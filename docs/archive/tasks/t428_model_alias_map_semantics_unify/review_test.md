# Task review t428（reviewer_focus: 测试）

- task：`t428_model_alias_map_semantics_unify`
- spec：`docs/tasks/t428_model_alias_map_semantics_unify/spec.md`
- diff_anchor：`b95e7a9d5a248914a1ba6ebae22528e1a5e4e0f8`
- target：`git diff b95e7a9d5a248914a1ba6ebae22528e1a5e4e0f8`
- round：1
- reviewed_at：2026-08-17 00:12 UTC+8

## Findings

### t428_test_f001 - AC-004 用例的 union records 边缘带无数据，"双源"验证实际只落在 rollup 侧

- 严重度：minor
- 锚点：AC-004（"rollup union 与 records fallback 两条路径均只返回匹配行" / 范围区"触达 dashboard_window_union_builder 双源路径"）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2330`（t428 AC-004 用例，数据 2334-2363，断言 2379-2387）
- 问题：用例窗口为 `[S=07-10T07:30, E=07-11T12:15)`（`token-stats-store.test.ts:1990-1991`），4 条记录的时间戳全部落在完整小时带（08:30/09:30/10:30/11:30），`dashboard_window_union_builder` 的 records 边缘带（`[start, full_start)` ∪ `[full_end, end)`）在该窗口内恒为空集（0 行）。因此用例名"双源均只返回匹配行"实际只验证了 rollup 源一侧；若 union 的 records 段漏接 agent/model where，本用例断言无法失效。两段的 where 由同一 `agent_where`/`model_where` 变量拼接（`token-stats-store.ts:542-550`），组合过滤漏接风险真实存在。缺口范围有限：t204 用例（`token-stats-store.test.ts:2300-2328`）用 model-only 过滤覆盖了 union records 边缘带（fixture 含 07:45/07:50/12:10 边缘记录，`token-stats-store.test.ts:1993-2095`），t384 AC-004 用例（`token-stats-store.test.ts:2698-2729`）用 agent+model 组合覆盖了非 ready 的 records fallback 路径，故"组合过滤 × union records 源有数据"是唯一未触达切片。
- 建议：在 AC-004 用例数据中加一条落在边缘小时（如 07:45）且 agent/model 不匹配的记录（如 agent=opencode 或 model=grok-4.5），使 union records 段非空，现有断言（calls=2、sessions 精确列表）即可同时覆盖两段过滤。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮为 Round 1，不适用
- 改测方向复核：无——diff 对两个测试文件均为纯新增（store +108 / view +32），未修改任何既有测试断言，无"迁就实现"的改测
- 本轮新发现：1 条（t428_test_f001，minor）
- 未进表的提示：
  - union 双源的 model 过滤已由既有 t204 用例覆盖（fixture 含边缘带记录），本 task 未破坏该覆盖
  - `query_dashboard_sessions`（`token-stats-store.ts:1609-1637`）存在同款 union/fallback 分支，不在本 task AC 范围内，未测属预期
  - 新 store 用例复用 `with_temp_store` 真实 sqlite 文件、显式断言 `is_hour_rollup_ready()=true`（`token-stats-store.test.ts:2365/2417`），符合测试策略"避免空跑"要求
- 总体判断：新增用例测真实生产行为（真实 DB + 真实组件），断言为用户可观察的 DTO/DOM 输出；危险模式扫描未命中；唯一 minor 为覆盖扩展建议，不阻断
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——静态核查新 view 用例（`token_stats_view.test.tsx:487-517`）断言 prefs 残留 `shared-key` 归一为后声明 `AliasB` 且下拉值为 `AliasB`；后端 resolver 后写覆盖语义在 `token-stats-store.ts:349-357`（`lookup.set` 无 has 守卫）并由既有 t384 用例锁定（`token-stats-store.test.ts:2799-2829`：via_a=0 / via_b=1）。前后端策略一致（方向与 spec 一致）。
- AC-002：`re_verified`——单 alias 行为由既有用例覆盖（view：t384 AC-006 用例 `token_stats_view.test.tsx:459-485`；store：t384 AC-002/AC-005 系列），`map.set` 改动对唯一 key 行为中性（`TokenStatsView.tsx:535-543`），定向跑全绿即回归证据。
- AC-003：`re_verified`——新 view 用例预期 `AliasB`；静态推导旧实现（`if (!map.has(m))` 先写获胜）会归 `AliasA`，断言可区分修复前后；store 侧 resolver 语义此前已由 t384 用例锁定。
- AC-004：`re_verified`——新 store 用例（`token-stats-store.test.ts:2330-2390`）显式断言 rollup ready 后 agent+model 组合过滤：calls=2、sessions 精确列表 `[s-claude, s-claude-3]`、metric_buckets/rollup 全为 sonnet-4；records fallback 组合过滤由既有 t384 AC-004 用例覆盖；定向跑绿。边缘带切片缺口见 f001（minor）。
- AC-005：`re_verified`——新 store 用例（`token-stats-store.test.ts:2392-2436`）断言 sessions 列表 `Set.size === length`（无重复）且精确等于 `[s-multi, s-other]`、calls=3；定向跑绿。
- AC-006：`re_verified`——定向命令 `pnpm exec vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts tests/unit/renderer/views/token_stats_view.test.tsx`：2 文件 138/138 全绿（store 103 + view 35）。

coverage = 6 / 6

reviewed_scope: bebf8f09ca4f2c8c

verdict: PASS

## Round 2 (2026-08-17 09:15 UTC+8)

### t428_test_f002 - AC-004 用例负向行仅对角覆盖：rollup×model 与 records×agent 漏接仍无法使断言失效

- 严重度：minor
- 锚点：AC-004（"rollup union 与 records fallback 两条路径均只返回匹配行"）；f001 修复残留
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2336-2365`（AC-004 用例数据）
- 问题：f001 修复后负向行分布为——rollup 段 [08:00,12:00) 仅 am1（匹配）+ am2（agent 负向），无 model 负向行；records 段 [07:30,08:00) 仅 am3（model 负向）+ am4（匹配），无 agent 负向行（两行 agent 均为 claude-code）。两种失败模式仍无法使断言失效：(a) union rollup SQL（`token-stats-store.ts:567`）漏接 `${model_where}`——rollup 段唯一非 sonnet-4 行 am3 已被移入 records 段，剩余行全为 sonnet-4，calls=2 / sessions 精确列表 / buckets 全 sonnet-4 断言均不受影响；(b) union records SQL（`token-stats-store.ts:583-584`）漏接 `${agent_where}`——边缘带内无 agent≠claude-code 的行，断言不受影响。两段 SQL 各自独立拼接过滤变量（`token-stats-store.ts:567` 与 `:584`），漏接风险每段独立。另：f001 修复把原 rollup 段的 model 负向行（修复前 am3 落 10:30 整小时带）移入 records 段，属于"换位置"而非"补齐双源"——修复前可探测的 rollup×model 切片反而丢失。
- 建议：数据补两条负向行即可覆盖全部 4 个切片且无需改断言：records 段加 agent 负向行（agent=opencode、model=sonnet-4，落 07:40 附近）；rollup 段加 model 负向行（model=grok-4.5、agent=claude-code，落 08:00 后整小时）。现有 calls=2 / sessions 精确列表 / buckets 全 sonnet-4 断言天然排除这两行。

## 结论（Round 2）

- 前轮 finding 复核：
  - t428_test_f001（minor）：**部分修复**。核心目标已达成——am3（07:45，grok-4.5）与 am4（07:50，sonnet-4）落窗口 [07:30,08:00) 边缘带（`token-stats-store.test.ts:2353/2360`；full_start=08:00，见 `token-stats-store.ts:553`），union records 段非空，records SQL 带 `${agent_where}${env_where}${model_where}`（`:583-584`）；若 records 段漏接 model_where，am3 混入使 calls=3，断言失效——原判据"断言必须能失效"对 records×model 已成立。但修成"换位置"：原 rollup 段的 model 负向行被移出，rollup×model 切片探测丢失；records×agent 切片本就缺失。残留见 f002（minor）。
  - 前轮无 critical / important。
- 改测方向复核：无——本轮 store 测试仅改 am3/am4 的 timestamp 与注释（断言预期 calls=2 / sessions 列表不变，数据仍满足相同预期，属修复 f001 的合法数据调整，非"迁就实现"）；view 测试与 `TokenStatsView.tsx` 相对 Round 1 无变化。
- 本轮新发现：1 条（t428_test_f002，minor）
- 未进表的提示：无新增；Round 1 结论段提示项仍适用
- 总体判断：f001 核心目标已修，残留为 2 个负向切片缺探测（覆盖扩展类 minor）；危险模式扫描未命中（本轮 diff 无 skip/only/弱化断言/删 expect/mock 误用）；无未解决 critical / important
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified`——diff 复核 view 用例（`token_stats_view.test.tsx:487-517`）相对 Round 1 未变，仍断言 prefs 残留 `shared-key` 归一为后声明 `AliasB` 且下拉值 `AliasB`；指纹变化（bebf8f09→b192334c）全部来自 store 测试 am3/am4 数据调整（task.md fix_ref 与 diff 均证）。
- AC-002：`re_verified`——单 alias 回归由既有用例覆盖，`map.set` 改动唯一 key 行为中性；定向重跑 `tests/unit/main/core/token-stats/token-stats-store.test.ts` 103/103 绿（含既有用例）。
- AC-003：`re_verified`——diff 复核 view 用例预期 `AliasB` 且可区分修复前后（旧 `if (!map.has(m))` 先写获胜归 AliasA）。
- AC-004：`re_verified`——定向重跑 AC-004 用例绿；修复后 records 段非空（am3/am4 落 [07:30,08:00)），records×model 负向探测已生效；残留负向切片见 f002（minor，不阻断）。
- AC-005：`re_verified`——用例未受本轮改动影响（sm1/sm2/sm3 全落整小时带），定向重跑含该用例全绿。
- AC-006：`re_verified`（store 侧）——定向重跑 103/103 绿；view 侧本轮 diff 未触碰（Round 1 已 35/35 绿），视为复验通过。

coverage = 6 / 6

reviewed_scope: b192334c17eca8f4

verdict: PASS

## Round 3 (2026-08-17 09:25 UTC+8)

本轮无新 finding。前轮 f001/f002 已全部消除（以当前 diff 为准，4 切片负向行全覆盖，断言不变）。

### t428_test_f002 复核（minor，已消除）

- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2373-2376`（am5/am6，新增于本轮）
- 核实现状：AC-004 用例数据现为 am1..am6 六条——rollup 段 [08:00, full_end) 含 am1（匹配）/am2（agent=opencode 负向）/am6（model=grok-4.5 负向）；records 边缘带 [07:30,08:00) 含 am3（model=grok-4.5 负向）/am4（匹配）/am5（agent=opencode 负向）。四条负向行与四个切片一一对应：rollup×model=am6、rollup×agent=am2、records×model=am3、records×agent=am5（后两者为本轮新增，恰是 Round 2 判定的缺失切片；`token-stats-store.ts:567` rollup SQL 与 `:583-584` records SQL 各自独立拼接 `${agent_where}...${model_where}`，漏接风险每段独立，负向行须落对应段）。
- 失效判据复验（任一段漏接均使断言失效）：rollup 漏接 model_where → am6（grok-4.5）混入，calls=3 且 sessions 含 s-claude-4，断言 1/2/4 全失效；rollup 漏接 agent_where → am2 混入，calls=3 且 sessions 含 s-opencode；records 漏接 model_where → am3 混入，calls=3 且 sessions 含 s-claude-2；records 漏接 agent_where → am5 混入，calls=3 且 sessions 含 s-opencode-2。calls 与 sessions 均从同一 union builder 物化（`token-stats-store.ts:1495` 与 `:1625`），漏接无绕行路径。
- 断言未变：calls=2、sessions 精确列表 `[s-claude, s-claude-3]`、buckets/rollup 全 sonnet-4 与 Round 2 完全一致，非「修成另一种弱化形式」。
- 数据卫生：am5/am6 的 message_id/session_id 均为新唯一值，不干扰现有断言；am6（09:00 整点）与 am2 同 09:00 hour 桶但 agent 不同，rollup 分组键含 agent，无串扰。
- 定向重跑：`pnpm exec vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts` → 103/103 通过。

### 结论（Round 3）

- 前轮 finding 复核：
  - t428_test_f001（minor）：**已消除**——f002 修复后 records 边缘带同时含匹配行（am4）与 agent/model 两类负向行（am5/am3），"组合过滤 × union records 源有数据"切片已触达，原判据（断言必须能失效）对 records 侧全成立。
  - t428_test_f002（minor）：**已消除**——am5/am6 补齐 records×agent 与 rollup×model 两缺失切片，4 切片负向全覆盖且断言可失效；f002 建议的修复方向（records 段 agent 负向、rollup 段 model 负向）与落位被完全落实。
  - 前轮无 critical / important。
- 改测方向复核：无——本轮 store 测试仅新增 am5/am6 两条负向数据记录与注释（`token-stats-store.test.ts:2333-2376`），断言预期（calls=2 / sessions 列表）未动，数据仍满足相同预期，属 f002 修复的合法数据调整，非"迁就实现"；view 测试与 `TokenStatsView.tsx` 本轮 diff 为空。
- 本轮新发现：0 条
- 未进表的提示（范围外，流程文件问题）：`task.md` 处置表 Round 1 小节误填 `t428_test_f002` 行（该轮实际只有 code_f001/test_f001，f002 系 Round 2 才提出；Round 1 表内 fix_ref 也指向 am5/am6 修复，自相矛盾）。该重复导致 `check_review_status.py --task-dir docs/tasks/t428_model_alias_map_semantics_unify` 报 `finding_id 重复：t428_test_f002` 而无法运行指纹比对。建议 implementer 删除 Round 1 表中的 f002 行后再跑流程脚本；不影响本轮测试审查结论。
- 总体判断：f001/f002 两处 minor 均已按建议真修（负向行落位与断言失效判据经代码与定向运行双重核实），无未解决 critical / important；危险模式扫描未命中（本轮 diff 无 skip/only/弱化断言/删 expect/mock 误用/阈值掩盖）
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified`——view 用例本轮 diff 为空，断言（prefs 归一为后声明 `AliasB`、下拉值 `AliasB`，`token_stats_view.test.tsx:487-517`）与前轮一致；前轮已实际运行 35/35 绿。
- AC-002：`re_verified`（store 侧）——定向重跑 store 文件 103/103 全绿，单 alias 回归用例未受本轮影响。
- AC-003：`re_verified`——view 用例未变，断言仍可区分修复前后（旧 `if (!map.has(m))` 先写获胜归 AliasA）。
- AC-004：`re_verified`——定向重跑 AC-004 用例绿；静态复核 4 切片（rollup×model=am6 / rollup×agent=am2 / records×model=am3 / records×agent=am5）负向行分布与各自漏接时的断言失效判据（见上）。
- AC-005：`re_verified`——用例未受本轮改动影响（sm1-3 数据未动），定向重跑含该用例全绿。
- AC-006：`re_verified`（store 侧）——定向重跑 103/103 绿；view 侧本轮 diff 未触碰，沿用前轮 35/35 结果。

coverage = 6 / 6

reviewed_scope: cbd6deeb837ce0ed

verdict: PASS
