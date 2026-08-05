# Task review t221（reviewer_focus: 测试）

- task：`t221_drop_redundant_idx_trend`
- spec：`docs/tasks/t221_drop_redundant_idx_trend/spec.md`
- diff_anchor：`158d7e7e2754f62e916a9ebc6263d103d53c67e4`
- target：`git diff 158d7e7e2754f62e916a9ebc6263d103d53c67e4`
- round：1
- reviewed_at：2026-08-06 00:12 UTC+8

## Findings

无（Round 1 零 finding）。

逐项核对结果：

- **AC-1 新库分支**：新增 `new databases do not create the redundant idx_trend index (t221)`（`tests/integration/observation/observation-store.test.ts:262-282`），直接以真实 SQLite 连接的 `PRAGMA index_list(observations)` 断言含 `idx_lookup`、不含 `idx_trend`。断言针对存储真实状态，非 mock；若 `INIT_SQL` 残留 `CREATE INDEX idx_trend` 则该用例红。已实跑通过。
- **AC-1 旧库分支**：采取 spec 允许的「明确文档化不迁移、保留无害」选项，`observation-store.ts:24-26` docstring 注明「旧库残留无害、不迁移 DROP」。`migrate_observation_schema` 本就只补列、无索引 DDL，删除无连带。文档化选项满足 AC-1，不要求测试。
- **AC-2**：`query_trend_series` 行为测试原样保留（`keeps the latest observation per bucket`、`returns empty series for unknown key`、`returns [] when days<=0`），查询 SQL 未改（仅删索引 DDL），结果一致由既有行为测试触达真实查询路径验证。无覆盖丢失。
- **AC-3**：全仓 grep 确认 `idx_trend` 无其他查询路径依赖；全量 `pnpm test` 2353 passed（唯一失败为 `token_stats_view.test.tsx` 瞬态 waitFor 超时，单文件重跑 27/27 通过，与本改动无关，见结论 follow-up）。
- **AC-4**：`observation-store.ts:24-26` docstring 已删除「idx_trend 保留供等价查询」表述，改为注明 t221 删除。doc 类变更，审阅 diff 即验证。

改测方向复核：唯一被修改的既有测试 `uses a covering index for the range scan`（`test.ts:327-350`）断言从 `/USING INDEX idx_(trend|lookup)\b/` 收紧为 `/USING INDEX idx_lookup\b/`。idx_trend 删除后 planner 物理上不可能再选 idx_trend，收紧是「改断言应有的预期」且为加强（更具体），非迁就实现、非弱化；`not.toMatch(/SCAN observations/)` 禁全表扫描约束保留。合法。

危险模式扫描：无恒真断言、无删/反转/注释 expect、无弱化（本次为收紧）、无删测试、无 `.skip`/`.only`、无 `eslint-disable`/`@ts-ignore`、无 mock（整文件用真实 better-sqlite3 连真实文件）、无阈值掩盖、无条件跳过、无存在即通过。新测试的 `toContain("idx_lookup")` 为防御配对（防删索引时连带删除 idx_lookup），与 `not.toContain("idx_trend")` 互补，非占位断言。

测试可信：两个用例均经真实 store（`create_observation_store` 跑真实 `INIT_SQL`）+ 真实 SQLite 连接验证存储/计划行为，生产逻辑可达，无 mock 被测点。异步时序无涉（better-sqlite3 同步）。新测试在每用例独立 `mkdtemp` 临时目录建独立 db 文件，隔离良好。

验证实测：目标文件 20/20 通过；全量套件 2353 passed / 1 flaky / 1 skipped。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无「迁就实现」的改测；收紧断言反映 idx_trend 删除后的正确预期，合法
- 本轮新发现：0 条
- 未进表的提示：
    - `docs/specs/observation-store.md:38` 与 `:44` 仍记载「idx_trend 对本查询冗余但保留」「索引 idx_lookup ... 与 idx_trend ...」——task 范围（spec 范围仅 `observation-store.ts` + 相关测试）不含该 specs 文件，属 task 收尾累积更新职责，建议 finalization / repo-hygiene 阶段同步订正，否则会误导后续读者。
    - 可选覆盖扩展：AC-1 旧库分支可加「含 idx_trend 的旧库打开后仍可正常查询且 idx_trend 残留」用例，但 spec 已允许文档化选项，属可加可不加，不阻断。
- 总体判断：测试真实触达存储/planner 行为，AC-1 新库分支有直接回归守卫、AC-2/AC-3 有保留行为测试覆盖、断言收紧为加强非弱化，无 blocking 亦无 minor finding，PASS。
- 系统性 follow-up：建议跟踪 renderer waitFor 系 flaky（`token_stats_view.test.tsx:364` 全量并行下偶发超时、单文件稳定通过，属 t218 已处置 flaky 家族之外的同源时序问题）；标题「renderer waitFor 系 flaky 统一处置」，slug `fix_flaky_renderer_waitfor`，非阻断。

verdict: PASS
