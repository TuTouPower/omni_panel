# Task review T018

- task：`T018_trend_fixture_multi`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree, branch `task_t016_migrate_seed_fake_specs`，与 tasks_index 登记 `task_t018_trend_fixture_multi` 不一致）
- reviewer_focus：测试
- reviewed_at：2026-07-21 01:25 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T018_test_f001 — mock 精确匹配在 web 实际调用路径下永远不命中（`days` 参数差异），预防性基建失效

- 严重度：high
- 位置：`tests/e2e/fixtures/mock_server.mjs:49` × `scripts/e2e/gen_fixture.mjs:94-103` × `src/web/usageboard-web.ts:140-150` × `src/renderer/components/ProviderAccountRow.tsx:75`
- 问题：
    - 录制端 `gen_fixture.mjs` 构造 query 时硬编码 `days: "7"`：`new URLSearchParams({ provider, accountId, metricId, days: "7" })`。synthetic.json 中全部 41 条 key 形如 `GET /v1/trend?provider=antigravity&accountId=...&metricId=...&days=7`。
    - web 实际请求端 `usageboard-web.ts`：`days` 为可选参数，未传时不写入 URLSearchParams。唯一调用点 `ProviderAccountRow.tsx:75` 是 `trend_api.get(period.provider, period.accountId, period.id)`，三参数未传 `days`。实际请求 query 形如 `provider=...&accountId=...&metricId=...`（无 `&days=7`）。
    - 新 mock `responses[GET /v1/trend?${url.search}] ?? []` 精确匹配 query string。两者 query 不一致（缺 `days`），匹配失败，fallback `[]`。
    - 即：本 task 改完之后，web SPA 任何 trend 请求在 mock 环境下都拿到空数组。
    - 当前 web e2e 38 passed 不能反证 trend 匹配成功：现有 spec 无一直接断言 trend 数据（`.bar-row` 是 `UsageRows.tsx` 的用量条，非 sparkline），空 trend 不影响现有断言。因此问题不会以测试失败形式暴露。
    - 与本 task 设计意图（spec 背景："未来 trend 相关 spec 若发不同组合，mock 会掩盖参数构造回归"）冲突：当前实现下未来 sparkline 迁 web 时，所有 trend 请求都返回 `[]`，新 spec 若只断"sparkline DOM 渲染"而不断数据点，会 silently pass；若断数据点则会整批失败且难定位（看起来像 renderer bug）。
- 可复现：
    1. 启 mock：`MOCK_FIXTURE=synthetic node tests/e2e/fixtures/mock_server.mjs`（监听 17864）。
    2. `curl 'http://localhost:17864/v1/trend?provider=antigravity&accountId=abbb04ff42bfe9e0&metricId=gemini-models'` → 返回 `[]`（web 实际请求路径，未命中）。
    3. `curl 'http://localhost:17864/v1/trend?provider=antigravity&accountId=abbb04ff42bfe9e0&metricId=gemini-models&days=7'` → 返回真实点位（录制 key）。
- 建议：两选一（等价修复 query 对齐）：
    1. gen_fixture.mjs 去掉硬编码 `days: "7"`，与 web 实际调用端对齐（real server `server.ts:322-325` 对未传 days 默认 7，录制时不加 days 仍能拿到等价 7 天数据）。
    2. 或 `usageboard-web.ts` trend.get 在未传 days 时显式写入 `days=7`，与录制端对齐。
    - 二选一即可，不混用。推荐方案 1（改 gen_fixture）：一次性脚本，改动局部；避免 web 端语义变化波及打包/electron。
    - 修复后需重录 real responses.json + 重跑 gen_synthetic 刷新 synthetic.json 的 41 条 trend key。

### T018_test_f002 — 无单测保护 mock_server trend 精确匹配，未来易被无声回退

- 严重度：medium
- 位置：`tests/e2e/fixtures/mock_server.mjs:48-50`；缺失：`tests/unit/` 或 `tests/integration/` 下 mock_server trend 单测
- 问题：
    - `create_mock_handler(responses)` 是纯函数（req/res 可桩），可单测。当前无任何单测验证 trend 精确匹配：无测试断言"不同 provider/accountId/metricId query 返回各自快照"或"前缀匹配已废弃"。
    - 现有 web e2e 因无 trend 断言，对 mock_server 回退到前缀匹配不敏感。若未来误改回 `find_by("GET /v1/trend?")`（T010 test_f002 原状），全部 spec 仍 pass，基建价值无声丢失。
    - 本 task spec 背景明确是"T010 test_f002 遗留预防性基建"，预防性基建本身应有最低单测自保护。
- 建议：加 1 条纯函数单测（放 `tests/unit/e2e/mock_server.test.ts` 或 `tests/integration/e2e/mock_server.test.ts`，按项目分层习惯择一）：
    - 构造 `responses = { "GET /v1/trend?provider=A&accountId=X&metricId=M&days=7": [p1], "GET /v1/trend?provider=B&accountId=Y&metricId=N&days=7": [p2] }`。
    - 断言两次不同 query 各自返回 `p1` / `p2`（不互相污染）。
    - 断言未命中 query 返回 `[]`。
    - 该单测同时保护 f001 修复后的 query 形态（若未来再次在录制端硬编码参数，单测能捕获）。
    - 范围可控：不引入新 spec 层级，不触发真实 HTTP。

