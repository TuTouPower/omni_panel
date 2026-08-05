# Task review t214（reviewer_focus: 代码）

- task：`t214_sparkline_instance_dimension`
- spec：`docs/tasks/t214_sparkline_instance_dimension/spec.md`
- diff_anchor：`0ddc79d808f4f89548387cd62e9dc6164416a479`
- target：`git diff 0ddc79d808f4f89548387cd62e9dc6164416a479`
- round：1
- reviewed_at：2026-08-05 16:35 UTC+8

## Findings

### t214_code_f001 - `query_trend_series` 接口 doc 注释与实际执行计划自相矛盾

- 严重度：minor
- 锚点：行为缺陷——注释误导后续维护者对索引选择与 filter 行为的判断
- 位置：`src/main/core/observation/observation-store.ts:20-24`
- 问题：接口 doc 写「索引 idx*trend(provider, account_id, metric_id, observed_at) 不含 source_instance_id，范围扫描后按实例 filter」。但 SQL 加 `source_instance_id = ?` 等值后，`observation-store.test.ts:329` 的 EXPLAIN QUERY PLAN 断言（`USING INDEX idx*(trend|lookup)\b`+ 禁全表扫描）以及 spec 上下文区已核实：planner 改走`idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)`全覆盖索引，**不存在"按实例 filter"的额外步骤**。注释描述的 idx_trend 路径在加维度后已不被采用。schema 文件`observation-store.ts:67-68` 还保留旧注释「idx_lookup 因 metric_id 后还挂 source_instance_id,在 observed_at 之前,无法覆盖此范围」——该结论只对**不含 source_instance_id 的旧 WHERE** 成立，对当前 SQL 已失效。
- 建议：订正接口 doc：t214 加 `source_instance_id = ?` 等值后 planner 选 idx_lookup（全覆盖等值列 + observed_at 范围），idx_trend 对该查询已冗余；同步修正 schema 处 idx_trend 上方注释的适用前提（旧 WHERE 不含 source_instance_id 时）。

## 结论

- 前轮 finding 复核：本轮为首次。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
    - 文件过大：无（审查范围内文件均远低于阈值；`observation-store.ts` 约 316 行，未达 400）。
    - 圈复杂度：无（`query_trend_series` CC ≈ 4，未达提示阈值；trend-ipc 两 handler 分别 ≈ 3 与 ≈ 4）。
    - 范围外观察：
        - `idx_trend` 索引在加 `source_instance_id` 维度后对该查询已冗余（planner 选 idx_lookup 全覆盖），但删除/调整索引属 schema 变更，超出本 task 范围，建议作为后续清理项跟踪。
        - `route_api.test.ts:85` 的 disabled_api mock 与生产 `trend_disabled_methods.get()`（零参数）签名不一致（前者 4 参数 `("any","any","any","any")`），但该测试验证的是 `select_trend_api` 的 disabled 注入契约而非生产 noop 签名，非本 task 引入。
- 总体判断：AC1-AC4 全部实现且测试覆盖到位，三路径（IPC trend:get/getBulk、local-api /v1/trend、web /v1/trend）透传 source_instance_id 一致，前后端签名同步更新，无规格偏离、无 YAGNI、无自由发挥、无行为 bug；唯一问题为接口 doc 注释与实际索引选择的描述自相矛盾（minor），不阻断。
- 系统性 follow-up：建议新增清理 task「移除冗余 idx_trend / 订正 observation-store schema 注释」（slug：`obs_idx_trend_cleanup`），非阻断。

verdict: PASS

## Round 2 (2026-08-05 17:05 UTC+8)

### 前轮 finding 复核

- **t214_code_f001（minor）已消除**。`observation-store.ts` 接口 doc（行 16-25）与 schema 上方注释（行 60-63）已订正为反映实际 planner 行为：加 `source_instance_id = ?` 等值后选 `idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)` 全覆盖，idx*trend 对本查询冗余但保留。SQL 注释（行 215-216）同步说明 t214 维度隔离。`observation-store.test.ts:319-336` EXPLAIN QUERY PLAN 断言改为 `USING INDEX idx*(trend|lookup)\b`+ 禁`SCAN observations`，与订正后的注释一致，不再强绑 idx_trend。

### 本轮新发现

0 条。

未发现 Round 1 修复过程引入的新缺陷：

- 三路径透传 source_instance_id 一致（`trend-ipc.ts:25,36,55`、`server.ts:483,496-502`、`usageboard-web.ts:302-312,325-338`），签名与 payload 字段同步更新（`ipc.ts:292,308,324`、`preload/index.ts:166-176`）。
- 前端 `ProviderAccountRow.tsx:112` 取 `account.periods[0]?.sourceInstanceId ?? ""`，与上下文区核实结论（同 card 恒单 sourceInstanceId）一致。
- Round 1 后新增 local-api 端点测试（`server.test.ts:705-752`）与 web bridge 测试（`usageboard-web.test.ts:231-258`）覆盖 AC3 web 路径，断言期望行为正确（inst-a 10% / inst-b 50% 隔离、URL 含 sourceInstanceId）。
- 新增 `trend-instance-isolation.test.ts` 双实例隔离回归覆盖 AC1/AC4，断言 used 值不串。
- 无 swallowed errors、null/空值未处理、资源泄漏；signature 一致性（preload、ipc handler、web bridge、server store 调用）逐一对齐。

### 未进表的提示

- 文件过大：无（审查范围内实现源码最大为 `observation-store.ts` 约 316 行，远低于 400）。
- 圈复杂度：无（`query_trend_series` CC ≈ 4；trend-ipc 两 handler ≈ 3 与 ≈ 4；local-api `/v1/trend` handler ≈ 3）。
- 范围外观察：
    - `idx_trend` 索引对含 source_instance_id 的查询冗余，删除属 schema 变更，仍建议作为后续清理 task（slug：`obs_idx_trend_cleanup`）。
    - `route_api.test.ts:85` disabled_api mock 4 参数与生产 `trend_disabled_methods.get()` 零参数签名差异非本 task 引入（Round 1 已记）。

### 结论

- 前轮 finding：1/1 已消除。
- 本轮新发现：0 条。
- 总体判断：Round 1 minor 已修且注释订正准确，修复过程未引入新缺陷；AC1-AC4 实现完整、三路径透传一致、测试覆盖到位（含本轮补齐的 local-api/web 路径），无 blocking finding。
- 系统性 follow-up：仍建议 `obs_idx_trend_cleanup`（非阻断）。

verdict: PASS
