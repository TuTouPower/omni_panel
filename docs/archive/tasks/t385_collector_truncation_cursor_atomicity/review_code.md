# Task review t385（reviewer_focus: 代码）

- task：`t385_collector_truncation_cursor_atomicity`
- spec：`docs/tasks/t385_collector_truncation_cursor_atomicity/spec.md`
- diff_anchor：`c9e2a17e0d8a7e46afd46f1d38560a1278e08288`
- target：`git diff c9e2a17e0d8a7e46afd46f1d38560a1278e08288`
- round：1
- reviewed_at：2026-08-15 06:54 UTC+8

## Findings

### t385_code_f001 - has_changes 追加 `source_cursors.size > 0` 基本冗余，过滤源滞留游标时每轮全量写盘

- 严重度：minor
- 锚点：AC-001；t346 AC-002「本轮无新数据时跳过保存」意图
- 位置：`src/main/core/token-stats/collector.ts:694-700`
- 问题：游标只在一个位置创建——截断分支（collector.ts:626），该分支同一块内 `truncated_sources.push(src)`（collector.ts:636）。因此「游标存在且本轮被处理」时 `truncated_sources.length > 0` 恒为真，`source_cursors.size > 0` 对 AC-001 持久化是冗余兜底（截断轮本就触发保存）。该 clause 唯一独占触发的场景：携带游标的源被过滤（`wsl_enabled=false` 或主机过滤 `continue`，collector.ts:540/543）——游标不删除也不处理，此后每个 poll 都全量序列化 scan-state 并写盘，即使无任何新数据。违反 t346 已确立的「无新数据跳过保存」不变量，属过度保存（正确性无碍，每轮一次原子写，幂等）。
- 建议：删除 `source_cursors.size > 0`，或改为显式判断「游标存在但本轮未处理」（过滤路径），避免无数据时反复写盘。

### t385_code_f002 - 重复注释行

- 严重度：minor
- 锚点：代码质量（DRY/死代码）
- 位置：`src/main/core/token-stats/collector.ts:554-555`
- 问题：`// t385 AC-003: read_source 前快照各 map 该源条目与游标前值，失败时恢复。` 逐字重复两行（diff 亦显示为两次新增）。
- 建议：删除一行。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - 文件过大（按降级规则不进 finding 表）：`src/main/core/token-stats/collector.ts` 773 行（≥400 minor 阈值、<800 important，本 task 净增约 79 行）；`tests/unit/main/core/token-stats/collector.test.ts` 1141 行（≥600 minor 阈值、<1200 important，净增约 75 行）。两者未达 important，仅提示后续拆分。
  - 圈复杂度：`collect()`（collector.ts:509-702）手算 McCabe 明显 ≥15，但为本 task 前已存在的复杂度；本 task 新增分支（快照入列、身份跳过、截断合并、set_or_delete）均为线性简单分支，未产出可观测缺陷，按规则不进 finding。
  - 范围外观察（测试层，不判 finding）：AC-003 将 postMessage 失败恢复从「删除」改为「按快照还原」，scan-state 五张 map 的还原路径无专门新断言，仅由既有 t345 用例（collector.test.ts:406 断言失败轮 jsonl_states 键被清）间接覆盖——该用例断言的是「轮前无条目 → 还原即删除」，与快照语义一致仍通过。
  - 迁移完整性核查（均为核验结论，非 finding）：`source_cursors` 计数→身份集合的迁移无遗留 numeric 引用（grep 全仓确认）；daily 身份键 `${id}|${date}|${model}` 与四类 reader 产出一致（claude/kimi/grok 的 `daily.id=session_id`、`date=calendar_date_of`、`model` 非空；opencode-reader 直接以 `${session_id}|${date}|${model_id}` 建 key），且与 store 的 `token_stats_daily` REPLACE PK（id,source,env,date,model）粒度一致；records 走 `emitted_record_keys`（record_key=source|env|message_id），不受游标改动影响；AC-003 快照含 5 map 条目 + 游标 Set 深拷贝，失败轮 `emitted_record_keys` 只在成功路径提交、其余模块态无残留副作用，截断轮新增身份键随快照还原丢弃；AC-004 由 `SerializedSourceCursor` 全可选字段 + load 守卫（`s.source_cursors` / `c.sessions ?? []`）及专门用例覆盖。50 个相关单测全绿、`pnpm typecheck` 通过。
- 总体判断：四 AC 均有实现且行为正确，未发现 critical/important；仅 2 条 minor（冗余保存判定、重复注释），可 PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: b39b15772bb8d12f
