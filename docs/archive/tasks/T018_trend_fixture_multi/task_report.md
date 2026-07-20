# Task report T018

本报告所在 commit 即 task commit，SHA 由 `git log --grep T018` 查，不在此记录。

## spec 验收标准勾选

- [x] gen_fixture 录全部 trend 组合。 - 遍历 state items，trend_seen 去重，real 101 responses 含 41 trend entries。
- [x] mock_server trend 精确匹配 query。 - `responses[GET /v1/trend?${url.searchParams.toString()}]`，实测 vite preview 命中返回长度 7。
- [x] gen_synthetic 拷贝全部 trend。 - 41 trend（key+value 均 redact）。
- [x] `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 跑通。 - 38 passed + 3 skipped。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 4 项 / 遗留 1 项
- T018_code_f001 - 采纳：mock url.search 双 ? 修 searchParams
- T018_code_f002 - 采纳：gen_synthetic trend key redact
- T018_code_f003 - 采纳：gen_fixture malformed item 校验
- T018_test_f001 - 采纳：gen_fixture 去 days 硬编码（web 不传 days）
- T018_test_f002 - 遗留：mock 单测（.mjs 无框架覆盖，实测代替）

## 遗留问题

- **mock_server 单测**（test_f002）：.mjs 在 eslint ignore，vitest 不覆盖；实测 vite preview 命中验证代替。未来 mock 复杂化时加独立脚本测。
