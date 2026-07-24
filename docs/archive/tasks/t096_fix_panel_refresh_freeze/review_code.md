# Task review t096（reviewer_focus: 代码）

- task：`t096_fix_panel_refresh_freeze`
- spec：`docs\tasks\t096_fix_panel_refresh_freeze\spec.md`
- diff_anchor：`664a80cc4e622dc0dbe87d9a74e71ff7f04b20ff`
- target：`git diff 664a80cc4e622dc0dbe87d9a74e71ff7f04b20ff`
- round：1
- reviewed_at：2026-07-24 10:35 UTC+8

## 评审范围

- diff 实际触及代码：`src/main/core/observation/observation-store.ts`（+10 -7，仅 `list_by_instance_stmt` SQL 改写）。
- 测试侧新增：`tests/integration/observation/observation-store.test.ts`（+17，多分组 + stale 混入用例），属 test reviewer 范围，仅作 inline anti-pattern 扫描。
- 工作区其余改动（task.md / tasks_index.json）非代码。

## Findings

无。

## 评审过程记录

### 规格合规（实现层）

- **AC 覆盖**：spec「按实测主因选用，不要求全做」— 实现侧仅改 list_by_instance_stmt，符合「按归因实施修复」。实测数字与归因落在 task.md（claim，非本 reviewer 范围）。
- **不偏航**：spec 非范围列出「不改数据更新语义」「不做与卡死无关的性能优化」。改动未碰 loading/ready/failed 流转、stale 复制、零观测兜底；未顺手改 `list_latest_by_provider_stmt`（第 155-165 行）等同模式相关子查询 — 严格收敛在实测主因点，未扩大工作集。
- **不变量守住**：`list_by_source_instance_id` 契约（返回该实例下每 (account_id, metric_id) 最新观测）维持，新测试 t096 用例（2 分组各多条历史）验证。
- **技术决策落地**：spec 候选方向含「observation insert 批量事务」，实际归因指向查询侧（list_by_instance）而非 insert 侧，改写符合「按实测主因选用」。

### 代码质量

- **DRY**：`list_latest_by_provider_stmt`（155-165）与 `prune_stmt`（183-190）仍用相关子查询同模式。spec「不要求全做」明确豁免，不构成 finding。
- **控制流 / 圈复杂度**：单条 prepared statement，无分支。
- **错误处理**：N/A（声明式 SQL）。
- **边界条件**：空结果集、单行实例、stale 行混入均由现有 + 新增测试覆盖。
- **命名 / separation of concerns / 死代码**：无问题。perf-probe 临时探针已移除，diff 干净（grep `perf.?probe` 无命中，工作区无残留）。
- **文件膨胀**：observation-store.ts 293 行，远低于实现源码 400 minor 阈值。

### 实现正确性

**SQL 语义等价性核查**（核心关注点）：

- 旧 SQL：相关子查询返回 `observed_at = MAX(...)` 的**所有**并列行（tie 时可能多行）。
- 新 SQL：`ROW_NUMBER() OVER (PARTITION BY account_id, metric_id ORDER BY observed_at DESC) WHERE rn = 1`，每分区恰好 1 行（tie 时实现定义挑一行）。
- WHERE 已限定 `source_instance_id = ?`，PARTITION BY (account_id, metric_id) 与旧 SQL 的分组 (source_instance_id, account_id, metric_id) 等价（source_instance_id 在过滤后为常量）。
- **Tie 场景实际概率**：`observed_at = Date.now()`（ms 精度），同 source_instance_id 连续 refresh 经网络调用间隔远 > 1ms；正常流程无 tie。insert 无唯一约束理论允许 tie，但 callers（hydrate-runtime-store.ts:28、refresh-service.ts:278/396）对 tie 行为无依赖，新行为（取一）等价或更优（去重）。
- 注释「语义不变」在常规场景成立，tie 边界属良性偏差，不构成 finding。
- 注释提到「走 idx_lookup 覆盖索引」属实现者对计划器的假说；加速主因是消除 per-row 子查询（N² → 单次窗口排序），与具体索引选择无关，但不影响正确性与实测收益。

### 测试 inline 扫描

新测试（test:86-101）：2 组 (account, metric)、stale 行混入、断言每组返回最新（m1=3000 非 stale 的 2000，m2=2500）。用例设计合理，验证 stale 不被过滤、多分组去重、取最新。无 mock 误用 / 恒真断言 /弱化断言。详细评估留 test reviewer。

## 结论

- 本轮新发现：0 条
- 总体判断：极小聚焦改动（单条 prepared statement SQL 改写 + 1 测试用例），严格收敛在实测主因点，未越界。SQL 语义等价（tie 边界良性，callers 无依赖），测试覆盖到位，探针清理彻底。

verdict: PASS
