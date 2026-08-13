# Task review t351（reviewer_focus: 通用）
- task：`t351_token_stats_query_perf`
- spec：`docs/tasks/t351_token_stats_query_perf/spec.md`
- diff_anchor：`89be7c543fe4bf22d7626a5408eccb823f4a76c1`
- target：`git diff 89be7c543fe4bf22d7626a5408eccb823f4a76c1`
- round：1
- reviewed_at：2026-08-13 23:31 UTC+8

## Findings

### t351_gen_f001 - AC-001 分桶 SQL 桶号恒为浮点，分桶失效，趋势返回最旧 cap 点、丢弃最新数据
- 严重度：critical
- 锚点：AC-001（"单查询返回行数有界（≤ cap）"）+ 非范围"不改查询结果语义"；JSDoc 承诺"每桶取 observed_at 最大一条"
- 位置：`src/main/core/observation/observation-store.ts:231-252`（`query_trend_stmt`，`bucket_idx` CASE 在 234-237，`.all(...)` 参数在 320-333）
- 问题：better-sqlite3 把 JS number 一律以 REAL 绑定（`sqlite3_bind_double`），已验证 `typeof ?` 对整数参数也返回 `real`。因此 `(observed_at - ?) / ?` 恒为 REAL 除法，`bucket_idx` 是浮点（如 119.3），`PARTITION BY bucket_idx` 给几乎每个观测一个独立分区，`ROW_NUMBER() ... rn=1` 全部命中，分桶从未发生。结果整窗行按 `observed_at ASC` 返回 + `LIMIT cap` → 返回的是窗口内**最旧** cap 行，最新观测被静默丢弃。用与 store 完全相同的 SQL/参数实测：7 天窗 130 点、cap=120 → 返回 120 行全部为最旧点，最新点被丢弃约 13 小时，末桶（now-84min）内返回 0 点；正确分桶应返回每桶最新、含 now 附近一点。旧 JS `Math.floor((ts-start)/bucket_width)` 是正确的，此为纯回归。
- 建议：SQL 内对除法结果取整，例如 `CAST((observed_at - ?) / ? AS INTEGER)`（ELSE 分支同），再走现有 `>= cap` 钳制与 `bucket_idx >= 0`；并补一条判别性测试：>cap 点均匀铺开时断言末桶返回 now 附近的最新点（现 tests 的"聚合分支"因 121 点恰有 120 个唯一 ts、最新点恰好未被 LIMIT 截断而偶然通过，无法捕获本缺陷）。

### t351_gen_f002 - promote_to_active 内部超时回调提升下一条 queued 时不重置其 timer，AC-003 未完整达成
- 严重度：important
- 锚点：AC-003（"queued 请求在 active 变慢时不被误报超时（timer 在发送/激活时重置）"）
- 位置：`src/main/core/token-stats/query-dispatcher.ts:151-160`（`promote_to_active` 内 `setTimeout` 回调）
- 问题：本 task 新增的 `promote_to_active` 自身超时回调里，提升后随 queued 请求仍走裸 `active = next; send(next)`（154-159 行），未清/重置 `next.timer`。`next.timer` 是入队时 `request_dashboard`（238-254 行）按入队时刻起的计时器，仍处于 armed 状态，到其入队期限即对已激活的 next 触发 `QueryTimeoutError`——正是 AC-003 要消除的"按入队计时误报超时"。可复现路径：p1 active 超时 → settle 路径 promote_to_active(p2) 已重置 ✓；p2 active 期间新来 p3 入队；p2 超时走本回调提升 p3，p3 的入队 timer 未重置 → 激活后仍按入队时刻提前误报。diff 修了 settle（175-179 行）与 request_dashboard 超时回调（242-247 行）两处，漏了本函数自带的第三条链。
- 建议：本回调内改调 `promote_to_active(next)`（与另两处一致），并补三请求链场景测试（p1 超时 → p2 超时 → 断言 p3 激活后未提前超时）。

