# Task spec

## 背景

T010 test_f002 遗留：gen_fixture 只录首个 trend（first_item），mock_server 用前缀匹配（`find_by("GET /v1/trend?")`），任意 trend 请求返回同一快照。未来 trend 相关 spec（如 T006 sparkline 展开）若发不同 provider/account/metric 组合，mock 会掩盖参数构造回归。

## 范围

- `scripts/e2e/gen_fixture.mjs`：trend 录制从 first_item 改为遍历全部 snapshot items（provider×account×metric 组合）。
- `tests/e2e/fixtures/mock_server.mjs`：trend handler 改精确匹配 query（`responses[GET /v1/trend?${url.search}]`），不前缀首条。
- `scripts/e2e/gen_synthetic.mjs`：trend 从首条改为拷贝 real responses 全部 trend 条目（trend 是百分比点位，无账号邮箱）。

## 非范围

- 不改 web spec（无直接 trend spec；预防性基建）
- 不改 T010 其他

## 验收标准

- [ ] gen_fixture 录全部 trend 组合（非首条）
- [ ] mock_server trend 精确匹配 query（不 fallback 首条）
- [ ] gen_synthetic 拷贝全部 trend
- [ ] `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 跑通（trend 精确匹配不破现有 spec）
- [ ] `pnpm typecheck` 过

## 依赖与约束

- gen_fixture 需 app 跑（17863）
