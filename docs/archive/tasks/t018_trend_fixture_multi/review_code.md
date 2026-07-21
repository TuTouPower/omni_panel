# Task review T018

- task：`T018_trend_fixture_multi`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-20 20:17 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T018_code_f001 — mock_server trend key 双 `?` 导致所有 trend 请求 miss

- 严重度：critical
- 位置：`tests/e2e/fixtures/mock_server.mjs:49`；spec 第 11 行原文也有同样瑕疵
- 问题：录制端 key 是 `GET /v1/trend?${qs}`，其中 `qs = params.toString()`，`URLSearchParams.toString()` 不含 `?` 前缀，故 key 形如 `GET /v1/trend?provider=anthropic&accountId=...&metricId=...&days=7`（一个 `?`）。
  mock 端拼 key 用 `${url.search}`，而 `url.search` 按 WHATWG URL 规范含前导 `?`（已 `node -e` 验证：`new URL('/v1/trend?provider=anthropic&days=7', 'http://localhost').search === '?provider=anthropic&days=7'`），故 mock 查的 key 形如 `GET /v1/trend??provider=...&days=7`（两个 `?`）。
  两 key 永不相等，`responses[...]` 必为 `undefined`，handler 落到 `?? []` 返回空数组。当前所有 trend 请求都命中空数组，"精确匹配"实际形同虚设。
  owner 报告"`MOCK_FIXTURE=synthetic pnpm test:e2e:web` 38 passed + 3 skipped"能过，仅说明现有 web spec 不断言 trend 返回内容，不能证明匹配生效。
- 建议：二选一。
    - A（最小改动）：`tests/e2e/fixtures/mock_server.mjs:49` 改为 `responses[\`GET /v1/trend?${url.search.slice(1)}\`]`，与录制 key 一致。
    - B（更稳健）：录制与 mock 统一改用 `url.pathname + url.search`（含 `?`），或统一用 `URLSearchParams` 规范化后再拼 key，避免编码/顺序差异。
      附带：spec.md 第 11 行的 key 写法同样有歧义，建议在 spec 或 task_report 中标注"原文 key 表达不精确，以实际 `params.toString()` 为准"。

### T018_code_f002 — gen_synthetic 的 trend key 未过 redact，潜在邮箱泄露

- 严重度：low
- 位置：`scripts/e2e/gen_synthetic.mjs:58-60`
- 问题：循环拷贝 real trend 条目时，`out[k] = redact(v, "trend", 0)` 仅对 value 做 redact，key 原样保留。key 形如 `GET /v1/trend?provider=...&accountId=<ID>&metricId=...&days=7`。当前 state items 的 `accountId` 若为非邮箱形态（UUID / 短 ID）则安全；若某 connector 用邮箱作 accountId，则 synthetic.json 的 **key** 会含真实邮箱，value 端 redact 无法覆盖。
  gen_synthetic 末尾的兜底校验（line 67-72）对 `JSON.stringify(out)` 整体扫描非 example.com 邮箱，能 warn 出这种情况；owner 报告"脱敏校验通过"说明当前 real 数据无此风险。但这是"被兜底校验兜住"而非"结构上杜绝"。
- 建议：key 也要 redact。最小改法：`const k2 = k.replace(EMAIL_RE, () => demo_email("trend", 0)); out[k2] = redact(v, "trend", 0);`。非阻塞，按 spec 第 11 行"无账号邮箱"的前提可暂缓，但建议在 task_report 或 blueprint 记一句防御缺口。

### T018_code_f003 — gen_fixture trend 录制依赖 state item 字段结构

- 严重度：low
- 位置：`scripts/e2e/gen_fixture.mjs:88-105`
- 问题：实现假设 `state.items` 每个元素含 `provider` / `accountId` / `id`（`id` 用 `:` 分隔，末段为 metricId）。spec 第 9 行说"遍历全部 snapshot items（provider×account×metric 组合）"，但未写明 item schema。若未来某 connector 的 state item 结构改变（例如 metricId 存在独立字段，或 id 用其他分隔符），录制会静默产出错误 key（`metricId=undefined` 或整条 trend miss），且无 warn。
  当前 owner 报告 41 entries 与 real 一致，说明现有数据结构匹配；属结构性脆弱，非 bug。
- 建议：gen_fixture trend 录制分支加一行最小校验：`if (!it.provider || !it.accountId || !it.id) { console.warn('[gen_fixture] skip malformed state item:', it.id); continue; }`。或在 spec/task_report 里写明依赖的 item schema 作为契约。

## 结论

3 个 finding（1 critical / 2 low）。

critical（f001）是实质性 bug：录制端 key 与 mock 端 key 因 `url.search` 含 `?` 前缀而格式不一致，trend 精确匹配整体失效，所有 trend 请求静默返回 `[]`。spec 验收标准"[ ] mock_server trend 精确匹配 query（不 fallback 首条）"在字面上达到（确实没 fallback 首条），但语义上未达到（没命中任何录制数据）。必须在 adoption 阶段修复并回归。

其余 2 个 low 为防御性 / 结构性建议，不阻塞合入。

实现与 spec 范围一致，未越界改 web spec 或 T010 其他；trend 全录、synthetic 全拷贝、redact 兜底等主体行为符合 spec 第 9-11 行；`days=7`、`trend_seen` 去重、`Object.entries` 过滤 `startsWith("GET /v1/trend?")` 等实现细节正确。