### t351_gen_f003 - AC-002 声称"不依赖 raw records 全窗口扫描"未达成：rollup ready 路径仍对 records 全窗口 GROUP BY MIN/MAX + N 次 title 查
- 严重度：important
- 锚点：AC-002（"rollup ready 后 dashboard 查询不依赖 raw records 全窗口扫描"）
- 位置：`src/main/core/token-stats/token-stats-store.ts:623-636`（meta_rows 对 `token_stats_records` 的 `WHERE ${conditions}` 即全窗 `[start,end)` 扫描 + GROUP BY），637-642（每会话一次 title 查询）
- 问题：`from_records=false` 分支虽把 calls/tokens 聚合移到 window_rows（rollup），但 started_at/ended_at 仍需 `SELECT MIN(timestamp), MAX(timestamp) FROM token_stats_records WHERE timestamp >= start AND timestamp < end GROUP BY ...` —— 仍是覆盖全窗口的 raw records 范围扫描；另每会话一条 title 索引查询（N 次往返）。AC-002 字面行为（dashboard 查询不再依赖 raw records 全窗口扫描）未满足；回退/风险节"SQL 语义与 oracle 一致"的目标也只覆盖 calls/tokens，started/ended 走 records 属新分支未验证。
- 建议：要么收紧 AC 表述为"calls/tokens 聚合不扫 records"，要么为 started/ended 走持久化增量/小时级 MIN/MAX（本 task 未实现）；至少补一条断言：rollup ready 前后同种子数据 dashboard `sessions` 输出逐字段相等（现无 oracle 等价测试，仅 writable vs readonly 同为 rollup 路径自比）。

### t351_gen_f004 - title 轻量补查未带 agent/platform/model 过滤，与 records oracle 路径语义不一致
- 严重度：minor
- 锚点：AC-002 语义一致性（非范围"不改查询结果语义"）；review 焦点"title 取最新还是首个"
- 位置：`src/main/core/token-stats/token-stats-store.ts:637-642`（`title_stmt` WHERE 仅 `source/env/session_id + timestamp`）
- 问题：`title_stmt` 未含 `build_dashboard_conditions` 的 agent/env/model 过滤（meta_rows 在 623-629 用了 `conditions`）。当 dashboard query 带 `model`/`agent` 过滤时，title 取的是该会话同窗口任意 model 的最新记录，而 oracle 路径（663-680 行 window function）取过滤集内最新——两者可不同。影响限于 title 标签，属可观察差异。
- 建议：`title_stmt` WHERE 追加与 meta_rows 一致的 agent/env/model 条件（参数同源），或在 UPDATE 时复用 meta_rows 的过滤上下文。

### t351_gen_f005 - window_rows 分支 session_meta 按 directory 分组，oracle 仅按 (source,env,session_id)，同会话多目录时重复行并放大 SUM
- 严重度：minor
- 锚点：AC-002 语义一致性（非范围）
- 位置：`src/main/core/token-stats/token-stats-store.ts:610-619`（`GROUP BY source, env, session_id, directory`）对比 oracle `token-stats-store.ts:669-679`（`PARTITION BY source, env, session_id`）
- 问题：oracle 每 (source,env,session_id) 一行、directory 取最新记录；新分支按 (…,directory) 分组 → 同一 session 跨多 directory 时 session_meta 出多行：`dashboard_session_page_from_meta`（718-723 行）会话列表与 COUNT 重复，且 `read_rollup_from_window_rows`（693-694 行）的 `LEFT JOIN session_meta` 使该 session 的 SUM(calls/tokens) 按重复倍数放大。依赖"同 session 单 directory"假设，正常数据不触发，属数据相关差异。
- 建议：GROUP BY 去掉 directory 且 directory 取最新（与 oracle 对齐），或显式声明并测多目录会话行为。

## 结论
- 前轮 finding 复核：无（round 1）
- 本轮新发现：5 条（1 critical、2 important、2 minor）
- 未进表的提示：无
- 总体判断：AC-001 分桶下推 SQL 因 better-sqlite3 REAL 绑定导致桶号恒为浮点、分桶完全失效，趋势返回最旧 cap 点并丢弃最新数据（默认 cap=120 路径即触发，实测复现），属回归；AC-003 的 promote_to_active 自身超时链未重置 timer，AC-002 仍依赖 records 全窗扫描且 title/分组存在语义分歧。仅修复 critical 与 important 后方可合入。
- 系统性 follow-up：无

verdict: FAIL

---

# Task review t351（Round 2 复核）
- round：2
- reviewed_at：2026-08-13 23:42 UTC+8
- target：`git diff 89be7c543fe4bf22d7626a5408eccb823f4a76c1`

## Findings（Round 2）

