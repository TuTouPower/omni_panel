# Task review T021

- task：`T021_mock_server_unit_test`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree），仅新增 `tests/unit/e2e/mock_server.test.ts`
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 00:25 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T021_code_f001 — fake_responses 中 `"GET /v1/config"` 键无对应测试用例

- 严重度：suggestion
- 位置：`tests/unit/e2e/mock_server.test.ts:18`
- 问题：`fake_responses()` 返回值含 `"GET /v1/config": { config: {}, hasSecrets: false }`，但 10 个 `it` 用例均未发起 `GET /v1/config` 请求，该键在测试运行中从未被 `exact` 匹配命中。spec 验收清单也未要求 config 用例。属测试数据冗余，不影响正确性，但让测试数据集与实际用例不一一对应，阅读时易误以为存在遗漏用例。
- 建议：删除 `"GET /v1/config"` 一行，使 fake_responses 每个键均可追溯到某个 `it` 断言；若日后加 config 回归用例再补回。

## 结论

总体实现与 spec 一致，守住非范围（未改 mock_server.mjs / vite_mock_plugin）。核心回归点全覆盖：trend 精确 query（双 `?` 退化时 length=2 断言会失败）、state/secrets 精确 id（A/B 双查防 fallback-first）、POST 占位、404。stub_res 对 `statusCode` setter/setHeader/end 的捕获与 mock_server.mjs 的 `res.statusCode=`/`setHeader`/`end` 调用模式精确对应，能真实驱动 handler。call() helper 的 `req` stub 仅填 method+url，契合 handler 实际依赖。`@ts-expect-error` 抑制 .mjs 无类型合理。唯一建议为删除 fake_responses 中未使用的 `"GET /v1/config"` 键，严重度 suggestion，不阻塞合入。
