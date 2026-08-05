# Task review t208（reviewer_focus: 代码）

- task：`t208_sparkline_granularity_window`
- spec：`docs/tasks/t208_sparkline_granularity_window/spec.md`
- diff_anchor：`f91a7603684a4c1a66340231e92ca8e3f9cccd76`
- target：`git diff f91a7603684a4c1a66340231e92ca8e3f9cccd76`
- round：1
- reviewed_at：2026-08-05 12:13 UTC+8

## Findings

### t208_code_f001 - 同 ts 去重条件为永假 dead branch，保留首条而非「最新」

- 严重度：minor
- 锚点：行为缺陷（非 AC 锚定）—— 同 observed_at 多条 observation 取舍语义未定义，当前 `>` 比较无效。
- 位置：`src/main/core/observation/observation-store.ts:306-310`（未聚合分支 `by_ts` 去重）
- 问题：未聚合分支（原始点数 ≤ cap）按 `observed_at` 升序返回前做同 ts 去重：

    ```ts
    const by_ts = new Map<number, Observation>();
    for (const obs of observations) {
        const prev = by_ts.get(obs.observed_at);
        if (!prev || obs.observed_at > prev.observed_at) by_ts.set(obs.observed_at, obs);
    }
    ```

    Map key = `observed_at`，故 `prev.observed_at === obs.observed_at`，`obs.observed_at > prev.observed_at` 恒为 false。条件实际只剩 `!prev`——同 ts 时**永不覆盖**，保留**先插入**的那条。注释「同 ts 去重留最新」与代码行为相反。spec 契约区未定义同 ts 多条语义，下游 build_trend_series 也未区分，故无下游可观测错误；但分支冗余、注释误导。

- 建议：明确取舍策略后简化。若要「保留最后插入」改 `if (!prev || obs.observed_at >= prev.observed_at)` 或直接 `by_ts.set(...)`（Map 同 key 后写覆盖）；若同 ts 视为等价无需去重，删除整段 map 逻辑直接 sort + dedupe 连续等值。

### t208_code_f002 - 接口签名返回类型 `(Observation | null)[]` 与实际返回 `Observation[]` 失真

- 严重度：minor
- 锚点：spec 风险与回退「空桶语义变化」—— 旧「缺日填 null」已废弃，新实现两分支都返回非 null Observation。
- 位置：`src/main/core/observation/observation-store.ts:39`（接口声明）；实现 `:318`（未聚合分支返回 `Observation[]`）、`:336`（聚合分支返回 `Observation[]`）。
- 问题：接口 `query_trend_series(...): (Observation | null)[]` 保留旧契约里「可能含 null」的承诺，但 t208 后两个分支都构造 `Observation[]` 并返回，永不产出 null。下游 `build_trend_series` 仍声明 `| null` 入参兼容旧契约，类型层面协变不报错，但接口契约描述与实现行为脱钩，未来读接口者会误以为可能拿到 null。`TrendApi.get` 注释（`src/shared/types/ipc.ts:282-283`「返回长度 = days，缺失日期填 null」）同样过时，但属 spec 非范围。
- 建议：接口返回类型改 `Observation[]`；`build_trend_series` 入参类型相应收窄为 `Observation`（或保留 `| null` 作防御层并注释说明）。`TrendApi.get` 注释单独按非范围处理（登记 pending 或在 finalization 同步 blueprint）。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
    - **测试层缺口（属 test reviewer 职责，不进 finding 表）**：`tests/unit/renderer/components/provider_account_row.test.tsx:373` 测试名「窗口选择器切换 days 触发新取数，**切回走缓存**」但实际仅断言「切到 1 天 callCount=2」，未断言「切回 7 天 callCount 不增加」——spec AC4「窗口切换后切回原窗口走缓存命中」的命中分支在本仓未验证。代码侧 AC4 实现确实存在（`cache_key` 含 `days` + `useEffect` deps 加 `trend_days`），无代码 bug；测试断言缺口留给 test reviewer。
    - **测试层缺口（属 test reviewer 职责）**：AC1「sparkline 显示折线点数 > 1」spec 上下文区可测试性声明「sparkline 折线点数可由组件测试断言（`data` 数组长度 / 渲染的 `circle` 数）」，当前前端测试未断言 circle 数；store 层已由 `trend-granularity.test.ts` 覆盖。
    - **范围外观察**：`src/shared/types/ipc.ts:282-283` `TrendApi.get` 注释「返回长度 = days，缺失日期填 null」已过时；spec 范围只订正 `TrendPeriodRequest.days` 注释（已完成 `:300`），`TrendApi.get` 注释不在范围内，建议 finalization 阶段同步 blueprint 或登记 pending。
    - 文件过大：无（最大 `observation-store.ts` 356 行，未触发 400 行 minor 阈值）。
    - 圈复杂度：未触发（`query_trend_series` 实现体 CC 约 5-6，未达 10）。
    - `docs/tasks/.../task.md` 实施笔记写「无」——以代码与 diff 为准，已核实。
    - `build-info.ts` 是 generated，未纳入评审。
