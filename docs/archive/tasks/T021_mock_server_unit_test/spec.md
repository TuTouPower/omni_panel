# Task spec

## 背景

T018 critical（mock `url.search` 双 `?` 致 trend 全 miss）由 review 才抓到。`create_mock_handler` 已导出（T010），但 vitest 不覆盖（mock_server.mjs 在 eslint ignore，无测试）。加单测自保护，未来 mock 回归（key 格式/精确匹配/POST 占位/fallback）能立即抓。

## 范围

- 新 `tests/unit/e2e/mock_server.test.ts`（或 .mjs）：vitest import `create_mock_handler`，喂 fake responses，断言 handler 返回 status/body：
    - `GET /v1/health` → 200 `{ok:true}`
    - `GET /v1/connectors` → 精确 key 返回 array
    - `GET /v1/connectors/:id/state` → 精确 id 查（非 fallback 首条）
    - `GET /v1/secrets?instanceId=X` → 精确 instanceId 查
    - `GET /v1/trend?provider=X&accountId=Y&metricId=Z` → 精确 query（searchParams，无双 `?`）
    - `POST /v1/...` → `{ok:true,data:{}}`
    - 未匹配 → 404

## 非范围

- 不改 mock_server.mjs 逻辑（只测）
- 不改 vite_mock_plugin

## 验收标准

- [ ] 新单测覆盖上述 case
- [ ] `pnpm test`（vitest）含新测全绿
- [ ] mock key 格式回归（双 `?` / days 硬编码）能被单测抓

## 依赖与约束

- vitest 需能 import `tests/e2e/fixtures/mock_server.mjs`（.mjs ESM）
