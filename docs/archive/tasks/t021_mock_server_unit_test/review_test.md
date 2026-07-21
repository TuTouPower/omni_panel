# Task review T021

- task：`T021_mock_server_unit_test`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-20 23:05 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` -> `review_code.md` / 前缀 `code`；`测试` -> `review_test.md` / 前缀 `test`。

## Findings

无。

## 验收核对

### spec 验收 3 条

1. **新单测覆盖上述 case** — 通过。`tests/unit/e2e/mock_server.test.ts` 10 用例覆盖 spec 列举的全部 case：health / connectors / state 精确 / state unknown fallback / secrets 精确 instanceId / trend 精确 query / trend unknown 返 `[]` / POST 占位 / 未匹配 404。
2. **`pnpm test`（vitest）含新测全绿** — 通过。任务上下文记录 vitest 1416（1407+9）全绿、typecheck 过。
3. **mock key 格式回归（双 `?` / days 硬编码）能被单测抓** — 通过。见下方"T018 critical 反证"。

### 关键回归点覆盖

- **trend 精确 query（T018 `url.search` 双 `?` 回归）** — 覆盖。`mock_server.test.ts:89-94` 断言 `parsed.length === 2`。
- **trend unknown 返 `[]`（防前缀 fallback）** — 覆盖。`mock_server.test.ts:96-99` 断言 `toEqual([])`。
- **state 精确 id（T015）** — 覆盖。`mock_server.test.ts:70-75` 分别断言 A/B 返各自 `instanceId` 与 `status`。
- **state unknown fallback empty_ipc（防跨 id 泄漏）** — 覆盖。`mock_server.test.ts:77-80` 断言 UNKNOWN 返 `{ok:true, data:{}}`，而非 A/B 任一条。
- **secrets 精确 instanceId** — 覆盖。`mock_server.test.ts:82-87` 断言 A 返 `cpa_mgmt_key`、B 返 `api_key`。
- **POST ok / DELETE 404** — 覆盖。`mock_server.test.ts:101-104` 断言 POST 返 `empty_ipc`；`106-109` 断言 DELETE 未匹配返 404。

### T018 critical 反证

若 `mock_server.mjs:49` 从 `url.searchParams.toString()` 退回 `url.search`（含前导 `?`）：

- 构造 key = `` `GET /v1/trend??provider=claude&accountId=acc1&metricId=primary` ``（双 `?`）。
- `fake_responses` 无此 key → `responses[key] ?? []` 返 `[]`。
- 单测 `expect(parsed.length).toBe(2)` → `0 !== 2` → 红。

结论：T018 critical 可被单测立即抓到。

### 断言期望行为（非内部实现细节）

通过。所有断言测 API 契约（`status` / `body`），未导入 `empty_ipc` 内部函数，未断言 `find_by` / `json` 等私有辅助。`empty_ipc` 的返回值 `{ok:true, data:{}}` 作为公开契约断言，非实现细节。

### flaky 风险

低。`stub_res` 同步捕获 `statusCode` / `headers` / `end`，`create_mock_handler` 全同步路径（仅 `new URL` 与 regex），无 timer / 网络 / IO。无并发依赖。

## 结论

无 finding。10 用例完整覆盖 spec 验收 3 条与 6 个关键回归点；T018 critical 反证可抓；断言 API 契约非内部实现；无 flaky 风险。单测达成"mock 自保护"目标。
