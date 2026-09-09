# p211 dashboard 会话列表对 records 缺失 session 透出 null 时间致 500

- 现象：web 面板 /v1/dashboard 返回 500「Invalid dashboard response」,token 统计全挂。期望:即使个别 session 明细不完整,面板仍应展示其余数据。

- 影响：/v1/dashboard(主面板)整体 500;/v1/dashboard/sessions(独立会话端点)同因崩。真实库中 7 条 8-28 采集的 grok session 触发;今日采集正常(近 3h 0 脏),非复发。已确认同类位点 1 个:`query_dashboard_sessions`(token-stats-store.ts:1799)与主 dashboard(:1669)共用 `materialize_session_meta`。

- 根因：产品缺陷(健壮性)。rollup 就绪路径 `materialize_session_meta`(:783)从 window_rows(rollup)建 session_meta,started_at/ended_at 默认 NULL,再逐 session 窄查 records 补时间(:833 meta_stmt);session 只在 rollup/sessions 表有、records 无(数据不一致)时,row undefined → 不 UPDATE → session_meta 保留 NULL → `dashboard_session_items`(:973)直接透出 null → `tokenStatsDashboardDtoSchema`(shared/types/token-stats.ts:460)要求 number 拒 → server.ts:1293 500。脏数据来源:7 grok session 8-28 23:2xZ 采集时 records 缺失(一次性异常)。

- 测试缺口：token_stats_dashboard.test.ts 用干净构造数据(每 session 有 records)→ session_meta 总能补到时间,永不触发 null。缺「rollup 就绪 + 该 session 无 records」场景。补测:构造 session 仅 rollup 有、records 无,跑 query_dashboard 与 query_dashboard_sessions,断言时间兜底非 null、不抛、其余 session 正常返回。

- 线索：`.scratch/task-bug-dashboard-null-session/repro_notes.md` + `.scratch/dash_probe.mts`(直连真实库复现,safeParse 精确列出 null 路径)

- 处理：t467

- 处理引用更正（2026-09-09）：t444（此前批量归档命令写入的 t467 为误关联）。