## 验收标准核对

| 验收标准                                             | 验证                                                                                                                                                                                                              | 结果                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| gen_fixture 录全部 trend 组合（非首条）              | `scripts/e2e/gen_fixture.mjs:87-105` 遍历 `instances × state.items`，`trend_seen` Set 去重 qs；synthetic.json 41 条 trend 覆盖 9 provider，41 组合 p/a/m 全唯一（脚本核验 `dupe queries: 0`，`unique p/a/m: 41`） | 达成                                                          |
| mock_server trend 精确匹配 query（不 fallback 首条） | `tests/e2e/fixtures/mock_server.mjs:48-49` 改为 `responses[GET /v1/trend?${url.search}] ?? []`，不再走 `find_by` 前缀匹配                                                                                         | 形式达成，但见 f001：与 web 实际请求 query 不一致导致永不命中 |
| gen_synthetic 拷贝全部 trend                         | `scripts/e2e/gen_synthetic.mjs:57-60` 遍历 `resp` 中所有 `GET /v1/trend?` 前缀 key，逐条 `redact` 拷贝；synthetic.json 实测 41 条                                                                                 | 达成                                                          |
| `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 跑通      | 本地实跑：41 tests，38 passed + 3 skipped（22.8s）                                                                                                                                                                | 达成（注：3 skip 与 trend 无关，见下）                        |
| `pnpm typecheck` 过                                  | 本地实跑 `tsc --noEmit` 退出 0                                                                                                                                                                                    | 达成                                                          |

## 现有 web spec 影响（trend 全录 + 精确匹配不破 41 passed）

- 现有 web spec 14 个文件，仅 `popup_card_collapse_height.spec.ts` 间接关联 trend（等 `.bar-row.first()` 可见）；`.bar-row` 来自 `UsageRows.tsx:89` 的用量条，**非 sparkline**，不依赖 trend 数据。
- 其余 spec 不触达 trend 路径。
- 改前（前缀匹配返回首条） vs 改后（精确匹配或 `[]`）：对现有断言无差，均能 pass。
- real fixture 41 passed（上下文报告）不破，一致。

## 3 skipped 与 trend 无关（T016 遗留确认）

- `multi_account.spec.ts:39` — `test.skip(true, "fixture 无 KIMI connector（synthetic 无），跳过 dedup 强校验")`。KIMI connector 在 synthetic 不存在，与 trend 无关。
- `opencode_go_usage.spec.ts:22` — `test.skip(true, "synthetic fixture 不含 opencode_go provider，跳过")`。synthetic subset（3 instance）不含 opencode_go connector，与 trend 无关。
- `popup_card_states.spec.ts:31` — `test.skip(true, "mock fixture 无 enabled+failed connector（synthetic 无），跳过")`。synthetic 无 failed connector 状态，与 trend 无关。

## 预防性价值评估

- 若 f001 修复（录制端与请求端 query 对齐）：预防性价值成立——不同 provider/account/metric 返回各自真实点位，sparkline 迁 web 时能捕获参数构造回归（如 renderer 错把 accountId 当 metricId 传，会得到 `[]` 而 spec 可断"数据点数 > 0"）。
- 若 f001 未修复：预防性价值失效——所有 trend 请求都返回 `[]`，未来 sparkline spec 只能验证空态，捕获不到任何参数构造回归；且会掩盖真实 renderer bug（渲染不出数据会被误认为 mock 没数据）。
- f002 单测保护：能锁住 mock_server 不被回退，且顺带保护 f001 修复后的 query 形态。

## CI 影响

- `synthetic.json` 已入库 41 条 trend（`tests/e2e/fixtures/synthetic.json:1101-1468`）。
- CI `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 本地复跑一致（38 passed + 3 skipped），trend 精确匹配实现与 fixture 同步入库，CI 环境无差异。
- 但因 f001，CI 跑的 trend 请求实际全部 fallback `[]`。不会导致 CI fail（无 spec 断 trend 数据），但会让 CI 上的"smoke 通过"含隐性误导：任何 renderer 对 trend 数据处理的回归在 CI 上都看不出。
- 体积：synthetic.json trend 部分约 360 行，单次增加可接受，后续重录会随 real instance 数浮动。

## 结论

2 finding（f001 high / f002 medium）。

验收 5 条形式达成，但 f001 暴露 mock 精确匹配与 web 实际请求路径脱节（录制端硬编码 `days=7`，web 调用不传 days），当前所有 trend 请求实际 fallback `[]`，预防性基建设计意图落空；现有 web spec 因不直接断 trend 无法发现，需修复 + 建议加单测保护。建议 owner adoption 立即处置 f001（改 gen_fixture 去掉 days 硬编码 + 重录刷新 synthetic），并评估 f002 是否本 task 内补单测或转 backlog。
