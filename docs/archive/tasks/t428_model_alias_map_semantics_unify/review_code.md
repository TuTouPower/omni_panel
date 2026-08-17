# Task review t428（reviewer_focus: 代码）

- task：`t428_model_alias_map_semantics_unify`
- spec：`docs/tasks/t428_model_alias_map_semantics_unify/spec.md`
- diff_anchor：`b95e7a9d5a248914a1ba6ebae22528e1a5e4e0f8`
- target：`git diff b95e7a9d5a248914a1ba6ebae22528e1a5e4e0f8`
- round：1
- reviewed_at：2026-08-17 00:14 UTC+8

## Findings

### t428_code_f001 - AC-004 新用例 fixtures 未触达 union records 边缘源，「双源均只返回匹配行」只验证了 rollup 源

- 严重度：minor
- 锚点：AC-004（"rollup union 与 records fallback 两条路径均只返回匹配行"）；spec 范围"触达 dashboard_window_union_builder 双源路径"
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:2330-2390`（AC-005 用例 2392-2436 同因）
- 问题：窗口 S=07:30Z、E=次日 12:15Z，union 整小时段为 [08:00Z, 12:00Z)（`full_start=08:00Z`、`full_end=12:00Z`，按 token-stats-store.ts:552-554 计算）。AC-004 四条 fixture（08:30/09:30/10:30/11:30Z）全部落在整小时段 → 全部走 rollup 源；union 的 records 边缘段 [07:30,08:00)∪[12:00,12:15) 恒空，`current.calls=2`、sessions 精确列表、`metric_buckets`/`rollup` 全 sonnet-4 等断言无法区分"records 边缘源过滤正确"与"records 边缘源过滤错误（返回 0 行）"。测试标题"双源均只返回匹配行"的声称在 fixtures 下只有 rollup 源被真实验证。若未来重构只在 records 段 SQL 中丢 agent/model 条件，本用例不红。
- 佐证：同 describe 内 t204 用例（token-stats-store.test.ts:2300-2328，fixtures 含 07:45/07:50 边缘记录）已用 model-only 触达双源；t384 AC-004（:2698-2729）已在 records fallback 路径覆盖 agent+model 组合；union 三段 SQL 复用同一 `${agent_where}${env_where}${model_where}` 插值（token-stats-store.ts:563-589），双源过滤逻辑本身共享，实际分叉风险低——故不升 important。
- 建议：把 AC-004 中一条匹配记录（如 am2 改 agent）移入窗口边缘小时（如 07:45Z，走 records 边缘段），并补一条边缘段非匹配记录，使"双源均只返回匹配行"被真实断言；或至少把测试名改为"rollup 整小时段过滤"避免过度声称。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
  - 文件过大（达阈值且本 task 净增，按降级规则仅列路径与行数，未引发可观测缺陷）：`src/renderer/views/TokenStatsView.tsx` 972 行（≥800 重要阈值，本 task 净增 2 行）；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 2832 行（≥1200 重要阈值，净增 108 行）；`tests/unit/renderer/views/token_stats_view.test.tsx` 1097 行（≥600 minor 阈值，净增 32 行）。
  - 圈复杂度：无新增函数达阈值；改动函数均为 ≤3 分支的简单循环。
  - 范围外观察：multi-alias（同 key 属 ≥2 组）下首声明组在筛选语义上"死亡"（选 AliasA 只匹配字面 AliasA），这是 last-write-wins 策略的固有属性，与 spec「以 resolver 为准」方向一致，非偏航，不进 finding。
- 总体判断：diff 范围严格（生产侧仅 originalToAlias 一处语义调整，与后端 `dashboard_alias_resolver` 后写覆盖逐行对齐），6 条 AC 均有实现与测试锚点，定向复验全绿；仅 1 条 minor 覆盖缺口，无未解决 critical/important。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`。代码对照：前端 `originalToAlias` 后写覆盖（TokenStatsView.tsx:535-543）与后端 `dashboard_alias_resolver` 的 `lookup.set(key, item.alias)` 后写覆盖（token-stats-store.ts:349-357）同策略；定向测试 token_stats_view.test.tsx 35 用例全绿，新用例锁 prefs "shared-key"→"AliasB"（后声明组）且断言 select 值。
- AC-002：`re_verified`。单 alias 下 first-write==last-write，语义逐字节不变；t230/t384 存量 alias 用例与两文件全部 138 用例绿。
- AC-003：`re_verified`。新前端用例在旧 first-write-wins 代码下 prefs 会归一为 AliasA，`waitFor(prefs.model==="AliasB")` 必然超时，可区分修复前后；用例绿。
- AC-004：`re_verified`（含 f001 缺口）。显式断言 `is_hour_rollup_ready()=true`，agent+model 组合过滤断言 calls/sessions/图表全区域；用例绿。但 union records 边缘源未被 fixtures 触达（f001）。
- AC-005：`re_verified`。跨 model 同 session 去重用例断言 `Set(session_ids).size===length` + 精确列表 `["s-multi","s-other"]`；用例绿。
- AC-006：`re_verified`（范围受限）。按 CPU 节制指令仅跑定向 2 文件 `pnpm exec vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts tests/unit/renderer/views/token_stats_view.test.tsx`，138/138 通过；未跑全量 pnpm test，其它 token-stats 相关文件（集成/契约层）未在本次复验范围内。

