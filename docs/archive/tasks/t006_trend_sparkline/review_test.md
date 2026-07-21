# Task review T006

- task：`T006_trend_sparkline`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 00:30 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T006_test_f001 — spec 验收 #3/#4 的 ProviderAccountRow 行为零直接测试覆盖

- 严重度：high
- 位置：`tests/unit/renderer/components/provider_account_row.test.tsx`（未新增任何 sparkline/cache/failure 相关用例）
- 问题：spec 验收 #3 「ProviderAccountRow 展开后下方出现 sparkline；多 metric 纵向排列；首次展开触发懒查，收起再展开不重复请求（`useRef<Map>` 缓存命中）」与验收 #4 「查询失败/超时不阻塞账号展开，sparkline 区域显示占位，控制台记错误日志；失败不写缓存以允许重试」——这两条核心交互行为没有任何直接的测试断言。现有 6 个 `provider_account_row.test.tsx` 用例只覆盖 `.rel-time`、`.stale`、`accountLabel` 等老断言，对新加的 `useEffect` 懒查分支、`trend_cache_ref.current` 命中分支、`catch` 分支的 `log.warn` + 不写缓存分支、多 metric 多 `<TrendSparkline>` 排列分支完全没有命中。TrendSparkline 自身的 6 个单测验证的是组件单体行为，不能替代「父组件挂载 → 触发 IPC → 写回 state → 渲染子组件」这条集成链。
- 建议：在 `provider_account_row.test.tsx` 至少补 3 个用例：
    1. 首次渲染（`collapsed=false`）调用一次 `window.usageboard.trend.get`，DOM 中出现 `<TrendSparkline>`（可断言 `.trend-sparkline` 或 svg.trend-svg 存在）。
    2. 重新渲染同一 period（`key` 命中 cache）——再 mount 一次或 rerender，断言 `trend.get` 总调用次数不变。
    3. `trend.get` 抛错时：DOM 中 `.trend-sparkline-placeholder` 出现，缓存 `Map.size===0`（可通过 `trend_cache_ref` 不暴露而用「重新渲染后 `trend.get` 再次被调用」反向断言「失败未写缓存」）。

### T006_test_f002 — `tests/smoke/setup.ts` 全局 mock 未补 `trend`，`provider_account_row.test.tsx` 静默吞 TypeError

- 严重度：high
- 位置：`tests/smoke/setup.ts:122-189`（createMockApi 返回对象缺 `trend` 键）；`src/renderer/components/ProviderAccountRow.tsx:60-85`
- 问题：本次 diff 给 4 个 view 测试和 `refresh-service.test.ts` 各自补了 `trend: { get: vi.fn().mockResolvedValue([]) }` 或 `query_trend_series: vi.fn(...)`，但**遗漏了全局 `setup.ts` 和 `provider_account_row.test.tsx`**。`setup.ts:202-206` 通过 `Object.defineProperty(window, "usageboard", …)` 注入 mock，但该 mock 没有 `trend` 字段——`window.usageboard.trend` 为 `undefined`。新增的 `ProviderAccountRow.tsx` 的 `useEffect` 在 `collapsed=false`（默认值）时会执行 `const trend_api = window.usageboard.trend;`（undefined）→ `await trend_api.get(...)` 抛 `TypeError: Cannot read properties of undefined (reading 'get')`，被 catch 块吞掉走 `log.warn`。结果：现有 `provider_account_row.test.tsx` 的 6 个用例虽然 `PASS`，但每次渲染都在默默触发一个被吞的异常，既掩盖了 T006_test_f001 缺失的测试覆盖（视觉上「全绿」），也意味着 `useEffect` 的「失败不写缓存」分支在测试里被错误路径触发而不是被真正的 IPC 错误触发。
- 建议：二选一：
    - 推荐：在 `tests/smoke/setup.ts` 的 `createMockApi()` 返回对象里加 `trend: { get: vi.fn().mockResolvedValue([]) }`，与其他默认 mock 一致，避免任何使用全局 mock 的子组件测试再踩坑。
    - 或：在 `provider_account_row.test.tsx` 的 `beforeEach` 里 `window.usageboard.trend = { get: vi.fn().mockResolvedValue([]) }`，与 4 个 view 测试保持同一手动补齐策略。
- 备注：单独验证过——临时把 `trend.get` mock 注入后，`ProviderAccountRow` 渲染会调用 `trend.get(period.provider, period.accountId, period.id)`，证明调用路径本来就会触发，所以这是 setup 遗漏而非代码不会走到。

### T006_test_f003 — `trend.test.ts` "normalizes ratio displayStyle to percent" 用例对实现路径无区分度

- 严重度：low
- 位置：`tests/unit/shared/trend.test.ts:87-98`
- 问题：用例描述为「normalizes ratio displayStyle to percent」，但实现 `src/shared/lib/trend.ts:18-39` 完全不读 `obs.display_style`——percent 与 ratio 走同一个 `used/limit*100` 公式。该测试把 `display_style` 从默认 `"ratio"`（注意 `make_obs` 默认就是 `"ratio"`）改成 `"ratio"`，与已有的 7 点升序用例（`make_obs` 默认 ratio）走完全相同的代码分支，只验证了 `Math.round(25/200*100)===13` 这个公式。
- 建议：二选一：
    - 若未来确实要按 `display_style` 分流（如 `percent` 型直接用 `used`），现在补一个对照用例：同 `used=25, limit=200` 但 `display_style: "percent"` 应产出不同值——目前会失败，能形成 TDD 锚点。
    - 若 spec「ratio 型同样按 percent 归一」即「所有型都按 percent 归一」，则把用例名改为 `applies used/limit formula regardless of display_style` 并加一行注释说明实现不读 `display_style`，避免后续维护者误以为该字段被消费。

