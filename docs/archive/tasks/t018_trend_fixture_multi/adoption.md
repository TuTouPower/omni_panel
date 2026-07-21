# Adoption T018

逐条处置 review_code + review_test finding。

| finding_id     | decision | rationale                                                                                  | status |
| -------------- | -------- | ------------------------------------------------------------------------------------------ | ------ |
| T018_code_f001 | 采纳     | mock `url.search` 双 ? 致 trend 全 miss；改 `url.searchParams.toString()`                  | 已修   |
| T018_code_f002 | 采纳     | gen_synthetic trend key 未 redact（防 accountId 含邮箱）；key 也过 EMAIL_RE                | 已修   |
| T018_code_f003 | 采纳     | gen_fixture trend 依赖 item schema 无校验；加 malformed item skip + warn                   | 已修   |
| T018_test_f001 | 采纳     | gen_fixture 硬编码 days=7，web 调用不传 days 致 key 不匹配；去 days                        | 已修   |
| T018_test_f002 | 遗留     | mock_server trend 精确匹配单测（mock .mjs 无测试框架覆盖）；实测 vite preview 命中验证代替 | 遗留   |

## 处置说明

- **code_f001（critical，已修）**：mock_server trend key 从 `url.search`（含前导 ?）改 `url.searchParams.toString()`（不含 ?），与录制 `params.toString()` 一致。实测 vite preview mock `/v1/trend?...` 返回长度 7 数组（首项 null，真实数据结构），精确命中。
- **test_f001（high，已修）**：gen_fixture trend params 删 `days: "7"`。web 唯一调用点 `ProviderAccountRow.tsx:75` 不传 days，`usageboard-web.ts` trend.get 默认只发 provider/accountId/metricId。录制 key 现无 days，与 web 请求一致。重录 real 101 responses + synthetic 50，trend key 样例 `GET /v1/trend?provider=antigravity&accountId=...&metricId=gemini-models`（无 days）。
- **code_f002（已修）**：gen_synthetic trend 拷贝 key 也过 EMAIL_RE redact（`k.replace(EMAIL_RE, demo_email)`），防 accountId 含邮箱泄漏到 key。
- **code_f003（已修）**：gen_fixture trend 循环加 malformed item 校验（`!it.provider || !it.accountId || !it.id` → skip + warn）。
- **test_f002（遗留）**：mock_server.mjs 在 eslint ignore（.mjs 构建脚本），单测框架不覆盖；改用实测（vite preview 启动 + fetch /v1/trend 验证返回长度 7）代替单测。若未来 mock 逻辑复杂化，加独立 node 脚本测。
