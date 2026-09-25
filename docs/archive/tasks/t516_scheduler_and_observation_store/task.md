---
tid: "t516"
slug: "scheduler_and_observation_store"
title: "刷新调度器降频退避与观测存储层优化"
status: "done"
branch: "t516_scheduler_and_observation_store"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "9717ef55234af07ff8abf774074c198e42010be3"
depends_on: "t514"
conflicts_with: ""
note: "审阅采纳项: A4, A9, A31-A34, A37, A38, A43, A45, A112, A113, A119, A126, A132, A136, A137, A145 (原 D8)"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

- 调度器与并发控制加固：
    1. `with_concurrency` 修复 Promise reject 导致 `executing` 集合泄漏和后续任务被丢弃缺陷，捕获单项异常并以 `finally` 安全删除集合，单源顶层导出（A4）。
    2. 调度器最小刷新间隔提高至 30s（`MIN_REFRESH_INTERVAL_SECONDS = 30`），低于 30s 自动钳制；遇到连续失败时触发指数退避（2^failures）并附加 0~20% 随机抖动（jitter），成功即复位（A145）。
    3. `trigger_cycle` 非阻塞排入下一次调度，并在失败回调中精准重置为指数退避定时器，时序分秒不差，且 hanging 任务绝不发生 scheduler death。
    4. 刷新重试引入 `cancellable_sleep`，打通 `deps.abort_signal`，进程退出与关机时休眠即刻唤醒，平稳退出（A43）。
    5. 集中收敛管理刷新锁与重试延时常量（A132）；`max_attempts` 扩界记录日志（A136）；`build_params` 变量并行从 vault 取数（A119）。
- 观测存储与留存优化：
    1. 数据库 `INIT_SQL` 与 migration 新增 `idx_by_instance` 复合索引，消除 `list_by_source_instance_id` 全表扫描（A9）。
    2. `insert_batch` 改为返回 `{ ok, failed }` 写入状态（A31）。
    3. 生产查询全部改为显式列投影（A112）；`row_to_observation` 增加字段反序列化非空校验（A45）。
    4. 新增 `list_latest_success_by_instance`（`stale = 0`），失败降级副本严格基于最新成功观测派生，消除多轮连续失败 stale 衍生雪崩，单事务批量写入（A37/A113）。
    5. `query_trend_series` 严格钳制 `days <= 365, cap <= 1000`（A33）；`prune` 实现循环 `DELETE ... LIMIT` 分批删除，`observation-retention.ts` 增加最大 10 轮自适应步长，避免主线程卡顿（A34）。
    6. `token-stats-store.ts` 的 `query_buckets` 与 `query_sessions` 引入显式列与 `LIMIT @limit OFFSET @offset` 分页保护（A126）。

## Review 处置

### Round 1 & Round 2 (2026-09-25 17:00 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t516_code_f001|important|已修|调度器时序由 trigger_cycle 在失败回调中精确重置退避定时器|src/main/core/scheduler/connector-scheduler.ts:70|
|t516_code_f002|important|已修|refresh-service 生产 5 处 cancellable_sleep 均注入 deps.abort_signal|src/main/core/scheduler/refresh-service.ts:402|
|t516_code_f003|important|已修|observation-store prune 实现 DELETE ... LIMIT 分批删除并受 10 轮保护|src/main/core/observation/observation-store.ts:442|
|t516_code_f004|important|已修|全轮与单账号失败分支均调用 list_latest_success_by_instance (stale=0)|src/main/core/scheduler/refresh-service.ts:421|
|t516_code_f005|important|已修|token-stats-store query_buckets/sessions 接入显式列与 LIMIT/offset 分页|src/main/core/token-stats/token-stats-store.ts:1460|
|t516_code_f006|minor|已修|with_concurrency 单源顶层导出，消除生产闭包与测试平行副本|src/main/core/scheduler/refresh-service.ts:660|
|t516_test_f001|critical|已修|验证多轮失败时仅从 stale=0 派生 stale 副本且断言总行数为 2，杜绝雪崩|tests/integration/scheduler/refresh-service.test.ts:2258|
|t516_test_f002|critical|已修|验证生产 refresh 流程在 abort_signal 触发时立即解除重试休眠|tests/integration/scheduler/refresh-service.test.ts:2220|
|t516_test_f003|important|已修|验证调度器失败 1 次 60s、失败 2 次 120s 及 0~20% jitter 随机抖动断言|tests/integration/scheduler/connector-scheduler.test.ts:225|
|t516_test_f004|important|已修|验证 prune 分批删除 (DELETE ... LIMIT) 机制与自适应推进|tests/integration/observation/observation-store.test.ts:494|
|t516_test_f005|important|已修|验证直接调用的单源 with_concurrency 的并发异常隔离|tests/integration/scheduler/refresh-service.test.ts:2175|
|t516_test_f006|important|已修|验证 1200 条样本下 query_trend_series cap 真实被钳制到 1000|tests/integration/observation/observation-store.test.ts:454|
|t516_test_f007|minor|已修|验证生产真实窗口 SQL 的 EXPLAIN QUERY PLAN 命中 idx_by_instance|tests/integration/observation/observation-store.test.ts:422|

### Round 3 (2026-09-25 17:40 UTC+8)

Round 3 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（包含 vitest 331 个测试套件，4048 passed, 8 skipped, 0 failed）全部通过
- 黑盒：覆盖 with_concurrency 异常隔离、调度器 30s 下限与指数退避抖动、idx_by_instance 索引命中、stale 批量单事务与防雪崩、趋势参数钳制、分批 prune 与退出唤醒
- review：Code Review PASS (Round 3), Test Review PASS (Round 3), overall=PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 刷新调度器与观测存储层优化全量完成。并发原语与调度器退避抖动完全加固；存储层索引、显式列、读行校验、分批 prune 与防雪崩机制落地；token-stats 分页与常量收敛到位。全部 7 项 AC 通过双盲审查。