### t351_gen_f001 - 浮点 bucket（critical）——已消除
- 修复：`src/main/core/observation/observation-store.ts:231-251` 对两处除法加 `CAST(... AS INTEGER)`（CASE WHEN 条件与 ELSE 分支），参数顺序不变。CAST 对非负值等同 truncation（与 JS `Math.floor` 非负语义对齐），bucket_idx 恢复整数，PARTITION BY 聚合生效。
- 验证：实测 130 点/cap=120 → 返回 120 行、末点为全局最新观测（修复前返回最旧 120 点、末点滞后）。
- 回归测试：`tests/integration/observation/observation-store.test.ts:327`「bounds rows to cap and keeps the newest window when points exceed cap」130 点均匀铺开，断言 `last.observed_at == max_inserted`；该断言在旧浮点 SQL 下必失败（整窗 ASC LIMIT 120 返回最旧点），能防住原 bug。已跑通（21 passed）。
- 结论：消除。

### t351_gen_f002 - 链式 promote 未重置 timer（important）——已消除
- 修复：`src/main/core/token-stats/query-dispatcher.ts:154-159` promote_to_active 自身超时回调改调 `promote_to_active(next)`，链式提升同样 clearTimeout + 重设完整 timer。
- 回归测试：`tests/unit/main/core/token-stats/query-dispatcher.test.ts`「resets the timer on chained promotion...」p1→p2→p3 三请求链：p1 超时 promote p2、p2 超时 promote p3（此步走本函数内部回调），p3 激活后 20ms（<30ms 重置后）响应不误报。旧实现（裸 `active=next; send(next)`）该测试必失败。已跑通（9 passed）。
- 结论：消除。

### t351_gen_f003 - AC-002 仍全窗口扫 records（important）——已消除
- 修复：`src/main/core/token-stats/token-stats-store.ts:623-666` from_records=false 分支改为从 window_rows 取 DISTINCT 会话集合，对每会话索引窄查（`WHERE source/env/session_id + timestamp 范围`，走 idx_records_session_ts），单查询取 title + `MIN/MAX(timestamp) OVER ()` + ROW_NUMBER 最新。无 records 全窗口 GROUP BY / window function。
- 语义核对：started_at/ended_at = 窗口内该会话 min/max，与 oracle `MIN/MAX OVER (PARTITION BY ...)` 一致；title 取 timestamp DESC,rowid DESC 最新，与 oracle 一致。会话集合来自过滤后 window_rows；rollup 中部 session 在 records 表仍留明细行，窄查可命中，无 NULL title 泄漏。
- 结论：消除。

### t351_gen_f004 - title 未带过滤（minor）——已消除
- 修复：meta_stmt 追加 `AND agent = ?` / `AND model = ?`（与 build_dashboard_conditions 同源）。platform/env 过滤由会话集合携带：sessions 取自按 query 过滤后的 window_rows，每会话 s.env 即过滤目标 env，固定 `env = ?` 等价 oracle 的 `env = @env`。
- 结论：消除。

### t351_gen_f005 - session_meta 按 directory 分组（minor）——未解决，维持
- implementer 辩解「window_rows 按 (…,directory) 分组、session_meta 也按 directory 分组、rollup 左连 1:1 不放大」不成立。
- 证据：`read_rollup_from_window_rows`（`src/main/core/token-stats/token-stats-store.ts:693-694`）LEFT JOIN 的 ON 子句只含 `source/env/session_id`，不含 directory。若 session_meta 对某 session 有 2 行（directory=A/B），window_rows 该 session 每行与 2 行相乘，GROUP BY w.directory 后 SUM(w.calls) 翻倍。实测：同 session 两目录（window_rows 10+5，session_meta 两行）→ 聚合输出 20+10=30，真实 15；ON 若加 directory 条件则 10+5=15 正确。oracle 路径每 session 一行（directory 取最新），无此放大。另 `dashboard_session_page_from_meta` 会话列表会重复该 session。
- 触发条件：同 (source,env,session_id) 跨多 directory（session 通常绑定单 transcript 目录，罕见）。数据相关、低风险，维持 minor。建议后续随 window_rows 语义统一时修复（GROUP BY 去 directory 且 directory 取最新，对齐 oracle），非阻塞本 task。
- 结论：未解决（minor，不 blocking）。

## 结论（Round 2）
- 前轮 finding 复核：f001-f004 已消除；f005 维持 minor 未解决
- 本轮新发现：无
- 未进表的提示：无
- 总体判断：1 critical + 2 important 全部消除且各有能防住原 bug 的回归测试（34 + 114 测试全过）；仅剩 1 条数据相关 minor（同 session 多 directory 的 SUM 放大），正常数据不触发，可合入。
- 系统性 follow-up：无

verdict: PASS
