# Task review t096（reviewer_focus: 测试）

- task：`t096_fix_panel_refresh_freeze`
- spec：`docs\tasks\t096_fix_panel_refresh_freeze\spec.md`
- diff_anchor：`664a80cc4e622dc0dbe87d9a74e71ff7f04b20ff`
- target：`git diff 664a80cc4e622dc0dbe87d9a74e71ff7f04b20ff -- tests/`
- round：1
- reviewed_at：2026-07-24 05:05 UTC+8

## 改动范围

- `tests/integration/observation/observation-store.test.ts`：+17 行，新增 1 个用例「list_by_source_instance_id returns latest per (account, metric) across many groups (t096 perf regression)」。
- 本 task 改的 src 是 `observation-store.ts` 内 `list_by_instance_stmt` SQL（相关子查询 → window function），新用例正好覆盖该被改写函数的语义保持。

## 评审过程

### 危险模式扫描

逐条扫描 `tests/integration/observation/observation-store.test.ts:86-101`：

- 恒真断言：无（断言 `toHaveLength(2)`、`toBe(3000)`、`toBe(2500)`，均具体值）。
- 删/反转 expect：无（纯新增）。
- 注释掉的断言：无。
- 弱化断言：无（用 `toBe` 精确匹配 observed_at 与 length；`find` + `assertNonNull` 定位特定行后断具体 observed_at 值）。
- 删测试 / it / describe：无（只新增）。
- `.skip` / `.only`：无。
- 静默错误（eslint-disable / @ts-ignore / type:ignore）：无。
- mock 误用：无（直接调 `create_observation_store(temp_dir/test.db)` 走真实 better-sqlite3，未 mock 被测函数；`make_observation` 仅是数据构造 helper）。
- 阈值掩盖：无（无 timeout / retry / 容差放大）。
- 条件跳过 / 弱化：无（无条件分支包裹断言）。
- 程序赋值替代交互：不适用（非 UI 测试）。
- 存在即通过：无（`assertNonNull` 只做前置非空守卫，主断言是后续 `observed_at` 精确值）。

### 测试可信

- **测 AC 不是 mock**：走真实 sqlite 库与真实 SQL 执行，验证 `list_by_source_instance_id` 实际返回。`make_observation` / `assertNonNull` 是数据 helper 与类型守卫，非被测逻辑。
- **断言可观察**：返回行数、account_id/metric_id 标识、observed_at 数值，均为调用方可观察契约。
- **异步时序**：better-sqlite3 同步 API，无 race / 漏 await。
- **mock 边界**：仅在文件系统（tmpdir）与 DB 文件路径隔离（系统边界），未 mock 任何内部模块。

### AC 覆盖

spec AC #4「数据更新行为无回归」对应本 task 唯一 src 改动（`list_by_instance_stmt` SQL 改写）。新用例针对该函数验证：

- 多组（a1/m1、a2/m2）→ 验证 `PARTITION BY account_id, metric_id`。
- 组内多条历史（observed_at 1000/2000/3000 与 1500/2500）→ 验证 `ORDER BY observed_at DESC`。
- stale 行（observed_at 2000）混入但不为最新 → 验证 stale 标志未改 latest 选择规则（与旧相关子查询 MAX 一致）。
- 返回长度与具体 observed_at 值 → 验证 rn=1 命中正确行。

`row_to_observation` 显式按列名取字段（src/main/core/observation/observation-store.ts:69-99），window function 多出的 `rn` 列不会污染 Observation 对象——测试通过具体 observed_at 数值间接验证此点。

### 红灯归因

不适用。新用例随修复同时提交（refactor 型 task，新查询与旧查询在该用例输入下应产生相同输出，新测试既验证新查询正确、也佐证语义保持），非「红灯改测试」场景。

## Findings

无。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 测试危险模式扫描全未命中；新用例覆盖 AC #4（数据更新行为无回归）针对被改写函数 `list_by_source_instance_id`，走真实 sqlite，断言精确且可观察。
- 范围外提示（不进 finding 表）：用例名「across many groups」实际仅 2 组；如需更鲁棒，可加 tied observed_at（旧查询返回全部并列行、新查询只返 rn=1，语义在并列场景确有差异，但 polling 数据 observed_at 为 ms 时间戳实际不会并列）、或 stale 行作为最新（验证 stale-as-latest 也被正确返回）。这些属可选加固，非 AC 强制项。

verdict: PASS
