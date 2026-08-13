# Task review t353（reviewer_focus: 测试）

- task：`t353_local_api_param_validation`
- spec：`docs/tasks/t353_local_api_param_validation/spec.md`
- diff_anchor：`5bb87cadc41bf024947778b84fac497aff489884`
- target：`git diff 5bb87cadc41bf024947778b84fac497aff489884`
- round：1
- reviewed_at：2026-08-14 00:40 UTC+8

## Findings

### t353_test_f001 - 表驱动仅测 abc，spec 测试策略声明的空串/NaN 未覆盖；hourBuckets/rollup 的 end 参数位缺测

- 严重度：minor
- 锚点：AC-001（已有 abc 用例证明 400，非「AC 完全无测试」，属覆盖矩阵不完整）
- 位置：`tests/integration/local-api/server.test.ts:1126-1149`；spec 测试策略 `docs/tasks/t353_local_api_param_validation/spec.md:75`
- 问题：spec 测试策略声明表驱动输入「abc/负数/空串/NaN」，实现 10 用例全部注入 `?<param>=abc`，空串（`?start=`）与 NaN（`?start=NaN`）均未覆盖；sessionHistory limit 校验测试（server.test.ts:1747-1762）也只测 0/-1/abc。生产 `parse_int_param`（`src/main/core/local-api/server.ts:740-749`）对空串（`raw.trim()===""`）与 NaN（`!Number.isFinite`）均抛 InvalidParamError→400，已代码核实无生产缺陷，仅测试未锁定 spec 声明的输入矩阵。另：表驱动缺 hourBuckets/rollup 的 `end` 参数位（两端点只测 start）。
- 建议：向 it.each 增补空串/NaN 用例（如 `?start=`、`?start=NaN`），补齐 hourBuckets/rollup 的 end 位；若负数输入不测属有意取舍，在 spec 测试策略注明理由（见结论「未进表的提示」关于负数的说明）。

### t353_test_f002 - /v1/sessions 合法值回归缺测（spec 风险「limit=0 无上限被误拒」无 happy-path 锁定）

- 严重度：minor
- 锚点：AC-001 风险维度「合法值不被误拒」（spec 风险与回退 `docs/tasks/t353_local_api_param_validation/spec.md:89`）
- 位置：`tests/integration/local-api/server.test.ts:1126-1149`、`1301-1329`、`1420-1445`
- 问题：sessions 参数解析是本次 diff 新增代码（`parse_int_param` require_present 路径，`src/main/core/local-api/server.ts:1335-1366`），但无任何合法值用例：`/v1/sessions?start_at=<有效数字>`、`limit=0`（实现 min:0 故应 200）、`limit=5`、`offset` 合法值是否 200 且值被转发均无断言。records 的合法 start/end 也无参测试（records 用例 server.test.ts:1301-1329 不带参数）。heatmap/hourBuckets/rollup 合法 start/end→200 已有覆盖（server.test.ts:1356-1361、1397-1401、1442-1444）；t206 AC3（1420-1445）测的是 `/v1/dashboard/sessions`，非 `/v1/sessions`。若 require_present/转发逻辑回归误拒合法值，现有测试无法捕获。
- 建议：补 `/v1/sessions` 合法值用例（start_at/end_at/limit=0/limit=5/offset→200 且 store 调用带对应值）；records 补 start/end 合法值用例。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无
- 改测方向复核：无（diff 仅新增测试，未改动既有断言）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - 负数输入与实现语义相抵触（spec 测试策略「负数」期望 400，但实现未对 start/end/offset 加 min，`?start=-5` 实际返回 200）。spec 风险与回退（spec.md:91「仅对明确要求正整数的参数加下限校验」）与该实现一致；spec 范围「非负校验」措辞偏宽，交 code reviewer 判断是否需对 start/end 补非负校验或修订 spec 措辞，不属测试侧缺口。
  - 重点问题核查（sessionHistory limit 校验，server.test.ts:1747-1762）：逐请求 `status===400` 与 `service.query).not.toHaveBeenCalled()` 共同锁定「不再静默忽略或传 0」。旧实现 limit=0/-1 会带 limit 调 query 返回 200、abc 会静默丢弃返回 200，均与现断言互斥，断言真实有效。
  - 异步稳定性核查：11 用例经真实 HTTP（127.0.0.1 + `api.get_port()`），每 test 由 beforeEach 建新 api（port 0 自动分配），it.each 10 分支各自 `start()` 一次，无跨用例共享状态，与本文件既有模式一致；实际运行 77 测试全绿、11 个 t353 用例通过，无 .skip/.only/静默降级。
- 总体判断：测试可信（断言触达 HTTP status+body、mock 边界正确、无危险模式），AC-001/002/003 均有可观察行为测试且全绿；两处覆盖缺口属「可再加 case」类 minor，不阻断。
- 系统性 follow-up：无

verdict: PASS
