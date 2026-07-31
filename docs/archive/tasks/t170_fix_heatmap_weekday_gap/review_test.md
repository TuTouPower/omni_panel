# Task review t170（reviewer_focus: 测试）

- task：`t170_fix_heatmap_weekday_gap`
- spec：`docs/tasks/t170_fix_heatmap_weekday_gap/spec.md`
- diff_anchor：`fe7313965db211188550164352711b4d662a81db`
- target：`git diff fe7313965db211188550164352711b4d662a81db`
- round：1
- reviewed_at：2026-07-31 15:46 UTC+8

## Findings

### t170_test_f001 - local-api `/v1/heatmap` 路由与 web `getHeatmap` 无测试

- 严重度：minor
- 锚点：AC3（热力图数值与 records 全量聚合一致）经 local-api/web 传输通道无验证
- 位置：`src/main/core/local-api/server.ts:296`（新 `/v1/heatmap` 路由）、`src/web/usageboard-web.ts:202`（`getHeatmap: () => get_json("/v1/heatmap")`）、`tests/integration/local-api/server.test.ts:250`（「web read endpoints do not require bearer auth」端点清单不含 `/v1/heatmap`）
- 问题：本 diff 新增的 `/v1/heatmap` 路由与 web 版 `getHeatmap` 无任何测试。`token-stats-ipc.test.ts` 与 `token-stats-store.test.ts` 已覆盖 IPC 通道与 store 聚合，但 local-api/web 是另一条真实传输路径：若路由误接 store 调用、query 参数（env/start/end）解析错误或 web 端 URL 写错，现有测试全部仍绿，web 版热力图会静默坏掉。
- 建议：在 `tests/integration/local-api/server.test.ts` 增 `/v1/heatmap` 返回聚合 cell 数组的用例，并在「web read endpoints do not require bearer auth」清单加 `/v1/heatmap`；`tests/unit/web/usageboard-web.test.ts` 补 `getHeatmap` 断言请求 `/v1/heatmap`。

### t170_test_f002 - token_stats_view 窗口 scoping 断言仅 `toBeDefined`

- 严重度：minor
- 锚点：AC1（>=7d 窗口内实际有数据的 weekday 都有着色）的窗口转发正确性
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:409-414`
- 问题：`expect(get_heatmap).toHaveBeenCalled()` 后仅断言 `last_call?.start` / `last_call?.end` 为 `toBeDefined()`，未校验其值与所选「7 天」窗口一致。若渲染逻辑把错误窗口（如恒用默认全量窗口、或误用短窗口 start/end）传给 `getHeatmap`，测试仍绿。窗口过滤本身正确性已由 store 测试覆盖，此处缺口是「视图层把所选窗口值正确转发给聚合查询」这一跳线无精确断言。
- 建议：把 `last_call.start` / `last_call.end` 与所选 7d 窗口的预期 epoch 范围做 `toBe` 精确断言（可参照本文件 188-193 行 `get_records` 的 start/end 断言模式）。

### t170_test_f003 - `+8` 跨日历日边界无自动测试（仅 spike 验证）

- 严重度：minor
- 锚点：AC3（weekday 语义一致）的跨日边界
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:693-703`（「reports weekday as strftime('%w') 0=Sunday」）
- 问题：现有测试用 `bj("2026-07-12 23:59:59")` 断言 `%w=0`、`%H=23`，能锁定 `+8` 偏移与 `%w` 0=周日语义，但该时刻 UTC 与北京同为周日，未覆盖「UTC 前一晚 → 北京次日」的日历日翻转（如 2026-07-11T20:00:00Z = 北京 2026-07-12 04:00，忽略 `+8` 会错算为周六 20 时）。该边界由 s003 spike 实验验证（task.md 记「9 边界用例全过」），未落为自动测试。属可扩展边界用例。
- 建议：补一例 `bj("2026-07-12 04:00:00")`（即 2026-07-11T20:00:00Z）断言 `weekday === 0`、`hour === 4`，把跨日语义固化为回归测试。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）
- 改测方向复核：无「迁就实现」的改测。`token_stats_view.test.tsx` 原「records LIMIT 100000 喂热力图」测试改写的判断：旧断言验证的机制（records 高 LIMIT 喂热力图）被本修复整体移除，语义失效属合法；改写后的「getHeatmap 聚合喂热力图」断言新语义（get_heatmap 被调用、Heatmap 收到聚合 cells），是对新行为的真实断言，非「把旧测试预期改成当前输出」。
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
    - `prepareHeatmapData` 现无生产调用方（`Heatmap.tsx` 已改用 `prepareHeatmapFromCells`），成死代码，仅其单测仍引用——属 code reviewer 范围，此处不列 finding。
    - `tests/unit/ipc/token-stats-ipc.test.ts` 中 `eslint-disable-next-line @typescript-eslint/unbound-method`：为对 mock store 方法取值时 `this` 绑定的类型级 lint 抑制，不掩盖运行时行为失败，判为良性，不列 finding。
    - web 版 `getHeatmap` 不转发 window/env/agent 过滤（`create_web_usageboard` 中 `getRecords` 亦如此），与既有 web 通道限制一致，非 t170 回归，不列 finding。