coverage = 6 / 6

reviewed_scope: bebf8f09ca4f2c8c

verdict: PASS

## Round 2 (2026-08-17 09:15 UTC+8)

### 前轮 finding 复核

#### t428_code_f001 - 已消除（修复完整，非"修一半"）

- 修复证据（以当前 diff 为准）：AC-004 用例 am3 移至 `2026-07-10T07:45:00`（grok-4.5 + claude-code，非匹配）、am4 移至 `2026-07-10T07:50:00`（sonnet-4 + claude-code，匹配），am1/am2 仍在 08:30/09:30Z。窗口 S=07:30Z、E=次日 12:15Z（token-stats-store.test.ts:1990-1991），按 token-stats-store.ts:552-554 计算整小时段为 [08:00Z,12:00Z)、records 边缘段为 [07:30Z,08:00Z)∪[12:00Z,12:15Z)（本地 +08:00，full_start=08:00Z、full_end=12:00Z）。am3/am4 落入 [07:30Z,08:00Z) → 真实走 `records_part` 的 `timestamp >= @start AND timestamp < @full_start` 分支（token-stats-store.ts:578-586）。
- 断言可区分度（逐失败模式核对，非"恒空"）：
  - records 段丢 model 条件 → am3（agent 匹配、model 不匹配）混入 → `current.calls` 2→3、sessions 多出 s-claude-2 → 红；
  - records 段整体错（丢段/恒 0 行）→ am4 丢失 → calls 2→1 → 红；
  - rollup 段丢 agent 条件 → am2（opencode + sonnet）混入 → calls 2→3 → 红。
  - 三种方向均红，`calls`、sessions 精确列表、`metric_buckets`/`rollup` 全 sonnet-4 四组断言共同锚定"双源均只返回匹配行"，边缘段非空且被真实验证。
- 修复引入的新问题扫描：无。断言全为精确值（`toBe(2)`、`.sort()).toEqual([...])`），无弱化；`every` 恒真风险不存在（calls==2 保证 bucket 非空）；`is_hour_rollup_ready()` 显式断言保留（防空跑）；注释与代码行为一致；本轮仅动测试 fixtures，无生产代码改动，无 .skip/.only。
- AC-005 "同因"部分：其数据仍全落整小时段，但 AC-005 验证目标是跨 model 同 session 去重，发生在 window_rows 聚合层（materialize_session_meta），与记录来源无关；f001 建议本身只要求 AC-004 移入边缘记录。不构成遗留。

### 本轮新发现

无。

### 本轮复验

- 定向 `pnpm exec vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts`：103/103 通过（含 t428 AC-004/AC-005 新用例）。
- AC-004 `re_verified`：边缘 fixtures 触达 records 源，四组断言区分全部失败模式（见上）。
- AC-005 `re_verified`：`Set(session_ids).size === session_ids.length` + 精确列表 `["s-multi","s-other"]`，用例绿。
- AC-001/002/003/006：本轮 diff 未触及前端文件与其余 store 用例，沿袭 Round 1 复验结论。

reviewed_scope: b192334c17eca8f4

verdict: PASS

## Round 3 (2026-08-17 09:25 UTC+8)

### 前轮 finding 复核

#### t428_code_f001 - 已消除（维持 Round 2 结论，本轮改动未回退）

- 修复证据（以当前 diff 为准）：AC-004 用例 am3/am4 仍在 `[07:30Z, 08:00Z)` records 边缘段（07:45/07:50Z），本轮新增 am5（07:55Z）同段。窗口 S=07:30Z、E=次日 12:15Z（token-stats-store.test.ts:1990-1991），按 token-stats-store.ts:552-554：`hs = start - ((start + 28800000) % 3600000)`，full_start=08:00Z、full_end=12:00Z；rollup 段 `[08:00Z, 12:00Z)`、records 边缘段 `[07:30Z, 08:00Z) ∪ [12:00Z, 12:15Z)`。am3/am4/am5 均落 `timestamp >= @start AND timestamp < @full_start` 分支（token-stats-store.ts:583-584），records 源被真实触达且非空：am4 是 records 正向匹配行（calls==2 的构成之一）。records 段丢 model/agent 条件或整段丢失分别由 am3 混入 / am5 混入 / am4 丢失触发红，双源"均只返回匹配行"断言成立。
- 结论：f001 修复在新增 am5/am6 后保持完整，无回退。

