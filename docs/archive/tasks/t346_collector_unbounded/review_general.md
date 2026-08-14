# Task review t346（reviewer_focus: 通用）

- task：`t346_collector_unbounded`
- spec：`docs/tasks/t346_collector_unbounded/spec.md`
- diff_anchor：`9145fcbd87600de80b34a62fcca9e51fafd10b75`
- target：`git diff 9145fcbd87600de80b34a62fcca9e51fafd10b75`
- round：1
- reviewed_at：2026-08-13 20:29 UTC+8

## Findings

### t346_gen_f001 - 7 天窗口使活跃长会话旧记录全量重发，重引入过滤器本要解决的 ~200k records/collect 问题

- 严重度：important
- 锚点：AC-001 权衡评估（窗口外记录重发是否可接受）；spec 上下文区「风险与回退」断言「增量扫描下旧记录不重发」与代码实际行为不符
- 位置：`src/main/core/token-stats/collector.ts:126,135-138,568,616,643`
- 问题：`EMITTED_WINDOW_MS=7d` 裁剪后，活跃会话（文件 mtime 持续变化、跨轮被重复读）中超过 7 天的旧记录 key 会被 prune（`:135-138`），下一次 mtime 变化重派生整个会话记录集时（`claude-reader.ts:616` dirty + `:632-647` merge 全量 records）这些 key 已不在 map，`:568` 去重判断失效 → 全量重发。长活会话稳态下**每次 mtime 变化都重发「整段历史减近 7 天」**（200k 级），正是代码注释 `:121-122` 声称要避免的「~200k records/collect on active installs」，只是场景收窄到被持续触碰的会话。spec 风险段的回退理由「增量扫描下旧记录不重发」对**停止变化**的文件成立，对持续变化的活动会话不成立；且超大会话重发触顶 `MAX_RECORDS*20`（`:573`）时还会误入 t345 截断路径，产生 spurious 游标推进 +「exceed limit」告警。DB 侧 `token_stats_records` PK 为 `(message_id, source, env)` 且 `upsert_records` 为 REPLACE（`token-stats-store.ts:240,45`），故重发幂等无重复行——属性能/IO 回归而非数据损坏。
- 建议：向 spec/decisions 澄清该后果（活跃长会话每次触碰全量重发），决定是否接受；不接受时可选：(a) 将去重集合纳入 scan-state 持久化（内存有界前提下减少重启丢失）或调大窗口；(b) 会话级 mtime 兜底——已提交 mtime 的会话在未变化时跳过重发（当前 `emitted_record_keys` 是唯一兜底）。至少应更新 spec 风险段的错误前提。

### t346_gen_f002 - has_changes 的 status!=="ok" 分支使永久不可用/失败 source 每轮触发保存，违背 AC-002

- 严重度：important
- 锚点：AC-002「无新数据时跳过写盘」在常见配置下不成立；实现正确性（分支注释声称的语义不成立）
- 位置：`src/main/core/token-stats/collector.ts:655-660`
- 问题：`participated.some(s => 状态非 ok)` 令任何参与读取的 source 一旦处于 `unavailable/failed` 就恒为 has_changes=true。生产默认 `wsl_enabled=true`（`src/main/index.ts:424`）、`state_path` 恒有值（`:428`），Windows+WSL 机器上 grok 未安装是常态（`grok-reader.ts` missing→unavailable）：于是「本轮零新数据 + grok unavailable」也每轮 `save_state`。`save_state`→`writeJsonAtomic`→`writeFileAtomic` 内含 `handle.sync()`（`src/main/core/storage/write-json.ts:33-38`）即 fsync——正是 AC-002 要消除的「每轮无条件 fsync」。另该分支注释「失败/不可用 source 的 state 可能被回滚，需保存回滚后状态」不成立：reader 失败/不可用在 `read_source`（`:373-480`）内不修改任何 map（各 kind 均在成功返回后 `set`，失败走 catch 不 set）；真正需要持久化的回滚来自 postMessage 失败（`:624-636`），而带数据的失败轮已被 `all_sessions/daily/records 非空` 分支覆盖，空数据轮的 postMessage 失败回滚不持久化也无数据丢失。故该分支既不达其注释目的，又造成 spurious 每轮保存。
- 建议：移除 `participated.some(...)` 分支（回滚-带数据已由非空分支覆盖，空数据回滚无需持久化），或改为「source 状态自上一轮发生 transition」才保存。最小修复即删掉 `:655-660`，保留 `state_path && has_changes` 前四项。

### t346_gen_f003 - prune 在去重循环之后执行，边界到期 key 当轮仍被当作已发出，重发延迟一轮

- 严重度：minor
- 锚点：行为缺陷（窄时序窗口）
- 位置：`src/main/core/token-stats/collector.ts:642-643`（prune 位于记录循环 `:566-576` 之后）
- 问题：恰在当轮超过 7 天的 key，在记录循环里仍命中 `:568 has(key)` 被跳过，当轮结束后才被 prune 删除；若该记录内容已变（REPLACE 语义下应更新），更新要等下一轮（且仅当下一轮该会话仍 dirty 才重发）。无数据丢失，仅 1 轮延迟 + 潜在更新被抑制。
- 建议：将 `prune_emitted()` 移到记录循环之前（collect 开头），使过期 key 在当轮按「未发出」处理。

### t346_gen_f004 - AC-001/AC-002 测试未按 spec 测试策略断言定量界与覆盖过触发分支