### T006_test_f004 — EXPLAIN QUERY PLAN 断言在空表上跑，未覆盖 SQLite 选 idx_lookup 的反例

- 严重度：low
- 位置：`tests/integration/observation/observation-store.test.ts:246-264`
- 问题：断言 `details.contains("idx_trend")` + `not.contains("idx_lookup")` 思路正确，能防止「idx_trend 被删除/重命名」这种关键退化，本次也实测通过（输出 `SEARCH observations USING INDEX idx_trend (provider=? AND account_id=? AND metric_id=? AND observed_at>?)`）。但有两个小局限：
    1. 测试在空表（`beforeEach` 后未插入任何数据）上执行 EXPLAIN——SQLite 在无统计信息时仍能基于索引列前缀选 idx_trend（实测如此），但若未来引入 `ANALYZE` 或 SQLite 版本变化，空表的计划选择可能漂移到 `SCAN`，让断言失败的原因变成「测试环境」而非「索引退化」。
    2. 断言字符串匹配比较粗——`idx_trend` 作为子串也会匹配未来可能新增的同前缀索引名（如 `idx_trend_v2`）。
- 建议：可选的小加固（非阻塞）：
    - 在 EXPLAIN 前插入 1-2 条 observation 让 planner 有统计依据。
    - 收紧到正则：`expect(details).toMatch(/USING INDEX idx_trend\b/)`。
    - 当前实现可保留——已能捕捉最常见的退化场景。

### T006_test_f005 — `registerTrendIpc` 与 web `/v1/trend` 无独立测试，默认 days 算法两处不一致未被捕捉

- 严重度：low
- 位置：`src/main/ipc/trend-ipc.ts:24`、`src/main/core/local-api/server.ts:323-325`
- 问题：两处默认 `days=7` 的实现算法略有差异：
    - `trend-ipc.ts`: `typeof days === "number" && days > 0 ? days : 7`（接受小数，如 `7.5` 透传到 store）
    - `server.ts`: `Number.isFinite(Number(days_raw)) && Number(days_raw) > 0 ? Math.floor(Number(days_raw)) : 7`（拒绝小数，强制取整）
      两条生产路径都没有单测覆盖默认值/边界（`undefined`、`0`、`-1`、`"abc"`、`7.5`）。spec 没有强制要求这两个端点的独立测试，但它们是 T006 暴露给 renderer/web 的对外契约。
- 建议：补一个轻量集成测试（如 `tests/integration/local-api/server.test.ts` 已有 14 个用例的套件里追加）：对 `/v1/trend?provider=p&accountId=a&metricId=m` 不带 `days` 断言 200 + 长度 7；`days=0` 断言回退 7；`days=3.7` 明确断言是 `floor(3.7)=3` 还是 `7`——让两处算法要么对齐要么显式分歧。`registerTrendIpc` 可通过 `ipcMain.handle` mock 走类似单测。

### T006_test_f006 — `select_trend_api` 分权测试与 T001 风格一致，但未校验 disabled_api 的 noop 语义

- 严重度：suggestion
- 位置：`tests/unit/preload/route_api.test.ts:50-82`
- 问题：分权矩阵测试结构正确——`it.each(["usage","agent","unknown"])` → `full_api`，`it.each(["setting","tray"])` → `disabled_api`，使用 `expect(api).toBe(full_api/disabled_api)` 引用相等断言，与 `select_grok_api` 风格一致。唯一遗憾是 disabled_api 的 `get` 实际行为（`Promise.resolve([])`）未被断言，但这是 T001 同等粒度外的细节，本 task 不强制要求。
- 建议：可在已有用例末尾加一行 `expect(disabled_api.get()).resolves.toEqual([])` 锁定 noop 契约；非阻塞。

## 结论

整体判断：**条件通过（conditional pass）**。

- ✅ `pnpm test` 通过（137 文件 / 1396 用例 / 0 失败），既有测试无回归。
- ✅ `build_trend_series` 单测 8 用例完整覆盖 spec 验收 #1（升序、缺日 null、不足、空、ratio 归一、clamp、used/limit 异常）。
- ✅ `TrendSparkline` 单测 6 用例覆盖 spec 验收 #2（≥2 点渲染 polyline+area+circle、<2 占位、grid 0/50/100%）。
- ✅ `query_trend_series` 集成测 5 用例（含 EXPLAIN QUERY PLAN idx_trend 断言）覆盖 store 层。
- ✅ `select_trend_api` 分权测试与 T001 风格对齐。
- ⚠️ **spec 验收 #3 与 #4 的交互行为零直接覆盖**（T006_test_f001）——这是验收清单里两条最核心的「懒查缓存 + 失败兜底」行为，必须补。
- ⚠️ **`setup.ts` 全局 mock 遗漏 `trend`**（T006_test_f002）导致 `provider_account_row.test.tsx` 渲染时静默触发被吞的 TypeError，掩盖了 f001 的测试缺口；这是 test infrastructure 的真实 bug，应优先修。
- 其余 f003-f006 均为 low/suggestion，不阻塞合入。

合入前建议至少补 f001 的 3 个 ProviderAccountRow 用例 + 修 f002 的 setup.ts mock；f003-f006 可作为后续 polish。