#### t428_test_f002（test 侧 minor，本轮核验其修复引入面）

- 修复证据：新增 am5（07:55Z，sonnet-4 + opencode + s-opencode-2，records 段 agent 负向）/ am6（09:00Z，grok-4.5 + claude-code + s-claude-4，rollup 段 model 负向），断言不变（calls toBe(2)、sessions 精确列表 `["s-claude","s-claude-3"]`、metric_buckets/rollup every sonnet-4）。
- 4 切片负向行全覆盖（对角补齐）：rollup×agent=am2、rollup×model=am6、records×agent=am5、records×model=am3；正向双源各 1（rollup=am1、records=am4）。
- 逐切片失败模式可区分性（SQL 共用 `${agent_where}${env_where}${model_where}` 插值，token-stats-store.ts:567/584，任一段丢条件即红）：
  - rollup 丢 agent → am2 混入，calls 2→3 红；
  - rollup 丢 model → am6 混入，calls 2→3 红（sessions 多出 s-claude-4 亦红）；
  - records 丢 agent → am5 混入，calls 2→3 红；
  - records 丢 model → am3 混入，calls 2→3 红；
  - 任一段整体丢失 → am1 或 am4 丢失，calls 2→1 红。
  - `every` 恒真风险不存在：calls==2 与 sessions 精确列表共同锚定 window_rows 非空，metric_buckets/rollup 数组恒有数据。
- 落点核实：rollup 表与 records 段的 hour_start 均为 `timestamp - ((timestamp + 28800000) % 3600000)`（本地整点 epoch，token-stats-store.ts:580/586/1022），am1/am2/am6 的 hour_start 落 `[08:00Z,12:00Z)` 查询段，am3/am4/am5 的 07:00Z hour_start 不在段内不双计，段归属唯一。
- 修复引入的新问题扫描：无。断言全精确值无弱化；无 .skip/.only；无 mock 误用；注释与行为一致；本轮仅动 store 测试 fixtures，生产代码与前端测试无新增改动。

### 本轮新发现

无。

### 本轮复验

- 定向 `pnpm exec vitest run tests/unit/main/core/token-stats/token-stats-store.test.ts`：103/103 通过（含 t428 AC-004/AC-005 用例与新增 am5/am6）。
- AC-004 `re_verified`：4 切片负向全覆盖 + 双源正向各 1，calls/sessions/图表四组断言可区分全部失败模式（见上）；`is_hour_rollup_ready()` 显式断言保留防空跑。
- AC-005 `re_verified`：本轮未改动，沿袭 Round 2 结论（`Set(session_ids).size===length` + 精确列表 `["s-multi","s-other"]`）。
- AC-001/002/003/006：本轮 diff 未触及前端文件与其余 store 用例，沿袭 Round 1 结论。

### 结论

- 前轮 finding 复核：f001 已消除（本轮改动未回退）；f002 修复验证通过、修复引入面无新问题。
- 本轮新发现：0 条。
- 未进表的提示：
  - 文件过大（沿袭 Round 1，无变化）：`src/renderer/views/TokenStatsView.tsx` 972 行（≥800 阈值，净增 2 行）；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 2832 行（≥1200 阈值，净增 125 行）；`tests/unit/renderer/views/token_stats_view.test.tsx` 1097 行（≥600 阈值，净增 32 行）。
  - 范围外流程提示（非 finding，归 implementer）：`scripts/repo_template/check_review_status.py --task-dir ...` 报 `finding_id 重复：t428_test_f002`——task.md Round 1 处置表误列了 Round 2 才提出的 f002（fix_ref 指向 2333-2376，含 am5/am6），导致脚本在指纹比对前 abort。建议 implementer 从 Round 1 表移除 f002 行，仅保留 Round 2 表内一行。
- 总体判断：前轮 minor 均已真修（以 diff 与代码核实，非采信自述），本轮改动未引入新问题，定向复验全绿；无未解决 critical/important。
- 系统性 follow-up：无。

### AC 复验方式（Round 3）

- AC-001：`trust_prior`（本轮未触及前端；依赖 Round 1 代码对照与定向测试证据）。
- AC-002：`trust_prior`（同上）。
- AC-003：`trust_prior`（同上）。
- AC-004：`re_verified`（定向 103/103 绿；边界计算、rollup/records 段归属、4 切片负向覆盖均逐行核对 token-stats-store.ts:552-586 与 fixture 时间戳）。
- AC-005：`re_verified`（沿袭 Round 2 已核断言 + 本轮测试绿）。
- AC-006：`re_verified`（范围受限：定向 store 测试 103/103 全绿，前端 token_stats_view.test.tsx 本轮无改动且 Round 1 已核；未跑全量 pnpm test）。

coverage = 3 / 6

reviewed_scope: cbd6deeb837ce0ed

verdict: PASS