- 严重度：minor
- 锚点：测试覆盖（spec 上下文区「测试策略」要求注入大量历史记录断言裁剪后集合大小不超阈值）
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:1010-1058`
- 问题：AC-001 两条测试仅注入 2 个 key 验证「旧删新留」机制，未按策略注入大量历史记录并断言集合大小上界（机制正确但定量不变量无测试）；AC-002 测试只覆盖 happy path（空数据跳过保存），未覆盖「存在 unavailable source 时仍每轮保存」的过触发（即 f002）。测试本身真实断言、37/37 通过（re_verified），无危险模式。
- 建议：补一条「注入 N 条 >7d 旧 key + 本轮新记录，断言 collect 后 map.size ≤ 窗口内记录数」；补 unavailable-source 下 save 仍触发的用例以固化 f002 处置后的预期。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：4 条（2 important，2 minor）
- 未进表的提示：无
- 总体判断：AC-001 内存有界达成、AC-002 happy path 达成且测试通过；但存在 2 条未解决 important——f001 活跃长会话全量重发回归（spec 风险前提不成立）、f002 AC-002 在默认 Windows+WSL 配置下仍每轮保存。需修复或按流程处置后方可合入。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。重跑 `npx vitest run tests/unit/main/core/token-stats/collector.test.ts`（37/37 通过）；读代码确认 prune_emitted 机制（Map 值时间戳 + 7d 窗口 + collect 末尾裁剪）使内存有界于近 7 天活动量。f001 暴露的是该方案的副作用（活跃会话重发），非 AC 未达成。
- AC-002：`re_verified`。测试证实空数据轮跳过 save；读代码确认 has_changes 判定与 `writeJsonAtomic` fsync。f002 表明在永久不可用 source 存在时 AC-002 的「无新数据跳过写盘」可观测行为未达成。

`coverage = 2 / 2`

reviewed_scope: 0af275b7d668cd0e

verdict: FAIL

## Round 2 (2026-08-13 20:40 UTC+8)

### t346_gen_f005 - spec「风险与回退」段未同步更新，p166「spec 已接受」claim 与文件实际不符

- 严重度：minor
- 锚点：文档/配置一致性（Round 1 f001 处置依据不完整）；spec 上下文区「风险与回退」原文「增量扫描下旧记录不重发」仍与代码实际不符
- 位置：`docs/tasks/t346_collector_unbounded/spec.md:85-88`、`docs/pending/todo/p166_emitted_window_active_session_reshi.md`
- 问题：`git diff 9145fcbd... -- docs/tasks/t346_collector_unbounded/spec.md` 为空——spec「风险与回退」段未改动，仍是「增量扫描下旧记录不重发，裁剪窗口取保守值」。p166 条目声明「spec 已接受裁剪权衡」，但 spec 文件无对应接受动作。代码实际（活跃会话 >30 天持续触碰 → key 过窗被删 → 整段历史重发）与该段断言仍不一致。
- 建议：finalization 时同步 spec「风险与回退」段（把「增量扫描下旧记录不重发」修正为「活跃会话可能重发，已用 30 天保守窗口压低概率，残余风险见 p166」），使 p166 的「spec 已接受」claim 落到实处。

### 前轮 finding 复核（以 diff 核实，不采信处置表自称）

- f001（important）：已消除。代码核实 `EMITTED_WINDOW_MS=30d`（`collector.ts:130`）。触发条件收紧为「同一会话 key 自首次发出起 >30 天未重设时间戳且仍被 mtime 触碰」——key 仅在首次发出时 `set`（`collector.ts:617`），已存在 key 走 `continue` 不刷新时间戳，故需「会话连续活跃 >30 天」才全量重发，实际极罕见。满足 spec 上下文区「风险与回退」要求的「裁剪窗口取保守值」处置方向；残余风险已登记 p166（处理=未开，即接受遗留）。残余的 spec 文本不一致出为 f005（minor）。该 finding 不再 blocking。
- f002（important）：已消除。diff 核实 `has_changes` 仅含 `all_sessions/daily/records 非空 || truncated_sources` 四项（`collector.ts:645-653`），`participated.some(status!=="ok")` 分支已删除。状态丢失面核实：grok missing 时 `scan_grok_updates` 返回 `new_state: prev`（`grok-reader.ts:408-417`，保留 prev state），`grok_states.set(prev)` 幂等无实际变化；其他 source 的 failed/path-null 路径不 set map。postMessage 失败回滚仅在带数据轮发生，已由 all_* 非空触发保存；空数据轮回滚状态=上轮已保存值，无丢失。新测试「does not save on unavailable sources」（`collector.test.ts:1059-1072`）在修复前会 fail（grok unavailable 曾使 has_changes=true），是真回归测试。AC-002 在默认 Windows+WSL 无 Grok 配置下不再每轮保存。
- f003（minor）：未改代码（prune 仍在去重循环后 `collector.ts:642-643`），已登记 p167（处理=未开）。minor 遗留可接受。
- f004（minor）：部分满足——补了 AC-002「unavailable 不触发保存」测试；AC-001 定量测试（按 spec 测试策略注入大量历史记录断言容量上界）仍未补。minor 遗留可接受。

### 本轮新发现

- f005 1 条（minor）。无新引入 blocker。grok missing 保留 prev state 的行为已核实，无状态丢失。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。重跑 `npx vitest run tests/unit/main/core/token-stats/collector.test.ts`（38/38 通过）；prune 测试用 31 天旧 key 验证裁剪，30 天窗口下内存有界于近 30 天活动量。
- AC-002：`re_verified`。代码核实 has_changes 四项判定 + 新 unavailable 测试；确认默认配置下永久不可用 source 不再触发保存（修复前该测试失败，现通过）。

`coverage = 2 / 2`

reviewed_scope: 3a86f4258eddeeae

verdict: PASS
