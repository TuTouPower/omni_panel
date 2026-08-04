# Spike report

## 问题

dashboard 单次请求对同一窗口重复 5–6 次聚合（p027），且 per-group/per-session 存在大量相关子查询（p028）。验证：(1) 单次窗口读取派生全部区域的可行 SQL 形态；(2) 真实 stale 判定的数据来源。

## 成功判据

- `EXPLAIN QUERY PLAN` 显示窗口基础表（`token_stats_hour_rollup` + `token_stats_records` 边界带）只被读取一次，各展示区域从该次读取派生。
- stale 判定有确定数据来源，聚合期间的新提交可被捕获。

## 尝试

实验脚本在 `code/`（`cte_spike.mts` / `temp_spike.mts`），真实 better-sqlite3 + 最小 schema（hour_rollup + records + 索引），构造 3 session × 2 model × 3 整点小时 + 边界带 records。

- 方案 A（现状）：5 个独立 SELECT，各自嵌入 window_union。
- 方案 B：`WITH window_rows AS MATERIALIZED (...) ` CTE，各区域 FROM window_rows。
- 方案 C：`CREATE TEMP TABLE window_rows AS SELECT ... FROM (rollup UNION ALL records)` 一次物化，各区域 SELECT FROM window_rows。
- p028：窗口函数 `ROW_NUMBER() OVER (PARTITION BY source, env, session_id ORDER BY timestamp DESC)` latest-per-group 单查询替代 N 个相关子查询。

## 证据

- 方案 A：每区域独立 `SCAN token_stats_hour_rollup` + `SCAN w`（UNION ALL 结果再扫一遍），5 区域 = 5 次基础读取。
- 方案 B：better-sqlite3 `prepare` 是单语句，每个区域语句各自 `MATERIALIZE window_rows`（EXPLAIN 每个区域都有 `MATERIALIZE window_rows`），base 读取总数仍为 15，CTE 无法跨语句共享物化。
- 方案 C：物化语句一次 `SCAN token_stats_hour_rollup` + 2 次 `SEARCH token_stats_records USING INDEX idx_records_ts`（两个边界带，MULTI-INDEX OR）；各区域仅 `SCAN window_rows`，无 base 重复。各区域行数正确（rollup 6 / metric_buckets 6 / session_buckets 9 / page_total 1 / heatmap 3），与现状 rollup 输出 `JSON.stringify` 相等。
- p028：latest-per-session 单查询 EXPLAIN 为一次 `SEARCH token_stats_records USING INDEX idx_records_ts` + temp b-tree 排序，替代 N 个相关子查询（现实现 session page 每 session 4 个 title/directory/started_at/ended_at 子查询，N 接近 2N+ 次 seek）。
- stale 数据来源：`query_dashboard` 经 `token-stats-query-dispatcher` → utilityProcess readonly worker（`query-worker.ts`）执行，main 进程写 WAL 并发提交。store 已有 `get_data_version_stmt`（单行单调版本）。查询开始/结束各读一次版本，结束 > 开始即聚合期间有新提交。

## 结论

- 单次窗口读取：采用 TEMP TABLE 方案——`CREATE TEMP TABLE window_rows AS SELECT ... FROM (rollup UNION ALL records)` 一次物化，各展示区域 SELECT FROM `window_rows`。CTE 方案在 better-sqlite3 单语句 prepare 下无法跨语句共享物化，不采用。
- p028：session 页与 rollup 的 per-session 元数据用一条 latest-per-group 窗口查询（或并入 window_rows 后按 session 分组取 latest）取齐，替代每 session 相关子查询。
- stale：`query_dashboard` 开始读 `data_version`（version_a），聚合完成后再读（version_b），`stale = version_b > version_a`；返回的 `data_version` 用 version_b（完成时最新），renderer 按既有 t192 AC4 语义（版本 > 已见 → mark_stale）消费。readonly worker 读 WAL 可并发看到 main 的新提交，聚合窗口内更新可捕获。

## 是否采纳

- 决定：是
- 理由：TEMP TABLE 一次物化消除重复全窗口聚合；latest-per-group 消除 N 次相关子查询；版本双读提供真实 stale 判定且复用既有 data_version 语义。
- 后续 task：t201
