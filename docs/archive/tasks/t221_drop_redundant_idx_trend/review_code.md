# Task review t221（reviewer_focus: 代码）

- task：`t221_drop_redundant_idx_trend`
- spec：`docs/tasks/t221_drop_redundant_idx_trend/spec.md`
- diff_anchor：`158d7e7e2754f62e916a9ebc6263d103d53c67e4`
- target：`git diff 158d7e7e2754f62e916a9ebc6263d103d53c67e4`
- round：1
- reviewed_at：2026-08-05 16:10 UTC+8

## Findings

### t221_code_f001 - `docs/specs/observation-store.md` 仍声称 idx_trend 存在并保留

- 严重度：minor
- 锚点：本 task 删除 idx_trend 后，模块 spec 文档与实现事实矛盾（非行为 AC，属文档同步缺口）
- 位置：`docs/specs/observation-store.md:38`、`:44`
- 问题：本 task 从 `INIT_SQL` 移除 `CREATE INDEX IF NOT EXISTS idx_trend`，但模块 spec 文档仍写着「planner 走 idx_lookup 全覆盖，idx_trend 对本查询冗余但保留」（:38）与「索引 `idx_lookup(...)` 与 `idx_trend(provider, account_id, metric_id, observed_at)`（后者服务于 sparkline 范围扫描，因 `idx_lookup` 在 `metric_id` 后还挂 `source_instance_id`，无法覆盖只按 provider/account_id/metric_id 过滤的范围查询）」（:44）。新库不再创建该索引，文档描述已失真。`docs/specs/` 写权归属为「task 收尾时累积更新」，且项目约定「改代码后检查 docs/ 是否受影响，一并更新」，故属本 task 收尾应同步的范围。
- 建议：收尾时同步该两处表述——索引仅 `idx_lookup`；旧库残留 idx_trend 不迁移 DROP、保留无害。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大：`observation-store.ts` 349 行、测试 352 行，均远低于阈值（400/600），无。
    - 复杂度：改动为纯文本删除 + 断言收紧，无函数分支变化，无。
    - 范围外观察：spec 测试策略建议的「先跑基线再删索引对比」未单独落地，但 `query_trend_stmt` SQL 与分桶逻辑逐字节未动（diff 无相关行），现有 `query_trend_series` 系列断言编码的是删除前行为，AC-2 已由既有用例覆盖，无需基线对照测试。
- 总体判断：AC-1/2/3/4 全部达成；diff 严格限于 scope（source + 测试 + task.md），无越界改动，无死代码、无断言弱化、无自由发挥。唯一 minor 为模块 spec 文档同步缺口，不阻断。
- 系统性 follow-up：无

verdict: PASS