- 总体判断：代码层 AC 实现完整（cache_key 含 days、useEffect deps、分桶 cap、未聚合分支均到位），下游调用点（trend-ipc、local-api server、web getBulk、ProviderAccountRow）全部自动同步（query_trend_series 不传 max_points 走默认 120，无需改）。仅 2 条 minor（dead branch + 接口类型失真），无 blocking。
- 系统性 follow-up：无（无跨 task 公共代码缺口）。

verdict: PASS

## Round 2 (2026-08-05 12:25 UTC+8)

### 前轮 finding 复核

- **t208_code_f001（同 ts 去重 dead branch）**：已修。`src/main/core/observation/observation-store.ts:309-312` 改为 `by_ts.set(obs.observed_at, obs)` 无条件覆盖，Map 同 key 后写覆盖，实际语义「同 ts 保留最后一条」。注释 `:307-308` 同步订正为「后出现者覆盖（同 ts 保留最后一条）」。聚合分支 `:317-324` 仍保留 `obs.observed_at > prev.observed_at` 比较，此处 `prev` 来自不同 observed_at 的同桶记录（key 是 bucket index 非 observed_at），比较有效，非 dead branch。已消除。
- **t208_code_f002（接口签名 `(Observation|null)[]` → `Observation[]`）**：已修。接口声明 `src/main/core/observation/observation-store.ts:39` 改为 `Observation[]`，新增可选 `max_points?: number` 形参 `:38`。实现 `:287` 签名协变。下游协变兼容见下方核对，无新增问题。

### 下游协变核对（f002 修复后）

- `build_trend_series`（`src/shared/lib/trend.ts:22`）：入参仍声明 `readonly (...| null)[]`，作为防御层接受更窄的 `Observation[]`，TS 协变允许，无类型错误。其内部 used/limit 校验仍可能产出 null TrendPoint，独立于本 task，语义正确。
- `trend-ipc.ts:32-39, 51-57`：两处 `query_trend_series` 调用未传 `max_points`（走默认 120，spec 范围内），返回 `Observation[]` 直接喂 `build_trend_series`，类型链通。`trend:get` / `trend:getBulk` 通道契约（`TrendPoint|null` 返回）未变，前端无断言破坏。
- `local-api/server.ts:495-502`：同上，单调用点未传 `max_points`，类型通。
- `usageboard-web.ts`：无 `query_trend_series` 直接调用，仅转发 HTTP。
- 类型与测试实证：`tsc --noEmit` 零报错；`trend-granularity / trend-query-key / trend-instance-isolation / observation-store` 共 28 测试全绿（含新增 4 条 t208 用例 + 旧 instance-isolation 的 `filter(p=>p!==null)` 已就地删除）。
- 测试层同步：`observation-store.test.ts` 旧「returns days points with null fill」「returns all-null series」两条测试已整体删除并写明理由（t208 废弃旧语义），`keeps the latest observation per day` → `keeps the latest observation per bucket` 断言按新语义重写（非就地把旧断言改成当前输出）。符合 spec 测试策略与 TDD 纪律。

### 本轮新发现

无新 finding。

### 未进表的提示

- **接口前置 docstring 过时（与 Round 1 同类范围外观察）**：`observation-store.ts:17-18` 接口前置 docstring 仍写「取最近 `days` 天内、按天分桶的最新一条观测,每天最多 1 条。返回长度 = `days`...缺失日期填 null」，紧随其后的 t208 补丁段 `:27-30` 又声明该语义废弃。同文件内两段自相矛盾。属 spec 非范围（spec 只订正 `TrendPeriodRequest.days` 注释与受影响文件清单未含此前置 docstring），与 Round 1 `TrendApi.get` 注释一并建议 finalization 阶段同步或登记 pending，不进 finding 表。
- 文件过大：无（`observation-store.ts` 356 行，未触发 400 行阈值）。
- 圈复杂度：无（`query_trend_series` CC 约 6-7，未达 10）。
- `build-info.ts` 为 generated，未纳入评审。

### 总体判断

f001、f002 两条 minor 均已按建议修复到位，下游（trend-ipc、local-api、build_trend_series、ProviderAccountRow、测试）协变兼容，typecheck 与 28 条相关测试全绿，修复过程未引入新问题。无未解决 critical / important。

### 系统性 follow-up

无（与 Round 1 一致，无跨 task 公共代码缺口）。

verdict: PASS