- 总体判断：新增测试均触达真实生产逻辑（store 聚合 4 例走真实内存 SQLite、`prepareHeatmapFromCells` 3 例走真实映射、IPC 2 例走真实 handler 与 sender 校验），覆盖 AC1-4 且无恒真断言/删测试/跳过/mock 误用/弱化断言；仅 3 条 minor 覆盖扩展建议，不阻断。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-07-31 16:00 UTC+8)

- task：`t170_fix_heatmap_weekday_gap`
- round：2
- reviewed_at：2026-07-31 16:00 UTC+8

## Findings

本轮无新增 finding。

## 结论

- 前轮 finding 复核（以 diff 与代码核实，不采信处置表）：
    - `t170_test_f001`：**已修**。`tests/integration/local-api/server.test.ts` 新增 `GET /v1/heatmap` 用例：真实 `node:http` fetch + `create_token_stats_store(":memory:")` 内存 SQLite，插入 `2026-07-06T09:00:00+08:00`（周一）记录后断言返回 1 cell `{weekday:1, hour:9, calls:1, tokens:11}`，与 store `query_heatmap` 的 `strftime('%w'/'%H', +8 hours)` 聚合一致（已用 node 独立验证 2026-07-06 为周一、%w=1）；「web read endpoints do not require bearer auth」清单已加 `/v1/heatmap`。`tests/unit/web/usageboard-web.test.ts` 新增 `getHeatmap` 传参断言（agent/env/start/end 均入 query string），并核实生产 `src/web/usageboard-web.ts:203-214` `getHeatmap` 确用 `URLSearchParams` 转发四参数；空 filters 走无 query 路径。测试触达真实 HTTP 路由、真实 store 聚合、真实 web 参数拼接，无假绿。
    - `t170_test_f002`：**已修**。`tests/unit/renderer/views/token_stats_view.test.tsx` 原 `last_call.start/end` 仅 `toBeDefined()` 改为 7d 窗口范围断言：`end ∈ (now-5000, now]`、`start ∈ (end-7d-60000, end-7d]`，与生产 `presetRange("7d")={start: Date.now()-7*24h, end: Date.now()}`（`TokenStatsView.tsx:109-112`）精确匹配；动态 `Date.now()` 下用毫秒级容差属合理而非弱化。同时断言 Heatmap 收到 get_heatmap 返回的 cells，验证聚合→视图→组件整条跳线。
    - `t170_test_f003`：**已修**。`tests/unit/main/core/token-stats/token-stats-store.test.ts` 新增 `shifts the calendar day by +8 across the UTC date boundary`：`Date.parse("2026-07-11T20:00:00Z")` 在 UTC+8 为 2026-07-12（周日）04:00，断言 `weekday=0`、`hour=4`；已独立验证该 UTC 时刻 +8 后 getDay=0、hour=4，正是 Round 1 建议的跨日历日翻转用例。
- 改测方向复核：无「迁就实现」的改测。各 view 测试（popup_view / popup_view_height / popup_view_mirror / settings_view / manager.test.ts）mock 增加 `getHeatmap`/`query_heatmap` 返回 `[]`，是 `UsageboardApi` / `TokenStatsStore` 接口新增方法后的必要同步，未改任何既有断言预期。
- 本轮新发现：0 条。
- 未进表的提示：
    - `server.ts` `/v1/heatmap` 路由 `...(start ? { start: Number(start) } : {})` 对 `start=0` 的忽略与 records/sessions 路由既有模式一致，非 t170 回归。
    - `usageboard-web.test.ts` 空 filters 用例仅断言 `stringContaining("/v1/heatmap")`，未严格断言无 `?` query；既有传参用例已覆盖参数拼接，覆盖可更广但不阻断。
    - `prepareHeatmapData` 现无生产调用方，死代码保留单测，属 code reviewer 范围（Round 1 已提示，未变）。
- 总体判断：三条 Round 1 minor 均以 diff 与运行结果核实为真修；新增测试均触达真实生产逻辑（store 内存 SQLite 聚合、local-api 真实 HTTP、view 窗口跳线、chart-data 真实映射），无恒真断言/删断言/跳过/mock 被测逻辑/弱化断言；实跑 6 文件 113 测试全绿。无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS
