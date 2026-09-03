# Task review t444（reviewer_focus: 代码）

- task：`t444_dashboard_null_session_time_fallback`
- spec：`docs/tasks/t444_dashboard_null_session_time_fallback/spec.md`
- diff_anchor：`6156cb0b88e811a3eb2164777a2a2e84a25d4981`
- target：`git diff 6156cb0b88e811a3eb2164777a2a2e84a25d4981`
- round：1
- reviewed_at：2026-09-04 03:40 UTC+8

## Findings

零 finding，逐项核对：

- AC 覆盖：records 补查失败分支新增 sessions 表兜底 + window_rows 二次兜底；两入口（query_dashboard/query_dashboard_sessions）共用 materialize_session_meta，一处修复同时覆盖（与 spec 范围一致）。
- 不偏航：仅 token-stats-store.ts 的 `!from_records` 分支加兜底 + 测试 + task 笔记；无 connector/采集/D​​TO 改动，符合非范围。
- 主键键位：sessions 表主键 (id, source, env)，兜底查询用 `id = session_id`，键位正确（实现中已修正 session_id 列误用）。
- 空值语义：`fallback.started_at !== null` 守卫后才 UPDATE；sessions 表 DDL 为 NOT NULL，双重保险；window 二次兜底处理理论极端；`fallback?.title ?? null` 在全缺时 UPDATE null 时间——此时 window_fallback 非 null 才进入分支，started_at/ended_at 必为 number（MIN/MAX 在 window_rows 有行时非 null，而 sessions 循环源即 window_rows 去重集合，行必存在）。
- 性能：兜底仅在 records 补查失败（脏 session）时触发额外点查，正常 session 路径零新增查询（continue 前置）。
- agent/model 过滤：兜底 sessions 表行不受窗口内 agent/model 过滤约束——脏 session 本就无 records 行可过滤，兜底时间来自会话级汇总，与窗口过滤正交；title 可能取会话最新而非窗口过滤最新，但脏路径只求不崩，属可接受近似。

## 结论

- 前轮 finding 复核：首轮，无。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：最小充分兜底，键位与空值语义正确，正常路径零开销，可 PASS。
- 系统性 follow-up：无

reviewed_scope: 7baa6d80bd4fc777

verdict: PASS
